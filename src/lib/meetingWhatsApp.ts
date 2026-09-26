import { supabase } from "@/integrations/supabase/client";

/** Helpers para lembretes WhatsApp de sessão (Meet). */

export const APP_ORIGIN_DEFAULT = "https://begin.libertymentoria.com.br";

export function digitsPhone(phone?: string | null): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length >= 10 && d.length <= 11) return `55${d}`;
  return d;
}

export function whatsappHref(phone: string | null | undefined, text: string): string | null {
  const digits = digitsPhone(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

function ymdInSaoPaulo(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** HOJE / AMANHÃ / dia da semana em maiúsculas. */
export function relativeSessionDayLabel(dateYmd: string, now = new Date()): string {
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

function formatBrDateShort(dateYmd: string): string {
  const [, m, d] = dateYmd.split("-");
  return `${d}/${m}`;
}

function formatBrTimeH(time: string): string {
  return `${time.slice(0, 5)}H`;
}

function sessionPhrase(sessionName: string): string {
  const n = sessionName.trim() || "Mentoria";
  if (/^sess[aã]o\b/i.test(n)) return n;
  return `Sessão de ${n}`;
}

export type MeetingWaCopyInput = {
  bookingId: string;
  memberName: string;
  mentorName: string;
  sessionName: string;
  date: string;
  start: string;
  meetUrl: string;
  appOrigin?: string;
};

/**
 * Copy operacional Liberty Begin.
 * Aluno: lembrete + Meet (sem NPS).
 * Mentor: mesma base + bloco pedindo para lembrar o aluno do NPS da plataforma.
 */
export function buildMeetingWhatsAppTexts(opts: MeetingWaCopyInput): { member: string; mentor: string } {
  const origin = (opts.appOrigin || APP_ORIGIN_DEFAULT).replace(/\/$/, "");
  const day = relativeSessionDayLabel(opts.date);
  const dateShort = formatBrDateShort(opts.date);
  const timeH = formatBrTimeH(opts.start);
  const session = sessionPhrase(opts.sessionName);
  const meetUrl = opts.meetUrl.trim();
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
    ? [`Ingressar na reunião Meet`, meetUrl].join("\n")
    : "O link da reunião Meet será enviado em breve.";

  const npsBlock = [
    `🚨 Lembrete`,
    `Confira com o Liberty Begin se abriu corretamente o link para a pesquisa de NPS 🙏🏼😊`,
    `Link para a pesquisa 👇🏼👇🏼`,
    ``,
    `📝 Clique aqui para avaliar a sessão: ${npsUrl}`,
  ].join("\n");

  const member = [headline, ``, memberSessionLine, ``, meetBlock].join("\n");
  const mentor = [headline, ``, mentorSessionLine, ``, meetBlock, ``, npsBlock].join("\n");

  return { member, mentor };
}

/** Mensagem curta a partir do erro bruto salvo em meeting_provision_error. */
export function friendlyMeetError(raw: string): string {
  if (!raw) return "Erro desconhecido ao criar Meet.";
  if (/Calendar API has not been used|SERVICE_DISABLED|accessNotConfigured|calendar-json\.googleapis\.com/i.test(raw)) {
    return (
      "A API Google Calendar está desativada no projeto do Google Cloud.\n\n" +
      "1. Abra: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=430819812839\n" +
      "2. Clique em Ativar / Enable\n" +
      "3. Espere 1–2 minutos e clique em Criar sala Meet"
    );
  }
  if (/Meet API has not been used|meet\.googleapis\.com|configurar acesso do Meet/i.test(raw)) {
    return (
      "A API Google Meet está desativada — por isso o convidado fica “aguardando admissão”.\n\n" +
      "1. Abra: https://console.cloud.google.com/apis/library/meet.googleapis.com?project=430819812839\n" +
      "2. Clique em Ativar / Enable\n" +
      "3. Espere 1–2 minutos\n" +
      "4. Na sessão, clique em Criar sala Meet de novo"
    );
  }
  if (/invalid_grant|Token has been expired or revoked/i.test(raw)) {
    return "Token Google da conta host expirou. Entre como membrosliberty@gmail.com e reconecte o Google Agenda.";
  }
  if (/insufficientPermissions|Insufficient Permission/i.test(raw)) {
    return "A conta host não tem permissão de Calendar/Meet. Reconecte o Google Agenda aceitando todos os escopos.";
  }
  if (raw.startsWith("A API Google Calendar") || raw.startsWith("Token Google") || raw.startsWith("Falha ao criar Meet")) {
    return raw;
  }
  if (raw.length > 320 || raw.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw.replace(/^Calendar\/Meet falhou:\s*/i, ""));
      const msg = parsed?.error?.message || parsed?.message;
      if (msg) return friendlyMeetError(String(msg));
    } catch {
      /* noop */
    }
    return "Não foi possível criar a sala Meet. Tente de novo ou verifique a conexão Google da conta host.";
  }
  return raw;
}

export type ProvisionMeetingResult = {
  ok?: boolean;
  meet_url?: string;
  error?: string;
  message?: string;
  reused?: boolean;
  skipped?: boolean;
  access_warning?: string | null;
};

function extractInvokeError(data: unknown, error: { message?: string; context?: Response } | null): string {
  if (data && typeof data === "object") {
    const d = data as { error?: unknown; message?: unknown };
    if (typeof d.error === "string" && d.error.trim()) return d.error;
    if (typeof d.message === "string" && d.message.trim()) return d.message;
  }
  const generic = error?.message || "Falha ao criar sala Meet";
  if (/non-2xx|Edge Function/i.test(generic)) {
    return "Não foi possível criar a sala Meet. Abra a sessão e veja o detalhe em “Falha ao criar Meet”, ou tente de novo.";
  }
  return generic;
}

/** Dispara provision-meeting. */
export async function invokeProvisionMeeting(
  bookingId: string,
  opts?: { force?: boolean },
): Promise<ProvisionMeetingResult> {
  const { data, error } = await supabase.functions.invoke("provision-meeting", {
    body: { booking_id: bookingId, force: opts?.force === true },
  });

  if (error) {
    console.warn("provision-meeting", error, data);
    let fromCtx: string | null = null;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.clone().json();
        if (body?.error && typeof body.error === "string") fromCtx = body.error;
      }
    } catch {
      /* noop */
    }
    return { ok: false, error: fromCtx || extractInvokeError(data, error) };
  }

  const result = (data || {}) as ProvisionMeetingResult;
  if (result.error && result.ok === false) return result;
  if (result.error && !result.ok && !result.meet_url) {
    return { ok: false, error: result.error, message: result.message };
  }
  return result;
}

export type EndMeetingResult = {
  ok?: boolean;
  ended?: boolean;
  error?: string;
  message?: string;
};

/** Encerra a call Meet para todos (via conta host) — uso do mentor/admin. */
export async function invokeEndMeeting(bookingId: string): Promise<EndMeetingResult> {
  const { data, error } = await supabase.functions.invoke("provision-meeting", {
    body: { booking_id: bookingId, action: "end" },
  });

  if (error) {
    console.warn("end-meeting", error, data);
    let fromCtx: string | null = null;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.clone().json();
        if (body?.error && typeof body.error === "string") fromCtx = body.error;
      }
    } catch {
      /* noop */
    }
    return { ok: false, error: fromCtx || extractInvokeError(data, error) };
  }

  const result = (data || {}) as EndMeetingResult;
  if (result.error && !result.ended) return { ok: false, error: result.error, message: result.message };
  return { ok: true, ended: true, message: result.message };
}
