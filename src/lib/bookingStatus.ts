export type EffectiveBookingStatus = "scheduled" | "completed" | "cancelled" | "rescheduled" | "pending_approval" | "not_realized" | "awaiting_report" | string;

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


const parseBookingDateTime = (date?: string | null, time?: string | null) => {
  if (!date) return null;
  const safeTime = (time || "23:59:59").slice(0, 8);
  const parsed = new Date(`${date}T${safeTime}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
  // scheduled / rescheduled: se já passou, vira "aguardando relatório"
  if ((rawStatus === "scheduled" || rawStatus === "rescheduled") && isBookingPast(booking, now)) {
    return requiresReport(booking) ? "awaiting_report" : "completed";
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
 * sessão concluída OU já ocorrida e apenas aguardando o relatório do mentor.
 * Nunca inclui canceladas nem não realizadas.
 */
export const isRealizedSessionBooking = (booking: BookingTiming) => {
  const s = getEffectiveBookingStatus(booking);
  return s === "completed" || s === "awaiting_report";
};

export const isScheduledSessionBooking = (booking: BookingTiming) => {
  const s = getEffectiveBookingStatus(booking);
  return s === "scheduled" || s === "awaiting_report";
};

// Somente sessões realmente agendadas (futuro), sem incluir aguardando relatório.
export const isFutureScheduledBooking = (booking: BookingTiming) =>
  getEffectiveBookingStatus(booking) === "scheduled";

export const isAwaitingReportSessionBooking = (booking: BookingTiming) =>
  getEffectiveBookingStatus(booking) === "awaiting_report";

/**
 * Uma sessão está "aguardando relatório" quando já passou (data/horário no passado),
 * não foi cancelada nem marcada como não realizada, e ainda não tem relatório enviado.
 * Cobre tanto sessões ainda com status "scheduled/rescheduled" (mentor não fechou)
 * quanto "completed" sem relatório salvo.
 */
export const isAwaitingReport = (
  booking: BookingTiming,
  hasReport: boolean,
  now = new Date(),
) => {
  if (hasReport) return false;
  if (!requiresReport(booking)) return false;

  const s = getEffectiveBookingStatus(booking);
  if (s === "cancelled" || s === "not_realized" || s === "pending_approval") return false;
  return isBookingPast(booking, now);
};

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
    classes: "bg-status-blue/12 text-status-blue border-status-blue/25",
    dot: "bg-status-blue",
  },
  completed: {
    label: "Realizada",
    classes: "bg-status-green/12 text-status-green border-status-green/25",
    dot: "bg-status-green",
  },
  cancelled: {
    label: "Cancelada",
    classes: "bg-destructive/12 text-destructive border-destructive/25",
    dot: "bg-destructive",
  },
  not_realized: {
    label: "Não realizada",
    classes: "bg-status-yellow/12 text-status-yellow border-status-yellow/30",
    dot: "bg-status-yellow",
  },
  rescheduled: {
    label: "Remarcada",
    classes: "bg-status-blue/12 text-status-blue border-status-blue/25",
    dot: "bg-status-blue",
  },
  pending_approval: {
    label: "Aguardando confirmação",
    classes: "bg-status-yellow/12 text-status-yellow border-status-yellow/30",
    dot: "bg-status-yellow",
  },
  awaiting_report: {
    label: "Aguardando relatório",
    classes: "bg-status-yellow/12 text-status-yellow border-status-yellow/30",
    dot: "bg-status-yellow",
  },
};