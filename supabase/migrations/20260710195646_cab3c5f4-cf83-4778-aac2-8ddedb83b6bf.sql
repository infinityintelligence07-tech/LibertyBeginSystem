DROP FUNCTION IF EXISTS public.get_nps_mentor_options();

CREATE TABLE IF NOT EXISTS public.nps_mentor_options (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.nps_mentor_options TO authenticated;
GRANT ALL ON public.nps_mentor_options TO service_role;

ALTER TABLE public.nps_mentor_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view NPS mentor options" ON public.nps_mentor_options;
CREATE POLICY "Authenticated users can view NPS mentor options"
ON public.nps_mentor_options
FOR SELECT
TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.refresh_nps_mentor_options()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.nps_mentor_options;

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
$$;

REVOKE ALL ON FUNCTION public.refresh_nps_mentor_options() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_nps_mentor_options() FROM anon;
REVOKE ALL ON FUNCTION public.refresh_nps_mentor_options() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_nps_mentor_options() TO service_role;

CREATE OR REPLACE FUNCTION public.sync_nps_mentor_options_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_nps_mentor_options();
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_nps_mentor_options_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_nps_mentor_options_trigger() FROM anon;
REVOKE ALL ON FUNCTION public.sync_nps_mentor_options_trigger() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_nps_mentor_options_trigger() TO service_role;

SELECT public.refresh_nps_mentor_options();

DROP TRIGGER IF EXISTS trg_sync_nps_mentor_options_profiles ON public.profiles;
CREATE TRIGGER trg_sync_nps_mentor_options_profiles
AFTER INSERT OR UPDATE OF full_name, is_active, user_id OR DELETE ON public.profiles
FOR EACH STATEMENT
EXECUTE FUNCTION public.sync_nps_mentor_options_trigger();

DROP TRIGGER IF EXISTS trg_sync_nps_mentor_options_roles ON public.user_roles;
CREATE TRIGGER trg_sync_nps_mentor_options_roles
AFTER INSERT OR UPDATE OF user_id, role OR DELETE ON public.user_roles
FOR EACH STATEMENT
EXECUTE FUNCTION public.sync_nps_mentor_options_trigger();

DROP TRIGGER IF EXISTS trg_sync_nps_mentor_options_lookup ON public.profile_user_lookup;
CREATE TRIGGER trg_sync_nps_mentor_options_lookup
AFTER INSERT OR UPDATE OF profile_id, user_id OR DELETE ON public.profile_user_lookup
FOR EACH STATEMENT
EXECUTE FUNCTION public.sync_nps_mentor_options_trigger();