import { motion } from "framer-motion";
import { AlertCircle, MessageCircle, ChevronRight, Clock, CheckCircle2, PauseCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { shortName } from "@/lib/formatName";
import { fadeUpItem } from "@/lib/animations";

export type FollowUpReason = "no_session_30d" | "tasks_overdue" | "awaiting_validation";

export interface FollowUpItem {
  studentId: string;
  studentName: string;
  phone?: string | null;
  reason: FollowUpReason;
  detail: string;
  urgency: number; // higher = more urgent
}

const reasonMeta: Record<FollowUpReason, { icon: any; label: string; tone: string }> = {
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
    <motion.div variants={fadeUpItem}>
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 text-status-yellow text-[10px] font-semibold uppercase tracking-wider">
            <AlertCircle className="h-3.5 w-3.5" /> Follow-up
          </div>
          <h2 className="text-lg font-semibold text-foreground">Alunos precisando de atenção</h2>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {sorted.length} {sorted.length === 1 ? "alerta" : "alertas"}
        </span>
      </div>

      <div className="rounded-2xl border border-status-yellow/20 bg-gradient-to-br from-status-yellow/5 to-card overflow-hidden">
        {sorted.map((it, idx) => {
          const meta = reasonMeta[it.reason];
          const Icon = meta.icon;
          const phone = cleanPhone(it.phone);
          return (
            <div
              key={`${it.studentId}-${it.reason}-${idx}`}
              className={`flex items-center justify-between gap-3 px-4 py-3 ${idx > 0 ? "border-t border-border/40" : ""}`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Icon className={`h-4 w-4 shrink-0 ${meta.tone}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{shortName(it.studentName)}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {meta.label} · {it.detail}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {phone && (
                  <a
                    href={`https://wa.me/${phone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-status-green/10 border border-border text-status-green text-[10px] font-semibold hover:bg-status-green/15 transition-colors"
                  >
                    <MessageCircle className="h-3 w-3" /> WhatsApp
                  </a>
                )}
                <button
                  onClick={() => navigate(`/mentor/alunos/${it.studentId}`)}
                  className="flex items-center gap-0.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5"
                >
                  Perfil <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};
