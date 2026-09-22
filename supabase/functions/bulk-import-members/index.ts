import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface MemberInput {
  full_name: string;
  email: string;
  phone?: string;
  company_name?: string;
  program_start_date?: string;
  program_end_date?: string;
}

interface ImportResult {
  email: string;
  full_name: string;
  status: "created" | "skipped" | "error";
  password?: string;
  message?: string;
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pwd = "";
  for (let i = 0; i < 10; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd + "@1";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles").select("role")
      .eq("user_id", caller.id).in("role", ["admin", "super_admin"]).maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const members: MemberInput[] = Array.isArray(body?.members) ? body.members : [];
    if (members.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhum membro enviado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: ImportResult[] = [];

    for (const m of members) {
      const email = (m.email || "").trim().toLowerCase();
      const full_name = (m.full_name || "").trim();
      if (!email || !full_name) {
        results.push({ email, full_name, status: "error", message: "Nome e e-mail são obrigatórios" });
        continue;
      }

      try {
        // Check if already exists
        const { data: existing } = await adminClient
          .from("profiles").select("id").eq("email", email).maybeSingle();
        if (existing) {
          results.push({ email, full_name, status: "skipped", message: "E-mail já cadastrado" });
          continue;
        }

        const password = generatePassword();
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { full_name },
        });

        if (createError || !newUser?.user) {
          results.push({ email, full_name, status: "error", message: createError?.message || "Falha ao criar usuário" });
          continue;
        }

        const userId = newUser.user.id;

        const update: Record<string, unknown> = { user_id: userId, full_name, email };
        if (m.phone) update.phone = String(m.phone).trim();
        if (m.company_name) update.company_name = String(m.company_name).trim();
        if (m.program_start_date) update.program_start_date = m.program_start_date;
        if (m.program_end_date) update.program_end_date = m.program_end_date;
        const { error: profileError } = await adminClient
          .from("profiles")
          .upsert(update, { onConflict: "user_id" });
        if (profileError) {
          await adminClient.auth.admin.deleteUser(userId);
          results.push({ email, full_name, status: "error", message: profileError.message });
          continue;
        }

        const { error: roleError } = await adminClient
          .from("user_roles")
          .upsert({ user_id: userId, role: "liberty" }, { onConflict: "user_id,role" });
        if (roleError) {
          await adminClient.auth.admin.deleteUser(userId);
          results.push({ email, full_name, status: "error", message: roleError.message });
          continue;
        }

        results.push({ email, full_name, status: "created", password });
      } catch (err) {
        results.push({ email, full_name, status: "error", message: (err as Error).message });
      }
    }

    const summary = {
      total: results.length,
      created: results.filter(r => r.status === "created").length,
      skipped: results.filter(r => r.status === "skipped").length,
      errors: results.filter(r => r.status === "error").length,
    };

    return new Response(JSON.stringify({ success: true, summary, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
