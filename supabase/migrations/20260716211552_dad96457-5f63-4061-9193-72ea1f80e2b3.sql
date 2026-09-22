
-- Fix: mentor viewing other mentors' names (falls back to "Mentor").
-- Root cause: policy used EXISTS on profile_user_lookup + user_roles,
-- both RLS-restricted to auth.uid(), so the subquery was always empty
-- for other users. Replace with SECURITY DEFINER helpers.

CREATE OR REPLACE FUNCTION app_private.profile_has_role(_profile_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.id = _profile_id
      AND (ur.role = _role OR (_role = 'admin' AND ur.role = 'super_admin'))
  );
$$;

GRANT EXECUTE ON FUNCTION app_private.profile_has_role(uuid, public.app_role) TO authenticated, anon;

-- Rewrite "Mentors can view other mentors" using the SECURITY DEFINER helper
DROP POLICY IF EXISTS "Mentors can view other mentors" ON public.profiles;
CREATE POLICY "Mentors can view other mentors"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  app_private.has_role(auth.uid(), 'mentor') AND
  app_private.profile_has_role(profiles.id, 'mentor')
);
