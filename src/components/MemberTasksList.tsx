import { useState } from "react";
import {
  CheckCircle2, Clock, Pencil, Trash2, X, Save, RotateCcw, ShieldCheck,
  TrendingUp, MessageSquare, Calendar as CalendarIcon, User,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { getTaskStatus, taskStatusConfig } from "@/lib/taskStatus";
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

  return (
    <>
      <div className="space-y-1.5">
        {tasks.map((t) => {
          const status = getTaskStatus(t);
          const cfg = taskStatusConfig[status];
          const sessionName = sessionNameFor(t.booking_id);
          const isEditing = editingId === t.id;

          return (
            <div key={t.id} className="flex items-start gap-3 px-3 py-2 rounded-lg border border-border bg-background/40">
              {/* Interactive circle / status icon */}
              {canManage ? (
                status === "pending" ? (
                  <button
                    onClick={() => openResult(t)}
                    title="Concluir e registrar resultado"
                    className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 hover:border-status-green hover:bg-status-green/10 transition-colors shrink-0 mt-0.5"
                  />
                ) : status === "done_by_student" ? (
                  <button
                    onClick={() => openResult(t)}
                    title="Validar com resultado"
                    className="w-5 h-5 rounded-full border-2 border-status-yellow/60 bg-status-yellow/10 hover:bg-status-yellow/20 transition-colors shrink-0 mt-0.5 flex items-center justify-center"
                  >
                    <Clock className="h-3 w-3 text-status-yellow" />
                  </button>
                ) : (
                  <button
                    onClick={() => reopen.mutate(t.id)}
                    disabled={reopen.isPending}
                    title="Reabrir tarefa"
                    className="w-5 h-5 rounded-full border-2 border-status-green bg-status-green/15 hover:bg-status-green/25 transition-colors shrink-0 mt-0.5 flex items-center justify-center"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-status-green" />
                  </button>
                )
              ) : (
                <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-semibold mt-0.5 shrink-0 ${cfg.classes}`}>
                  {cfg.label}
                </span>
              )}

              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      autoFocus
                      className="flex-1 bg-transparent text-sm text-foreground border-b border-primary/30 focus:outline-none"
                    />
                    <button
                      onClick={() => editText.trim() && updateDescription.mutate({ id: t.id, description: editText.trim() })}
                      className="p-1 rounded hover:bg-muted"
                      title="Salvar"
                    >
                      <Save className="h-3.5 w-3.5 text-primary" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1 rounded hover:bg-muted" title="Cancelar">
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                ) : (
                  <>
                    <p className={`text-sm break-words ${status === "validated" ? "text-foreground/70 line-through" : "text-foreground"}`}>
                      {t.description}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{sessionName}</span>
                      <span className={`px-1.5 py-0.5 rounded border font-semibold ${cfg.classes}`}>{cfg.label}</span>
                      {/* planned_date pill removed — only due_date (Prazo) is shown to avoid duplicate deadline chips */}

                      {t.due_date && (() => {
                        const today = new Date().toISOString().slice(0, 10);
                        const overdue = t.due_date! < today && status !== "validated";
                        return (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border bg-muted/50 text-muted-foreground border-border">
                            <Clock className="h-2.5 w-2.5" />
                            Prazo {format(parseISO(t.due_date!), "dd 'de' MMM", { locale: ptBR })}
                            {overdue && " · vencido"}
                          </span>
                        );
                      })()}
                      {t.assignee_name && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                          <User className="h-2.5 w-2.5" /> {t.assignee_name}
                        </span>
                      )}
                    </p>
                    {t.result_value && (
                      <div className="mt-2 p-2 rounded-lg bg-muted/50 border border-border">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {t.result_type === "quantitative"
                            ? <TrendingUp className="h-3 w-3 text-status-green" />
                            : <MessageSquare className="h-3 w-3 text-status-blue" />}
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                            {t.result_type === "quantitative" ? "Quantitativo" : "Qualitativo"}
                          </span>
                          {canManage && (
                            <button
                              onClick={() => clearResult.mutate(t.id)}
                              className="ml-auto text-[10px] text-muted-foreground hover:text-destructive"
                              title="Remover resultado"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-foreground">
                          {t.result_metric ? `${t.result_metric}: ` : ""}{t.result_value}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {canManage && !isEditing && (
                <div className="flex items-center gap-1 shrink-0">
                  {status === "done_by_student" && (
                    <button
                      onClick={() => validateOnly.mutate(t.id)}
                      className="text-[10px] px-2 py-1 rounded bg-muted text-foreground hover:bg-muted/70"
                      title="Apenas validar"
                    >
                      Validar
                    </button>
                  )}
                  {status === "validated" && !t.result_value && (
                    <button
                      onClick={() => openResult(t)}
                      className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20"
                    >
                      + Resultado
                    </button>
                  )}
                  {status !== "pending" && (
                    <button
                      onClick={() => reopen.mutate(t.id)}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      title="Reabrir"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setPlanTaskId(t.id)}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Definir data e prazo"
                  >
                    <CalendarIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => { setEditingId(t.id); setEditText(t.description); }}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => { if (confirm("Remover esta tarefa?")) del.mutate(t.id); }}
                    className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    title="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <TaskPlanDialog
        task={planTaskId ? (tasks.find((x) => x.id === planTaskId) as any) : null}
        onOpenChange={(o) => { if (!o) { setPlanTaskId(null); onChanged(); } }}
        role={role}
      />

      <Dialog open={!!resultTaskId} onOpenChange={(o) => !o && setResultTaskId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-status-green" /> Registrar resultado da tarefa
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                onClick={() => setResultType("qualitative")}
                className={`flex-1 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                  resultType === "qualitative"
                    ? "bg-status-blue/15 text-status-blue border-status-blue/30"
                    : "bg-card text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5 inline mr-1" /> Qualitativo
              </button>
              <button
                onClick={() => setResultType("quantitative")}
                className={`flex-1 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                  resultType === "quantitative"
                    ? "bg-status-green/15 text-status-green border-status-green/30"
                    : "bg-card text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                <TrendingUp className="h-3.5 w-3.5 inline mr-1" /> Quantitativo
              </button>
            </div>
            {resultType === "quantitative" && (
              <div>
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Métrica (opcional)</label>
                <input
                  value={resultMetric}
                  onChange={(e) => setResultMetric(e.target.value)}
                  placeholder="Ex.: Faturamento, Leads captados…"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            )}
            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                {resultType === "quantitative" ? "Valor / crescimento" : "Descreva o resultado alcançado"}
              </label>
              <textarea
                value={resultValue}
                onChange={(e) => setResultValue(e.target.value)}
                rows={3}
                placeholder={resultType === "quantitative" ? "Ex.: +50% de vendas, 20 novos leads…" : "Ex.: Cultura da empresa mais clara, processos definidos…"}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setResultTaskId(null)}
                className="px-3 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={() => saveResult.mutate()}
                disabled={saveResult.isPending || !resultValue.trim()}
                className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                Salvar resultado
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
