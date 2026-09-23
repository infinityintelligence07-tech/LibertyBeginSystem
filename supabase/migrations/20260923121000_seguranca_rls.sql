-- =====================================================================================
-- Auditoria 23/09/2026 · Fase 2 (segurança RLS)
--  1. bookings: membro só insere sessões próprias, futuras (não retroativas) e com status
--     scheduled/pending_approval; só altera as próprias para cancelar ou remarcar.
--  2. profiles: membro não altera colunas administrativas do próprio perfil.
--  3. user_roles: só admin gerencia; admin/super_admin só concedidos por super_admin.
--  4. profiles.user_id -> auth.users ON DELETE SET NULL (perfil sobrevive à exclusão da conta).
--  5. push_subscriptions: cada usuário só enxerga/edita os próprios tokens.
--  Decisão D5: leitura do mentor (todos os membros/bookings/relatórios) NÃO foi alterada.
--  Tudo idempotente (DROP POLICY IF EXISTS / CREATE OR REPLACE).
-- =====================================================================================

-- ------------------------------------------------------------------------------------
-- 1. BOOKINGS · INSERT pelo membro
--    Substitui "Libertys can insert own bookings" (só validava liberty_id).
--    Mentor ("Mentors can insert own bookings") e admin ("Admins can manage all bookings")
--    continuam com as policies já existentes.
-- ------------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Libertys can insert own bookings" ON public.bookings;
CREATE POLICY "Libertys can insert own bookings"
ON public.bookings
FOR INSERT
TO authenticated
WITH CHECK (
  liberty_id IN (
    SELECT pul.profile_id
    FROM public.profile_user_lookup pul
    WHERE pul.user_id = auth.uid()
  )
  AND mentor_id IS NOT NULL
  AND status::text IN ('scheduled', 'pending_approval')
  AND COALESCE(is_retroactive, false) = false
  AND (created_by IS NULL OR created_by = auth.uid())
);

-- ------------------------------------------------------------------------------------
-- 1b. BOOKINGS · UPDATE pelo membro (novo; antes o membro não tinha UPDATE)
--     Só linhas próprias ainda ativas; resultado só pode continuar ativo ou virar cancelled.
--     As colunas que o membro pode mexer são limitadas pelo trigger logo abaixo.
-- ------------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Libertys can update own bookings" ON public.bookings;
CREATE POLICY "Libertys can update own bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (
  liberty_id IN (
    SELECT pul.profile_id
    FROM public.profile_user_lookup pul
    WHERE pul.user_id = auth.uid()
  )
  AND status::text IN ('scheduled', 'pending_approval', 'rescheduled')
)
WITH CHECK (
  liberty_id IN (
    SELECT pul.profile_id
    FROM public.profile_user_lookup pul
    WHERE pul.user_id = auth.uid()
  )
  AND status::text IN ('scheduled', 'pending_approval', 'rescheduled', 'cancelled')
);

-- Trigger: quando quem atualiza NÃO é mentor/admin (ou seja, é o próprio membro),
-- bloqueia troca de liberty_id, mentor_id, session_id, is_retroactive, report_required,
-- approval_required, created_by, guest_name e qualquer status diferente de 'cancelled'.
-- Remarcação (scheduled_date/start_time/end_time/availability_id), cancellation_reason
-- e observations continuam liberados.
-- Ignora contexto sem usuário (service_role, cron, edge functions) e updates disparados
-- por outros triggers (pg_trigger_depth() > 1), para não quebrar sync_availability_booked etc.
CREATE OR REPLACE FUNCTION public.protect_booking_columns_for_members()
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

  IF public.has_role(v_uid, 'admin')
     OR public.has_role(v_uid, 'super_admin')
     OR public.has_role(v_uid, 'mentor') THEN
    RETURN NEW;
  END IF;

  -- Daqui em diante é um membro: precisa ser o dono da sessão.
  IF OLD.liberty_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profile_user_lookup pul
    WHERE pul.user_id = v_uid
      AND pul.profile_id = OLD.liberty_id
  ) THEN
    RAISE EXCEPTION 'BOOKING_COLUMN_PROTECTED'
      USING ERRCODE = 'P0001',
            DETAIL = 'Somente o próprio membro pode alterar esta sessão.';
  END IF;

  IF NEW.liberty_id        IS DISTINCT FROM OLD.liberty_id
     OR NEW.mentor_id         IS DISTINCT FROM OLD.mentor_id
     OR NEW.session_id        IS DISTINCT FROM OLD.session_id
     OR NEW.is_retroactive    IS DISTINCT FROM OLD.is_retroactive
     OR NEW.report_required   IS DISTINCT FROM OLD.report_required
     OR NEW.approval_required IS DISTINCT FROM OLD.approval_required
     OR NEW.created_by        IS DISTINCT FROM OLD.created_by
     OR NEW.guest_name        IS DISTINCT FROM OLD.guest_name THEN
    RAISE EXCEPTION 'BOOKING_COLUMN_PROTECTED'
      USING ERRCODE = 'P0001',
            DETAIL = 'O membro só pode remarcar ou cancelar a própria sessão.';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text <> 'cancelled' THEN
    RAISE EXCEPTION 'BOOKING_STATUS_NOT_ALLOWED'
      USING ERRCODE = 'P0001',
            DETAIL = 'O membro só pode cancelar a sessão. Confirmação é feita pelo mentor ou admin.';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_booking_columns_for_members() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_booking_columns_for_members ON public.bookings;
CREATE TRIGGER trg_protect_booking_columns_for_members
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.protect_booking_columns_for_members();

-- ------------------------------------------------------------------------------------
-- 2. PROFILES · colunas administrativas protegidas contra o próprio usuário
--    "Users can update own profile" continua igual; o trigger bloqueia as colunas:
--    member_tier, is_active, session_rate, user_id, admin_note, is_ranking_featured,
--    featured_position, email, courtesy_reschedules_left.
--    onboarding_completed fica liberado (o próprio membro encerra o onboarding).
--    Admin/super_admin, service_role e updates vindos de triggers (ex.: cortesia em
--    enforce_cancellation_policy, vínculo em handle_new_user) passam sem bloqueio.
-- ------------------------------------------------------------------------------------
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
      NEW.is_ranking_featured, NEW.featured_position, NEW.email, NEW.courtesy_reschedules_left)
     IS DISTINCT FROM
     (OLD.member_tier, OLD.is_active, OLD.session_rate, OLD.user_id, OLD.admin_note,
      OLD.is_ranking_featured, OLD.featured_position, OLD.email, OLD.courtesy_reschedules_left) THEN
    RAISE EXCEPTION 'PROFILE_COLUMN_PROTECTED'
      USING ERRCODE = 'P0001',
            DETAIL = 'Essas informações do perfil só podem ser alteradas pela administração.';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_profile_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_profile_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();

-- ------------------------------------------------------------------------------------
-- 3. USER_ROLES
--    Usuário comum: só lê a própria linha (policy já existente, garantida aqui).
--    Substitui "Admins can manage roles" (ALL) por policies separadas:
--    admin lê tudo, mas só insere/altera/exclui roles mentor/liberty;
--    conceder ou remover admin/super_admin exige super_admin.
-- ------------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone authenticated can view roles" ON public.user_roles;

DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can grant roles" ON public.user_roles;
CREATE POLICY "Admins can grant roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  AND (
    role::text NOT IN ('admin', 'super_admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
);

DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND (
    role::text NOT IN ('admin', 'super_admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  AND (
    role::text NOT IN ('admin', 'super_admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
);

DROP POLICY IF EXISTS "Admins can revoke roles" ON public.user_roles;
CREATE POLICY "Admins can revoke roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND (
    role::text NOT IN ('admin', 'super_admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
);

-- ------------------------------------------------------------------------------------
-- 4. PROFILES.user_id -> auth.users ON DELETE SET NULL
--    Hoje a FK (criada inline em 20260317183035, nome padrão profiles_user_id_fkey) é
--    ON DELETE CASCADE: apagar a conta apaga o perfil e todo o histórico ligado a ele.
--    Descobre o nome real da constraint no catálogo, troca por SET NULL e valida em
--    passo separado (se houver órfão, a FK fica NOT VALID e só avisa, sem falhar).
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  v_conname text;
  v_is_set_null boolean;
BEGIN
  SELECT c.conname, (c.confdeltype = 'n')
    INTO v_conname, v_is_set_null
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid
   AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'public.profiles'::regclass
    AND c.contype = 'f'
    AND c.confrelid = 'auth.users'::regclass
    AND a.attname = 'user_id'
  LIMIT 1;

  IF v_conname IS NOT NULL AND v_is_set_null THEN
    RETURN; -- já está como queremos
  END IF;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', v_conname);
  END IF;

  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL
    NOT VALID;

  BEGIN
    ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_user_id_fkey;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'profiles_user_id_fkey ficou NOT VALID (há profiles.user_id sem auth.users): %', SQLERRM;
  END;
END $$;

-- ------------------------------------------------------------------------------------
-- 5. PUSH_SUBSCRIPTIONS · só os próprios tokens
--    A policy existente não tinha TO; recriada explicitamente para authenticated
--    e sem acesso para anon.
-- ------------------------------------------------------------------------------------
REVOKE ALL ON public.push_subscriptions FROM anon;

DROP POLICY IF EXISTS "Users manage own push tokens" ON public.push_subscriptions;
CREATE POLICY "Users manage own push tokens"
ON public.push_subscriptions
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------------------------
-- 6. tool_applications / session_tasks / booking_reports
--    Leitura mantida (D5). Escrita do mentor NÃO foi restringida nesta migration:
--    - session_tasks: a tela /mentor/alunos/:id permite ao mentor validar/editar tarefas
--      de sessões conduzidas por outros mentores (fluxo intencional).
--    - tool_applications: um mentor pode continuar aplicação iniciada por outro.
--    - booking_reports: "Mentors can manage own reports" já restringe escrita ao mentor
--      do booking; "Mentors can view all reports" é só leitura.
-- ------------------------------------------------------------------------------------

-- VERIFICAÇÃO -------------------------------------------------------------------------
-- Rode no SQL Editor (role postgres) para conferir o resultado.
--
-- -- (a) policies vigentes em bookings (esperado: admin ALL, 2x SELECT, mentor INSERT/UPDATE/DELETE,
-- --     Libertys INSERT e Libertys UPDATE)
-- SELECT policyname, cmd, roles, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'bookings'
-- ORDER BY cmd, policyname;
--
-- -- (b) user_roles: não deve existir mais "Admins can manage roles" (ALL)
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'user_roles'
-- ORDER BY cmd, policyname;
--
-- -- (c) push_subscriptions e profiles: policies com TO authenticated
-- SELECT tablename, policyname, cmd, roles
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename IN ('push_subscriptions', 'profiles')
-- ORDER BY tablename, cmd, policyname;
--
-- -- (d) triggers e FK criados aqui
-- SELECT tgname, tgrelid::regclass, tgenabled
-- FROM pg_trigger
-- WHERE tgname IN ('trg_protect_booking_columns_for_members', 'trg_protect_profile_columns');
-- SELECT conname, confdeltype, convalidated
-- FROM pg_constraint
-- WHERE conrelid = 'public.profiles'::regclass AND contype = 'f' AND confrelid = 'auth.users'::regclass;
