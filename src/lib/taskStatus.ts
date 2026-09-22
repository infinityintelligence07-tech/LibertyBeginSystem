// Centralized helpers for the task status flow.
//
// Statuses (order):
//   pending             -> !is_completed && !in_progress
//   in_progress         -> !is_completed && in_progress
//   done_by_student     -> is_completed && completed_by_role === 'liberty' && !validated_at
//   validated           -> validated_at IS NOT NULL

export type TaskStatus = "pending" | "in_progress" | "done_by_student" | "validated";

export interface TaskLike {
  is_completed?: boolean | null;
  in_progress?: boolean | null;
  completed_by_role?: string | null;
  validated_at?: string | null;
}

export const getTaskStatus = (task: TaskLike): TaskStatus => {
  if (!task.is_completed) return task.in_progress ? "in_progress" : "pending";
  if (task.validated_at) return "validated";
  // Completed but not yet validated → sempre "aguardando validação",
  // independente de quem marcou (aluno, mentor ou admin).
  return "done_by_student";
};

export const taskStatusConfig: Record<TaskStatus, { label: string; classes: string }> = {
  pending: { label: "Pendente", classes: "bg-muted text-muted-foreground border-border" },
  in_progress: {
    label: "Em andamento",
    classes: "bg-status-blue/15 text-status-blue border-status-blue/30",
  },
  done_by_student: {
    label: "Aguardando validação",
    classes: "bg-status-yellow/15 text-status-yellow border-status-yellow/30",
  },
  validated: { label: "Concluída", classes: "bg-status-green/15 text-status-green border-status-green/30" },
};

export const countByStatus = (tasks: TaskLike[]) => {
  let pending = 0;
  let in_progress = 0;
  let awaiting = 0;
  let validated = 0;
  tasks.forEach((t) => {
    const s = getTaskStatus(t);
    if (s === "pending") pending++;
    else if (s === "in_progress") in_progress++;
    else if (s === "done_by_student") awaiting++;
    else validated++;
  });
  return { pending, in_progress, awaiting, validated, total: tasks.length };
};
