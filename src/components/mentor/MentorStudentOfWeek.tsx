import { motion } from "framer-motion";
import { Award } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { shortName, initials } from "@/lib/formatName";
import { fadeUpItem } from "@/lib/animations";

interface Props {
  studentId: string;
  studentName: string;
  avatarUrl?: string | null;
  tasksThisWeek: number;
}

export const MentorStudentOfWeek = ({ studentId, studentName, avatarUrl, tasksThisWeek }: Props) => {
  const navigate = useNavigate();

  return (
    <motion.div variants={fadeUpItem}>
      <button
        onClick={() => navigate(`/mentor/alunos/${studentId}`)}
        className="w-full text-left rounded-2xl border border-status-green/25 bg-gradient-to-br from-status-green/10 via-card to-card p-5 hover:border-status-green/45 transition-all group"
      >
        <div className="flex items-center gap-2 text-status-green text-[10px] font-semibold uppercase tracking-wider mb-3">
          <Award className="h-3.5 w-3.5" /> Aluno da semana
        </div>
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            <img src={avatarUrl} alt={studentName} className="h-14 w-14 rounded-full object-cover border-2 border-status-green/30 shrink-0" />
          ) : (
            <div className="h-14 w-14 rounded-full bg-status-green/15 text-status-green flex items-center justify-center text-base font-semibold border-2 border-status-green/30 shrink-0">
              {initials(studentName)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-foreground truncate group-hover:text-status-green transition-colors">
              {shortName(studentName)}
            </p>
            <p className="text-xs text-muted-foreground">
              Concluiu <span className="font-semibold text-status-green">{tasksThisWeek}</span> {tasksThisWeek === 1 ? "tarefa" : "tarefas"} nos últimos 7 dias.
            </p>
            <p className="text-[11px] text-muted-foreground italic mt-1">
              Bora celebrar com ele na próxima sessão.
            </p>
          </div>
        </div>
      </button>
    </motion.div>
  );
};
