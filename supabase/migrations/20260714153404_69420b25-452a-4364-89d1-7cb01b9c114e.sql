REVOKE ALL ON FUNCTION public.fire_push_on_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fire_push_on_notification() TO service_role;