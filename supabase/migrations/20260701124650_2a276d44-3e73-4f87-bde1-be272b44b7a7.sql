CREATE SCHEMA IF NOT EXISTS app_private;
GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT USAGE ON SCHEMA app_private TO service_role;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
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

REVOKE ALL ON FUNCTION app_private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO service_role;

DROP POLICY IF EXISTS "Admins can manage all bookings" ON public.bookings;
CREATE POLICY "Admins can manage all bookings"
ON public.bookings
FOR ALL
TO authenticated
USING (app_private.has_role(auth.uid(), 'admin'))
WITH CHECK (app_private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can view relevant bookings" ON public.bookings;
CREATE POLICY "Users can view relevant bookings"
ON public.bookings
FOR SELECT
TO authenticated
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
  OR app_private.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Mentors can view all bookings" ON public.bookings;
CREATE POLICY "Mentors can view all bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (app_private.has_role(auth.uid(), 'mentor'));

DROP POLICY IF EXISTS "Mentors can insert own bookings" ON public.bookings;
CREATE POLICY "Mentors can insert own bookings"
ON public.bookings
FOR INSERT
TO authenticated
WITH CHECK (
  app_private.has_role(auth.uid(), 'mentor')
  AND mentor_id IN (
    SELECT pul.profile_id
    FROM public.profile_user_lookup pul
    WHERE pul.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Mentors can update own bookings" ON public.bookings;
CREATE POLICY "Mentors can update own bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (
  app_private.has_role(auth.uid(), 'mentor')
  AND mentor_id IN (
    SELECT pul.profile_id
    FROM public.profile_user_lookup pul
    WHERE pul.user_id = auth.uid()
  )
)
WITH CHECK (
  app_private.has_role(auth.uid(), 'mentor')
  AND mentor_id IN (
    SELECT pul.profile_id
    FROM public.profile_user_lookup pul
    WHERE pul.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Mentors can delete own bookings" ON public.bookings;
CREATE POLICY "Mentors can delete own bookings"
ON public.bookings
FOR DELETE
TO authenticated
USING (
  app_private.has_role(auth.uid(), 'mentor')
  AND mentor_id IN (
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
USING (app_private.has_role(auth.uid(), 'admin'))
WITH CHECK (app_private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Mentors can view all members" ON public.profiles;
CREATE POLICY "Mentors can view all members"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  app_private.has_role(auth.uid(), 'mentor')
  AND member_tier IN ('begin', 'liberty')
);

DROP POLICY IF EXISTS "Mentors can view other mentors" ON public.profiles;
CREATE POLICY "Mentors can view other mentors"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  app_private.has_role(auth.uid(), 'mentor')
  AND EXISTS (
    SELECT 1
    FROM public.profile_user_lookup pul
    JOIN public.user_roles mentor_role ON mentor_role.user_id = pul.user_id
    WHERE pul.profile_id = profiles.id
      AND mentor_role.role = 'mentor'
  )
);

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (app_private.has_role(auth.uid(), 'admin'))
WITH CHECK (app_private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage mentor_sessions" ON public.mentor_sessions;
CREATE POLICY "Admins can manage mentor_sessions"
ON public.mentor_sessions
FOR ALL
TO authenticated
USING (app_private.has_role(auth.uid(), 'admin'))
WITH CHECK (app_private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage notifications" ON public.notifications;
CREATE POLICY "Admins manage notifications"
ON public.notifications
FOR ALL
TO authenticated
USING (app_private.has_role(auth.uid(), 'admin'))
WITH CHECK (app_private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage all sessions" ON public.sessions;
CREATE POLICY "Admins can manage all sessions"
ON public.sessions
FOR ALL
TO authenticated
USING (app_private.has_role(auth.uid(), 'admin'))
WITH CHECK (app_private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage contents" ON public.contents;
CREATE POLICY "Admins can manage contents"
ON public.contents
FOR ALL
TO authenticated
USING (app_private.has_role(auth.uid(), 'admin'))
WITH CHECK (app_private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage events" ON public.events;
CREATE POLICY "Admins can manage events"
ON public.events
FOR ALL
TO authenticated
USING (app_private.has_role(auth.uid(), 'admin'))
WITH CHECK (app_private.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT app_private.has_role(_user_id, _role)
$$;