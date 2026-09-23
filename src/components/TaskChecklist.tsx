import { useState, type ReactNode } from "react";
import {
  CheckCircle2, Circle, Plus, Pencil, Trash2, TrendingUp, MessageSquare, X, Save, RotateCcw, ShieldCheck, Clock, PlayCircle, Calendar as CalendarIcon, User,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  BottomSheet, Chip, ConfirmDialog, EmptyState, IconButton, StatusPill, TextAreaField, TextField,
  type PillTone,
} from "@/components/ds";
import { cn } from "@/lib/utils";
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

  // Confirmação de remoção (substitui window.confirm)
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);

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
      setDeleteTaskId(null);
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
          <StatusPill tone={overdue ? "danger" : "neutral"} withDot={false}>
            <Clock className="h-3 w-3" aria-hidden />
            Prazo {format(parseISO(task.due_date), "dd 'de' MMM", { locale: ptBR })}
            {overdue && " · vencido"}
          </StatusPill>
        )}
        {task.assignee_name && (
          <StatusPill tone="neutral" withDot={false}>
            <User className="h-3 w-3" aria-hidden /> {task.assignee_name}
          </StatusPill>
        )}
      </div>
    );
  };

  const isManager = role === "mentor" || role === "admin";

  /** Ação principal da linha: aluno marca como concluída; mentor/admin conclui registrando resultado. */
  const completeTask = (task: Task) => {
    if (role === "liberty") studentMarkMutation.mutate({ taskId: task.id, done: true });
    else openResultDialog(task.id);
  };

  /** Círculo de checkbox com alvo de toque de 44px. */
  const renderCheckbox = (task: Task, inProgress?: boolean) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        completeTask(task);
      }}
      disabled={studentMarkMutation.isPending}
      aria-label={role === "liberty" ? "Marcar como concluída" : "Concluir e registrar resultado"}
      title={role === "liberty" ? "Marcar como concluída" : "Concluir e registrar resultado"}
      className="group/check h-11 w-11 -my-2.5 -ml-2 flex items-center justify-center shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:opacity-50"
    >
      <span
        className={cn(
          "h-5 w-5 rounded-full border flex items-center justify-center transition-colors duration-ds-1 ease-ds",
          inProgress
            ? "border-status-blue/40 bg-status-blue/10 group-hover/check:border-status-green group-hover/check:bg-status-green/10"
            : "border-muted-foreground/40 group-hover/check:border-status-green group-hover/check:bg-status-green/10",
        )}
        aria-hidden
      >
        {inProgress && <PlayCircle className="h-3 w-3 text-status-blue" />}
      </span>
    </button>
  );

  /** Ações do mentor/admin em uma tarefa aberta (planejar, editar, remover). */
  const renderManagerActions = (task: Task) => (
    <div className="flex items-center shrink-0">
      <IconButton aria-label="Definir prazo e responsável" size="sm" onClick={() => setPlanTaskId(task.id)}>
        <CalendarIcon className="h-4 w-4" />
      </IconButton>
      <IconButton aria-label="Editar tarefa" size="sm" onClick={() => { setEditingId(task.id); setEditText(task.description); }}>
        <Pencil className="h-4 w-4" />
      </IconButton>
      <IconButton aria-label="Remover tarefa" size="sm" onClick={() => setDeleteTaskId(task.id)} className="hover:text-destructive hover:bg-destructive/10">
        <Trash2 className="h-4 w-4" />
      </IconButton>
    </div>
  );

  /** Rótulo clicável: aluno abre o planejamento; mentor/admin conclui (mesma ação do checkbox). */
  const renderLabel = (task: Task, children?: ReactNode) => (
    <button
      type="button"
      onClick={() => (role === "liberty" ? setPlanTaskId(task.id) : completeTask(task))}
      className="flex-1 min-w-0 text-left py-1 rounded-[var(--ds-radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
      title={role === "liberty" ? "Planejar tarefa" : "Concluir e registrar resultado"}
    >
      <p className="text-sm text-foreground break-words leading-snug">{task.description}</p>
      {children}
      <PlanChips task={task} />
    </button>
  );

  const renderInlineEdit = (task: Task) => (
    <div className="flex-1 flex items-center gap-2">
      <TextField
        aria-label="Descrição da tarefa"
        containerClassName="flex-1"
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && editText.trim()) updateMutation.mutate({ id: task.id, description: editText.trim() });
          if (e.key === "Escape") setEditingId(null);
        }}
        autoFocus
      />
      <IconButton
        aria-label="Salvar edição"
        size="sm"
        variant="primary"
        disabled={!editText.trim() || updateMutation.isPending}
        onClick={() => editText.trim() && updateMutation.mutate({ id: task.id, description: editText.trim() })}
      >
        <Save className="h-4 w-4" />
      </IconButton>
      <IconButton aria-label="Cancelar edição" size="sm" onClick={() => setEditingId(null)}>
        <X className="h-4 w-4" />
      </IconButton>
    </div>
  );

  const renderPending = (task: Task) => (
    <div key={task.id} className="flex items-center gap-3 px-3 py-2.5 min-h-[56px] rounded-ds border border-border bg-card">
      {renderCheckbox(task)}

      {editingId === task.id ? (
        renderInlineEdit(task)
      ) : (
        <>
          {renderLabel(task)}
          {role === "liberty" && (
            <Button variant="secondary" size="sm" onClick={() => setPlanTaskId(task.id)} title="Definir data e responsável" className="shrink-0">
              <CalendarIcon className="h-3.5 w-3.5" /> Planejar
            </Button>
          )}
          {isManager && renderManagerActions(task)}
        </>
      )}
    </div>
  );

  const renderInProgress = (task: Task) => (
    <div key={task.id} className="flex items-center gap-3 px-3 py-2.5 min-h-[56px] rounded-ds border border-status-blue/25 bg-status-blue/5">
      {renderCheckbox(task, true)}
      {editingId === task.id ? (
        renderInlineEdit(task)
      ) : (
        <>
          {renderLabel(task, <p className="text-xs text-status-blue mt-0.5">Em andamento</p>)}
          {role === "liberty" && (
            <Button variant="secondary" size="sm" onClick={() => setPlanTaskId(task.id)} title="Definir data e responsável" className="shrink-0">
              <CalendarIcon className="h-3.5 w-3.5" /> Planejar
            </Button>
          )}
          {isManager && renderManagerActions(task)}
        </>
      )}
    </div>
  );


  const renderAwaiting = (task: Task) => (
    <div key={task.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-3 py-2.5 min-h-[56px] rounded-ds border border-status-yellow/25 bg-status-yellow/5">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Clock className="h-5 w-5 text-status-yellow shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground break-words leading-snug">{task.description}</p>
          <p className="text-xs text-status-yellow mt-0.5">
            O aluno marcou como concluída. Aguardando validação do mentor
          </p>
        </div>
      </div>
      {isManager && (
        <div className="flex items-center gap-2 flex-wrap shrink-0 sm:justify-end">
          <Button size="sm" onClick={() => openResultDialog(task.id)} title="Validar e registrar resultado">
            <ShieldCheck className="h-3.5 w-3.5" /> Validar com resultado
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => validateMutation.mutate(task.id)}
            disabled={validateMutation.isPending}
            title="Apenas validar (sem resultado)"
          >
            Validar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => reopenMutation.mutate(task.id)}
            disabled={reopenMutation.isPending}
            className="text-muted-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reabrir
          </Button>
        </div>
      )}
      {role === "liberty" && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => studentMarkMutation.mutate({ taskId: task.id, done: false })}
          disabled={studentMarkMutation.isPending}
          className="text-muted-foreground shrink-0 self-start sm:self-auto"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Desmarcar
        </Button>
      )}
    </div>
  );

  const renderValidated = (task: Task) => (
    <div key={task.id} className="px-3 py-2.5 min-h-[56px] rounded-ds border border-border bg-card">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-status-green shrink-0" aria-hidden />
        <span className="text-sm text-muted-foreground line-through flex-1 min-w-0 break-words leading-snug">{task.description}</span>
        {isManager && !task.result_value && (
          <Button size="sm" variant="ghost" onClick={() => openResultDialog(task.id)} className="shrink-0">
            <Plus className="h-3.5 w-3.5" /> Resultado
          </Button>
        )}

        {isManager && (
          <div className="flex items-center shrink-0">
            <IconButton aria-label="Reabrir tarefa" size="sm" onClick={() => reopenMutation.mutate(task.id)} disabled={reopenMutation.isPending}>
              <RotateCcw className="h-4 w-4" />
            </IconButton>
            <IconButton aria-label="Remover tarefa" size="sm" onClick={() => setDeleteTaskId(task.id)} className="hover:text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        )}
      </div>
      {task.result_value && (
        <div className="mt-2 ml-8 p-3 rounded-ds bg-muted/50 border border-border space-y-1">
          <StatusPill tone={task.result_type === "quantitative" ? "success" : "info"} withDot={false}>
            {task.result_type === "quantitative" ? (
              <TrendingUp className="h-3 w-3" aria-hidden />
            ) : (
              <MessageSquare className="h-3 w-3" aria-hidden />
            )}
            {task.result_type === "quantitative" ? "Quantitativo" : "Qualitativo"}
          </StatusPill>
          <p className="text-sm text-foreground">
            {task.result_metric ? `${task.result_metric}: ` : ""}{task.result_value}
          </p>
          {(task as any).result_notes && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {(task as any).result_notes}
            </p>
          )}
        </div>
      )}
    </div>
  );

  const statusTone: Record<keyof typeof taskStatusConfig, PillTone> = {
    pending: "neutral",
    in_progress: "info",
    done_by_student: "warning",
    validated: "success",
  };

  const GroupHeader = ({ status, count }: { status: keyof typeof taskStatusConfig; count: number }) => (
    <div className="flex items-center gap-2 mb-2 mt-2 first:mt-0">
      <StatusPill tone={statusTone[status]}>{taskStatusConfig[status].label}</StatusPill>
      <span className="text-xs text-muted-foreground tabular-nums">({count})</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {sessionName && <p className="text-xs text-muted-foreground">{sessionName}</p>}

      {grouped.pending.length > 0 && (
        <div className="space-y-2">
          <GroupHeader status="pending" count={grouped.pending.length} />
          {grouped.pending.map(renderPending)}
        </div>
      )}

      {grouped.in_progress.length > 0 && (
        <div className="space-y-2">
          <GroupHeader status="in_progress" count={grouped.in_progress.length} />
          {grouped.in_progress.map(renderInProgress)}
        </div>
      )}

      {grouped.awaiting.length > 0 && (
        <div className="space-y-2">
          <GroupHeader status="done_by_student" count={grouped.awaiting.length} />
          {grouped.awaiting.map(renderAwaiting)}
        </div>
      )}

      {grouped.validated.length > 0 && (
        <div className="space-y-2">
          <GroupHeader status="validated" count={grouped.validated.length} />
          {grouped.validated.map(renderValidated)}
        </div>
      )}

      {!hideAdd && isManager && (
        <>
          {addingTask ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-ds border border-primary/25 bg-card">
              <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" aria-hidden />
              <TextField
                aria-label="Nova tarefa"
                containerClassName="flex-1"
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTaskText.trim()) addMutation.mutate(newTaskText.trim());
                  if (e.key === "Escape") { setAddingTask(false); setNewTaskText(""); }
                }}
                placeholder="Descreva a nova tarefa..."
                autoFocus
              />
              <Button
                size="sm"
                onClick={() => newTaskText.trim() && addMutation.mutate(newTaskText.trim())}
                disabled={!newTaskText.trim() || addMutation.isPending}
              >
                Adicionar
              </Button>
              <IconButton aria-label="Cancelar" size="sm" onClick={() => { setAddingTask(false); setNewTaskText(""); }}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setAddingTask(true)} className="text-primary">
              <Plus className="h-3.5 w-3.5" /> Adicionar tarefa
            </Button>
          )}
        </>
      )}

      {tasks.length === 0 && role === "liberty" && (
        <EmptyState compact icon={CheckCircle2} title="Nenhuma tarefa atribuída ainda" />
      )}

      <ConfirmDialog
        open={!!deleteTaskId}
        onOpenChange={(o) => !o && setDeleteTaskId(null)}
        title="Remover esta tarefa?"
        description="Essa ação não pode ser desfeita."
        confirmLabel="Remover"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTaskId && deleteMutation.mutate(deleteTaskId)}
      />

      {/* Result dialog (mentor) */}
      <BottomSheet
        open={!!resultTaskId}
        onOpenChange={(open) => { if (!open) setResultTaskId(null); }}
        title="Registrar resultado"
        description={tasks.find((t) => t.id === resultTaskId)?.description}
        size="sm"
        locked={saveResultMutation.isPending}
        footer={
          <Button
            onClick={() => saveResultMutation.mutate()}
            disabled={saveResultMutation.isPending || !resultValue.trim()}
            className="w-full sm:w-auto"
          >
            {saveResultMutation.isPending ? "Salvando..." : "Salvar resultado"}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Tipo de resultado</p>
            <div className="flex gap-2" role="group" aria-label="Tipo de resultado">
              <Chip active={resultType === "quantitative"} onClick={() => setResultType("quantitative")}>
                <TrendingUp className="h-3.5 w-3.5" aria-hidden /> Quantitativo
              </Chip>
              <Chip active={resultType === "qualitative"} onClick={() => setResultType("qualitative")}>
                <MessageSquare className="h-3.5 w-3.5" aria-hidden /> Qualitativo
              </Chip>
            </div>
          </div>

          {resultType === "quantitative" && (
            <TextField
              label="Métrica"
              hint="Ex: Faturamento, Clientes"
              value={resultMetric}
              onChange={(e) => setResultMetric(e.target.value)}
              placeholder="Ex: Faturamento"
            />
          )}

          <TextAreaField
            label={resultType === "quantitative" ? "Valor alcançado" : "Descreva o resultado"}
            value={resultValue}
            onChange={(e) => setResultValue(e.target.value)}
            className="resize-none h-20"
            placeholder={resultType === "quantitative" ? "Ex: R$ 50.000" : "Ex: Melhorou processos internos de vendas"}
          />

          <TextAreaField
            label="Observações"
            hint="Opcional"
            value={resultNotes}
            onChange={(e) => setResultNotes(e.target.value)}
            className="resize-none h-16"
            placeholder="Contexto, aprendizados, próximos passos..."
          />
        </div>
      </BottomSheet>

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
