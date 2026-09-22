DROP POLICY IF EXISTS "Admins can manage all bookings" ON public.bookings;
CREATE POLICY "Admins can manage all bookings"
ON public.bookings
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin')
  )
);

DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles"
ON public.profiles
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'super_admin')
  )
);

DROP POLICY IF EXISTS "Mentors can view other mentors" ON public.profiles;
CREATE POLICY "Mentors can view other mentors"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles my_role
    WHERE my_role.user_id = auth.uid()
      AND my_role.role = 'mentor'
  )
  AND EXISTS (
    SELECT 1
    FROM public.profile_user_lookup pul
    JOIN public.user_roles mentor_role ON mentor_role.user_id = pul.user_id
    WHERE pul.profile_id = profiles.id
      AND mentor_role.role = 'mentor'
  )
);

DROP POLICY IF EXISTS "Mentors can view all members" ON public.profiles;
CREATE POLICY "Mentors can view all members"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  member_tier IN ('begin', 'liberty')
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'mentor'
  )
);

DROP POLICY IF EXISTS "Mentors can view all bookings" ON public.bookings;
CREATE POLICY "Mentors can view all bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'mentor'
  )
);

DROP POLICY IF EXISTS "Mentors can insert own bookings" ON public.bookings;
CREATE POLICY "Mentors can insert own bookings"
ON public.bookings
FOR INSERT
TO authenticated
WITH CHECK (
  mentor_id IN (
    SELECT pul.profile_id
    FROM public.profile_user_lookup pul
    WHERE pul.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'mentor'
  )
);

DROP POLICY IF EXISTS "Mentors can update own bookings" ON public.bookings;
CREATE POLICY "Mentors can update own bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (
  mentor_id IN (
    SELECT pul.profile_id
    FROM public.profile_user_lookup pul
    WHERE pul.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'mentor'
  )
)
WITH CHECK (
  mentor_id IN (
    SELECT pul.profile_id
    FROM public.profile_user_lookup pul
    WHERE pul.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'mentor'
  )
);

DROP POLICY IF EXISTS "Mentors can delete own bookings" ON public.bookings;
CREATE POLICY "Mentors can delete own bookings"
ON public.bookings
FOR DELETE
TO authenticated
USING (
  mentor_id IN (
    SELECT pul.profile_id
    FROM public.profile_user_lookup pul
    WHERE pul.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'mentor'
  )
);

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles my_role
    WHERE my_role.user_id = auth.uid()
      AND my_role.role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles my_role
    WHERE my_role.user_id = auth.uid()
      AND my_role.role IN ('admin', 'super_admin')
  )
);

DROP FUNCTION IF EXISTS public.profile_has_role(uuid, public.app_role);
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = _role OR (_role = 'admin' AND role = 'super_admin'))
  )
$$;