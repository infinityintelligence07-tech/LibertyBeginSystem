/**
 * Encerrar Meet e buscar transcrição/resumo.
 * Função separada de provision-meeting: criar sala e encerrar não compartilham deploy.
 */
import { handleOptions, json, errorJson } from "../_shared/cors.ts";
import { getAdminClient, requireRole, timingSafeEqual, toResponse, STAFF_ROLES, type AppRole } from "../_shared/auth.ts";
import { resolveGoogleOAuthCredentials } from "../_shared/googleOAuth.ts";
import { chatCompletions } from "../_shared/ai.ts";

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

  // Não casar só "meet.googleapis.com": todo erro do Google traz esse domínio nos details.
  if (/has not been used|SERVICE_DISABLED|accessNotConfigured/i.test(msg + raw)) {
    return (
      "A API Google Meet está desativada no Google Cloud. " +
      "Ative em: https://console.cloud.google.com/apis/library/meet.googleapis.com?project=430819812839 " +
      "Espere 1–2 min e clique em Criar sala Meet."
    );
  }
  if (/insufficientPermissions|Insufficient Permission|PERMISSION_DENIED/i.test(msg + raw)) {
    return (
      "Sem permissão no Google Meet para esta sala. " +
      `Reconecte o Google da conta host aceitando todos os escopos. (Google: ${String(msg).slice(0, 160)})`
    );
  }
  if (/smartNotes|Smart notes|Gemini|not.*supported|FAILED_PRECONDITION|not enabled|not available/i.test(msg + raw)) {
    return (
      "A conta host não tem “Anota pra Mim” / Gemini liberado no plano Google. " +
      "Sem isso o Meet abre, mas notas/transcrição automáticas não ligam. " +
      "Confira no Admin Console do Workspace se o Gemini no Meet está ativo para a conta host."
    );
  }
  return `Falha ao configurar acesso do Meet: ${String(msg).slice(0, 240)}`;
}

/** Só a conta dona da sala lê os artefatos: usa a host gravada na sessão; sem ela, a host ativa. */
async function resolveHostAccessToken(
  admin: Awaited<ReturnType<typeof requireRole>>["supabaseAdmin"],
  bookingHostId?: string | null,
): Promise<{ accessToken: string; hostEmail: string } | { error: string }> {
  let host: HostRow | null = null;
  if (bookingHostId) {
    const { data: owner } = await admin
      .from("meeting_hosts")
      .select("id, email, label, profile_id")
      .eq("id", bookingHostId)
      .maybeSingle();
    host = (owner || null) as HostRow | null;
  }
  if (!host) {
    const { data: hosts } = await admin
      .from("meeting_hosts")
      .select("id, email, label, profile_id")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(5);
    host = (hosts?.[0] || null) as HostRow | null;
  }
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

async function getSpace(accessToken: string, code: string): Promise<{ name: string; hasActiveConference: boolean }> {
  const getRes = await fetch(`https://meet.googleapis.com/v2/spaces/${encodeURIComponent(code)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const getData = await getRes.json().catch(() => ({}));
  if (!getRes.ok) {
    console.warn("[meeting-control] spaces.get", getRes.status, JSON.stringify(getData));
    throw new Error(humanizeMeetApiError(getData));
  }
  return {
    name: typeof getData.name === "string" ? getData.name : `spaces/${code}`,
    hasActiveConference: !!getData.activeConference,
  };
}

/**
 * Encerra a call ativa para todos (sem precisar entrar como a conta host).
 * Confere depois em spaces.get: só devolve sucesso se o Google não tiver mais call ativa.
 */
async function endActiveMeetConference(accessToken: string, meetingCode: string): Promise<void> {
  const code = normalizeMeetingCode(meetingCode);
  if (!code) throw new Error("Código da sala Meet ausente.");

  const space = await getSpace(accessToken, code);
  if (!space.hasActiveConference) return;

  const endRes = await fetch(`https://meet.googleapis.com/v2/${space.name}:endActiveConference`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!endRes.ok) {
    const endData = await endRes.json().catch(() => ({}));
    const raw = JSON.stringify(endData);
    console.warn("[meeting-control] endActiveConference", endRes.status, raw);
    // Só "não há call ativa" é sucesso idempotente; qualquer outro erro precisa aparecer para o mentor.
    if (!/no active conference|does not have an active|no longer active|already ended/i.test(raw)) {
      throw new Error(humanizeMeetApiError(endData));
    }
  }

  for (let check = 0; check < 3; check++) {
    await sleep(1_500);
    if (!(await getSpace(accessToken, code)).hasActiveConference) return;
  }
  throw new Error("O Google ainda mostra a call ativa. Tente Encerrar de novo em alguns segundos.");
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

  const { count } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("type", "meeting_artifacts_ready")
    .eq("related_booking_id", bookingId);
  if ((count ?? 0) > 0) return;

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

type SessionSummary = {
  resumo: string;
  pontos_principais: string[];
  decisoes: string[];
  proximos_passos: string[];
};

const SUMMARY_CLAIM_MS = 5 * 60 * 1000;

function summaryToText(s: SessionSummary): string {
  const section = (title: string, items: string[]) =>
    items.length ? `\n\n${title}\n${items.map((i) => `• ${i}`).join("\n")}` : "";
  return (
    // Linha em branco separa seções (tela e e-mail dependem disso), então parágrafos do resumo usam \n simples.
    `Resumo\n${s.resumo.trim().replace(/\n{2,}/g, "\n")}` +
    section("Pontos principais", s.pontos_principais) +
    section("Decisões", s.decisoes) +
    section("Próximos passos", s.proximos_passos)
  ).trim();
}

async function generateSessionSummary(
  transcript: string,
  ctx: { sessionName: string; memberName: string; mentorName: string },
): Promise<SessionSummary> {
  const systemPrompt = `Você recebe a transcrição automática do Google Meet de uma sessão de mentoria da Liberty Mentoria.
Escreva um resumo curto e fiel para o mentor revisar depois da call.

Campos:
- "resumo": 1 a 2 parágrafos curtos com o foco da sessão e o principal desafio do mentorado.
- "pontos_principais": até 6 itens com o que foi discutido de mais importante.
- "decisoes": o que ficou definido na call (vazio se nada foi decidido; sugestão não é decisão).
- "proximos_passos": ações concretas combinadas para o mentorado, começando com verbo no infinitivo.

Regras: use os nomes reais das pessoas; não invente nada que não esteja na transcrição; ignore conversa informal e problemas técnicos; linguagem profissional e simples, em português do Brasil; cada item com até 160 caracteres.`;

  const userPrompt = `Sessão: ${ctx.sessionName}\nMentorado: ${ctx.memberName}\nMentor: ${ctx.mentorName}\n\nTranscrição:\n${transcript.slice(0, 120_000)}`;

  const response = await chatCompletions(
    {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "build_summary",
            description: "Resumo estruturado da sessão de mentoria.",
            parameters: {
              type: "object",
              properties: {
                resumo: { type: "string" },
                pontos_principais: { type: "array", items: { type: "string" } },
                decisoes: { type: "array", items: { type: "string" } },
                proximos_passos: { type: "array", items: { type: "string" } },
              },
              required: ["resumo", "pontos_principais", "decisoes", "proximos_passos"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "build_summary" } },
    },
    { timeoutMs: 120_000 },
  );
  if (!response.ok) {
    const txt = await response.text().catch(() => "");
    throw new Error(`IA falhou (${response.status}): ${txt.slice(0, 200)}`);
  }
  const data = await response.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("Resposta da IA sem estrutura esperada");
  const parsed = JSON.parse(args) as Partial<SessionSummary>;
  const list = (v: unknown) =>
    Array.isArray(v) ? v.map((i) => String(i || "").replace(/\s+/g, " ").trim()).filter(Boolean) : [];
  const resumo = String(parsed.resumo || "").trim();
  if (!resumo) throw new Error("IA devolveu resumo vazio");
  return {
    resumo,
    pontos_principais: list(parsed.pontos_principais),
    decisoes: list(parsed.decisoes),
    proximos_passos: list(parsed.proximos_passos),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function base64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Envia pelo Gmail da conta host (escopo gmail.send). */
async function sendGmail(
  accessToken: string,
  from: string,
  to: string[],
  subject: string,
  html: string,
): Promise<void> {
  const mime = [
    `From: Liberty Mentoria <${from}>`,
    `To: ${to.join(", ")}`,
    `Subject: =?UTF-8?B?${base64Utf8(subject)}?=`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Utf8(html).replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");
  const raw = base64Utf8(mime).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (res.ok) return;
  const body = await res.text().catch(() => "");
  console.warn("[meeting-control] gmail send", res.status, body);
  if (/has not been used|SERVICE_DISABLED|accessNotConfigured/i.test(body)) {
    throw new Error(
      "A API do Gmail está desativada no Google Cloud. Ative em https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=430819812839",
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error("A conta host precisa reconectar o Google (Perfil → Google Agenda) para liberar o envio de e-mail.");
  }
  throw new Error(`Gmail recusou o envio (${res.status}): ${body.slice(0, 200)}`);
}

function buildSummaryEmailHtml(p: {
  sessionName: string;
  memberName: string;
  mentorName: string;
  dateLabel: string;
  summaryText: string | null;
  smartNotesUrl: string | null;
  reportUrl: string;
}): string {
  // summaryText vem de summaryToText: blocos separados por linha em branco, título na 1ª linha, itens com "• ".
  const block = (raw: string) => {
    const [title, ...lines] = raw.split("\n");
    const bullets = lines.filter((l) => l.startsWith("• "));
    const content = bullets.length === lines.length && bullets.length
      ? `<ul style="margin:0;padding-left:20px">${bullets
          .map((l) => `<li style="margin:4px 0">${escapeHtml(l.slice(2))}</li>`)
          .join("")}</ul>`
      : `<p style="margin:0 0 10px">${escapeHtml(lines.join("\n")).replace(/\n/g, "<br>")}</p>`;
    return `<h3 style="margin:20px 0 8px;font-size:15px">${escapeHtml(title)}</h3>${content}`;
  };
  const body = p.summaryText
    ? p.summaryText.split(/\n{2,}/).map(block).join("")
    : p.smartNotesUrl
      ? `<p>O Google gerou as anotações da call no Google Docs.</p>`
      : `<p>O resumo automático não pôde ser gerado agora. A transcrição completa está na página da sessão.</p>`;
  const notes = p.smartNotesUrl
    ? `<p style="margin:16px 0 0"><a href="${escapeHtml(p.smartNotesUrl)}">Abrir anotações do Gemini</a></p>`
    : "";
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.5;max-width:640px;margin:0 auto;padding:16px">
<p style="margin:0 0 4px;color:#6b7280;font-size:13px">Liberty Mentoria · Resumo da sessão</p>
<h2 style="margin:0 0 4px;font-size:18px">${escapeHtml(p.sessionName)} — ${escapeHtml(p.memberName)}</h2>
<p style="margin:0 0 8px;color:#6b7280;font-size:13px">${escapeHtml(p.dateLabel)} · Mentor: ${escapeHtml(p.mentorName)}</p>
${body}${notes}
<p style="margin:24px 0 0"><a href="${escapeHtml(p.reportUrl)}" style="background:#111827;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">Abrir a sessão no Liberty</a></p>
<p style="margin:16px 0 0;color:#6b7280;font-size:12px">Resumo gerado automaticamente a partir da transcrição do Meet. Revise antes de enviar o relatório.</p>
</body></html>`;
}

function mentorEmails(mentor: { email?: string | null; google_calendar_email?: string | null } | null): string[] {
  return [...new Set(
    [mentor?.google_calendar_email, mentor?.email]
      .map((e) => (typeof e === "string" ? e.trim().toLowerCase() : ""))
      .filter((e) => e.includes("@")),
  )];
}

/**
 * Transcrição pronta → resumo por IA (salvo na sessão) → e-mail para o mentor (co-host) pelo Gmail da host.
 * Idempotente: a trava meeting_summary_claimed_at evita que poll, varredura e tela façam isso em dobro.
 */
async function finalizeSessionSummary(admin: AdminClient, bookingId: string): Promise<void> {
  const now = new Date();
  const claimCutoff = new Date(now.getTime() - SUMMARY_CLAIM_MS).toISOString();
  const { data: claimed, error: claimErr } = await admin
    .from("bookings")
    .update({ meeting_summary_claimed_at: now.toISOString() })
    .eq("id", bookingId)
    .is("meeting_summary_emailed_at", null)
    .or(`meeting_summary_claimed_at.is.null,meeting_summary_claimed_at.lt.${claimCutoff}`)
    .select("id");
  if (claimErr) throw new Error("Falha ao travar resumo: " + claimErr.message);
  if (!claimed?.length) return;

  const { data: b } = await admin
    .from("bookings")
    .select("id, mentor_id, liberty_id, guest_name, session_id, scheduled_date, start_time, meeting_host_id, meeting_transcript_text, meeting_smart_notes_url, meeting_summary_text")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return;

  const transcript = String(b.meeting_transcript_text || "").trim();
  if (transcript.length < 30 && !b.meeting_smart_notes_url) {
    await admin.from("bookings").update({ meeting_summary_claimed_at: null }).eq("id", bookingId);
    return;
  }

  const fail = async (msg: string) => {
    console.warn("[meeting-control] resumo", bookingId, msg);
    await admin.from("bookings").update({ meeting_summary_email_error: msg.slice(0, 500) }).eq("id", bookingId);
  };

  const [{ data: mentor }, { data: member }, { data: session }] = await Promise.all([
    b.mentor_id
      ? admin.from("profiles").select("full_name, email, google_calendar_email").eq("id", b.mentor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    b.liberty_id
      ? admin.from("profiles").select("full_name").eq("id", b.liberty_id).maybeSingle()
      : Promise.resolve({ data: null }),
    b.session_id
      ? admin.from("sessions").select("name").eq("id", b.session_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const names = {
    sessionName: session?.name || "Sessão de mentoria",
    memberName: member?.full_name || b.guest_name || "Mentorado",
    mentorName: mentor?.full_name || "Mentor",
  };

  let summaryText: string | null = b.meeting_summary_text || null;
  // Se a IA falhar (ex.: sem créditos), o e-mail sai mesmo assim com o link das anotações / da transcrição.
  let aiError: string | null = null;
  if (!summaryText && transcript.length >= 30) {
    try {
      summaryText = summaryToText(await generateSessionSummary(transcript, names));
      await admin.from("bookings").update({
        meeting_summary_text: summaryText,
        meeting_summary_generated_at: new Date().toISOString(),
        meeting_summary_email_error: null,
      }).eq("id", bookingId);
    } catch (e) {
      aiError = "Falha ao gerar resumo: " + (e instanceof Error ? e.message : String(e));
      console.warn("[meeting-control] resumo", bookingId, aiError);
    }
  }

  const to = mentorEmails(mentor);
  if (!to.length) return fail("Mentor sem e-mail cadastrado para receber o resumo.");

  const hostTok = await resolveHostAccessToken(admin, b.meeting_host_id);
  if ("error" in hostTok) return fail(hostTok.error);

  const appUrl = (Deno.env.get("APP_URL") || "https://begin.libertymentoria.com.br").replace(/\/+$/, "");
  const [y, m, d] = String(b.scheduled_date).split("-");
  const dateLabel = `${d}/${m}/${y}${b.start_time ? ` às ${String(b.start_time).slice(0, 5)}` : ""}`;
  try {
    await sendGmail(
      hostTok.accessToken,
      hostTok.hostEmail,
      to,
      `Resumo da sessão: ${names.sessionName} — ${names.memberName} (${d}/${m})`,
      buildSummaryEmailHtml({
        ...names,
        dateLabel,
        summaryText,
        smartNotesUrl: b.meeting_smart_notes_url || null,
        reportUrl: `${appUrl}/mentor/sessoes/${bookingId}/relatorio`,
      }),
    );
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }

  await admin.from("bookings").update({
    meeting_summary_emailed_at: new Date().toISOString(),
    meeting_summary_email_error: aiError ? aiError.slice(0, 500) : null,
  }).eq("id", bookingId);
}

async function onArtifactsReady(
  admin: AdminClient,
  bookingId: string,
  mentorId: string | null | undefined,
  artifacts: MeetArtifactsResult,
): Promise<void> {
  await notifyMentorArtifactsReady(admin, mentorId, bookingId, artifacts);
  await finalizeSessionSummary(admin, bookingId).catch((e) =>
    console.error("[meeting-control] finalizeSessionSummary", bookingId, e),
  );
}

/**
 * Poll após Encerrar: ~6 min (limite de wall-clock do EdgeRuntime ~400s).
 * Para cedo se ready (transcrição ≥30 ou Doc Gemini) ou unavailable definitivo.
 * Se não ficar pronto, a varredura do cron (action "sweep") continua depois.
 */
async function pollArtifactsAfterEnd(
  admin: AdminClient,
  accessToken: string,
  bookingId: string,
  meetingCode: string,
  mentorId: string | null | undefined,
): Promise<void> {
  const maxAttempts = 17;
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
      await onArtifactsReady(admin, bookingId, mentorId, artifacts);
      return;
    }
    if (artifacts.status === "unavailable") return;
  }
}

const SWEEP_WINDOW_MS = 6 * 60 * 60 * 1000;
const SWEEP_GIVE_UP_MS = 5 * 60 * 60 * 1000;
const SWEEP_GRACE_MS = 2 * 60 * 1000;

type SweepBooking = {
  id: string;
  mentor_id: string | null;
  zoom_join_url: string | null;
  meeting_space_name: string | null;
  meeting_host_id: string | null;
  meeting_ended_at: string | null;
  scheduled_date: string;
  end_time: string | null;
  meeting_transcript_text: string | null;
};

/** Horários da agenda são de Brasília (UTC-3, sem horário de verão). */
function bookingEndMs(b: SweepBooking): number {
  const scheduledEnd = Date.parse(`${b.scheduled_date}T${(b.end_time || "23:59:00").slice(0, 8)}-03:00`);
  const endedAt = b.meeting_ended_at ? Date.parse(b.meeting_ended_at) : NaN;
  return Number.isNaN(endedAt) ? scheduledEnd : Math.min(endedAt, scheduledEnd);
}

function meetingCodeOf(b: { meeting_space_name?: string | null; zoom_join_url?: string | null }): string {
  return (
    (typeof b.meeting_space_name === "string" && b.meeting_space_name) ||
    (b.zoom_join_url || "").replace(/^https?:\/\/meet\.google\.com\//, "").split("?")[0] ||
    ""
  );
}

async function isValidSweepSecret(admin: AdminClient, req: Request): Promise<boolean> {
  const provided = (req.headers.get("x-sweep-secret") || "").trim();
  if (!provided) return false;
  const { data } = await admin.from("system_config").select("value").eq("key", "meeting_sweep_secret").maybeSingle();
  const expected = String(data?.value || "").trim();
  return expected.length >= 32 && timingSafeEqual(provided, expected);
}

/**
 * Cron: busca transcrição de sessões Meet que já terminaram, mesmo sem o mentor clicar em Encerrar.
 */
async function sweepEndedMeetings(admin: AdminClient): Promise<{ checked: number; ready: number; errors: number }> {
  const now = Date.now();
  const spToday = new Date(now - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const spYesterday = new Date(now - 27 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data, error } = await admin
    .from("bookings")
    .select("id, mentor_id, zoom_join_url, meeting_space_name, meeting_host_id, meeting_ended_at, scheduled_date, end_time, meeting_transcript_text")
    .eq("meeting_provider", "meet")
    .in("scheduled_date", [spYesterday, spToday])
    .neq("status", "cancelled")
    .or("meeting_artifacts_status.is.null,meeting_artifacts_status.neq.ready")
    .limit(50);
  if (error) throw new Error("Falha ao listar sessões: " + error.message);

  const due = ((data || []) as SweepBooking[]).filter((b) => {
    if (String(b.meeting_transcript_text || "").trim().length >= 30) return false;
    if (!meetingCodeOf(b)) return false;
    const elapsed = now - bookingEndMs(b);
    return elapsed >= SWEEP_GRACE_MS && elapsed <= SWEEP_WINDOW_MS;
  });

  const tokens = new Map<string, Awaited<ReturnType<typeof resolveHostAccessToken>>>();
  let ready = 0;
  let errors = 0;
  for (const b of due) {
    const hostKey = b.meeting_host_id || "active";
    if (!tokens.has(hostKey)) tokens.set(hostKey, await resolveHostAccessToken(admin, b.meeting_host_id));
    const hostTok = tokens.get(hostKey)!;
    if ("error" in hostTok) {
      errors++;
      console.warn("[meeting-control] sweep host", b.id, hostTok.error);
      continue;
    }

    try {
      const artifacts = await fetchMeetArtifacts(hostTok.accessToken, meetingCodeOf(b));
      const givingUp = artifacts.status === "pending" && now - bookingEndMs(b) >= SWEEP_GIVE_UP_MS;
      await persistArtifacts(
        admin,
        b.id,
        givingUp
          ? { ...artifacts, status: "unavailable", message: "O Google não gerou transcrição desta call. Cole o resumo no relatório." }
          : artifacts,
      );
      const hasTranscript = !!(artifacts.transcript && artifacts.transcript.trim().length >= 30);
      if (artifacts.status === "ready" && (hasTranscript || artifacts.smart_notes_url)) {
        await onArtifactsReady(admin, b.id, b.mentor_id, artifacts);
        ready++;
      }
    } catch (e) {
      errors++;
      console.warn("[meeting-control] sweep", b.id, e);
    }
  }

  // Transcrição já chegou mas o resumo não foi gerado/enviado (IA ou Gmail falharam): tenta de novo.
  const { data: unsent } = await admin
    .from("bookings")
    .select("id, meeting_ended_at, scheduled_date, end_time")
    .eq("meeting_provider", "meet")
    .in("scheduled_date", [spYesterday, spToday])
    .neq("status", "cancelled")
    .eq("meeting_artifacts_status", "ready")
    .is("meeting_summary_emailed_at", null)
    .limit(20);
  for (const b of (unsent || []) as SweepBooking[]) {
    if (now - bookingEndMs(b) > SWEEP_WINDOW_MS) continue;
    await finalizeSessionSummary(admin, b.id).catch((e) => {
      errors++;
      console.warn("[meeting-control] sweep resumo", b.id, e);
    });
  }

  return { checked: due.length, ready, errors };
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
    if (req.headers.get("x-sweep-secret")) {
      const sweepAdmin = getAdminClient();
      if (!(await isValidSweepSecret(sweepAdmin, req))) return errorJson("Forbidden", 403);
      return json({ ok: true, ...(await sweepEndedMeetings(sweepAdmin)) });
    }

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
      .select("id, mentor_id, zoom_join_url, meeting_space_name, meeting_host_id, meeting_ended_at, meeting_transcript_text, meeting_artifacts_status, meeting_smart_notes_url, meeting_summary_emailed_at")
      .eq("id", bookingId)
      .single();
    if (bErr || !booking) return errorJson("Agendamento não encontrado", 404);

    const denied = await assertCanEndOrFetchArtifacts(admin, ctx, booking);
    if (denied) return denied;

    const meetingCode = meetingCodeOf(booking);
    if (!meetingCode) return errorJson("Esta sessão ainda não tem sala Meet.", 400);

    const hostTok = await resolveHostAccessToken(admin, booking.meeting_host_id);
    if ("error" in hostTok) return errorJson(hostTok.error, 400);

    if (action === "end") {
      try {
        await endActiveMeetConference(hostTok.accessToken, meetingCode);
      } catch (e) {
        // endActiveMeetConference já trata "não há call ativa" como sucesso; o resto é falha real.
        return errorJson(e instanceof Error ? e.message : String(e), 500);
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
      if (!booking.meeting_summary_emailed_at) {
        scheduleBackground(() => finalizeSessionSummary(admin, bookingId));
      }
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
      scheduleBackground(() => onArtifactsReady(admin, bookingId, booking.mentor_id, artifacts));
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
