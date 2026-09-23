import { useState, useMemo } from "react";
import { Trophy, TrendingUp, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { fadeUpItem } from "@/lib/animations";
import { shortName } from "@/lib/formatName";
import { Chip, EmptyState, SectionCard, SectionHeader } from "@/components/ds";

type Task = {
  id: string;
  booking_id: string;
  description: string;
  is_completed: boolean;
  result_type: string | null;
  result_value: string | null;
  result_metric: string | null;
  completed_at: string | null;
};

type Props = {
  tasks: Task[];
  profileMap: Record<string, string>; // booking_id -> member name
};

export const ResultsRanking = ({ tasks, profileMap }: Props) => {
  const [filter, setFilter] = useState<"all" | "quantitative" | "qualitative">("all");

  // Resultado ≠ tarefa. Só entra no ranking a tarefa concluída em que o mentor
  // registrou de fato o resultado obtido (tipo + valor).
  const completedTasks = useMemo(() => {
    let filtered = tasks.filter(
      (t) =>
        t.is_completed &&
        !!t.result_type &&
        typeof t.result_value === "string" &&
        t.result_value.trim().length > 0,
    );
    if (filter !== "all") filtered = filtered.filter((t) => t.result_type === filter);
    return filtered;
  }, [tasks, filter]);

  // Ranking by member (count registered results)
  const ranking = useMemo(() => {
    const counts: Record<string, { name: string; count: number; results: Task[] }> = {};
    completedTasks.forEach((t) => {
      const name = profileMap[t.booking_id] || "Membro";
      if (!counts[name]) counts[name] = { name, count: 0, results: [] };
      counts[name].count++;
      counts[name].results.push(t);
    });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [completedTasks, profileMap]);

  const filters = [
    { key: "all" as const, label: "Todos" },
    { key: "quantitative" as const, label: "Quantitativos", icon: TrendingUp },
    { key: "qualitative" as const, label: "Qualitativos", icon: MessageSquare },
  ];


  return (
    <motion.div variants={fadeUpItem} className="space-y-4">
      <SectionHeader
        title="Ranking de resultados"
        actions={
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por tipo de resultado">
            {filters.map((f) => (
              <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.icon && <f.icon className="h-3.5 w-3.5" aria-hidden />}
                {f.label}
              </Chip>
            ))}
          </div>
        }
      />

      {ranking.length === 0 ? (
        <EmptyState icon={Trophy} title="Nenhum resultado registrado ainda" compact />
      ) : (
        <div className="space-y-3">
          {ranking.slice(0, 10).map((member, i) => (
            <SectionCard key={member.name} padding="compact">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold tabular-nums shrink-0 ${
                  i === 0 ? "bg-status-yellow/20 text-status-yellow" :
                  i === 1 ? "bg-muted text-foreground" :
                  i === 2 ? "bg-primary/10 text-primary" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {i + 1}º
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{shortName(member.name)}</p>
                  <p className="text-xs text-muted-foreground">{member.count} resultado{member.count !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <div className="pl-11 space-y-1.5">
                {member.results.slice(0, 3).map((r) => (
                  <div key={r.id} className="flex items-start gap-2 text-xs">
                    {r.result_type === "quantitative" ? (
                      <TrendingUp className="h-3 w-3 text-status-green mt-0.5 shrink-0" aria-hidden />
                    ) : (
                      <MessageSquare className="h-3 w-3 text-status-blue mt-0.5 shrink-0" aria-hidden />
                    )}
                    <div>
                      <span className="text-foreground">{r.description}</span>
                      {r.result_value && (
                        <span className="text-muted-foreground ml-1">
                          → {r.result_metric ? `${r.result_metric}: ` : ""}{r.result_value}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {member.results.length > 3 && (
                  <p className="text-[11px] text-muted-foreground">+{member.results.length - 3} mais</p>
                )}
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </motion.div>
  );
};
