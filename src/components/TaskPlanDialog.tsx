import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar as CalendarIcon, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface PlanTask {
  id: string;
  description: string;
  is_completed: boolean | null;
  in_progress?: boolean | null;
  planned_date?: string | null;
  due_date?: string | null;
  assignee_name?: string | null;
}

interface Props {
  task: PlanTask | null;
  onOpenChange: (open: boolean) => void;
  invalidateKeys?: unknown[][];
  role?: "liberty" | "mentor" | "admin";
}

export const TaskPlanDialog = ({ task, onOpenChange, invalidateKeys = [] }: Props) => {
  const qc = useQueryClient();
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (!task) return;
    setDueDate(task.due_date || "");
  }, [task?.id]);

  const invalidateAll = () => {
    // Broad invalidation — refresh every task-related query without needing a page reload.
    qc.invalidateQueries();
    invalidateKeys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!task) return;
      const { error } = await supabase
        .from("session_tasks")
        .update({ due_date: dueDate || null })
        .eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidateAll();
      toast.success(dueDate ? "Prazo definido!" : "Prazo removido");
      onOpenChange(false);
    },
    onError: () => toast.error("Erro ao salvar prazo"),
  });

  return (
    <Dialog open={!!task} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Definir prazo</DialogTitle>
        </DialogHeader>

        {task && (
          <div className="space-y-4">
            <p className="text-sm text-foreground bg-muted/40 border border-border rounded-lg p-3">
              {task.description}
            </p>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block font-medium flex items-center gap-1.5">
                <CalendarIcon className="h-3 w-3" /> Prazo
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary/40 focus:outline-none"
              />
              {dueDate && (
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-[11px] text-muted-foreground">
                    {format(new Date(dueDate + "T00:00:00"), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </p>
                  <button
                    onClick={() => setDueDate("")}
                    className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <X className="h-3 w-3" /> Limpar
                  </button>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-2">
                Só o prazo. O restante (quem vai fazer, status) é definido depois pelo aluno.
              </p>
            </div>

            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="btn-silver w-full text-sm flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Save className="h-4 w-4" /> {save.isPending ? "Salvando..." : "Salvar prazo"}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
