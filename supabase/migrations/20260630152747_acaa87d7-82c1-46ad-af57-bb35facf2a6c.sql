CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated, service_role;

DROP POLICY IF EXISTS "Mentors can view related profiles" ON public.profiles;

CREATE POLICY "Mentors can view related profiles" ON public.profiles
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'mentor')
  AND (
    user_id = auth.uid()
    OR id IN (
      SELECT b.liberty_id
      FROM public.bookings b
      WHERE b.mentor_id = public.current_profile_id()
    )
    OR id IN (
      SELECT b.mentor_id
      FROM public.bookings b
      WHERE b.liberty_id = public.current_profile_id()
    )
  )
);

DROP POLICY IF EXISTS "Users can view relevant bookings" ON public.bookings;
DROP POLICY IF EXISTS "Mentors can update own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Mentors can insert own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Mentors can delete own bookings" ON public.bookings;

CREATE POLICY "Users can view relevant bookings" ON public.bookings
FOR SELECT TO authenticated
USING (
  liberty_id = public.current_profile_id()
  OR mentor_id = public.current_profile_id()
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Mentors can insert own bookings" ON public.bookings
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'mentor')
  AND mentor_id = public.current_profile_id()
);

CREATE POLICY "Mentors can update own bookings" ON public.bookings
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'mentor')
  AND mentor_id = public.current_profile_id()
)
WITH CHECK (
  mentor_id = public.current_profile_id()
);

CREATE POLICY "Mentors can delete own bookings" ON public.bookings
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'mentor')
  AND mentor_id = public.current_profile_id()
);