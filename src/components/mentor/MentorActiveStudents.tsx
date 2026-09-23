import { Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { shortName } from "@/lib/formatName";
import { UserAvatar } from "@/components/UserAvatar";
import { EmptyState, ListRow, ProgressBar, SectionCard, SectionHeader, StatusPill } from "@/components/ds";

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

const tierLabel = (tier?: string | null) => (tier === "liberty" ? "Liberty" : tier === "begin" ? "Begin" : null);

export const MentorActiveStudents = ({ students }: Props) => {
  const navigate = useNavigate();
  const total = 12;

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Alunos ativos"
        description="Acompanhamento da jornada"
        actions={<span className="text-xs text-muted-foreground tabular-nums">{students.length} {students.length === 1 ? "aluno" : "alunos"}</span>}
      />

      {students.length === 0 ? (
        <EmptyState
          icon={Users}
          compact
          title="Nenhum aluno ainda"
          description="Quando o administrador agendar sessões com você, seus alunos aparecem aqui."
        />
      ) : (
        <SectionCard padding="none">
          {students.map((s, idx) => {
            const isDone = s.completedCount >= total;
            const tier = tierLabel(s.tier);
            return (
              <ListRow
                key={s.id}
                last={idx === students.length - 1}
                leading={<UserAvatar name={s.full_name} avatarUrl={s.avatar_url} size={40} />}
                title={shortName(s.full_name)}
                subtitle={
                  <span className="flex items-center gap-3">
                    <span className="flex-1 min-w-[80px] max-w-[160px]">
                      <ProgressBar value={s.completedCount} max={total} tone={isDone ? "success" : "brand"} label="Sessões realizadas" className="h-1.5" />
                    </span>
                    <span className="tabular-nums shrink-0">{s.completedCount}/{total} sessões</span>
                    {s.nextDate && <span className="hidden sm:inline shrink-0">Próxima {s.nextDate}</span>}
                  </span>
                }
                trailing={tier ? <StatusPill tone={s.tier === "liberty" ? "brand" : "neutral"} withDot={false}>{tier}</StatusPill> : undefined}
                onPress={() => navigate(`/mentor/alunos/${s.id}`)}
              />
            );
          })}
        </SectionCard>
      )}
    </section>
  );
};
