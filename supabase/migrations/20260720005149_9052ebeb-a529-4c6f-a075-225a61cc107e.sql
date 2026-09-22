
-- 1) system_config: restrict SELECT to admins only
DROP POLICY IF EXISTS "Config viewable by authenticated" ON public.system_config;
DROP POLICY IF EXISTS "Admins can read system config" ON public.system_config;
CREATE POLICY "Admins can read system config"
  ON public.system_config
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- 2) Revoke public EXECUTE on sensitive SECURITY DEFINER functions.
-- They remain callable by triggers and by service_role.
REVOKE EXECUTE ON FUNCTION public.refresh_nps_mentor_options() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_nps_mentor_options_trigger() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dispatch_booking_reminders() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public._notif_user_id(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fire_push_on_notification() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_booking_changes() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_report_pending_for_mentor() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_report_available() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_task_assigned() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_student_tool_added() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_profile_user_lookup() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, PUBLIC;
