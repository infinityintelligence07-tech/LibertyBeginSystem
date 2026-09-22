import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Result {
  profile_id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  password?: string;
  status: "created" | "linked" | "reset" | "error";
  message?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !caller) return json({ error: "Invalid token" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles").select("role")
      .eq("user_id", caller.id).in("role", ["admin", "super_admin"]).maybeSingle();
    if (!roleData) return json({ error: "Not authorized" }, 403);

    const body = await req.json().catch(() => ({}));
    const profileIds: string[] = Array.isArray(body?.profile_ids) ? body.profile_ids : [];
    const emails: string[] = Array.isArray(body?.emails)
      ? body.emails.map((e: string) => String(e).trim().toLowerCase()).filter(Boolean)
      : [];
    const passwordOverride: string | null = body?.password ? String(body.password) : null;
    const resetExisting: boolean = body?.reset_existing === true;

    if (profileIds.length === 0 && emails.length === 0) {
      return json({ error: "Informe profile_ids ou emails" }, 400);
    }

    let query = adminClient
      .from("profiles")
      .select("id, user_id, full_name, email, phone, member_tier, is_active");
    query = profileIds.length > 0 ? query.in("id", profileIds) : query.in("email", emails);
    const { data: profiles, error: pErr } = await query;
    if (pErr) return json({ error: pErr.message }, 400);

    const results: Result[] = [];

    for (const p of profiles || []) {
      const email = String(p.email || "").trim().toLowerCase();
      const base: Result = {
        profile_id: p.id,
        full_name: p.full_name,
        email,
        phone: p.phone,
        status: "error",
      };

      if (!email) {
        results.push({ ...base, message: "Cadastro sem e-mail" });
        continue;
      }

      try {
        const { data: roles } = p.user_id
          ? await adminClient.from("user_roles").select("role").eq("user_id", p.user_id)
          : { data: [] as { role: string }[] };
        const isMentor = (roles || []).some((r: { role: string }) => r.role === "mentor");
        const password = passwordOverride || (isMentor ? "Mentor@2026" : "Liberty@2026");

        let userId = p.user_id as string | null;

        if (!userId) {
          // Link an existing auth user with the same e-mail if one exists
          let existingUserId: string | null = null;
          for (let page = 1; page < 20 && !existingUserId; page++) {
            const { data: list } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
            const found = list?.users?.find(
              (u: { id: string; email?: string }) => (u.email || "").toLowerCase() === email,
            );
            if (found) existingUserId = found.id;
            if (!list || (list.users?.length || 0) < 200) break;
          }

          if (existingUserId) {
            userId = existingUserId;
            const { error: updErr } = await adminClient.auth.admin.updateUserById(userId, { password });
            if (updErr) throw updErr;
            base.status = "linked";
          } else {
            const { data: created, error: cErr } = await adminClient.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
              user_metadata: { full_name: p.full_name },
            });
            if (cErr || !created?.user) throw cErr || new Error("Falha ao criar usuário");
            userId = created.user.id;
            base.status = "created";
          }

          // The signup trigger creates a fresh profile for the new auth user.
          // Remove it so the login links to the member's original profile.
          const { data: autoProfiles } = await adminClient
            .from("profiles").select("id").eq("user_id", userId).neq("id", p.id);
          for (const auto of autoProfiles || []) {
            await adminClient.from("profile_user_lookup").delete().eq("profile_id", auto.id);
            await adminClient.from("profiles").delete().eq("id", auto.id);
          }

          const { error: linkErr } = await adminClient
            .from("profiles").update({ user_id: userId }).eq("id", p.id);
          if (linkErr) throw linkErr;


          const { error: roleErr } = await adminClient
            .from("user_roles")
            .upsert({ user_id: userId, role: isMentor ? "mentor" : "liberty" }, { onConflict: "user_id,role" });
          if (roleErr) throw roleErr;
        } else {
          if (!resetExisting) {
            results.push({ ...base, status: "error", message: "Já possui acesso (use reset_existing)" });
            continue;
          }
          const { error: updErr } = await adminClient.auth.admin.updateUserById(userId, { password });
          if (updErr) throw updErr;
          base.status = "reset";
        }

        results.push({ ...base, password });
      } catch (err) {
        results.push({ ...base, message: (err as Error).message });
      }
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.status === "created").length,
      linked: results.filter((r) => r.status === "linked").length,
      reset: results.filter((r) => r.status === "reset").length,
      errors: results.filter((r) => r.status === "error").length,
    };

    return json({ success: true, summary, results });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
