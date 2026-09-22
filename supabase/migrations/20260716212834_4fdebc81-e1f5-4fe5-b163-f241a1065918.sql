CREATE OR REPLACE FUNCTION public.refresh_nps_mentor_options()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.nps_mentor_options WHERE true;

  INSERT INTO public.nps_mentor_options (profile_id, full_name, updated_at)
  SELECT DISTINCT
    p.id,
    COALESCE(NULLIF(btrim(p.full_name), ''), 'Mentor') AS full_name,
    now()
  FROM public.profiles p
  JOIN public.profile_user_lookup pul ON pul.profile_id = p.id
  JOIN public.user_roles ur ON ur.user_id = pul.user_id
  WHERE ur.role = ANY (ARRAY['mentor'::public.app_role, 'admin'::public.app_role, 'super_admin'::public.app_role])
    AND COALESCE(p.is_active, true) = true;
END;
$function$;