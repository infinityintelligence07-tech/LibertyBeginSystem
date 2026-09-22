import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface MemberInput {
  full_name: string;
  email: string;
  [key: string]: unknown;
}

interface UpsertResult {
  email: string;
  full_name: string;
  status: "created" | "updated" | "error";
  password?: string;
  message?: string;
}

const PROFILE_FIELDS = [
  "phone","company_name","program_start_date","program_end_date","member_tier",
  "birth_date","marital_status","city_state","instagram_personal","personal_story",
  "favorite_chocolate","dietary_restriction","company_segment","company_address",
  "business_description","company_instagram","business_age","employees_count",
  "monthly_revenue","profit_margin","would_buy_self","financial_control","uses_dre",
  "costs_expenses","financial_challenge","challenge_2026","dream_2026",
  "program_expectation","main_pain","vision_6_months","sector_to_develop",
];

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pwd = "";
  for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd + "@1";
}

const DATE_FIELDS = new Set(["program_start_date", "program_end_date", "birth_date"]);

function sanitizeDate(s: string): string | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function buildUpdate(m: MemberInput): Record<string, unknown> {
  const upd: Record<string, unknown> = {};
  if (m.full_name) upd.full_name = String(m.full_name).trim();
  for (const f of PROFILE_FIELDS) {
    const v = m[f];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (!s) continue;
    if (DATE_FIELDS.has(f)) {
      const safe = sanitizeDate(s);
      if (safe) upd[f] = safe;
      continue;
    }
    if (f === "member_tier") {
      upd[f] = s.toLowerCase() === "liberty" ? "liberty" : "begin";
    } else {
      upd[f] = s;
    }
  }
  return upd;
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

    const results: UpsertResult[] = [];

    for (const m of members) {
      const email = String(m.email || "").trim().toLowerCase();
      const full_name = String(m.full_name || "").trim();
      if (!email || !full_name) {
        results.push({ email, full_name, status: "error", message: "Nome e e-mail obrigatórios" });
        continue;
      }

      try {
        const { data: existing } = await adminClient
          .from("profiles").select("id, user_id").eq("email", email).maybeSingle();

        const update = buildUpdate(m);

        if (existing) {
          if (Object.keys(update).length > 0) {
            const { error: uErr } = await adminClient
              .from("profiles").update(update).eq("id", existing.id);
            if (uErr) throw uErr;
          }
          results.push({ email, full_name, status: "updated", message: "Perfil atualizado" });
        } else {
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
          const { error: profileError } = await adminClient
            .from("profiles")
            .upsert({ ...update, user_id: userId, full_name, email }, { onConflict: "user_id" });
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
        }
      } catch (err) {
        results.push({ email, full_name, status: "error", message: (err as Error).message });
      }
    }

    const summary = {
      total: results.length,
      created: results.filter(r => r.status === "created").length,
      updated: results.filter(r => r.status === "updated").length,
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
