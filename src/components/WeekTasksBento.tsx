import { useMemo, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, CircleDot, PlayCircle, CheckCircle2, User, ArrowRight, ListTodo } from "lucide-react";
import { addDays, format, isSameDay, isToday, parseISO, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TaskPlanDialog } from "@/components/TaskPlanDialog";
import { getTaskStatus } from "@/lib/taskStatus";

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

  const StatusIcon = ({ t, className = "h-3.5 w-3.5" }: { t: Task; className?: string }) => {
    if (t.is_completed) return <CheckCircle2 className={`${className} text-status-green`} />;
    if (t.in_progress) return <PlayCircle className={`${className} text-status-blue`} />;
    return <CircleDot className={`${className} text-muted-foreground`} />;
  };

  // Empty state
  if (activeTasks.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <CheckCircle2 className="h-8 w-8 text-status-green mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-foreground mb-1">Tudo em dia</h2>
        <p className="text-sm text-muted-foreground">Você não tem tarefas ativas no momento.</p>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      {/* FOCO — single clear priority */}
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Minhas tarefas</h2>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>{activeTasks.length} ativas</span>
            {unscheduled.length > 0 && (
              <span className="text-status-yellow">{unscheduled.length} sem data</span>
            )}
          </div>
        </div>

        {focus ? (
          <button
            onClick={() => setPlanTaskId(focus.id)}
            className="w-full text-left rounded-xl border border-primary/30 bg-primary/5 p-4 hover:border-primary/50 transition-colors group"
          >
            <div className="flex items-start gap-3">
              <StatusIcon t={focus} className="h-5 w-5 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-primary mb-1">
                  {focusDate && isToday(focusDate) ? "Foco de hoje" : "Próxima tarefa"}
                </p>
                <p className="text-base text-foreground font-medium leading-snug">{focus.description}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {focusDate && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      {isToday(focusDate) ? "Hoje" : format(focusDate, "EEE, dd MMM", { locale: ptBR })}
                    </span>
                  )}
                  {focus.assignee_name && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border inline-flex items-center gap-1">
                      <User className="h-2.5 w-2.5" /> {focus.assignee_name}
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground truncate">
                    {sessionNameByBooking[focus.booking_id] || "Sessão"}
                  </span>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors mt-1" />
            </div>
          </button>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-5 text-center">
            <p className="text-sm text-muted-foreground mb-2">Nenhuma tarefa com data definida.</p>
            <p className="text-xs text-muted-foreground">Planeje uma tarefa abaixo para começar.</p>
          </div>
        )}
      </div>

      {/* Week strip — compact */}
      <div className="px-3 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-2 px-2">
          <span className="text-[11px] text-muted-foreground">
            {format(days[0], "dd MMM", { locale: ptBR })} · {format(days[6], "dd MMM", { locale: ptBR })}
          </span>
          <div className="flex items-center gap-1">
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground"
              >
                Hoje
              </button>
            )}
            <button
              onClick={() => setWeekOffset((w) => w - 1)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Semana anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setWeekOffset((w) => w + 1)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Próxima semana"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
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
                onClick={() => count > 0 && setPlanTaskId(dayTasks[0].id)}
                disabled={count === 0}
                className={`rounded-lg p-2 text-center transition-colors ${
                  highlight
                    ? "bg-primary/10 border border-primary/30"
                    : count > 0
                    ? "bg-muted/40 hover:bg-muted border border-transparent"
                    : "border border-transparent"
                } ${count === 0 ? "cursor-default" : "cursor-pointer"}`}
              >
                <p className={`text-[9px] uppercase font-semibold ${highlight ? "text-primary" : "text-muted-foreground"}`}>
                  {format(d, "EEE", { locale: ptBR }).replace(".", "")}
                </p>
                <p className={`text-sm tabular-nums mt-0.5 ${highlight ? "text-primary font-semibold" : "text-foreground"}`}>
                  {format(d, "dd")}
                </p>
                <div className="mt-1 h-1 flex items-center justify-center gap-0.5">
                  {count > 0 ? (
                    <span className={`text-[10px] font-semibold ${highlight ? "text-primary" : "text-foreground"}`}>
                      {count}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/30 text-[10px]">·</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Unscheduled — collapsed by default */}
      {unscheduled.length > 0 && (
        <div className="p-4 bg-muted/20">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
              Planejar ({unscheduled.length})
            </p>
            {unscheduled.length > 4 && (
              <button
                onClick={() => setShowAllUnscheduled((v) => !v)}
                className="text-[11px] text-primary hover:underline"
              >
                {showAllUnscheduled ? "Recolher" : `Ver todas`}
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {visibleUnscheduled.map((t) => (
              <button
                key={t.id}
                onClick={() => setPlanTaskId(t.id)}
                className="w-full text-left flex items-center gap-2 rounded-lg px-3 py-2 bg-card border border-border hover:border-primary/30 transition-colors"
              >
                <StatusIcon t={t} />
                <span className="text-sm text-foreground flex-1 truncate">{t.description}</span>
                <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1 shrink-0">
                  <CalendarIcon className="h-3 w-3" /> Definir data
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <TaskPlanDialog task={planTask as any} onOpenChange={(o) => { if (!o) setPlanTaskId(null); }} />
    </div>
  );
};
