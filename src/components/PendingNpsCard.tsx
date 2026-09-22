import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ClipboardCheck, ArrowRight, Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Card destacado no topo do painel do aluno quando existem sessões realizadas
 * sem pesquisa de satisfação respondida. Leva direto ao formulário do NPS.
 */
export const PendingNpsCard = () => {
  const { profile } = useAuth();

  const { data } = useQuery({
    queryKey: ["pending-nps", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;
      const [{ data: bks }, { data: answered }] = await Promise.all([
        supabase
          .from("bookings")
          .select("id, scheduled_date, session_id, sessions(name)")
          .eq("liberty_id", profile.id)
          .eq("status", "completed")
          .order("scheduled_date", { ascending: false }),
        supabase.from("nps_responses").select("booking_id").eq("liberty_id", profile.id),
      ]);
      const done = new Set((answered || []).map((r: any) => r.booking_id).filter(Boolean));
      const pending = (bks || []).filter((b: any) => !done.has(b.id));
      return pending as any[];
    },
    enabled: !!profile?.id,
  });

  const pending = data || [];
  if (profile?.is_active === false) return null;
  if (!pending.length) return null;

  const next = pending[0];
  const sessionName = next?.sessions?.name as string | undefined;
  const dateLabel = next?.scheduled_date
    ? format(parseISO(next.scheduled_date), "dd 'de' MMMM", { locale: ptBR })
    : null;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <Link
        to={`/nps/${next.id}`}
        className="group relative block overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 via-card to-primary/5 p-6 md:p-7"
      >
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-primary/25 blur-3xl"
          animate={{ opacity: [0.4, 0.8, 0.4], scale: [1, 1.08, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5 items-center">
          <div className="space-y-3">
            <motion.div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/20 border border-primary/30 text-primary text-[11px] font-semibold uppercase tracking-wider"
              animate={{ opacity: [0.85, 1, 0.85] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            >
              <Star className="h-3.5 w-3.5" />
              Avaliação pendente
            </motion.div>
            <h3 className="text-xl md:text-2xl font-semibold text-foreground leading-tight">
              {pending.length > 1
                ? `Você tem ${pending.length} sessões para avaliar`
                : "Falta você avaliar sua última sessão"}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
              {sessionName ? `“${sessionName}”` : "Sua sessão"}
              {dateLabel ? ` · ${dateLabel}` : ""}. Sua opinião nos ajuda a melhorar a mentoria. Leva menos de 2 minutos.
            </p>
            <div className="pt-1">
              <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-foreground text-background text-sm font-semibold group-hover:gap-3 transition-all shadow-lg">
                Responder agora
                <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </div>

          <div className="hidden md:flex flex-col items-center justify-center p-4 rounded-xl bg-background/50 backdrop-blur-sm border border-primary/20 min-w-[140px]">
            <ClipboardCheck className="h-7 w-7 text-primary mb-2" />
            <span className="text-4xl font-light text-foreground tabular-nums leading-none">{pending.length}</span>
            <span className="text-[10px] text-muted-foreground mt-1.5 uppercase tracking-wider text-center">
              {pending.length === 1 ? "pendente" : "pendentes"}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
};
