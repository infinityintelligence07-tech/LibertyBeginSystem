-- 1. Limite por jornada em vez de limite mensal
CREATE OR REPLACE FUNCTION public.enforce_member_booking_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_journey_count integer;
  v_is_journey boolean;
  v_consumes_slot boolean;
BEGIN
  IF NEW.liberty_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(s."order", 1) > 0 INTO v_is_journey
  FROM public.sessions s WHERE s.id = NEW.session_id;

  IF NOT COALESCE(v_is_journey, true) THEN
    RETURN NEW;
  END IF;

  v_consumes_slot := NEW.status::text NOT IN ('cancelled', 'not_realized');

  IF v_consumes_slot AND (
    TG_OP = 'INSERT'
    OR OLD.status::text IN ('cancelled', 'not_realized')
    OR OLD.liberty_id IS DISTINCT FROM NEW.liberty_id
  ) THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.liberty_id::text, 0));

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
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Registro retroativo de sessões
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS is_retroactive boolean NOT NULL DEFAULT false;

-- 3. Eventos: confirmação de presença
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS rsvp_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rsvp_deadline date,
  ADD COLUMN IF NOT EXISTS capacity integer;

CREATE TABLE IF NOT EXISTS public.event_attendance (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'going',
  guests integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (event_id, profile_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_attendance TO authenticated;
GRANT ALL ON public.event_attendance TO service_role;

ALTER TABLE public.event_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage their own attendance"
ON public.event_attendance FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = event_attendance.profile_id AND p.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = event_attendance.profile_id AND p.user_id = auth.uid()));

CREATE POLICY "Staff can view all attendance"
ON public.event_attendance FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'mentor'::app_role)
);

CREATE POLICY "Admins manage all attendance"
ON public.event_attendance FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_event_attendance_updated_at
BEFORE UPDATE ON public.event_attendance
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. NPS automático quando o relatório da sessão é enviado
CREATE OR REPLACE FUNCTION public.notify_nps_request_on_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_liberty_id uuid;
  v_liberty_user uuid;
  v_session_name text;
BEGIN
  SELECT b.liberty_id, s.name INTO v_liberty_id, v_session_name
  FROM public.bookings b
  LEFT JOIN public.sessions s ON s.id = b.session_id
  WHERE b.id = NEW.booking_id;

  IF v_liberty_id IS NULL THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM public.nps_responses r WHERE r.booking_id = NEW.booking_id) THEN
    RETURN NEW;
  END IF;

  SELECT public._notif_user_id(v_liberty_id) INTO v_liberty_user;
  IF v_liberty_user IS NULL THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = v_liberty_user
      AND n.type = 'nps_request'
      AND n.related_booking_id = NEW.booking_id
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications(user_id, type, title, message, link, related_booking_id)
  VALUES (
    v_liberty_user,
    'nps_request',
    'Pesquisa de satisfação (NPS)',
    'Como foi a sessão "' || COALESCE(v_session_name, 'de mentoria') || '"? Leva menos de 2 minutos.',
    '/nps/' || NEW.booking_id::text,
    NEW.booking_id
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_nps_request_on_report ON public.booking_reports;
CREATE TRIGGER trg_notify_nps_request_on_report
AFTER INSERT ON public.booking_reports
FOR EACH ROW EXECUTE FUNCTION public.notify_nps_request_on_report();