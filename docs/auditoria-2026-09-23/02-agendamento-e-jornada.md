# Auditoria — agendamento e jornada (Liberty Begin)

Nenhum arquivo foi editado. Todas as linhas citadas são reais.

---

## Estado vigente do banco (funções/triggers)

### `enforce_member_booking_rules` — versão vigente: `supabase/migrations/20260827213401_82f1ed6a-....sql:2-50`

Histórico (ordem cronológica):
- `20260813211436:1-73` — cria a função com **limite mensal (2)** + **KICKOFF_REQUIRED** (bloqueia sessão não-kickoff se `completed <= 3` e não há kickoff `completed`). Cria o trigger (`:77-82`): `BEFORE INSERT OR UPDATE OF status, scheduled_date, liberty_id, session_id`.
- `20260813211530`, `20260813211647` — refinam (kickoff só em INSERT; checagem mensal só quando muda algo relevante).
- `20260821162323:1-47` — **REESCREVE removendo o KICKOFF_REQUIRED**; mantém só o limite mensal.
- `20260827213401:2-50` — **REESCREVE de novo: remove o limite mensal**, e passa a aplicar apenas `JOURNEY_BOOKING_LIMIT_EXCEEDED` quando o membro já tem **≥13** bookings não-cancelados/não-`not_realized` em sessões com `order > 0` (`:33-45`). Sessões com `order <= 0` retornam sem checar (`:17-22`).

**Conclusão:** hoje o banco **não valida kickoff, não valida ordem, não valida limite mensal, não valida "até 3 realizadas"**. A única regra é o teto de 13. Os helpers `isKickoffRequiredError`/`isMonthlyBookingLimitError` em `src/lib/bookingRules.ts:5-12` e os `catch` em `AgendarSessao.tsx:395-398` são código morto.

### `set_booking_report_required` — versão vigente: `20260830144233:1-23`
`NEW.report_required := NOT (is_kickoff OR COALESCE(is_retroactive,false))`, trigger `trg_booking_report_required BEFORE INSERT OR UPDATE OF session_id, is_retroactive` (`:20-23`). Ou seja: trocar `session_id` de um booking para o Mapeamento zera `report_required` automaticamente; mudar só o `status` não recalcula.

### Triggers vigentes em `public.bookings`
| Trigger | Evento | Definição vigente |
|---|---|---|
| `update_bookings_updated_at` | BEFORE UPDATE | `20260317183035:238-240` |
| `trg_enforce_member_booking_rules` | BEFORE INSERT / UPDATE OF status, scheduled_date, liberty_id, session_id | trigger `20260813211436:77-82`; corpo `20260827213401` |
| `trg_booking_report_required` | BEFORE INSERT / UPDATE OF session_id, is_retroactive | `20260830144233:20-23` |
| `trg_notify_booking_changes` | AFTER INSERT OR UPDATE | trigger `20260701124517:102-106`; corpo `20260827213716` |
| `trg_notify_report_pending_ins/_upd` | AFTER INSERT / AFTER UPDATE OF status | trigger `20260719234454:110-118`; corpo `20260830144233:25-63` (ignora kickoff/retroativo) |
| `trg_enforce_cancellation_policy` | AFTER UPDATE OF status | `20260720173456:63-67` |
| `trg_award_points_session` | AFTER INSERT / UPDATE OF status | `20260720181011:98-101` (+10 pts ao virar `completed`) |
| `trg_sync_availability_booked` | AFTER INSERT / UPDATE OF status, scheduled_date, start_time, mentor_id, availability_id / DELETE | `20260830142524:89-92` |
| `trg_clear_pending_notifications` | AFTER UPDATE | `20260908132223:19-22` |

Índices únicos relevantes:
- `bookings_unique_liberty_session_active (liberty_id, session_id) WHERE status <> 'cancelled'` — `20260528195653:35-37`. **Inclui `completed` e `not_realized`** → um membro nunca consegue ter 2º booking da mesma sessão a menos que o anterior esteja `cancelled`.
- `bookings_unique_active_mentor_slot (mentor_id, scheduled_date, start_time) WHERE status IN ('scheduled','pending_approval','rescheduled')` — `20260806153346:4-6`. Só compara `start_time` igual; não detecta sobreposição parcial (ex.: kickoff 3h começando 1h antes de outra sessão).

### RLS vigente em `bookings` (última definição de cada policy)
- `Users can view relevant bookings` (SELECT) — `20260701124650:34-50`: liberty/mentor via `profile_user_lookup` ou admin.
- `Admins can manage all bookings` (ALL) — `20260701124650:26-31`.
- `Libertys can insert own bookings` (INSERT) — `20260701124517:48-58`: só checa `liberty_id` é o próprio; **não restringe `status`** (membro pode inserir `status='completed'` via API).
- `Mentors can view all bookings` (SELECT) — `20260701124650:53-57`: **todo mentor vê todos os bookings de todos os membros**.
- `Mentors can insert/update/delete own bookings` — `20260701124650:60-107`.
- **Não existe policy de UPDATE/DELETE para o membro** → o membro não consegue cancelar/remarcar o próprio booking pelo client (confirmado: nenhuma tela de membro faz `update` em bookings).

Catálogo de sessões: `20260722162452:7-22` desativa o antigo "Mapa do Negócio" (`order=999, is_active=false`) e insere "Mapeamento do Negócio" com **`order=1`, `duration_minutes=180`, `is_kickoff=true`**. `20260721143044:11-25` insere 7 sessões Liberty com `order` 101–107. `20260914224202:1` **renomeia "SWOT Inovações" → "Tecnologia"**. Nenhuma migration posterior altera o `order` do Mapeamento, e `AdminSessoes.tsx:62-71` não expõe `order` para edição.

---

## B1 Kaoru

**Como "Sessão N" é calculada — depende da tela:**

- `[SEVERIDADE: alto] src/components/MemberTimeline.tsx:63-70, 162-168` — o "Mapa das 12 sessões" (`:291`) ordena **os bookings por data/hora** (`chronological`) e numera pelo **índice do array** (`slots[i].index = i+1`). A estrela/label "Kickoff" é por índice (`:314 const isKickoff = s.index === 1`, `:346`, `:415 openBookingIndex === 1`), não por `sessions.is_kickoff`. — Impacto: para Kaoru, o booking de "Vendas" (data mais antiga) aparece como "Sessão 1 ★" e o Mapeamento como "Sessão 2". O título do modal `Sessão ${openBookingIndex} · nome` (`:401`) reforça a numeração errada. — Correção: numerar pelo `sessions.order` da sessão do booking (passar `sessionOrders` como prop) e usar `is_kickoff` para a estrela; ou, se a numeração cronológica for desejada, forçar o booking `is_kickoff` para o slot 1 e o restante cronológico.
- `[SEVERIDADE: médio] src/pages/Journey.tsx:183-196, 346` — bolinhas e lista usam `journeySessions` ordenadas por `order` (`sessionProgress.ts:28-30`). Não há número "Sessão N" visível; Mapeamento aparece primeiro (correto). **Inconsistente com o MemberTimeline embutido na mesma página** (`Journey.tsx:288-298`).
- `[SEVERIDADE: baixo] src/pages/Dashboard.tsx:160` — "Sessão {completedSessions + 1} de 12" é apenas contagem de realizadas + 1; não identifica sessão.
- `AgendarSessao.tsx` não numera; ordena cards por `order` (`:80-92`).
- Admin/mentor (`AdminMembroDetalhes.tsx:186-189`, `MentorAlunos.tsx`) reutilizam `MemberTimeline` → mesma numeração cronológica.

**Existe "reordenar/trocar sessão de um booking" no admin?**
- Sim, parcial: `src/components/MemberSessionEditor.tsx:98-124` (`handleSave`) permite trocar `session_id` (`:108`), mentor, data e status. Não existe "reordenar": como a timeline é cronológica, só mudando **data** ou **session_id** se altera a posição.
- `[SEVERIDADE: médio] MemberSessionEditor.tsx:111` — ao salvar com `status === "completed"` força `is_retroactive: true`, o que (via `set_booking_report_required`) zera `report_required` e remove a sessão dos lembretes de relatório. Editar qualquer sessão realizada legítima a converte em "histórico sem relatório". — Correção: só setar `is_retroactive` quando o booking já era retroativo ou quando o admin marca explicitamente.
- `[SEVERIDADE: médio] MemberSessionEditor.tsx:102-114` — a troca de `session_id` colide com `bookings_unique_liberty_session_active` se o membro já tem outro booking não-cancelado daquela sessão; o erro chega como "Erro ao salvar: duplicate key…" sem tratamento. — Correção: tratar `code === "23505"` com mensagem clara e/ou cancelar o outro booking antes.

**SQL (i) — listar bookings de um membro por nome**
```sql
-- Diagnóstico (somente leitura). Troque o nome.
SELECT b.id, p.id AS liberty_id, p.full_name, p.member_tier,
       s.name AS sessao, s."order", s.tier, s.is_active, s.is_kickoff,
       b.status, b.scheduled_date, b.start_time, b.end_time,
       b.is_retroactive, b.report_required, b.approval_required,
       m.full_name AS mentor, (br.id IS NOT NULL) AS tem_relatorio,
       b.availability_id, b.created_at
FROM public.bookings b
JOIN public.profiles p ON p.id = b.liberty_id
JOIN public.sessions s ON s.id = b.session_id
LEFT JOIN public.profiles m ON m.id = b.mentor_id
LEFT JOIN public.booking_reports br ON br.booking_id = b.id
WHERE p.full_name ILIKE '%Kaoru%'          -- ou '%Alexandre Ribeiro%', '%Esequiel%'
ORDER BY b.scheduled_date, b.start_time;

-- Perfis duplicados com o mesmo nome/e-mail (hipótese B3)
SELECT id, full_name, email, user_id, member_tier, is_active, created_at
FROM public.profiles WHERE full_name ILIKE '%Esequiel%' ORDER BY created_at;
```

**SQL (ii) — corrigir Kaoru**

Opção A (recomendada, mínima): manter o booking do Mapeamento como está e **cancelar** o booking de Vendas. A timeline é cronológica, então o Mapeamento passa a ser "Sessão 1" e Vendas volta a "Pendente/A agendar" em todas as telas.
```sql
-- NÃO EXECUTAR sem conferir ids com a query (i).
BEGIN;
UPDATE public.bookings
   SET status = 'cancelled',
       cancellation_reason = 'Ajuste administrativo: Mapeamento do Negócio passa a ser a sessão 01; Vendas volta a pendente'
 WHERE id = '<BOOKING_ID_VENDAS>';
-- (opcional) remover relatório/pontos ligados ao booking cancelado
-- DELETE FROM public.booking_reports WHERE booking_id = '<BOOKING_ID_VENDAS>';
-- DELETE FROM public.member_points WHERE related_booking_id = '<BOOKING_ID_VENDAS>' AND reason = 'session_completed';
COMMIT;
```
Riscos da Opção A: usar `cancelled` (e **não** `not_realized`) é obrigatório, porque o índice `bookings_unique_liberty_session_active` só ignora `cancelled` — com `not_realized` Kaoru nunca conseguiria reagendar Vendas. Efeitos colaterais dos triggers: `notify_booking_changes` (`20260827213716:117-129`) envia "Sessão cancelada" a mentor e membro; `enforce_cancellation_policy` (`20260720173456:44-57`) calcula `v_hours` negativo (booking no passado) e dispara alerta "Cancelamento em menos de 24h · revisão necessária" para todos os admins — limpar com `UPDATE notifications SET read_at = now() WHERE related_booking_id = '<BOOKING_ID_VENDAS>'`. Fee do mentor em `AdminFinanceiro` deixa de contar essa sessão. Evento do Google Calendar não é removido (edge function não é chamada).

Opção B (como o cliente pediu: trocar `session_id`): só faz sentido se o encontro registrado como "Vendas" foi, de fato, o mapeamento.
```sql
BEGIN;
-- 1) libera o índice único (liberty_id, session_id) cancelando o booking posterior do Mapeamento
UPDATE public.bookings SET status = 'cancelled',
       cancellation_reason = 'Ajuste administrativo: sessão reatribuída'
 WHERE id = '<BOOKING_ID_MAPEAMENTO_POSTERIOR>';
-- 2) reatribui o booking realizado mais antigo para a sessão de Mapeamento
UPDATE public.bookings SET session_id = (SELECT id FROM public.sessions WHERE is_kickoff = true AND is_active = true LIMIT 1)
 WHERE id = '<BOOKING_ID_VENDAS>';   -- trg_booking_report_required zera report_required
COMMIT;
```
Riscos adicionais da Opção B: o `booking_reports` escrito sobre "Vendas" fica anexado ao Mapeamento; o repasse do mentor dobra (`mentorFees.ts:7,36-39` — kickoff = 2×); `end_time` do booking continua 2h enquanto o Mapeamento é 3h; se o Mapeamento posterior foi realmente realizado, o membro perde uma sessão contabilizada.

---

## B2 Alexandre

**Por que o bloqueio falhou (quatro caminhos abertos + zero validação no banco):**

- `[SEVERIDADE: crítico] supabase/migrations/20260827213401:2-50` — versão vigente de `enforce_member_booking_rules` não tem nenhuma regra sobre kickoff (removida em `20260821162323`). Qualquer INSERT do Mapeamento passa. — Correção (SQL sugerido, comentado):
```sql
-- Bloquear kickoff quando o membro já tem >= 4 sessões realizadas (regra R1),
-- contando 'completed' e scheduled/rescheduled já ocorridas (R3).
-- Inserir dentro de enforce_member_booking_rules, antes do RETURN NEW:
-- IF TG_OP = 'INSERT' AND v_consumes_slot AND EXISTS (SELECT 1 FROM sessions s WHERE s.id = NEW.session_id AND s.is_kickoff) THEN
--   SELECT count(*) INTO v_realized FROM bookings b JOIN sessions s ON s.id = b.session_id
--    WHERE b.liberty_id = NEW.liberty_id AND COALESCE(s."order",1) > 0 AND b.id IS DISTINCT FROM NEW.id
--      AND (b.status = 'completed' OR (b.status IN ('scheduled','rescheduled')
--           AND (b.scheduled_date::timestamp + b.end_time) AT TIME ZONE 'America/Sao_Paulo' < now()));
--   IF v_realized >= 4 THEN RAISE EXCEPTION 'KICKOFF_NOT_ALLOWED' USING ERRCODE='P0001',
--      DETAIL='O Mapeamento do Negócio só pode ser agendado até a 3ª sessão realizada.'; END IF;
-- END IF;
```
- `[SEVERIDADE: crítico] src/pages/Journey.tsx:447-454` — botão "Agendar Kickoff" é renderizado sempre que `!booking` para a sessão; `kickoffLocked = false` fixo (`:345`) e não há checagem de `completedCount >= 4`. Leva a `/agenda/agendar?sessionId=<mapeamento>`.
- `[SEVERIDADE: crítico] src/pages/AgendarSessao.tsx:223-252` — o efeito de pré-seleção por `?sessionId=` só verifica `status !== "completed" && status !== "scheduled"` (`:231`) e **ignora `hideKickoff`**; com `date`/`time` pula direto para o passo 4 (`:245`). `hideKickoff` (`:120`) só afeta `visibleSessions` do passo 1 (`:122-125`). — Correção: no efeito, abortar quando `match.is_kickoff && hideKickoff` (e mostrar aviso), e em `handleConfirm` recusar kickoff se `hideKickoff`.
- `[SEVERIDADE: alto] src/pages/AgendaOverview.tsx:260-275, 370-434, 889` — `bookableSessions` inclui o kickoff sempre que estiver "available"; não há filtro por realizadas; cada slot gera link `?sessionId=…&date=…&time=…` que cai no caminho anterior. Não há checagem de duração (um slot de 2h é oferecido para o Mapeamento de 3h).
- `[SEVERIDADE: médio] src/pages/AgendarSessao.tsx:119` — `kickoffRequired = false` constante; branches `:634-645`, `:662`, `:703-706` e `Journey.tsx:411-415` são código morto que ainda exibe/esconde badges "🔒 Faça o Mapeamento primeiro".

**`completedCount` conta `awaiting_report`?** Sim: `sessionProgress.ts:40-41` mapeia `completed` **e** `awaiting_report` para `"completed"`, e `bookingStatus.ts:53-55` transforma `scheduled/rescheduled` no passado em `awaiting_report`. Portanto o `hideKickoff` do passo 1 (`AgendarSessao.tsx:120`) coerente com R3. Ressalva: a query de bookings de `AgendarSessao.tsx:100-102` não seleciona `report_required`/`is_retroactive`, então um kickoff passado ainda `scheduled` vira `awaiting_report` (em vez de `completed`) — não muda a contagem, mas muda rótulos.

**De onde vem o texto "Sessão 10 · Mapeamento do Negócio"?** De `MemberTimeline.tsx:336` (title do círculo) / `:401` (título do modal): `Sessão ${s.index} · ${sessionLabel}`, onde `index` é a posição cronológica do booking (`:63-70`, `:162-168`), incluindo `not_realized` e `pending_approval` (o filtro em `:64` só exclui `cancelled`). Não vem de `sessions.order`: o Mapeamento foi inserido com `order = 1` (`20260722162452:18`) e nenhuma migration/tela posterior altera esse valor (`AdminSessoes.tsx:62-71` não edita `order`). Ou seja, Alexandre tinha 9 bookings não-cancelados com data anterior a 31/out.

---

## B3 Esequiel

Hipóteses em ordem de probabilidade, com onde o código esconde a sessão:

1. `[SEVERIDADE: alto] status ainda 'scheduled' após a data (mentor não enviou relatório)` → `getEffectiveBookingStatus` retorna `awaiting_report` (`bookingStatus.ts:53-55`). Telas que **NÃO** contam isso como realizada, violando R3:
   - `src/pages/MentorAlunos.tsx:133` — `completed = … === "completed"` (exclui `awaiting_report`).
   - `src/components/MemberBookingsManager.tsx:80-85` — `completed` exige `"completed"`, `scheduled` exige `"scheduled"` → bookings `awaiting_report` **somem das duas listas** do editor admin/mentor. Além disso o select (`:27`) não traz `report_required`.
   - `MemberTimeline.tsx:154` rotula "Realizada · aguardando relatório" (amarelo) e `:370` legenda "Realizadas — com relatório enviado".
   - Notificação do banco `dispatch_report_nudges` (`20260830144233:119-123`): "Sem o relatório, elas **não contam como realizadas**" — mensagem contradiz R3 e induz mentor/aluno a achar que a sessão não foi contabilizada.
   - Telas que **contam** (`Journey`, `Dashboard`, `AgendarSessao` via `sessionProgress.ts:40`; `useAdminData.tsx:168` via `isRealizedSessionBooking`). → Inconsistência entre telas é a explicação mais provável da reclamação.
2. `[SEVERIDADE: alto] Renomeação/tier da sessão` — "SWOT Inovações" (begin) virou **"Tecnologia"** em `20260914224202:1`; "SWOT Estratégico" (`order=105`) e "Sessão de Marketing" (`order=104`) são Liberty (`20260721143044:14-20`). `sessionProgress.ts:28-30` ordena por `order` e faz `slice(0, 12)` → **qualquer sessão com `order` acima da 12ª posição é descartada** de `journeySessions`/`journeySessionIds`, logo não aparece em Journey (lista e bolinhas), Dashboard, AgendarSessao **nem no MemberTimeline** (`Journey.tsx:296` passa `journeySessionIds`), e não entra em `completedCount`. Se Esequiel fez "SWOT Estratégico"/"Sessão de Marketing", ou se o catálogo begin tem 13 sessões ativas com `order > 0` (Mapeamento `order=1` foi inserido ao lado das 12 originais), a sessão de maior `order` é cortada silenciosamente.
3. `[SEVERIDADE: alto] not_realized por engano` — `MentorSessoes.tsx:207` marca `not_realized`; `isVisibleSessionBooking` (`bookingStatus.ts:61-64`) esconde em todas as telas de membro; e o índice único (`20260528195653:35-37`, `WHERE status <> 'cancelled'`) **impede reagendar a mesma sessão** — o membro recebe "Esse horário acabou de ser reservado" (`AgendarSessao.tsx:399-400`), mensagem errada.
4. `[SEVERIDADE: médio] Sessão inativa` — `Journey.tsx:44`, `AgendarSessao.tsx:88`, `AgendaOverview.tsx:114`, `MemberSessionEditor.tsx:75` filtram `is_active = true`; um booking para sessão desativada (ex.: antigo "Mapa do Negócio" `order=999`) some e não conta. `Dashboard.tsx:69` **não** filtra `is_active` → Dashboard e Journey podem discordar.
5. `[SEVERIDADE: médio] Perfil duplicado / `liberty_id` errado` — mentor/admin criam booking escolhendo o perfil (`AdminAgenda.tsx:636-645`, `MemberSessionEditor.tsx:153-163`); Journey filtra por `profile.id` (`Journey.tsx:57`). Verificar com a 2ª query de (i).
6. Booking sem `session_id`: impossível (`NOT NULL`, `20260317183035:161`).

**Como o admin marca como realizada hoje e efeitos colaterais:**
- `MemberSessionEditor.tsx:98-124` (editar → status "Realizada") → `UPDATE … status='completed', is_retroactive=true, approval_required=false`. Efeitos: `set_booking_report_required` zera `report_required` (sem relatório exigido, sem nudges, sem "aguardando relatório"); `award_points_on_session_completed` +10 pontos; `notify_report_pending_for_mentor` **não** notifica (retroativo); fee conta em `AdminFinanceiro.tsx:36-50` (via `completed_sessions` de `useAdminData`); NPS **não** dispara (só em INSERT de `booking_reports`, `20260827213401:149-152`); `sync_availability_booked` roda (ver achado abaixo).
- `MemberSessionEditor.tsx:143-179` (adicionar "Já realizada (histórico)") → INSERT com `start_time 09:00 / end_time 10:30` fixos (`:158-159`), `is_retroactive=true`.
- `AdminAgenda.tsx:636-650` (manual, `status: manualStatus`) → sem `is_retroactive` → gera `report_pending` para o mentor e fica `awaiting_report` até relatório.
- `MentorRelatorio.tsx:241-250` → salvar relatório com resumo muda `status='completed'` (fluxo normal, dispara NPS).

`[SEVERIDADE: alto] 20260830142524:32-92 (sync_availability_booked)` — em qualquer UPDATE de `status` para não-cancelado, se `availability_id` é NULL a função procura uma disponibilidade do mentor com mesmo horário/dia-da-semana e marca `is_booked = true` (`:63-82`). Marcar retroativamente como realizada (ou o INSERT de histórico às 09:00) **bloqueia permanentemente um slot recorrente** do mentor. — Correção: só resolver disponibilidade quando `NEW.scheduled_date >= current_date` e `NEW.status IN ('scheduled','pending_approval','rescheduled')`.

**SQL (iii) — marcar sessões do Esequiel como realizadas**
```sql
-- 0) Conferir antes (query (i) com '%Esequiel%'). Verifique s."order", s.tier, s.is_active e se há relatório.

-- 1) Se há relatório OU o mentor vai preencher: basta completar o status.
BEGIN;
UPDATE public.bookings b
   SET status = 'completed'
  FROM public.sessions s, public.profiles p
 WHERE s.id = b.session_id AND p.id = b.liberty_id
   AND p.full_name ILIKE '%Esequiel%'
   AND s.name IN ('SWOT Inovações','Tecnologia','SWOT Estratégico','Marketing de Tração','Sessão de Marketing')
   AND b.status IN ('scheduled','rescheduled','pending_approval','not_realized')
   AND b.scheduled_date <= current_date;
COMMIT;
-- Efeitos: +10 pontos (trg_award_points_session); notificação 'report_pending' ao mentor se não houver relatório;
-- trg_sync_availability_booked pode marcar um slot recorrente do mentor como is_booked=true se availability_id for NULL
-- → conferir depois: SELECT * FROM mentor_availability WHERE mentor_id = '<MENTOR>' AND is_booked;

-- 2) Se NÃO haverá relatório (registro histórico), marque como retroativo para contar como "Realizada" em todas as telas:
-- UPDATE public.bookings SET status='completed', is_retroactive = true WHERE id IN ('<ID1>','<ID2>');
--   (trg_booking_report_required zera report_required; sem NPS, sem nudges)

-- 3) Se a sessão for Liberty (order >= 100) ou inativa, ela continua fora do slice(0,12):
--    ou reatribua para a sessão begin equivalente
-- UPDATE public.bookings SET session_id = (SELECT id FROM sessions WHERE name = 'Tecnologia') WHERE id = '<ID_SWOT>';
--    ou corrija o catálogo (ver "Outros achados").
```

---

## Outros achados

### Regras/contagens
- `[SEVERIDADE: alto] src/lib/sessionProgress.ts:28-30` — `sort(order).slice(0, 12)` define a jornada por posição, não por tier/flag. Com Mapeamento `order=1` + 12 sessões originais, ou sessões criadas pelo admin (`AdminSessoes.tsx:101` `nextOrder = max(order)+1` → após o 999 do Mapa antigo, novas sessões nascem com `order=1000`), sessões legítimas ficam invisíveis. Membros Liberty nunca veem as sessões 101–107 na jornada. — Correção: filtrar por `tier` do membro e `is_active`, e usar `order BETWEEN 1 AND 12` explicitamente (ou coluna `journey_position`).
- `[SEVERIDADE: médio] sessionProgress.ts:20` vs `AgendarSessao.tsx:90` / `AgendaOverview.tsx:116` — `(order ?? 1) > 0` vs `(order ?? 0) > 0`: sessão com `order NULL` é jornada em um lugar e não em outro.
- `[SEVERIDADE: médio] Journey.tsx:232-235` — "Disponíveis para agendar" = `12 − used`, onde `used` conta **todos** os bookings visíveis (inclui Onboarding `order=0`, sessões fora do slice, `pending_approval`), enquanto "Pendente" (`:220`) = `12 − completed − scheduled` só sobre as 12. Os dois números divergem na mesma tela.
- `[SEVERIDADE: médio] AgendarSessao.tsx:329-334` — `journeyUsed >= 13` conta todos os bookings do membro (inclui Onboarding), enquanto o trigger (`20260827213401:33-39`) só conta `order > 0`. Cliente pode bloquear antes do banco.
- `[SEVERIDADE: médio] AgendarSessao.tsx:312-318, 873-886` — UI promete "Sessão repetida… você pode repeti-la", mas o índice único `(liberty_id, session_id) WHERE status <> 'cancelled'` faz o INSERT falhar com 23505, exibido como "Esse horário acabou de ser reservado" (`:399-400`). Também `previousCompletion` usa `status === "completed"` bruto (ignora `awaiting_report`).
- `[SEVERIDADE: baixo] src/components/UrgencyBookingCard.tsx:19, 25` — `completedCount >= 12` hardcoded (não usa `BEGIN_JOURNEY_SESSIONS`); texto "só tem 1 sessão agendada **este mês**" usa `scheduledCount` total; `availabilityCount` (`Dashboard.tsx:112-134`) conta dias com qualquer disponibilidade, sem considerar mentores/sessões do membro.

### Datas/fuso
- `[SEVERIDADE: médio] src/lib/bookingStatus.ts:21-26, 31-34` — `new Date(`${date}T${time}`)` usa o fuso do navegador; "já passou"/`awaiting_report` muda conforme o dispositivo do usuário.
- `[SEVERIDADE: médio] Journey.tsx:227-229` — `today = new Date().toISOString().slice(0,10)` é data **UTC**; entre 21h e 0h (BRT) a "Próxima sessão" de hoje some.
- `[SEVERIDADE: médio] 20260827213716:43-44` e `20260830144233:87, 111` — `NEW.scheduled_date::timestamp + NEW.start_time` (sem fuso) comparado com `now()` → 3h de erro no alerta admin "<48h" e nos nudges; só `enforce_cancellation_policy` (`20260720173456:25`) aplica `AT TIME ZONE 'America/Sao_Paulo'`. O front decide `approval_required` em fuso local (`AgendarSessao.tsx:303-308`) → banco e front podem discordar.
- `[SEVERIDADE: médio] AgendarSessao.tsx:195-199, 780-782` — slots de **hoje** com horário já passado continuam clicáveis (só compara dia).
- `[SEVERIDADE: baixo] AgendarSessao.tsx:200-216` — recorrentes geradas para 5 semanas, mas o calendário navega meses livremente (meses seguintes aparecem vazios); `AgendaOverview.tsx:376` usa 60 dias.

### Slots / disponibilidade / double-booking
- `[SEVERIDADE: alto] AgendarSessao.tsx:409-411` + `20260830142524:82` — marcar `is_booked = true` na linha de `mentor_availability` **recorrente** apaga todas as semanas futuras daquele slot para todos os membros após um único agendamento. — Correção: derivar ocupação de `bookings` (mentor+data+hora) e nunca marcar recorrentes como `is_booked`.
- `[SEVERIDADE: médio] AgendarSessao.tsx:352-358` — `matchingAvail` casa qualquer mentor da sessão com mesmo `start_time`/dia, **sem reaplicar `fits`** (`:180-184`); um kickoff de 3h pode ser vinculado a uma disponibilidade de 2h de outro mentor. O membro não vê qual mentor recebeu a sessão.
- `[SEVERIDADE: médio] AgendarSessao.tsx:180-184` — regra "slots ≥180 min só para kickoff / <180 só para o resto": mentor que só abre blocos de 3h não consegue atender nenhuma sessão comum; `AgendaOverview.tsx:370-434` não aplica nenhuma regra de duração (inconsistente).
- `[SEVERIDADE: médio] 20260806153346:4-6` — índice único só por `start_time` idêntico; um kickoff 14:30–17:30 não impede outra sessão 15:30 do mesmo mentor. `AdminAgenda.tsx:622-632` faz checagem de sobreposição só no cliente e permite "forçar".
- `[SEVERIDADE: baixo] AgendarSessao.tsx:274-283, 839` — passo 3 exibe `slot.endTime` (fim da disponibilidade), passo 4 exibe `endForSession` (duração da sessão) → horários diferentes na mesma jornada de telas.

### Estado após erro / cache / realtime
- `[SEVERIDADE: alto] AgendarSessao.tsx:373-421` — após INSERT bem-sucedido não invalida `agendar-bookings`, `journey-bookings`, `overview-bookings`, `liberty-bookings`, `mentor-availability-all`. Com `staleTime: 60_000`, `refetchOnMount: false`, `refetchOnWindowFocus: false` (`src/App.tsx:61-65`), voltar para /jornada mostra a sessão ainda "Pendente" e o slot ainda disponível por até 60 s.
- `[SEVERIDADE: médio] src/hooks/useBookingsRealtime.tsx` — só usado em `AdminAgenda.tsx:117` e `MentorSessoes.tsx:39`; nenhuma tela de membro escuta mudanças → aprovação/cancelamento pelo mentor não reflete para o aluno sem reload. `useBookingNotifications.tsx` exibe toast, mas não invalida queries.
- `[SEVERIDADE: médio] AgendarSessao.tsx:424-436, 55-59` — animação "Criando sala Zoom… Adicionando ao Google Agenda… Confirmado" é fake (timers); a edge function é fire-and-forget e só para `!needsApproval`. Se falhar, o usuário vê "Confirmado".
- `[SEVERIDADE: baixo] AgendarSessao.tsx:388-404` — após 23505 a lista de slots não é refetchada; o mesmo horário continua na tela.

### Textos e UI
- `[SEVERIDADE: médio] AgendarSessao.tsx:861-871, 580-583, 934-936` — passo 4 e tela de sucesso dizem sempre "Requer confirmação do mentor / Solicitação enviada… aguardando a confirmação do mentor", mas com ≥48h o status já nasce `scheduled` e o banco envia "Sessão confirmada" (`20260827213716:66-71`); a pendência <48h é do **administrador** (`:301-302`, `:368-369`), enquanto `Journey.tsx:266-270` chama de "Aguardando mentor".
- `[SEVERIDADE: baixo] AgendarSessao.tsx:647-650` — banner "✦ Mapeamento do Negócio disponível — Você já avançou na jornada…" aparece para membro com 0 sessões.
- `[SEVERIDADE: baixo]` rótulos do mesmo estado: "Agendar Kickoff" (`Journey.tsx:453`) vs "✦ Kickoff · Comece por aqui" (`AgendarSessao.tsx:714`) vs "✦ Kickoff · 3h" (`Journey.tsx:400`) vs "Sessão 1 é o Mapeamento do Negócio, **obrigatória**" (`MemberTimeline.tsx:391`) — sendo que nada é obrigatório no código. "Concluída" (`AgendarSessao.tsx:697`) vs "Realizada" (`Journey.tsx:21`) vs "Realizada · aguardando relatório" (`MemberTimeline.tsx:154`).
- `[SEVERIDADE: baixo] Journey.tsx:398-402` — badge Kickoff só renderiza no branch sem `cover_image_url`; Mapeamento com capa perde o destaque.
- `[SEVERIDADE: baixo] Journey.tsx:390-393, 468-472, 477` — card com `cursor-pointer` e chevron, mas só expande se houver `booking`; clicar em sessão pendente não faz nada.
- `[SEVERIDADE: baixo] AgendarSessao.tsx:606, 841, 911` — fallback "1h 30min" vs `formatDuration` padrão 120 min (`:129-130`) vs `endForSession` 120 (`:259`).
- `[SEVERIDADE: baixo] AgendarSessao.tsx:486-490` — "Voltar" com pré-seleção usa `window.history.back()`; se a aba foi aberta direto, não há para onde voltar.

### Segurança (RLS)
- `[SEVERIDADE: médio] 20260701124517:48-58` — INSERT do membro não restringe `status`, `mentor_id`, `is_retroactive`, `approval_required`: via API o membro pode se inserir como `completed`/retroativo (ganha pontos e conta fee).
- `[SEVERIDADE: baixo] 20260701124650:53-57` — qualquer mentor lê todos os bookings de todos os membros (dependência de `MentorAlunos.tsx:36-44`).