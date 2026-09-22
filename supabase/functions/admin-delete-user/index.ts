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
    const { profile_id } = body as { profile_id: string };
    if (!profile_id) {
      return new Response(JSON.stringify({ error: "profile_id é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: target } = await adminClient
      .from("profiles").select("id, user_id, full_name").eq("id", profile_id).single();
    if (!target) {
      return new Response(JSON.stringify({ error: "Perfil não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Collect booking ids where this profile is mentor or liberty
    const { data: bks } = await adminClient
      .from("bookings").select("id").or(`liberty_id.eq.${profile_id},mentor_id.eq.${profile_id}`);
    const bookingIds = (bks || []).map((b: any) => b.id);

    if (bookingIds.length > 0) {
      await adminClient.from("session_tasks").delete().in("booking_id", bookingIds);
      await adminClient.from("booking_reports").delete().in("booking_id", bookingIds);
      await adminClient.from("bookings").delete().in("id", bookingIds);
    }

    await adminClient.from("nps_responses").delete().or(`liberty_id.eq.${profile_id},mentor_id.eq.${profile_id}`);
    await adminClient.from("mentor_availability").delete().eq("mentor_id", profile_id);
    await adminClient.from("mentor_sessions").delete().eq("mentor_id", profile_id);
    await adminClient.from("user_oauth_tokens").delete().eq("profile_id", profile_id);

    if (target.user_id) {
      await adminClient.from("notifications").delete().eq("user_id", target.user_id);
      await adminClient.from("push_subscriptions").delete().eq("user_id", target.user_id);
      await adminClient.from("user_roles").delete().eq("user_id", target.user_id);
    }

    await adminClient.from("profile_user_lookup").delete().eq("profile_id", profile_id);
    await adminClient.from("profiles").delete().eq("id", profile_id);

    if (target.user_id) {
      await adminClient.auth.admin.deleteUser(target.user_id);
    }

    return new Response(JSON.stringify({ success: true, deleted_bookings: bookingIds.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
