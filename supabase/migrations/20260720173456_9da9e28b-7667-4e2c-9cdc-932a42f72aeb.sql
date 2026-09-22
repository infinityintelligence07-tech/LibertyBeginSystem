
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS courtesy_reschedules_left int NOT NULL DEFAULT 3;

CREATE OR REPLACE FUNCTION public.enforce_cancellation_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours numeric;
  v_liberty_user uuid;
  v_session_name text;
  v_admin record;
  v_when timestamptz;
BEGIN
  IF NEW.status::text <> 'cancelled' OR OLD.status::text = 'cancelled' THEN
    RETURN NEW;
  END IF;
  IF NEW.liberty_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_when := (NEW.scheduled_date::timestamp + NEW.start_time) AT TIME ZONE 'America/Sao_Paulo';
  v_hours := EXTRACT(EPOCH FROM (v_when - now())) / 3600.0;

  SELECT public._notif_user_id(NEW.liberty_id) INTO v_liberty_user;
  SELECT name INTO v_session_name FROM public.sessions WHERE id = NEW.session_id;

  IF v_hours >= 24 AND v_hours < 48 THEN
    UPDATE public.profiles
      SET courtesy_reschedules_left = GREATEST(courtesy_reschedules_left - 1, 0)
      WHERE id = NEW.liberty_id;
    IF v_liberty_user IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
      VALUES (v_liberty_user, 'courtesy_used',
              'Remarcação-cortesia utilizada',
              COALESCE(v_session_name, 'Sessão') || ' cancelada em menos de 48h. Uma das 3 remarcações-cortesia foi consumida.',
              '/agenda', NEW.id);
    END IF;
  END IF;

  IF v_hours < 24 THEN
    FOR v_admin IN
      SELECT ur.user_id FROM public.user_roles ur
      WHERE ur.role IN ('admin','super_admin')
    LOOP
      INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
      VALUES (v_admin.user_id, 'cancellation_review',
              'Cancelamento em menos de 24h · revisão necessária',
              COALESCE(v_session_name, 'Sessão') || ' cancelada com menos de 24h de antecedência. Decida entre cobrar taxa (R$ 1.000) ou marcar como realizada.'
                || COALESCE(' · Motivo: ' || NEW.cancellation_reason, ''),
              '/admin/agenda?booking=' || NEW.id::text,
              NEW.id);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_cancellation_policy ON public.bookings;
CREATE TRIGGER trg_enforce_cancellation_policy
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_cancellation_policy();

CREATE OR REPLACE FUNCTION public.dispatch_availability_nudges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  v_coverage_end date;
  v_last_avail date;
BEGIN
  FOR m IN
    SELECT DISTINCT p.id AS profile_id, p.user_id
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE ur.role = 'mentor'
      AND COALESCE(p.is_active, true) = true
      AND p.user_id IS NOT NULL
  LOOP
    SELECT GREATEST(
      COALESCE(MAX(specific_date), current_date),
      CASE WHEN bool_or(is_recurring) THEN current_date + interval '35 days' ELSE current_date END
    )::date INTO v_last_avail
    FROM public.mentor_availability
    WHERE mentor_id = m.profile_id;

    v_coverage_end := COALESCE(v_last_avail, current_date);

    IF v_coverage_end < current_date + interval '30 days' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications
        WHERE user_id = m.user_id
          AND type = 'availability_gap'
          AND created_at > now() - interval '7 days'
      ) THEN
        INSERT INTO public.notifications(user_id, type, title, message, link)
        VALUES (m.user_id, 'availability_gap',
                'Adicione mais disponibilidade',
                'Sua agenda está aberta apenas até ' || to_char(v_coverage_end, 'DD/MM') ||
                '. Libere pelo menos +10 dias para os alunos conseguirem agendar.',
                '/mentor/disponibilidade');
      END IF;
    END IF;
  END LOOP;
END;
$$;
