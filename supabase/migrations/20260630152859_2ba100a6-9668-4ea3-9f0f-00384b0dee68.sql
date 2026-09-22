CREATE TABLE IF NOT EXISTS public.profile_user_lookup (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE
);
GRANT SELECT ON public.profile_user_lookup TO authenticated;
GRANT ALL ON public.profile_user_lookup TO service_role;
ALTER TABLE public.profile_user_lookup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile lookup" ON public.profile_user_lookup;
CREATE POLICY "Users can view own profile lookup" ON public.profile_user_lookup
FOR SELECT TO authenticated
USING (user_id = auth.uid());

INSERT INTO public.profile_user_lookup (profile_id, user_id)
SELECT id, user_id
FROM public.profiles
WHERE user_id IS NOT NULL
ON CONFLICT (profile_id) DO UPDATE SET user_id = EXCLUDED.user_id;

CREATE OR REPLACE FUNCTION public.sync_profile_user_lookup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    DELETE FROM public.profile_user_lookup WHERE profile_id = NEW.id;
  ELSE
    INSERT INTO public.profile_user_lookup (profile_id, user_id)
    VALUES (NEW.id, NEW.user_id)
    ON CONFLICT (profile_id) DO UPDATE SET user_id = EXCLUDED.user_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_profile_user_lookup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_profile_user_lookup() TO service_role;

DROP TRIGGER IF EXISTS sync_profile_user_lookup_on_profiles ON public.profiles;
CREATE TRIGGER sync_profile_user_lookup_on_profiles
AFTER INSERT OR UPDATE OF user_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_user_lookup();

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
      WHERE b.mentor_id IN (
        SELECT pul.profile_id
        FROM public.profile_user_lookup pul
        WHERE pul.user_id = auth.uid()
      )
    )
    OR id IN (
      SELECT b.mentor_id
      FROM public.bookings b
      WHERE b.liberty_id IN (
        SELECT pul.profile_id
        FROM public.profile_user_lookup pul
        WHERE pul.user_id = auth.uid()
      )
    )
  )
);

DROP POLICY IF EXISTS "Users can view relevant bookings" ON public.bookings;
DROP POLICY IF EXISTS "Mentors can insert own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Mentors can update own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Mentors can delete own bookings" ON public.bookings;

CREATE POLICY "Users can view relevant bookings" ON public.bookings
FOR SELECT TO authenticated
USING (
  liberty_id IN (
    SELECT pul.profile_id
    FROM public.profile_user_lookup pul
    WHERE pul.user_id = auth.uid()
  )
  OR mentor_id IN (
    SELECT pul.profile_id
    FROM public.profile_user_lookup pul
    WHERE pul.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Mentors can insert own bookings" ON public.bookings
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'mentor')
  AND mentor_id IN (
    SELECT pul.profile_id
    FROM public.profile_user_lookup pul
    WHERE pul.user_id = auth.uid()
  )
);

CREATE POLICY "Mentors can update own bookings" ON public.bookings
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'mentor')
  AND mentor_id IN (
    SELECT pul.profile_id
    FROM public.profile_user_lookup pul
    WHERE pul.user_id = auth.uid()
  )
)
WITH CHECK (
  mentor_id IN (
    SELECT pul.profile_id
    FROM public.profile_user_lookup pul
    WHERE pul.user_id = auth.uid()
  )
);

CREATE POLICY "Mentors can delete own bookings" ON public.bookings
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'mentor')
  AND mentor_id IN (
    SELECT pul.profile_id
    FROM public.profile_user_lookup pul
    WHERE pul.user_id = auth.uid()
  )
);

REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION IF EXISTS public.current_profile_id();