import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ListRow, SectionCard, StatusPill } from "@/components/ds";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { sortByScheduledDateDesc } from "@/lib/bookingStatus";
import { isNpsEligibleBooking } from "@/lib/pendingNps";

type PendingNpsBooking = {
  id: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: string;
  is_retroactive: boolean | null;
  report_required: boolean | null;
  session_id: string;
  sessions: { name: string; order: number | null; is_kickoff: boolean | null } | null;
};

/**
 * Lista, no início do aluno, as sessões realizadas que ainda não têm NPS.
 * Cada linha abre a avaliação daquela sessão.
 */
export const PendingNpsCard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["pending-nps", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [] as PendingNpsBooking[];
      const [bookingsResult, answeredResult] = await Promise.all([
        supabase
          .from("bookings")
          .select(
            "id, scheduled_date, start_time, end_time, status, is_retroactive, report_required, session_id, sessions(name, order, is_kickoff)",
          )
          .eq("liberty_id", profile.id)
          .eq("status", "completed")
          .order("scheduled_date", { ascending: false }),
        supabase.from("nps_responses").select("booking_id").eq("liberty_id", profile.id),
      ]);
      if (bookingsResult.error) throw bookingsResult.error;
      if (answeredResult.error) throw answeredResult.error;

      const done = new Set((answeredResult.data ?? []).map((r) => r.booking_id).filter(Boolean) as string[]);
      const bookings = (bookingsResult.data ?? []) as unknown as PendingNpsBooking[];
      return sortByScheduledDateDesc(bookings.filter((b) => isNpsEligibleBooking(b, done)));
    },
    enabled: !!profile?.id,
  });

  const pending = data ?? [];
  if (profile?.is_active === false) return null;
  if (!pending.length) return null;

  return (
    <SectionCard as="section" padding="none" aria-labelledby="pending-nps-title">
      <div className="px-4 pt-4 pb-3 space-y-2">
        <StatusPill tone="pending">Avaliação pendente</StatusPill>
        <h3 id="pending-nps-title" className="text-[17px] font-semibold text-foreground leading-tight">
          {pending.length === 1 ? "Falta avaliar 1 sessão" : `Faltam avaliar ${pending.length} sessões`}
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Cada sessão pede a sua nota. Toque na que você vai avaliar. Leva menos de 2 minutos.
        </p>
      </div>
      {pending.map((booking, index) => {
        const dateLabel = booking.scheduled_date
          ? format(parseISO(booking.scheduled_date), "dd 'de' MMMM", { locale: ptBR })
          : "Data não informada";
        return (
          <ListRow
            key={booking.id}
            onPress={() => navigate(`/nps/${booking.id}`)}
            last={index === pending.length - 1}
            title={booking.sessions?.name || "Sessão"}
            subtitle={dateLabel}
            trailing={<StatusPill tone="pending" withDot={false}>Sem avaliação</StatusPill>}
          />
        );
      })}
    </SectionCard>
  );
};
