import { motion } from "framer-motion";
import { Users, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { shortName, initials } from "@/lib/formatName";
import { fadeUpItem } from "@/lib/animations";

export interface ActiveStudent {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  tier?: string | null;
  completedCount: number;
  nextDate?: string | null;
}

interface Props {
  students: ActiveStudent[];
}

export const MentorActiveStudents = ({ students }: Props) => {
  const navigate = useNavigate();

  return (
    <motion.div variants={fadeUpItem}>
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 text-primary text-[10px] font-semibold uppercase tracking-wider">
            <Users className="h-3.5 w-3.5" /> Meus alunos ativos
          </div>
          <h2 className="text-lg font-semibold text-foreground">Acompanhamento da jornada</h2>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {students.length} {students.length === 1 ? "aluno" : "alunos"}
        </span>
      </div>

      {students.length === 0 ? (
        <div className="glass-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Você ainda não conduziu sessões. Quando o admin agendar, seus alunos aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {students.map((s) => {
            const total = 12;
            const pct = Math.min(100, Math.round((s.completedCount / total) * 100));
            const isDone = s.completedCount >= total;
            return (
              <button
                key={s.id}
                onClick={() => navigate(`/mentor/alunos/${s.id}`)}
                className="glass-card p-4 text-left hover:border-primary/40 hover:shadow-lg transition-all group"
              >
                <div className="flex items-center gap-3 mb-3">
                  {s.avatar_url ? (
                    <img src={s.avatar_url} alt={s.full_name} className="h-10 w-10 rounded-full object-cover border border-border shrink-0" />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold border border-border shrink-0">
                      {initials(s.full_name)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {shortName(s.full_name)}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {s.tier && (
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                          {s.tier}
                        </span>
                      )}
                      {s.nextDate && (
                        <span className="text-[10px] text-muted-foreground">
                          próx. {s.nextDate}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </div>
                <div className="flex items-center justify-between text-[10px] mb-1.5">
                  <span className="text-muted-foreground uppercase tracking-wider">Jornada</span>
                  <span className={`font-semibold tabular-nums ${isDone ? "text-status-green" : "text-foreground"}`}>
                    {s.completedCount}/{total}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className={`h-full transition-all ${isDone ? "bg-status-green" : "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};
