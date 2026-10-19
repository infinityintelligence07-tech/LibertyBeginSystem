-- Recomeço da jornada: sessões antes de journey_restart_on ficam como histórico
-- e não contam no limite, no Mapeamento nem no progresso.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS journey_restart_on date;

CREATE OR REPLACE FUNCTION public.enforce_member_booking_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_journey_count integer;
  v_realized_count integer;
  v_is_journey boolean;
  v_is_kickoff boolean;
  v_consumes_slot boolean;
  v_restart date;
BEGIN
  IF NEW.liberty_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(s."order", 1) > 0, COALESCE(s.is_kickoff, false)
    INTO v_is_journey, v_is_kickoff
  FROM public.sessions s WHERE s.id = NEW.session_id;

  IF NOT COALESCE(v_is_journey, true) THEN
    RETURN NEW;
  END IF;

  SELECT journey_restart_on INTO v_restart FROM public.profiles WHERE id = NEW.liberty_id;

  IF v_restart IS NOT NULL AND NEW.scheduled_date < v_restart THEN
    RETURN NEW;
  END IF;

  v_consumes_slot := NEW.status::text NOT IN ('cancelled', 'not_realized');

  IF v_consumes_slot AND (
    TG_OP = 'INSERT'
    OR OLD.status::text IN ('cancelled', 'not_realized')
    OR OLD.liberty_id IS DISTINCT FROM NEW.liberty_id
    OR OLD.session_id IS DISTINCT FROM NEW.session_id
  ) THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.liberty_id::text, 0));

    SELECT count(*) INTO v_journey_count
    FROM public.bookings b
    JOIN public.sessions s ON s.id = b.session_id
    WHERE b.liberty_id = NEW.liberty_id
      AND COALESCE(s."order", 1) > 0
      AND b.status::text NOT IN ('cancelled', 'not_realized')
      AND (v_restart IS NULL OR b.scheduled_date >= v_restart)
      AND b.id IS DISTINCT FROM NEW.id;

    IF v_journey_count >= 13 THEN
      RAISE EXCEPTION 'JOURNEY_BOOKING_LIMIT_EXCEEDED'
        USING ERRCODE = 'P0001',
              DETAIL = 'O membro já utilizou todas as sessões da jornada.';
    END IF;

    IF COALESCE(v_is_kickoff, false) AND COALESCE(NEW.is_retroactive, false) = false THEN
      SELECT count(*) INTO v_realized_count
      FROM public.bookings b
      JOIN public.sessions s ON s.id = b.session_id
      WHERE b.liberty_id = NEW.liberty_id
        AND COALESCE(s."order", 1) > 0
        AND (v_restart IS NULL OR b.scheduled_date >= v_restart)
        AND b.id IS DISTINCT FROM NEW.id
        AND (
          b.status::text = 'completed'
          OR (
            b.status::text IN ('scheduled', 'rescheduled')
            AND ((b.scheduled_date + COALESCE(b.end_time, b.start_time)) AT TIME ZONE 'America/Sao_Paulo') < now()
          )
        );

      IF v_realized_count >= 4 THEN
        RAISE EXCEPTION 'KICKOFF_NOT_ALLOWED'
          USING ERRCODE = 'P0001',
                DETAIL = 'O Mapeamento do Negócio só pode ser agendado até a 3ª sessão realizada.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'super_admin') THEN
    RETURN NEW;
  END IF;

  IF (NEW.member_tier, NEW.is_active, NEW.session_rate, NEW.user_id, NEW.admin_note,
      NEW.is_ranking_featured, NEW.featured_position, NEW.email, NEW.courtesy_reschedules_left,
      NEW.reschedule_scheduling_locked, NEW.journey_restart_on)
     IS DISTINCT FROM
     (OLD.member_tier, OLD.is_active, OLD.session_rate, OLD.user_id, OLD.admin_note,
      OLD.is_ranking_featured, OLD.featured_position, OLD.email, OLD.courtesy_reschedules_left,
      OLD.reschedule_scheduling_locked, OLD.journey_restart_on) THEN
    RAISE EXCEPTION 'PROFILE_COLUMN_PROTECTED'
      USING ERRCODE = 'P0001',
            DETAIL = 'Essas informações do perfil só podem ser alteradas pela administração.';
  END IF;

  RETURN NEW;
END;
$function$;

-- Fernanda Brembatti segue no programa; o que ela fez até aqui vira histórico.
UPDATE public.profiles
SET journey_restart_on = DATE '2026-10-19'
WHERE id = 'bc1a4d70-fc9a-4197-aba3-0ba81c784ed5';
