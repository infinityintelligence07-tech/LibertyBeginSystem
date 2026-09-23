import { useMemo, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, CircleDot, PlayCircle, CheckCircle2, User, ListTodo } from "lucide-react";
import { addDays, format, isSameDay, isToday, parseISO, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TaskPlanDialog } from "@/components/TaskPlanDialog";
import { getTaskStatus } from "@/lib/taskStatus";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, IconButton, ListRow, SectionCard, SectionHeader, StatusPill } from "@/components/ds";

interface Task {
  id: string;
  description: string;
  is_completed: boolean | null;
  in_progress?: boolean | null;
  planned_date?: string | null;
  assignee_name?: string | null;
  booking_id: string;
  result_type?: string | null;
  result_value?: string | null;
  validated_at?: string | null;
  completed_by_role?: string | null;
}

interface Props {
  tasks: Task[];
  sessionNameByBooking: Record<string, string>;
}

export const WeekTasksBento = ({ tasks, sessionNameByBooking }: Props) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [planTaskId, setPlanTaskId] = useState<string | null>(null);
  const [showAllUnscheduled, setShowAllUnscheduled] = useState(false);

  const weekStart = useMemo(
    () => addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset * 7),
    [weekOffset]
  );
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const activeTasks = tasks.filter((t) => getTaskStatus(t) !== "validated");
  const withDate = activeTasks.filter((t) => t.planned_date);
  const unscheduled = activeTasks.filter((t) => !t.planned_date);

  const byDay = (d: Date) =>
    withDate.filter((t) => isSameDay(parseISO(t.planned_date!), d));

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const upcoming = withDate
    .map((t) => ({ t, d: parseISO(t.planned_date!) }))
    .filter(({ d }) => d >= todayStart)
    .sort((a, b) => a.d.getTime() - b.d.getTime());

  const todayTasks = byDay(today);
  const focus = todayTasks[0] || upcoming[0]?.t || null;
  const focusDate = focus?.planned_date ? parseISO(focus.planned_date) : null;

  const planTask = planTaskId ? tasks.find((t) => t.id === planTaskId) || null : null;
  const visibleUnscheduled = showAllUnscheduled ? unscheduled : unscheduled.slice(0, 4);

  const StatusIcon = ({ t, className = "h-4 w-4" }: { t: Task; className?: string }) => {
    if (t.is_completed) return <CheckCircle2 className={cn(className, "text-status-green")} aria-hidden />;
    if (t.in_progress) return <PlayCircle className={cn(className, "text-status-blue")} aria-hidden />;
    return <CircleDot className={cn(className, "text-muted-foreground")} aria-hidden />;
  };

  if (activeTasks.length === 0) {
    return (
      <EmptyState
        compact
        icon={CheckCircle2}
        title="Tudo em dia"
        description="Você não tem tarefas ativas no momento."
      />
    );
  }

  return (
    <SectionCard padding="none">
      {/* Foco: uma prioridade clara */}
      <div className="p-4 sm:p-6 border-b border-border space-y-4">
        <SectionHeader
          as="h3"
          title={
            <span className="inline-flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-primary" aria-hidden />
              Tarefas da semana
            </span>
          }
          actions={
            <div className="flex items-center gap-2">
              <StatusPill tone="neutral" withDot={false}>{activeTasks.length} ativas</StatusPill>
              {unscheduled.length > 0 && (
                <StatusPill tone="warning" withDot={false}>{unscheduled.length} sem data</StatusPill>
              )}
            </div>
          }
        />

        {focus ? (
          <SectionCard
            as="button"
            interactive
            tone="brand"
            padding="compact"
            onClick={() => setPlanTaskId(focus.id)}
            aria-label={`Planejar tarefa: ${focus.description}`}
          >
            <div className="flex items-start gap-3">
              <StatusIcon t={focus} className="h-5 w-5 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="ds-kicker text-primary mb-1">
                  {focusDate && isToday(focusDate) ? "Foco de hoje" : "Próxima tarefa"}
                </p>
                <p className="text-[15px] text-foreground font-medium leading-snug">{focus.description}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {focusDate && (
                    <StatusPill tone="brand" withDot={false}>
                      {isToday(focusDate) ? "Hoje" : format(focusDate, "EEE, dd MMM", { locale: ptBR })}
                    </StatusPill>
                  )}
                  {focus.assignee_name && (
                    <StatusPill tone="neutral" withDot={false}>
                      <User className="h-3 w-3" aria-hidden /> {focus.assignee_name}
                    </StatusPill>
                  )}
                  <span className="text-xs text-muted-foreground truncate">
                    {sessionNameByBooking[focus.booking_id] || "Sessão"}
                  </span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground mt-1 shrink-0" aria-hidden />
            </div>
          </SectionCard>
        ) : (
          <EmptyState
            compact
            icon={CalendarIcon}
            title="Nenhuma tarefa com data definida"
            description="Planeje uma tarefa abaixo para começar."
          />
        )}
      </div>

      {/* Faixa da semana */}
      <div className="px-4 sm:px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted-foreground tabular-nums">
            {format(days[0], "dd MMM", { locale: ptBR })} · {format(days[6], "dd MMM", { locale: ptBR })}
          </span>
          <div className="flex items-center gap-1">
            {weekOffset !== 0 && (
              <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
                Hoje
              </Button>
            )}
            <IconButton size="sm" aria-label="Semana anterior" onClick={() => setWeekOffset((w) => w - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
            <IconButton size="sm" aria-label="Próxima semana" onClick={() => setWeekOffset((w) => w + 1)}>
              <ChevronRight className="h-4 w-4" />
            </IconButton>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const dayTasks = byDay(d);
            const highlight = isToday(d);
            const count = dayTasks.length;
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => count > 0 && setPlanTaskId(dayTasks[0].id)}
                disabled={count === 0}
                aria-label={`${format(d, "EEEE, dd 'de' MMMM", { locale: ptBR })}: ${count} tarefa${count !== 1 ? "s" : ""}`}
                className={cn(
                  "rounded-ds min-h-[56px] p-2 text-center transition-colors duration-ds-1 ease-ds border",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
                  highlight
                    ? "bg-primary/10 border-primary/25"
                    : count > 0
                    ? "bg-muted/40 hover:bg-muted border-transparent"
                    : "border-transparent",
                  count === 0 ? "cursor-default" : "cursor-pointer",
                )}
              >
                <p className={cn("text-[11px] font-medium", highlight ? "text-primary" : "text-muted-foreground")}>
                  {format(d, "EEE", { locale: ptBR }).replace(".", "")}
                </p>
                <p className={cn("text-sm tabular-nums mt-0.5", highlight ? "text-primary font-semibold" : "text-foreground")}>
                  {format(d, "dd")}
                </p>
                <p className={cn("text-[11px] mt-0.5 tabular-nums", highlight ? "text-primary font-semibold" : count > 0 ? "text-foreground font-semibold" : "text-muted-foreground/40")}>
                  {count > 0 ? count : "·"}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sem data */}
      {unscheduled.length > 0 && (
        <div>
          <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2">
            <p className="ds-kicker">Planejar ({unscheduled.length})</p>
            {unscheduled.length > 4 && (
              <Button variant="link" size="sm" onClick={() => setShowAllUnscheduled((v) => !v)}>
                {showAllUnscheduled ? "Recolher" : "Ver todas"}
              </Button>
            )}
          </div>
          <div>
            {visibleUnscheduled.map((t, i) => (
              <ListRow
                key={t.id}
                leading={<StatusIcon t={t} />}
                title={t.description}
                subtitle={sessionNameByBooking[t.booking_id] || "Sessão"}
                trailing={
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <CalendarIcon className="h-3.5 w-3.5" aria-hidden /> Definir data
                  </span>
                }
                onPress={() => setPlanTaskId(t.id)}
                last={i === visibleUnscheduled.length - 1}
              />
            ))}
          </div>
        </div>
      )}

      <TaskPlanDialog task={planTask as any} onOpenChange={(o) => { if (!o) setPlanTaskId(null); }} />
    </SectionCard>
  );
};
