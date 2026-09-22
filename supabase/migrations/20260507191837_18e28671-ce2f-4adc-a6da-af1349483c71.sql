ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS guest_name text;
ALTER TABLE public.bookings ALTER COLUMN liberty_id DROP NOT NULL;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_liberty_or_guest CHECK (liberty_id IS NOT NULL OR guest_name IS NOT NULL);