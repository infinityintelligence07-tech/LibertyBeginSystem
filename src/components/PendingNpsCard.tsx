import { Link } from "react-router-dom";
import { ClipboardCheck, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { SectionCard, Stat, StatusPill } from "@/components/ds";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { isRealizedSessionBooking, sortByScheduledDateDesc } from "@/lib/bookingStatus";
import { isJourneySession } from "@/lib/sessionProgress";

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
 * Card destacado no topo do painel do aluno quando existem sessões realizadas
 * sem pesquisa de satisfação respondida. Leva direto ao formulário do NPS.
 *
 * Regra: só sessões REALIZADAS (status efetivo `completed`/`awaiting_report`),
 * da jornada (order > 0, sem Onboarding) e não retroativas. Sessões "A confirmar"
 * (passaram do horário sem fechamento do mentor) não pedem NPS.
 */
export const PendingNpsCard = () => {
  const { profile } = useAuth();

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
          // Só o mentor/admin fecham a sessão como realizada (status bruto `completed`).
          // Sessões que apenas passaram do horário ficam "A confirmar" e não pedem NPS.
          .eq("status", "completed")
          .order("scheduled_date", { ascending: false }),
        supabase.from("nps_responses").select("booking_id").eq("liberty_id", profile.id),
      ]);
      if (bookingsResult.error) throw bookingsResult.error;
      if (answeredResult.error) throw answeredResult.error;

      const done = new Set((answeredResult.data ?? []).map((r) => r.booking_id).filter(Boolean));
      const bookings = (bookingsResult.data ?? []) as unknown as PendingNpsBooking[];
      const pending = bookings.filter(
        (b) =>
          !done.has(b.id) &&
          isRealizedSessionBooking(b) &&
          isJourneySession({ id: b.session_id, order: b.sessions?.order }) &&
          !b.is_retroactive,
      );
      return sortByScheduledDateDesc(pending);
    },
    enabled: !!profile?.id,
  });

  const pending = data ?? [];
  if (profile?.is_active === false) return null;
  if (!pending.length) return null;

  const next = pending[0];
  const sessionName = next.sessions?.name;
  const dateLabel = next?.scheduled_date
    ? format(parseISO(next.scheduled_date), "dd 'de' MMMM", { locale: ptBR })
    : null;

  return (
    <SectionCard as="section" aria-labelledby="pending-nps-title">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 md:gap-6 md:items-center">
        <div className="space-y-3 min-w-0">
          <StatusPill tone="pending">
            Avaliação pendente
          </StatusPill>
          <h3 id="pending-nps-title" className="text-[17px] font-semibold text-foreground leading-tight">
            {pending.length > 1
              ? `Você tem ${pending.length} sessões para avaliar`
              : "Falta você avaliar sua última sessão"}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
            {sessionName ? `“${sessionName}”` : "Sua sessão"}
            {dateLabel ? ` · ${dateLabel}` : ""}. Sua opinião nos ajuda a melhorar a mentoria. Leva menos de 2 minutos.
          </p>
          <div className="pt-1">
            <Button asChild className="w-full sm:w-auto">
              <Link to={`/nps/${next.id}`}>
                Responder avaliação
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>

        <Stat
          icon={ClipboardCheck}
          label={pending.length === 1 ? "Avaliação pendente" : "Avaliações pendentes"}
          value={pending.length}
          className="md:min-w-[140px]"
        />
      </div>
    </SectionCard>
  );
};
