import { Link } from "react-router-dom";
import { ArrowRight, CalendarCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BEGIN_JOURNEY_SESSIONS } from "@/lib/sessionProgress";
import { Button } from "@/components/ui/button";
import { SectionCard, Stat, StatusPill } from "@/components/ds";

interface Props {
  scheduledCount: number;
  completedCount: number;
  availabilityCount: number;
}

/**
 * Aviso de urgência exibido quando o aluno tem 0 ou 1 sessões agendadas
 * e ainda não completou as 12 da jornada. Card plano (tom warning), sem animação contínua.
 */
export const UrgencyBookingCard = ({ scheduledCount, completedCount, availabilityCount }: Props) => {
  const { profile } = useAuth();
  if (profile?.is_active === false) return null;
  if (completedCount >= BEGIN_JOURNEY_SESSIONS) return null;
  if (scheduledCount >= 2) return null;

  const headline =
    scheduledCount === 0
      ? "Você ainda não tem nenhuma sessão agendada"
      : "Você só tem 1 sessão agendada";

  const subtext =
    availabilityCount > 0
      ? `Restam ${availabilityCount} ${
          availabilityCount === 1 ? "dia disponível" : "dias disponíveis"
        } nas próximas 3 semanas.`
      : "Reserve seu próximo encontro de mentoria para manter o ritmo da jornada.";

  return (
    <SectionCard as="section" aria-labelledby="urgency-booking-title">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 md:gap-6 md:items-center">
        <div className="space-y-3 min-w-0">
          <StatusPill tone="warning">
            Agendamento pendente
          </StatusPill>
          <h3 id="urgency-booking-title" className="text-[17px] font-semibold text-foreground leading-tight">
            {headline}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">{subtext}</p>
          <div className="pt-1">
            <Button asChild className="w-full sm:w-auto">
              <Link to="/agenda/overview">
                Agendar sessão
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>

        {availabilityCount > 0 && (
          <Stat
            icon={CalendarCheck}
            label={availabilityCount === 1 ? "Dia livre" : "Dias livres"}
            value={availabilityCount}
            hint="nas próximas 3 semanas"
            className="md:min-w-[140px]"
          />
        )}
      </div>
    </SectionCard>
  );
};
