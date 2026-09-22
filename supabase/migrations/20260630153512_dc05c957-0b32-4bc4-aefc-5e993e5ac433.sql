-- Allow mentors to view all member profiles (begin + liberty), not only the ones they've booked with
DROP POLICY IF EXISTS "Mentors can view all members" ON public.profiles;
CREATE POLICY "Mentors can view all members"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'mentor'::app_role)
  AND member_tier IN ('begin'::member_tier, 'liberty'::member_tier)
);

-- Also allow mentors to see other mentor profiles (for shared history display)
DROP POLICY IF EXISTS "Mentors can view other mentors" ON public.profiles;
CREATE POLICY "Mentors can view other mentors"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'mentor'::app_role)
  AND id IN (SELECT profile_id FROM public.profile_user_lookup pul
             JOIN public.user_roles ur ON ur.user_id = pul.user_id
             WHERE ur.role = 'mentor'::app_role)
);