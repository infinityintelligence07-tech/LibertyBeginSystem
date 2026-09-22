-- 1) NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  link text,
  related_booking_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_all
  ON public.notifications(user_id, created_at DESC);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins manage notifications"
  ON public.notifications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Realtime
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 2) HELPER: resolve auth.user_id for a profile
CREATE OR REPLACE FUNCTION public._notif_user_id(_profile_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id FROM public.profiles WHERE id = _profile_id;
$$;

-- 3) TRIGGER FUNCTION: on booking insert/update -> create notifications
CREATE OR REPLACE FUNCTION public.notify_booking_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mentor_user uuid;
  v_liberty_user uuid;
  v_session_name text;
  v_date_label text;
  v_actor uuid := auth.uid();
BEGIN
  -- Look up auth user ids
  SELECT public._notif_user_id(NEW.mentor_id) INTO v_mentor_user;
  IF NEW.liberty_id IS NOT NULL THEN
    SELECT public._notif_user_id(NEW.liberty_id) INTO v_liberty_user;
  END IF;

  SELECT name INTO v_session_name FROM public.sessions WHERE id = NEW.session_id;
  v_date_label := to_char(NEW.scheduled_date, 'DD/MM') || ' às ' || to_char(NEW.start_time, 'HH24:MI');

  IF (TG_OP = 'INSERT') THEN
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
    -- Reschedule (date or time changed)
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
$$;

DROP TRIGGER IF EXISTS trg_notify_booking_changes ON public.bookings;
CREATE TRIGGER trg_notify_booking_changes
AFTER INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_booking_changes();