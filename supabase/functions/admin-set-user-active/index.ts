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
    const { profile_id, active } = body as { profile_id: string; active: boolean };

    if (!profile_id || typeof active !== "boolean") {
      return new Response(JSON.stringify({ error: "profile_id e active são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: target, error: pErr } = await adminClient
      .from("profiles").select("id, user_id, full_name").eq("id", profile_id).single();
    if (pErr || !target) {
      return new Response(JSON.stringify({ error: "Perfil não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update active flag
    const { error: upErr } = await adminClient
      .from("profiles").update({ is_active: active }).eq("id", profile_id);
    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let cancelledBookings = 0;
    if (!active) {
      // Cancel future scheduled / pending bookings for this user (mentor OR liberty)
      const today = new Date().toISOString().slice(0, 10);
      const reason = "Cancelada automaticamente: usuário inativado pela administração";

      const { data: futureAsMentor } = await adminClient
        .from("bookings")
        .select("id")
        .eq("mentor_id", profile_id)
        .gte("scheduled_date", today)
        .in("status", ["scheduled", "pending_approval"]);

      const { data: futureAsLiberty } = await adminClient
        .from("bookings")
        .select("id")
        .eq("liberty_id", profile_id)
        .gte("scheduled_date", today)
        .in("status", ["scheduled", "pending_approval"]);

      const ids = [
        ...(futureAsMentor || []).map((b: any) => b.id),
        ...(futureAsLiberty || []).map((b: any) => b.id),
      ];

      if (ids.length > 0) {
        const { error: cErr } = await adminClient
          .from("bookings")
          .update({ status: "cancelled", cancellation_reason: reason })
          .in("id", ids);
        if (!cErr) cancelledBookings = ids.length;
      }
    }

    return new Response(JSON.stringify({ success: true, cancelledBookings }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
