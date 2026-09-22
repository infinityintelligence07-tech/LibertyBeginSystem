
-- 1. Restore mentor visibility of all member profiles
DROP POLICY IF EXISTS "Mentors can view booked members" ON public.profiles;

CREATE POLICY "Mentors can view all members"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  app_private.has_role(auth.uid(), 'mentor'::app_role)
  AND (member_tier = ANY (ARRAY['begin'::member_tier, 'liberty'::member_tier]))
);

-- 2. Allow member_tier to be NULL, then clear tier for mentors/admins
ALTER TABLE public.profiles ALTER COLUMN member_tier DROP NOT NULL;

UPDATE public.profiles p
SET member_tier = NULL
WHERE p.id IN (
  SELECT p2.id
  FROM public.profiles p2
  JOIN public.profile_user_lookup pul ON pul.profile_id = p2.id
  JOIN public.user_roles ur ON ur.user_id = pul.user_id
  WHERE ur.role IN ('mentor', 'admin', 'super_admin')
);

-- 3. Update notify_booking_changes so admin notifications for not-realized include the booking id in the link
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
                  '/admin/agenda?booking=' || NEW.id::text, NEW.id);
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
    IF NEW.status::text = 'not_realized' AND OLD.status::text IS DISTINCT FROM 'not_realized' THEN
      FOR v_admin IN
        SELECT ur.user_id FROM public.user_roles ur
        WHERE ur.role IN ('admin', 'super_admin')
      LOOP
        INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
        VALUES (v_admin.user_id, 'booking_not_realized', 'Sessão marcada como não realizada',
                COALESCE(v_session_name, 'Sessão') || ' — ' || v_date_label ||
                COALESCE(' · Motivo: ' || NEW.cancellation_reason, ''),
                '/admin/agenda?booking=' || NEW.id::text, NEW.id);
      END LOOP;
      RETURN NEW;
    END IF;

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

    IF OLD.status::text = 'pending_approval' AND NEW.status::text = 'cancelled' THEN
      IF v_liberty_user IS NOT NULL THEN
        INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
        VALUES (v_liberty_user, 'booking_rejected', 'Horário indisponível',
                COALESCE(v_session_name, 'Sessão') || ' — ' || v_date_label || '. Escolha outro horário.',
                '/agenda/overview', NEW.id);
      END IF;
      RETURN NEW;
    END IF;

    IF NEW.status::text = 'cancelled' AND OLD.status::text IS DISTINCT FROM 'cancelled' THEN
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
