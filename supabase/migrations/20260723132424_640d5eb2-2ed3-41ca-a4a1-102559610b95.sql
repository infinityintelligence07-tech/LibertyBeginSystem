
-- Lock down SECURITY DEFINER functions: revoke public execute; trigger/cron
-- functions don't need to be callable by API roles at all.
REVOKE ALL ON FUNCTION public.dispatch_availability_nudges() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_nps_mentor_options() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_nps_mentor_options_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._notif_user_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_booking_changes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fire_push_on_notification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_student_tool_added() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_report_available() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_task_assigned() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_booking_reminders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_report_pending_for_mentor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_profile_user_lookup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_cancellation_policy() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_points_on_testimonial() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_points_on_task_completed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_points_on_session_completed() FROM PUBLIC, anon, authenticated;

-- Keep the two functions that must be callable by signed-in users:
--  - has_role: used inside RLS policies, needs to be executable by authenticated
--  - get_ranking_totals: called via RPC by the ranking UI
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_ranking_totals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ranking_totals() TO authenticated, service_role;

-- update_updated_at_column is SECURITY INVOKER, but revoke anyway to silence linter.
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
