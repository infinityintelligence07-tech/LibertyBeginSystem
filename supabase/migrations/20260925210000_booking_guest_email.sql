-- E-mail do convidado externo (para convite Calendar/Meet e notas compartilhadas).
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS guest_email text;

COMMENT ON COLUMN public.bookings.guest_email IS
  'E-mail do convidado externo (sem perfil liberty). Usado como attendee no Meet/Calendar.';
