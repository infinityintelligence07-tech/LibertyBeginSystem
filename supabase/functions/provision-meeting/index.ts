/**
 * Cria sala Google Meet exclusiva por booking + textos WhatsApp.
 * Usa Calendar conferenceData (link único por evento) na conta host.
 * Cada booking = um meet.google.com distinto (sem interferência).
 */
import { handleOptions, json, errorJson } from "../_shared/cors.ts";
import { requireRole, toResponse, STAFF_ROLES, type AppRole } from "../_shared/auth.ts";
import { resolveGoogleOAuthCredentials } from "../_shared/googleOAuth.ts";

const PROVISION_ROLES: AppRole[] = [...STAFF_ROLES, "liberty"];

type HostRow = {
  id: string;
  email: string;
  label: string;
  profile_id: string | null;
};

async function refreshAccessToken(refreshToken: string, admin: Parameters<typeof resolveGoogleOAuthCredentials>[0]): Promise<string> {
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
  if (!res.ok) throw new Error("Falha ao renovar token Google: " + JSON.stringify(data));
  return data.access_token as string;
}

function formatBrDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

function formatBrTime(time: string): string {
  return time.slice(0, 5);
}

function buildWaTexts(opts: {
  memberName: string;
  mentorName: string;
  sessionName: string;
  date: string;
  start: string;
  end: string;
  meetUrl: string;
}): { member: string; mentor: string } {
  const when = `${formatBrDate(opts.date)} · ${formatBrTime(opts.start)}–${formatBrTime(opts.end)}`;
  const member = [
    `Oi, ${opts.memberName.split(" ")[0] || "tudo bem"}!`,
    ``,
    `Sua sessão *${opts.sessionName}* com ${opts.mentorName} está confirmada.`,
    `📅 ${when}`,
    ``,
    `Link do Google Meet (navegador):`,
    opts.meetUrl,
    ``,
    `Qualquer imprevisto, avise a equipe Liberty.`,
  ].join("\n");

  const mentor = [
    `Oi, ${opts.mentorName.split(" ")[0] || "mentor"}!`,
    ``,
    `Sessão *${opts.sessionName}* com ${opts.memberName}.`,
    `📅 ${when}`,
    ``,
    `Entre pelo Google Meet no navegador (não precisa de conta Zoom):`,
    opts.meetUrl,
    ``,
    `Ative/confirme as notas com Gemini se o Meet pedir.`,
  ].join("\n");

  return { member, mentor };
}

async function createMeetViaCalendar(
  accessToken: string,
  opts: {
    title: string;
    description: string;
    startISO: string;
    endISO: string;
    attendeeEmails: string[];
    existingEventId?: string | null;
  },
): Promise<{ eventId: string; meetUrl: string }> {
  const requestId = crypto.randomUUID();
  const body = {
    summary: opts.title,
    description: opts.description,
    start: { dateTime: opts.startISO, timeZone: "America/Sao_Paulo" },
    end: { dateTime: opts.endISO, timeZone: "America/Sao_Paulo" },
    attendees: opts.attendeeEmails.map((email) => ({ email })),
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };

  const url = opts.existingEventId
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(opts.existingEventId)}?conferenceDataVersion=1&sendUpdates=all`
    : `https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`;

  const res = await fetch(url, {
    method: opts.existingEventId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error("Calendar/Meet falhou: " + JSON.stringify(data));
  }

  const meetUrl =
    data.hangoutLink ||
    data.conferenceData?.entryPoints?.find((e: { entryPointType?: string }) => e.entryPointType === "video")
      ?.uri ||
    null;

  if (!meetUrl || typeof meetUrl !== "string") {
    throw new Error("Evento criado sem link Meet. Verifique se a conta host tem Google Meet habilitado.");
  }

  return { eventId: data.id as string, meetUrl };
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const ctx = await requireRole(req, PROVISION_ROLES);
    const admin = ctx.supabaseAdmin;

    const payload = await req.json().catch(() => ({}));
    const bookingId = payload.booking_id as string | undefined;
    if (!bookingId) return errorJson("booking_id obrigatório", 400);

    const { data: booking, error: bErr } = await admin
      .from("bookings")
      .select(
        "id, status, scheduled_date, start_time, end_time, mentor_id, liberty_id, guest_name, session_id, zoom_join_url, meeting_calendar_event_id, is_retroactive, created_by",
      )
      .eq("id", bookingId)
      .single();

    if (bErr || !booking) return errorJson("Agendamento não encontrado", 404);

    // Membro só pode provisionar a própria sessão; staff pode qualquer uma.
    const isStaff = ctx.roles.some((r) => STAFF_ROLES.includes(r));
    if (!isStaff) {
      const { data: myProfile } = await admin
        .from("profiles")
        .select("id")
        .eq("user_id", ctx.user?.id || "")
        .maybeSingle();
      const owns =
        (myProfile?.id && booking.liberty_id === myProfile.id) ||
        booking.created_by === ctx.user?.id;
      if (!owns) return errorJson("Forbidden", 403);
    }

    if (booking.is_retroactive) {
      return json({ ok: true, skipped: true, reason: "retroactive" });
    }

    if (booking.status !== "scheduled") {
      return json({
        ok: false,
        skipped: true,
        reason: "status_not_scheduled",
        message: "Sala Meet só é criada quando a sessão está confirmada (scheduled).",
      });
    }

    if (booking.zoom_join_url?.includes("meet.google.com") && !payload.force) {
      const { data: session } = await admin.from("sessions").select("name").eq("id", booking.session_id).maybeSingle();
      const { data: mentor } = await admin.from("profiles").select("full_name, phone, email").eq("id", booking.mentor_id).maybeSingle();
      const { data: liberty } = booking.liberty_id
        ? await admin.from("profiles").select("full_name, phone, email").eq("id", booking.liberty_id).maybeSingle()
        : { data: null };
      const texts = buildWaTexts({
        memberName: liberty?.full_name || booking.guest_name || "Aluno",
        mentorName: mentor?.full_name || "Mentor",
        sessionName: session?.name || "Mentoria",
        date: booking.scheduled_date,
        start: booking.start_time,
        end: booking.end_time,
        meetUrl: booking.zoom_join_url,
      });
      await admin
        .from("bookings")
        .update({
          meeting_wa_member_text: texts.member,
          meeting_wa_mentor_text: texts.mentor,
          meeting_provision_error: null,
        })
        .eq("id", bookingId);
      return json({
        ok: true,
        reused: true,
        meet_url: booking.zoom_join_url,
        wa_member: texts.member,
        wa_mentor: texts.mentor,
      });
    }

    const { data: hosts } = await admin
      .from("meeting_hosts")
      .select("id, email, label, profile_id")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(5);

    let host = (hosts?.[0] || null) as HostRow | null;

    if (!host) {
      const { data: cfg } = await admin.from("system_config").select("value").eq("key", "meeting_host_email").maybeSingle();
      const email = (cfg?.value || "membrosliberty@gmail.com").trim();
      const { data: inserted } = await admin
        .from("meeting_hosts")
        .upsert({ label: "Liberty Meet", email, is_active: true, sort_order: 0 }, { onConflict: "email" })
        .select("id, email, label, profile_id")
        .single();
      host = inserted as HostRow;
    }

    let profileId = host.profile_id;
    if (!profileId) {
      const { data: p } = await admin
        .from("profiles")
        .select("id")
        .ilike("email", host.email)
        .maybeSingle();
      profileId = p?.id ?? null;
      if (profileId) {
        await admin.from("meeting_hosts").update({ profile_id: profileId }).eq("id", host.id);
      }
    }

    if (!profileId) {
      const msg =
        `Conta host ${host.email} não tem perfil no Liberty. Crie/vincule o perfil e conecte o Google (OAuth).`;
      await admin.from("bookings").update({ meeting_provision_error: msg }).eq("id", bookingId);
      return errorJson(msg, 400);
    }

    const { data: tokenRow } = await admin
      .from("user_oauth_tokens")
      .select("google_refresh_token")
      .eq("profile_id", profileId)
      .maybeSingle();

    const refresh = tokenRow?.google_refresh_token;
    if (!refresh) {
      const msg =
        `Conecte o Google da conta host (${host.email}) em Perfil → Google Agenda (com permissão de Meet/Calendar).`;
      await admin.from("bookings").update({ meeting_provision_error: msg }).eq("id", bookingId);
      return errorJson(msg, 400);
    }

    const { data: session } = await admin.from("sessions").select("name, description").eq("id", booking.session_id).maybeSingle();
    const { data: mentor } = await admin
      .from("profiles")
      .select("full_name, phone, email")
      .eq("id", booking.mentor_id)
      .maybeSingle();
    const { data: liberty } = booking.liberty_id
      ? await admin.from("profiles").select("full_name, phone, email").eq("id", booking.liberty_id).maybeSingle()
      : { data: null };

    const memberName = liberty?.full_name || booking.guest_name || "Aluno";
    const mentorName = mentor?.full_name || "Mentor";
    const sessionName = session?.name || "Mentoria";
    const startISO = `${booking.scheduled_date}T${booking.start_time}-03:00`;
    const endISO = `${booking.scheduled_date}T${booking.end_time}-03:00`;
    const attendeeEmails = [mentor?.email, liberty?.email].filter(Boolean) as string[];

    let accessToken: string;
    try {
      accessToken = await refreshAccessToken(refresh, admin);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from("bookings").update({ meeting_provision_error: msg }).eq("id", bookingId);
      return errorJson(msg, 500);
    }

    let meetUrl: string;
    let eventId: string;
    try {
      const created = await createMeetViaCalendar(accessToken, {
        title: `Sessão: ${sessionName} — ${memberName}`,
        description: [
          `Mentoria Liberty Begin`,
          `Aluno: ${memberName}`,
          `Mentor: ${mentorName}`,
          session?.description || "",
          ``,
          `Notas/transcrição: use Gemini no Meet se disponível na conta host.`,
        ].join("\n"),
        startISO,
        endISO,
        attendeeEmails,
        existingEventId: payload.force ? null : booking.meeting_calendar_event_id,
      });
      meetUrl = created.meetUrl;
      eventId = created.eventId;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from("bookings").update({ meeting_provision_error: msg }).eq("id", bookingId);
      return errorJson(msg, 500);
    }

    const texts = buildWaTexts({
      memberName,
      mentorName,
      sessionName,
      date: booking.scheduled_date,
      start: booking.start_time,
      end: booking.end_time,
      meetUrl,
    });

    const { error: upErr } = await admin
      .from("bookings")
      .update({
        zoom_join_url: meetUrl,
        zoom_link: meetUrl,
        meeting_provider: "meet",
        meeting_host_id: host.id,
        meeting_space_name: meetUrl.replace(/^https?:\/\/meet\.google\.com\//, "").split("?")[0] || null,
        meeting_calendar_event_id: eventId,
        meeting_wa_member_text: texts.member,
        meeting_wa_mentor_text: texts.mentor,
        meeting_provisioned_at: new Date().toISOString(),
        meeting_provision_error: null,
      })
      .eq("id", bookingId);

    if (upErr) {
      return errorJson("Meet criado, mas falhou ao salvar no banco: " + upErr.message, 500);
    }

    try {
      const syncUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-sync`;
      await fetch(syncUrl, {
        method: "POST",
        headers: {
          Authorization: req.headers.get("Authorization") || "",
          apikey: Deno.env.get("SUPABASE_ANON_KEY") || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ booking_id: bookingId }),
      });
    } catch (e) {
      console.warn("google-calendar-sync after meet", e);
    }

    return json({
      ok: true,
      meet_url: meetUrl,
      event_id: eventId,
      host_email: host.email,
      wa_member: texts.member,
      wa_mentor: texts.mentor,
    });
  } catch (e) {
    return toResponse(e);
  }
});
