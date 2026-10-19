-- Begin: 3 reagendamentos por indisponibilidade do aluno.
-- O 4º e os seguintes custam R$ 1.000 e travam o agendamento do aluno
-- até a coordenação registrar a cobrança.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reschedule_scheduling_locked boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.member_reschedule_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  session_name text,
  previous_date date,
  new_date date,
  kind text NOT NULL CHECK (kind IN ('courtesy', 'charge')),
  charge_cents integer,
  charge_settled_at timestamptz,
  created_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS member_reschedule_events_profile_idx
  ON public.member_reschedule_events (profile_id, created_at DESC);

ALTER TABLE public.member_reschedule_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_reschedule_events TO authenticated;
GRANT ALL ON public.member_reschedule_events TO service_role;

DROP POLICY IF EXISTS "Admins manage reschedule events" ON public.member_reschedule_events;
CREATE POLICY "Admins manage reschedule events"
  ON public.member_reschedule_events
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Mentors can read reschedule events" ON public.member_reschedule_events;
CREATE POLICY "Mentors can read reschedule events"
  ON public.member_reschedule_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'mentor'));

CREATE OR REPLACE FUNCTION public.register_student_unavailability(
  _profile_id uuid,
  _booking_id uuid DEFAULT NULL,
  _session_name text DEFAULT NULL,
  _previous_date date DEFAULT NULL,
  _new_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used integer;
  v_kind text;
  v_member_name text;
  v_author_id uuid;
  v_author_name text;
  v_admin record;
  v_title text;
  v_message text;
BEGIN
  IF auth.uid() IS NULL
     OR NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'RESCHEDULE_FORBIDDEN'
      USING ERRCODE = 'P0001',
            DETAIL = 'Só a coordenação registra esse reagendamento.';
  END IF;

  SELECT full_name INTO v_member_name FROM public.profiles WHERE id = _profile_id;
  IF v_member_name IS NULL THEN
    RAISE EXCEPTION 'RESCHEDULE_MEMBER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)::integer INTO v_used
  FROM public.member_reschedule_events
  WHERE profile_id = _profile_id AND kind = 'courtesy';

  SELECT p.id, p.full_name INTO v_author_id, v_author_name
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  ORDER BY p.created_at
  LIMIT 1;

  IF v_used < 3 THEN
    v_kind := 'courtesy';
    INSERT INTO public.member_reschedule_events (
      profile_id, booking_id, session_name, previous_date, new_date,
      kind, created_by_profile_id, created_by_name
    ) VALUES (
      _profile_id, _booking_id, _session_name, _previous_date, _new_date,
      'courtesy', v_author_id, v_author_name
    );
    v_used := v_used + 1;
    IF v_used >= 3 THEN
      UPDATE public.profiles
      SET reschedule_scheduling_locked = true
      WHERE id = _profile_id;
      v_title := 'Cobrar o próximo reagendamento';
      v_message := v_member_name
        || ' usou os 3 reagendamentos por indisponibilidade do aluno. O próximo custa R$ 1.000. Os agendamentos deste aluno estão travados.';
    END IF;
  ELSE
    v_kind := 'charge';
    INSERT INTO public.member_reschedule_events (
      profile_id, booking_id, session_name, previous_date, new_date,
      kind, charge_cents, created_by_profile_id, created_by_name
    ) VALUES (
      _profile_id, _booking_id, _session_name, _previous_date, _new_date,
      'charge', 100000, v_author_id, v_author_name
    );
    UPDATE public.profiles
    SET reschedule_scheduling_locked = true
    WHERE id = _profile_id;
    v_title := 'Cobrar R$ 1.000';
    v_message := v_member_name
      || ' reagendou por indisponibilidade do aluno além dos 3 créditos. Registrar a cobrança de R$ 1.000 e liberar o agendamento.';
  END IF;

  IF v_title IS NOT NULL THEN
    FOR v_admin IN
      SELECT ur.user_id
      FROM public.user_roles ur
      WHERE ur.role IN ('admin', 'super_admin')
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, link, related_booking_id)
      VALUES (
        v_admin.user_id,
        'reschedule_charge',
        v_title,
        v_message,
        '/admin/membros/' || _profile_id::text,
        _booking_id
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'kind', v_kind,
    'courtesy_used', LEAST(v_used, 3),
    'locked', v_used >= 3
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_reschedule_charge(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_name text;
BEGIN
  IF auth.uid() IS NULL
     OR NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'RESCHEDULE_FORBIDDEN'
      USING ERRCODE = 'P0001',
            DETAIL = 'Só a coordenação libera o agendamento.';
  END IF;

  SELECT p.full_name INTO v_author_name
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  ORDER BY p.created_at
  LIMIT 1;

  UPDATE public.member_reschedule_events
  SET charge_settled_at = now(),
      created_by_name = COALESCE(created_by_name, v_author_name)
  WHERE profile_id = _profile_id
    AND kind = 'charge'
    AND charge_settled_at IS NULL;

  UPDATE public.profiles
  SET reschedule_scheduling_locked = false
  WHERE id = _profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_student_unavailability(uuid, uuid, text, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.settle_reschedule_charge(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_student_unavailability(uuid, uuid, text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_reschedule_charge(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.block_booking_when_reschedule_locked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked boolean;
BEGIN
  IF NEW.liberty_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT reschedule_scheduling_locked INTO v_locked
  FROM public.profiles
  WHERE id = NEW.liberty_id;

  IF COALESCE(v_locked, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL
     OR public.has_role(auth.uid(), 'admin')
     OR public.has_role(auth.uid(), 'super_admin') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'RESCHEDULE_CREDITS_LOCKED'
    USING ERRCODE = 'P0001',
          DETAIL = 'Os 3 reagendamentos por indisponibilidade já foram usados. A coordenação libera o próximo agendamento.';
END;
$$;

REVOKE ALL ON FUNCTION public.block_booking_when_reschedule_locked() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_block_booking_when_reschedule_locked ON public.bookings;
CREATE TRIGGER trg_block_booking_when_reschedule_locked
BEFORE INSERT ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.block_booking_when_reschedule_locked();

-- O aluno não pode destravar o próprio agendamento.
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'super_admin') THEN
    RETURN NEW;
  END IF;

  IF (NEW.member_tier, NEW.is_active, NEW.session_rate, NEW.user_id, NEW.admin_note,
      NEW.is_ranking_featured, NEW.featured_position, NEW.email, NEW.courtesy_reschedules_left,
      NEW.reschedule_scheduling_locked)
     IS DISTINCT FROM
     (OLD.member_tier, OLD.is_active, OLD.session_rate, OLD.user_id, OLD.admin_note,
      OLD.is_ranking_featured, OLD.featured_position, OLD.email, OLD.courtesy_reschedules_left,
      OLD.reschedule_scheduling_locked) THEN
    RAISE EXCEPTION 'PROFILE_COLUMN_PROTECTED'
      USING ERRCODE = 'P0001',
            DETAIL = 'Essas informações do perfil só podem ser alteradas pela administração.';
  END IF;

  RETURN NEW;
END;
$function$;
