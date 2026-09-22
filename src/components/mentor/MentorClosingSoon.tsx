import { motion } from "framer-motion";
import { Flag, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { shortName } from "@/lib/formatName";
import { fadeUpItem } from "@/lib/animations";

export interface ClosingStudent {
  id: string;
  full_name: string;
  daysLeft: number;
  endDateLabel: string;
}

interface Props {
  students: ClosingStudent[];
}

export const MentorClosingSoon = ({ students }: Props) => {
  const navigate = useNavigate();
  if (students.length === 0) return null;

  return (
    <motion.div variants={fadeUpItem}>
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 text-primary text-[10px] font-semibold uppercase tracking-wider">
            <Flag className="h-3.5 w-3.5" /> Encerramentos
          </div>
          <h2 className="text-lg font-semibold text-foreground">Jornadas terminando em breve</h2>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          próximos 30 dias
        </span>
      </div>

      <div className="rounded-2xl border border-border bg-card/70 overflow-hidden">
        {students.map((s, idx) => (
          <button
            key={s.id}
            onClick={() => navigate(`/mentor/alunos/${s.id}`)}
            className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors ${idx > 0 ? "border-t border-border/40" : ""}`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{shortName(s.full_name)}</p>
              <p className="text-[11px] text-muted-foreground">
                Encerra em {s.endDateLabel}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded-full border ${s.daysLeft <= 7 ? "border-status-yellow/30 bg-status-yellow/5 text-status-yellow" : "border-border text-muted-foreground"}`}>
                {s.daysLeft <= 0 ? "hoje" : s.daysLeft === 1 ? "amanhã" : `${s.daysLeft} dias`}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
};
