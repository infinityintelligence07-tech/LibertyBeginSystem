import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CalendarCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  scheduledCount: number;
  completedCount: number;
  availabilityCount: number;
}

/**
 * Card pulsante de urgência exibido quando o aluno tem 0 ou 1 sessões agendadas
 * e ainda não completou as 12 da jornada. Inclui glow suave + animação de pulso.
 */
export const UrgencyBookingCard = ({ scheduledCount, completedCount, availabilityCount }: Props) => {
  const { profile } = useAuth();
  if (profile?.is_active === false) return null;
  if (completedCount >= 12) return null;
  if (scheduledCount >= 2) return null;

  const headline =
    scheduledCount === 0
      ? "Você ainda não tem nenhuma sessão agendada"
      : "Você só tem 1 sessão agendada este mês";

  const subtext =
    availabilityCount > 0
      ? `Os horários estão se esgotando. Restam ${availabilityCount} ${
          availabilityCount === 1 ? "dia disponível" : "dias disponíveis"
        } nas próximas 3 semanas. Garanta o seu antes que acabem.`
      : "Reserve seu próximo encontro de mentoria agora para não perder o ritmo da jornada.";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Link
        to="/agenda/overview"
        className="group relative block overflow-hidden rounded-2xl border border-status-yellow/40 bg-gradient-to-br from-status-yellow/15 via-card to-status-yellow/5 p-6 md:p-7"
      >
        {/* Pulsing glow */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-status-yellow/25 blur-3xl"
          animate={{ opacity: [0.45, 0.85, 0.45], scale: [1, 1.08, 1] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -left-12 h-56 w-56 rounded-full bg-status-yellow/15 blur-3xl"
          animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.05, 1] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
        />

        <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5 items-center">
          <div className="space-y-3">
            <motion.div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-status-yellow/20 border border-status-yellow/30 text-status-yellow text-[11px] font-semibold uppercase tracking-wider"
              animate={{ opacity: [0.85, 1, 0.85] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Vagas se esgotando
            </motion.div>
            <h3 className="text-xl md:text-2xl font-semibold text-foreground leading-tight">
              {headline}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">{subtext}</p>
            <div className="pt-1">
              <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-foreground text-background text-sm font-semibold group-hover:gap-3 transition-all shadow-lg">
                Agendar agora
                <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </div>

          {availabilityCount > 0 && (
            <div className="hidden md:flex flex-col items-center justify-center p-4 rounded-xl bg-background/50 backdrop-blur-sm border border-status-yellow/20 min-w-[140px]">
              <CalendarCheck className="h-7 w-7 text-status-yellow mb-2" />
              <span className="text-4xl font-light text-foreground tabular-nums leading-none">
                {availabilityCount}
              </span>
              <span className="text-[10px] text-muted-foreground mt-1.5 uppercase tracking-wider text-center">
                {availabilityCount === 1 ? "dia livre" : "dias livres"}
              </span>
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
};
