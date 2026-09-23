import { useEffect, useState } from "react";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottomSheet, TextField } from "@/components/ds";
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
    <BottomSheet
      open={!!task}
      onOpenChange={onOpenChange}
      title="Definir prazo"
      description="Só o prazo. O restante (quem vai fazer, status) é definido depois pelo aluno."
      size="sm"
      locked={save.isPending}
      footer={
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full sm:w-auto">
          <Save className="h-4 w-4" /> {save.isPending ? "Salvando..." : "Salvar prazo"}
        </Button>
      }
    >
      {task && (
        <div className="space-y-4">
          <p className="text-sm text-foreground bg-muted/40 border border-border rounded-ds p-3">
            {task.description}
          </p>

          <TextField
            label="Prazo"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            hint={dueDate ? format(new Date(dueDate + "T00:00:00"), "EEEE, dd 'de' MMMM", { locale: ptBR }) : undefined}
          />
          {dueDate && (
            <Button variant="ghost" size="sm" onClick={() => setDueDate("")} className="-mt-2">
              <X className="h-3.5 w-3.5" /> Limpar prazo
            </Button>
          )}
        </div>
      )}
    </BottomSheet>
  );
};
