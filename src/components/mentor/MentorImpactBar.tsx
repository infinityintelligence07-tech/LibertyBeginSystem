import { motion } from "framer-motion";
import { Building2, CheckCircle2, Flame } from "lucide-react";
import { fadeUpItem } from "@/lib/animations";

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
      <div>
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1">
          Mentoria
        </p>
        <h1 className="text-2xl font-semibold text-foreground">
          {greetingByHour()}, {firstName}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {contextPhrase()}
        </p>
      </div>

      <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-[0_8px_30px_-18px_hsl(var(--primary)/0.35)]">
        <div className="flex items-center gap-2 text-primary text-[10px] font-semibold uppercase tracking-wider mb-3">
          <Flame className="h-3.5 w-3.5" /> Seu impacto acumulado
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ImpactStat
            icon={Building2}
            value={companiesImpacted}
            label={companiesImpacted === 1 ? "empresa impactada" : "empresas impactadas"}
            highlight
          />
          <ImpactStat
            icon={CheckCircle2}
            value={sessionsConducted}
            label={sessionsConducted === 1 ? "sessão conduzida" : "sessões conduzidas"}
          />
          <ImpactStat
            icon={Flame}
            value={studentTasksCompleted}
            label={studentTasksCompleted === 1 ? "tarefa concluída pelos alunos" : "tarefas concluídas pelos alunos"}
          />
        </div>

        {milestones.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border/40 flex flex-wrap gap-2">
            {milestones.map((m) => (
              <span
                key={m.key}
                className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border border-primary/25 bg-primary/5 text-foreground"
                title={m.label}
              >
                <span>{m.icon}</span>
                <span className="font-medium">{m.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

const ImpactStat = ({
  icon: Icon,
  value,
  label,
  highlight,
}: {
  icon: any;
  value: number;
  label: string;
  highlight?: boolean;
}) => (
  <div className="flex items-start gap-3">
    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${highlight ? "bg-primary/15 text-primary" : "bg-muted/50 text-foreground"}`}>
      <Icon className="h-5 w-5" />
    </div>
    <div className="min-w-0">
      <p className={`text-2xl font-semibold tabular-nums leading-none ${highlight ? "text-primary" : "text-foreground"}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{label}</p>
    </div>
  </div>
);
