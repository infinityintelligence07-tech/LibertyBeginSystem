
-- 1. Allow all mentors to VIEW any booking report (edits still restricted to owner)
CREATE POLICY "Mentors can view all reports"
ON public.booking_reports
FOR SELECT
TO authenticated
USING (app_private.has_role(auth.uid(), 'mentor'::app_role));

-- 2. Add in_progress state for tasks
ALTER TABLE public.session_tasks
ADD COLUMN IF NOT EXISTS in_progress boolean NOT NULL DEFAULT false;
