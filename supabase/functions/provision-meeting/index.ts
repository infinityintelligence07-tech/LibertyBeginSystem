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

function formatBrTime(time: string): string {
  return time.slice(0, 5);
}

const APP_ORIGIN_DEFAULT = "https://begin.libertymentoria.com.br";

function ymdInSaoPaulo(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function relativeSessionDayLabel(dateYmd: string, now = new Date()): string {
  const today = ymdInSaoPaulo(now);
  if (dateYmd === today) return "HOJE";
  const tomorrowBase = new Date(`${today}T12:00:00-03:00`);
  tomorrowBase.setTime(tomorrowBase.getTime() + 24 * 60 * 60 * 1000);
  if (dateYmd === ymdInSaoPaulo(tomorrowBase)) return "AMANHÃ";
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    timeZone: "America/Sao_Paulo",
  })
    .format(new Date(`${dateYmd}T12:00:00-03:00`))
    .toUpperCase()
    .replace("-FEIRA", "");
}

function sessionPhrase(sessionName: string): string {
  const n = sessionName.trim() || "Mentoria";
  if (/^sess[aã]o\b/i.test(n)) return n;
  return `Sessão de ${n}`;
}

/** Copy WA: aluno sem NPS; mentor com lembrete + link NPS da plataforma. */
function buildWaTexts(opts: {
  bookingId: string;
  memberName: string;
  mentorName: string;
  sessionName: string;
  date: string;
  start: string;
  end: string;
  meetUrl: string;
  appOrigin?: string;
}): { member: string; mentor: string } {
  const origin = (opts.appOrigin || Deno.env.get("APP_URL") || APP_ORIGIN_DEFAULT).replace(/\/$/, "");
  const day = relativeSessionDayLabel(opts.date);
  const [, m, d] = opts.date.split("-");
  const dateShort = `${d}/${m}`;
  const timeH = `${formatBrTime(opts.start)}H`;
  const session = sessionPhrase(opts.sessionName);
  const meetUrl = (opts.meetUrl || "").trim();
  const npsUrl = `${origin}/nps/${opts.bookingId}`;

  const headline = "Estou passando para lembrá-lo da sua Sessão do Liberty Begin.";
  const mentorSessionLine = [
    day,
    dateShort,
    timeH,
    "membro Liberty Begin",
    opts.memberName.trim() || "Aluno",
    session,
  ].join(" - ");
  const memberSessionLine = [
    day,
    dateShort,
    timeH,
    "mentor",
    opts.mentorName.trim() || "Mentor",
    session,
  ].join(" - ");
  const meetBlock = meetUrl
    ? `Ingressar na reunião Meet\n${meetUrl}`
    : "O link da reunião Meet será enviado em breve.";
  const npsBlock = [
    `🚨 Lembrete`,
    `Confira com o Liberty Begin se abriu corretamente o link para a pesquisa de NPS 🙏🏼😊`,
    `Link para a pesquisa 👇🏼👇🏼`,
    ``,
    `📝 Clique aqui para avaliar a sessão: ${npsUrl}`,
  ].join("\n");

  return {
    member: [headline, ``, memberSessionLine, ``, meetBlock].join("\n"),
    mentor: [headline, ``, mentorSessionLine, ``, meetBlock, ``, npsBlock].join("\n"),
  };
}

/** Traduz erros da Calendar API para mensagem curta e acionável. */
function humanizeCalendarApiError(data: unknown): string {
  const raw = typeof data === "string" ? data : JSON.stringify(data ?? {});
  const msg =
    (data as { error?: { message?: string; status?: string } })?.error?.message ||
    (data as { message?: string })?.message ||
    raw;

  if (/Calendar API has not been used|SERVICE_DISABLED|accessNotConfigured|calendar-json\.googleapis\.com/i.test(msg + raw)) {
    return (
      "A API Google Calendar está desativada no Google Cloud. " +
      "Ative em: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=430819812839 " +
      "Espere 1–2 min e clique em Criar sala Meet."
    );
  }
  if (/invalid_grant|Token has been expired or revoked/i.test(msg)) {
    return "Token Google da conta host expirou. Entre como membrosliberty@gmail.com e reconecte o Google Agenda.";
  }
  if (/insufficientPermissions|Insufficient Permission/i.test(msg)) {
    return "A conta host não tem permissão de Calendar/Meet. Reconecte o Google Agenda aceitando todos os escopos.";
  }
  const short = String(msg).slice(0, 240);
  return `Falha ao criar Meet: ${short}`;
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
): Promise<{ eventId: string; meetUrl: string; meetingCode: string | null }> {
  const requestId = crypto.randomUUID();
  const body = {
    summary: opts.title,
    description: opts.description,
    start: { dateTime: opts.startISO, timeZone: "America/Sao_Paulo" },
    end: { dateTime: opts.endISO, timeZone: "America/Sao_Paulo" },
    attendees: opts.attendeeEmails.map((email) => ({ email })),
    guestsCanModify: false,
    guestsCanInviteOthers: true,
    guestsCanSeeOtherGuests: true,
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
    throw new Error(humanizeCalendarApiError(data));
  }

  const meetUrl =
    data.hangoutLink ||
    data.conferenceData?.entryPoints?.find((e: { entryPointType?: string }) => e.entryPointType === "video")
      ?.uri ||
    null;

  if (!meetUrl || typeof meetUrl !== "string") {
    throw new Error("Evento criado sem link Meet. Verifique se a conta host tem Google Meet habilitado.");
  }

  const meetingCode =
    (typeof data.conferenceData?.conferenceId === "string" && data.conferenceData.conferenceId) ||
    meetUrl.replace(/^https?:\/\/meet\.google\.com\//, "").split("?")[0] ||
    null;

  return { eventId: data.id as string, meetUrl, meetingCode };
}

/**
 * Abre a sala (OPEN) e liga notas Gemini + transcrição automáticas.
 * Feito na criação — não exige alguém entrar com membrosLiberty a cada sessão.
 */
async function configureMeetSpace(accessToken: string, meetingCode: string): Promise<void> {
  const code = meetingCode.trim();
  if (!code) return;

  const getRes = await fetch(`https://meet.googleapis.com/v2/spaces/${encodeURIComponent(code)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const getData = await getRes.json().catch(() => ({}));
  if (!getRes.ok) {
    throw new Error(humanizeMeetApiError(getData));
  }
  const spaceName = typeof getData.name === "string" ? getData.name : `spaces/${code}`;

  // OPEN primeiro (crítico para convidado externo entrar sem “aguardar admissão”).
  const openRes = await fetch(
    `https://meet.googleapis.com/v2/${spaceName}?updateMask=config.accessType`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ config: { accessType: "OPEN" } }),
    },
  );
  const openData = await openRes.json().catch(() => ({}));
  if (!openRes.ok) {
    throw new Error(humanizeMeetApiError(openData));
  }

  // Notas/transcrição: best-effort (plano Gemini já ok na host).
  const notesRes = await fetch(
    `https://meet.googleapis.com/v2/${spaceName}?updateMask=config.artifactConfig.smartNotesConfig.autoSmartNotesGeneration,config.artifactConfig.transcriptionConfig.autoTranscriptionGeneration`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        config: {
          artifactConfig: {
            smartNotesConfig: { autoSmartNotesGeneration: "ON" },
            transcriptionConfig: { autoTranscriptionGeneration: "ON" },
          },
        },
      }),
    },
  );
  if (!notesRes.ok) {
    const notesData = await notesRes.json().catch(() => ({}));
    throw new Error(humanizeMeetApiError(notesData));
  }
}

function humanizeMeetApiError(data: unknown): string {
  const raw = typeof data === "string" ? data : JSON.stringify(data ?? {});
  const msg =
    (data as { error?: { message?: string; status?: string } })?.error?.message ||
    (data as { message?: string })?.message ||
    raw;

  if (/Meet API has not been used|SERVICE_DISABLED|accessNotConfigured|meet\.googleapis\.com/i.test(msg + raw)) {
    return (
      "A API Google Meet está desativada no Google Cloud. " +
      "Ative em: https://console.cloud.google.com/apis/library/meet.googleapis.com?project=430819812839 " +
      "Espere 1–2 min e clique em Criar sala Meet."
    );
  }
  if (/insufficientPermissions|Insufficient Permission|PERMISSION_DENIED/i.test(msg + raw)) {
    return (
      "Sem permissão para abrir a sala Meet / notas automáticas. " +
      "Reconecte o Google da conta host aceitando os escopos de Meet (settings)."
    );
  }
  if (/smartNotes|Smart notes|Gemini|not.*supported|FAILED_PRECONDITION|not enabled|not available/i.test(msg + raw)) {
    return (
      "A conta host não tem “Anota pra Mim” / Gemini liberado no plano Google. " +
      "Sem isso o Meet abre, mas notas/transcrição automáticas não ligam. " +
      "Confira o plano em https://one.google.com (Google AI) na conta membrosLiberty."
    );
  }
  return `Falha ao configurar acesso do Meet: ${String(msg).slice(0, 240)}`;
}

async function resolveHostAccessToken(
  admin: Awaited<ReturnType<typeof requireRole>>["supabaseAdmin"],
): Promise<{ accessToken: string; hostEmail: string } | { error: string }> {
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
    const { data: p } = await admin.from("profiles").select("id").ilike("email", host.email).maybeSingle();
    profileId = p?.id ?? null;
    if (profileId) {
      await admin.from("meeting_hosts").update({ profile_id: profileId }).eq("id", host.id);
    }
  }
  if (!profileId) {
    return { error: `Conta host ${host.email} não tem perfil no Liberty. Conecte o Google (OAuth).` };
  }

  const { data: tokenRow } = await admin
    .from("user_oauth_tokens")
    .select("google_refresh_token")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!tokenRow?.google_refresh_token) {
    return { error: `Conecte o Google da conta host (${host.email}) em Perfil → Google Agenda.` };
  }

  try {
    const accessToken = await refreshAccessToken(tokenRow.google_refresh_token, admin);
    return { accessToken, hostEmail: host.email };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Encerra a call ativa para todos (sem precisar entrar como membrosLiberty). */
async function endActiveMeetConference(accessToken: string, meetingCode: string): Promise<void> {
  const code = meetingCode.trim();
  if (!code) throw new Error("Código da sala Meet ausente.");

  const getRes = await fetch(`https://meet.googleapis.com/v2/spaces/${encodeURIComponent(code)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const getData = await getRes.json().catch(() => ({}));
  if (!getRes.ok) throw new Error(humanizeMeetApiError(getData));

  const spaceName = typeof getData.name === "string" ? getData.name : `spaces/${code}`;
  const endRes = await fetch(`https://meet.googleapis.com/v2/${spaceName}:endActiveConference`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!endRes.ok) {
    const endData = await endRes.json().catch(() => ({}));
    // Sem call ativa / já encerrada = sucesso idempotente (não exige 2º clique).
    const msg = JSON.stringify(endData);
    if (
      endRes.status === 404 ||
      endRes.status === 400 ||
      endRes.status === 409 ||
      endRes.status === 412 ||
      /FAILED_PRECONDITION|no active|not found|ACTIVE_CONFERENCE|does not have an active|no longer active|already ended/i.test(msg)
    ) {
      return;
    }
    throw new Error(humanizeMeetApiError(endData));
  }
}

type MeetArtifactsResult = {
  status: "pending" | "ready" | "unavailable";
  transcript: string | null;
  smart_notes_url: string | null;
  conference_record: string | null;
  message: string;
};

function normalizeMeetingCode(raw: string): string {
  return raw
    .trim()
    .replace(/^spaces\//i, "")
    .replace(/^https?:\/\/meet\.google\.com\//i, "")
    .split("?")[0]
    .trim();
}

async function listAllTranscriptEntries(accessToken: string, transcriptName: string): Promise<string[]> {
  const lines: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 40; page++) {
    const url = new URL(`https://meet.googleapis.com/v2/${transcriptName}/entries`);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(humanizeMeetApiError(data));
    const entries = Array.isArray(data.transcriptEntries) ? data.transcriptEntries : [];
    for (const e of entries) {
      const text = typeof e?.text === "string" ? e.text.trim() : "";
      if (text) lines.push(text);
    }
    pageToken = typeof data.nextPageToken === "string" ? data.nextPageToken : undefined;
    if (!pageToken) break;
  }
  return lines;
}

/**
 * Busca conferenceRecord da sala + transcrição (entries) e link do Doc de smart notes.
 * Não é instantâneo: enquanto state !== FILE_GENERATED devolve pending.
 */
async function fetchMeetArtifacts(accessToken: string, meetingCodeRaw: string): Promise<MeetArtifactsResult> {
  const meetingCode = normalizeMeetingCode(meetingCodeRaw);
  if (!meetingCode) {
    return {
      status: "unavailable",
      transcript: null,
      smart_notes_url: null,
      conference_record: null,
      message: "Código da sala Meet ausente.",
    };
  }

  // Resolve space.name (mais estável que só o meeting code).
  let spaceName = `spaces/${meetingCode}`;
  try {
    const getRes = await fetch(`https://meet.googleapis.com/v2/spaces/${encodeURIComponent(meetingCode)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const getData = await getRes.json().catch(() => ({}));
    if (getRes.ok && typeof getData.name === "string") spaceName = getData.name;
  } catch {
    /* segue com spaces/{code} */
  }

  const filter = `space.name = "${spaceName}"`;
  const listUrl = new URL("https://meet.googleapis.com/v2/conferenceRecords");
  listUrl.searchParams.set("filter", filter);
  listUrl.searchParams.set("pageSize", "10");
  const listRes = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  const listData = await listRes.json().catch(() => ({}));
  if (!listRes.ok) throw new Error(humanizeMeetApiError(listData));

  const records = Array.isArray(listData.conferenceRecords) ? listData.conferenceRecords : [];
  if (records.length === 0) {
    // Fallback: filtro por meeting_code
    const altFilter = `space.meeting_code = "${meetingCode}"`;
    const altUrl = new URL("https://meet.googleapis.com/v2/conferenceRecords");
    altUrl.searchParams.set("filter", altFilter);
    altUrl.searchParams.set("pageSize", "10");
    const altRes = await fetch(altUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    const altData = await altRes.json().catch(() => ({}));
    if (altRes.ok && Array.isArray(altData.conferenceRecords) && altData.conferenceRecords.length) {
      records.push(...altData.conferenceRecords);
    }
  }

  if (!records.length) {
    return {
      status: "pending",
      transcript: null,
      smart_notes_url: null,
      conference_record: null,
      message: "Ainda não há registro da call. O Google costuma levar 1–5 minutos após encerrar.",
    };
  }

  // Mais recente primeiro (API já ordena por startTime desc, mas garantimos).
  records.sort((a: { startTime?: string }, b: { startTime?: string }) =>
    String(b.startTime || "").localeCompare(String(a.startTime || "")),
  );
  const conferenceRecord = String(records[0].name || "");
  if (!conferenceRecord) {
    return {
      status: "pending",
      transcript: null,
      smart_notes_url: null,
      conference_record: null,
      message: "Registro da call ainda incompleto.",
    };
  }

  // Smart notes (link do Doc Gemini) — best-effort.
  let smartNotesUrl: string | null = null;
  let smartNotesPending = false;
  try {
    const snRes = await fetch(`https://meet.googleapis.com/v2/${conferenceRecord}/smartNotes?pageSize=10`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const snData = await snRes.json().catch(() => ({}));
    if (snRes.ok) {
      const notes = Array.isArray(snData.smartNotes) ? snData.smartNotes : [];
      for (const n of notes) {
        const state = String(n?.state || "");
        if (state === "FILE_GENERATED") {
          const uri = n?.docsDestination?.exportUri || n?.docsDestination?.document;
          if (typeof uri === "string" && uri) {
            smartNotesUrl = uri.startsWith("http") ? uri : `https://docs.google.com/document/d/${uri}/edit`;
          }
        } else if (state === "STARTED" || state === "ENDED") {
          smartNotesPending = true;
        }
      }
    }
  } catch {
    /* ignore */
  }

  // Transcripts + entries
  const trRes = await fetch(`https://meet.googleapis.com/v2/${conferenceRecord}/transcripts?pageSize=10`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const trData = await trRes.json().catch(() => ({}));
  if (!trRes.ok) throw new Error(humanizeMeetApiError(trData));

  const transcripts = Array.isArray(trData.transcripts) ? trData.transcripts : [];
  if (!transcripts.length) {
    if (smartNotesUrl) {
      return {
        status: "ready",
        transcript: null,
        smart_notes_url: smartNotesUrl,
        conference_record: conferenceRecord,
        message: "Resumo Gemini pronto no Google Docs (transcrição ainda não disponível via API).",
      };
    }
    return {
      status: smartNotesPending ? "pending" : "pending",
      transcript: null,
      smart_notes_url: null,
      conference_record: conferenceRecord,
      message: "Transcrição ainda está sendo gerada pelo Google.",
    };
  }

  let anyPending = false;
  const allLines: string[] = [];
  for (const t of transcripts) {
    const state = String(t?.state || "");
    const name = typeof t?.name === "string" ? t.name : "";
    if (state === "STARTED" || state === "ENDED") {
      anyPending = true;
      continue;
    }
    if (state !== "FILE_GENERATED" || !name) continue;
    const lines = await listAllTranscriptEntries(accessToken, name);
    allLines.push(...lines);
  }

  const transcript = allLines.join("\n").trim();
  if (transcript.length >= 30) {
    return {
      status: "ready",
      transcript,
      smart_notes_url: smartNotesUrl,
      conference_record: conferenceRecord,
      message: "Transcrição pronta para preencher o relatório.",
    };
  }

  if (anyPending || smartNotesPending) {
    return {
      status: "pending",
      transcript: transcript || null,
      smart_notes_url: smartNotesUrl,
      conference_record: conferenceRecord,
      message: "Google ainda processando a transcrição/resumo (costuma levar 1–5 min).",
    };
  }

  if (smartNotesUrl) {
    return {
      status: "ready",
      transcript: transcript || null,
      smart_notes_url: smartNotesUrl,
      conference_record: conferenceRecord,
      message: "Resumo Gemini disponível; transcrição curta ou vazia.",
    };
  }

  return {
    status: "unavailable",
    transcript: null,
    smart_notes_url: null,
    conference_record: conferenceRecord,
    message:
      "Não encontramos transcrição desta call. Confira se a sala tinha “Anota pra Mim”/transcrição ligados e se o plano Gemini da host permite.",
  };
}

async function assertCanEndOrFetchArtifacts(
  admin: Awaited<ReturnType<typeof requireRole>>["supabaseAdmin"],
  ctx: Awaited<ReturnType<typeof requireRole>>,
  booking: { mentor_id?: string | null },
): Promise<Response | null> {
  const isStaff = ctx.roles.some((r) => STAFF_ROLES.includes(r));
  if (!isStaff) return errorJson("Forbidden", 403);
  const isAdmin = ctx.roles.some((r) => r === "admin" || r === "super_admin");
  if (isAdmin) return null;
  const { data: myProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", ctx.user?.id || "")
    .maybeSingle();
  if (!myProfile?.id || booking.mentor_id !== myProfile.id) {
    return errorJson("Só o mentor desta sessão (ou um admin) pode encerrar / buscar o resumo do Meet.", 403);
  }
  return null;
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
        "id, status, scheduled_date, start_time, end_time, mentor_id, liberty_id, guest_name, guest_email, session_id, zoom_join_url, meeting_space_name, meeting_calendar_event_id, is_retroactive, created_by, meeting_ended_at, meeting_transcript_text, meeting_artifacts_status",
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

    const meetingCode =
      (typeof booking.meeting_space_name === "string" && booking.meeting_space_name) ||
      (booking.zoom_join_url || "").replace(/^https?:\/\/meet\.google\.com\//, "").split("?")[0] ||
      "";

    // Encerrar call para todos via API da host — mentor da sessão ou admin.
    if (payload.action === "end") {
      const denied = await assertCanEndOrFetchArtifacts(admin, ctx, booking);
      if (denied) return denied;
      if (!meetingCode) {
        return errorJson("Esta sessão ainda não tem sala Meet para encerrar.", 400);
      }
      const hostTok = await resolveHostAccessToken(admin);
      if ("error" in hostTok) return errorJson(hostTok.error, 400);
      try {
        await endActiveMeetConference(hostTok.accessToken, meetingCode);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Se a API falhar mas a call já não existe, ainda marcamos como encerrada na plataforma.
        if (!/FAILED_PRECONDITION|no active|not found|already ended|does not have an active/i.test(msg)) {
          return errorJson(msg, 500);
        }
      }
      const endedAt = new Date().toISOString();
      await admin
        .from("bookings")
        .update({
          meeting_ended_at: endedAt,
          meeting_artifacts_status: booking.meeting_artifacts_status === "ready" ? "ready" : "pending",
        })
        .eq("id", bookingId);
      return json({
        ok: true,
        ended: true,
        meeting_ended_at: endedAt,
        message:
          "Reunião encerrada. Buscando transcrição/resumo Gemini automaticamente — costuma levar 1–5 minutos.",
      });
    }

    // Poll da transcrição / smart notes após Encerrar.
    if (payload.action === "artifacts") {
      const denied = await assertCanEndOrFetchArtifacts(admin, ctx, booking);
      if (denied) return denied;
      if (!meetingCode) {
        return errorJson("Esta sessão ainda não tem sala Meet.", 400);
      }
      if (booking.meeting_transcript_text && String(booking.meeting_transcript_text).trim().length >= 30) {
        return json({
          ok: true,
          status: "ready",
          transcript: booking.meeting_transcript_text,
          smart_notes_url: null,
          message: "Transcrição já salva nesta sessão.",
        });
      }
      const hostTok = await resolveHostAccessToken(admin);
      if ("error" in hostTok) return errorJson(hostTok.error, 400);
      let artifacts: MeetArtifactsResult;
      try {
        artifacts = await fetchMeetArtifacts(hostTok.accessToken, meetingCode);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return errorJson(msg, 500);
      }
      const patch: Record<string, unknown> = {
        meeting_artifacts_status: artifacts.status,
        meeting_artifacts_fetched_at: new Date().toISOString(),
      };
      if (artifacts.transcript && artifacts.transcript.trim().length >= 30) {
        patch.meeting_transcript_text = artifacts.transcript.trim();
      }
      await admin.from("bookings").update(patch).eq("id", bookingId);
      return json({
        ok: true,
        status: artifacts.status,
        transcript: artifacts.transcript,
        smart_notes_url: artifacts.smart_notes_url,
        conference_record: artifacts.conference_record,
        message: artifacts.message,
      });
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
        bookingId,
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

    const hostTok = await resolveHostAccessToken(admin);
    if ("error" in hostTok) {
      await admin.from("bookings").update({ meeting_provision_error: hostTok.error }).eq("id", bookingId);
      return errorJson(hostTok.error, 400);
    }
    const accessToken = hostTok.accessToken;
    const hostEmail = hostTok.hostEmail;

    const { data: hosts } = await admin
      .from("meeting_hosts")
      .select("id, email, label, profile_id")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(1);
    const host = (hosts?.[0] || { id: null, email: hostEmail }) as HostRow;

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
    const guestEmail =
      typeof booking.guest_email === "string" ? booking.guest_email.trim().toLowerCase() : "";
    const attendeeEmails = [...new Set(
      [mentor?.email, liberty?.email, guestEmail || null]
        .map((e) => (typeof e === "string" ? e.trim().toLowerCase() : ""))
        .filter((e) => e.includes("@")),
    )];

    let meetUrl: string;
    let eventId: string;
    let meetingCode: string | null = null;
    let accessWarning: string | null = null;
    try {
      const created = await createMeetViaCalendar(accessToken, {
        title: `Sessão: ${sessionName} — ${memberName}`,
        description: [
          `Mentoria Liberty Begin`,
          `Aluno: ${memberName}`,
          `Mentor: ${mentorName}`,
          session?.description || "",
          ``,
          `Sala aberta: quem tem o link entra sem aguardar admissão.`,
          `Notas Gemini + transcrição: ligadas automaticamente na criação da sala (se o plano Google da host permitir).`,
        ].join("\n"),
        startISO,
        endISO,
        attendeeEmails,
        existingEventId: payload.force ? null : booking.meeting_calendar_event_id,
      });
      meetUrl = created.meetUrl;
      eventId = created.eventId;
      meetingCode = created.meetingCode;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from("bookings").update({ meeting_provision_error: msg }).eq("id", bookingId);
      return errorJson(msg, 500);
    }

    if (meetingCode) {
      try {
        await configureMeetSpace(accessToken, meetingCode);
      } catch (e) {
        accessWarning = e instanceof Error ? e.message : String(e);
        console.warn("configureMeetSpace", accessWarning);
      }
    }

    const texts = buildWaTexts({
      bookingId,
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
        meeting_provision_error: accessWarning,
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
      host_email: hostEmail,
      wa_member: texts.member,
      wa_mentor: texts.mentor,
      access_warning: accessWarning,
    });
  } catch (e) {
    return toResponse(e);
  }
});
