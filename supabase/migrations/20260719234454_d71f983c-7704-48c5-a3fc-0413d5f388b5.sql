
-- 1) Notify liberty when a student_tools row is inserted
CREATE OR REPLACE FUNCTION public.notify_student_tool_added()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid;
BEGIN
  SELECT public._notif_user_id(NEW.liberty_id) INTO v_user;
  IF v_user IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, type, title, message, link)
    VALUES (v_user, 'tool_available', '🛠️ Nova ferramenta disponível',
            COALESCE(NEW.title, 'Uma nova ferramenta') || ' foi liberada para você.',
            '/ferramentas');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_student_tool_added ON public.student_tools;
CREATE TRIGGER trg_notify_student_tool_added
AFTER INSERT ON public.student_tools
FOR EACH ROW EXECUTE FUNCTION public.notify_student_tool_added();

-- 2) Notify liberty when the booking_report is created
CREATE OR REPLACE FUNCTION public.notify_report_available()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_liberty_user uuid;
  v_liberty_id uuid;
  v_session_name text;
BEGIN
  SELECT b.liberty_id, s.name INTO v_liberty_id, v_session_name
  FROM public.bookings b LEFT JOIN public.sessions s ON s.id = b.session_id
  WHERE b.id = NEW.booking_id;
  IF v_liberty_id IS NULL THEN RETURN NEW; END IF;
  SELECT public._notif_user_id(v_liberty_id) INTO v_liberty_user;
  IF v_liberty_user IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
    VALUES (v_liberty_user, 'report_available', '📄 Relatório da sessão disponível',
            COALESCE(v_session_name, 'Sua sessão') || ' — resumo, plano de ação e próximos passos já estão no app.',
            '/journey', NEW.booking_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_report_available ON public.booking_reports;
CREATE TRIGGER trg_notify_report_available
AFTER INSERT ON public.booking_reports
FOR EACH ROW EXECUTE FUNCTION public.notify_report_available();

-- 3) Notify liberty when a session_task is created by mentor for them
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_liberty_user uuid;
  v_liberty_id uuid;
  v_actor uuid := auth.uid();
  v_actor_profile uuid;
BEGIN
  IF NEW.booking_id IS NULL THEN RETURN NEW; END IF;
  SELECT liberty_id INTO v_liberty_id FROM public.bookings WHERE id = NEW.booking_id;
  IF v_liberty_id IS NULL THEN RETURN NEW; END IF;

  -- Skip if the actor IS the liberty (avoid self-notifying when student creates own task)
  SELECT id INTO v_actor_profile FROM public.profiles WHERE user_id = v_actor;
  IF v_actor_profile = v_liberty_id THEN RETURN NEW; END IF;

  SELECT public._notif_user_id(v_liberty_id) INTO v_liberty_user;
  IF v_liberty_user IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, type, title, message, link)
    VALUES (v_liberty_user, 'task_assigned', '✅ Nova tarefa da sua mentoria',
            COALESCE(NEW.description, 'Uma nova tarefa') || ' foi liberada para você.',
            '/journey');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_task_assigned ON public.session_tasks;
CREATE TRIGGER trg_notify_task_assigned
AFTER INSERT ON public.session_tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_assigned();

-- 4) Remind mentor to fill the report when the booking becomes completed
CREATE OR REPLACE FUNCTION public.notify_report_pending_for_mentor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mentor_user uuid;
  v_session_name text;
  v_date_label text;
  v_has_report boolean;
BEGIN
  IF NEW.status::text <> 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status::text = 'completed' THEN RETURN NEW; END IF;

  SELECT EXISTS(SELECT 1 FROM public.booking_reports WHERE booking_id = NEW.id) INTO v_has_report;
  IF v_has_report THEN RETURN NEW; END IF;

  SELECT public._notif_user_id(NEW.mentor_id) INTO v_mentor_user;
  IF v_mentor_user IS NULL THEN RETURN NEW; END IF;

  SELECT name INTO v_session_name FROM public.sessions WHERE id = NEW.session_id;
  v_date_label := to_char(NEW.scheduled_date, 'DD/MM');

  INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
  VALUES (v_mentor_user, 'report_pending', '📝 Preencha o relatório da sessão',
          COALESCE(v_session_name, 'Sessão') || ' de ' || v_date_label || ' aguarda seu relatório.',
          '/mentor/sessoes/' || NEW.id::text || '/relatorio', NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_report_pending_ins ON public.bookings;
DROP TRIGGER IF EXISTS trg_notify_report_pending_upd ON public.bookings;
CREATE TRIGGER trg_notify_report_pending_ins
AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_report_pending_for_mentor();
CREATE TRIGGER trg_notify_report_pending_upd
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_report_pending_for_mentor();
