-- =====================================================================================
-- Auditoria 23/09/2026 · Fase 1 (regras de negócio no banco)
--  1. Mapeamento do Negócio (kickoff) só pode ser agendado até a 3ª sessão realizada
--     (bloqueia quando o membro já tem >= 4 sessões realizadas ou já ocorridas sem confirmação).
--  2. Uma sessão não pode ser marcada como "completed" antes de acontecer (salvo registro retroativo).
--  3. Sessões que passaram do horário e o mentor não fechou ("A confirmar"):
--     - mentor recebe lembrete (inclusive Mapeamento, que não exige relatório);
--     - admins recebem alerta quando passam de 7 dias sem confirmação.
-- =====================================================================================

-- 1. Regras de agendamento do membro -------------------------------------------------
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

  v_consumes_slot := NEW.status::text NOT IN ('cancelled', 'not_realized');

  IF v_consumes_slot AND (
    TG_OP = 'INSERT'
    OR OLD.status::text IN ('cancelled', 'not_realized')
    OR OLD.liberty_id IS DISTINCT FROM NEW.liberty_id
    OR OLD.session_id IS DISTINCT FROM NEW.session_id
  ) THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.liberty_id::text, 0));

    -- Limite total da jornada (12 sessões + 1 de folga histórica)
    SELECT count(*) INTO v_journey_count
    FROM public.bookings b
    JOIN public.sessions s ON s.id = b.session_id
    WHERE b.liberty_id = NEW.liberty_id
      AND COALESCE(s."order", 1) > 0
      AND b.status::text NOT IN ('cancelled', 'not_realized')
      AND b.id IS DISTINCT FROM NEW.id;

    IF v_journey_count >= 13 THEN
      RAISE EXCEPTION 'JOURNEY_BOOKING_LIMIT_EXCEEDED'
        USING ERRCODE = 'P0001',
              DETAIL = 'O membro já utilizou todas as sessões da jornada.';
    END IF;

    -- Mapeamento do Negócio: só até a 3ª sessão realizada.
    -- Conta como "realizada" o que está completed OU já passou do horário sem fechamento (presume-se que aconteceu).
    -- Registro retroativo (admin lançando histórico) não passa por essa regra.
    IF COALESCE(v_is_kickoff, false) AND COALESCE(NEW.is_retroactive, false) = false THEN
      SELECT count(*) INTO v_realized_count
      FROM public.bookings b
      JOIN public.sessions s ON s.id = b.session_id
      WHERE b.liberty_id = NEW.liberty_id
        AND COALESCE(s."order", 1) > 0
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

REVOKE ALL ON FUNCTION public.enforce_member_booking_rules() FROM PUBLIC, anon, authenticated;

-- 2. Não permitir "realizada" antes do fim da sessão --------------------------------
CREATE OR REPLACE FUNCTION public.prevent_premature_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status::text = 'completed'
     AND (TG_OP = 'INSERT' OR OLD.status::text IS DISTINCT FROM 'completed')
     AND COALESCE(NEW.is_retroactive, false) = false
     AND NEW.scheduled_date IS NOT NULL
     AND ((NEW.scheduled_date + COALESCE(NEW.end_time, NEW.start_time, TIME '00:00')) AT TIME ZONE 'America/Sao_Paulo') > now()
  THEN
    RAISE EXCEPTION 'COMPLETION_BEFORE_SESSION_END'
      USING ERRCODE = 'P0001',
            DETAIL = 'A sessão só pode ser marcada como realizada depois do horário de término.';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_premature_completion() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prevent_premature_completion ON public.bookings;
CREATE TRIGGER trg_prevent_premature_completion
BEFORE INSERT OR UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.prevent_premature_completion();

-- 3. Sessões "A confirmar": lembrete ao mentor e alerta ao admin -------------------------
CREATE OR REPLACE FUNCTION public.dispatch_pending_confirmation_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  m record;
  b record;
  a record;
  v_mentor_user uuid;
  v_cutoff date := DATE '2026-06-01';
BEGIN
  -- 3a. Mentor: sessões que passaram há mais de 2h e continuam "scheduled/rescheduled"
  --     e NÃO exigem relatório (Mapeamento). As que exigem relatório já são cobradas por dispatch_report_nudges.
  FOR m IN
    SELECT bk.mentor_id, count(*) AS pending_count, min(bk.scheduled_date) AS oldest
    FROM public.bookings bk
    WHERE bk.status::text IN ('scheduled', 'rescheduled')
      AND COALESCE(bk.report_required, true) = false
      AND COALESCE(bk.is_retroactive, false) = false
      AND bk.scheduled_date >= v_cutoff
      AND ((bk.scheduled_date + COALESCE(bk.end_time, bk.start_time)) AT TIME ZONE 'America/Sao_Paulo') < now() - interval '2 hours'
    GROUP BY bk.mentor_id
  LOOP
    SELECT public._notif_user_id(m.mentor_id) INTO v_mentor_user;
    IF v_mentor_user IS NULL THEN CONTINUE; END IF;

    IF EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = v_mentor_user
        AND n.type = 'confirmation_pending'
        AND n.created_at > now() - interval '20 hours'
    ) THEN CONTINUE; END IF;

    INSERT INTO public.notifications(user_id, type, title, message, link)
    VALUES (
      v_mentor_user, 'confirmation_pending',
      CASE WHEN m.pending_count > 1 THEN '⏳ ' || m.pending_count || ' sessões a confirmar'
           ELSE '⏳ Sessão a confirmar' END,
      CASE WHEN m.pending_count > 1
        THEN 'Você tem ' || m.pending_count || ' sessões que já passaram e ainda não foram confirmadas (a mais antiga: ' || to_char(m.oldest, 'DD/MM') || '). Marque como realizada ou não realizada para elas contarem.'
        ELSE 'A sessão de ' || to_char(m.oldest, 'DD/MM') || ' já passou e ainda não foi confirmada. Marque como realizada ou não realizada para ela contar.' END,
      '/mentor/sessoes'
    );
  END LOOP;

  -- 3b. Admins: qualquer sessão "A confirmar" há 7+ dias, um alerta por sessão.
  FOR b IN
    SELECT bk.id, bk.scheduled_date, bk.mentor_id,
           COALESCE(s.name, 'Sessão') AS session_name,
           COALESCE(mp.full_name, 'Mentor') AS mentor_name,
           COALESCE(lp.full_name, bk.guest_name, 'Membro') AS member_name
    FROM public.bookings bk
    LEFT JOIN public.sessions s ON s.id = bk.session_id
    LEFT JOIN public.profiles mp ON mp.id = bk.mentor_id
    LEFT JOIN public.profiles lp ON lp.id = bk.liberty_id
    WHERE bk.status::text IN ('scheduled', 'rescheduled')
      AND COALESCE(bk.is_retroactive, false) = false
      AND bk.scheduled_date >= v_cutoff
      AND ((bk.scheduled_date + COALESCE(bk.end_time, bk.start_time)) AT TIME ZONE 'America/Sao_Paulo') < now() - interval '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.related_booking_id = bk.id AND n.type = 'confirmation_overdue'
      )
  LOOP
    FOR a IN
      SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
      WHERE ur.role::text IN ('admin', 'super_admin')
    LOOP
      INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
      VALUES (
        a.user_id, 'confirmation_overdue',
        '⚠️ Sessão sem confirmação há mais de 7 dias',
        b.session_name || ' de ' || to_char(b.scheduled_date, 'DD/MM') || ' (' || b.member_name || ' · ' || b.mentor_name ||
        ') passou e o mentor não confirmou se aconteceu. Ela não conta como realizada nem entra no repasse.',
        '/admin/agenda', b.id
      );
    END LOOP;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.dispatch_pending_confirmation_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_pending_confirmation_alerts() TO service_role;

-- Roda todo dia às 12:15 UTC (09:15 BRT), logo depois dos nudges de relatório
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pending-confirmation-alerts') THEN
    PERFORM cron.unschedule('pending-confirmation-alerts');
  END IF;
  PERFORM cron.schedule(
    'pending-confirmation-alerts',
    '15 12 * * *',
    $cron$ SELECT public.dispatch_pending_confirmation_alerts(); $cron$
  );
END $$;
