# Auditoria de banco — LibertyBeginSystem (Supabase/Postgres)

Escopo lido integralmente: 111 migrations em `supabase/migrations/`, `src/integrations/supabase/types.ts`, `supabase/config.toml`. Nenhum arquivo foi editado. Nas seções 1 e 5 cito migrations pelo prefixo de timestamp (único); nos achados (2–4) cito o nome completo.

---

## 1. Estado final reconstruído

### 1.1 Tabelas e colunas relevantes

- **profiles** — `id` PK; `user_id` uuid NULL UNIQUE FK `auth.users` ON DELETE CASCADE; `full_name` NOT NULL; `email` text NULL (índice único parcial `lower(email) WHERE email IS NOT NULL`, 20260819163100); `phone`, `avatar_url`, `google_calendar_email`, `google_connected` bool; `company_name`, `program_start_date`, `program_end_date`, `session_rate` numeric; `member_tier` enum NULL (NOT NULL removido em 20260716210038); `is_active`; `admin_note`; `onboarding_completed`; `courtesy_reschedules_left` int default 3; `is_ranking_featured`, `featured_position`; ~30 colunas de onboarding (`birth_date`…`main_pain`, `employees_count_num`, `leaders_count`, `business_story`); `created_at`, `updated_at`. `google_refresh_token` removido (20260630145750).
- **user_roles** — `user_id` FK `auth.users` CASCADE NOT NULL; `role` app_role; UNIQUE(user_id, role); idx `user_id`.
- **profile_user_lookup** — `profile_id` PK FK profiles CASCADE; `user_id` UNIQUE NOT NULL (espelho mantido por trigger).
- **user_oauth_tokens** — `profile_id` PK FK CASCADE; `google_refresh_token`; `updated_at` (sem trigger).
- **sessions** — `name` UNIQUE; `duration_minutes` default 90; `"order"` int default 0 (**sem unique**); `is_active`; `pillar`; `cover_image_url`; `tier` text CHECK(begin|liberty) default 'begin'; `is_kickoff` bool default false (**sem unique parcial**); `created_at` (sem `updated_at`).
- **mentor_sessions** — `mentor_id`/`session_id` FK CASCADE; UNIQUE(mentor_id, session_id).
- **mentor_availability** — `mentor_id` FK CASCADE; `day_of_week` CHECK 0–6; `start_time`, `end_time`, `specific_date`, `is_recurring`, `is_booked`; idx `mentor_id`.
- **bookings** — `liberty_id` NULL FK profiles (**NO ACTION**); `mentor_id` NOT NULL FK profiles (**NO ACTION**); `session_id` FK sessions (NO ACTION); `availability_id` FK mentor_availability ON DELETE SET NULL (20260914164421); `scheduled_date` date; `start_time`/`end_time` time; `status` booking_status default 'scheduled'; `zoom_*`, `google_event_id_*`(3); `cancellation_reason`, `observations`; `created_by` FK `auth.users` (**NO ACTION**); `guest_name` + CHECK `bookings_liberty_or_guest`; `approval_required`; `reminder_24h_sent_at`, `pending_reminder_sent_at`; `is_retroactive`; `report_required` default true. Índices: `(mentor_id, scheduled_date)`, `(liberty_id, scheduled_date)`, `scheduled_date`, `status`, `session_id`; único parcial `bookings_unique_active_mentor_slot (mentor_id, scheduled_date, start_time) WHERE status IN (scheduled, pending_approval, rescheduled)`. `bookings_unique_liberty_session_active` foi **removido** (20260605141119). REPLICA IDENTITY FULL + publication `supabase_realtime`.
- **booking_reports** — `booking_id` FK CASCADE UNIQUE; `summary`, `action_plan`, `goals`, `mentor_impressions`, `tool_link`, `ai_insights`, `delivered`, `next_steps`, `pdf_delivered_at`, `pdf_delivery_method`, `tool_attachment_url`.
- **session_tasks** — `booking_id` FK CASCADE; `description`; `is_completed`; `result_type` CHECK; `result_value/metric/notes`; `completed_at`; `completed_by_role` CHECK; `validated_at`; `validated_by` FK SET NULL; `origin` CHECK; `created_by_mentor_id` FK SET NULL; `in_progress`; `planned_date`; `assignee_name`; `due_date`; `created_at/updated_at` NULLable (**sem trigger updated_at**).
- **student_tools** — `liberty_id` FK CASCADE; `booking_id` FK SET NULL; `uploaded_by` FK SET NULL; `file_type` CHECK(image|pdf|link|document); `file_name/file_path` NULL; `external_url`.
- **tool_templates** — `slug` UNIQUE; `schema` jsonb; `result_type`; `is_active`; `sort_order`.
- **tool_applications** — `template_id` FK CASCADE; `member_id` FK CASCADE; `applied_by` FK SET NULL; `status` CHECK(in_progress|completed); `phase` CHECK(inicial|final); `answers`, `scores` jsonb.
- **notifications** — `user_id` uuid NOT NULL (**sem FK**); `type` text (sem CHECK); `title`, `message`, `link`; `related_booking_id` (**sem FK**); `read_at`. Índices `(user_id, created_at DESC)` total e parcial `WHERE read_at IS NULL`. REPLICA IDENTITY FULL + realtime.
- **push_subscriptions** — `user_id` FK `auth.users` CASCADE; `token` UNIQUE; `user_agent`; `last_seen_at`.
- **nps_responses** — `liberty_id` FK CASCADE; `mentor_id`/`session_id`/`booking_id` FK SET NULL; snapshots de nome/whatsapp; 5 scores smallint CHECK 0–10; textos. Sem índices além do PK.
- **nps_mentor_options** — tabela materializada (`profile_id` PK FK CASCADE, `full_name`), refeita por trigger de statement.
- **events** — `event_date`, `event_time` text, `location*`, `cover_image_url`, `is_online`, `is_visible`, `rsvp_enabled`, `rsvp_deadline`, `capacity`.
- **event_attendance** — `event_id`/`profile_id` FK CASCADE; `status` text default 'going' (**sem CHECK**); `guests`; UNIQUE(event_id, profile_id).
- **contents** — `content_type` text (sem CHECK); `session_id` FK SET NULL; `phase_unlock`; `is_public`; `is_active`.
- **member_points** — `member_id` (**sem FK**); `points`; `reason` text; `related_booking_id/task_id/testimonial_id` (**sem FK**).
- **member_testimonials** — `member_id` (**sem FK**); `headline`, `content`, `result_metric`, `is_public`.
- **featured_case_of_day** — `case_date` UNIQUE; `member_id` NOT NULL (**sem FK** — o `CREATE TABLE IF NOT EXISTS` com FK em 20260720223558 foi no-op); `metric_label/value`; `source_booking_id/testimonial_id`.
- **system_config** — `key` PK, `value`, `updated_at` (sem trigger). Chaves conhecidas: `session_value`, `send_push_url`, `send_push_service_key`.
- **profile_merge_log** — `winner_id`, `loser_id`, `*_before` jsonb, `moved` jsonb, `performed_by`, `undone_at/by`.
- **View** `public_member_profiles` (`security_invoker = true`).
- **Enums**: `app_role` (admin, mentor, liberty, super_admin); `booking_status` (scheduled, completed, rescheduled, cancelled, pending_approval, not_realized); `member_tier` (begin, liberty).
- **Schema `app_private`** (USAGE para authenticated): `has_role`, `profile_has_role`, `get_ranking_board_internal`, `get_ranking_totals_internal`, `list_tool_members_internal`.
- **Extensões/cron**: `pg_net`, `pg_cron`. Jobs: `dispatch-booking-reminders` (`*/15 * * * *`), `report-overdue-nudges` (`0 12 * * *`). `dispatch_availability_nudges` **nunca agendado**.
- **Storage**: buckets `avatars` (public) e `session-covers` (public) criados por migration; `student-tools` referenciado em policies mas **nunca criado em migration**.

### 1.2 Triggers vigentes (tabela → trigger → função → última migration que definiu trigger / função)

- `auth.users`: `on_auth_user_created` AFTER INSERT → `handle_new_user` (trigger 20260317183404 / função **20260821205542**).
- `profiles`: `update_profiles_updated_at` → `update_updated_at_column` (20260317183035); `sync_profile_user_lookup_on_profiles` AFTER INSERT OR UPDATE OF user_id → `sync_profile_user_lookup` (20260630152859); `trg_sync_profile_user_lookup` idem (20260701124517) — **duplicado**; `trg_sync_nps_mentor_options_profiles` (statement) → `sync_nps_mentor_options_trigger` (20260710195646).
- `user_roles`: `trg_sync_nps_mentor_options_roles` (statement) → `sync_nps_mentor_options_trigger` (20260710195646).
- `profile_user_lookup`: `trg_sync_nps_mentor_options_lookup` (statement) → idem.
- `bookings`: `update_bookings_updated_at` (20260317183035); `trg_notify_booking_changes` AFTER INSERT OR UPDATE → `notify_booking_changes` (trigger 20260701124517 / função **20260827213716**); `trg_notify_report_pending_ins` AFTER INSERT e `trg_notify_report_pending_upd` AFTER UPDATE OF status → `notify_report_pending_for_mentor` (trigger 20260719234454 / função **20260830144233**); `trg_enforce_cancellation_policy` AFTER UPDATE OF status → `enforce_cancellation_policy` (20260720173456); `trg_award_points_session` AFTER INSERT OR UPDATE OF status → `award_points_on_session_completed` (20260720181011); `trg_enforce_member_booking_rules` BEFORE INSERT OR UPDATE OF status, scheduled_date, liberty_id, session_id → `enforce_member_booking_rules` (trigger 20260813211436 / função **20260827213401**); `trg_booking_report_required` BEFORE INSERT OR UPDATE OF session_id, is_retroactive → `set_booking_report_required` (**20260830144233**); `trg_sync_availability_booked` AFTER INSERT OR UPDATE OF status, scheduled_date, start_time, mentor_id, availability_id OR DELETE → `sync_availability_booked` (20260830142524); `trg_clear_pending_notifications` AFTER UPDATE → `clear_pending_notifications_on_status_change` (20260908132223).
- `booking_reports`: `update_booking_reports_updated_at` (20260317191226); `trg_notify_report_available` AFTER INSERT → `notify_report_available` (20260719234454); `trg_notify_nps_request_on_report` AFTER INSERT → `notify_nps_request_on_report` (20260827213401).
- `session_tasks`: `trg_notify_task_assigned` AFTER INSERT → `notify_task_assigned` (20260719234454); `trg_award_points_task` AFTER INSERT OR UPDATE OF is_completed → `award_points_on_task_completed` (20260720181011). **Sem trigger de updated_at.**
- `student_tools`: `update_student_tools_updated_at`; `trg_notify_student_tool_added` → `notify_student_tool_added` (20260719234454).
- `notifications`: `trg_fire_push_on_notification` AFTER INSERT → `fire_push_on_notification` (trigger 20260714153334 / função **20260714173548**).
- `member_testimonials`: `trg_testimonials_updated_at`; `trg_award_points_testimonial` AFTER INSERT → `award_points_on_testimonial` (20260720181011).
- `contents`, `events`: `update_*_updated_at` (20260317191226). `nps_responses`: (20260701211407). `tool_templates`, `tool_applications`: (20260727151530). `event_attendance`: (20260827213401). `profile_merge_log`: (20260914224929).

### 1.3 Funções vigentes (última definição)

- `public.has_role(uuid, app_role)` — **20260701124650**: SECURITY INVOKER, wrapper para `app_private.has_role`. Grants finais em 20260723132424 (authenticated, service_role).
- `app_private.has_role` — 20260701124650: SECURITY DEFINER, `SET search_path = public`; `_role='admin'` também aceita `super_admin`.
- `app_private.profile_has_role` — 20260716211552 (EXECUTE concedido a authenticated **e anon**).
- `handle_new_user` — **20260821205542**: busca profile com `lower(email)=lower(NEW.email) AND user_id IS NULL`, vincula; senão insere.
- `enforce_member_booking_rules` — **20260827213401**: só limite de jornada (`>= 13`), sem KICKOFF_REQUIRED, sem limite mensal.
- `set_booking_report_required` — **20260830144233**: `report_required := NOT (is_kickoff OR is_retroactive)`.
- `notify_booking_changes` — **20260827213716**. `notify_report_pending_for_mentor` — 20260830144233. `notify_report_available`, `notify_task_assigned`, `notify_student_tool_added` — 20260719234454. `notify_nps_request_on_report` — 20260827213401. `_notif_user_id` — 20260526193217 (SECURITY DEFINER).
- `update_updated_at_column` — 20260317183035 (SECURITY INVOKER, search_path set).
- `sync_profile_user_lookup` — 20260630152859. `refresh_nps_mentor_options` — 20260716212834. `sync_nps_mentor_options_trigger` — 20260710195646.
- `fire_push_on_notification` — 20260714173548 (`net.http_post` com chave lida de `system_config`).
- `dispatch_booking_reminders` — 20260720004243. `dispatch_report_nudges` — 20260830144233. `dispatch_availability_nudges` — 20260720173456.
- `enforce_cancellation_policy` — 20260720173456. `award_points_on_*` — 20260720181011. `sync_availability_booked` — 20260830142524. `clear_pending_notifications_on_status_change` — 20260908132223.
- `get_ranking_board`, `get_ranking_totals`, `list_tool_members` — 20260916231353 (INVOKER → `app_private.*_internal` DEFINER).
- Removidas: `current_profile_id` (20260630152859), `public.profile_has_role` (20260701124615), `get_nps_mentor_options` (20260710195646).
- Todas as SECURITY DEFINER têm `SET search_path` — nenhuma sem.

### 1.4 Policies RLS vigentes (todas as 25 tabelas têm RLS habilitado)

- **profiles**: `Users can view own profile` SELECT `auth.uid()=user_id` (20260505144630); `Users can update own profile` UPDATE own (20260701124517); `Users can insert own profile` INSERT own (20260317183035); `Admins can manage all profiles` ALL `app_private.has_role admin` (20260701124650); `Super admins can manage all profiles` ALL (20260727155724, redundante); `Mentors can view all members` SELECT mentor ∧ `member_tier IN (begin, liberty)` (20260716210038); `Mentors can view other mentors` SELECT mentor ∧ `profile_has_role(id,'mentor')` (20260716211552).
- **user_roles**: `Users can view own roles` SELECT (20260630145750); `Admins can manage roles` ALL (20260701124650).
- **sessions**: `Sessions are viewable by everyone` SELECT true; `Admins can manage sessions` ALL (20260317183035) **e** `Admins can manage all sessions` ALL (20260701124650) — duplicadas.
- **mentor_sessions**: SELECT true; `Admins can manage mentor_sessions` ALL (20260701124650).
- **mentor_availability**: SELECT true; `Mentors and admins can manage availability` ALL `mentor_id ∈ meus profiles OR admin OR super_admin` (20260729201447).
- **bookings**: `Admins can manage all bookings` ALL; `Users can view relevant bookings` SELECT (liberty/mentor via `profile_user_lookup` OR admin); `Mentors can view all bookings` SELECT mentor; `Mentors can insert/update/delete own bookings` (mentor ∧ mentor_id próprio) — todas 20260701124650; `Libertys can insert own bookings` INSERT `liberty_id ∈ lookup` (20260701124517). **Membro não tem UPDATE/DELETE.**
- **booking_reports**: `Admins can manage reports` ALL; `Mentors can manage own reports` ALL (booking.mentor = eu); `Libertys can view own reports` SELECT (20260317191226); `Mentors can view all reports` SELECT (20260701214259).
- **session_tasks**: `Admins can manage` ALL; `Mentors can manage all session_tasks` ALL (20260701211005); `Libertys can view own` SELECT e `Libertys can update own` UPDATE (20260326124243).
- **student_tools**: aluno lê próprios; mentores/admins SELECT/INSERT/UPDATE/DELETE tudo (20260625194840).
- **tool_templates**: SELECT true; `Admins manage templates` ALL. **tool_applications**: `Mentors and admins manage applications` ALL; `Member reads own completed applications` SELECT (20260727151530).
- **notifications**: `Users view own` SELECT; `Users update own` UPDATE; `Admins manage notifications` ALL (20260701124650); `Staff can create notifications` INSERT mentor/admin/super_admin (20260701211005).
- **push_subscriptions**: `Users manage own push tokens` ALL (sem `TO`, 20260714153334).
- **nps_responses**: liberty INSERT/SELECT próprios; `Admins can read all nps` SELECT; `Mentors can read own mentor nps` SELECT (20260716205707). Sem UPDATE/DELETE para ninguém via API.
- **nps_mentor_options**: SELECT true (20260710195646).
- **events**: `Admins can manage events` ALL (20260701124650); `Authenticated can view visible events` SELECT. **event_attendance**: membro ALL próprio; staff SELECT tudo; admins ALL (20260827213401).
- **contents**: `Admins can manage contents` ALL (20260701124650); SELECT `is_active`.
- **member_points**: `member_points_select_owner_or_staff` SELECT (20260723131039); `service manages` ALL TO service_role. **member_testimonials**: leitura pública/própria/admin; `member manages own testimonials` ALL (20260720181011). **featured_case_of_day**: 2× SELECT true; `Admins manage featured case` ALL (20260720223558); service ALL.
- **system_config**: `Admins can read system config` SELECT (20260720005149); `Admins can manage config` ALL (20260317183035).
- **user_oauth_tokens**: `No direct user access` ALL `false` + REVOKE ALL de anon/authenticated (20260701124755). **profile_user_lookup**: SELECT own (20260630152859). **profile_merge_log**: `Admins can view merge log` SELECT (20260914224929).
- **storage.objects**: `Admins manage avatars` ALL; `Users upload/update/delete own avatar` (pasta = `auth.uid()`) (20260505135914); `Admins manage session covers` ALL (20260531152112); `Student reads own tool files`, `Mentors and admins read/upload/delete tool files` (20260625194840). Policies de leitura pública removidas em 20260630145750 (buckets seguem `public = true`).

---

## 2. Problemas de integridade/lógica

**Confirmações pedidas**

- `enforce_member_booking_rules`: a versão de `20260827213401_82f1ed6a-18bb-4e30-ab72-6565a18d17b7.sql` é a **vigente**. Nenhuma migration posterior (20260827213418 … 20260916231353) redefine a função; KICKOFF_REQUIRED e MONTHLY_BOOKING_LIMIT_EXCEEDED estão de fato removidos.
- Limite `>= 13`: conta bookings do membro com `sessions."order" > 0` e status ∉ (cancelled, not_realized), excluindo a própria linha; rejeita quando já existem 13 → permite exatamente 13 = kickoff (`order = 1`, 20260722162452) + 12 sessões de jornada. Porém a contagem não filtra por `tier` nem por `is_active` (ver achado abaixo).
- `set_booking_report_required`: trigger é `BEFORE INSERT OR UPDATE OF session_id, is_retroactive` — **sim**, se o admin trocar `session_id` para o kickoff, `report_required` é recalculado. Não recalcula quando `sessions.is_kickoff` muda (não há trigger em `sessions`).
- `handle_new_user` (20260821205542): comparação já é case-insensitive (`lower(email)`), mas não faz `trim`, só vincula se `user_id IS NULL` e, quando não encontra, faz INSERT que colide com o índice único `lower(email)` — ver achado crítico.

**Achados**

- [SEVERIDADE: crítico] `20260701124517_293a3929-62d3-466f-a51f-98b937af7c8f.sql:48-58` — policy `Libertys can insert own bookings` só valida `liberty_id`; não restringe `status`, `mentor_id`, `session_id`, `is_retroactive`, `approval_required`, `created_by`. `enforce_member_booking_rules` também não valida status — impacto: membro faz POST com `status='completed'` (ganha +10 pontos via `award_points_on_session_completed`, consome slot da jornada, dispara `report_pending` ao mentor), pula `pending_approval`, agenda sessão de tier `liberty`, marca `is_retroactive=true` para dispensar relatório — correção: `DROP POLICY "Libertys can insert own bookings" ON public.bookings; CREATE POLICY "Libertys can insert own bookings" ON public.bookings FOR INSERT TO authenticated WITH CHECK (liberty_id IN (SELECT profile_id FROM public.profile_user_lookup WHERE user_id = auth.uid()) AND status = 'pending_approval' AND is_retroactive = false AND created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.sessions s JOIN public.profiles p ON p.id = liberty_id WHERE s.id = session_id AND s.is_active AND (s.tier = 'begin' OR p.member_tier = 'liberty')));`
- [SEVERIDADE: crítico] `20260821205542_c6a05062-bc68-4244-984b-867008bf4eb2.sql:31-32` + `20260819163100_c726b2d8-15a7-4c92-abd7-3e8495e36e2a.sql:90-91` — `handle_new_user` insere novo profile quando não há profile com `user_id IS NULL` para o e-mail; se já existe profile com mesmo e-mail **vinculado a outro `user_id`** (conta duplicada, reconvite após troca de e-mail no auth, etc.), o INSERT viola `profiles_email_unique_idx`, a exceção propaga para `auth.users` e o signup/convite falha com "Database error saving new user" — impacto: usuários não conseguem ser criados/convidados; erro opaco — correção: tratar colisão explicitamente: `... IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(trim(email)) = lower(trim(NEW.email))) THEN RAISE EXCEPTION 'PROFILE_EMAIL_ALREADY_LINKED' USING DETAIL = NEW.email; END IF; INSERT ...` (ou vincular via merge administrativo), e normalizar com `lower(trim(...))` no índice e na função: `DROP INDEX profiles_email_unique_idx; CREATE UNIQUE INDEX profiles_email_unique_idx ON public.profiles (lower(trim(email))) WHERE email IS NOT NULL;`
- [SEVERIDADE: alto] `20260701124517_293a3929-62d3-466f-a51f-98b937af7c8f.sql:69-74` — `Users can update own profile` permite ao membro alterar **qualquer coluna** do próprio perfil: `member_tier` (begin→liberty libera sessões exclusivas), `courtesy_reschedules_left` (repõe cortesias), `is_active`, `session_rate`, `is_ranking_featured`/`featured_position`, `program_*_date`, `onboarding_completed`, `email`, `user_id` — impacto: escalonamento de privilégio de negócio e fraude no ranking — correção: trigger de proteção: `CREATE FUNCTION public.protect_profile_admin_columns() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF auth.uid() IS NULL OR pg_trigger_depth() > 1 OR app_private.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF; IF (NEW.member_tier, NEW.courtesy_reschedules_left, NEW.is_active, NEW.session_rate, NEW.is_ranking_featured, NEW.featured_position, NEW.program_start_date, NEW.program_end_date, NEW.email, NEW.user_id, NEW.admin_note) IS DISTINCT FROM (OLD.member_tier, OLD.courtesy_reschedules_left, OLD.is_active, OLD.session_rate, OLD.is_ranking_featured, OLD.featured_position, OLD.program_start_date, OLD.program_end_date, OLD.email, OLD.user_id, OLD.admin_note) THEN RAISE EXCEPTION 'PROFILE_PROTECTED_COLUMN'; END IF; RETURN NEW; END $$; CREATE TRIGGER trg_protect_profile_admin_columns BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_admin_columns();`
- [SEVERIDADE: alto] `20260521164752_80be562d-4a51-400a-9fb5-7efc55878b7e.sql:1` + `20260505144630_e170a95d-4785-4b7a-af10-cc4f0b405397.sql:35-39` — `admin_note` fica na mesma linha que o membro lê via `Users can view own profile` — impacto: o membro lê anotações internas da administração sobre ele — correção: mover para tabela dedicada: `CREATE TABLE public.profile_admin_notes (profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE, note text, updated_at timestamptz NOT NULL DEFAULT now()); ALTER TABLE public.profile_admin_notes ENABLE ROW LEVEL SECURITY; CREATE POLICY "Admins manage admin notes" ON public.profile_admin_notes FOR ALL TO authenticated USING (app_private.has_role(auth.uid(),'admin')) WITH CHECK (app_private.has_role(auth.uid(),'admin')); INSERT INTO public.profile_admin_notes SELECT id, admin_note, now() FROM public.profiles WHERE admin_note IS NOT NULL; ALTER TABLE public.profiles DROP COLUMN admin_note;`
- [SEVERIDADE: alto] `20260714173548_1be7274d-8e46-4e60-bf07-711d0d5a9fe7.sql:12,22` + `20260720005149_9052ebeb-a529-4c6f-a075-225a61cc107e.sql:5-10` — `fire_push_on_notification` lê `send_push_service_key` (service_role key) de `system_config`, tabela legível por qualquer usuário com role admin via Data API — impacto: um admin comprometido (ou XSS na área admin) exfiltra a service_role key, que bypassa toda RLS — correção: usar Vault: `SELECT vault.create_secret('<key>', 'send_push_service_key');` e na função `SELECT decrypted_secret INTO v_service_key FROM vault.decrypted_secrets WHERE name = 'send_push_service_key';` depois `DELETE FROM public.system_config WHERE key = 'send_push_service_key';`. Alternativa: a edge function `send-push` valida um segredo próprio (não a service key).
- [SEVERIDADE: alto] `20260827213401_82f1ed6a-18bb-4e30-ab72-6565a18d17b7.sql:33-41` — o limite 13 conta **todas** as sessões com `order > 0`: inclui as 7 sessões de tier `liberty` (`order` 101–107) e a sessão inativa "Mapa do Negócio" (`order = 999`) — impacto: membro `liberty` que fez a jornada begin é bloqueado ao tentar as sessões liberty; quem fez "Mapa do Negócio" antes do kickoff e depois o kickoff perde uma vaga — correção: limitar por tier da sessão e derivar o limite do catálogo: `SELECT count(*) INTO v_journey_count FROM public.bookings b JOIN public.sessions s ON s.id=b.session_id WHERE b.liberty_id=NEW.liberty_id AND s.tier = v_new_tier AND s."order" > 0 AND b.status::text NOT IN ('cancelled','not_realized') AND b.id IS DISTINCT FROM NEW.id; SELECT count(*) INTO v_limit FROM public.sessions WHERE tier = v_new_tier AND is_active AND "order" > 0; IF v_journey_count >= v_limit THEN RAISE ...`
- [SEVERIDADE: alto] `20260720181011_f6b1e2ba-1501-4a67-8437-f2e52db65e5b.sql:128-141` + `:44-53` — `award_points_on_testimonial` dá +20 a cada INSERT sem dedupe e `member manages own testimonials` permite INSERT/DELETE ilimitado; pontos nunca são removidos no DELETE — impacto: farm infinito de pontos (inserir/apagar depoimento) — correção: `CREATE UNIQUE INDEX member_points_one_testimonial_bonus ON public.member_points(member_id) WHERE reason = 'testimonial_added';` + trigger `AFTER DELETE ON member_testimonials` removendo `member_points WHERE related_testimonial_id = OLD.id`, ou só pontuar quando admin aprova (`is_public` setado por admin).
- [SEVERIDADE: alto] `20260326124243_e182f6fd-4f8a-41f6-bf56-5c5cbc93bd1c.sql:45-60` + `20260720181011_...sql:103-126` — `Libertys can update own session_tasks` permite ao membro setar `is_completed=true`, `validated_at`, `validated_by`, `origin`; `award_points_on_task_completed` pontua no `is_completed` sem exigir validação do mentor — impacto: membro se autopontua (+3 por tarefa) e "valida" tarefas — correção: pontuar em `validated_at IS NOT NULL` (trigger `AFTER UPDATE OF validated_at`) e restringir colunas do membro por trigger (`completed_by_role='liberty'`, `is_completed`, `result_*`, `completed_at` apenas).
- [SEVERIDADE: alto] `20260830142524_f0799114-3930-4f68-8e6f-10b9c88486c1.sql:46,71,82` — `sync_availability_booked` marca `is_booked=true` no slot **recorrente** (`is_recurring AND day_of_week = DOW`) e libera (`is_booked=false`) ao cancelar sem verificar outros bookings no mesmo slot — impacto: um booking bloqueia o horário semanal para todas as semanas; um cancelamento libera slot ainda ocupado em outra data — correção: não usar `is_booked` para recorrentes (calcular ocupação por `bookings` na data) ou só marcar quando `a.specific_date IS NOT NULL`; ao liberar: `UPDATE mentor_availability SET is_booked=false WHERE id=OLD.availability_id AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.availability_id=OLD.availability_id AND b.id<>OLD.id AND b.status IN ('scheduled','pending_approval','rescheduled'))`.
- [SEVERIDADE: médio] `20260720004243_368ce96b-f165-4c53-89da-a4c1fe54dafa.sql:20,47`, `20260830144233_f5492772-7c68-4f2f-ae8d-1af5cfa62e46.sql:87,111`, `20260827213716_929c57b0-c2b5-48ae-93ae-10e4401d4ecd.sql:43` vs `20260720173456_9da9e28b-7667-4e2c-9cdc-932a42f72aeb.sql:25` — `scheduled_date::timestamp + start_time` (naive, hora de SP) é comparado a `now()` (timestamptz) com TimeZone da sessão = UTC em três funções; só `enforce_cancellation_policy` aplica `AT TIME ZONE 'America/Sao_Paulo'` — impacto: deslocamento de 3h: `dispatch_report_nudges` (cron 12:00 UTC = 09:00 BRT) marca como "sem relatório" sessões das 09:00–10:00 BRT **antes de acontecerem**; lembrete 24h sai ~27h antes; alerta "<48h" para admins dispara até 51h — correção: coluna gerada `ALTER TABLE public.bookings ADD COLUMN starts_at timestamptz GENERATED ALWAYS AS ((scheduled_date + start_time) AT TIME ZONE 'America/Sao_Paulo') STORED; CREATE INDEX idx_bookings_starts_at ON public.bookings(starts_at);` e usar `starts_at` em todas as funções.
- [SEVERIDADE: médio] `20260317183035_97bdda91-1d51-4f80-a842-a2cedba9d66e.sql:174` — `bookings.created_by REFERENCES auth.users(id)` sem `ON DELETE` — impacto: excluir um admin/mentor (`admin-delete-user`) falha com violação de FK se ele criou bookings — correção: `ALTER TABLE public.bookings DROP CONSTRAINT bookings_created_by_fkey, ADD CONSTRAINT bookings_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;`
- [SEVERIDADE: médio] `20260317183035_...sql:159-161` — `bookings.liberty_id` / `mentor_id` FK profiles sem `ON DELETE` (NO ACTION) — impacto: `DELETE FROM profiles` falha; a migration 20260713135801 precisou apagar bookings manualmente; `admin-delete-user`/`admin-merge-profiles` dependem disso — correção: decisão explícita — `ON DELETE RESTRICT` (documentado) + fluxo de merge, ou `ON DELETE SET NULL` para `liberty_id` (já nullable): `ALTER TABLE public.bookings DROP CONSTRAINT bookings_liberty_id_fkey, ADD CONSTRAINT bookings_liberty_id_fkey FOREIGN KEY (liberty_id) REFERENCES public.profiles(id) ON DELETE SET NULL;`
- [SEVERIDADE: médio] `20260526193217_a659c9c0-b06b-49ab-9f69-e7a62c3679d1.sql:4,9` — `notifications.user_id` e `related_booking_id` sem FK — impacto: notificações órfãs após exclusão de usuário/booking; links quebrados — correção: `ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE, ADD CONSTRAINT notifications_related_booking_id_fkey FOREIGN KEY (related_booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;` (limpar órfãs antes).
- [SEVERIDADE: médio] `20260720181011_...sql:5,8-10,26,62` + `20260720223558_17eb64b9-3b83-40a5-81e6-d6a7613c9fd8.sql:9-18` — `member_points.member_id`, `member_testimonials.member_id`, `featured_case_of_day.member_id` sem FK; a recriação com FK em 20260720223558 foi no-op (`IF NOT EXISTS`) — impacto: pontos/depoimentos/destaques órfãos; `admin-merge-profiles` precisa mover manualmente — correção: `ALTER TABLE public.member_points ADD CONSTRAINT member_points_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.profiles(id) ON DELETE CASCADE; ALTER TABLE public.member_testimonials ADD CONSTRAINT member_testimonials_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.profiles(id) ON DELETE CASCADE; ALTER TABLE public.featured_case_of_day ADD CONSTRAINT featured_case_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.profiles(id) ON DELETE CASCADE;`
- [SEVERIDADE: médio] `20260317183035_...sql:81` + `20260722162452_6ea62334-8e18-41b0-8626-bbd05d790100.sql:3-4` — `sessions."order"` sem unique e `is_kickoff` sem unique parcial — impacto: dois kickoffs ou ordens repetidas quebram a regra do limite e a UI de jornada — correção: `CREATE UNIQUE INDEX sessions_one_kickoff ON public.sessions (is_kickoff) WHERE is_kickoff; CREATE UNIQUE INDEX sessions_order_active_unique ON public.sessions (tier, "order") WHERE is_active AND "order" > 0;`
- [SEVERIDADE: médio] `20260605141119_b6e6d775-03dd-4fba-a91c-9b6f23cb13cc.sql:1` — remoção de `bookings_unique_liberty_session_active` — impacto: membro pode ter vários bookings ativos para a mesma sessão (contam múltiplas vezes no limite 13) — correção: recriar permitindo remarcação: `CREATE UNIQUE INDEX bookings_unique_liberty_session_active ON public.bookings (liberty_id, session_id) WHERE liberty_id IS NOT NULL AND status IN ('scheduled','pending_approval','rescheduled');`
- [SEVERIDADE: médio] `20260806153346_c1e7699f-bc5c-4cb2-9ac1-f126fa863672.sql:4-6` — índice único do slot só cobre `start_time` idêntico — impacto: kickoff de 180 min às 10:00 e sessão às 11:00 no mesmo mentor coexistem — correção: `CREATE EXTENSION IF NOT EXISTS btree_gist; ALTER TABLE public.bookings ADD CONSTRAINT bookings_no_overlap EXCLUDE USING gist (mentor_id WITH =, tsrange(scheduled_date + start_time, scheduled_date + end_time) WITH &&) WHERE (status IN ('scheduled','pending_approval','rescheduled'));`
- [SEVERIDADE: médio] `20260720173456_...sql:31-42` — `enforce_cancellation_policy` decrementa cortesia do membro em qualquer cancelamento 24–48h, mesmo iniciado por mentor/admin; `courtesy_reschedules_left` nunca é reposto — impacto: penalização indevida — correção: só penalizar quando `auth.uid()` for o próprio membro: `IF v_liberty_user = auth.uid() AND v_hours >= 24 AND v_hours < 48 THEN ...`; adicionar reset por ciclo (`program_start_date`).
- [SEVERIDADE: médio] `20260720173456_...sql:69` — `dispatch_availability_nudges` definida mas nunca agendada em `cron.schedule` — impacto: mentores nunca recebem aviso de agenda curta — correção: `SELECT cron.schedule('availability-nudges', '0 13 * * 1', $$SELECT public.dispatch_availability_nudges();$$);`
- [SEVERIDADE: médio] `20260830142524_...sql:77` — `sync_availability_booked` (AFTER) faz `UPDATE bookings SET availability_id ...` na própria linha — impacto: re-dispara `trg_notify_booking_changes`, `update_updated_at`, `trg_clear_pending_notifications`, realtime e o próprio trigger; `updated_at` alterado sem ação do usuário — correção: converter para `BEFORE INSERT OR UPDATE` e atribuir `NEW.availability_id := v_avail` em vez de UPDATE.
- [SEVERIDADE: médio] `20260710195646_cab3c5f4-cf83-4778-aac2-8ddedb83b6bf.sql:67-83` — três triggers `FOR EACH STATEMENT` fazem `DELETE` + `INSERT` total em `nps_mentor_options` a cada update de `full_name/is_active/user_id` em profiles, roles ou lookup — impacto: custo O(n) em cada edição de perfil; bloat — correção: substituir por view: `CREATE OR REPLACE VIEW public.nps_mentor_options WITH (security_invoker=false) AS SELECT p.id AS profile_id, ... ;` ou refresh incremental por linha.
- [SEVERIDADE: baixo] `20260326124243_...sql:13`, `20260317183035_...sql:208`, `20260630145750_b4ef8d26-aa2e-4a86-9d0e-990531ebe598.sql:6` — `session_tasks`, `system_config`, `user_oauth_tokens` têm `updated_at` sem trigger — correção: `CREATE TRIGGER update_session_tasks_updated_at BEFORE UPDATE ON public.session_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();` (idem para as outras).
- [SEVERIDADE: baixo] `20260827213401_...sql:66`, `20260526193217_...sql:5`, `20260317191226_0afd1918-751b-429d-b3ea-e69253ec1508.sql:13`, `20260720181011_...sql:7` — `event_attendance.status`, `notifications.type`, `contents.content_type`, `member_points.reason`, `booking_reports.pdf_delivery_method` como text sem CHECK/enum — correção: `ALTER TABLE public.event_attendance ADD CONSTRAINT event_attendance_status_check CHECK (status IN ('going','maybe','declined'));` e equivalentes.
- [SEVERIDADE: baixo] `20260630152859_2ba100a6-9668-4ea3-9f0f-00384b0dee68.sql:42-45` + `20260701124517_...sql:97-100` — dois triggers idênticos (`sync_profile_user_lookup_on_profiles` e `trg_sync_profile_user_lookup`) — correção: `DROP TRIGGER sync_profile_user_lookup_on_profiles ON public.profiles;`
- [SEVERIDADE: baixo] `20260317183035_...sql:93-96` + `20260701124650_2a276d44-3e73-4f87-bde1-be272b44b7a7.sql:167-173` — `DROP POLICY IF EXISTS "Admins can manage all sessions"` errou o nome; ficaram duas policies admin em `sessions` (uma com `public.has_role`, sem WITH CHECK) — correção: `DROP POLICY "Admins can manage sessions" ON public.sessions;`
- [SEVERIDADE: baixo] `20260727155724_b0ada3d6-3a1f-4a60-bb83-9cfe0c5a0b6c.sql:1-5` — `Super admins can manage all profiles` redundante (`has_role(...,'admin')` já cobre super_admin) — correção: `DROP POLICY "Super admins can manage all profiles" ON public.profiles;`
- [SEVERIDADE: baixo] `20260830144233_...sql:20-23` — `report_required` não é recalculado quando `sessions.is_kickoff` muda — correção: trigger em `sessions`: `AFTER UPDATE OF is_kickoff ... UPDATE public.bookings SET report_required = NOT (NEW.is_kickoff OR is_retroactive) WHERE session_id = NEW.id;`
- [SEVERIDADE: baixo] `20260827213401_...sql:26-30` — o trigger dispara em `UPDATE OF session_id`, mas a função não reavalia o limite quando `session_id` passa de sessão `order=0` para sessão de jornada — correção: incluir `OR OLD.session_id IS DISTINCT FROM NEW.session_id` na condição.
- [SEVERIDADE: baixo] `20260526193217_...sql:14-17` — falta índice em `notifications.related_booking_id` (usado em `dispatch_report_nudges`, `clear_pending_notifications`, `notify_nps_request_on_report`) — correção: `CREATE INDEX idx_notifications_related_booking ON public.notifications(related_booking_id) WHERE related_booking_id IS NOT NULL;`
- [SEVERIDADE: baixo] `20260701211407_73b10e43-ec9a-4c9d-8529-4147fb53bbb3.sql:2-22` — `nps_responses` sem índices em `liberty_id`, `mentor_id`, `booking_id` — correção: `CREATE INDEX idx_nps_liberty ON public.nps_responses(liberty_id); CREATE INDEX idx_nps_mentor ON public.nps_responses(mentor_id); CREATE INDEX idx_nps_booking ON public.nps_responses(booking_id);`
- [SEVERIDADE: baixo] `20260714173548_...sql:34-35` — `EXCEPTION WHEN OTHERS THEN RETURN NEW` engole todo erro do push sem log — correção: `RAISE WARNING 'push failed: %', SQLERRM;` antes do `RETURN NEW`.
- [SEVERIDADE: baixo] `20260406134838_...sql:7`, `20260820210127_...sql:6-10`, `20260713135801_...sql`, `20260806153346_...sql:2`, `20260908132854_...sql`, `20260326183106_...sql` — DML com UUIDs hardcoded e `UPDATE auth.users` em migrations — impacto: migrations não reproduzíveis em outro ambiente — correção: mover ajustes de dados para scripts/seed fora do histórico de schema.
- [SEVERIDADE: baixo] `20260528191610_1f6486b5-44fc-4bd7-be84-6e5094a33cd1.sql`, `20260820210127_f2699aa9-79a2-4384-a2c7-386503206acf.sql` — migrations de redefinição de senha redigidas; `git log -S "gen_salt"` só encontra as versões redigidas (histórico aparentemente limpo) — correção: garantir que a senha em questão foi rotacionada.
- [SEVERIDADE: baixo] `20260505144630_e170a95d-4785-4b7a-af10-cc4f0b405397.sql:49-62` — `public_member_profiles` com `security_invoker=true` herda RLS de `profiles`: membro só vê a própria linha; a finalidade "member-to-member discovery" não funciona — correção: se desejado, `SECURITY DEFINER` function retornando só colunas públicas, ou policy SELECT em `profiles` limitada por coluna via view `security_invoker=false` com `REVOKE` na tabela.
- [SEVERIDADE: baixo] `20260526193217_...sql:19`, `20260625194840_...sql:18`, `20260727151530_...sql:27` — GRANTs explícitos parciais (`SELECT, UPDATE` em notifications, `INSERT, UPDATE, DELETE` em tool_templates) são redundantes/enganosos: os default privileges do Supabase já concedem ALL a `anon`/`authenticated`; segurança real é só RLS — correção: documentar ou `REVOKE ALL ON public.<t> FROM anon;` de forma consistente (anon não tem policies, então já é negado).

---

## 3. Segurança RLS

**Isolamento membro ↔ membro (OK)**
- Bookings: só via `profile_user_lookup` (própria linha) — não lê de outros membros. Profiles: só a própria (`Users can view own profile`). Reports/tasks/tools/NPS/points/attendance: só próprios. `public_member_profiles` também só a própria. `get_ranking_board()` expõe nome/avatar/empresa/tier de todos os ativos (intencional para ranking).
- Membro **não tem UPDATE em bookings** → cancelamento só via edge function/mentor (confirmar no app).

**Mentor lê tudo (por design, mas amplo)**
- [SEVERIDADE: médio] `20260701124650_2a276d44-3e73-4f87-bde1-be272b44b7a7.sql:53-57,118-125`, `20260701214259_513274f2-838a-48ac-8d7f-33cd1ae4d1d3.sql:3-7`, `20260701211005_0216e174-80bc-4f0e-9637-8dabf991f9d1.sql:4-7`, `20260625194840_94c8eef5-0ab9-407a-82a6-10958197f865.sql:32-64`, `20260727151530_0e3c6f0a-648f-4da6-a671-beb26f8c7c14.sql:53-64` — mentor vê **todos** os bookings, **todos** os perfis de membros (incl. `monthly_revenue`, `profit_margin`, `marital_status`, `personal_story`, `phone`, `birth_date`), todos os relatórios, e tem ALL em `session_tasks`, `student_tools`, `tool_applications` de qualquer aluno — impacto: PII financeira/pessoal de toda a base acessível a qualquer mentor; mentor pode editar/apagar tarefas e ferramentas de alunos de outros mentores — correção: voltar ao modelo de 20260716205707 (mentor só vê membros com quem tem booking) para colunas sensíveis via view/RPC, e restringir ALL em `session_tasks` a bookings próprios: `USING (booking_id IN (SELECT id FROM public.bookings WHERE mentor_id IN (SELECT profile_id FROM public.profile_user_lookup WHERE user_id = auth.uid())))`.
- [SEVERIDADE: médio] `20260701211005_...sql:10-16` — `Staff can create notifications` permite a qualquer mentor inserir notificação (e push via `fire_push_on_notification`) para **qualquer** `user_id`, inclusive admins, com `link` arbitrário — impacto: vetor de phishing/spam interno — correção: `WITH CHECK (app_private.has_role(auth.uid(),'admin') OR (app_private.has_role(auth.uid(),'mentor') AND user_id IN (SELECT p.user_id FROM public.bookings b JOIN public.profiles p ON p.id=b.liberty_id WHERE b.mentor_id IN (SELECT profile_id FROM public.profile_user_lookup WHERE user_id=auth.uid()))))`.
- [SEVERIDADE: baixo] `20260716210038_2d07b3f7-6420-4cea-a161-ca69dae7e963.sql:5-12` — `Mentors can view all members` exige `member_tier IN (begin, liberty)`; membros com `member_tier NULL` (ex.: importados ou perfis de staff) ficam invisíveis ao mentor; em contrapartida, um mentor sem role `mentor` (só admin) depende da policy admin — correção: `member_tier IS NOT NULL` explícito na importação ou default.
- [SEVERIDADE: baixo] `20260729201447_b28bc84d-c351-4069-8513-85b3879faafc.sql:6-10` — `Mentors and admins can manage availability` não verifica role `mentor`: qualquer membro insere `mentor_availability` para o próprio profile — impacto: lixo na agenda; membro aparece como "mentor disponível" se a UI listar por availability — correção: adicionar `app_private.has_role(auth.uid(),'mentor') AND` à cláusula `mentor_id IN (...)`.

**Admin / super_admin**
- `app_private.has_role(x,'admin')` retorna true para `super_admin`; policies com `ur.role IN ('admin','super_admin')` também. **Não encontrei policy onde super_admin fique descoberto.** Observação: admin não tem write em `nps_responses` nem em `member_points` (só service_role) — provavelmente intencional, mas impede correção manual via app.
- [SEVERIDADE: baixo] `20260716211552_dad96457-5f63-4061-9193-72ea1f80e2b3.sql:23` — `GRANT EXECUTE ON app_private.profile_has_role TO anon` desnecessário — correção: `REVOKE EXECUTE ON FUNCTION app_private.profile_has_role(uuid, public.app_role) FROM anon;`
- [SEVERIDADE: baixo] `20260701124650_...sql:2` + `20260916231353_dfc1251d-164a-4857-9893-5d31a2fbd24e.sql:44-46` — `app_private` tem USAGE para `authenticated` e as `*_internal` (SECURITY DEFINER) têm EXECUTE para `authenticated`; PostgREST não expõe o schema, mas a barreira é só configuração — correção: manter `app_private` fora de `pgrst.db_schemas` (já está) e revogar USAGE de `authenticated` se os wrappers públicos forem `SECURITY DEFINER`.
- [SEVERIDADE: baixo] `20260710195646_...sql:15-19` — `nps_mentor_options` SELECT `true` expõe lista de nomes de mentores/admins a todos os membros — impacto: baixo (nomes já aparecem na agenda).

**anon**: nenhuma policy `TO anon` nem sem `TO` que passe (`push_subscriptions` usa `auth.uid()`); `user_oauth_tokens` com REVOKE explícito. OK.

**Storage**
- [SEVERIDADE: médio] `20260505135914_a3f683d7-390b-46c8-8606-dcfabeb369e4.sql:2-4`, `20260531152112_e056022f-6580-4109-8844-3f50dd3369fa.sql:1-3` — buckets `avatars` e `session-covers` são `public = true`; a remoção das policies de SELECT (20260630145750:77-78) só bloqueia listagem, **qualquer URL de objeto continua acessível sem auth** — impacto: avatars de membros públicos na internet (URL previsível: `<user_id>/…`) — correção: se avatars devem ser privados: `UPDATE storage.buckets SET public=false WHERE id='avatars';` + policy SELECT `TO authenticated USING (bucket_id='avatars')` e uso de signed URLs no app. Session covers públicos são aceitáveis.
- Upload: `avatars` — usuário só na pasta `auth.uid()` (INSERT/UPDATE/DELETE) e admins ALL ✓; `session-covers` só admin ✓; `student-tools` — upload/delete só mentor/admin, leitura aluno na pasta `<liberty_id>` ✓. Falta policy UPDATE em `student-tools` (upsert falha) — baixo.
- [SEVERIDADE: médio] `20260625194840_...sql:75-88` — bucket `student-tools` (privado) **não é criado em nenhuma migration**; existe só no painel — impacto: ambiente novo (`supabase db reset`/staging) fica sem bucket e as policies apontam para nada — correção: `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('student-tools','student-tools', false, 20971520, ARRAY['image/png','image/jpeg','application/pdf']) ON CONFLICT (id) DO NOTHING;`

**config.toml**
- [SEVERIDADE: médio] `supabase/config.toml:3-49` — todas as 16 edge functions com `verify_jwt = false`, incluindo `admin-*`, `bulk-*`, `seed-*`, `reset-and-invite` — impacto: a autorização depende 100% do código de cada function (todas referenciam `Authorization`, mas não auditei a lógica); `seed-demo-members`/`seed-mentors` em produção com JWT desligado é risco — correção: `verify_jwt = true` em todas exceto `google-oauth-callback` (callback externo) e `send-push` (chamado por pg_net); remover seeds do deploy de produção.
- [SEVERIDADE: médio] `supabase/config.toml:1` (`roddclbsxqrlgmxvjsqr`) vs `20260625203937_4b478423-b6f3-4d77-8775-a62e8cfc3c0a.sql:2-14` e `20260723134256_9b2e138a-8f91-4359-a0e2-19e5540e5952.sql:2-8` — `sessions.cover_image_url` hardcoded para `wyoidjjalbycimqpqzao.supabase.co`, projeto diferente do `project_id` configurado — impacto: capas quebram se o projeto antigo for pausado; indica que o repositório aponta para outro projeto do que o que gerou os dados — correção: `UPDATE public.sessions SET cover_image_url = replace(cover_image_url, 'wyoidjjalbycimqpqzao', 'roddclbsxqrlgmxvjsqr') WHERE cover_image_url LIKE '%wyoidjjalbycimqpqzao%';` e armazenar só o path relativo no bucket.

---

## 4. Divergências `types.ts` vs migrations

Comparei coluna a coluna todas as 25 tabelas, a view, os 3 enums e a lista de functions. **Resultado: sem divergência de colunas/nullabilidade/enums** — `types.ts` reflete exatamente o schema final das migrations (incl. `member_tier` nullable, `google_refresh_token` ausente, `report_required`, `is_retroactive`, `rsvp_*`, `event_attendance`, `profile_merge_log`). Isso indica que o `types.ts` foi regenerado após a última migration e que não há colunas criadas só no painel.

Divergências de metadados/estado que o `types.ts` confirma ou não cobre:

- [SEVERIDADE: médio] `src/integrations/supabase/types.ts:405` (`featured_case_of_day.Relationships: []`) — confirma que a FK `member_id → profiles` pretendida em `20260720223558_...sql:12` **nunca foi aplicada** (CREATE IF NOT EXISTS no-op) — correção: ver §2 (ADD CONSTRAINT).
- [SEVERIDADE: médio] `types.ts` não cobre `storage.buckets` — o bucket `student-tools` existe em produção sem migration (ver §3).
- [SEVERIDADE: baixo] `src/integrations/supabase/types.ts:1472-1512` — `Functions` lista `_notif_user_id`, `dispatch_*`, `refresh_nps_mentor_options`, que têm EXECUTE revogado de `authenticated`; o gerador expõe o que existe no schema, não o que é chamável — impacto: chamadas RPC no front compilam mas falham em runtime — correção: mover funções internas para `app_private` (fora do schema exposto), como já foi feito com `*_internal`.
- [SEVERIDADE: baixo] `types.ts` não inclui `app_private` — esperado (schema não exposto); qualquer chamada a `*_internal` no front seria não tipada.
- [SEVERIDADE: baixo] `src/integrations/supabase/types.ts:1418-1434` — `user_roles.Relationships: []` e `push_subscriptions.Relationships: []` porque as FKs apontam para `auth.users` (fora de `public`) — normal, mas o front não consegue fazer embed `profiles(...)` a partir de `user_roles`; o padrão do projeto contorna via `profile_user_lookup`.
- [SEVERIDADE: baixo] `types.ts:13` — `PostgrestVersion: "14.5"`; sem impacto.

---

## 5. SQL de diagnóstico (comentado — NÃO executar automaticamente; rodar no SQL Editor com role postgres)

```sql
-- =====================================================================
-- (a) PERFIS DUPLICADOS POR E-MAIL (normalizado) E PERFIS SEM user_id
-- =====================================================================

-- (a1) duplicados por lower(trim(email))
SELECT lower(trim(email))                          AS email_norm,
       count(*)                                    AS n,
       array_agg(id        ORDER BY created_at)    AS profile_ids,
       array_agg(user_id   ORDER BY created_at)    AS user_ids,
       array_agg(full_name ORDER BY created_at)    AS names,
       array_agg(member_tier::text ORDER BY created_at) AS tiers
FROM public.profiles
WHERE email IS NOT NULL
GROUP BY 1
HAVING count(*) > 1
ORDER BY n DESC;

-- (a2) perfis órfãos (user_id NULL) — não conseguem logar; candidatos a vínculo via handle_new_user
SELECT id, full_name, email, member_tier, is_active, onboarding_completed, created_at,
       (SELECT count(*) FROM public.bookings b WHERE b.liberty_id = p.id) AS bookings
FROM public.profiles p
WHERE user_id IS NULL
ORDER BY created_at;

-- (a3) e-mails não normalizados (espaços / maiúsculas) — quebram o match do handle_new_user
SELECT id, full_name, email
FROM public.profiles
WHERE email IS NOT NULL AND email <> lower(trim(email));

-- (a4) e-mail do profile diverge do e-mail em auth.users
SELECT p.id, p.full_name, p.email AS profile_email, u.email AS auth_email
FROM public.profiles p
JOIN auth.users u ON u.id = p.user_id
WHERE lower(trim(p.email)) IS DISTINCT FROM lower(trim(u.email));

-- =====================================================================
-- (b) auth.users SEM profile OU SEM user_roles; lookup inconsistente
-- =====================================================================

-- (b1) auth.users sem profile (signup antes do trigger? trigger falhou?)
SELECT u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at,
       u.raw_user_meta_data->>'full_name' AS meta_name
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.id IS NULL
ORDER BY u.created_at DESC;

-- (b2) auth.users sem nenhuma role (tratados implicitamente como membro)
SELECT u.id, u.email, p.full_name, p.member_tier, p.is_active, u.last_sign_in_at
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id
LEFT JOIN public.profiles  p ON p.user_id = u.id
WHERE r.id IS NULL
ORDER BY u.created_at DESC;

-- (b3) profiles com user_id mas sem linha em profile_user_lookup (quebra RLS de bookings)
SELECT p.id, p.user_id, p.full_name
FROM public.profiles p
LEFT JOIN public.profile_user_lookup l ON l.profile_id = p.id
WHERE p.user_id IS NOT NULL AND l.profile_id IS NULL;

-- (b4) lookup órfão ou divergente
SELECT l.*
FROM public.profile_user_lookup l
LEFT JOIN public.profiles p ON p.id = l.profile_id
WHERE p.id IS NULL OR p.user_id IS DISTINCT FROM l.user_id;

-- (b5) staff (mentor/admin) ainda com member_tier preenchido (aparece como membro no ranking/mentor view)
SELECT p.id, p.full_name, p.member_tier, string_agg(ur.role::text, ',') AS roles
FROM public.profiles p
JOIN public.user_roles ur ON ur.user_id = p.user_id
WHERE ur.role IN ('mentor','admin','super_admin') AND p.member_tier IS NOT NULL
GROUP BY 1,2,3;

-- =====================================================================
-- (c) BOOKINGS COM SESSÃO INATIVA / order 0 / SEM SESSÃO; contagem de jornada
-- =====================================================================

-- (c1) bookings problemáticos
SELECT b.id, b.status, b.scheduled_date, b.start_time,
       l.full_name AS member, m.full_name AS mentor,
       s.name AS session, s."order", s.is_active, s.is_kickoff, s.tier,
       CASE WHEN s.id IS NULL THEN 'sem sessao'
            WHEN s.is_active = false THEN 'sessao inativa'
            WHEN COALESCE(s."order",0) = 0 THEN 'order 0 (fora da regra de limite)' END AS problema
FROM public.bookings b
LEFT JOIN public.sessions s ON s.id = b.session_id
LEFT JOIN public.profiles l ON l.id = b.liberty_id
LEFT JOIN public.profiles m ON m.id = b.mentor_id
WHERE s.id IS NULL OR s.is_active = false OR COALESCE(s."order",0) = 0
ORDER BY b.scheduled_date DESC;

-- (c2) contagem de jornada por membro — mesma regra do trigger (>= 13 bloqueia)
SELECT b.liberty_id, p.full_name, p.member_tier,
       count(*)                                        AS journey_count,
       count(*) FILTER (WHERE s.tier = 'liberty')      AS liberty_tier_count,
       count(*) FILTER (WHERE s.is_active = false)     AS inactive_session_count,
       count(*) FILTER (WHERE s.is_kickoff)            AS kickoff_count,
       count(*) FILTER (WHERE b.status = 'completed')  AS completed_count
FROM public.bookings b
JOIN public.sessions s ON s.id = b.session_id
JOIN public.profiles p ON p.id = b.liberty_id
WHERE b.status::text NOT IN ('cancelled','not_realized')
  AND COALESCE(s."order",1) > 0
GROUP BY 1,2,3
HAVING count(*) >= 11
ORDER BY journey_count DESC;

-- (c3) membro com mais de um booking ativo para a mesma sessão (índice removido em 20260605)
SELECT b.liberty_id, p.full_name, b.session_id, s.name, count(*) AS n,
       array_agg(b.id ORDER BY b.scheduled_date) AS booking_ids,
       array_agg(b.status::text ORDER BY b.scheduled_date) AS statuses
FROM public.bookings b
JOIN public.profiles p ON p.id = b.liberty_id
JOIN public.sessions s ON s.id = b.session_id
WHERE b.liberty_id IS NOT NULL AND b.status::text NOT IN ('cancelled','not_realized')
GROUP BY 1,2,3,4
HAVING count(*) > 1;

-- (c4) sessões com mentor sobrepostas (mesmo mentor, mesma data, intervalos que se cruzam)
SELECT a.id, b.id, a.mentor_id, a.scheduled_date, a.start_time, a.end_time, b.start_time, b.end_time
FROM public.bookings a
JOIN public.bookings b ON b.mentor_id = a.mentor_id AND b.scheduled_date = a.scheduled_date AND b.id > a.id
WHERE a.status IN ('scheduled','pending_approval','rescheduled')
  AND b.status IN ('scheduled','pending_approval','rescheduled')
  AND a.start_time < b.end_time AND b.start_time < a.end_time;

-- =====================================================================
-- (d) SESSÕES: order duplicado, kickoff com order != 1, mais de um kickoff
-- =====================================================================

-- (d1) inventário
SELECT id, name, tier, "order", is_active, is_kickoff, duration_minutes, pillar
FROM public.sessions
ORDER BY tier, "order", name;

-- (d2) order duplicado entre sessões ativas do mesmo tier
SELECT tier, "order", count(*), array_agg(name)
FROM public.sessions
WHERE is_active
GROUP BY tier, "order"
HAVING count(*) > 1;

-- (d3) kickoff inconsistente
SELECT id, name, "order", is_active, tier
FROM public.sessions
WHERE is_kickoff = true AND ("order" <> 1 OR is_active = false OR tier <> 'begin');

-- (d4) quantidade de kickoffs (esperado: 1)
SELECT count(*) AS kickoffs FROM public.sessions WHERE is_kickoff;

-- =====================================================================
-- (e) BOOKINGS PASSADOS COM STATUS scheduled/rescheduled E SEM booking_reports, POR MENTOR
--     (usa TZ America/Sao_Paulo explicitamente — as funções do banco não usam)
-- =====================================================================

-- (e1) detalhe
SELECT m.full_name AS mentor, b.id AS booking_id, b.scheduled_date, b.start_time, b.status,
       s.name AS session, l.full_name AS member,
       b.report_required, b.is_retroactive,
       now() - ((b.scheduled_date + b.start_time) AT TIME ZONE 'America/Sao_Paulo') AS atraso
FROM public.bookings b
JOIN public.profiles m ON m.id = b.mentor_id
LEFT JOIN public.profiles l ON l.id = b.liberty_id
LEFT JOIN public.sessions s ON s.id = b.session_id
LEFT JOIN public.booking_reports br ON br.booking_id = b.id
WHERE b.status::text IN ('scheduled','rescheduled')
  AND (b.scheduled_date + b.start_time) AT TIME ZONE 'America/Sao_Paulo' < now()
  AND br.id IS NULL
  AND COALESCE(b.report_required, true) = true
  AND COALESCE(b.is_retroactive, false) = false
ORDER BY m.full_name, b.scheduled_date;

-- (e2) resumo por mentor (inclui também 'completed' sem relatório)
SELECT m.full_name AS mentor,
       count(*) FILTER (WHERE b.status::text IN ('scheduled','rescheduled')) AS scheduled_sem_relatorio,
       count(*) FILTER (WHERE b.status::text = 'completed')                  AS completed_sem_relatorio,
       min(b.scheduled_date) AS mais_antigo
FROM public.bookings b
JOIN public.profiles m ON m.id = b.mentor_id
LEFT JOIN public.booking_reports br ON br.booking_id = b.id
WHERE b.status::text IN ('scheduled','rescheduled','completed')
  AND (b.scheduled_date + b.start_time) AT TIME ZONE 'America/Sao_Paulo' < now()
  AND br.id IS NULL
  AND COALESCE(b.report_required, true) = true
  AND COALESCE(b.is_retroactive, false) = false
GROUP BY 1
ORDER BY 2 DESC, 3 DESC;

-- =====================================================================
-- (f) BUSCA POR NOME/E-MAIL: Emerson, Rogerio/Rogério, Kaoru, Alexandre Ribeiro, Esequiel
-- =====================================================================

-- (f1) profiles (+ roles, lookup, contagens)
SELECT p.id, p.user_id, p.full_name, p.email, p.member_tier, p.is_active, p.onboarding_completed, p.created_at,
       (SELECT string_agg(ur.role::text, ',') FROM public.user_roles ur WHERE ur.user_id = p.user_id) AS roles,
       EXISTS (SELECT 1 FROM public.profile_user_lookup l WHERE l.profile_id = p.id)                AS in_lookup,
       (SELECT count(*) FROM public.bookings b WHERE b.liberty_id = p.id)                           AS bookings_as_member,
       (SELECT count(*) FROM public.bookings b WHERE b.mentor_id  = p.id)                           AS bookings_as_mentor
FROM public.profiles p
WHERE p.full_name ~* '(emerson|rog[eé]rio|kaoru|alexandre\s+ribeiro|e[sz]equiel)'
   OR p.email     ~* '(emerson|rogerio|kaoru|alexandre|e[sz]equiel)'
ORDER BY p.full_name, p.created_at;

-- (f2) auth.users
SELECT u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at, u.banned_until,
       u.raw_user_meta_data->>'full_name' AS meta_name,
       (SELECT count(*) FROM public.profiles p WHERE p.user_id = u.id)          AS profiles_linked,
       (SELECT string_agg(r.role::text, ',') FROM public.user_roles r WHERE r.user_id = u.id) AS roles
FROM auth.users u
WHERE u.email ~* '(emerson|rogerio|kaoru|alexandre|e[sz]equiel)'
   OR (u.raw_user_meta_data->>'full_name') ~* '(emerson|rog[eé]rio|kaoru|alexandre\s+ribeiro|e[sz]equiel)'
ORDER BY u.created_at;

-- (f3) user_roles cujo user não tem profile com esses nomes mas o e-mail bate (roles órfãs)
SELECT r.*, u.email
FROM public.user_roles r
JOIN auth.users u ON u.id = r.user_id
WHERE u.email ~* '(emerson|rogerio|kaoru|alexandre|e[sz]equiel)';

-- (f4) bookings onde aparecem como membro, mentor ou convidado
SELECT b.id, b.scheduled_date, b.start_time, b.status, s.name AS session,
       l.full_name AS member, m.full_name AS mentor, b.guest_name,
       (br.id IS NOT NULL) AS has_report, b.report_required, b.is_retroactive
FROM public.bookings b
LEFT JOIN public.profiles l ON l.id = b.liberty_id
JOIN public.profiles m ON m.id = b.mentor_id
LEFT JOIN public.sessions s ON s.id = b.session_id
LEFT JOIN public.booking_reports br ON br.booking_id = b.id
WHERE l.full_name   ~* '(emerson|rog[eé]rio|kaoru|alexandre\s+ribeiro|e[sz]equiel)'
   OR m.full_name   ~* '(emerson|rog[eé]rio|kaoru|alexandre\s+ribeiro|e[sz]equiel)'
   OR b.guest_name  ~* '(emerson|rog[eé]rio|kaoru|alexandre\s+ribeiro|e[sz]equiel)'
ORDER BY b.scheduled_date DESC, b.start_time DESC;
```

---

**Resumo executivo**: o schema tem RLS em 100% das tabelas, todas as `SECURITY DEFINER` com `search_path` fixo e o `types.ts` está em sincronia. Os pontos que exigem ação imediata são: (1) policy de INSERT de bookings sem restrição de `status`/campos; (2) `handle_new_user` × índice único de e-mail derrubando signups; (3) membro editando colunas administrativas e lendo `admin_note` no próprio perfil; (4) service_role key em `system_config`; (5) limite de jornada contando sessões `liberty`/inativas; (6) três funções com timezone errado (nudges de relatório disparando antes da sessão). Itens de infra não versionados: bucket `student-tools`, project ref das capas, e `dispatch_availability_nudges` sem cron.