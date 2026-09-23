import { countsTowardKickoffLimit, getEffectiveBookingStatus, isVisibleSessionBooking } from "@/lib/bookingStatus";

type SessionLike = {
  id: string;
  order?: number | null;
};

type BookingLike = {
  session_id: string;
  status?: string | null;
  scheduled_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  is_retroactive?: boolean | null;
  report_required?: boolean | null;
};

/**
 * - `completed`            → realizada (fechada pelo mentor/admin)
 * - `pending_confirmation` → passou do horário, mentor ainda não confirmou (ocupa a vaga, não conta como realizada)
 * - `scheduled`            → agendada (futuro)
 * - `available`            → vaga livre
 */
export type SessionProgressStatus = "completed" | "pending_confirmation" | "scheduled" | "available";

export const BEGIN_JOURNEY_SESSIONS = 12;

export const isJourneySession = (session: SessionLike) => (session.order ?? 1) > 0;

export const getJourneySessions = <T extends SessionLike>(sessions: T[]) => sessions.filter(isJourneySession);

export const buildSessionProgress = <TSession extends SessionLike, TBooking extends BookingLike>(
  sessions: TSession[],
  bookings: TBooking[]
) => {
  const journeySessions = getJourneySessions(sessions)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .slice(0, BEGIN_JOURNEY_SESSIONS);
  const journeySessionIds = new Set(journeySessions.map((session) => session.id));
  const statusMap = new Map<string, { status: SessionProgressStatus; booking?: TBooking }>();

  bookings.filter(isVisibleSessionBooking).forEach((booking) => {
    if (!journeySessionIds.has(booking.session_id)) return;

    const status = getEffectiveBookingStatus(booking);
    const current = statusMap.get(booking.session_id);

    // Prioridade por sessão: realizada > a confirmar > agendada
    if (status === "completed" || status === "awaiting_report") {
      statusMap.set(booking.session_id, { status: "completed", booking });
    } else if (status === "pending_confirmation" && current?.status !== "completed") {
      statusMap.set(booking.session_id, { status: "pending_confirmation", booking });
    } else if (status === "scheduled" && !current) {
      statusMap.set(booking.session_id, { status: "scheduled", booking });
    }
  });

  const countStatus = (target: SessionProgressStatus) =>
    journeySessions.filter((session) => statusMap.get(session.id)?.status === target).length;

  const completedCount = countStatus("completed");
  const pendingConfirmationCount = countStatus("pending_confirmation");
  const scheduledCount = countStatus("scheduled");
  const totalSessions = BEGIN_JOURNEY_SESSIONS;
  /** Vagas ocupadas (realizadas + a confirmar + agendadas). */
  const usedCount = completedCount + pendingConfirmationCount + scheduledCount;
  const availableCount = Math.max(totalSessions - usedCount, 0);

  return {
    journeySessions,
    journeySessionIds,
    statusMap,
    completedCount,
    pendingConfirmationCount,
    scheduledCount,
    usedCount,
    availableCount,
    totalSessions,
  };
};

/**
 * Regra do Mapeamento do Negócio (kickoff): só pode ser agendado enquanto o membro tiver
 * até 3 sessões realizadas (ou já ocorridas e ainda não confirmadas). Mesmo critério do banco.
 */
export const KICKOFF_MAX_REALIZED_SESSIONS = 3;

export const KICKOFF_NOT_ALLOWED_MESSAGE =
  "O Mapeamento do Negócio só pode ser agendado até a 3ª sessão realizada. Este membro já passou desse ponto.";

export const canScheduleKickoff = <TSession extends SessionLike, TBooking extends BookingLike>(
  sessions: TSession[],
  bookings: TBooking[],
) => {
  const journeyIds = new Set(getJourneySessions(sessions).map((s) => s.id));
  const realized = bookings.filter((b) => journeyIds.has(b.session_id) && countsTowardKickoffLimit(b)).length;
  return realized <= KICKOFF_MAX_REALIZED_SESSIONS;
};