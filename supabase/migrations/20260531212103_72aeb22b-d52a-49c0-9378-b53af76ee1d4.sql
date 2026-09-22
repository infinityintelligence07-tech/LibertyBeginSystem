-- 1) Add 'pending_approval' to booking_status enum
ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'pending_approval';

-- 2) Add approval_required column
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS approval_required boolean NOT NULL DEFAULT false;

-- 3) Extend notification trigger to handle pending_approval transitions
--    and notify admins for pending bookings.
CREATE OR REPLACE FUNCTION public.notify_booking_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mentor_user uuid;
  v_liberty_user uuid;
  v_session_name text;
  v_date_label text;
  v_actor uuid := auth.uid();
  v_admin record;
BEGIN
  SELECT public._notif_user_id(NEW.mentor_id) INTO v_mentor_user;
  IF NEW.liberty_id IS NOT NULL THEN
    SELECT public._notif_user_id(NEW.liberty_id) INTO v_liberty_user;
  END IF;

  SELECT name INTO v_session_name FROM public.sessions WHERE id = NEW.session_id;
  v_date_label := to_char(NEW.scheduled_date, 'DD/MM') || ' às ' || to_char(NEW.start_time, 'HH24:MI');

  IF (TG_OP = 'INSERT') THEN
    -- Pending approval: notify admins + liberty, do NOT notify mentor yet
    IF NEW.status::text = 'pending_approval' THEN
      IF v_liberty_user IS NOT NULL THEN
        INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
        VALUES (v_liberty_user, 'booking_pending', 'Agendamento aguardando confirmação',
                COALESCE(v_session_name, 'Sessão') || ' — ' || v_date_label || ' (aguardando aprovação)',
                '/agenda', NEW.id);
      END IF;
      FOR v_admin IN
        SELECT ur.user_id FROM public.user_roles ur
        WHERE ur.role IN ('admin', 'super_admin')
      LOOP
        IF v_admin.user_id <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
          INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
          VALUES (v_admin.user_id, 'booking_pending', 'Nova sessão aguardando aprovação',
                  COALESCE(v_session_name, 'Sessão') || ' — ' || v_date_label,
                  '/admin/agenda', NEW.id);
        END IF;
      END LOOP;
      RETURN NEW;
    END IF;

    IF v_mentor_user IS NOT NULL AND v_mentor_user <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
      VALUES (v_mentor_user, 'booking_created', 'Nova sessão agendada',
              COALESCE(v_session_name, 'Sessão') || ' — ' || v_date_label,
              '/mentor/sessoes', NEW.id);
    END IF;
    IF v_liberty_user IS NOT NULL AND v_liberty_user <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
      VALUES (v_liberty_user, 'booking_created', 'Sessão confirmada',
              COALESCE(v_session_name, 'Sessão') || ' — ' || v_date_label,
              '/agenda', NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    -- pending_approval -> scheduled (admin approved)
    IF OLD.status::text = 'pending_approval' AND NEW.status::text = 'scheduled' THEN
      IF v_liberty_user IS NOT NULL THEN
        INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
        VALUES (v_liberty_user, 'booking_approved', 'Sessão confirmada!',
                COALESCE(v_session_name, 'Sessão') || ' — ' || v_date_label || ' foi aprovada pelo mentor.',
                '/agenda', NEW.id);
      END IF;
      IF v_mentor_user IS NOT NULL THEN
        INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
        VALUES (v_mentor_user, 'booking_created', 'Nova sessão confirmada',
                COALESCE(v_session_name, 'Sessão') || ' — ' || v_date_label,
                '/mentor/sessoes', NEW.id);
      END IF;
      RETURN NEW;
    END IF;

    -- pending_approval -> cancelled (mentor unavailable / admin rejected)
    IF OLD.status::text = 'pending_approval' AND NEW.status = 'cancelled' THEN
      IF v_liberty_user IS NOT NULL THEN
        INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
        VALUES (v_liberty_user, 'booking_rejected', 'Horário indisponível',
                COALESCE(v_session_name, 'Sessão') || ' — ' || v_date_label || '. Escolha outro horário.',
                '/agenda/overview', NEW.id);
      END IF;
      RETURN NEW;
    END IF;

    -- Cancellation
    IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
      IF v_mentor_user IS NOT NULL AND v_mentor_user <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
        VALUES (v_mentor_user, 'booking_cancelled', 'Sessão cancelada',
                v_date_label || COALESCE(' — ' || NEW.cancellation_reason, ''),
                '/mentor/sessoes', NEW.id);
      END IF;
      IF v_liberty_user IS NOT NULL AND v_liberty_user <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
        VALUES (v_liberty_user, 'booking_cancelled', 'Sessão cancelada',
                v_date_label || COALESCE(' — ' || NEW.cancellation_reason, ''),
                '/agenda', NEW.id);
      END IF;
    ELSIF (NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
          OR NEW.start_time IS DISTINCT FROM OLD.start_time) THEN
      IF v_mentor_user IS NOT NULL AND v_mentor_user <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
        VALUES (v_mentor_user, 'booking_rescheduled', 'Sessão remarcada',
                'Novo horário: ' || v_date_label,
                '/mentor/sessoes', NEW.id);
      END IF;
      IF v_liberty_user IS NOT NULL AND v_liberty_user <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
        VALUES (v_liberty_user, 'booking_rescheduled', 'Sessão remarcada',
                'Novo horário: ' || v_date_label,
                '/agenda', NEW.id);
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure trigger is bound (idempotent recreate)
DROP TRIGGER IF EXISTS trg_notify_booking_changes ON public.bookings;
CREATE TRIGGER trg_notify_booking_changes
AFTER INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_booking_changes();