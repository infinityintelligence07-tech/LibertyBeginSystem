
-- Any mentor can view/manage tasks for any booking (mentors share knowledge across the platform)
DROP POLICY IF EXISTS "Mentors can manage own session_tasks" ON public.session_tasks;
CREATE POLICY "Mentors can manage all session_tasks" ON public.session_tasks
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'mentor'::app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'mentor'::app_role));

-- Allow mentors and admins to insert notifications for any user (e.g., NPS send, alerts to students)
CREATE POLICY "Staff can create notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    app_private.has_role(auth.uid(), 'mentor'::app_role)
    OR app_private.has_role(auth.uid(), 'admin'::app_role)
    OR app_private.has_role(auth.uid(), 'super_admin'::app_role)
  );
