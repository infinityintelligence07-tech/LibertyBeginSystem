import { motion } from "framer-motion";
import { Building2, CheckCircle2, Flame } from "lucide-react";
import { fadeUpItem } from "@/lib/animations";
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
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
};

const contextPhrase = () => {
  const d = new Date().getDay();
  const phrases: Record<number, string> = {
    0: "domingo é dia de respirar. A semana vem forte.",
    1: "começando a semana com propósito.",
    2: "meio da semana chegando. Hora de acelerar.",
    3: "quarta é dia de constância.",
    4: "quinta pede clareza pro que fica pra sexta.",
    5: "última chance da semana de mover ponteiros.",
    6: "sábado é bom pra colher o que foi plantado.",
  };
  return phrases[d];
};

export const MentorImpactBar = ({
  firstName,
  companiesImpacted,
  sessionsConducted,
  studentTasksCompleted,
  milestones,
}: Props) => {
  return (
    <motion.div variants={fadeUpItem} className="space-y-4">
      <PageHeader
        eyebrow="Mentoria"
        title={`${greetingByHour()}, ${firstName}`}
        description={contextPhrase()}
      />

      <SectionCard className="space-y-4">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Flame className="h-4 w-4 text-primary" aria-hidden /> Seu impacto acumulado
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Stat
            icon={Building2}
            value={companiesImpacted}
            label={companiesImpacted === 1 ? "Empresa impactada" : "Empresas impactadas"}
            tone="brand"
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
              <StatusPill key={m.key} tone="brand" withDot={false} size="md">
                <span aria-hidden>{m.icon}</span> {m.label}
              </StatusPill>
            ))}
          </div>
        )}
      </SectionCard>
    </motion.div>
  );
};
