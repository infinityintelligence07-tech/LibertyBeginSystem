import { getEffectiveBookingStatus, isVisibleSessionBooking } from "@/lib/bookingStatus";

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
};

export type SessionProgressStatus = "completed" | "scheduled" | "available";

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

    if (status === "completed" || status === "awaiting_report") {
      statusMap.set(booking.session_id, { status: "completed", booking });
    } else if (status === "scheduled" && current?.status !== "completed") {
      statusMap.set(booking.session_id, { status: "scheduled", booking });
    }
  });

  const completedCount = journeySessions.filter((session) => statusMap.get(session.id)?.status === "completed").length;
  const scheduledCount = journeySessions.filter((session) => statusMap.get(session.id)?.status === "scheduled").length;
  const totalSessions = BEGIN_JOURNEY_SESSIONS;
  const availableCount = Math.max(totalSessions - completedCount - scheduledCount, 0);

  return {
    journeySessions,
    journeySessionIds,
    statusMap,
    completedCount,
    scheduledCount,
    availableCount,
    totalSessions,
  };
};