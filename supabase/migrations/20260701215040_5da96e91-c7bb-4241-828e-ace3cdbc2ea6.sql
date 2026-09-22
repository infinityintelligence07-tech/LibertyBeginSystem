ALTER TABLE public.session_tasks
  ADD COLUMN IF NOT EXISTS planned_date date,
  ADD COLUMN IF NOT EXISTS assignee_name text;

CREATE INDEX IF NOT EXISTS session_tasks_planned_date_idx
  ON public.session_tasks(planned_date);