-- 1. Agenda do mentor: cada sessão ocupa pelo menos 2h. Nenhuma sessão ativa pode se sobrepor.
-- 2. Relatório: sessão que exige relatório só vira "realizada" com resumo, entregas,
--    próximos passos e ao menos uma tarefa.
-- 3. NPS: a resposta copia mentor, sessão e aluno do próprio agendamento avaliado.

-- 1 ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mentor_busy_slots(_from date, _to date)
RETURNS TABLE (mentor_id uuid, scheduled_date date, start_time time, end_time time)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.mentor_id, b.scheduled_date, b.start_time, b.end_time
  FROM public.bookings b
  WHERE b.mentor_id IS NOT NULL
    AND b.status::text IN ('scheduled', 'pending_approval', 'rescheduled')
    AND b.scheduled_date BETWEEN _from AND _to;
$$;

REVOKE ALL ON FUNCTION public.mentor_busy_slots(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mentor_busy_slots(date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_mentor_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start time;
  v_end time;
  v_conflict record;
BEGIN
  IF NEW.mentor_id IS NULL OR NEW.start_time IS NULL OR NEW.scheduled_date IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status::text NOT IN ('scheduled', 'pending_approval', 'rescheduled') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status::text IN ('scheduled', 'pending_approval', 'rescheduled')
     AND OLD.mentor_id IS NOT DISTINCT FROM NEW.mentor_id
     AND OLD.scheduled_date IS NOT DISTINCT FROM NEW.scheduled_date
     AND OLD.start_time IS NOT DISTINCT FROM NEW.start_time
     AND OLD.end_time IS NOT DISTINCT FROM NEW.end_time THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.mentor_id::text || NEW.scheduled_date::text, 0));

  v_start := NEW.start_time;
  v_end := GREATEST(COALESCE(NEW.end_time, NEW.start_time), NEW.start_time + interval '2 hours');

  SELECT b.start_time, b.end_time INTO v_conflict
  FROM public.bookings b
  WHERE b.mentor_id = NEW.mentor_id
    AND b.scheduled_date = NEW.scheduled_date
    AND b.id IS DISTINCT FROM NEW.id
    AND b.status::text IN ('scheduled', 'pending_approval', 'rescheduled')
    AND b.start_time < v_end
    AND v_start < GREATEST(COALESCE(b.end_time, b.start_time), b.start_time + interval '2 hours')
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'MENTOR_TIME_CONFLICT'
      USING ERRCODE = 'P0001',
            DETAIL = 'O mentor já tem uma sessão às ' || to_char(v_conflict.start_time, 'HH24:MI') || ' neste dia.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_mentor_overlap() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prevent_mentor_overlap ON public.bookings;
CREATE TRIGGER trg_prevent_mentor_overlap
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.prevent_mentor_overlap();

-- 2 ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.require_complete_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report record;
  v_tasks integer;
BEGIN
  IF NEW.status::text <> 'completed' OR OLD.status::text = 'completed' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL
     OR public.has_role(auth.uid(), 'admin')
     OR public.has_role(auth.uid(), 'super_admin') THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.is_retroactive, false)
     OR NEW.report_required IS FALSE
     OR NEW.scheduled_date < DATE '2026-08-01' THEN
    RETURN NEW;
  END IF;

  SELECT summary, delivered, next_steps INTO v_report
  FROM public.booking_reports
  WHERE booking_id = NEW.id;

  SELECT count(*)::integer INTO v_tasks
  FROM public.session_tasks
  WHERE booking_id = NEW.id AND btrim(COALESCE(description, '')) <> '';

  IF v_report IS NULL
     OR btrim(COALESCE(v_report.summary, '')) = ''
     OR btrim(COALESCE(v_report.delivered, '')) = ''
     OR btrim(COALESCE(v_report.next_steps, '')) = ''
     OR v_tasks = 0 THEN
    RAISE EXCEPTION 'REPORT_INCOMPLETE'
      USING ERRCODE = 'P0001',
            DETAIL = 'Preencha resumo, o que foi entregue, próximos passos e ao menos uma tarefa.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_complete_report() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_require_complete_report ON public.bookings;
CREATE TRIGGER trg_require_complete_report
BEFORE UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.require_complete_report();

-- 3 ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bind_nps_to_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
BEGIN
  IF NEW.booking_id IS NULL THEN
    RAISE EXCEPTION 'NPS_BOOKING_REQUIRED'
      USING ERRCODE = 'P0001',
            DETAIL = 'A pesquisa precisa estar ligada a uma sessão.';
  END IF;

  SELECT b.liberty_id, b.mentor_id, b.session_id, s.name AS session_name, m.full_name AS mentor_name
    INTO v_booking
  FROM public.bookings b
  LEFT JOIN public.sessions s ON s.id = b.session_id
  LEFT JOIN public.profiles m ON m.id = b.mentor_id
  WHERE b.id = NEW.booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NPS_BOOKING_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.liberty_id IS DISTINCT FROM v_booking.liberty_id THEN
    RAISE EXCEPTION 'NPS_BOOKING_MISMATCH'
      USING ERRCODE = 'P0001',
            DETAIL = 'Esta sessão não pertence a este aluno.';
  END IF;

  NEW.mentor_id := v_booking.mentor_id;
  NEW.session_id := v_booking.session_id;
  NEW.session_name := v_booking.session_name;
  NEW.mentor_name := v_booking.mentor_name;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bind_nps_to_booking() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_bind_nps_to_booking ON public.nps_responses;
CREATE TRIGGER trg_bind_nps_to_booking
BEFORE INSERT ON public.nps_responses
FOR EACH ROW EXECUTE FUNCTION public.bind_nps_to_booking();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.nps_responses
    WHERE booking_id IS NOT NULL
    GROUP BY booking_id HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS nps_responses_one_per_booking
      ON public.nps_responses (booking_id)
      WHERE booking_id IS NOT NULL;
  END IF;
END $$;
