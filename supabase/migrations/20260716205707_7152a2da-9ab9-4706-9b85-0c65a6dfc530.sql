
-- Restrict mentors to only see profiles they have booking relationship with
DROP POLICY IF EXISTS "Mentors can view all members" ON public.profiles;

CREATE POLICY "Mentors can view booked members"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  app_private.has_role(auth.uid(), 'mentor'::app_role)
  AND (member_tier = ANY (ARRAY['begin'::member_tier, 'liberty'::member_tier]))
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.profiles mp ON mp.id = b.mentor_id
    WHERE b.liberty_id = profiles.id
      AND mp.user_id = auth.uid()
  )
);

-- Harden nps_responses mentor read policy against null mentor_id
DROP POLICY IF EXISTS "Mentors can read own mentor nps" ON public.nps_responses;

CREATE POLICY "Mentors can read own mentor nps"
ON public.nps_responses
FOR SELECT
TO authenticated
USING (
  mentor_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = nps_responses.mentor_id
      AND p.user_id = auth.uid()
  )
);
