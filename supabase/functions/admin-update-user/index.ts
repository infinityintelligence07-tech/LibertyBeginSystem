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
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await adminClient
      .from("user_roles").select("role").eq("user_id", caller.id)
      .in("role", ["admin", "super_admin"]).maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { profile_id, email, password, profile_updates } = body as {
      profile_id: string;
      email?: string;
      password?: string;
      profile_updates?: Record<string, unknown>;
    };

    if (!profile_id) {
      return new Response(JSON.stringify({ error: "profile_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: targetProfile, error: pErr } = await adminClient
      .from("profiles").select("id, user_id, email").eq("id", profile_id).single();
    if (pErr || !targetProfile) {
      return new Response(JSON.stringify({ error: "Perfil não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Update auth user (email/password) if requested
    if (targetProfile.user_id && (email || password)) {
      const authUpdate: Record<string, unknown> = {};
      if (email && email !== targetProfile.email) {
        authUpdate.email = String(email).trim().toLowerCase();
        authUpdate.email_confirm = true;
      }
      if (password && String(password).length >= 6) authUpdate.password = password;

      if (Object.keys(authUpdate).length > 0) {
        const { error: updErr } = await adminClient.auth.admin.updateUserById(
          targetProfile.user_id, authUpdate as any,
        );
        if (updErr) {
          return new Response(JSON.stringify({ error: "Auth: " + updErr.message }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // 2) Update profile — whitelist columns so unknown/legacy keys don't 400 the request
    const ALLOWED_COLUMNS = new Set([
      "full_name", "phone", "avatar_url", "company_name",
      "program_start_date", "program_end_date",
      "member_tier", "birth_date", "instagram_personal", "city_state",
      "marital_status", "dietary_restriction", "favorite_chocolate",
      "personal_story", "company_segment", "company_address",
      "business_description", "company_instagram", "business_age",
      "employees_count", "monthly_revenue", "profit_margin",
      "would_buy_self", "financial_control", "uses_dre",
      "costs_expenses", "financial_challenge", "challenge_2026",
      "dream_2026", "program_expectation", "sector_to_develop",
      "vision_6_months", "main_pain", "admin_note",
    ]);
    const finalUpdates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(profile_updates || {})) {
      if (ALLOWED_COLUMNS.has(k)) finalUpdates[k] = v === "" ? null : v;
    }
    if (email) finalUpdates.email = String(email).trim().toLowerCase();

    if (Object.keys(finalUpdates).length > 0) {
      const { error: profErr } = await adminClient
        .from("profiles").update(finalUpdates).eq("id", profile_id);
      if (profErr) {
        console.error("[admin-update-user] profile update failed", {
          profile_id, keys: Object.keys(finalUpdates), error: profErr,
        });
        return new Response(JSON.stringify({ error: "Profile: " + profErr.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
