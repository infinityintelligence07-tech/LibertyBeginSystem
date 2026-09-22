import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify the caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin using their token
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .in("role", ["admin", "super_admin"])
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json();
    const { email, password: providedPassword, full_name, role, phone, company_name, program_start_date, program_end_date, session_rate, member_tier } = body;

    if (!full_name || !role) {
      return new Response(JSON.stringify({ error: "Missing required fields: full_name, role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate a strong random default password when the admin didn't supply one.
    const generateRandomPassword = () => {
      const bytes = new Uint8Array(18);
      crypto.getRandomValues(bytes);
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
      let out = "";
      for (const b of bytes) out += alphabet[b % alphabet.length];
      return out + "!" + Math.floor(Math.random() * 90 + 10);
    };
    const password =
      providedPassword && String(providedPassword).length >= 6
        ? providedPassword
        : generateRandomPassword();

    if (!["liberty", "mentor", "admin", "super_admin"].includes(role)) {
      return new Response(JSON.stringify({ error: "Role inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Two modes:
    //  - email provided  -> create auth user + profile + role (full access)
    //  - email missing   -> create profile-only record (no auth user yet).
    //                        Admin can later add email and "Gerar acesso" to invite.
    let userId: string | null = null;
    if (email && String(email).trim()) {
      const normalizedEmail = String(email).trim().toLowerCase();

      // Check if an auth user already exists for this email (idempotent behaviour)
      const { data: existingProfile } = await adminClient
        .from("profiles")
        .select("id, user_id, full_name")
        .eq("email", normalizedEmail)
        .maybeSingle();
      if (existingProfile?.user_id) {
        return new Response(
          JSON.stringify({
            error: `Já existe um membro cadastrado com este e-mail (${existingProfile.full_name}). Edite o cadastro existente ou use outro e-mail.`,
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createError) {
        const msg = createError.message || "";
        const friendly = /already been registered|already exists|duplicate/i.test(msg)
          ? "Já existe uma conta de acesso com este e-mail. Use outro e-mail ou edite o cadastro existente."
          : msg;
        return new Response(JSON.stringify({ error: friendly }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = newUser.user.id;
    }

    // Create/update the profile directly so member creation does not depend on database triggers
    const profileUpdate: Record<string, unknown> = {
      full_name: String(full_name).trim(),
    };
    if (userId) profileUpdate.user_id = userId;
    if (email && String(email).trim()) profileUpdate.email = String(email).trim().toLowerCase();
    if (phone) profileUpdate.phone = phone;
    if (company_name) profileUpdate.company_name = company_name;
    if (program_start_date) profileUpdate.program_start_date = program_start_date;
    if (program_end_date) profileUpdate.program_end_date = program_end_date;
    if (session_rate !== undefined) profileUpdate.session_rate = session_rate;
    if (member_tier && ["begin", "liberty"].includes(member_tier)) profileUpdate.member_tier = member_tier;

    let profileId: string | null = null;
    if (userId) {
      // Upsert by user_id when we have an auth account
      const { error: profileError } = await adminClient
        .from("profiles")
        .upsert(profileUpdate, { onConflict: "user_id" });
      if (profileError) {
        await adminClient.auth.admin.deleteUser(userId);
        return new Response(JSON.stringify({ error: profileError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Assign role only when there's an auth user
      const { error: roleError } = await adminClient
        .from("user_roles")
        .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
      if (roleError) {
        await adminClient.auth.admin.deleteUser(userId);
        return new Response(JSON.stringify({ error: roleError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: profileData } = await adminClient
        .from("profiles")
        .select("id")
        .eq("user_id", userId)
        .single();
      profileId = profileData?.id ?? null;
    } else {
      // Profile-only (no email yet) — create an orphan profile to be linked later
      const { data: inserted, error: profileError } = await adminClient
        .from("profiles")
        .insert(profileUpdate)
        .select("id")
        .single();
      if (profileError) {
        return new Response(JSON.stringify({ error: profileError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      profileId = inserted?.id ?? null;
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        profile_id: profileId,
        password: userId ? password : null,
        message: userId
          ? `User created with role ${role}`
          : `Profile-only created (no auth user yet)`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
