/**
 * Encerrar Meet e buscar transcrição/resumo.
 * Função separada de provision-meeting: criar sala e encerrar não compartilham deploy.
 */
import { handleOptions, json, errorJson } from "../_shared/cors.ts";
import { requireRole, toResponse, STAFF_ROLES, type AppRole } from "../_shared/auth.ts";
import { resolveGoogleOAuthCredentials } from "../_shared/googleOAuth.ts";

const CONTROL_ROLES: AppRole[] = [...STAFF_ROLES];

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
  const conferenceEnded = Boolean(records[0]?.endTime);
  if (!transcripts.length) {
    if (smartNotesUrl) {
      return {
        status: "ready",
        transcript: null,
        smart_notes_url: smartNotesUrl,
        conference_record: conferenceRecord,
        message: "Resumo Gemini pronto no Google Docs.",
      };
    }
    if (conferenceEnded && !smartNotesPending) {
      return {
        status: "unavailable",
        transcript: null,
        smart_notes_url: null,
        conference_record: conferenceRecord,
        message: "Esta call encerrou sem transcrição nem resumo Gemini. A sala não gravou “Anota pra Mim”.",
      };
    }
    return {
      status: "pending",
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

type AdminClient = Awaited<ReturnType<typeof requireRole>>["supabaseAdmin"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Mantém o trabalho vivo após a resposta HTTP (Supabase EdgeRuntime). */
function scheduleBackground(task: () => Promise<void>): void {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  const promise = task().catch((e) => console.error("[meeting-control] background", e));
  if (runtime?.waitUntil) runtime.waitUntil(promise);
  else void promise;
}

async function persistArtifacts(
  admin: AdminClient,
  bookingId: string,
  artifacts: MeetArtifactsResult,
): Promise<void> {
  const patch: Record<string, unknown> = {
    meeting_artifacts_status: artifacts.status,
    meeting_artifacts_fetched_at: new Date().toISOString(),
    meeting_provision_error: artifacts.status === "ready" ? null : artifacts.message,
  };
  if (artifacts.transcript && artifacts.transcript.trim().length >= 30) {
    patch.meeting_transcript_text = artifacts.transcript.trim();
  }
  if (artifacts.smart_notes_url) {
    patch.meeting_smart_notes_url = artifacts.smart_notes_url;
  }
  const { error } = await admin.from("bookings").update(patch).eq("id", bookingId);
  if (error) throw new Error("Falha ao gravar artefatos: " + error.message);
}

async function notifyMentorArtifactsReady(
  admin: AdminClient,
  mentorProfileId: string | null | undefined,
  bookingId: string,
  artifacts: MeetArtifactsResult,
): Promise<void> {
  if (!mentorProfileId) return;
  const { data: mentor } = await admin.from("profiles").select("user_id").eq("id", mentorProfileId).maybeSingle();
  if (!mentor?.user_id) return;

  const hasTranscript = !!(artifacts.transcript && artifacts.transcript.trim().length >= 30);
  const title = hasTranscript ? "Transcrição da sessão pronta" : "Resumo Gemini da sessão pronto";
  const message = hasTranscript
    ? "A transcrição já está no relatório. Abra e revise o rascunho."
    : artifacts.smart_notes_url
      ? "O Doc do Gemini ficou pronto. Abra o relatório e use o link Anota pra Mim."
      : "O resumo da call ficou pronto no relatório.";

  await admin.from("notifications").insert({
    user_id: mentor.user_id,
    type: "meeting_artifacts_ready",
    title,
    message,
    link: `/mentor/sessoes/${bookingId}/relatorio`,
    related_booking_id: bookingId,
  });
}

/**
 * Poll após Encerrar: ~8 min (24 × 20s). Independente do browser do mentor.
 * Para cedo se ready (transcrição ≥30 ou Doc Gemini) ou unavailable definitivo.
 */
async function pollArtifactsAfterEnd(
  admin: AdminClient,
  accessToken: string,
  bookingId: string,
  meetingCode: string,
  mentorId: string | null | undefined,
): Promise<void> {
  const maxAttempts = 24;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await sleep(attempt === 1 ? 8_000 : 20_000);

    const { data: row } = await admin
      .from("bookings")
      .select("meeting_artifacts_status, meeting_transcript_text, meeting_smart_notes_url")
      .eq("id", bookingId)
      .maybeSingle();

    if (row?.meeting_artifacts_status === "ready" && String(row.meeting_transcript_text || "").trim().length >= 30) {
      return;
    }

    let artifacts: MeetArtifactsResult;
    try {
      artifacts = await fetchMeetArtifacts(accessToken, meetingCode);
    } catch (e) {
      console.warn("[meeting-control] poll attempt", attempt, e);
      if (attempt === maxAttempts) {
        await admin.from("bookings").update({
          meeting_artifacts_status: "unavailable",
          meeting_artifacts_fetched_at: new Date().toISOString(),
          meeting_provision_error: (e instanceof Error ? e.message : String(e)).slice(0, 500),
        }).eq("id", bookingId);
      }
      continue;
    }

    await persistArtifacts(admin, bookingId, artifacts);

    const hasTranscript = !!(artifacts.transcript && artifacts.transcript.trim().length >= 30);
    if (artifacts.status === "ready" && (hasTranscript || artifacts.smart_notes_url)) {
      await notifyMentorArtifactsReady(admin, mentorId, bookingId, artifacts);
      return;
    }
    if (artifacts.status === "unavailable") return;
  }

  await admin.from("bookings").update({
    meeting_artifacts_status: "unavailable",
    meeting_artifacts_fetched_at: new Date().toISOString(),
    meeting_provision_error:
      "Tempo esgotado buscando transcrição/resumo. Se o Gemini gerou o Doc, abra o e-mail da conta host ou cole o texto no relatório.",
  }).eq("id", bookingId);
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
    const ctx = await requireRole(req, CONTROL_ROLES);
    const admin = ctx.supabaseAdmin;
    const payload = await req.json().catch(() => ({}));
    const bookingId = payload.booking_id as string | undefined;
    const action = payload.action as string | undefined;
    if (!bookingId) return errorJson("booking_id obrigatório", 400);
    if (action !== "end" && action !== "artifacts") {
      return errorJson("action deve ser end ou artifacts", 400);
    }

    const { data: booking, error: bErr } = await admin
      .from("bookings")
      .select("id, mentor_id, zoom_join_url, meeting_space_name, meeting_ended_at, meeting_transcript_text, meeting_artifacts_status, meeting_smart_notes_url")
      .eq("id", bookingId)
      .single();
    if (bErr || !booking) return errorJson("Agendamento não encontrado", 404);

    const denied = await assertCanEndOrFetchArtifacts(admin, ctx, booking);
    if (denied) return denied;

    const meetingCode =
      (typeof booking.meeting_space_name === "string" && booking.meeting_space_name) ||
      (booking.zoom_join_url || "").replace(/^https?:\/\/meet\.google\.com\//, "").split("?")[0] ||
      "";
    if (!meetingCode) return errorJson("Esta sessão ainda não tem sala Meet.", 400);

    const hostTok = await resolveHostAccessToken(admin);
    if ("error" in hostTok) return errorJson(hostTok.error, 400);

    if (action === "end") {
      try {
        await endActiveMeetConference(hostTok.accessToken, meetingCode);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/FAILED_PRECONDITION|no active|not found|already ended|does not have an active/i.test(msg)) {
          return errorJson(msg, 500);
        }
      }
      const endedAt = new Date().toISOString();
      const nextArtifactsStatus = booking.meeting_artifacts_status === "ready" ? "ready" : "pending";
      const { error: upErr } = await admin.from("bookings").update({
        meeting_ended_at: booking.meeting_ended_at || endedAt,
        meeting_artifacts_status: nextArtifactsStatus,
      }).eq("id", bookingId);
      if (upErr) return errorJson("Meet encerrado, mas falhou ao gravar: " + upErr.message, 500);

      // Continua buscando no servidor mesmo se o mentor sair da tela de relatório.
      if (nextArtifactsStatus !== "ready") {
        scheduleBackground(() =>
          pollArtifactsAfterEnd(admin, hostTok.accessToken, bookingId, meetingCode, booking.mentor_id),
        );
      }

      return json({
        ok: true,
        ended: true,
        meeting_ended_at: booking.meeting_ended_at || endedAt,
        message: "Reunião encerrada. Buscando transcrição/resumo no servidor (não precisa ficar na tela).",
      });
    }

    if (booking.meeting_transcript_text && String(booking.meeting_transcript_text).trim().length >= 30) {
      return json({
        ok: true,
        status: "ready",
        transcript: booking.meeting_transcript_text,
        smart_notes_url: (booking as { meeting_smart_notes_url?: string | null }).meeting_smart_notes_url ?? null,
        message: "Transcrição já salva nesta sessão.",
      });
    }

    let artifacts: MeetArtifactsResult;
    try {
      artifacts = await fetchMeetArtifacts(hostTok.accessToken, meetingCode);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from("bookings").update({
        meeting_artifacts_status: "unavailable",
        meeting_artifacts_fetched_at: new Date().toISOString(),
        meeting_provision_error: msg.slice(0, 500),
      }).eq("id", bookingId);
      return errorJson(msg, 500);
    }

    await persistArtifacts(admin, bookingId, artifacts);
    if (artifacts.status === "ready") {
      await notifyMentorArtifactsReady(admin, booking.mentor_id, bookingId, artifacts);
    }

    return json({
      ok: true,
      status: artifacts.status,
      transcript: artifacts.transcript,
      smart_notes_url: artifacts.smart_notes_url,
      conference_record: artifacts.conference_record,
      message: artifacts.message,
    });
  } catch (e) {
    return toResponse(e);
  }
});
