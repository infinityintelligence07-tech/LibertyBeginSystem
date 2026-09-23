# Auditoria — Agenda Admin e gestão de bookings

Base de regras confirmada antes de responder:

- `enforce_member_booking_rules`: a última definição é de fato `supabase/migrations/20260827213401_*.sql:2-50` (só há definições anteriores em `20260813211436`, `20260813211530`, `20260813211647`, `20260821162323`). Regra atual: apenas limite de 13 bookings de jornada (linha 41); sem kickoff obrigatório nem limite mensal. O trigger (`20260813211436_*.sql:78-82`) dispara `BEFORE INSERT OR UPDATE OF status, scheduled_date, liberty_id, session_id`.
- `set_booking_report_required`: última definição em `20260830144233_*.sql:1-23`, trigger `BEFORE INSERT OR UPDATE OF session_id, is_retroactive`, recalcula `report_required := NOT (is_kickoff OR is_retroactive)`. A versão anterior (`20260830142524_*.sql:4-24`) só disparava em `session_id` e só setava `false` (nunca voltava para `true`) — foi corrigida.
- Honorário do mentor **não é persistido** no booking: é calculado em leitura a partir do nome da sessão (`src/lib/mentorFees.ts:31-48`, `src/pages/AdminFinanceiro.tsx:41`).
- NPS é disparado por trigger no `INSERT` de `booking_reports` (`20260827213401_*.sql:101-152`); `nps_responses.booking_id` é `ON DELETE SET NULL` (`20260701211407_*.sql:7`).
- `booking_reports` e `session_tasks` têm `ON DELETE CASCADE` para `bookings` (`20260317191226_*.sql:59`, `20260326124243_*.sql:5`). `member_points.related_booking_id` não tem FK (`20260720181011_*.sql:8`).

---

## Q1 — Trocar a `session_id` de um booking já realizado (Vendas → Mapeamento)

**Resposta curta: sim, mas só pela tela do membro, não pela Agenda; e o fluxo tem bugs que podem impedir a operação no caso concreto.**

- Na **Agenda** (`src/pages/AdminAgenda.tsx:1431-1434`) a sessão é exibida somente leitura; o drawer permite trocar mentor (1440), data/hora (1450/1460), status (1468-1478), remarcar (1497) e cancelar (1501). Não há troca de sessão.
- No **editor do membro** (`src/components/MemberSessionEditor.tsx:193-202`) há `Select` de sessão na linha em edição, e `handleSave` (98-124) envia `session_id: editSessionId || editing.session_id` (108). Ele é renderizado em `AdminMembros.tsx:1337` (dados de `useAdminData`) e em `AdminMembroDetalhes.tsx:632` via `MemberBookingsManager`.

Campos gravados pelo `handleSave` (`MemberSessionEditor.tsx:103-113`): `scheduled_date`, `mentor_id`, `session_id`, `status` e, se `status === "completed"`, `is_retroactive: true` + `approval_required: false`. Não altera `start_time/end_time`, `availability_id`, `observations`.

Efeitos no banco ao trocar `session_id`:
- `report_required` **é recalculado** pelo trigger `trg_booking_report_required` (`20260830144233_*.sql:21-23`) — Vendas→Mapeamento vira `report_required=false`. 
- `is_retroactive` **não é recalculado pelo banco**; porém o front força `is_retroactive: true` sempre que o status salvo for `completed` (linha 111), mesmo que a sessão tenha sido feita na plataforma com relatório.
- Honorário: como é derivado do nome da sessão em leitura (`AdminFinanceiro.tsx:41`, `useAdminData.tsx:305-313`), a conversão para Mapeamento **dobra automaticamente** o repasse daquele booking (`KICKOFF_FEE_MULTIPLIER`).
- Relatório/tarefas/NPS existentes ficam presos ao booking e passam a aparecer sob o nome "Mapeamento" (conteúdo escrito sobre "Vendas").
- "Vendas" volta a "Faltam realizar" automaticamente (`MemberSessionEditor.tsx:68-79` recalcula por `session_id`), e o membro pode agendar de novo (`sessionProgress.ts:34-45` é por `session_id`).

Achados:

- [SEVERIDADE: crítico] `src/components/MemberSessionEditor.tsx:95,109` — `editStatus` é inicializado com `b.status`, que no caminho `AdminMembros` é o **status efetivo** (`useAdminData.tsx:196` → pode ser `"awaiting_report"`) e é gravado cru em `status` — impacto: para uma "Vendas" realizada sem relatório (caso típico), o `Select` (204-212) fica vazio e o save falha com erro de enum (`booking_status` só tem scheduled/completed/rescheduled/cancelled/pending_approval/not_realized — `20260317183035_*.sql:155`, `20260531212103`, `20260708150108`); o admin não consegue converter a sessão — correção: mapear status efetivo → status bruto persistível antes de salvar (ex.: `awaiting_report` → `completed`) ou carregar o status bruto no `BookingDetail`.
- [SEVERIDADE: crítico] `src/components/MemberBookingsManager.tsx:80-82` — `completed` usa `getEffectiveBookingStatus(b) === "completed"`, que exclui `awaiting_report`; `scheduled` (83-85) exclui também — impacto: bookings passados com status bruto `scheduled` (mentor nunca fechou) **não aparecem em nenhuma lista** de `AdminMembroDetalhes`, logo não podem ser editados/convertidos/excluídos ali, embora contem como realizados em `useAdminData.tsx:168` (`isRealizedSessionBooking`) — correção: usar `isRealizedSessionBooking` e `isFutureScheduledBooking` como o restante do app.
- [SEVERIDADE: alto] `src/components/MemberSessionEditor.tsx:111` — força `is_retroactive: true` em qualquer save com status `completed` — impacto: ao só trocar a sessão de um booking realizado na plataforma, o registro vira "retroativo", `report_required` cai para `false` (trigger), a sessão sai de "aguardando relatório" e dos nudges (`dispatch_report_nudges` filtra `is_retroactive=false`), escondendo relatório pendente — correção: só setar `is_retroactive` quando o admin mudar explicitamente para "Realizada" a partir de um status não realizado, ou expor um toggle "registro histórico".
- [SEVERIDADE: alto] `src/components/MemberSessionEditor.tsx:92-93,107` — mentor da edição é resolvido por **nome** (`mentors.find(full_name === b.mentor_name)`) ignorando `b.mentor_id`, e `mentors` em `MemberBookingsManager.tsx:64` filtra `is_active = true` — impacto: booking de mentor inativo/homônimo/"Sem dados" salva `mentor_id: ""` → erro de UUID ou troca silenciosa de mentor — correção: usar `b.mentor_id` e incluir o mentor atual na lista mesmo se inativo.
- [SEVERIDADE: médio] `src/components/MemberSessionEditor.tsx:193-202` — o `Select` de sessão lista todas as sessões, inclusive inativas e `order 0` (Onboarding), e não impede duas realizadas da mesma sessão — impacto: admin pode criar duplicidade de Mapeamento — correção: filtrar como em `remaining` (73-79) e avisar se `session_id` já tem booking visível.
- [SEVERIDADE: médio] `src/components/MemberSessionEditor.tsx:103-116` — troca de sessão não ajusta `end_time` (Mapeamento tem 3h) e dispara `google-calendar-sync` mesmo para retroativos — impacto: duração errada na agenda/relatórios e evento indevido no Google — correção: recalcular `end_time` pela `duration_minutes` da sessão e pular sync quando `is_retroactive`.

## Q2 — Marcar sessão como realizada retroativamente (caso Esequiel: SWOT e Marketing de Tração)

**Resposta: sim, apenas pelo fluxo "Adicionar sessão" do editor do membro. A opção equivalente na Agenda está quebrada.**

Fluxo funcional (`AdminMembroDetalhes` → card "Sessões do aluno" ou `AdminMembros` → linha do membro):
1. Botão **"Adicionar sessão"** (`MemberSessionEditor.tsx:343-350`) abre `Dialog` (353-424).
2. Campos: Status (`"Já realizada (histórico)"` é o padrão, 366), Sessão (373-382), Mentor (386-395), Data (398-415). **Exige mentor e data** (144-147); **não pede horário** — grava fixo `09:00–10:30` (158-159).
3. `handleAdd` (143-179) insere `status: "completed"`, `is_retroactive: true`, `approval_required: false` (160-162), não chama `google-calendar-sync` (165-167). Precisa repetir uma vez por sessão (SWOT, depois Marketing de Tração).

Efeitos:
- Progresso: conta como realizada (`bookingStatus.ts:44-46` retorna `completed` sem exigir relatório; `useAdminData.tsx:168`).
- Relatório: `report_required=false` via trigger; não aparece em "aguardando relatório"; `notify_report_pending_for_mentor` e `dispatch_report_nudges` ignoram (`20260830144233_*.sql:41,84`).
- Honorário: **entra no financeiro normalmente** — `AdminFinanceiro.tsx:36-50` percorre `completed_sessions` sem olhar `is_retroactive`; mentor recebe pelo valor da sessão (dobro se for Mapeamento). Não há flag para "não remunerar" registros históricos.
- NPS: não é disparado (só há trigger em `booking_reports`); membro não é convidado a avaliar.
- Gamificação: trigger `award_points_on_session_completed` (`20260720181011_*.sql:83-101`) dá 10 pontos.
- Notificações: `notify_booking_changes` em INSERT com `completed` notifica mentor "Nova sessão agendada" (`20260827213716_*.sql:60-65`), texto inadequado para histórico.

Achados:

- [SEVERIDADE: alto] `src/pages/AdminAgenda.tsx:1735,644,658` — opção "Realizada (registro histórico)" no modal manual insere `status: "completed"` **sem `is_retroactive`** — impacto: booking fica com `report_required=true`, mentor recebe "Preencha o relatório" (`trg_notify_report_pending_ins`), é cobrado por nudges, e em telas que passam `hasReport` vira "Aguardando relatório"; comportamento oposto ao rótulo e ao `MemberSessionEditor.tsx:152-161` — correção: enviar `is_retroactive: manualStatus === "completed"` e pular `google-calendar-sync` (648-650) para retroativos.
- [SEVERIDADE: alto] `src/pages/AdminAgenda.tsx:537-545` — mudar o `select` de status para "Realizada" (1468-1478) faz `update({ status })` sem `is_retroactive`, sem confirmação e sem sync de calendário — impacto: mesmo problema acima ao "fechar" uma sessão passada pela Agenda; além disso o `select` dispara update em `onChange`, sem "Salvar" — correção: unificar num único helper `markBookingCompleted({ retroactive })` e pedir confirmação.
- [SEVERIDADE: médio] `src/components/MemberSessionEditor.tsx:158-159` — horário fixo `09:00–10:30` para todo registro histórico — impacto: `isBookingPast`/ordenação/relatórios de repasse mostram horário fictício; Mapeamento (3h) fica com 1h30 — correção: permitir hora opcional e calcular `end_time` pela duração da sessão.
- [SEVERIDADE: médio] `src/pages/AdminFinanceiro.tsx:36-50` + `useAdminData.tsx:189-197` — `BookingDetail` não carrega `is_retroactive`; financeiro não distingue histórico de realizada na plataforma — impacto: admin não consegue decidir se paga o mentor por sessão feita fora da plataforma — correção: propagar `is_retroactive` no `BookingDetail` e exibir badge/filtro no financeiro.
- [SEVERIDADE: baixo] `src/components/MemberSessionEditor.tsx:366` vs `AdminAgenda.tsx:1735` — rótulos "Já realizada (histórico)" vs "Realizada (registro histórico)" para o mesmo conceito — correção: texto único.

## Q3 — Cancelar vs excluir (Vendas do Kaoru) e liberação da sessão

**Resposta: sim, ambos liberam a sessão para reagendar.** Cancelar existe só na Agenda; excluir existe só no editor do membro (e no card verde de `AdminMembros.tsx:1323-1330`). A UI não deixa claro qual usar.

Cancelar (`AdminAgenda.tsx:584-599`, modal 1571-1598, motivo obrigatório 1592):
- `status='cancelled'` + `cancellation_reason`; linha permanece.
- Sai de contadores (`isVisibleSessionBooking`), libera cota dos 13 (`enforce_member_booking_rules` ignora cancelled — `20260827213401_*.sql:38`), libera `mentor_availability` (`sync_availability_booked` — `20260830142524_*.sql:42-47`), libera a sessão no progresso (`sessionProgress.ts:34`).
- Dispara notificações a mentor e membro (`notify_booking_changes` 117-129) e **política de cancelamento** (`enforce_cancellation_policy` — `20260720173456_*.sql:31-57`): se faltar 24–48h consome uma remarcação-cortesia do membro; <24h notifica admins para "cobrar taxa". Vale mesmo quando o admin cancela por erro de cadastro.
- Financeiro: não conta (filtra visíveis). Chama `google-calendar-sync`.
- Cancelados **nunca aparecem** na Agenda (ver achado abaixo) nem no perfil (`AdminMembroDetalhes.tsx:647` comentário).

Excluir (`MemberSessionEditor.tsx:127-141`):
- `DELETE` físico; `booking_reports` e `session_tasks` somem por CASCADE; `nps_responses.booking_id` vira NULL; `member_points` da sessão **permanecem** (sem FK); notificações antigas apontam para booking inexistente; evento do Google Calendar **não é removido** (nenhum sync no delete).
- Libera cota, disponibilidade (trigger em DELETE) e sessão. Sem notificação a ninguém, sem política de cortesia.
- Financeiro: some do histórico de repasse (inclusive de meses já pagos).

Achados:

- [SEVERIDADE: crítico] `src/components/MemberSessionEditor.tsx:281-287,127-141` — botão de lixeira executa `handleDelete` **sem confirmação** — impacto: um clique apaga booking, relatório e tarefas de forma irreversível; `AdminMembros.tsx:603` tem `confirm()` para a mesma ação, comportamento divergente — correção: `AlertDialog` com resumo do que será apagado.
- [SEVERIDADE: alto] `src/pages/AdminAgenda.tsx:479-488,935` — `matchesFilters` retorna `false` para cancelados/não realizados **antes** de checar `statusFilter`; os chips "Cancelada" e "Não realizada" nunca retornam nada — impacto: admin não consegue localizar o booking cancelado do Kaoru para reabrir/auditar — correção: aplicar `isVisibleSessionBooking` só quando `statusFilter` não for `cancelled`/`not_realized`.
- [SEVERIDADE: alto] `src/pages/AdminAgenda.tsx:1468-1478,537-545` — o `select` permite "Cancelada"/"Não realizada" sem motivo e sem confirmação, contornando o modal de cancelamento (1584 exige motivo) — impacto: cancelamento acidental, `cancellation_reason` nulo, política de cortesia disparada — correção: remover essas opções do `select` e roteá-las para os modais.
- [SEVERIDADE: alto] `src/components/MemberSessionEditor.tsx:204-212` + `MemberBookingsManager.tsx:119-121` — cabeçalho promete "Adicionar · Editar · Cancelar", mas o editor só oferece excluir; `Select` de status não tem "Cancelada" — impacto: admin recorre à exclusão física quando deveria cancelar (perde histórico e não notifica) — correção: adicionar ação "Cancelar" com motivo, ou trocar o texto.
- [SEVERIDADE: médio] `src/components/MemberSessionEditor.tsx:131-133` e `AdminMembros.tsx:605-607` — deletes de `booking_reports`/`session_tasks` antes do booking são redundantes (CASCADE) e não transacionais; erro no primeiro é ignorado (`await` sem checar) — impacto: se o `DELETE bookings` falhar por RLS, relatório já foi apagado — correção: remover deletes filhos, confiar no CASCADE.
- [SEVERIDADE: médio] `src/components/MemberSessionEditor.tsx:127-141` — não chama `google-calendar-sync` nem remove `member_points` — impacto: evento fantasma no Google e pontos mantidos por sessão inexistente — correção: chamar sync com flag de remoção; trigger `AFTER DELETE` para limpar pontos.
- [SEVERIDADE: médio] `supabase/migrations/20260720173456_*.sql:18-23` — política de cortesia não distingue ator (admin corrigindo cadastro) de membro cancelando — impacto: admin ao cancelar "Vendas" do Kaoru pode consumir uma cortesia do aluno — correção: pular quando `auth.uid()` for admin (padrão já usado em `notify_booking_changes` com `v_actor`).

## Cruzamento de dados

- [SEVERIDADE: alto] `src/components/MemberBookingsManager.tsx:70-78` vs `src/hooks/useAdminData.tsx:189-197` — `toDetail.status` é o status **bruto**, enquanto `mapBooking.status` é o **efetivo**; o mesmo `MemberSessionEditor` recebe semânticas diferentes conforme a página — impacto: comportamento do `handleSave` diverge entre `AdminMembros` e `AdminMembroDetalhes` (ver Q1) — correção: um único mapeador `toBookingDetail` em `useAdminData`.
- [SEVERIDADE: alto] `src/components/MemberBookingsManager.tsx:98-100` — `total_completed`/`total_scheduled` incluem sessões `order 0` (Onboarding) e ignoram `awaiting_report`; `useAdminData.tsx:163-170` aplica `isJourneyBooking` e `isRealizedSessionBooking` — impacto: contadores do perfil divergem da lista de membros — correção: reutilizar `buildSessionProgress`.
- [SEVERIDADE: médio] `src/pages/AdminAgenda.tsx:38,79-104,517` — tipo `SessionStatus` e mapas locais não contemplam `awaiting_report`, mas `displayStatus` faz cast do status efetivo — impacto: na lista mobile (1208) `statusText[...]`/`statusLabel[...]` viram `undefined` (badge sem cor/texto "● undefined"); no drawer `editStatus="awaiting_report"` não casa com nenhuma `<option>` (1468-1478); chips "Agendada"/"Realizada" (935) escondem sessões passadas sem relatório — correção: usar `bookingStatusConfig` de `bookingStatus.ts:124-160` e adicionar chip "Aguardando relatório".
- [SEVERIDADE: médio] `src/pages/AdminAgenda.tsx:79-104` vs `src/lib/bookingStatus.ts:150-153` — rótulo "Aguardando aprovação" vs "Aguardando confirmação"; `rescheduled` amarelo aqui vs azul lá — impacto: mesma sessão com nome/cor diferentes entre telas — correção: remover mapas locais.
- [SEVERIDADE: médio] `src/pages/AdminAgenda.tsx:221-234,714-720` — query limita a `scheduled_date` do mês (178-180), mas o grid mensal renderiza dias do mês anterior/seguinte (`calStart..calEnd`) — impacto: células "fora do mês" aparecem vazias mesmo tendo sessões — correção: buscar pelo intervalo `calStart..calEnd`.
- [SEVERIDADE: médio] `src/hooks/useAdminData.tsx:333` vs `168` — stats de mentor contam `completed` estrito, membro conta `isRealized` (inclui `awaiting_report`) — impacto: soma de sessões por mentor ≠ soma por membro no mesmo mês — correção: padronizar em `isRealizedSessionBooking` e mostrar "aguardando relatório" como subconjunto.
- [SEVERIDADE: médio] `src/pages/AdminAgenda.tsx:269-274` — `approvePending` seta `is_booked` manualmente após update, duplicando `sync_availability_booked` (trigger em `UPDATE OF status`) e ignorando o erro — impacto: dupla escrita, divergência se a RLS negar — correção: remover a atualização manual.
- [SEVERIDADE: médio] `src/pages/AdminAgenda.tsx:558-573` — remarcar não zera `availability_id`; o trigger só libera o slot antigo se `availability_id` mudar ou status cancelar (`20260830142524_*.sql:42-47`) e, como `v_avail` continua o antigo, marca-o `is_booked=true` de novo — impacto: slot antigo fica bloqueado, novo horário sem vínculo — correção: enviar `availability_id: null` no update de remarcação.
- [SEVERIDADE: baixo] `src/lib/bookingStatus.ts:21-25` — `isBookingPast` usa horário local do navegador; políticas de banco usam `America/Sao_Paulo` (`20260720173456_*.sql:25`) — impacto: admin em outro fuso vê "aguardando relatório" em momento diferente do servidor — correção: fixar fuso (`date-fns-tz`) ou usar `now()` do servidor.
- [SEVERIDADE: baixo] `src/contexts/AdminFilterContext.tsx:9,49` e `MemberSessionEditor.tsx:62-67` — filtro mensal usa `scheduled_date` (consistente com `useAdminData.tsx:179`); apenas registrar que registros históricos lançados com data antiga caem no mês da data informada, não no mês do lançamento — correção: documentar/exibir `created_at` no financeiro.

## Lógica

- [SEVERIDADE: alto] `src/pages/AdminAgenda.tsx:565` — `targetDate = newDate || dateStr`: se o admin só alterar o horário, a data vira **o dia atualmente exibido no calendário**, não a data do booking — impacto: sessão migra de dia silenciosamente — correção: usar `selectedBooking.scheduled_date` como fallback e pré-preencher `newDate/newTime` em `openDrawer`.
- [SEVERIDADE: alto] `src/pages/AdminAgenda.tsx:572` — remarcar força `status: "scheduled"` mesmo para booking `completed`/`not_realized` — impacto: sessão realizada volta a "agendada" (perde pontos? não — mas sai do financeiro e do progresso) — correção: manter status se já realizado, ou bloquear "Remarcar" para realizadas.
- [SEVERIDADE: alto] `src/pages/AdminAgenda.tsx:560-564,606-608` e `MemberSessionEditor.tsx:158-159` — três cálculos de `end_time` (+90 min fixo, 1h30 fixo, 10:30 fixo) ignoram `duration_minutes` da sessão (Mapeamento = 3h) — impacto: conflitos de agenda não detectados para kickoff, duração errada em relatórios — correção: helper único `computeEndTime(start, session.duration_minutes)`.
- [SEVERIDADE: médio] `src/pages/AdminAgenda.tsx:627-633` — após o primeiro aviso, `manualConflict` fica setado; se o admin mudar mentor/hora, o próximo clique **força** sem rechecar — impacto: sobreposição criada sem aviso — correção: limpar `manualConflict` nos `onChange` de mentor/data/hora.
- [SEVERIDADE: médio] `src/pages/AdminAgenda.tsx:618` — checagem de conflito exclui só `cancelled`, não `not_realized` — impacto: falso conflito — correção: `.not("status","in","(cancelled,not_realized)")`.
- [SEVERIDADE: médio] `src/pages/AdminAgenda.tsx:547-556` — troca de mentor não chama `google-calendar-sync` (as demais ações chamam), lista todos os mentores (1523) ignorando `mentor_sessions`, enquanto o modal manual filtra (704-706) — impacto: evento do Google fica com mentor antigo; regras divergentes — correção: sync + mesmo filtro (com opção "mostrar todos").
- [SEVERIDADE: médio] `src/components/MemberSessionEditor.tsx:118,135,171` — invalida só `["admin-members"]`; a query `["member-bookings-manager", libertyId]` (`MemberBookingsManager.tsx:23`) não é invalidada e `refreshAll` (`AdminMembroDetalhes.tsx:145`) só incrementa `reloadKey` do pai — impacto: após editar/excluir em `AdminMembroDetalhes` a lista do editor fica desatualizada até refetch por foco — correção: invalidar por prefixo `["member-bookings-manager"]` ou passar `queryKey` via prop.
- [SEVERIDADE: médio] `src/components/MemberBookingsManager.tsx:38,46,54-65` — queries descartam `error` — impacto: falha de RLS vira lista vazia sem aviso (admin acha que aluno não tem sessões) — correção: `if (error) throw error`.
- [SEVERIDADE: médio] `src/pages/AdminAgenda.tsx:275,592,576,649` e `MemberSessionEditor.tsx:115,166` — `google-calendar-sync` com `.catch(() => {})` — impacto: falhas de integração invisíveis — correção: `toast.warning` ou log estruturado.
- [SEVERIDADE: médio] `src/pages/AdminAgenda.tsx:294-303` — "Reabrir" não realizada volta para `scheduled` mantendo data passada e sem verificar conflito — impacto: vira imediatamente "aguardando relatório" — correção: abrir o drawer de remarcação em vez de reabrir direto.
- [SEVERIDADE: médio] `src/components/SessionCoverUpload.tsx:52-55,71-72` — `remove` do arquivo anterior sem checar erro; ordem "upload → update → remove" não é atômica — impacto: arquivos órfãos no bucket — correção: checar erro e logar.
- [SEVERIDADE: baixo] `src/pages/AdminAgenda.tsx:491-497` — `useMemo` de `dayBookings` depende de `matchesFilters` (closure) mas lista deps manuais — impacto: risco de stale ao adicionar filtro novo — correção: `useCallback` para `matchesFilters` e incluir nas deps.
- [SEVERIDADE: baixo] `src/pages/AdminAgenda.tsx:671-689` — `useEffect` com `eslint-disable` e `openDrawer` fora das deps — correção: `useCallback` + deps corretas.
- [SEVERIDADE: baixo] `src/lib/bookingRules.ts:5-6,11-12,17-19` — `MONTHLY_BOOKING_LIMIT_EXCEEDED` e `KICKOFF_REQUIRED` não existem mais no banco (`20260827213401`) — impacto: código morto e mensagem enganosa se algum ambiente antigo ainda emitir — correção: remover ou documentar.

## UX/Consistência visual

- [SEVERIDADE: alto] `src/components/MemberSessionEditor.tsx:275-287` — botões de editar/excluir só aparecem em `group-hover` (`opacity-0`) — impacto: invisíveis em touch/mobile e para navegação por teclado (não há `focus:opacity-100`; `AdminMembros.tsx:1327` usa `lg:opacity-0 ... focus:opacity-100`) — correção: mesmo padrão de `AdminMembros`.
- [SEVERIDADE: médio] `src/pages/AdminAgenda.tsx:849` — `window.prompt` para motivo da recusa, enquanto cancelar usa modal com textarea (1571-1598) e `SessionCoverUpload.tsx:68`/`AdminMembros.tsx:603` usam `confirm()` nativo — impacto: três padrões de confirmação — correção: `Dialog`/`AlertDialog` do design system.
- [SEVERIDADE: médio] `src/pages/AdminAgenda.tsx:1468-1478` — status muda via `<select>` com efeito imediato no banco, sem botão salvar nem feedback de sucesso (`handleStatusChange` não dá `toast.success`) — impacto: admin não sabe se salvou — correção: botão "Salvar" ou `toast`.
- [SEVERIDADE: médio] `src/pages/AdminAgenda.tsx:1497-1504` — botões "Remarcar" e "Cancelar sessão" aparecem para bookings já realizados — impacto: convida a ação destrutiva sobre sessão concluída — correção: esconder/desabilitar conforme status efetivo.
- [SEVERIDADE: médio] `src/pages/AdminAgenda.tsx:1582` — "Esta ação cancelará a sessão." não menciona notificação ao membro/mentor nem a política de cortesia/taxa — correção: descrever efeitos.
- [SEVERIDADE: médio] `src/components/MemberSessionEditor.tsx:191-239` — linha de edição com larguras fixas (`w-[200px]`, `w-[130px]`, `w-[160px]`) em `flex-wrap` — impacto: quebra em 3–4 linhas no mobile, sem rótulos — correção: `grid` responsivo com `label`.
- [SEVERIDADE: médio] Acessibilidade — botões só-ícone sem `aria-label`: `AdminAgenda.tsx:804,810` (navegação), `1410,1618,1779,1848` (fechar), `1520,1554,1580`; `AdminMonthFilter.tsx:21-26,37-42`; `MemberSessionEditor.tsx:275,281`; `SessionCoverUpload.tsx:123` (tem só `title`) — correção: `aria-label` em todos.
- [SEVERIDADE: baixo] `src/pages/AdminAgenda.tsx:1264-1265,264` — formato de data `dd/MM/yyyy` via `format` vs `toLocaleDateString("pt-BR")` em `MemberSessionEditor.tsx:264` — correção: um util `formatDateBR`.
- [SEVERIDADE: baixo] `src/pages/AdminAgenda.tsx:1208` vs `1166-1177` — mobile mostra badge de status, desktop não (só cor do mentor) — impacto: no desktop "Realizada" e "Agendada" são indistinguíveis dentro da coluna — correção: dot/ícone de status no card desktop.
- [SEVERIDADE: baixo] `src/pages/AdminAgenda.tsx:778` — "N sessões" conta pendentes de aprovação e omite canceladas sem explicar — correção: tooltip com quebra por status.
- [SEVERIDADE: baixo] `src/pages/AdminAgenda.tsx:793` — botão de modo "day" rotulado "Hoje", igual ao botão de voltar para hoje (808) — correção: "Dia".
- [SEVERIDADE: baixo] Textos em inglês visíveis: nenhum na UI; comentários/nomes internos em inglês (ok). Mensagens de erro do Supabase são concatenadas cruas em `MemberSessionEditor.tsx:120,137,175`, `SessionCoverUpload.tsx:59,78` — correção: `translateErrorToPt` (já existe em `AdminMembros.tsx:612`).

## Qualidade

- [SEVERIDADE: alto] `src/pages/AdminAgenda.tsx` (1874 linhas) — extrair: (a) `useAgendaData` (queries 196-267, 330-340, 442-467); (b) `useAvailabilitySlots` (343-432 + modais 1770-1868); (c) `PendingApprovalsPanel` (818-860) e `NotRealizedPanel` (864-905); (d) `AgendaFilters` (907-964); (e) `RemindersPanel` (966-1036); (f) `AgendaDayView` (1039-1238), `AgendaWeekView` (1241-1330), `AgendaMonthView` (1333-1390); (g) `BookingDrawer` (1393-1603) com `useBookingActions` (537-599); (h) `ManualBookingModal` (1605-1768); (i) constantes/cores para `lib/agendaTheme.ts` (67-111).
- [SEVERIDADE: alto] Duplicação com regras divergentes — fetch de mentores (`AdminAgenda.tsx:196-214` sem `is_active`; `MemberBookingsManager.tsx:51-68` com `is_active`); criação de booking (`AdminAgenda.tsx:635-645` sem `is_retroactive`; `MemberSessionEditor.tsx:153-163` com); cálculo de `end_time` (3 lugares); exclusão (`MemberSessionEditor.tsx:127-141` vs `AdminMembros.tsx:602-614`) — correção: `useMentors()`, `createBooking()`, `deleteBooking()` em `src/lib/bookings.ts`.
- [SEVERIDADE: médio] `any`: `AdminAgenda.tsx:204,243,261,270,284,297,348,572,587,644`; `MemberBookingsManager.tsx:58,70,81,84,100`; `MemberSessionEditor.tsx:109,119,136,172`; `SessionCoverUpload.tsx:58,78` — correção: tipar com `Database["public"]["Tables"]["bookings"]` e `PostgrestError`.
- [SEVERIDADE: médio] `src/components/MemberBookingsManager.tsx:87-110` — monta um `MemberWithProgress` falso com 14 campos nulos só para satisfazer a prop — impacto: acoplamento e contadores errados — correção: `MemberSessionEditor` receber apenas `{ completed, scheduled, memberTier, memberId }`.
- [SEVERIDADE: baixo] Código morto: `AdminAgenda.tsx:79-86` `statusBg` nunca usado; `MemberSessionEditor.tsx:60` `mentorsForSession` nunca usado; `AdminAgenda.tsx:434-438` "legacy var name"; `AdminAgenda.tsx:1475` opção "Remarcada" que `getEffectiveBookingStatus` converte para "scheduled" (`bookingStatus.ts:57`); `bookingRules.ts` funções de regras extintas.
- [SEVERIDADE: baixo] `src/pages/AdminAgenda.tsx:819,866,1042,1205,1218,1430,1483` — `style={{ transform: "none" }}` repetido para neutralizar `.glass-card` — correção: variante da classe sem transform.
- [SEVERIDADE: baixo] `src/contexts/AdminFilterContext.tsx:25-26` — `currentMonth` recalculado a cada render (só usado no `useState` inicial) — correção: `useState(() => ...)`.
- [SEVERIDADE: baixo] `src/components/SessionCoverUpload.tsx:37-38` — extensão vem do nome do arquivo, não do `file.type`; `upsert: true` desnecessário com path único — correção: mapear `type → ext`.

Não editei nenhum arquivo.