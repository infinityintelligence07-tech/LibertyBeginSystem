import { isRealizedSessionBooking } from "@/lib/bookingStatus";
import { isJourneySession } from "@/lib/sessionProgress";

/** Sessão que o aluno ainda pode avaliar: realizada, da jornada, não retroativa, sem resposta. */
export type NpsCandidateBooking = {
  id: string;
  status?: string | null;
  scheduled_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  is_retroactive?: boolean | null;
  report_required?: boolean | null;
  session_id?: string | null;
  sessions?: { order?: number | null } | null;
};

export const isNpsEligibleBooking = (booking: NpsCandidateBooking, answeredBookingIds: Set<string>) => {
  if (answeredBookingIds.has(booking.id)) return false;
  if (booking.is_retroactive) return false;
  if (!isRealizedSessionBooking(booking)) return false;
  return isJourneySession({ id: booking.session_id || booking.id, order: booking.sessions?.order });
};
