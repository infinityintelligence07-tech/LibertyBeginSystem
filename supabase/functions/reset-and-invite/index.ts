import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles").select("role").eq("user_id", caller.id)
      .in("role", ["admin", "super_admin"]).maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { profile_id, user_id: directUserId, role: roleHint } = body || {};
    if (!profile_id && !directUserId) {
      return new Response(JSON.stringify({ error: "profile_id or user_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get profile
    let userId = directUserId as string | undefined;
    let profile: any = null;
    if (profile_id) {
      const { data: p, error: pErr } = await adminClient.from("profiles").select("*").eq("id", profile_id).maybeSingle();
      if (pErr || !p) {
        return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      profile = p;
      userId = p.user_id || undefined;
    } else {
      const { data: p } = await adminClient.from("profiles").select("*").eq("user_id", userId).maybeSingle();
      profile = p;
    }

    if (!profile?.email) {
      return new Response(JSON.stringify({ error: "Cadastro sem e-mail. Edite e adicione o e-mail antes de enviar o convite." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Determine role (for response labelling only)
    let userRoles: string[] = [];
    if (userId) {
      const { data: roles } = await adminClient.from("user_roles").select("role").eq("user_id", userId);
      userRoles = (roles || []).map((r: any) => r.role);
    }
    const isMentor = userRoles.includes("mentor") || roleHint === "mentor";
    // Unique random temporary password per invite/reset.
    const genPwd = () => {
      const bytes = new Uint8Array(18);
      crypto.getRandomValues(bytes);
      const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
      let out = "";
      for (const b of bytes) out += abc[b % abc.length];
      return out + "!" + Math.floor(Math.random() * 90 + 10);
    };
    const defaultPassword = genPwd();

    // If profile has no auth user yet, create one (or link existing auth user with the same email)
    if (!userId) {
      let existingUserId: string | null = null;
      try {
        for (let page = 1; page < 20 && !existingUserId; page++) {
          const { data: list } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
          const found = list?.users?.find((u: any) => (u.email || "").toLowerCase() === String(profile.email).toLowerCase());
          if (found) existingUserId = found.id;
          if (!list || (list.users?.length || 0) < 200) break;
        }
      } catch (_) {}

      if (existingUserId) {
        userId = existingUserId;
      } else {
        const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
          email: profile.email,
          password: defaultPassword,
          email_confirm: true,
          user_metadata: { full_name: profile.full_name },
        });
        if (createErr || !created?.user) {
          return new Response(JSON.stringify({ error: createErr?.message || "Falha ao criar usuário" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        userId = created.user.id;
      }

      // Link profile.user_id and ensure role
      await adminClient.from("profiles").update({ user_id: userId }).eq("id", profile.id);
      const roleToAssign = isMentor ? "mentor" : "liberty";
      await adminClient.from("user_roles").upsert(
        { user_id: userId!, role: roleToAssign },
        { onConflict: "user_id,role" }
      );
    }

    // Reset password (do NOT include email_confirm here — GoTrue returns 422 when no email change)
    const { error: updErr } = await adminClient.auth.admin.updateUserById(userId!, {
      password: defaultPassword,
    });
    if (updErr) {
      console.error("[reset-and-invite] updateUserById failed", { userId, error: updErr });
      return new Response(JSON.stringify({ error: updErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(
      JSON.stringify({
        success: true,
        email: profile?.email,
        full_name: profile?.full_name,
        phone: profile?.phone,
        password: defaultPassword,
        role: isMentor ? "mentor" : "liberty",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
