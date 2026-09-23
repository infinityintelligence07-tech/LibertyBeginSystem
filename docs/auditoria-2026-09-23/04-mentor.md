# Auditoria — módulo Mentor (Liberty Begin)

Contexto verificado antes dos achados: `App.tsx:57-69` configura o `QueryClient` global com `staleTime: 60_000`, `refetchOnMount: false`, `refetchOnWindowFocus: false`. Isso torna qualquer falha de invalidação de cache um bug visível (a tela não se recupera sozinha ao navegar). A rota `/mentor/alunos/:id` renderiza `AdminMembroDetalhesPage` (`App.tsx:118`), e é lá que está o card do print do cliente.

---

## Cruzamento de dados

- [SEVERIDADE: crítico] `src/components/MemberTimeline.tsx:427-433` (renderizado em `src/pages/AdminMembroDetalhes.tsx:367-375`, rota `/mentor/alunos/:id`) — É este o card do print ("Sessão 10 · Mapeamento do Negócio · Status Agendada · Preencher relatório"). O botão é exibido sempre que `reportRoute` existe e `openReport?.summary` é falsy, sem verificar (a) se a sessão já ocorreu, (b) se `report_required` é `false` (kickoff), (c) se o status é `pending_approval`/`not_realized`. — Mentor vê "Preencher relatório" em sessão futura e em Mapeamento, que por regra não exige relatório. — Condicionar a `isAwaitingReport(booking, hasReport)` e a `bookingRequiresReport(booking)`; para sessão agendada mostrar apenas o status.

- [SEVERIDADE: crítico] `src/pages/AdminMembroDetalhes.tsx:159-162` + `src/components/MemberTimeline.tsx:11-18,74` — A query de bookings seleciona `id, session_id, mentor_id, scheduled_date, start_time, end_time, status` e **não traz `report_required` nem `is_retroactive`**; a interface `Booking` da timeline também não os declara. `getEffectiveBookingStatus` recebe `report_required = undefined` → `requiresReport()` retorna `true` para tudo. — Um Mapeamento já realizado fica eternamente como "Realizada · aguardando relatório" (`:154`) e nunca conta como `completed`; o hint "Realizadas · com relatório enviado" (`:370`) mente para kickoff. — Adicionar `report_required, is_retroactive` ao `select` e ao tipo `Booking`.

- [SEVERIDADE: alto] `src/components/MemberTimeline.tsx:144,162-167,314,346-348,401,415-420` — O número da "Sessão N" e o rótulo/estrela "Kickoff" são derivados da **posição cronológica** (`chronological[i]`, `isKickoff = s.index === 1`), não da `order` da sessão nem da flag `is_kickoff`. — Se o Mapeamento foi agendado depois de outras sessões (caso do print: "Sessão 10 · Mapeamento"), a sessão errada recebe o callout "Kickoff — Sessão de 3h" e o Mapeamento aparece como sessão 10, contradizendo o texto fixo em `:391` ("Sessão 1 é o Mapeamento"). — Usar `order`/`is_kickoff` da tabela `sessions` (ou `isKickoffSessionName`) para o rótulo; numerar pelo `order` da sessão, não pelo índice do array.

- [SEVERIDADE: alto] `src/pages/MentorDashboard.tsx:136-148` (`allTimeBookings`), `:774-786` (`MentorResultsSection`) — Os `select` listam colunas explícitas **sem `report_required`/`is_retroactive`**, enquanto `allMentorBookings` (`:48-53`) usa `select("*")`. `getEffectiveBookingStatus` em `:230,273,307,783` trata Mapeamento passado como `awaiting_report`, não `completed`. — "Acumulado no programa" (`:229-231`) exclui o Mapeamento (2× honorário!) que o "Faturamento no mês" (`:227`) inclui → acumulado pode ser menor que o mensal; `companiesImpacted`, `completedCount` de alunos ativos e `closingSoon` também subcontam. — Reaproveitar `allMentorBookings` (já é a lista completa) e remover as duas queries duplicadas; se mantiver, incluir as colunas.

- [SEVERIDADE: alto] `src/pages/MentorDashboard.tsx:224` vs `src/hooks/useAdminData.tsx:305-313` — O mentor calcula honorário com `sessionFee(rate, { session_name })` e a query de `sessions` (`:79-83`) traz só `id, name`; o admin detecta kickoff por `is_kickoff` **ou** `duration_minutes >= 180` **ou** nome. — Se a sessão for marcada `is_kickoff=true` mas tiver nome diferente de "Mapeamento do Negócio", o mentor vê 1× e o AdminFinanceiro vê 2×. — Selecionar `is_kickoff, duration_minutes` em `dash-sessions` e passar os três campos para `sessionFee`. (Obs.: `AdminFinanceiro.tsx:41` também usa só `session_name` no detalhe expandido, divergindo das linhas de resumo `:102-118` da própria tela.)

- [SEVERIDADE: alto] `src/pages/MentorDashboard.tsx:228` vs `src/pages/AdminFinanceiro.tsx:100,118` — "Previsto no mês" do mentor = `completed + scheduled`; o admin projeta `completed + scheduled + awaiting_report`. — Mentor com sessões passadas sem relatório vê previsão menor que o financeiro do admin. — Incluir `awaiting_report` em `projectedThisPeriod` (ou documentar que só "pagas" entram).

- [SEVERIDADE: alto] `src/pages/MentorAlunos.tsx:133-134,155` — `completed` usa `=== "completed"` (exclui `awaiting_report`) e `scheduled` usa `isScheduledSessionBooking` (que **inclui** `awaiting_report`). Isso viola a regra única `isRealizedSessionBooking` usada em `useAdminData.tsx:168` e `AdminMembroDetalhes.tsx:208-210`. — Sessão passada sem relatório aparece como "agendada" no card (`:276-279`) e não conta para `isGraduated`; aluno com 12 sessões (uma aguardando relatório) fica em "Ativos" no mentor e "Concluído" no admin. — Trocar para `isRealizedSessionBooking` / `isFutureScheduledBooking`.

- [SEVERIDADE: alto] `src/pages/MentorAlunos.tsx:155` vs `src/lib/sessionProgress.ts:24-46` — `isGraduated: completed >= 12` conta bookings brutos (inclui Onboarding `order 0`, inclui repetição da mesma sessão) em vez de `buildSessionProgress(...).completedCount`. — Contagem de jornada diverge de todas as outras telas. — Usar `buildSessionProgress(sessions, libertyBookings)`.

- [SEVERIDADE: alto] `src/pages/MentorAlunos.tsx:22-45` — A tela carrega **todos** os perfis `begin/liberty` e **todos** os bookings da plataforma sem filtro por `mentor_id` (comentário em `:35` diz que é intencional). — Mentor vê alunos, agenda e progresso de outros mentores; contradiz o Dashboard, que só mostra "seus" alunos (`:167-172`). Se a RLS permitir, é decisão de produto que precisa ser confirmada; se não permitir, a lista vem vazia/parcial sem erro (a query em `:38-43` ignora `error`). — Decidir explicitamente: filtrar por `mentor_id` ou manter e rotular a tela como "Base completa".

- [SEVERIDADE: alto] `src/pages/MentorAlunos.tsx:130-158,168-170` vs `src/pages/MentorDashboard.tsx:317-319` — Dashboard exclui `is_active === false`; MentorAlunos ignora `is_active`. — Membro inativado aparece em "Ativos (N)" no mentor. — Filtrar `is_active !== false` (ou mostrar badge "Inativo").

- [SEVERIDADE: alto] `src/pages/MentorSessoes.tsx:181,193` vs `:170-174` — A aba "Realizadas (N)" conta só `completed`, mas a lista da aba inclui `awaiting_report`. — Aba mostra "Realizadas (3)" com 5 cards. — Contar com o mesmo predicado da lista.

- [SEVERIDADE: alto] `src/pages/MentorDashboard.tsx:210,214-217` vs `src/pages/MentorSessoes.tsx:188` — "Relatórios pendentes" no Dashboard é do mês selecionado (via `bookingsAll` mensal); na Agenda é de todos os meses. Clique no card leva a `/mentor/sessoes?tab=completed` (`:236,548`) que abre no **mês atual**, não no mês selecionado no Dashboard. — Números diferentes para o mesmo conceito; navegação perde o contexto de mês. — Unificar (sempre all-time) e passar `?month=YYYY-MM` na navegação, ou criar aba "Sem relatório".

- [SEVERIDADE: médio] `src/pages/MentorDashboard.tsx:210,690-763` — "Sessões realizadas" (stat e lista) usa só `completed`; a regra da plataforma (`bookingStatus.ts:69-77`) diz que realizada = `completed OU awaiting_report`. Admin (`useAdminData.tsx:168`) segue a regra; o mentor não. — Aluno com sessão ontem sem relatório: admin vê 1 realizada, mentor vê 0. — Usar `isRealizedSessionBooking` e sinalizar "Sem relatório" no card (já existe o badge em `:733-737`).

- [SEVERIDADE: médio] `src/pages/MentorSessoes.tsx:56-71,157-162,165` — Comentário em `:60-62` diz que "Próximas mostra tudo, inclusive meses seguintes", mas `filtered` aplica `monthBookings` a todas as abas. — Mentor abre a Agenda em setembro, sessão em outubro não aparece; vê "Nenhuma sessão neste período" na aba padrão. — Aba "Confirmadas" sem filtro de mês (ou corrigir o comentário e adicionar hint).

- [SEVERIDADE: médio] `src/pages/MentorDashboard.tsx:302-336`, `src/pages/MentorAlunos.tsx:130-158` — Agrupamento por `profiles.id`; nenhuma deduplicação por `user_id`/`email`. — Perfis duplicados aparecem como dois alunos com progresso dividido. — Deduplicar por `user_id` (ou garantir unicidade no banco).

- [SEVERIDADE: médio] `src/lib/bookingStatus.ts:21-26` — `new Date(\`${date}T${time}\`)` interpreta no fuso do navegador. — Mentor em fuso diferente do aluno/servidor vê "aguardando relatório" horas antes/depois; horário de verão idem. — Fixar o fuso do programa (ex.: `America/Sao_Paulo`) com `date-fns-tz`.

- [SEVERIDADE: baixo] `src/pages/MentorDashboard.tsx:255-259` — `b.scheduled_date >= todayISO` é redundante com `getEffectiveBookingStatus === "scheduled"` (que já exige não-passado). — Sem impacto funcional; confunde manutenção. — Remover a condição extra.

---

## Lógica

- [SEVERIDADE: crítico] `src/pages/MentorRelatorio.tsx:253-258` → afeta `src/pages/MentorSessoes.tsx:114-126` e `src/pages/MentorDashboard.tsx:86-95,43-56,136-148` — Ao salvar relatório invalida apenas `["booking-report"]`, `["mentor-bookings"]`, `["admin-members"]`. Não invalida `["booking-reports-check-by-mentor"]`, `["dash-reports"]`, `["mentor-dash-bookings"]`, `["mentor-all-bookings"]`, `["mentor-action-banner"]`. Com `refetchOnMount:false`, voltar à Agenda mantém "Preencher relatório" e "N relatórios pendentes"; o Dashboard mantém o alerta amarelo. `useBookingsRealtime` (`MentorSessoes.tsx:39`) só escuta `bookings` e só enquanto a página está montada. — Mentor acha que o salvamento falhou e preenche de novo. — Invalidar por prefixo os keys acima (ou padronizar um único prefixo `["mentor", ...]`).

- [SEVERIDADE: alto] `src/pages/MentorSessoes.tsx:211,226,243,261` — `markNotRealized`, `approveBooking`, `rejectBooking`, `cancelBooking` invalidam só `["mentor-bookings"]`. — Dashboard (`mentor-dash-bookings`, `mentor-all-bookings`, `mentor-results-bookings`) e `MentorAlunos` (`mentor-alunos-all-bookings`) ficam com status antigo até o GC de 10 min. — Idem acima.

- [SEVERIDADE: alto] `src/components/mentor/MentorActionBanner.tsx:93-122` — (a) `approve` grava `status: "scheduled"` sem `approval_required: false` (a Agenda grava em `MentorSessoes.tsx:220`); (b) `reject` cancela sem pedir motivo e sem liberar `mentor_availability.is_booked` (a Agenda libera em `:239-241`); (c) se `related_booking_id` for `null`, pula o update mas ainda mostra `toast.success("Sessão confirmada.")` (`:113`); (d) nenhuma invalidação de `mentor-bookings`/`mentor-dash-bookings`. — Duas rotas de aprovação com efeitos diferentes; horário fica "ocupado" após recusa; feedback falso. — Extrair `approveBooking/rejectBooking` para um hook compartilhado e reutilizar nos dois lugares.

- [SEVERIDADE: alto] `src/pages/MentorDashboard.tsx:48-53,71-73,81-82,91-92,102-107,141-145,156-160,177-181,191-192,201-202` e `src/pages/MentorAlunos.tsx:39-43,80-81,92-93,103-104,114-119` — Todas as queries fazem `const { data } = ...; return data || []` ignorando `error`. — Falha de RLS/rede vira "0 sessões, R$ 0,00, nenhum membro" sem nenhum aviso; nem `isError` do react-query dispara. — `if (error) throw error;` (como já feito em `MentorSessoes.tsx:67`).

- [SEVERIDADE: alto] `src/pages/MentorSessoes.tsx:343-344` — `canMarkNotRealized` usa status bruto e permite "Marcar como não realizada" em sessão **futura**. — Mentor pode registrar falta de sessão que ainda vai acontecer. — Exigir `isBookingPast(booking)` (ou `effectiveStatus === "awaiting_report"`).

- [SEVERIDADE: alto] `src/pages/MentorSessoes.tsx:199-212` — `markNotRealized` altera status via `window.prompt` sem `confirm`; string vazia passa. Toast diz "Administrador foi notificado" mas não há insert em `notifications` no cliente (depende de trigger não verificado aqui). — Ação irreversível na UI com um clique acidental; promessa de notificação sem garantia. — Dialog de confirmação (shadcn `AlertDialog`) com motivo obrigatório; confirmar existência do trigger.

- [SEVERIDADE: médio] `src/pages/MentorSessoes.tsx:240,258` — Update de `mentor_availability` sem checar `error`. `:225` e `MentorActionBanner.tsx:109-111` — `google-calendar-sync` com `.catch(() => {})`. — Horário fica preso; falha de sincronização de agenda passa em silêncio. — Ao menos `console.error`/toast de aviso.

- [SEVERIDADE: médio] `src/pages/MentorDashboard.tsx` — não há `isLoading` em nenhuma query; a tela renderiza "0", "R$ 0,00", "Você já impactou 0 empresas" (`:500-504`) antes dos dados. `src/pages/MentorAlunos.tsx:229-236` — renderiza `EmptyState` "Nenhum membro ativo no momento" enquanto carrega. — Flash de estado vazio falso. — Skeleton/spinner enquanto `isLoading`.

- [SEVERIDADE: médio] `src/components/AdminMemberNote.tsx:22-24` — `save` compara com `initialNote` (prop), não com o último valor salvo. Invalida `["admin-members"]`, mas `AdminMembroDetalhes` mantém `profile` em `useState` (`:125,158`) e não refaz a busca. — Após salvar "A" e voltar para o texto original, a segunda gravação é ignorada; ao recarregar a página o texto volta. — Guardar `lastSaved` em ref; chamar callback `onSaved` para o pai atualizar `profile`.

- [SEVERIDADE: médio] `src/components/MemberProfilePanel.tsx:24-27` — `Section` checa `arr.some(Boolean)` sobre **elementos React** (`<Field .../>` é sempre truthy mesmo quando `Field` retorna `null`). — Cabeçalhos "Saúde financeira", "Programa" aparecem vazios. — Filtrar pelos `value` antes de renderizar (passar array de campos, não children).

- [SEVERIDADE: médio] `src/components/mentor/MentorActionBanner.tsx:36` — usa `isDemoOn()` (localStorage) enquanto as páginas usam `useDemoData()` (contexto). — Alternar demo não re-renderiza o banner até remount. — Usar o contexto.

- [SEVERIDADE: médio] `src/pages/MentorSessoes.tsx:41-45` — `useEffect` com `eslint-disable exhaustive-deps` e `activeTab` fora dos deps. Funciona hoje, mas mascara o padrão correto (derivar `activeTab` diretamente de `searchParams`). — Estado duplicado (URL + `useState`). — `const activeTab = (searchParams.get("tab") as TabKey) || "upcoming"`.

- [SEVERIDADE: baixo] `src/pages/MentorAlunos.tsx:124-127,130-158` — `profileMap`, `sessionMap`, `reportMap` recriados a cada render e `profileMap` está nos deps do `useMemo` → memo nunca reaproveita. — Recalcula sumários de toda a base a cada render. — `useMemo` nos mapas.

- [SEVERIDADE: baixo] `src/pages/MentorSessoes.tsx:414` e `src/pages/MentorDashboard.tsx:660` — `booking.start_time.slice(0,5)` sem null-guard (o tipo em `bookingStatus.ts:8` admite `null`). — Crash se algum booking vier sem horário. — `start_time?.slice(0,5) ?? "--:--"`.

---

## UX/Consistência visual

- [SEVERIDADE: alto] Labels distintos para o mesmo status:
  - `scheduled`: "Agendada" (`bookingStatus.ts:126`), "Confirmadas" (`MentorSessoes.tsx:191`), "Sessões agendadas" (`MentorDashboard.tsx:235`), "Próximas sessões agendadas" (`:636`).
  - `pending_approval`: "Aguardando confirmação" (`bookingStatus.ts:151`), "Aguardando aprovação" (`MentorSessoes.tsx:192`), "Pendente" (`MemberTimeline.tsx:156`), "Pendências" (`MentorActionBanner.tsx:159`).
  - `awaiting_report`: "Aguardando relatório" (badge), "Realizada · aguardando relatório" (`MemberTimeline.tsx:154`), "Sem relatório" (`MentorDashboard.tsx:735`), "Relatórios pendentes" (`:236`), "sem relatório" (`:597`).
  - `not_realized` cor: amarelo em `bookingStatus.ts:140-143`, `destructive` em `MemberTimeline.tsx:155`.
  — Mentor precisa aprender vocabulário por tela. — Centralizar em `bookingStatusConfig` e usar `StatusBadge` em todas.

- [SEVERIDADE: alto] `src/pages/MentorSessoes.tsx:362` — `className="dark glass-card ... bg-card text-card-foreground"` força tema escuro no card independentemente do tema global; Dashboard/Alunos usam `glass-card` sem `dark`. — Cards da Agenda destoam no tema claro. — Remover `dark`.

- [SEVERIDADE: médio] Botão primário sem componente único: `btn-silver` (`MentorSessoes.tsx:432,448`, `MemberTimeline.tsx:430`, `SendNpsButton.tsx:129`), `bg-primary/10 border-primary/15` (`MentorDashboard.tsx:672`), `bg-primary/10 border-primary/30` (`:938`), `bg-primary/10 border-primary/20 text-[11px] font-semibold` (`SendNpsButton.tsx:88`), link `text-primary hover:underline` (`MentorDashboard.tsx:619,741`), texto puro (`MentorActionBanner.tsx:212,228`). — Mesmo CTA "Preencher relatório" tem 4 aparências. — Usar `Button` do shadcn (`@/components/ui/button`, já importado em `AdminFinanceiro.tsx:13`) com variantes.

- [SEVERIDADE: médio] Botão destrutivo: `border-status-red/30 text-status-red` (`MentorSessoes.tsx:439,489`) vs `text-destructive` (`MentorActionBanner.tsx:220`) vs `bg-destructive/12` (`bookingStatus.ts:137`). — Dois tokens de vermelho. — Padronizar em `destructive`.

- [SEVERIDADE: médio] Container de lista: `glass-card` (Dashboard, Agenda, Alunos), `rounded-2xl border border-border bg-card/70` (`MentorClosingSoon.tsx:36`, `MemberTimeline.tsx:187`), `rounded-lg border border-border/60 bg-card/40 backdrop-blur-sm` (`MentorActionBanner.tsx:148`), `border border-status-yellow/30 bg-status-yellow/5 rounded-xl` (`MentorDashboard.tsx:594`). — Quatro "cards" diferentes na mesma página. — Definir 2 variantes (card, alert) e reutilizar.

- [SEVERIDADE: médio] Empty state: Agenda e Alunos usam `EmptyState`; Dashboard simplesmente esconde seções (`:632,690`) — mentor novo vê header + 3 stats zerados + financeiro e nada mais, sem orientação. `MentorActiveStudents.tsx:38-42` usa div própria. — Falta de "próximo passo" para mentor sem sessões. — `EmptyState` com ação ("Ver disponibilidade").

- [SEVERIDADE: médio] Loading: Dashboard nenhum; Agenda texto "Carregando sessões..." dentro de um `glass-card` que ocupa só uma coluna do grid `md:grid-cols-2` (`:328-331`); Alunos nenhum. — Layout quebrado durante load; sem skeleton. — Skeleton padrão.

- [SEVERIDADE: médio] `src/pages/MentorAlunos.tsx:271` — `hidden sm:flex` esconde "realizadas / agendadas / % tarefas" no mobile; sobra só nome e datas. — Informação principal da tela some no celular. — Mostrar em linha compacta abaixo do nome.

- [SEVERIDADE: médio] `src/pages/MentorSessoes.tsx:355-359,378-381` — Clicar em qualquer área do card navega para o relatório quando `needsReport`, mas não há affordance (cursor igual ao card expansível). Botão "Preencher relatório" e o card inteiro fazem a mesma coisa; o chevron faz outra. — Navegação inesperada ao tentar expandir tarefas. — Só o botão navega; card expande.

- [SEVERIDADE: médio] Confirmação inconsistente: `cancelBooking` = `confirm` + `prompt` (`MentorSessoes.tsx:247-249`); `rejectBooking`/`markNotRealized` = só `prompt`; `MentorActionBanner` recusa sem nada (`:100`). Todos com diálogos nativos do browser. — Experiência díspar e sem estilo do produto. — `AlertDialog` do shadcn em um componente `ConfirmBookingActionDialog`.

- [SEVERIDADE: baixo] Título de página: Dashboard tem eyebrow "Mentoria" + `h1 text-2xl` + 2 subtítulos (`:495-507`); Agenda e Alunos têm `h1 text-2xl` + 1 subtítulo (`MentorSessoes.tsx:268-269`, `MentorAlunos.tsx:181-184`). Seções internas: Dashboard `h2 text-lg` puro (`:636,692`); componentes `mentor/*` usam eyebrow colorido + `h2 text-lg` (`MentorClosingSoon.tsx:26-29`). — Hierarquia diferente por seção. — Componente `PageHeader`/`SectionHeader`.

- [SEVERIDADE: baixo] `src/components/mentor/MentorActiveStudents.tsx:70` — badge mostra enum bruto `begin`/`liberty` (componente hoje não renderizado). `MentorActionBanner.tsx:185` "limpar todas" em minúsculas, `:244` "Ok", `:162` caractere `▾` em vez de ícone. — Polimento. — Mapear label do tier; usar `ChevronDown`.

- [SEVERIDADE: baixo] `src/pages/MentorDashboard.tsx:241-243` — Saudação "Faça um bom dia, Mateus" (vs "Bom dia" em `MentorImpactBar.tsx:21-23`). — Se for voz de marca, ok; se não, soa estranho. — Confirmar com o cliente.

---

## Qualidade

- [SEVERIDADE: alto] Código morto em `src/pages/MentorDashboard.tsx`: `MemberHistoryPanel` (`:831-985`, 155 linhas, nunca usado); `followUpItems` (`:339-404`), `studentOfWeek` (`:407-433`), `milestones` (`:290-299`), `sessionsConducted`/`studentTasksCompleted` (`:283-288`) calculados e nunca renderizados; query `allTimeTasks` (`:152-163`) só alimenta esse código; query `notifications` + `markAllRead` + `unreadCount` (`:459-483`) mortos (comentário `:629` confirma migração para `NotificationsBell`); `uniqueLiberties` (`:217`); `(s as any).to` (`:547`) nunca existe. Imports não usados: `Users, Clock, User, Bell, CheckCheck, History?` (History é usado no painel morto), `MentorActiveStudents`, `MentorFollowUp`, `MentorStudentOfWeek`. — Duas queries desnecessárias por carregamento; 400+ linhas de manutenção fantasma. — Remover ou renderizar.

- [SEVERIDADE: alto] Componentes nunca importados por nenhuma tela: `src/components/mentor/MentorImpactBar.tsx`, `src/components/MemberProfilePanel.tsx` (`MentorActiveStudents`, `MentorFollowUp`, `MentorStudentOfWeek` só são importados, não renderizados). — Peso no bundle e falsa sensação de feature existente. — Excluir ou reintegrar.

- [SEVERIDADE: médio] Queries duplicadas: `MentorDashboard.tsx:43-56`, `:136-148`, `:774-786` buscam a mesma tabela `bookings` com o mesmo `mentor_id` três vezes com colunas diferentes. `MentorAlunos.tsx:99-107` busca `booking_reports` de **todos** os bookings da plataforma via `.in()` (risco de URL longa) e `reportMap` (`:127`) nunca é usado; `sessionMap`/`sessionCoverMap` (`:125-126`) idem; `bookings` no sumário (`:148`) idem. — Custo de rede e RLS desnecessário. — Uma query de bookings compartilhada por hook `useMentorBookings`.

- [SEVERIDADE: médio] `any` explícito: `MentorDashboard.tsx:62,151,168,202,222,224-225,230,264,269,273,279,304,311,345-346,365,369,410,476,547,752`; `MentorAlunos.tsx:55-56,62,67,71,144-147`; `MentorSessoes.tsx:107,123,207,220,235,253,438,498`; `MemberProfilePanel.tsx:8,11,36`; `MentorFollowUp.tsx:18`; `MentorImpactBar.tsx:109`; `SendNpsButton.tsx:75`; `MemberTimeline.tsx:21,25,59,245`. — Perde exatamente os campos (`report_required`) cuja ausência causa os bugs acima. — Tipar com `Tables<"bookings">` de `integrations/supabase/types.ts`.

- [SEVERIDADE: médio] `src/components/MemberProfilePanel.tsx:120-122` — imports no fim do arquivo (viola a regra do workspace "imports no topo"); `CheckCircle2 as CheckMark` e `Calendar` poderiam estar no import de `:1-4`. — Lint/convenção. — Mover para o topo.

- [SEVERIDADE: médio] Acessibilidade: divs clicáveis sem `role="button"`/`tabIndex`/teclado em `MentorDashboard.tsx:703-706` e `MentorSessoes.tsx:364-367,378-381`; botões de navegação de mês sem `aria-label` (`MentorDashboard.tsx:526,532`, `MentorSessoes.tsx:275,281`); botão de nome desabilitado quando não há `liberty_id` mas com hover de link (`MentorDashboard.tsx:654-662`); `textarea` de `AdminMemberNote.tsx:48` sem `aria-label`; `SendNpsButton.tsx:84-91` depende só de `title`. Pontos positivos: `MentorSessoes.tsx:462` e `MentorActionBanner.tsx:149,155` têm `aria-*`. — Navegação por teclado incompleta. — Trocar divs por `<button>`, adicionar `aria-label`.

- [SEVERIDADE: baixo] Textos em inglês voltados ao usuário: nenhum relevante (apenas comentários de código e "Zoom"/"WhatsApp"). Dead branch `booking_approved` em `MentorActionBanner.tsx:135` (não está em `ACTION_TYPES`). `SendNpsButton.tsx:41` usa `document.execCommand` (deprecado). `MemberProfilePanel.tsx:111-112` labels "Desafio 2026"/"Sonho 2026" hardcoded (já estamos em set/2026). `MentorStudentOfWeek.tsx:42` "celebrar com ele" assume gênero. `MentorAlunos.tsx:15` `useAuth();` chamado sem uso do retorno. — Higiene. — Limpar.

---

## Inventário de componentes/classes por tela

| Conceito | MentorDashboard | MentorSessoes | MentorAlunos | Detalhe do aluno (`MemberTimeline` via `AdminMembroDetalhes`) | `mentor/*` (Banner, ClosingSoon, FollowUp, ActiveStudents, StudentOfWeek, ImpactBar) |
|---|---|---|---|---|---|
| Título de página | eyebrow `text-[10px] uppercase tracking-[0.14em]` + `h1 text-2xl font-semibold` + 2 `<p>` (`:495-507`) | `h1 text-2xl font-semibold` + `p text-sm` (`:268-269`) | `h1 text-2xl font-semibold` + `p text-sm` (`:181-184`) | `h1 text-base font-semibold truncate` (`AdminMembroDetalhes.tsx:302`) | `MentorImpactBar` repete o header do Dashboard (`:50-58`, não usado); seções usam eyebrow colorido + `h2 text-lg` |
| Card | `glass-card` (`:551,565,648,702`); alerta amarelo `border-status-yellow/30 bg-status-yellow/5 rounded-xl` (`:594`) | `dark glass-card bg-card text-card-foreground` (`:362`) | `glass-card` como `<button>` (`:246`) | `rounded-2xl border border-border bg-card/70` (`MemberTimeline.tsx:187`); interno `rounded-xl border-border/70 bg-background/30` (`:288`) | ClosingSoon `rounded-2xl border bg-card/70`; FollowUp `rounded-2xl border-status-yellow/20 bg-gradient`; StudentOfWeek `rounded-2xl border-status-green/25 bg-gradient`; ActiveStudents `glass-card`; Banner `rounded-lg border-border/60 bg-card/40 backdrop-blur-sm` |
| Botão primário | `text-xs px-2.5 py-1.5 rounded-lg bg-primary/10 border-primary/15 text-primary` (`:672`); `px-3 py-1.5 border-primary/30` (`:938`); link `text-xs text-primary hover:underline` (`:619,741`) | `btn-silver text-xs px-3 py-1.5` (`:432,448`) | — (card inteiro é o CTA) | `btn-silver w-full text-xs` (`MemberTimeline.tsx:430`); `SendNpsButton` `bg-primary/10 border-primary/20 text-[11px] font-semibold` (`:88`) e `btn-silver text-xs px-4 py-2` (`:129`) | Banner: texto `text-xs font-medium text-foreground hover:text-primary` (`:212,228`); FollowUp WhatsApp `bg-status-green/10 border-border text-status-green text-[10px]` (`:75`) |
| Botão secundário | `text-xs px-2.5 py-1.5 rounded-lg border border-border` (`:666`); `px-3 py-1.5 border-border/60 text-muted-foreground` (`:945`); toggle Mês/Geral `p-1 bg-muted/50 rounded-lg` (`:510-523`) | `text-xs px-3 py-1.5 border border-border/50 rounded-lg text-muted-foreground` (`:456`); destrutivo `border-status-red/30 text-status-red` (`:439,489`); `border-border text-muted-foreground` (`:499`) | toggles `p-1 bg-muted/50 rounded-lg` + `px-3 py-1`/`px-4 py-1.5` (`:197-210,214-227`) | — | Banner: `text-xs text-muted-foreground hover:text-destructive` (`:220`), `hover:text-foreground` (`:234,242`), `text-[11px]` "limpar todas" (`:184`); FollowUp "Perfil" `text-[10px] uppercase` (`:82`) |
| Badge de status | pill manual `text-[10px] px-2 py-0.5 rounded-full bg-status-yellow/15` "Sem relatório" (`:734`); pill tarefas `bg-muted` (`:729`) | `StatusBadge` (`:374,416`) — único uso correto | inline com ícones `text-[10px]` + `CheckCircle2`/`Calendar` (`:272-279`) | `statusMeta()` própria com labels e cores divergentes (`MemberTimeline.tsx:151-159`), chips manuais (`:369-388`) | ClosingSoon pill `text-[10px] uppercase px-2 py-1 rounded-full border` (`:50`); ActiveStudents tier pill `text-[9px] uppercase` (`:69`); Banner dot colorido `h-1.5 w-1.5` (`:199`) |
| Empty state | nenhum — seções ocultas via `length > 0 &&` (`:593,632,690`); painel morto tem `<p italic>` (`:876`) | `EmptyState` (`:333-338`) | `EmptyState` (`:231-235`) | placeholder `rounded-xl border-dashed ... p-6 text-center text-xs` (`MemberTimeline.tsx:278-280`) | ActiveStudents `glass-card p-6 text-center` (`:38-42`); ClosingSoon/FollowUp/Banner retornam `null` |
| Loading | nenhum (renderiza zeros) | `glass-card p-8 text-center` + texto "Carregando sessões..." dentro do grid (`:328-331`) | nenhum (mostra `EmptyState` durante load) | `loading` gerido em `AdminMembroDetalhes` (fora do escopo) | `disabled:opacity-40/50` nos botões (Banner `:210`, Sessoes `:432`); `AdminMemberNote` `Loader2 animate-spin` (`:58`); `SendNpsButton` texto "Enviando..." (`:90`) |

Resumo do inventário: `StatusBadge` e `EmptyState` existem e são bons, mas só a Agenda usa o primeiro e só Agenda/Alunos usam o segundo; `Button` do shadcn não é usado em nenhuma tela do mentor; não há componente de card, de header de página/seção, nem de skeleton compartilhado.