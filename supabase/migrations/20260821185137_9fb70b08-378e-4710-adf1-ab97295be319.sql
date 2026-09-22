-- 1) Report nudges: one daily digest per mentor instead of one per pending session
CREATE OR REPLACE FUNCTION public.dispatch_report_nudges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  m record;
  v_mentor_user uuid;
  v_first_booking uuid;
  v_first_label text;
  v_cutoff date := DATE '2026-06-01';
BEGIN
  FOR m IN
    SELECT bk.mentor_id, COUNT(*) AS pending_count
    FROM public.bookings bk
    WHERE bk.status IN ('scheduled','rescheduled','completed')
      AND bk.scheduled_date >= v_cutoff
      AND (bk.scheduled_date::timestamp + bk.start_time) < now() - interval '2 hours'
      AND NOT EXISTS (SELECT 1 FROM public.booking_reports br WHERE br.booking_id = bk.id)
    GROUP BY bk.mentor_id
  LOOP
    SELECT public._notif_user_id(m.mentor_id) INTO v_mentor_user;
    IF v_mentor_user IS NULL THEN CONTINUE; END IF;

    -- no more than one report nudge per mentor per 24h
    IF EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = v_mentor_user
        AND n.type = 'report_overdue'
        AND n.created_at > now() - interval '20 hours'
    ) THEN
      CONTINUE;
    END IF;

    SELECT bk.id, COALESCE(s.name, 'Sessão') || ' de ' || to_char(bk.scheduled_date, 'DD/MM')
      INTO v_first_booking, v_first_label
    FROM public.bookings bk
    LEFT JOIN public.sessions s ON s.id = bk.session_id
    WHERE bk.mentor_id = m.mentor_id
      AND bk.status IN ('scheduled','rescheduled','completed')
      AND bk.scheduled_date >= v_cutoff
      AND (bk.scheduled_date::timestamp + bk.start_time) < now() - interval '2 hours'
      AND NOT EXISTS (SELECT 1 FROM public.booking_reports br WHERE br.booking_id = bk.id)
    ORDER BY bk.scheduled_date ASC, bk.start_time ASC
    LIMIT 1;

    INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
    VALUES (
      v_mentor_user,
      'report_overdue',
      CASE WHEN m.pending_count > 1
        THEN '⚠️ ' || m.pending_count || ' relatórios pendentes'
        ELSE '⚠️ Relatório pendente — sessão não contabilizada' END,
      CASE WHEN m.pending_count > 1
        THEN 'Você tem ' || m.pending_count || ' sessões sem relatório (a mais antiga: ' || v_first_label ||
             '). Sem o relatório, elas não contam como realizadas.'
        ELSE v_first_label || ' ainda não tem relatório. Sem ele, a sessão não conta como realizada.' END,
      '/mentor/sessoes/' || v_first_booking::text || '/relatorio',
      v_first_booking
    );
  END LOOP;
END;
$fn$;

-- 2) Housekeeping: remove only already-read, non-critical notifications older than 45 days
DELETE FROM public.notifications
WHERE read_at IS NOT NULL
  AND created_at < now() - interval '45 days';

-- 3) Remove duplicate stale report_overdue backlog, keeping the most recent per user
DELETE FROM public.notifications n
WHERE n.type = 'report_overdue'
  AND n.created_at < now() - interval '7 days';