
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
              '/mentor/sessoes?tab=pending', b.id);
    END IF;
    UPDATE public.bookings SET pending_reminder_sent_at = now() WHERE id = b.id;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dispatch_booking_reminders() FROM PUBLIC, anon, authenticated;
