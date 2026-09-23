# Auditoria — módulo de Tarefas (Liberty Begin)

Escopo lido integralmente: `src/pages/TarefasPage.tsx` (280 linhas), `src/components/TaskChecklist.tsx` (731), `src/components/TaskPlanDialog.tsx` (112), `src/components/MemberTasksList.tsx` (397), `src/components/WeekTasksBento.tsx` (240), `src/lib/taskStatus.ts` (52) e 13 migrations que tocam `session_tasks` (não existem tabelas `task_plans` nem `booking_tasks` no repositório — o modelo é apenas `session_tasks` com colunas `planned_date`/`due_date`).

Contexto verificado fora do escopo para embasar achados: consumidores de `TaskChecklist` (Journey, MentorSessoes, MentorDashboard, MemberAgenda, AdminMembroDetalhes), `Dashboard.tsx`, `src/lib/bookingStatus.ts`, `src/App.tsx` (staleTime 60s) e `src/integrations/supabase/types.ts`.

---

## Lógica/Dados

- [SEVERIDADE: crítico] `supabase/migrations/20260326124243_…sql:45-60` — política `Libertys can update own session_tasks` permite `UPDATE` de **qualquer coluna** para o aluno (só restringe por `booking_id`). — Um aluno pode, via API, setar `validated_at`/`validated_by`/`result_value`/`description`/`due_date` e "auto-validar" a tarefa, ganhando pontos (trigger em `20260720181011:104-126`). A UI esconde, o banco não impede. — Restringir com `WITH CHECK` que compare colunas imutáveis (`description`, `validated_at`, `validated_by`, `result_*`, `booking_id`, `due_date` IS NOT DISTINCT FROM valores anteriores) via trigger `BEFORE UPDATE` ou RPC `student_mark_task(task_id, done)` `SECURITY DEFINER`.

- [SEVERIDADE: alto] `supabase/migrations/20260701211005_…sql:3-7` — `Mentors can manage all session_tasks` dá `FOR ALL` a qualquer mentor sobre tarefas de **qualquer** booking. — Mentor pode editar/excluir tarefas de mentorados de outros mentores; a UI (`TarefasPage.tsx:41-45`, `MentorSessoes`) escopa por `mentor_id`, criando falsa sensação de isolamento. `MemberTasksList.tsx:47` documenta isso como intencional, mas o componente está morto (ver Qualidade). — Decidir explicitamente: se compartilhado, deixar UI coerente; se não, voltar à política por `booking.mentor_id` e criar exceção só para admin.

- [SEVERIDADE: alto] `src/pages/TarefasPage.tsx:42-45` — bookings buscados sem filtro de `status`; tarefas de sessões `cancelled`/`not_realized` entram na lista e nos contadores. `Journey.tsx:233` filtra esses status; `Dashboard.tsx:53-60` não. — Contadores "Pendentes/Concluídas" divergem entre Central de tarefas, Journey e Dashboard; aluno vê tarefa de sessão cancelada como pendente. — Adicionar `.not("status", "in", "(cancelled,not_realized)")` (ou reutilizar `getEffectiveBookingStatus`) em um hook único `useScopedTasks(role, profileId)` consumido por todas as páginas.

- [SEVERIDADE: alto] `src/pages/TarefasPage.tsx:138,236`, `src/components/TaskChecklist.tsx:269-270`, `src/components/MemberTasksList.tsx:218-219` — "vencido" compara `due_date` (date, sem hora) com `new Date().toISOString().slice(0,10)` (data **UTC**). — No Brasil (UTC-3), entre 21h e 0h uma tarefa com prazo "hoje" já aparece "vencido"; comportamento varia com o fuso do dispositivo. — Criar `isTaskOverdue(task, now = new Date())` em `taskStatus.ts` usando `format(now, "yyyy-MM-dd")` (local) ou `isBefore(parseISO(due), startOfToday())`, e usar em todos os lugares.

- [SEVERIDADE: alto] `src/components/TaskChecklist.tsx:270` vs `TarefasPage.tsx:236` / `MemberTasksList.tsx:219` — regra de "vencido" diverge: `!task.is_completed` no checklist, `status !== "validated"` nas outras duas. — Tarefa "aguardando validação" com prazo passado é "vencida" na listagem do mentor em TarefasPage, mas não no checklist (onde `PlanChips` nem é renderizado em `renderAwaiting`, linhas 444-492 — o prazo some da tela). — Centralizar em `isTaskOverdue` e renderizar chip de prazo em todos os estados não-validados.

- [SEVERIDADE: alto] `src/components/TaskChecklist.tsx:243-256` — `toggleInProgress` é declarado e **nunca chamado** (rg confirma um único match). — Não existe nenhum caminho de UI para colocar uma tarefa em "Em andamento"; o status, o chip (`TarefasPage.tsx:21`), o `Stat` (`:159`) e a seção `renderInProgress` (377-441) só são alcançáveis por alteração direta no banco. Além disso `studentMarkMutation` (89-106) e `reopenMutation` (135-158) não resetam `in_progress`, então uma tarefa reaberta pode "voltar" para em andamento silenciosamente. — Ou expor a ação (ex.: botão "Iniciar" no `renderPending`) ou remover a mutation/estado; em ambos os casos zerar `in_progress` ao concluir/reabrir.

- [SEVERIDADE: alto] `src/components/TaskPlanDialog.tsx:38` — `qc.invalidateQueries()` sem filtro invalida **todas** as queries do app a cada salvamento de prazo. — Refetch storm (dashboard, notificações, perfis, disponibilidade…) e flicker; oposto exato do problema seguinte. — Invalidar só `invalidateKeys` + um prefixo padrão de tarefas.

- [SEVERIDADE: médio] `src/components/TaskChecklist.tsx:79-85` — `invalidateAll` invalida chaves hard-coded `["liberty-tasks"]`, `["liberty-all-tasks"]`, `["session-tasks"]`; só `liberty-tasks` existe (`Dashboard.tsx:53`); `liberty-all-tasks` e `session-tasks` não são usadas por nenhuma query. As chaves reais dos consumidores (`journey-tasks`, `dash-tasks`, `mentor-all-tasks`, `mentor-results-tasks`, `member-agenda-tasks`, `mentor-sessoes-tasks`) não são cobertas a menos que a página passe `invalidateKeys`. — Com `staleTime: 60_000` (`App.tsx:61`), validar em TarefasPage e navegar para MentorDashboard mostra dados de até 60s atrás. — Padronizar prefixo `["tasks", …]` em todas as queries de `session_tasks` e invalidar `{ queryKey: ["tasks"] }`.

- [SEVERIDADE: médio] `src/pages/TarefasPage.tsx:42-54` — `error` de todas as 4 chamadas Supabase é ignorado (`{ data: bookings = [] }`, `{ data: tasks = [] }` …). Observação: o default `= []` não cobre `null` (Supabase retorna `data: null` em erro); a proteção vem só do `|| []` posterior. — Falha de RLS/rede vira "Nenhuma tarefa cadastrada." (linha 214), sem toast nem estado de erro. — `if (error) throw error` em cada chamada e renderizar `isError`.

- [SEVERIDADE: médio] `src/components/TaskChecklist.tsx:604-609,614-616` — `onKeyDown Enter` chama `addMutation.mutate` sem checar `addMutation.isPending` (o botão checa, o input não). — Enter repetido cria **tarefas duplicadas**; `notify_task_assigned` (`20260719234454:51-80`) notifica o aluno duas vezes. — Guardar `if (addMutation.isPending) return;` e/ou desabilitar o input durante envio.

- [SEVERIDADE: médio] `src/components/TaskChecklist.tsx:311,356-368,378-386,417-437,500-523`, `MemberTasksList.tsx:156-162,290-310` — botões de concluir (mentor), editar, excluir, planejar e "+ Resultado" não usam `disabled={…isPending}`; apenas `studentMark`, `validate`, `reopen` e `saveResult` são protegidos. — Duplo clique dispara duas mutations (dois toasts "Tarefa removida!", ou `delete` seguido de erro). — Desabilitar pelo `isPending` de cada mutation; considerar um único `useTaskMutations` que exponha `isBusy`.

- [SEVERIDADE: médio] `supabase/migrations/20260720181011_…sql:104-126` — `award_points_on_task_completed` concede 3 pontos quando `is_completed` vira `true`, ou seja, no momento em que o **aluno** marca como concluída (antes de validação). Reabrir pelo mentor não estorna. — Pontuação por tarefa não validada; incentivo a marcar tudo como feito. — Disparar em `UPDATE OF validated_at` quando `NEW.validated_at IS NOT NULL AND OLD.validated_at IS NULL`, e estornar/deletar `member_points` no reopen.

- [SEVERIDADE: médio] `src/pages/TarefasPage.tsx:72-100` — linhas demo são mescladas nas mesmas listas e passadas ao `TaskChecklist` com `role="liberty"` (linha 225-232). — Clicar no círculo de uma tarefa demo executa `UPDATE … WHERE id = <id fake>`; Supabase retorna 0 linhas sem erro → toast "Enviada para validação do mentor!" sem nada acontecer. Também `due_date` aleatório (linha 89) muda a cada montagem. — Marcar `isDemo` na linha e tornar o checklist read-only para essas tarefas (ou não montar `TaskChecklist` para grupos demo).

- [SEVERIDADE: médio] `src/components/TaskPlanDialog.tsx:66-97` + `TaskChecklist.tsx:324-331,339-345` — o aluno abre o `TaskPlanDialog` clicando no texto da tarefa ou em "Planejar" e **pode alterar o prazo** definido pelo mentor (RLS permite). O próprio dialog diz (linha 96) "Só o prazo. O restante… é definido depelo aluno", contradizendo o fluxo. — Aluno adia prazo unilateralmente; mentor não é notificado. — Se prazo é do mentor: `TaskPlanDialog` read-only para `role="liberty"` (o prop `role` já existe e é ignorado — linha 27). Se o aluno pode planejar, separar `planned_date` (aluno) de `due_date` (mentor).

- [SEVERIDADE: médio] `src/components/WeekTasksBento.tsx:39-43,47-49` — agrupamento semanal usa `planned_date`, mas `TaskPlanDialog.tsx:47` grava apenas `due_date`. `MemberTasksList.tsx:215` comenta que `planned_date` foi abandonado. — Mesmo se o componente fosse montado, "Planejar" nunca colocaria a tarefa na semana. Semana começa segunda (`weekStartsOn: 1`, linha 33), correto para pt-BR, mas irrelevante por ser código morto. — Remover o componente ou migrar para `due_date`.

- [SEVERIDADE: médio] `src/components/WeekTasksBento.tsx:59-63` — `StatusIcon` deriva ícone de `is_completed`/`in_progress` diretamente, não de `getTaskStatus`. — Tarefa "aguardando validação" aparece com check verde de concluída (regra diferente das demais telas). — Usar `getTaskStatus` + `taskStatusConfig`.

- [SEVERIDADE: médio] `src/pages/TarefasPage.tsx:49` ordena por `due_date NULLS LAST`; `Journey.tsx:70`, `Dashboard.tsx:60`, `MemberAgenda.tsx:96` por `created_at ASC`; `AdminMembroDetalhes.tsx:177` por `created_at DESC`. `TaskChecklist` não reordena. — A mesma sessão mostra as tarefas em ordens diferentes em cada tela. — Definir ordenação canônica (`due_date NULLS LAST, created_at`) no hook único.

- [SEVERIDADE: baixo] `src/pages/TarefasPage.tsx:31` — filtro inicial `"pending"`. — Ao abrir a página, tarefas "em andamento"/"aguardando" ficam ocultas e o usuário vê "Nenhuma tarefa nesse filtro" enquanto os `Stat` acima mostram números > 0. — Default `"all"` ou primeiro filtro com `count > 0`.

- [SEVERIDADE: baixo] `src/pages/TarefasPage.tsx:103-112` — lista de alunos derivada de `effectiveRows` (tarefas), não de bookings. — Aluno com sessões sem tarefas não aparece no `<select>`; o count "Todos os alunos (N)" subestima. — Derivar de `bookings`.

- [SEVERIDADE: baixo] `src/components/TaskPlanDialog.tsx:31-34` — `useEffect` depende só de `task?.id`. — Se `due_date` da mesma tarefa mudar externamente (refetch) enquanto o dialog está aberto, o input fica desatualizado. — Depender de `[task?.id, task?.due_date]`.

- [SEVERIDADE: baixo] `src/components/TaskChecklist.tsx:116-133,204-231` e `MemberTasksList.tsx:68-78,122-143` — validação pelo mentor não preenche `completed_by_role` quando a tarefa sai direto de pending (fica `NULL`, apesar do `CHECK ('liberty','mentor')` em `20260617185722:5`). — Relatórios/analytics que dependam de "quem concluiu" perdem informação. — Setar `completed_by_role: "mentor"` nesses caminhos.

- [SEVERIDADE: baixo] `supabase/migrations/20260326124243_…sql:19-21` usa `public.has_role`; `20260701211005:6` usa `app_private.has_role`. Ambas existem (recriadas em `20260701124650`), mas a mistura sugere que a política de admin ficou fora da migração de hardening. — Risco de divergir se `public.has_role` for removida. — Unificar para `app_private.has_role`.

- [SEVERIDADE: baixo] `supabase/migrations/20260719234454_…sql:63-65` — comentário "avoid self-notifying when student creates own task", mas não existe política `INSERT` para liberty em `session_tasks`. — Código morto no trigger / documentação enganosa. — Remover o branch ou adicionar a política se o fluxo for desejado.

## UX/Consistência visual

- [SEVERIDADE: alto] `src/components/TaskChecklist.tsx:453-479` — linha "aguardando" tem 3 botões de texto com `shrink-0` ("Validar c/ resultado", "Validar", "Reabrir") ao lado da descrição, dentro de `flex items-center`. — Em ~360px a descrição colapsa a poucos caracteres ou a linha estoura horizontalmente. — Empilhar ações abaixo do texto em `sm:` (ou menu "⋯" via `DropdownMenu`).

- [SEVERIDADE: alto] `src/components/TaskChecklist.tsx:513,520` — ações de reabrir/excluir na linha validada usam `opacity-0 group-hover:opacity-100`. — Invisíveis e inacessíveis em dispositivos touch (sem hover) e para navegação por teclado (sem `focus-visible:opacity-100`). — Remover opacity-0 ou adicionar `focus-within:opacity-100` + sempre visível em `md:` para baixo.

- [SEVERIDADE: alto] `TaskChecklist.tsx:292-301,379-387`, `MemberTasksList.tsx:158-180` — "checkbox" é um `<button>` vazio de `w-5 h-5` (20px), sem `aria-label`, sem `role="checkbox"`/`aria-checked`, com `title` apenas. — Alvo de toque < 44px na ação principal; leitor de tela anuncia "botão" sem nome. Não usa `@/components/ui/checkbox` (shadcn, existente). — Usar `Checkbox` do shadcn ou botão com `aria-label` e área de toque `min-h-11 min-w-11` (padding invisível).

- [SEVERIDADE: médio] `TaskChecklist.tsx:351,358,365,419,426,433,513,520`, `MemberTasksList.tsx:284,292,299,305`, `WeekTasksBento.tsx:147-160`, `TarefasPage.tsx` (nenhum) — ícones de ação com `p-1`/`p-1.5` e ícone 12–14px → 20–26px de alvo. — Abaixo dos 44px recomendados em mobile. — `h-9 w-9` mínimo em mobile (`sm:h-7 sm:w-7`), ou usar `Button size="icon"`.

- [SEVERIDADE: médio] `TaskChecklist.tsx:364,432,519` (`window.confirm("Remover esta tarefa? Essa ação não pode ser desfeita.")`) vs `MemberTasksList.tsx:305` (`confirm("Remover esta tarefa?")`). — Confirmação nativa do browser, textos divergentes, sem tema; `alert-dialog.tsx` existe e não é usado. — `AlertDialog` compartilhado `ConfirmDeleteTaskDialog`.

- [SEVERIDADE: médio] Dois diálogos de resultado diferentes: `TaskChecklist.tsx:641-720` ("Registrar Resultado", ordem Quantitativo→Qualitativo, campo Observações, botão `.btn-silver`, sem Cancelar, estado ativo com `border-border`) vs `MemberTasksList.tsx:324-394` ("Registrar resultado da tarefa", ordem Qualitativo→Quantitativo, sem Observações, botão `bg-primary`, com Cancelar, borda colorida no ativo). — Mesma ação com UI, ordem e capacidade distintas. — Um `TaskResultDialog` único.

- [SEVERIDADE: médio] Botão primário inconsistente: `.btn-silver` (`TaskChecklist.tsx:714`, `TaskPlanDialog.tsx:103`), `bg-primary text-primary-foreground` (`TaskChecklist.tsx:617`, `MemberTasksList.tsx:387`), `bg-status-green/15` (`TaskChecklist.tsx:457`). `@/components/ui/button` não é importado em nenhum dos 5 arquivos. — Sem hierarquia visual clara; estados de foco/desabilitado divergentes. — Padronizar em `Button` (`variant="default"|"secondary"|"ghost"|"destructive"`).

- [SEVERIDADE: médio] Badge de status em 4 formas: `taskStatusConfig.classes` pill `rounded-full` (`TaskChecklist.tsx:558`), `rounded` (`MemberTasksList.tsx:182,214`), ponto colorido de 8px sem texto (`TarefasPage.tsx:240`), texto solto "Em andamento" (`TaskChecklist.tsx:396,402`). — Em TarefasPage o status depende apenas de cor (falha WCAG 1.4.1). — `TaskStatusBadge` único baseado em `taskStatusConfig`; `badge.tsx` existe e não é usado.

- [SEVERIDADE: médio] Chip de prazo triplicado com formatos distintos: `TarefasPage.tsx:250-256` (`dd MMM`, `new Date(d+"T12:00:00")`, ícone Calendar), `TaskChecklist.tsx:274-280` (`dd 'de' MMM`, `parseISO`, ícone Clock), `MemberTasksList.tsx:220-227` (`dd 'de' MMM`, Clock), `TaskPlanDialog.tsx:85` (`EEEE, dd 'de' MMMM`, `T00:00:00`). — Três estratégias de parse e dois ícones para o mesmo dado. — `TaskDueChip` compartilhado + `parseDateOnly()` util.

- [SEVERIDADE: médio] Tipografia: `text-[9px]` (`WeekTasksBento.tsx:182`, `MemberTasksList.tsx:182`), `text-[10px]` dominante em chips/labels/botões (`TarefasPage.tsx:144,195,243,275`; `TaskChecklist.tsx:275,341,396,457…`; `MemberTasksList.tsx:212,267`). — Abaixo do mínimo legível em mobile (~12px); botões de ação em 10px. — Mínimo `text-xs` (12px) para interativos e `text-[11px]` apenas em metadados.

- [SEVERIDADE: médio] Empty state / loading: `TarefasPage.tsx:212` `"Carregando…"` texto puro (sem `Skeleton`, que existe em `ui/`); `:214` `<p italic>`; `TaskChecklist.tsx:636-638` `<p italic>` só para liberty (mentor com 0 tarefas e `hideAdd` não vê nada); `WeekTasksBento.tsx:66-74` `glass-card` com ícone e h2. Com `filter` ativo e 0 matches (`AdminMembroDetalhes`), `TaskChecklist` renderiza vazio. — Três estilos de vazio, um sem estado. — `EmptyState` compartilhado (ícone + título + descrição + CTA) e `Skeleton` para loading.

- [SEVERIDADE: médio] Controles de formulário nativos: `<select>` (`TarefasPage.tsx:167-176`), `<input>` e `<textarea>` com classes manuais e `focus:border-primary/20` vs `focus:ring-2 focus:ring-primary/40` (`TaskChecklist.tsx:683,696,706` vs `MemberTasksList.tsx:361,374`). — `ui/select`, `ui/input`, `ui/textarea`, `ui/label` existem e não são usados; anel de foco inconsistente. — Migrar para shadcn.

- [SEVERIDADE: baixo] Textos: "Validar c/ resultado" (`TaskChecklist.tsx:460`) abreviação; `title="Definir data e responsável"` (`:342,410`) e `"Definir data e prazo"` (`MemberTasksList.tsx:293`) mas o dialog só define prazo (título "Definir prazo", `TaskPlanDialog.tsx:63`); `TaskPlanDialog.tsx:96` promete "quem vai fazer, status… pelo aluno" — não existe essa UI. Toasts "Tarefa removida!" vs "Tarefa removida"; "Salvar Resultado" (Title Case) vs "Salvar prazo". Mensagem de erro `"No task"` em inglês (`TaskChecklist.tsx:206`, `MemberTasksList.tsx:124`) — interna, mas pode vazar via `e?.message` em `MemberTasksList.tsx:141`. — Revisar copy; padronizar sentence case sem "!".

- [SEVERIDADE: baixo] `TarefasPage.tsx:196-208` — chips de filtro sem `aria-pressed`; `Stat` (`:269-278`) não são clicáveis apesar de parecerem cards de filtro. — Acessibilidade e affordance. — `aria-pressed={active}`; ou tornar `Stat` clicáveis atalhando para o filtro.

- [SEVERIDADE: baixo] Raio de borda misto: `rounded-xl` (`TarefasPage.tsx:239`, `WeekTasksBento.tsx:96`) vs `rounded-lg` (`TarefasPage.tsx:218`, `TaskChecklist.tsx:291`, `MemberTasksList.tsx:154`) vs `glass-card`. Fundo de linha: `bg-card` / `bg-card/70` / `bg-card/50` / `bg-background/40`. — Padronizar via `Card` ou tokens.

- [SEVERIDADE: baixo] `TaskChecklist.tsx:557` — `first:mt-0` num header que é sempre o primeiro filho do seu wrapper → `mt-2` nunca aplica; classe morta. — Mover o espaçamento para o `space-y-4` do container.

## Qualidade

- [SEVERIDADE: alto] `src/components/MemberTasksList.tsx` (397 linhas) e `src/components/WeekTasksBento.tsx` (240 linhas) — **não são importados em nenhum lugar** (`rg` em `src/` e `supabase/` retorna zero referências externas). — 637 linhas de código morto com lógica própria de status/mutation que diverge da versão viva, ampliando superfície de bugs e confundindo auditorias. — Remover; se houver intenção de reuso, extrair as partes boas (Cancelar no dialog, `clearResult`) para o componente compartilhado.

- [SEVERIDADE: alto] `src/components/TaskChecklist.tsx:290-375` vs `377-441` — `renderPending` e `renderInProgress` são ~90% idênticos (diferem em classes de borda, ícone do círculo e uma linha "Em andamento"). Ações mentor (`Planejar/Editar/Remover`) duplicadas nas linhas 347-371 e 415-439; `window.confirm` repetido 3×. — 731 linhas, difícil manter. — Extrair:
  - `TaskRow` (linha + `status` prop que decide borda/ícone/ações);
  - `TaskRowActions` (mentor/admin) e `TaskStudentActions`;
  - `TaskResultDialog` (linhas 641-720; reaproveitar no lugar do duplicado de `MemberTasksList` 324-394);
  - `TaskDueChip` (`PlanChips` 267-288 + `TarefasPage` 250-256 + `MemberTasksList` 217-232);
  - hook `useTaskMutations({ bookingId, invalidateKeys, onChanged })` com as 8 mutations (linhas 88-256) — remove `useQueryClient`, `useAuth`, `toast` do componente de UI;
  - `SectionHeader` → `TaskStatusBadge` em `taskStatus.ts`/`components/tasks/`.
  Meta: `TaskChecklist` < 200 linhas só de composição.

- [SEVERIDADE: médio] Interface `Task` redefinida 4× com campos diferentes: `TaskChecklist.tsx:17-35`, `MemberTasksList.tsx:18-35`, `WeekTasksBento.tsx:8-20`, `TaskPlanDialog.tsx:10-18` (`PlanTask`). Nenhuma inclui `result_notes`, forçando `(task as any).result_notes` em `TaskChecklist.tsx:218,543,545`, apesar de o tipo gerado já ter a coluna (`types.ts:1028`). — Casts desnecessários, drift entre componentes. — `export type SessionTask = Database["public"]["Tables"]["session_tasks"]["Row"]` em `src/types/task.ts` e `TaskLike` em `taskStatus.ts` estendendo dele.

- [SEVERIDADE: médio] `any` explícito: `TarefasPage.tsx:47,52,55,56,57,58,73,89,106,118,126,130,234,269` (`icon: any`); `TaskChecklist.tsx:218,543,545`; `MemberTasksList.tsx:63,77,90,99,108,119,141,319`; `WeekTasksBento.tsx:237`. — Perda total de tipagem no fluxo principal de dados da página. — Tipar `rows` como `ScopedTask = SessionTask & { session_name; scheduled_date; counterpart_name; counterpart_id }`; `icon: LucideIcon`; `onError: (e: Error)`.

- [SEVERIDADE: médio] `src/components/TaskChecklist.tsx:243-256` — `toggleInProgress` nunca usado (código morto com efeito de negócio, ver Lógica). `TaskPlanDialog.tsx:24,27` — prop `role` declarada e não desestruturada; `PlanTask.is_completed/in_progress/planned_date/assignee_name` nunca lidos. `WeekTasksBento.tsx:12,16-19` campos `result_*`, `validated_at` nunca lidos. `TaskChecklist.tsx:3` importa `Circle` (usado só na linha 602) e `PlayCircle` (só 388) — ok; mas `CheckCircle2` etc. fine. — Remover ou usar.

- [SEVERIDADE: médio] `src/pages/TarefasPage.tsx:35-69` — queryFn de ~30 linhas com 4 requisições e 3 `Object.fromEntries` inline; `select("id, name")` em `sessions` sem filtro traz o catálogo inteiro. — Difícil testar e reaproveitar; mesma composição existe em Journey/Dashboard/MentorDashboard. — Extrair `useScopedTasks(role, profileId)` em `src/hooks/` com joins via `select("*, bookings!inner(session_id, scheduled_date, mentor_id, liberty_id, status, sessions(name))")` numa única chamada.

- [SEVERIDADE: baixo] `src/pages/TarefasPage.tsx:114-115` — `norm` e `searchNorm` recriados a cada render fora de `useMemo`, enquanto `scopedRows` depende de `searchNorm` (string, ok) — funcional, mas `norm` deveria ser module-level. `:198` cadeia ternária de 5 níveis para mapear chip→count. — Mover `norm` para `src/lib/`, mapear `counts` por chave (`counts[c.key]`).

- [SEVERIDADE: baixo] `src/components/TaskChecklist.tsx:267,553` — `PlanChips` e `SectionHeader` são componentes definidos **dentro** do render do pai. — Nova identidade a cada render → remount de subárvore, perda de foco/transições. — Mover para fora do componente.

- [SEVERIDADE: baixo] `src/components/TaskChecklist.tsx:233-240` — `grouped` recalcula 4 filtros × `getTaskStatus` a cada render sem `useMemo`; `applyFilter` inline. — Custo pequeno hoje, cresce com listas do admin. — `useMemo` + um único `reduce`.

- [SEVERIDADE: baixo] `src/lib/taskStatus.ts:2-7` — comentário de cabeçalho descreve `done_by_student` como `completed_by_role === 'liberty'`, mas `getTaskStatus` (linha 19-23) ignora `completed_by_role`. — Documentação desatualizada; nome do status é enganoso ("done_by_student" vale também para mentor/admin). — Renomear para `awaiting_validation` e atualizar o comentário (e `countByStatus` já usa `awaiting`).

---

## Inventário de componentes/classes (estado atual)

| Elemento | Onde | Implementação encontrada |
|---|---|---|
| Título de página | `TarefasPage.tsx:144-149` | eyebrow `text-[10px] uppercase tracking-wider text-primary` + `<h1 className="text-2xl font-semibold text-foreground">` |
| Título de seção/card | `WeekTasksBento.tsx:83`, `TaskChecklist.tsx:568` | `<h2 className="text-lg font-semibold">`; `<p className="text-xs text-muted-foreground">` (sessionName) |
| Título de dialog | todos | `DialogTitle` (shadcn) — único uso consistente de shadcn |
| Card / container | `TarefasPage.tsx:218,239,272`, `WeekTasksBento.tsx:68,77`, `TaskChecklist.tsx:291,378,445,495`, `MemberTasksList.tsx:154` | `.glass-card` (custom CSS); `rounded-xl border border-border bg-card/70 p-3`; `rounded-lg border border-border bg-card`; variantes `bg-card/50`, `bg-background/40`, `bg-status-blue/5`, `bg-status-yellow/5`. `ui/card.tsx` não usado |
| Botão primário | `TaskChecklist.tsx:617,714`, `TaskPlanDialog.tsx:103`, `MemberTasksList.tsx:387` | `.btn-silver` (custom CSS) **e** `bg-primary text-primary-foreground rounded(-lg) text-xs/sm font-semibold`. `ui/button.tsx` não usado |
| Botão secundário / ghost | `TarefasPage.tsx:186-192`, `TaskChecklist.tsx:463-478,482-489`, `MemberTasksList.tsx:266,379` | `border border-border text-muted-foreground hover:bg-foreground/5`; `bg-muted text-foreground hover:bg-muted/70 text-[10px]`; `bg-primary/10 text-primary border-primary/20` ("Planejar", "+ Resultado") |
| Botão ícone | `TaskChecklist.tsx:349-369,510-523`, `MemberTasksList.tsx:281-310`, `WeekTasksBento.tsx:147-160` | `<button className="p-1 / p-1.5 rounded hover:bg-muted">` + `lucide` 12–14px, `title` apenas |
| Checkbox / toggle de conclusão | `TaskChecklist.tsx:292-301,379-387`, `MemberTasksList.tsx:158-180` | `<button className="w-5 h-5 rounded-full border-2 …">` vazio ou com ícone interno. `ui/checkbox.tsx` não usado |
| Badge de status | `taskStatus.ts:26-37` → `TaskChecklist.tsx:558`, `MemberTasksList.tsx:182,214`; `TarefasPage.tsx:240` | `taskStatusConfig.classes` (`bg-status-*/15 text-status-* border-status-*/30`) em `rounded-full`/`rounded` `text-[9-10px] uppercase`; ponto `w-2 h-2 rounded-full bg-status-*`. `ui/badge.tsx` não usado |
| Chip de filtro | `TarefasPage.tsx:200-207` | `px-2.5 py-1 rounded-full border text-[10px] uppercase` + `ring-1 ring-foreground/20` ativo |
| Chip de prazo / responsável | `TarefasPage.tsx:251`, `TaskChecklist.tsx:275,282`, `MemberTasksList.tsx:221,229`, `WeekTasksBento.tsx:107,112` | `inline-flex items-center gap-1 text-[10-11px] px-1.5 py-0.5 rounded-full border bg-muted/50 text-muted-foreground border-border` + ícone 10px (Clock ou Calendar) |
| Empty state | `TarefasPage.tsx:214`, `TaskChecklist.tsx:637`, `WeekTasksBento.tsx:66-74,124-129` | `<p className="text-center py-8 text-muted-foreground text-sm italic">`; `<p className="text-xs italic py-2">`; `glass-card p-8 text-center` com ícone + h2 + p; `border-dashed p-5` |
| Loading | `TarefasPage.tsx:212`, botões | `<p className="text-center py-8 text-muted-foreground text-sm">Carregando…</p>`; texto "Salvando..." no botão. `ui/skeleton.tsx` não usado |
| Inputs | `TarefasPage.tsx:167,178`, `TaskChecklist.tsx:305,603,680,693,703`, `TaskPlanDialog.tsx:76`, `MemberTasksList.tsx:190,357,369` | `<select>`/`<input>`/`<textarea>` nativos com `bg-card border border-border rounded-lg px-3 py-2 text-sm` e foco `border-primary/20|/40` ou `ring-2 ring-primary/40`. `ui/input|select|textarea|label` não usados |
| Confirmação destrutiva | `TaskChecklist.tsx:364,432,519`, `MemberTasksList.tsx:305` | `window.confirm` / `confirm`. `ui/alert-dialog.tsx` não usado |
| Feedback | todos | `toast` (sonner) — consistente na lib, inconsistente no copy |

Nenhum arquivo foi editado.