import { motion } from "framer-motion";
import { MessageCircle, Clock, CheckCircle2, PauseCircle, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { shortName } from "@/lib/formatName";
import { fadeUpItem } from "@/lib/animations";
import { Button } from "@/components/ui/button";
import { ListRow, SectionCard, SectionHeader } from "@/components/ds";
import { cn } from "@/lib/utils";

export type FollowUpReason = "no_session_30d" | "tasks_overdue" | "awaiting_validation";

export interface FollowUpItem {
  studentId: string;
  studentName: string;
  phone?: string | null;
  reason: FollowUpReason;
  detail: string;
  urgency: number; // higher = more urgent
}

const reasonMeta: Record<FollowUpReason, { icon: LucideIcon; label: string; tone: string }> = {
  no_session_30d:      { icon: PauseCircle,   label: "Sem sessão há mais de 30 dias", tone: "text-status-yellow" },
  tasks_overdue:       { icon: Clock,         label: "Tarefas atrasadas",             tone: "text-status-yellow" },
  awaiting_validation: { icon: CheckCircle2,  label: "Aguardando sua validação",       tone: "text-status-blue" },
};

const cleanPhone = (p?: string | null) => (p ? p.replace(/\D/g, "") : "");

interface Props {
  items: FollowUpItem[];
}

export const MentorFollowUp = ({ items }: Props) => {
  const navigate = useNavigate();
  if (items.length === 0) return null;

  const sorted = [...items].sort((a, b) => b.urgency - a.urgency);

  return (
    <motion.section variants={fadeUpItem} className="space-y-3">
      <SectionHeader
        title="Alunos que precisam de atenção"
        description="Acompanhamento sugerido"
        actions={<span className="text-xs text-muted-foreground tabular-nums">{sorted.length} {sorted.length === 1 ? "alerta" : "alertas"}</span>}
      />

      <SectionCard padding="none" tone="warning">
        {sorted.map((it, idx) => {
          const meta = reasonMeta[it.reason];
          const Icon = meta.icon;
          const phone = cleanPhone(it.phone);
          return (
            <ListRow
              key={`${it.studentId}-${it.reason}-${idx}`}
              last={idx === sorted.length - 1}
              leading={
                <span className="h-10 w-10 rounded-[var(--ds-radius-md)] bg-card flex items-center justify-center">
                  <Icon className={cn("h-4 w-4", meta.tone)} aria-hidden />
                </span>
              }
              title={shortName(it.studentName)}
              subtitle={`${meta.label} · ${it.detail}`}
              chevron={false}
              trailing={
                <>
                  {phone && (
                    <Button asChild size="sm" variant="outline" className="text-status-green hover:text-status-green">
                      <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer">
                        <MessageCircle /> WhatsApp
                      </a>
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/mentor/alunos/${it.studentId}`)}>
                    Perfil
                  </Button>
                </>
              }
            />
          );
        })}
      </SectionCard>
    </motion.section>
  );
};
