ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_availability_id_fkey;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_availability_id_fkey
  FOREIGN KEY (availability_id) REFERENCES public.mentor_availability(id) ON DELETE SET NULL;