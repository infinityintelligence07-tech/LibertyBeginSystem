DROP POLICY IF EXISTS "Mentors can manage own availability" ON public.mentor_availability;
CREATE POLICY "Mentors and admins can manage availability"
ON public.mentor_availability
FOR ALL
TO authenticated
USING (
  mentor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  mentor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);