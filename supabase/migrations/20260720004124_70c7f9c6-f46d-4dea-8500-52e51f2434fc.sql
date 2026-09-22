
-- Reminder tracking columns on bookings (idempotent add)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS pending_reminder_sent_at timestamptz;

-- Function: send 24h-before session reminder AND ping mentor about pending confirmations older than 12h.
CREATE OR REPLACE FUNCTION public.dispatch_booking_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
  v_mentor_user uuid;
  v_liberty_user uuid;
  v_session_name text;
  v_date_label text;
BEGIN
  -- 24h-before session reminders (scheduled sessions, ~23-25h ahead)
  FOR b IN
    SELECT id, mentor_id, liberty_id, session_id, scheduled_date, start_time
    FROM public.bookings
    WHERE status IN ('scheduled','rescheduled')
      AND reminder_24h_sent_at IS NULL
      AND (scheduled_date::timestamp + start_time) BETWEEN now() + interval '23 hours' AND now() + interval '25 hours'
  LOOP
    SELECT public._notif_user_id(b.mentor_id) INTO v_mentor_user;
    SELECT public._notif_user_id(b.liberty_id) INTO v_liberty_user;
    SELECT name INTO v_session_name FROM public.sessions WHERE id = b.session_id;
    v_date_label := to_char(b.scheduled_date, 'DD/MM') || ' às ' || to_char(b.start_time, 'HH24:MI');
    IF v_mentor_user IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
      VALUES (v_mentor_user, 'booking_reminder', '⏰ Lembrete: sessão amanhã',
              COALESCE(v_session_name,'Sessão') || ' — ' || v_date_label,
              '/mentor/sessoes', b.id);
    END IF;
    IF v_liberty_user IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
      VALUES (v_liberty_user, 'booking_reminder', '⏰ Sua sessão é amanhã',
              COALESCE(v_session_name,'Sessão') || ' — ' || v_date_label,
              '/agenda', b.id);
    END IF;
    UPDATE public.bookings SET reminder_24h_sent_at = now() WHERE id = b.id;
  END LOOP;

  -- Pending-approval nudge to mentor after 12h without response
  FOR b IN
    SELECT id, mentor_id, session_id, scheduled_date, start_time, created_at
    FROM public.bookings
    WHERE status = 'pending_approval'
      AND pending_reminder_sent_at IS NULL
      AND created_at < now() - interval '12 hours'
      AND (scheduled_date::timestamp + start_time) > now()
  LOOP
    SELECT public._notif_user_id(b.mentor_id) INTO v_mentor_user;
    SELECT name INTO v_session_name FROM public.sessions WHERE id = b.session_id;
    v_date_label := to_char(b.scheduled_date, 'DD/MM') || ' às ' || to_char(b.start_time, 'HH24:MI');
    IF v_mentor_user IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
      VALUES (v_mentor_user, 'booking_pending', '⚠️ Sessão aguarda sua confirmação',
              COALESCE(v_session_name,'Sessão') || ' — ' || v_date_label || ' está aguardando confirmação há mais de 12h.',
              '/mentor/sessoes?tab=pendentes', b.id);
    END IF;
    UPDATE public.bookings SET pending_reminder_sent_at = now() WHERE id = b.id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dispatch_booking_reminders() TO service_role;

-- Ensure pg_cron is enabled and schedule the dispatcher every 15 minutes
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-booking-reminders') THEN
    PERFORM cron.unschedule('dispatch-booking-reminders');
  END IF;
  PERFORM cron.schedule(
    'dispatch-booking-reminders',
    '*/15 * * * *',
    $cron$ SELECT public.dispatch_booking_reminders(); $cron$
  );
END $$;
