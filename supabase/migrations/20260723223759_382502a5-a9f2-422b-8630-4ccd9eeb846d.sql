
CREATE OR REPLACE FUNCTION public.dispatch_report_nudges()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b record;
  v_mentor_user uuid;
  v_session_name text;
  v_date_label text;
  v_pending_count int;
  v_month_start date := date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  FOR b IN
    SELECT bk.id, bk.mentor_id, bk.session_id, bk.scheduled_date, bk.start_time
    FROM public.bookings bk
    WHERE bk.status IN ('scheduled','rescheduled','completed')
      AND bk.scheduled_date >= v_month_start
      AND (bk.scheduled_date::timestamp + bk.start_time) < now() - interval '2 hours'
      AND NOT EXISTS (SELECT 1 FROM public.booking_reports br WHERE br.booking_id = bk.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.related_booking_id = bk.id
          AND n.type = 'report_overdue'
          AND n.created_at > now() - interval '48 hours'
      )
  LOOP
    SELECT public._notif_user_id(b.mentor_id) INTO v_mentor_user;
    IF v_mentor_user IS NULL THEN CONTINUE; END IF;

    SELECT name INTO v_session_name FROM public.sessions WHERE id = b.session_id;
    v_date_label := to_char(b.scheduled_date, 'DD/MM');

    SELECT COUNT(*) INTO v_pending_count
    FROM public.bookings bk2
    WHERE bk2.mentor_id = b.mentor_id
      AND bk2.status IN ('scheduled','rescheduled','completed')
      AND bk2.scheduled_date >= v_month_start
      AND (bk2.scheduled_date::timestamp + bk2.start_time) < now() - interval '2 hours'
      AND NOT EXISTS (SELECT 1 FROM public.booking_reports br WHERE br.booking_id = bk2.id);

    INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
    VALUES (
      v_mentor_user,
      'report_overdue',
      '⚠️ Relatório pendente — sessão não contabilizada',
      COALESCE(v_session_name, 'Sessão') || ' de ' || v_date_label ||
        ' ainda não tem relatório. Sem ele, a sessão não conta como realizada.' ||
        CASE WHEN v_pending_count > 1 THEN ' Você tem ' || v_pending_count || ' relatórios pendentes neste mês.' ELSE '' END,
      '/mentor/sessoes/' || b.id::text || '/relatorio',
      b.id
    );
  END LOOP;
END;
$function$;

-- Limpa notificações já enviadas para sessões fora do mês corrente
DELETE FROM public.notifications n
USING public.bookings b
WHERE n.related_booking_id = b.id
  AND n.type = 'report_overdue'
  AND b.scheduled_date < date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date;
