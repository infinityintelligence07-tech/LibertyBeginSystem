import { useState } from "react";
import {
  CheckCircle2, Circle, Plus, Pencil, Trash2, TrendingUp, MessageSquare, X, Save, RotateCcw, ShieldCheck, Clock, PlayCircle, Calendar as CalendarIcon, User,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { getTaskStatus, taskStatusConfig, type TaskStatus } from "@/lib/taskStatus";
import { TaskPlanDialog } from "@/components/TaskPlanDialog";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Task {
  id: string;
  booking_id: string;
  description: string;
  is_completed: boolean | null;
  in_progress?: boolean | null;
  result_type: string | null;
  result_value: string | null;
  result_metric: string | null;
  completed_at: string | null;
  completed_by_role?: string | null;
  validated_at?: string | null;
  validated_by?: string | null;
  origin?: string | null;
  created_by_mentor_id?: string | null;
  planned_date?: string | null;
  due_date?: string | null;
  assignee_name?: string | null;
}

interface TaskChecklistProps {
  tasks: Task[];
  bookingId: string;
  role: "mentor" | "liberty" | "admin";
  sessionName?: string;
  invalidateKeys?: unknown[][];
  onChanged?: () => void;
  /** Optional filter — when set, only tasks in that status are rendered. */
  filter?: TaskStatus | "all";
  /** Hide the inline "Adicionar tarefa" button (add is delegated to parent). */
  hideAdd?: boolean;
}

export const TaskChecklist = ({
  tasks,
  bookingId,
  role,
  sessionName,
  invalidateKeys = [],
  onChanged,
  filter = "all",
  hideAdd = false,
}: TaskChecklistProps) => {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [newTaskText, setNewTaskText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [addingTask, setAddingTask] = useState(false);

  // Result modal state (mentor only)
  const [resultTaskId, setResultTaskId] = useState<string | null>(null);
  const [resultType, setResultType] = useState<"quantitative" | "qualitative">("qualitative");
  const [resultValue, setResultValue] = useState("");
  const [resultMetric, setResultMetric] = useState("");
  const [resultNotes, setResultNotes] = useState("");


  // Plan dialog (student only)
  const [planTaskId, setPlanTaskId] = useState<string | null>(null);
  const planTask = planTaskId ? tasks.find((t) => t.id === planTaskId) || null : null;

  const invalidateAll = () => {
    invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    queryClient.invalidateQueries({ queryKey: ["liberty-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["liberty-all-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["session-tasks"] });
    onChanged?.();
  };

  // Student marks a task as done -> awaiting validation
  const studentMarkMutation = useMutation({
    mutationFn: async ({ taskId, done }: { taskId: string; done: boolean }) => {
      const patch = done
        ? {
            is_completed: true,
            completed_by_role: "liberty" as const,
            completed_at: new Date().toISOString(),
            validated_at: null,
            validated_by: null,
          }
        : {
            is_completed: false,
            completed_by_role: null,
            completed_at: null,
            validated_at: null,
            validated_by: null,
          };
      const { error } = await supabase.from("session_tasks").update(patch).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      invalidateAll();
      toast.success(vars.done ? "Enviada para validação do mentor!" : "Tarefa reaberta");
    },
    onError: () => toast.error("Erro ao atualizar tarefa"),
  });

  // Mentor validates a task already marked done by student
  const validateMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("session_tasks")
        .update({
          is_completed: true,
          validated_at: new Date().toISOString(),
          validated_by: profile?.id || null,
        })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Tarefa validada!");
    },
    onError: () => toast.error("Erro ao validar tarefa"),
  });

  // Mentor reopens a task (for either status)
  const reopenMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("session_tasks")
        .update({
          is_completed: false,
          completed_by_role: null,
          completed_at: null,
          validated_at: null,
          validated_by: null,
          result_value: null,
          result_metric: null,
          result_type: null,
        })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Tarefa reaberta");
    },
    onError: () => toast.error("Erro ao reabrir tarefa"),
  });

  const addMutation = useMutation({
    mutationFn: async (description: string) => {
      const { error } = await supabase.from("session_tasks").insert({
        booking_id: bookingId,
        description,
        origin: "mentor",
        created_by_mentor_id: profile?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      setNewTaskText("");
      setAddingTask(false);
      toast.success("Tarefa adicionada!");
    },
    onError: () => toast.error("Erro ao adicionar tarefa"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, description }: { id: string; description: string }) => {
      const { error } = await supabase.from("session_tasks").update({ description }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      setEditingId(null);
      toast.success("Tarefa editada!");
    },
    onError: () => toast.error("Erro ao editar tarefa"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("session_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Tarefa removida!");
    },
    onError: () => toast.error("Erro ao remover tarefa"),
  });

  const saveResultMutation = useMutation({
    mutationFn: async () => {
      if (!resultTaskId) throw new Error("No task");
      const { error } = await supabase
        .from("session_tasks")
        .update({
          is_completed: true,
          validated_at: new Date().toISOString(),
          validated_by: profile?.id || null,
          result_type: resultType,
          result_value: resultValue.trim() || null,
          result_metric: resultType === "quantitative" ? resultMetric.trim() || null : null,
          result_notes: resultNotes.trim() || null,
          completed_at: new Date().toISOString(),
        } as any)
        .eq("id", resultTaskId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      setResultTaskId(null);
      setResultValue("");
      setResultMetric("");
      setResultNotes("");
      toast.success("Resultado registrado!");
    },
    onError: () => toast.error("Erro ao registrar resultado"),
  });


  const applyFilter = (status: TaskStatus) => filter === "all" || filter === status;
  const grouped = {
    pending: tasks.filter((t) => getTaskStatus(t) === "pending" && applyFilter("pending")),
    in_progress: tasks.filter((t) => getTaskStatus(t) === "in_progress" && applyFilter("in_progress")),
    awaiting: tasks.filter((t) => getTaskStatus(t) === "done_by_student" && applyFilter("done_by_student")),
    validated: tasks.filter((t) => getTaskStatus(t) === "validated" && applyFilter("validated")),
  };

  // Student marks a task as "in progress"
  const toggleInProgress = useMutation({
    mutationFn: async ({ taskId, value }: { taskId: string; value: boolean }) => {
      const { error } = await supabase
        .from("session_tasks")
        .update({ in_progress: value })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      invalidateAll();
      toast.success(vars.value ? "Marcada como em andamento" : "Voltou para pendente");
    },
    onError: () => toast.error("Erro ao atualizar tarefa"),
  });

  const openResultDialog = (taskId: string) => {
    setResultTaskId(taskId);
    setResultType("qualitative");
    setResultValue("");
    setResultMetric("");
    setResultNotes("");
  };


  const PlanChips = ({ task }: { task: Task }) => {
    if (!task.assignee_name && !task.due_date) return null;
    const today = new Date().toISOString().slice(0, 10);
    const overdue = task.due_date && task.due_date < today && !task.is_completed;
    return (
      <div className="flex items-center gap-1.5 flex-wrap mt-1">

        {task.due_date && (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border bg-muted/50 text-muted-foreground border-border">
            <Clock className="h-2.5 w-2.5" />
            Prazo {format(parseISO(task.due_date), "dd 'de' MMM", { locale: ptBR })}
            {overdue && " · vencido"}
          </span>
        )}
        {task.assignee_name && (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
            <User className="h-2.5 w-2.5" /> {task.assignee_name}
          </span>
        )}
      </div>
    );
  };

  const renderPending = (task: Task) => (
    <div key={task.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card group">
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (role === "liberty") studentMarkMutation.mutate({ taskId: task.id, done: true });
          else openResultDialog(task.id);
        }}
        disabled={studentMarkMutation.isPending}
        title={role === "liberty" ? "Marcar como concluída" : "Concluir e registrar resultado"}
        className="w-5 h-5 rounded-full border-2 border-muted-foreground/20 hover:border-status-green hover:bg-status-green/10 transition-colors shrink-0"
      />

      {editingId === task.id ? (
        <div className="flex-1 flex items-center gap-2">
          <input
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground border-b border-primary/20 focus:outline-none"
            autoFocus
          />
          <button
            onClick={() => editText.trim() && updateMutation.mutate({ id: task.id, description: editText.trim() })}
            className="p-1 rounded hover:bg-muted"
          >
            <Save className="h-3.5 w-3.5 text-primary" />
          </button>
          <button onClick={() => setEditingId(null)} className="p-1 rounded hover:bg-muted">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      ) : (
        <>
          {role === "liberty" ? (
            <button
              onClick={() => setPlanTaskId(task.id)}
              className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
              title="Planejar tarefa"
            >
              <p className="text-sm text-foreground break-words">{task.description}</p>
              <PlanChips task={task} />
            </button>
          ) : (
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground break-words">{task.description}</p>
              <PlanChips task={task} />
            </div>
          )}
          {role === "liberty" && (
            <button
              onClick={() => setPlanTaskId(task.id)}
              className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors flex items-center gap-1 shrink-0"
              title="Definir data e responsável"
            >
              <CalendarIcon className="h-3 w-3" /> Planejar
            </button>
          )}
          {(role === "mentor" || role === "admin") && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setPlanTaskId(task.id)}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Definir prazo e responsável"
              >
                <CalendarIcon className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => { setEditingId(task.id); setEditText(task.description); }}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Editar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => { if (window.confirm("Remover esta tarefa? Essa ação não pode ser desfeita.")) deleteMutation.mutate(task.id); }}
                className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Remover"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderInProgress = (task: Task) => (
    <div key={task.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-status-blue/30 bg-status-blue/5 group">
      <button
        onClick={() => {
          if (role === "liberty") studentMarkMutation.mutate({ taskId: task.id, done: true });
          else openResultDialog(task.id);
        }}
        title={role === "liberty" ? "Marcar como concluída" : "Concluir e registrar resultado"}
        className="w-5 h-5 rounded-full border-2 border-status-blue/40 bg-status-blue/10 hover:border-status-green hover:bg-status-green/10 transition-colors shrink-0 flex items-center justify-center"
      >
        <PlayCircle className="h-3 w-3 text-status-blue" />
      </button>
      {role === "liberty" ? (
        <button
          onClick={() => setPlanTaskId(task.id)}
          className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
          title="Planejar tarefa"
        >
          <p className="text-sm text-foreground break-words">{task.description}</p>
          <p className="text-[10px] text-status-blue mt-0.5">Em andamento</p>
          <PlanChips task={task} />
        </button>
      ) : (
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground break-words">{task.description}</p>
          <p className="text-[10px] text-status-blue mt-0.5">Em andamento</p>
          <PlanChips task={task} />
        </div>
      )}
      {role === "liberty" && (
        <button
          onClick={() => setPlanTaskId(task.id)}
          className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors flex items-center gap-1 shrink-0"
          title="Definir data e responsável"
        >
          <CalendarIcon className="h-3 w-3" /> Planejar
        </button>
      )}
      {(role === "mentor" || role === "admin") && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setPlanTaskId(task.id)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Definir prazo e responsável"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => { setEditingId(task.id); setEditText(task.description); }}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Editar"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => { if (window.confirm("Remover esta tarefa? Essa ação não pode ser desfeita.")) deleteMutation.mutate(task.id); }}
            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            title="Remover"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );


  const renderAwaiting = (task: Task) => (
    <div key={task.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-status-yellow/30 bg-status-yellow/5 group">
      <Clock className="h-4 w-4 text-status-yellow shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground break-words">{task.description}</p>
        <p className="text-[10px] text-status-yellow mt-0.5">
          O aluno marcou como concluída. Aguardando validação do mentor
        </p>
      </div>
      {(role === "mentor" || role === "admin") && (
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => openResultDialog(task.id)}
            className="text-[10px] px-2 py-1 rounded bg-status-green/15 text-status-green hover:bg-status-green/25 transition-colors flex items-center gap-1"
            title="Validar e registrar resultado"
          >
            <ShieldCheck className="h-3 w-3" /> Validar c/ resultado
          </button>
          <button
            onClick={() => validateMutation.mutate(task.id)}
            disabled={validateMutation.isPending}
            className="text-[10px] px-2 py-1 rounded bg-muted text-foreground hover:bg-muted/70 transition-colors flex items-center gap-1"
            title="Apenas validar (sem resultado)"
          >
            Validar
          </button>

          <button
            onClick={() => reopenMutation.mutate(task.id)}
            disabled={reopenMutation.isPending}
            className="text-[10px] px-2 py-1 rounded bg-muted text-muted-foreground hover:bg-muted/70 transition-colors flex items-center gap-1"
            title="Reabrir"
          >
            <RotateCcw className="h-3 w-3" /> Reabrir
          </button>
        </div>
      )}
      {role === "liberty" && (
        <button
          onClick={() => studentMarkMutation.mutate({ taskId: task.id, done: false })}
          disabled={studentMarkMutation.isPending}
          className="text-[10px] px-2 py-1 rounded bg-muted text-muted-foreground hover:bg-muted/70 transition-colors flex items-center gap-1 shrink-0"
          title="Desmarcar"
        >
          <RotateCcw className="h-3 w-3" /> Desmarcar
        </button>
      )}
    </div>
  );

  const renderValidated = (task: Task) => (
    <div key={task.id} className="px-3 py-2.5 rounded-lg border border-border bg-card/50 group">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-status-green shrink-0" />
        <span className="text-sm text-foreground/70 line-through flex-1 min-w-0 break-words">{task.description}</span>
        {(role === "mentor" || role === "admin") && !task.result_value && (
          <button
            onClick={() => openResultDialog(task.id)}
            className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
          >
            + Resultado
          </button>
        )}

        {(role === "mentor" || role === "admin") && (
          <>
            <button
              onClick={() => reopenMutation.mutate(task.id)}
              disabled={reopenMutation.isPending}
              className="p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              title="Reabrir"
            >
              <RotateCcw className="h-3 w-3 text-muted-foreground" />
            </button>
            <button
              onClick={() => { if (window.confirm("Remover esta tarefa? Essa ação não pode ser desfeita.")) deleteMutation.mutate(task.id); }}
              className="p-1 rounded hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              title="Remover"
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </button>
          </>
        )}
      </div>
      {task.result_value && (
        <div className="mt-2 ml-8 p-2 rounded-lg bg-muted/50 border border-border">
          <div className="flex items-center gap-1.5 mb-0.5">
            {task.result_type === "quantitative" ? (
              <TrendingUp className="h-3 w-3 text-status-green" />
            ) : (
              <MessageSquare className="h-3 w-3 text-status-blue" />
            )}
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              {task.result_type === "quantitative" ? "Quantitativo" : "Qualitativo"}
            </span>
          </div>
          <p className="text-xs text-foreground">
            {task.result_metric ? `${task.result_metric}: ` : ""}{task.result_value}
          </p>
          {(task as any).result_notes && (
            <p className="text-[11px] text-muted-foreground italic mt-1 whitespace-pre-wrap">
              {(task as any).result_notes}
            </p>
          )}
        </div>
      )}

    </div>
  );

  const SectionHeader = ({ status, count }: { status: keyof typeof taskStatusConfig; count: number }) => {
    const cfg = taskStatusConfig[status];
    return (
      <div className="flex items-center gap-2 mb-1.5 mt-2 first:mt-0">
        <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${cfg.classes}`}>
          {cfg.label}
        </span>
        <span className="text-[10px] text-muted-foreground">({count})</span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {sessionName && <p className="text-xs text-muted-foreground">{sessionName}</p>}

      {grouped.pending.length > 0 && (
        <div className="space-y-1">
          <SectionHeader status="pending" count={grouped.pending.length} />
          {grouped.pending.map(renderPending)}
        </div>
      )}

      {grouped.in_progress.length > 0 && (
        <div className="space-y-1">
          <SectionHeader status="in_progress" count={grouped.in_progress.length} />
          {grouped.in_progress.map(renderInProgress)}
        </div>
      )}

      {grouped.awaiting.length > 0 && (
        <div className="space-y-1">
          <SectionHeader status="done_by_student" count={grouped.awaiting.length} />
          {grouped.awaiting.map(renderAwaiting)}
        </div>
      )}

      {grouped.validated.length > 0 && (
        <div className="space-y-1">
          <SectionHeader status="validated" count={grouped.validated.length} />
          {grouped.validated.map(renderValidated)}
        </div>
      )}

      {!hideAdd && (role === "mentor" || role === "admin") && (
        <>
          {addingTask ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 bg-card">
              <Circle className="h-4 w-4 text-muted-foreground/30 shrink-0" />
              <input
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTaskText.trim()) addMutation.mutate(newTaskText.trim());
                  if (e.key === "Escape") { setAddingTask(false); setNewTaskText(""); }
                }}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                placeholder="Descreva a nova tarefa..."
                autoFocus
              />
              <button
                onClick={() => newTaskText.trim() && addMutation.mutate(newTaskText.trim())}
                disabled={!newTaskText.trim() || addMutation.isPending}
                className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground disabled:opacity-40"
              >
                Adicionar
              </button>
              <button onClick={() => { setAddingTask(false); setNewTaskText(""); }} className="p-1 rounded hover:bg-muted">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingTask(true)}
              className="flex items-center gap-2 text-xs text-primary hover:text-primary/80 transition-colors py-1"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar tarefa
            </button>
          )}
        </>
      )}

      {tasks.length === 0 && role === "liberty" && (
        <p className="text-xs text-muted-foreground italic py-2">Nenhuma tarefa atribuída ainda.</p>
      )}

      {/* Result dialog (mentor) */}
      <Dialog open={!!resultTaskId} onOpenChange={(open) => { if (!open) setResultTaskId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Resultado</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            {tasks.find((t) => t.id === resultTaskId)?.description}
          </p>

          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Tipo de resultado</label>
            <div className="flex gap-2">
              <button
                onClick={() => setResultType("quantitative")}
                className={`flex-1 text-xs px-3 py-2.5 rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                  resultType === "quantitative"
                    ? "bg-status-green/10 text-status-green border-border"
                    : "bg-card text-muted-foreground border-border"
                }`}
              >
                <TrendingUp className="h-3.5 w-3.5" /> Quantitativo
              </button>
              <button
                onClick={() => setResultType("qualitative")}
                className={`flex-1 text-xs px-3 py-2.5 rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                  resultType === "qualitative"
                    ? "bg-status-blue/10 text-status-blue border-border"
                    : "bg-card text-muted-foreground border-border"
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" /> Qualitativo
              </button>
            </div>
          </div>

          {resultType === "quantitative" && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Métrica (ex: Faturamento, Clientes)</label>
              <input
                value={resultMetric}
                onChange={(e) => setResultMetric(e.target.value)}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/20 focus:outline-none"
                placeholder="Ex: Faturamento"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              {resultType === "quantitative" ? "Valor alcançado" : "Descreva o resultado"}
            </label>
            <textarea
              value={resultValue}
              onChange={(e) => setResultValue(e.target.value)}
              className="w-full bg-card border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/20 focus:outline-none resize-none h-20"
              placeholder={resultType === "quantitative" ? "Ex: R$ 50.000" : "Ex: Melhorou processos internos de vendas"}
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Observações (opcional)</label>
            <textarea
              value={resultNotes}
              onChange={(e) => setResultNotes(e.target.value)}
              className="w-full bg-card border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/20 focus:outline-none resize-none h-16"
              placeholder="Contexto, aprendizados, próximos passos…"
            />
          </div>

          <button
            onClick={() => saveResultMutation.mutate()}
            disabled={saveResultMutation.isPending || !resultValue.trim()}
            className="btn-silver w-full text-sm disabled:opacity-40"
          >
            {saveResultMutation.isPending ? "Salvando..." : "Salvar Resultado"}
          </button>

        </DialogContent>
      </Dialog>

      {/* Plan dialog */}
      <TaskPlanDialog
        task={planTask}
        onOpenChange={(open) => { if (!open) setPlanTaskId(null); }}
        invalidateKeys={invalidateKeys}
        role={role}
      />
    </div>
  );
};
