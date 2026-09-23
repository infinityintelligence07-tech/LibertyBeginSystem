import { Award, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { shortName } from "@/lib/formatName";
import { UserAvatar } from "@/components/UserAvatar";
import { SectionCard } from "@/components/ds";

interface Props {
  studentId: string;
  studentName: string;
  avatarUrl?: string | null;
  tasksThisWeek: number;
}

export const MentorStudentOfWeek = ({ studentId, studentName, avatarUrl, tasksThisWeek }: Props) => {
  const navigate = useNavigate();

  return (
    <div>
      <SectionCard
        as="button"
        interactive
        onClick={() => navigate(`/mentor/alunos/${studentId}`)}
        aria-label={`Abrir perfil de ${shortName(studentName)}`}
        className="flex items-center gap-4"
      >
        <UserAvatar name={studentName} avatarUrl={avatarUrl} size={48} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Award className="h-3.5 w-3.5" aria-hidden /> Aluno da semana
          </p>
          <p className="text-[17px] font-semibold text-foreground truncate mt-0.5">{shortName(studentName)}</p>
          <p className="text-sm text-muted-foreground">
            Concluiu <span className="font-semibold text-foreground tabular-nums">{tasksThisWeek}</span> {tasksThisWeek === 1 ? "tarefa" : "tarefas"} nos últimos 7 dias.
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
      </SectionCard>
    </div>
  );
};
