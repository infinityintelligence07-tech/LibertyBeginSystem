-- Datas digitadas com ano errado (ex.: 12026) derrubavam telas inteiras ao formatar.
-- O banco passa a recusar datas fora de uma faixa plausível.

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_scheduled_date_sane;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_scheduled_date_sane
  CHECK (scheduled_date BETWEEN DATE '2020-01-01' AND DATE '2100-12-31');

ALTER TABLE public.mentor_availability
  DROP CONSTRAINT IF EXISTS mentor_availability_specific_date_sane;
ALTER TABLE public.mentor_availability
  ADD CONSTRAINT mentor_availability_specific_date_sane
  CHECK (specific_date IS NULL OR specific_date BETWEEN DATE '2020-01-01' AND DATE '2100-12-31');

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_program_dates_sane;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_program_dates_sane
  CHECK (
    (program_start_date IS NULL OR program_start_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31')
    AND (program_end_date IS NULL OR program_end_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31')
  );
