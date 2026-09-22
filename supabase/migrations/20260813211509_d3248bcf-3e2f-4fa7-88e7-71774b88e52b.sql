REVOKE EXECUTE ON FUNCTION public.enforce_member_booking_rules() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_member_booking_rules() TO service_role;