CREATE POLICY "Mentors can view all bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'mentor'::app_role));