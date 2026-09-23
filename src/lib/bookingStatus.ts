/**
 * Status efetivo de um agendamento (regra única da plataforma).
 *
 * - `scheduled`            → agendada, ainda vai acontecer
 * - `pending_confirmation` → já passou do horário, mas o mentor ainda NÃO fechou (nem relatório, nem "realizada",
 *                            nem "não realizada"). NÃO conta como realizada, NÃO entra em repasse. Aparece como "A confirmar".
 * - `awaiting_report`      → mentor marcou como realizada (status bruto `completed`) mas ainda não salvou o relatório.
 *                            Conta como realizada.
 * - `completed`            → realizada (com relatório, ou sem exigir relatório: mapeamento/retroativa)
 * - `cancelled` / `not_realized` / `pending_approval` → status bruto do banco
 */
export type EffectiveBookingStatus =
  | "scheduled"
  | "completed"
  | "cancelled"
  | "rescheduled"
  | "pending_approval"
  | "not_realized"
  | "awaiting_report"
  | "pending_confirmation"
  | string;

/** Prazo (em dias) para o mentor confirmar uma sessão que já passou. Depois disso o admin é alertado. */
export const PENDING_CONFIRMATION_ALERT_DAYS = 7;
/** Prazo (em horas) sugerido para o mentor fechar a sessão após o horário. */
export const MENTOR_CONFIRMATION_WINDOW_HOURS = 48;

type BookingTiming = {
  status?: string | null;
  scheduled_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  /** Registro histórico lançado pelo admin: conta como realizada sem exigir relatório. */
  is_retroactive?: boolean | null;
  /** Sessões de mapeamento (kickoff) não exigem relatório do mentor. */
  report_required?: boolean | null;
};

const requiresReport = (booking: BookingTiming) =>
  !booking.is_retroactive && booking.report_required !== false;

/** Sessões de mapeamento (3h) e registros retroativos não exigem relatório do mentor. */
export const bookingRequiresReport = (booking: BookingTiming) => requiresReport(booking);


/** Fuso oficial da plataforma: datas/horários das sessões são gravados como "hora de parede" de São Paulo. */
export const PLATFORM_TIME_ZONE = "America/Sao_Paulo";

const tzFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PLATFORM_TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Diferença (ms) entre a hora de parede em São Paulo e o UTC, no instante informado. */
const platformOffsetMs = (utcMs: number) => {
  const parts = tzFormatter.formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const hour = get("hour") % 24; // Intl pode devolver "24" à meia-noite
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return asUtc - utcMs;
};

/**
 * Converte `YYYY-MM-DD` + `HH:MM[:SS]` (hora de São Paulo) em `Date` absoluto.
 * Evita depender do fuso do navegador do usuário (mentor/admin fora do Brasil, celular com fuso errado).
 */
export const parsePlatformDateTime = (date?: string | null, time?: string | null) => {
  if (!date) return null;
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const [hh = 23, mm = 59, ss = 59] = (time || "23:59:59").slice(0, 8).split(":").map(Number);
  if ([y, m, d, hh, mm, ss].some((n) => Number.isNaN(n))) return null;
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  const parsed = new Date(guess - platformOffsetMs(guess));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseBookingDateTime = parsePlatformDateTime;

/** Data de hoje (`YYYY-MM-DD`) no fuso da plataforma. */
export const todayPlatformDate = (now = new Date()) => {
  const parts = tzFormatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};

export const getBookingEndDate = (booking: BookingTiming) =>
  parseBookingDateTime(booking.scheduled_date, booking.end_time || booking.start_time);

export const isBookingPast = (booking: BookingTiming, now = new Date()) => {
  const endDate = getBookingEndDate(booking);
  return endDate ? endDate.getTime() <= now.getTime() : false;
};

export const getEffectiveBookingStatus = (
  booking: BookingTiming,
  options: { hasReport?: boolean; now?: Date } = {},
): EffectiveBookingStatus => {
  const now = options.now ?? new Date();
  const rawStatus = booking.status || "scheduled";
  if (rawStatus === "cancelled") return "cancelled";
  if (rawStatus === "not_realized") return "not_realized";
  if (rawStatus === "completed") {
    // Registro histórico do admin e sessões de mapeamento não exigem relatório.
    if (!requiresReport(booking)) return "completed";
    // Sessão marcada como concluída mas sem relatório salvo → aguardando relatório
    if (options.hasReport === false) return "awaiting_report";
    return "completed";
  }
  if (rawStatus === "pending_approval") return "pending_approval";
  // scheduled / rescheduled: se já passou e o mentor não fechou, fica "A confirmar".
  // Nunca vira "realizada" sozinha: uma sessão cancelada fora da plataforma não pode contar (nem ser paga).
  if ((rawStatus === "scheduled" || rawStatus === "rescheduled") && isBookingPast(booking, now)) {
    return "pending_confirmation";
  }

  if (rawStatus === "rescheduled") return "scheduled";
  return rawStatus;
};

export const isVisibleSessionBooking = (booking: BookingTiming) => {
  const s = getEffectiveBookingStatus(booking);
  return s !== "cancelled" && s !== "not_realized";
};

export const isCompletedSessionBooking = (booking: BookingTiming) =>
  getEffectiveBookingStatus(booking) === "completed";

/**
 * Regra única de "sessão realizada" em toda a plataforma:
 * o mentor (ou admin) fechou a sessão como realizada (`completed`), com ou sem relatório salvo.
 * Nunca inclui canceladas, não realizadas nem sessões que apenas passaram do horário ("A confirmar").
 */
export const isRealizedSessionBooking = (booking: BookingTiming) => {
  const s = getEffectiveBookingStatus(booking);
  return s === "completed" || s === "awaiting_report";
};

/** Sessão que já passou do horário e o mentor ainda não fechou. Ocupa a vaga na jornada, mas não conta como realizada. */
export const isPendingConfirmationBooking = (booking: BookingTiming, now = new Date()) =>
  getEffectiveBookingStatus(booking, { now }) === "pending_confirmation";

/**
 * Conta para a regra de bloqueio do Mapeamento do Negócio (só até a 3ª sessão realizada):
 * realizadas + as que passaram e ainda não foram confirmadas (presume-se que aconteceram).
 * Mesmo critério do trigger `enforce_member_booking_rules` no banco.
 */
export const countsTowardKickoffLimit = (booking: BookingTiming) => {
  const s = getEffectiveBookingStatus(booking);
  return s === "completed" || s === "awaiting_report" || s === "pending_confirmation";
};

/** Ocupa uma vaga na jornada sem estar realizada: agendada (futuro) ou a confirmar (passou, sem fechamento). */
export const isScheduledSessionBooking = (booking: BookingTiming) => {
  const s = getEffectiveBookingStatus(booking);
  return s === "scheduled" || s === "pending_confirmation";
};

// Somente sessões realmente agendadas (futuro).
export const isFutureScheduledBooking = (booking: BookingTiming) =>
  getEffectiveBookingStatus(booking) === "scheduled";

export const isAwaitingReportSessionBooking = (booking: BookingTiming, hasReport?: boolean) =>
  getEffectiveBookingStatus(booking, { hasReport }) === "awaiting_report";

/**
 * Pendência do mentor sobre uma sessão que já passou:
 * - `confirm` → ainda com status agendado: precisa dizer se aconteceu ou não (preencher relatório, marcar realizada ou não realizada)
 * - `report`  → já marcada como realizada, mas sem relatório salvo
 * - `null`    → nada pendente
 */
export type MentorPendingAction = "confirm" | "report" | null;

export const getMentorPendingAction = (
  booking: BookingTiming,
  hasReport: boolean,
  now = new Date(),
): MentorPendingAction => {
  const s = getEffectiveBookingStatus(booking, { hasReport, now });
  if (s === "pending_confirmation") return "confirm";
  if (s === "awaiting_report" && requiresReport(booking) && !hasReport) return "report";
  return null;
};

/**
 * Uma sessão está "aguardando relatório" quando já passou (data/horário no passado),
 * não foi cancelada nem marcada como não realizada, exige relatório e ainda não tem relatório enviado.
 * Cobre tanto sessões ainda com status "scheduled/rescheduled" (mentor não fechou; efetivo "A confirmar")
 * quanto "completed" sem relatório salvo. É a lista de pendências do mentor.
 */
export const isAwaitingReport = (
  booking: BookingTiming,
  hasReport: boolean,
  now = new Date(),
) => {
  if (hasReport) return false;
  if (!requiresReport(booking)) return false;

  const s = getEffectiveBookingStatus(booking, { now });
  if (s === "cancelled" || s === "not_realized" || s === "pending_approval") return false;
  return isBookingPast(booking, now);
};

/** Dias decorridos desde o fim da sessão (0 se ainda não passou). */
export const daysSinceBookingEnd = (booking: BookingTiming, now = new Date()) => {
  const end = getBookingEndDate(booking);
  if (!end) return 0;
  return Math.max(0, Math.floor((now.getTime() - end.getTime()) / 86_400_000));
};

/** "A confirmar" há mais de `PENDING_CONFIRMATION_ALERT_DAYS` dias: o admin precisa ser avisado. */
export const isPendingConfirmationOverdue = (booking: BookingTiming, now = new Date()) =>
  isPendingConfirmationBooking(booking, now) && daysSinceBookingEnd(booking, now) >= PENDING_CONFIRMATION_ALERT_DAYS;

export const sortByScheduledDateAsc = <T extends BookingTiming>(items: T[]) =>
  [...items].sort((a, b) => {
    const aDate = parseBookingDateTime(a.scheduled_date, a.start_time)?.getTime() ?? 0;
    const bDate = parseBookingDateTime(b.scheduled_date, b.start_time)?.getTime() ?? 0;
    return aDate - bDate;
  });

export const sortByScheduledDateDesc = <T extends BookingTiming>(items: T[]) =>
  [...items].sort((a, b) => {
    const aDate = parseBookingDateTime(a.scheduled_date, a.start_time)?.getTime() ?? 0;
    const bDate = parseBookingDateTime(b.scheduled_date, b.start_time)?.getTime() ?? 0;
    return bDate - aDate;
  });

export const bookingStatusConfig: Record<string, { label: string; classes: string; dot: string }> = {
  scheduled: {
    label: "Agendada",
    classes: "bg-status-blue/10 text-status-blue border-status-blue/25",
    dot: "bg-status-blue",
  },
  completed: {
    label: "Realizada",
    classes: "bg-status-green/10 text-status-green border-status-green/25",
    dot: "bg-status-green",
  },
  cancelled: {
    label: "Cancelada",
    classes: "bg-destructive/10 text-destructive border-destructive/25",
    dot: "bg-destructive",
  },
  not_realized: {
    label: "Não realizada",
    classes: "bg-status-yellow/10 text-status-yellow border-status-yellow/30",
    dot: "bg-status-yellow",
  },
  rescheduled: {
    label: "Remarcada",
    classes: "bg-status-blue/10 text-status-blue border-status-blue/25",
    dot: "bg-status-blue",
  },
  pending_approval: {
    label: "Aguardando confirmação",
    classes: "bg-status-yellow/10 text-status-yellow border-status-yellow/30",
    dot: "bg-status-yellow",
  },
  awaiting_report: {
    label: "Realizada · sem relatório",
    classes: "bg-status-green/10 text-status-green border-status-green/25",
    dot: "bg-status-green",
  },
  pending_confirmation: {
    label: "A confirmar",
    classes: "bg-status-orange/10 text-status-orange border-status-orange/30",
    dot: "bg-status-orange",
  },
};

/** Texto de apoio para o status "A confirmar" (mesma frase em todas as telas). */
export const PENDING_CONFIRMATION_HINT =
  "A sessão passou do horário e o mentor ainda não confirmou se aconteceu. Ela não conta como realizada até a confirmação.";