# Auditoria do módulo Admin — Liberty Begin

Referências da regra única (`src/lib/bookingStatus.ts`): realizada = `completed` OU `awaiting_report` (L74-77); `awaiting_report` depende de `hasReport` (L48) e de `report_required`/`is_retroactive` (L14-15); `isScheduledSessionBooking` inclui `awaiting_report` (L79-82); `isFutureScheduledBooking` só futuro (L85-86). `sessionProgress.ts`: jornada = `order > 0`, ordenada e cortada em 12 (L28-30), dedupe por `session_id` (L34-45). Migrations relevantes: não existe nenhuma VIEW/RPC de agregação para o admin — toda agregação é feita no cliente. Os únicos RPCs (`get_ranking_board`, `get_ranking_totals`, `list_tool_members`) servem ranking/ferramentas; `dispatch_report_nudges` (20260830144233 L79-89) define server-side "pendente de relatório" como `status IN ('scheduled','rescheduled','completed') AND NOT EXISTS booking_reports`.

---

## Cruzamento de dados (métrica por métrica)

**Realizadas — membros vs mentores vs stats**

- [SEVERIDADE: crítico] `src/hooks/useAdminData.tsx:167-170, 333, 335, 475, 482` e `src/pages/AdminRelatorios.tsx:23` — nenhuma chamada a `getEffectiveBookingStatus` no admin passa `hasReport`; `booking_reports` nunca é consultado em `useAdminData`. Sem `hasReport`, `bookingStatus.ts:48` nunca devolve `awaiting_report` para uma sessão `completed` sem relatório — impacto: (a) `useMentors` classifica "completed sem relatório" como `completed` (L333) e só conta em `awaiting` (L335) as `scheduled/rescheduled` passadas; o card "Aguardando relatório" do Financeiro fica subcontado em relação ao painel do mentor (`MentorDashboard.tsx:91/698`, `MentorSessoes.tsx:346`) e ao nudge server-side (`dispatch_report_nudges`, que inclui `status='completed'`); (b) `AdminRelatorios` lista como "sessões realizadas/relatórios" bookings sem relatório algum — correção: em `useMembers`/`useMentors`/`AdminRelatorios` buscar `booking_reports.select("booking_id")` (chunked) e passar `{ hasReport }` em todas as chamadas; expor `total_awaiting_report` também em `MemberWithProgress`.

- [SEVERIDADE: alto] `src/hooks/useAdminData.tsx:168` vs `:333` — membros usam `isRealizedSessionBooking` (completed + awaiting_report) e mentores usam `=== "completed"` estrito, com `awaiting` separado — impacto: "Realizadas total (Begin)" do Dashboard (`AdminDashboard.tsx:103-105`) nunca bate com a soma de "realizadas" de `AdminMentores.tsx:333-334` (`monthly_completed`) para o mesmo conjunto de bookings; a mesma sessão é "realizada" numa aba e "aguardando" na outra — correção: padronizar `completed = isCompletedSessionBooking`, `awaiting = isAwaitingReportSessionBooking`, `realized = completed + awaiting` em ambos os hooks e escolher explicitamente qual exibir em cada tela.

- [SEVERIDADE: alto] `src/hooks/useAdminData.tsx:163, 168, 170` vs `src/lib/sessionProgress.ts:28-45` — `total_completed` conta **bookings** com `order > 0`, sem dedupe por `session_id` e sem cortar em 12 sessões; `buildSessionProgress` deduplica por sessão e usa `slice(0, 12)` — impacto: um membro que repetiu a mesma sessão (remarcação que virou duas realizadas, retroativo duplicado) aparece com `total_completed >= 12` em "Jornada completa (12)" (`AdminDashboard.tsx:71, 137`), no filtro `on_track` (`AdminMembros.tsx:804`), na planilha (`AdminMembros.tsx:379`) e no "x/12 sessões" do Kanban (`AdminEncerramentos.tsx:210`), enquanto a Jornada do próprio membro mostra menos; se o catálogo tiver mais de 12 sessões com `order > 0` (ex.: Liberty), a 13ª conta no admin mas não na jornada — correção: reutilizar `buildSessionProgress(sessions, memberBookings).completedCount` em `useMembers` (já existe `useSessionCatalog`), mantendo a contagem bruta só para financeiro.

- [SEVERIDADE: alto] `src/hooks/useAdminData.tsx:163` vs `:314-319, 330` — "fora da jornada" para membros é `sessions.order === 0`; para mentores é `sessionFeeMultiplier === 0`, ou seja, **nome** contendo "onboarding"/"boas-vindas" (`mentorFees.ts:20-28`) — impacto: sessão order=0 renomeada (ex.: "Kickoff de boas-vindas" → cai também em `isKickoffSessionName`) ou sessão de jornada com "onboarding" no nome entra num total e não no outro; Dashboard e Financeiro divergem — correção: usar uma única fonte (`order === 0` OU flag `is_unpaid` no catálogo) para os dois hooks.

- [SEVERIDADE: alto] `src/pages/AdminFinanceiro.tsx:31-55` vs `src/hooks/useAdminData.tsx:328-335` — o detalhe/PDF por mentor é montado a partir de `members[].completed_sessions/scheduled_sessions` (só jornada, só membros com perfil, sem guests, status já efetivo), enquanto a linha/totais da tabela vêm de `useMentors` (todos os bookings do mentor, inclusive order=0 não-"onboarding" e guests) — impacto: `sessions.length` do detalhe ≠ `row.total`; PDF e tabela discordam; L39 ainda casa mentor por **nome** quando `mentor_id` é null — correção: gerar detalhe e totais da mesma lista (bookings brutos filtrados por `mentor_id`).

- [SEVERIDADE: médio] `src/pages/AdminFinanceiro.tsx:143-152` — recalcula status localmente (`isPastNotDone` por `T23:59:59`) ignorando `end_time`, `report_required`, `is_retroactive` e a regra única, embora `cs.status` já seja o status efetivo — impacto: sessão de mapeamento (sem relatório) passada aparece "Aguardando relatório" no detalhe e "Realizada" no total; duplica lógica — correção: `bookingStatusConfig[s.status].label`.

**useAdminStats (todas as métricas são código morto, mas erradas)**

- [SEVERIDADE: alto] `src/hooks/useAdminData.tsx:443-444, 471` — `monthEnd = nextMonth.toISOString().split("T")[0]`: `nextMonth` é meia-noite **local** do dia 1; em UTC-3 `toISOString()` cai no dia anterior (último dia do mês corrente) → `.lt("scheduled_date", monthEnd)` exclui todas as sessões do último dia do mês — impacto: `completedThisMonth`/`scheduledThisMonth` subcontam; `monthStart` (L442) é montado por string local e `monthEnd` em UTC — mistura de referências — correção: `const monthEnd = \`${nextMonth.getFullYear()}-${pad(nextMonth.getMonth()+1)}-01\``.

- [SEVERIDADE: médio] `src/hooks/useAdminData.tsx:475-476, 482` — `completedThisMonth`/`totalCompleted` usam `=== "completed"` e `scheduledThisMonth` usa `isScheduledSessionBooking` (inclui `awaiting_report`) — impacto: `awaiting_report` é "agendada" aqui e "realizada" em `useMembers:168`; além disso não filtra order=0, tier, membro inativo nem guest — correção: alinhar com `isRealizedSessionBooking`/`isFutureScheduledBooking` ou remover.

- [SEVERIDADE: médio] `src/hooks/useAdminData.tsx:447-465` — `totalMembers` = perfis com role `liberty` (inclui inativos e ambos os tiers); `totalMentors` = roles `mentor` (inclui inativos). Dashboard usa `profiles.member_tier + is_active` (`AdminDashboard.tsx:44-46`) e `mentors.is_active` (L121-124) — duas definições de "membro/mentor" no mesmo módulo — correção: remover de `useAdminStats` ou derivar de `useMembers`/`useMentors`.

- [SEVERIDADE: médio] `src/hooks/useAdminData.tsx:509-510` — `estimatedMonthRevenue = completed × sessionValue` ignora `KICKOFF_FEE_MULTIPLIER` e sessões não remuneradas (`mentorFees.ts`), diferente do Financeiro (`AdminFinanceiro.tsx:117-118`) — correção: remover (não consumido) ou reutilizar `sessionFee`.

- [SEVERIDADE: médio] `src/hooks/useAdminData.tsx:491` e `src/pages/AdminDashboard.tsx:119`, `src/pages/AdminFinanceiro.tsx:24`, `src/pages/AdminMentores.tsx:45` — fallback `"900"` no hook vs `?? 300` nas páginas; `parseFloat` de valor não numérico retorna `NaN`, e `NaN ?? 300` **não** cai no fallback — impacto: todo o Financeiro vira `R$ NaN` se `system_config.session_value` for inválido — correção: `Number.isFinite(v) ? v : DEFAULT_SESSION_VALUE` com uma constante única.

**Meta mensal / ritmo**

- [SEVERIDADE: médio] `src/pages/AdminDashboard.tsx:60-68, 137` vs `src/pages/AdminMembros.tsx:800-802` vs `src/pages/AdminEncerramentos.tsx:25-29` — Dashboard define "no ritmo" como `count >= min(2, 12 − total_completed)`; Membros e Encerramentos usam `>= 2` estrito — impacto: o card "Membros com 2+ sessões" (L137) leva para `?filter=on_track`, cuja lista tem tamanho diferente do número exibido; membro na 12ª sessão é "no ritmo" no Dashboard e "Parcial" no Kanban — correção: extrair `getMonthlyPace(member, monthKey)` para `src/lib` e usar nos três lugares.

- [SEVERIDADE: médio] `src/pages/AdminDashboard.tsx:49-51, 82-83, 134` — base da meta é "Begin ativos **hoje**" para qualquer mês; label "Membros Begin ativos nesse mês"/hint "Ativos nesse mês" — impacto: para meses passados/futuros a meta (`ativos × 2 × 0,9`) inclui quem ainda não começou (`program_start_date` posterior) ou já encerrou (`program_end_date` anterior); membros inativados hoje somem de meses passados em que estavam ativos — correção: filtrar por `program_start_date <= fim do mês && (program_end_date == null || >= início do mês)` ou renomear o label para "Membros Begin ativos (hoje)".

- [SEVERIDADE: médio] `src/pages/AdminDashboard.tsx:61-62` — `remaining = 12 − m.total_completed` usa o total **incluindo** o mês filtrado — impacto: membro com 10 realizadas antes do mês e 2 no mês tem `remaining=0 → target=0 → onTrack` mesmo que o filtro seja um mês anterior à conclusão; para meses passados a meta individual é retroativamente zerada — correção: calcular `completedBefore = Σ monthly_counts[k] for k < filterKey`.

**Timezone**

- [SEVERIDADE: baixo] `src/lib/bookingStatus.ts:24` (usado em `useAdminData.tsx` L167-175, 333-335) — `new Date(\`${date}T${time}\`)` é interpretado no fuso do **navegador**; o servidor (`dispatch_report_nudges`) usa `now()` sem tz — impacto: admin fora do Brasil vê sessões de hoje mudando de "agendada" para "aguardando relatório" em horário diferente do membro/mentor — correção: fixar `America/Sao_Paulo` (ex.: `date-fns-tz`) na regra única.

- [SEVERIDADE: baixo] `src/hooks/useAdminData.tsx:179, 185, 344, 349, 354, 363` — chave mensal por `scheduled_date.substring(0,7)` (correto, string DATE) — ok; registra-se apenas que nenhuma métrica usa `completed_at`/`created_at`, logo sessões retroativas lançadas hoje para meses passados alteram metas já fechadas sem trilha. Sugestão: mostrar badge "retroativa" nas contagens ou congelar meses fechados.

**Inativos / guests / duplicação / divisão**

- [SEVERIDADE: médio] `src/hooks/useAdminData.tsx:329-340` — `mBookings` inclui bookings de membros inativos e `guest_name` (`liberty_id` null, permitido desde 20260507191837); `uniqueMembers` inclui `null` — impacto: `members_served` conta +1 fantasma quando há qualquer guest — correção: `.filter(b => b.liberty_id)` antes do `Set`, ou contar guests separadamente.

- [SEVERIDADE: baixo] `src/hooks/useAdminData.tsx:88-91` — `.in("member_tier", ["begin","liberty"])` exclui perfis com `member_tier` null — impacto: membro importado sem tier some de todas as métricas (nem aparece em "Encerrados") — correção: `.or("member_tier.is.null,member_tier.in.(begin,liberty)")` e tratar null como `begin` (já feito em L211).

- [SEVERIDADE: baixo] `src/pages/AdminDashboard.tsx:93` — divisão guardada (`goalSessions > 0`), sem NaN; `Math.round` no percentual e `Math.ceil` na meta (L90) são consistentes. `AdminEncerramentos` não divide. `useAdminData` não tem joins 1:N (só `sessions` e `mentor` many-to-one) — sem duplicação por join. Registro apenas para completude.

- [SEVERIDADE: baixo] `src/hooks/useAdminData.tsx:233-234, 401-402` — caminho demo: `completed` estrito e `scheduled = isScheduledSessionBooking` (inclui awaiting), diferente do caminho real (L168-170); `monthly_counts: {}` — impacto: com demo ligado, membros demo sempre "Sem sessão" em modo mês e infla `beginMembers.length` da meta — correção: reaproveitar o mesmo mapeador para dados reais e demo.

---

## Encerramentos

- [SEVERIDADE: alto] `src/pages/AdminEncerramentos.tsx:176, 25-29` — `memberPace(m, key)` avalia o ritmo pelo **mês da coluna** (mês de término), não pelo mês atual — impacto: em qualquer coluna futura (`monthly_counts[key]` vazio) todos os cards ficam vermelhos "Sem sessão", e em colunas passadas mostram o ritmo do mês de término, não a situação atual; o Kanban perde a função de alerta — correção: `memberPace(m, currentMonthKey)` ou mostrar "Faltam N sessões em M meses" (`(12 − total_completed)` vs meses até `program_end_date`).

- [SEVERIDADE: alto] `src/pages/AdminEncerramentos.tsx:53-61` vs `src/lib/sessionProgress.ts:18` — a regra de "encerrando" é exclusivamente `program_end_date`; não há cruzamento com as 12 sessões — impacto: membro com 12/12 realizadas e `program_end_date` daqui a 3 meses continua no planejamento; membro com `program_end_date` já passada e 7/12 não é sinalizado como atrasado; nenhuma coluna "Concluiu a jornada" — correção: derivar `journeyComplete = total_completed >= 12` e `overdue = end < hoje && !journeyComplete` e destacar/segregar.

- [SEVERIDADE: médio] `supabase/migrations/20260720181011_f6b1e2ba-1501-4a67-8437-f2e52db65e5b.sql:83-101` — não existe recompensa pela 12ª sessão/jornada completa; o único gatilho dá 10 pontos por **status bruto** `completed` (inclusive Onboarding order=0, retroativos e sessões sem relatório), contradizendo o nudge "Sem o relatório, a sessão não conta como realizada" (20260830144233 L120-123) — impacto: ranking premia sessões que o sistema diz não contar; "recompensa após 12ª" citada no escopo não está implementada — correção: condicionar pontos a `report_required = false OR EXISTS booking_reports` (ou mover para trigger em `booking_reports`) e adicionar bônus `journey_completed` quando o membro atingir 12 sessões distintas de jornada.

- [SEVERIDADE: médio] `src/pages/AdminEncerramentos.tsx:54, 87-108` — `missing` inclui quem tem início e não tem fim, mas não sugere término (`MemberTimeline.tsx:52-54` já projeta `início + 6 meses` mantendo 2/mês); `saveDates` não valida `end >= start` nem data de fim anterior à última sessão realizada — correção: pré-preencher `end` com a projeção e validar.

- [SEVERIDADE: baixo] `src/pages/AdminEncerramentos.tsx:35` — `now` criado a cada render (fora de `useMemo`); `anchor` é estado local e reseta ao sair da página; a página ignora `AdminFilterContext` embora esteja envolta pelo provider (`App.tsx:131`) — correção: derivar `anchor` inicial de `selectedMonth` do contexto.

---

## Lógica

- [SEVERIDADE: alto] `src/App.tsx:129-146` — `AdminFilterProvider` é instanciado **por rota**; `AdminFilterContext.tsx:28-29` inicializa `mode="month"` e mês atual em cada mount — impacto: o admin escolhe "Março" no Dashboard, clica no card (`/admin/membros?filter=on_track`) e a lista abre no mês atual com o filtro `on_track` aplicado ao mês errado; navegação Dashboard ↔ Financeiro ↔ Mentores reseta o período sempre — correção: mover o provider para envolver o conjunto de rotas admin (ou persistir em `sessionStorage`/query string `?month=`).

- [SEVERIDADE: alto] `src/hooks/useAdminData.tsx:438` (`admin-stats`), `:280` (`admin-mentors`), `src/pages/AdminRelatorios.tsx:16` (`admin-bookings-all`) — nenhuma mutação de booking invalida essas chaves (grep: `MemberSessionEditor.tsx:118/135/171`, `MentorRelatorio.tsx:256`, `AdminMembros.tsx` só invalidam `admin-members`); com `refetchOnMount:false` e `staleTime:60s` (`App.tsx:61-65`) — impacto: admin edita/exclui uma sessão em Membros e abre Financeiro/Mentores/Relatórios com totais antigos por até 60s, sem indicação — correção: invalidar `["admin-mentors"]`, `["admin-stats"]`, `["admin-bookings-all"]` junto com `["admin-members"]` (helper `invalidateAdminData(qc)`), ou unificar bookings numa única query `["admin-bookings"]` da qual membros/mentores derivam.

- [SEVERIDADE: alto] `src/hooks/useAdminData.tsx:105-111, 113-122` — `staffRoles`/`mentorSessionsRes`/`availabilityRes`/`mentorBookingsRes` ignoram `error` — impacto: se `user_roles` falhar (RLS, rede), mentores/admins com `member_tier` preenchido passam a ser contados como **membros** silenciosamente, inflando "Membros Begin ativos" e a meta — correção: `if (error) throw error` (o `useQuery` já propaga) ou ao menos `console.error` + toast.

- [SEVERIDADE: médio] `src/hooks/useAdminData.tsx:306-308` — `allSessions` sem tratamento de erro → `kickoffSessionIds`/`unpaidSessionIds` vazios — impacto: repasse 2× do Mapeamento desaparece e Onboarding passa a ser pago no Financeiro, sem erro visível — correção: propagar erro.

- [SEVERIDADE: médio] `src/hooks/useAdminData.tsx:447-490` e `src/pages/AdminDashboard.tsx:416-421, 432, 443` — cinco chamadas destruturam `{ data }` sem `error`; `.single()` (L489) gera erro quando não há linha — impacto: zeros/fallbacks silenciosos — correção: checar `error`.

- [SEVERIDADE: médio] `src/pages/AdminDashboard.tsx:32, 39` — `useAdminStats` é chamado só para `stats.sessionValue` (L119), que **não é usado**; ainda assim `statsLoading` bloqueia o `isLoading` do painel inteiro — impacto: 5 queries e o primeiro paint atrasado por dados descartados — correção: remover `useAdminStats` do Dashboard.

- [SEVERIDADE: médio] `src/pages/AdminDashboard.tsx:427-446` — cadeia de 3 queries dependentes (`tasks → bookings → profiles`) com `queryKey` contendo arrays de IDs completos e `.in("id", bookingIds)` sem chunk — impacto: URL do PostgREST estoura com centenas de tarefas; chave gigante — correção: buscar `session_tasks(*, bookings(liberty_id, profiles(full_name)))` numa única query.

- [SEVERIDADE: baixo] `src/pages/AdminRelatorios.tsx:20` — `sessions(name, order)` sem aspas (em `useAdminData.tsx:131` usa `\"order\"`); L21 `.order()` no servidor e L23 `sortByScheduledDateDesc` no cliente (ordenação dupla); L108 "Ajuste a busca ou o filtro de período" mas a página não tem filtro de período nem usa `AdminMonthFilter` — correção: adicionar o filtro ou ajustar a mensagem.

- [SEVERIDADE: baixo] `src/components/AdminMonthFilter.tsx:22, 38` — setas mudam para `mode="month"` e navegam sem limite (permite ir para 2030) — correção: limitar a `[primeiro booking, mês atual + 1]` e adicionar "Mês atual".

---

## UX/Consistência visual

- [SEVERIDADE: médio] `src/pages/AdminDashboard.tsx:135-136` — em modo "Visão geral", "Sessões Begin (total)" e "Realizadas total (Begin)" mostram o **mesmo valor** (`completedCount`) com ícones/cores diferentes — correção: no overview trocar o card de meta por "Aguardando relatório" ou "Agendadas".

- [SEVERIDADE: médio] `src/pages/AdminDashboard.tsx:181-185` vs `:191` — skeleton usa `grid-cols-2 lg:grid-cols-3` com 6 blocos de `h-24`; o grid real é `lg:grid-cols-6` com spans 2/3 e altura maior — impacto: layout shift ao carregar — correção: espelhar spans no skeleton.

- [SEVERIDADE: médio] `src/pages/AdminEncerramentos.tsx:144` — loading é texto "Carregando…" enquanto Dashboard/Relatórios usam skeleton `glass-card animate-pulse`; L153-155 colunas `bg-card/50 rounded-xl border` em vez de `glass-card` — correção: padronizar skeleton e container.

- [SEVERIDADE: baixo] Tokens de cor inconsistentes: `AdminEncerramentos.tsx:231-233` usa `amber-500` cru; `AdminMembros.tsx:929` `text-amber-400`; Dashboard usa `status-yellow`/`destructive` — correção: usar só tokens `status-*`.

- [SEVERIDADE: baixo] Terminologia: "Realizadas" (Dashboard L136) vs hint "Sessões concluídas" (L143) vs "Completos" (L352) vs "Jornada completa" (L137); "Visão Geral" (`AdminMonthFilter.tsx:18`) vs "Visão geral" (`AdminDashboard.tsx:175`); L174 `capitalize` transforma em "Visão Geral · Todos Os Períodos" — correção: glossário único (`realizada / agendada / aguardando relatório`) e remover `capitalize` do subtítulo.

- [SEVERIDADE: baixo] `src/pages/AdminDashboard.tsx:137` — label "Membros com 2+ sessões" mas a contagem usa `min(2, restantes)` (L62) — label mente para quem está na 11ª/12ª — correção: "Membros no ritmo" + tooltip explicando a regra.

- [SEVERIDADE: baixo] `src/pages/AdminDashboard.tsx:230-283` — gauge com `flex items-center gap-5` e grid `grid-cols-3` de texto `text-[9px]` não empilha no mobile; cards `text-[10px]/[11px]` abaixo do mínimo legível — correção: `flex-col sm:flex-row`, mínimo 11-12px.

- [SEVERIDADE: baixo] `src/components/AdminMonthFilter.tsx:21-26, 37-42` — botões só com ícone sem `aria-label`; `min-w-[160px]` estoura em 320px — correção: `aria-label="Mês anterior/próximo"`, `min-w-0`.

- [SEVERIDADE: baixo] `src/components/ui/chart.tsx:210` — `{item.value && …}` esconde valores `0` no tooltip; não há empty state/legenda padrão; gráficos do app (`MemberTimeline.tsx:7`, `DiagnosticRadar.tsx:10`) usam recharts direto sem este wrapper — impacto: tooltips inconsistentes entre gráficos — correção: `item.value !== undefined` e adotar `ChartContainer` ou removê-lo.

- [SEVERIDADE: baixo] Textos em inglês apenas em comentários/nomes internos (`useAdminData.tsx:86, 95-97, 128, 135, 161`, `AdminEncerramentos.tsx:40, 63, 70`); UI está em PT-BR — ok, registro para completude.

---

## Performance/Qualidade

- [SEVERIDADE: crítico] `src/hooks/useAdminData.tsx:129-131, 322-324, 468-472, 479-481` e `src/pages/AdminRelatorios.tsx:18-21` — cinco leituras de `bookings` **inteira** sem `.range()`/paginação; `supabase/config.toml` não define `max_rows`, então vale o padrão PostgREST de **1000 linhas** — impacto: a partir do 1001º booking os totais de membros, mentores, financeiro e relatórios ficam silenciosamente errados (linhas mais antigas ou mais novas somem conforme a ordem); além disso, um dashboard dispara ~10 requisições e refaz toda a agregação no cliente — correção: (1) uma única query compartilhada `["admin-bookings"]` com paginação por `range` até esgotar, ou (2) mover agregações para uma VIEW/RPC (`admin_member_progress`, `admin_mentor_stats`) que já aplique a regra única server-side.

- [SEVERIDADE: alto] `src/hooks/useAdminData.tsx:113-117` — `.in("mentor_id", candidateProfileIds)` com **todos** os perfis (sem chunk, ao contrário de L146) — impacto: URL > 8 KB com ~200 membros → erro 414/400 e, como o erro é ignorado (achado acima), staff vira membro — correção: inverter a lógica (buscar `mentor_id` distintos de `bookings`/`mentor_sessions` e intersectar no cliente) ou usar `chunkArray`.

- [SEVERIDADE: médio] `src/hooks/useAdminData.tsx:139-153` — `memberProfileIds.includes` dentro de `filter` é O(n·m); `for…of chunkArray(...)` executa chunks **sequencialmente** (N/40 round-trips) — correção: `Set` + `Promise.all` dos chunks; ou `session_tasks.select("booking_id,is_completed").eq("is_completed", false)`.

- [SEVERIDADE: médio] `src/hooks/useAdminData.tsx:435-514` — todas as saídas exceto `sessionValue` são código morto (grep em `src/pages`: só `stats?.sessionValue`), mas custam 5 queries em Dashboard, Financeiro e Mentores — correção: reduzir `useAdminStats` a `useSessionValue()` (uma query em `system_config`).

- [SEVERIDADE: médio] `src/pages/AdminDashboard.tsx:119, 126-127, 51` — `sessionValue`, `brl` e o alias `monthMembers = beginMembers` não são usados/necessários; `src/components/ui/chart.tsx` não tem nenhum consumidor (código morto de 303 linhas) — correção: remover.

- [SEVERIDADE: médio] `src/hooks/useAdminData.tsx:147` — `(supabase as any).from("session_tasks")` embora `session_tasks` exista em `types.ts:1012`; `any` em L99, 101, 110, 119-121, 125, 140-142, 145, 154, 189, 209, 211, 223, 225, 235, 256, 288, 311, 317, 338, 359-360, 378, 393-394; `AdminEncerramentos.tsx:25, 103`; `AdminDashboard.tsx:422`; `AdminRelatorios.tsx:32, 72` — impacto: `b.scheduled_date.substring` (L179) quebra em runtime se `scheduled_date` vier null sem o TS avisar — correção: tipar com `Tables<"bookings"> & { sessions: … }` e usar `Database["public"]["Tables"]["profiles"]["Row"]`.

- [SEVERIDADE: baixo] `src/hooks/useAdminData.tsx:38 vs 63` — `total_scheduled` em `MemberWithProgress` (só jornada, futuro) e em `MentorWithStats` (todas as sessões, futuro) têm o mesmo nome e semânticas diferentes — correção: renomear para `journey_scheduled` / documentar no JSDoc.

- [SEVERIDADE: baixo] `src/hooks/useAdminData.tsx:7` — `isDemoOn()` lê `localStorage` a cada render e entra na `queryKey`; alterar o flag em outra aba não dispara refetch — correção: hook `useDemoFlag` com listener `storage`.

- [SEVERIDADE: baixo] `src/components/ui/chart.tsx:62, 170` — `[_, config]` faz shadow do parâmetro `config`; `key={item.dataKey}` pode ser `undefined`/duplicado — correção: renomear e usar `index` como fallback de `key`.

---

**Resumo executivo (ordem de correção sugerida):** (1) consultar `booking_reports` no admin e passar `hasReport`; (2) unificar "realizada/aguardando" entre `useMembers`, `useMentors` e Financeiro usando os helpers de `bookingStatus.ts`; (3) contar progresso de jornada com `buildSessionProgress` (dedupe + cap 12); (4) uma única query paginada de `bookings` (ou VIEW/RPC) e invalidação conjunta das chaves admin; (5) subir `AdminFilterProvider` para o nível das rotas admin; (6) corrigir `memberPace` no Kanban e cruzar `program_end_date` com as 12 sessões; (7) apagar `useAdminStats` (exceto `sessionValue`) e `chart.tsx`.