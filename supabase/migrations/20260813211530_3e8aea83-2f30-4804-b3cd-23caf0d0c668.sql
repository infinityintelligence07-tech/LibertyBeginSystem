CREATE OR REPLACE FUNCTION public.enforce_member_booking_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_count integer;
  v_completed_count integer;
  v_is_kickoff boolean;
  v_kickoff_completed boolean;
  v_month_key text;
BEGIN
  IF NEW.liberty_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status::text NOT IN ('cancelled', 'not_realized') THEN
    v_month_key := NEW.liberty_id::text || ':' || to_char(NEW.scheduled_date, 'YYYY-MM');
    PERFORM pg_advisory_xact_lock(hashtextextended(v_month_key, 0));

    SELECT count(*)
      INTO v_month_count
    FROM public.bookings b
    WHERE b.liberty_id = NEW.liberty_id
      AND b.scheduled_date >= date_trunc('month', NEW.scheduled_date::timestamp)::date
      AND b.scheduled_date < (date_trunc('month', NEW.scheduled_date::timestamp) + interval '1 month')::date
      AND b.status::text NOT IN ('cancelled', 'not_realized')
      AND b.id IS DISTINCT FROM NEW.id;

    IF v_month_count >= 2 THEN
      RAISE EXCEPTION 'MONTHLY_BOOKING_LIMIT_EXCEEDED'
        USING ERRCODE = 'P0001',
              DETAIL = 'O membro já possui duas sessões contabilizadas neste mês.';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status::text NOT IN ('cancelled', 'not_realized') THEN
    SELECT COALESCE(s.is_kickoff, false)
      INTO v_is_kickoff
    FROM public.sessions s
    WHERE s.id = NEW.session_id;

    IF COALESCE(v_is_kickoff, false) = false THEN
      SELECT count(*)
        INTO v_completed_count
      FROM public.bookings b
      WHERE b.liberty_id = NEW.liberty_id
        AND b.status::text = 'completed';

      IF v_completed_count <= 3 THEN
        SELECT EXISTS (
          SELECT 1
          FROM public.bookings b
          JOIN public.sessions s ON s.id = b.session_id
          WHERE b.liberty_id = NEW.liberty_id
            AND s.is_kickoff = true
            AND b.status::text = 'completed'
        ) INTO v_kickoff_completed;

        IF NOT v_kickoff_completed THEN
          RAISE EXCEPTION 'KICKOFF_REQUIRED'
            USING ERRCODE = 'P0001',
                  DETAIL = 'Conclua o Mapeamento do Negócio antes de agendar outra sessão.';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_member_booking_rules() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_member_booking_rules() TO service_role;