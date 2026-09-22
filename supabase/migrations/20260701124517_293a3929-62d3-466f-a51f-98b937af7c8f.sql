CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = _role OR (_role = 'admin' AND role = 'super_admin'))
  )
$$;

CREATE OR REPLACE FUNCTION public.profile_has_role(_profile_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profile_user_lookup pul
    JOIN public.user_roles ur ON ur.user_id = pul.user_id
    WHERE pul.profile_id = _profile_id
      AND ur.role = _role
  )
$$;

INSERT INTO public.profile_user_lookup (profile_id, user_id)
SELECT id, user_id
FROM public.profiles
WHERE user_id IS NOT NULL
ON CONFLICT (profile_id) DO UPDATE
SET user_id = EXCLUDED.user_id;

DROP POLICY IF EXISTS "Admins can manage all bookings" ON public.bookings;
CREATE POLICY "Admins can manage all bookings"
ON public.bookings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Libertys can insert own bookings" ON public.bookings;
CREATE POLICY "Libertys can insert own bookings"
ON public.bookings
FOR INSERT
TO authenticated
WITH CHECK (
  liberty_id IN (
    SELECT pul.profile_id
    FROM public.profile_user_lookup pul
    WHERE pul.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles"
ON public.profiles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Mentors can view related profiles" ON public.profiles;

DROP POLICY IF EXISTS "Mentors can view other mentors" ON public.profiles;
CREATE POLICY "Mentors can view other mentors"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'mentor')
  AND public.profile_has_role(id, 'mentor')
);

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_sync_profile_user_lookup ON public.profiles;
CREATE TRIGGER trg_sync_profile_user_lookup
AFTER INSERT OR UPDATE OF user_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_user_lookup();

DROP TRIGGER IF EXISTS trg_notify_booking_changes ON public.bookings;
CREATE TRIGGER trg_notify_booking_changes
AFTER INSERT OR UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.notify_booking_changes();