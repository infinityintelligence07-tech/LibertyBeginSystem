-- 1) Sessões kickoff não exigem relatório
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS report_required boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.set_booking_report_required()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kickoff boolean;
BEGIN
  SELECT COALESCE(is_kickoff, false) INTO v_kickoff FROM public.sessions WHERE id = NEW.session_id;
  IF v_kickoff THEN
    NEW.report_required := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_report_required ON public.bookings;
CREATE TRIGGER trg_booking_report_required
BEFORE INSERT OR UPDATE OF session_id ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.set_booking_report_required();

UPDATE public.bookings b
SET report_required = false
FROM public.sessions s
WHERE s.id = b.session_id AND COALESCE(s.is_kickoff, false) = true AND b.report_required = true;

-- 2) Sincronização automática da disponibilidade do mentor
CREATE OR REPLACE FUNCTION public.sync_availability_booked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avail uuid;
BEGIN
  -- libera o horário antigo quando a sessão muda de horário/mentor ou é cancelada
  IF TG_OP = 'UPDATE' AND OLD.availability_id IS NOT NULL AND (
       OLD.availability_id IS DISTINCT FROM NEW.availability_id
       OR NEW.status IN ('cancelled','not_realized')
     ) THEN
    UPDATE public.mentor_availability SET is_booked = false WHERE id = OLD.availability_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.availability_id IS NOT NULL THEN
      UPDATE public.mentor_availability SET is_booked = false WHERE id = OLD.availability_id;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.status IN ('cancelled','not_realized') THEN
    RETURN NEW;
  END IF;

  v_avail := NEW.availability_id;

  -- resolve o horário correspondente quando a sessão foi criada sem vínculo
  IF v_avail IS NULL THEN
    SELECT a.id INTO v_avail
    FROM public.mentor_availability a
    WHERE a.mentor_id = NEW.mentor_id
      AND a.start_time <= NEW.start_time
      AND a.end_time >= NEW.start_time + interval '1 minute'
      AND (
        a.specific_date = NEW.scheduled_date
        OR (a.is_recurring AND a.day_of_week = EXTRACT(DOW FROM NEW.scheduled_date)::int)
      )
    ORDER BY (a.specific_date = NEW.scheduled_date) DESC
    LIMIT 1;

    IF v_avail IS NOT NULL THEN
      UPDATE public.bookings SET availability_id = v_avail WHERE id = NEW.id;
    END IF;
  END IF;

  IF v_avail IS NOT NULL THEN
    UPDATE public.mentor_availability SET is_booked = true WHERE id = v_avail;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_availability_booked ON public.bookings;
CREATE TRIGGER trg_sync_availability_booked
AFTER INSERT OR UPDATE OF status, scheduled_date, start_time, mentor_id, availability_id OR DELETE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.sync_availability_booked();

REVOKE ALL ON FUNCTION public.set_booking_report_required() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_availability_booked() FROM PUBLIC, anon, authenticated;