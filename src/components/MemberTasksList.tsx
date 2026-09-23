import { useState } from "react";
import {
  CheckCircle2, Clock, Pencil, Trash2, X, Save, RotateCcw, ShieldCheck,
  TrendingUp, MessageSquare, Calendar as CalendarIcon, User, Plus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  BottomSheet,
  Chip,
  ConfirmDialog,
  IconButton,
  StatusPill,
  TextAreaField,
  TextField,
} from "@/components/ds";
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
  planned_date?: string | null;
  due_date?: string | null;
  assignee_name?: string | null;
}

interface Props {
  tasks: Task[];
  sessionNameFor: (bookingId: string) => string;
  canManage: boolean; // mentor or admin
  onChanged: () => void;
  role?: "mentor" | "admin";
}

/**
 * Flat interactive list of member tasks with session context.
 * Any mentor/admin can act on any task (not just the creator).
 * Clicking the circle on a pending task opens the result dialog.
 */
export const MemberTasksList = ({ tasks, sessionNameFor, canManage, onChanged, role = "mentor" }: Props) => {
  const { profile } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [planTaskId, setPlanTaskId] = useState<string | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);

  const [resultTaskId, setResultTaskId] = useState<string | null>(null);
  const [resultType, setResultType] = useState<"quantitative" | "qualitative">("qualitative");
  const [resultValue, setResultValue] = useState("");
  const [resultMetric, setResultMetric] = useState("");

  const openResult = (task: Task) => {
    setResultTaskId(task.id);
    setResultType((task.result_type as any) || "qualitative");
    setResultValue(task.result_value || "");
    setResultMetric(task.result_metric || "");
  };

  const validateOnly = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("session_tasks")
        .update({ is_completed: true, validated_at: new Date().toISOString(), validated_by: profile?.id || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Tarefa validada!"); onChanged(); },
    onError: (e: any) => toast.error("Erro ao validar: " + (e?.message || "")),
  });

  const reopen = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("session_tasks").update({
        is_completed: false, completed_by_role: null, completed_at: null,
        validated_at: null, validated_by: null,
        result_value: null, result_metric: null, result_type: null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Tarefa reaberta"); onChanged(); },
    onError: (e: any) => toast.error("Erro ao reabrir: " + (e?.message || "")),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("session_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Tarefa removida"); onChanged(); },
    onError: (e: any) => toast.error("Erro ao remover: " + (e?.message || "")),
  });

  const updateDescription = useMutation({
    mutationFn: async ({ id, description }: { id: string; description: string }) => {
      const { error } = await supabase.from("session_tasks").update({ description }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Tarefa editada!"); setEditingId(null); onChanged(); },
    onError: (e: any) => toast.error("Erro ao editar: " + (e?.message || "")),
  });

  const clearResult = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("session_tasks")
        .update({ result_type: null, result_value: null, result_metric: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Resultado removido"); onChanged(); },
    onError: (e: any) => toast.error("Erro ao remover resultado: " + (e?.message || "")),
  });

  const saveResult = useMutation({
    mutationFn: async () => {
      if (!resultTaskId) throw new Error("No task");
      const { error } = await supabase.from("session_tasks").update({
        is_completed: true,
        validated_at: new Date().toISOString(),
        validated_by: profile?.id || null,
        result_type: resultType,
        result_value: resultValue.trim() || null,
        result_metric: resultType === "quantitative" ? resultMetric.trim() || null : null,
        completed_at: new Date().toISOString(),
      }).eq("id", resultTaskId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Resultado registrado!");
      setResultTaskId(null); setResultValue(""); setResultMetric("");
      onChanged();
    },
    onError: (e: any) => toast.error("Erro ao registrar resultado: " + (e?.message || "")),
  });

  const toneFor = (status: TaskStatus): "neutral" | "info" | "pending" | "success" => {
    switch (status) {
      case "pending":
        return "neutral";
      case "in_progress":
        return "info";
      case "done_by_student":
        return "pending";
      case "validated":
        return "success";
      default: {
        const exhaustive: never = status;
        return exhaustive;
      }
    }
  };

  const renderStatusControl = (t: Task, status: TaskStatus) => {
    if (!canManage) return <StatusPill tone={toneFor(status)} size="sm">{taskStatusConfig[status].label}</StatusPill>;
    if (status === "pending" || status === "in_progress") {
      return (
        <button
          type="button"
          onClick={() => openResult(t)}
          aria-label="Concluir e registrar resultado"
          title="Concluir e registrar resultado"
          className="hit-44 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-muted-foreground/40 transition-colors duration-ds-1 hover:border-status-green hover:bg-status-green/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      );
    }
    if (status === "done_by_student") {
      return (
        <button
          type="button"
          onClick={() => openResult(t)}
          aria-label="Validar com resultado"
          title="Validar com resultado"
          className="hit-44 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-status-yellow/60 bg-status-yellow/10 transition-colors duration-ds-1 hover:bg-status-yellow/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Clock className="h-3.5 w-3.5 text-status-yellow" />
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => reopen.mutate(t.id)}
        disabled={reopen.isPending}
        aria-label="Reabrir tarefa"
        title="Reabrir tarefa"
        className="hit-44 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-status-green bg-status-green/15 transition-colors duration-ds-1 hover:bg-status-green/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <CheckCircle2 className="h-4 w-4 text-status-green" />
      </button>
    );
  };

  const deleteTask = tasks.find((x) => x.id === deleteTaskId) ?? null;

  return (
    <>
      <ul className="space-y-2" aria-label="Tarefas">
        {tasks.map((t) => {
          const status = getTaskStatus(t);
          const cfg = taskStatusConfig[status];
          const sessionName = sessionNameFor(t.booking_id);
          const isEditing = editingId === t.id;
          const today = new Date().toISOString().slice(0, 10);
          const overdue = !!t.due_date && t.due_date < today && status !== "validated";

          return (
            <li key={t.id} className="flex items-start gap-3 rounded-ds border border-border bg-card px-3 py-2.5">
              <div className="mt-0.5 shrink-0">{renderStatusControl(t, status)}</div>

              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <TextField
                      aria-label="Descrição da tarefa"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && editText.trim()) updateDescription.mutate({ id: t.id, description: editText.trim() });
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                      containerClassName="flex-1"
                      className="h-9"
                    />
                    <IconButton
                      aria-label="Salvar descrição"
                      size="sm"
                      className="text-primary"
                      disabled={updateDescription.isPending || !editText.trim()}
                      onClick={() => editText.trim() && updateDescription.mutate({ id: t.id, description: editText.trim() })}
                    >
                      <Save className="h-4 w-4" />
                    </IconButton>
                    <IconButton aria-label="Cancelar edição" size="sm" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" />
                    </IconButton>
                  </div>
                ) : (
                  <>
                    <p className={`text-sm break-words ${status === "validated" ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {t.description}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="truncate max-w-[220px]">{sessionName}</span>
                      <StatusPill tone={toneFor(status)} size="sm">{cfg.label}</StatusPill>
                      {t.due_date && (
                        <StatusPill tone={overdue ? "danger" : "neutral"} size="sm" withDot={false}>
                          <Clock className="h-3 w-3" aria-hidden />
                          Prazo {format(parseISO(t.due_date), "dd 'de' MMM", { locale: ptBR })}
                          {overdue && " · vencido"}
                        </StatusPill>
                      )}
                      {t.assignee_name && (
                        <StatusPill tone="neutral" size="sm" withDot={false}>
                          <User className="h-3 w-3" aria-hidden /> {t.assignee_name}
                        </StatusPill>
                      )}
                    </div>
                    {t.result_value && (
                      <div className="mt-2 rounded-ds border border-border bg-muted/40 p-2.5">
                        <div className="mb-0.5 flex items-center gap-1.5">
                          {t.result_type === "quantitative"
                            ? <TrendingUp className="h-3.5 w-3.5 text-status-green" aria-hidden />
                            : <MessageSquare className="h-3.5 w-3.5 text-status-blue" aria-hidden />}
                          <span className="ds-kicker">{t.result_type === "quantitative" ? "Quantitativo" : "Qualitativo"}</span>
                          {canManage && (
                            <IconButton
                              aria-label="Remover resultado"
                              size="sm"
                              className="ml-auto h-7 w-7 hover:text-destructive"
                              disabled={clearResult.isPending}
                              onClick={() => clearResult.mutate(t.id)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </IconButton>
                          )}
                        </div>
                        <p className="text-sm text-foreground">
                          {t.result_metric ? `${t.result_metric}: ` : ""}{t.result_value}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {canManage && !isEditing && (
                <div className="flex items-center gap-0.5 shrink-0 flex-wrap justify-end">
                  {status === "done_by_student" && (
                    <Button variant="ghost" size="sm" onClick={() => validateOnly.mutate(t.id)} disabled={validateOnly.isPending} title="Apenas validar, sem resultado">
                      Validar
                    </Button>
                  )}
                  {status === "validated" && !t.result_value && (
                    <Button variant="ghost" size="sm" className="text-primary" onClick={() => openResult(t)}>
                      <Plus className="h-3.5 w-3.5" /> Resultado
                    </Button>
                  )}
                  {status !== "pending" && (
                    <IconButton aria-label="Reabrir tarefa" size="sm" onClick={() => reopen.mutate(t.id)} disabled={reopen.isPending}>
                      <RotateCcw className="h-4 w-4" />
                    </IconButton>
                  )}
                  <IconButton aria-label="Definir data e prazo" size="sm" onClick={() => setPlanTaskId(t.id)}>
                    <CalendarIcon className="h-4 w-4" />
                  </IconButton>
                  <IconButton aria-label="Editar tarefa" size="sm" onClick={() => { setEditingId(t.id); setEditText(t.description); }}>
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                  <IconButton aria-label="Remover tarefa" size="sm" className="hover:text-destructive" onClick={() => setDeleteTaskId(t.id)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <TaskPlanDialog
        task={planTaskId ? (tasks.find((x) => x.id === planTaskId) as any) : null}
        onOpenChange={(o) => { if (!o) { setPlanTaskId(null); onChanged(); } }}
        role={role}
      />

      <ConfirmDialog
        open={!!deleteTaskId}
        onOpenChange={(o) => { if (!o) setDeleteTaskId(null); }}
        title="Remover esta tarefa?"
        description={deleteTask ? `"${deleteTask.description}" será removida da lista do membro.` : undefined}
        confirmLabel="Remover"
        destructive
        onConfirm={() => {
          const id = deleteTaskId;
          setDeleteTaskId(null);
          if (id) del.mutate(id);
        }}
      />

      <BottomSheet
        open={!!resultTaskId}
        onOpenChange={(o) => !o && setResultTaskId(null)}
        title={
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-status-green" aria-hidden /> Registrar resultado da tarefa
          </span>
        }
        description="A tarefa é marcada como concluída e validada com o resultado informado."
        size="sm"
        locked={saveResult.isPending}
        footer={
          <>
            <Button variant="ghost" onClick={() => setResultTaskId(null)} disabled={saveResult.isPending}>Cancelar</Button>
            <Button onClick={() => saveResult.mutate()} disabled={saveResult.isPending || !resultValue.trim()}>
              {saveResult.isPending ? "Salvando" : "Salvar resultado"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-2" role="group" aria-label="Tipo de resultado">
            <Chip active={resultType === "qualitative"} onClick={() => setResultType("qualitative")} className="flex-1 justify-center">
              <MessageSquare className="h-3.5 w-3.5" aria-hidden /> Qualitativo
            </Chip>
            <Chip active={resultType === "quantitative"} onClick={() => setResultType("quantitative")} className="flex-1 justify-center">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden /> Quantitativo
            </Chip>
          </div>
          {resultType === "quantitative" && (
            <TextField
              label="Métrica (opcional)"
              value={resultMetric}
              onChange={(e) => setResultMetric(e.target.value)}
              placeholder="Ex.: Faturamento, Leads captados"
            />
          )}
          <TextAreaField
            label={resultType === "quantitative" ? "Valor ou crescimento" : "Descreva o resultado alcançado"}
            value={resultValue}
            onChange={(e) => setResultValue(e.target.value)}
            rows={3}
            placeholder={resultType === "quantitative" ? "Ex.: +50% de vendas, 20 novos leads" : "Ex.: Cultura da empresa mais clara, processos definidos"}
          />
        </div>
      </BottomSheet>
    </>
  );
};
