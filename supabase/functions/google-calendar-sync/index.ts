import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveGoogleOAuthCredentials } from "../_shared/googleOAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function refreshAccessToken(refreshToken: string) {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { clientId, clientSecret } = await resolveGoogleOAuthCredentials(admin);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("refresh failed: " + JSON.stringify(data));
  return data.access_token as string;
}

async function createEvent(accessToken: string, event: any): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Calendar create failed", data);
    return null;
  }
  return data.id as string;
}

async function patchEvent(accessToken: string, eventId: string, patch: any) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) console.error("Calendar patch failed", await res.text());
}

async function deleteEvent(accessToken: string, eventId: string) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    console.error("Calendar delete failed", res.status, await res.text());
  }
}

async function syncBooking(admin: any, booking_id: string) {
  const { data: booking } = await admin.from("bookings").select("*").eq("id", booking_id).single();
  if (!booking) return { ok: false, error: "booking not found" };

  const { data: session } = await admin.from("sessions").select("name, description").eq("id", booking.session_id).single();
  const { data: mentor } = await admin.from("profiles").select("id, full_name, email").eq("id", booking.mentor_id).single();
  const { data: liberty } = booking.liberty_id
    ? await admin.from("profiles").select("id, full_name, email").eq("id", booking.liberty_id).single()
    : { data: null };

  let creator: any = null;
  if (booking.created_by) {
    const { data: creatorProf } = await admin
      .from("profiles").select("id, full_name, email").eq("user_id", booking.created_by).maybeSingle();
    creator = creatorProf;
  }

  const tokenIds = [mentor?.id, liberty?.id, creator?.id].filter(Boolean) as string[];
  const { data: tokens } = tokenIds.length
    ? await admin.from("user_oauth_tokens").select("profile_id, google_refresh_token").in("profile_id", tokenIds)
    : { data: [] as any[] };
  const tokenMap = new Map<string, string>();
  (tokens || []).forEach((t: any) => { if (t.google_refresh_token) tokenMap.set(t.profile_id, t.google_refresh_token); });

  const startISO = `${booking.scheduled_date}T${booking.start_time}-03:00`;
  const endISO = `${booking.scheduled_date}T${booking.end_time}-03:00`;
  const title = `Sessão: ${session?.name || "Mentoria"} — Liberty Begin`;
  const description = `Sessão de mentoria Liberty Begin.\n\n${session?.description || ""}\n\n${booking.zoom_join_url ? `Zoom: ${booking.zoom_join_url}` : ""}`.trim();
  const attendees = [liberty?.email && { email: liberty.email }, mentor?.email && { email: mentor.email }].filter(Boolean);

  const isCancelled = booking.status === "cancelled";
  const updates: Record<string, string | null> = {};

  const handleCalendar = async (
    profileId: string | undefined,
    existingEventId: string | undefined,
    updateField: string,
    withAttendees: boolean,
  ) => {
    if (!profileId) return;
    const refresh = tokenMap.get(profileId);
    if (!refresh) return;
    try {
      const at = await refreshAccessToken(refresh);
      if (isCancelled) {
        if (existingEventId) {
          await deleteEvent(at, existingEventId);
          updates[updateField] = null;
        }
        return;
      }
      if (existingEventId) {
        await patchEvent(at, existingEventId, {
          summary: title,
          description,
          start: { dateTime: startISO, timeZone: "America/Sao_Paulo" },
          end: { dateTime: endISO, timeZone: "America/Sao_Paulo" },
          ...(withAttendees ? { attendees } : {}),
        });
      } else {
        const id = await createEvent(at, {
          summary: title,
          description,
          start: { dateTime: startISO, timeZone: "America/Sao_Paulo" },
          end: { dateTime: endISO, timeZone: "America/Sao_Paulo" },
          ...(withAttendees ? { attendees } : {}),
        });
        if (id) updates[updateField] = id;
      }
    } catch (e) {
      console.error(`${updateField} sync error`, e);
    }
  };

  await handleCalendar(mentor?.id, booking.google_event_id_mentor, "google_event_id_mentor", true);
  await handleCalendar(liberty?.id, booking.google_event_id_liberty, "google_event_id_liberty", false);

  const creatorIsMentor = creator && mentor && creator.id === mentor.id;
  const creatorIsLiberty = creator && liberty && creator.id === liberty.id;
  if (creator && !creatorIsMentor && !creatorIsLiberty) {
    await handleCalendar(creator.id, booking.google_event_id_institutional, "google_event_id_institutional", true);
  }

  if (Object.keys(updates).length) {
    await admin.from("bookings").update(updates).eq("id", booking_id);
  }
  return { ok: true, updates };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    // Authenticate caller.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonClient = createClient(supabaseUrl, anonKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: uErr } = await anonClient.auth.getUser(token);
    if (uErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(supabaseUrl, srk);
    const callerUserId = userData.user.id;
    const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", callerUserId);
    const roles = new Set((roleRows || []).map((r: any) => r.role));
    const isAdmin = roles.has("admin") || roles.has("super_admin");
    const { data: callerProfile } = await admin
      .from("profiles").select("id").eq("user_id", callerUserId).maybeSingle();
    const callerProfileId = callerProfile?.id as string | undefined;

    const payload = await req.json().catch(() => ({}));

    // Backfill mode: sync all future non-cancelled bookings for a profile_id (mentor or liberty)
    if (payload.backfill_profile_id) {
      const profileId: string = payload.backfill_profile_id;
      if (!isAdmin && profileId !== callerProfileId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const today = new Date().toISOString().slice(0, 10);
      const { data: bookings } = await admin
        .from("bookings")
        .select("id")
        .or(`mentor_id.eq.${profileId},liberty_id.eq.${profileId}`)
        .neq("status", "cancelled")
        .gte("scheduled_date", today)
        .limit(200);
      const results: any[] = [];
      for (const b of bookings || []) {
        const r = await syncBooking(admin, b.id);
        results.push({ id: b.id, ...r });
      }
      return new Response(JSON.stringify({ ok: true, synced: results.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { booking_id } = payload;
    if (!booking_id) {
      return new Response(JSON.stringify({ error: "booking_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Non-admins must own the booking (mentor, liberty, or creator).
    if (!isAdmin) {
      const { data: b } = await admin
        .from("bookings").select("mentor_id, liberty_id, created_by")
        .eq("id", booking_id).maybeSingle();
      if (!b) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const owns =
        (callerProfileId && (b.mentor_id === callerProfileId || b.liberty_id === callerProfileId)) ||
        b.created_by === callerUserId;
      if (!owns) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    const result = await syncBooking(admin, booking_id);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
