import { Building2, CheckCircle2, Flame } from "lucide-react";
import { PageHeader, SectionCard, Stat, StatusPill } from "@/components/ds";

interface Milestone {
  key: string;
  label: string;
  icon: string;
}

interface Props {
  firstName: string;
  companiesImpacted: number;
  sessionsConducted: number;
  studentTasksCompleted: number;
  milestones: Milestone[];
}

const greetingByHour = () => {
  const h = new Date().getHours();
  if (h < 12) return "Faça um bom dia";
  if (h < 18) return "Faça uma boa tarde";
  return "Faça uma boa noite";
};

export const MentorImpactBar = ({
  firstName,
  companiesImpacted,
  sessionsConducted,
  studentTasksCompleted,
  milestones,
}: Props) => {
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Mentoria"
        title={`${greetingByHour()}, ${firstName}`}
      />

      <SectionCard className="space-y-4">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Flame className="h-4 w-4 text-muted-foreground" aria-hidden /> Seu impacto acumulado
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Stat
            icon={Building2}
            value={companiesImpacted}
            label={companiesImpacted === 1 ? "Empresa impactada" : "Empresas impactadas"}
          />
          <Stat
            icon={CheckCircle2}
            value={sessionsConducted}
            label={sessionsConducted === 1 ? "Sessão conduzida" : "Sessões conduzidas"}
          />
          <Stat
            icon={Flame}
            value={studentTasksCompleted}
            label={studentTasksCompleted === 1 ? "Tarefa concluída pelos alunos" : "Tarefas concluídas pelos alunos"}
          />
        </div>

        {milestones.length > 0 && (
          <div className="pt-4 border-t border-border flex flex-wrap gap-2">
            {milestones.map((m) => (
              <StatusPill key={m.key} tone="neutral" withDot={false} size="md">
                {m.label}
              </StatusPill>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
};
