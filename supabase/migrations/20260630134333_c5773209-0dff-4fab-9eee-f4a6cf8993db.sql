
-- Allow mentors to update student profiles (igual ao admin, para edição de cadastro)
CREATE POLICY "Mentors can update profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'mentor'))
  WITH CHECK (public.has_role(auth.uid(), 'mentor'));

-- Allow mentors to create, edit and cancel any booking (admin-like for session management)
CREATE POLICY "Mentors can insert bookings"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'mentor'));

CREATE POLICY "Mentors can update bookings"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'mentor'))
  WITH CHECK (public.has_role(auth.uid(), 'mentor'));

CREATE POLICY "Mentors can delete bookings"
  ON public.bookings
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'mentor'));
