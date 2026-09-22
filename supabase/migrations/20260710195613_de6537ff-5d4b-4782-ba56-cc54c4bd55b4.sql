CREATE OR REPLACE FUNCTION public.get_nps_mentor_options()
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    p.id,
    COALESCE(NULLIF(btrim(p.full_name), ''), p.email, 'Mentor') AS full_name
  FROM public.profiles p
  JOIN public.profile_user_lookup pul ON pul.profile_id = p.id
  JOIN public.user_roles ur ON ur.user_id = pul.user_id
  WHERE ur.role = ANY (ARRAY['mentor'::public.app_role, 'admin'::public.app_role, 'super_admin'::public.app_role])
    AND COALESCE(p.is_active, true) = true
  ORDER BY full_name;
$$;

REVOKE ALL ON FUNCTION public.get_nps_mentor_options() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_nps_mentor_options() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_nps_mentor_options() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_nps_mentor_options() TO service_role;