# Auditoria — Relatório, Disponibilidade e Google Calendar

Base de leitura: `src/lib/bookingStatus.ts` (regra "realizada" = `completed` OU `awaiting_report`; `report_required=false` para kickoff/retroativo), todos os arquivos do escopo e as migrations relevantes (`20260317183035`, `20260317191226`, `20260701214259`, `20260729201447`, `20260827213401`, `20260830142524`, `20260830144233`, `20260914164421`, `20260701124650`, `20260716210038`). Nenhum arquivo foi editado.

Contexto de RLS que embasa vários achados:
- `bookings`: "Mentors can view all bookings" (qualquer mentor lê qualquer booking); UPDATE só do próprio (`20260701124650:73-93`).
- `booking_reports`: `UNIQUE(booking_id)` (`20260317191226:66`); mentor edita só os próprios (`:74-81`), mas lê todos (`20260701214259:3-7`).
- `session_tasks`: "Mentors can manage all session_tasks" — qualquer mentor insere em qualquer booking (`20260701211005:4-7`).
- `profiles`: mentor vê todos os membros (`20260716210038:5-12`).

---

## Relatório

- [SEVERIDADE: crítico] `src/pages/MentorRelatorio.tsx:241-251` — Salvar relatório com `summary` preenchido faz `UPDATE bookings SET status='completed'` sem verificar se a sessão já ocorreu (`isBookingPast` nunca é usado) nem `report_required`. — Sessão futura passa a contar como "Realizada" em todas as telas (`isRealizedSessionBooking`), entra no financeiro/repasse, dispara `notify_report_available` e `notify_nps_request_on_report` para o aluno antes da sessão acontecer. — Bloquear a página (ou o botão salvar) quando `!isBookingPast(booking)`; no banco, trigger `BEFORE UPDATE` recusando `completed` se `scheduled_date + end_time > now()` (salvo `is_retroactive`).

- [SEVERIDADE: alto] `src/pages/MentorRelatorio.tsx:52-61, 220-222, 249, 253-258` — Mentor A pode abrir `/mentor/sessoes/:id/relatorio` de booking do mentor B (RLS permite SELECT). Se já existe relatório, o fluxo cai no `update(...).eq("id")` que a RLS filtra silenciosamente (0 linhas, sem erro), depois insere `session_tasks` (política permite qualquer mentor), depois `update bookings` também silenciado; `onSuccess` mostra "Relatório salvo." — Falso positivo de sucesso; injeção de tarefas no checklist de aluno de outro mentor (com notificação `task_assigned`); observações privadas de outro mentor ficam visíveis/editáveis na tela. — Checar `booking.mentor_id === profile.id || hasRole("admin")` e renderizar bloqueio; usar `.select()` no update e tratar `data.length === 0` como erro; restringir RLS de `session_tasks` ao mentor do booking.

- [SEVERIDADE: alto] `src/pages/MentorRelatorio.tsx:210-252` — Três escritas sequenciais (report → tasks → status) sem transação. Se a 3ª falha, a 2ª já persistiu; no retry as sugestões (não limpas, pois `onSuccess` não rodou) são inseridas de novo. — Tarefas duplicadas no checklist do aluno; relatório salvo mas toast "Erro ao salvar relatório". — Mover para uma RPC `save_booking_report(...)` transacional, ou ao menos limpar `suggestions` após o insert de tasks e usar `upsert` com `onConflict: "booking_id"`.

- [SEVERIDADE: alto] `src/pages/MentorRelatorio.tsx:275-303` — Só bloqueia `cancelled` e `pending_approval`. `not_realized` passa: o insert em `booking_reports` acontece (status não muda, L246) e os triggers `notify_report_available` + `notify_nps_request_on_report` disparam. — Aluno recebe "Relatório disponível" e pedido de NPS de sessão que não ocorreu. — Incluir `not_realized` no bloqueio.

- [SEVERIDADE: médio] `src/pages/MentorRelatorio.tsx:204-206, 544-561` — `canComplete = canSave && hasTool` só alimenta o texto "A sessão é marcada como concluída ao salvar com relatório e ferramenta anexada", mas o código conclui só com o resumo (L241-247). — Mensagem mente para o mentor; checklist "Ferramenta anexada" é decorativo. — Alinhar texto ao comportamento ou realmente exigir `hasTool`.

- [SEVERIDADE: médio] `src/pages/MentorRelatorio.tsx` (inteiro) — Não existe tratamento para kickoff (`booking.report_required === false` / `bookingRequiresReport`). Página exibe o mesmo checklist "Para concluir a sessão" e exige resumo. — Inconsistência com `bookingStatus.ts` (kickoff vira `completed` sem relatório); mentor pode achar que precisa preencher; se preencher, dispara NPS. — Mostrar aviso "Mapeamento não exige relatório" e ocultar checklist; opcionalmente permitir só observações privadas.

- [SEVERIDADE: médio] `src/pages/MentorRelatorio.tsx:52-61, 63-81, 111-119` — `booking` `.single()` lança e nada renderiza o erro; demais queries fazem `const { data }` ignorando `error`. Não há estado de loading: enquanto `booking` carrega, o formulário completo aparece com "Sessão · " e botão salvar habilitável. — Com `bookingId` inválido o mentor digita, salva e recebe erro FK genérico; falhas de RLS/rede aparecem como "aluno sem dados". — Tratar `isLoading`/`isError` e renderizar skeleton/erro.

- [SEVERIDADE: médio] `src/pages/MentorRelatorio.tsx:37-48, 134-154` — Estado local + flag `loaded` não são resetados quando `bookingId` muda. React Router reutiliza o componente para `/mentor/sessoes/A/relatorio → /mentor/sessoes/B/relatorio` (ex.: clique em notificação `report_pending` estando em outro relatório). — Texto do relatório A aparece no formulário de B e pode ser salvo em B. — `key={bookingId}` no componente ou `useEffect` de reset ao mudar `bookingId`.

- [SEVERIDADE: médio] `src/pages/MentorRelatorio.tsx:92-109, 320-341` — "Trocar sessão entregue" faz `UPDATE bookings.session_id` imediato, sem confirmação, aceita trocar para/de kickoff (muda `report_required` via trigger, altera duração esperada 2h/3h, contagem de jornada) e não invalida `mentor-bookings`/`admin-members`. — Mudança acidental via `Select` altera histórico do aluno e financeiro. — Confirmar via `Dialog`, impedir troca envolvendo kickoff, invalidar as queries de listagem.

- [SEVERIDADE: médio] `src/pages/MentorRelatorio.tsx:260` — `onError: () => toast.error("Erro ao salvar relatório")` descarta a mensagem real (23505 duplicado, 42501 RLS, FK). — Mentor não sabe se foi permissão, duplicidade ou rede. — Exibir `error.message` mapeado (mesmo padrão usado em `MentorSessoes.tsx:223`).

- [SEVERIDADE: baixo] `supabase/migrations/20260317191226_...sql:66` + `MentorRelatorio.tsx:220-225` — Relatório duplicado é impedido por `UNIQUE(booking_id)`; race de duas abas resulta em 23505 com toast genérico. Trigger NPS é `AFTER INSERT` (uma vez por booking, com dedupe em `notifications`), portanto não dispara duas vezes. — Só o toast confuso. — Usar `upsert(..., { onConflict: "booking_id" })`.

- [SEVERIDADE: baixo] `supabase/migrations/20260827213401_...sql:102-152` — `notify_nps_request_on_report` não verifica `report_required`, `is_retroactive`, status nem se a sessão já passou. — NPS enviado para kickoff/retroativo/futuro caso alguém salve relatório. — Reutilizar as guardas de `notify_report_pending_for_mentor`.

- [SEVERIDADE: baixo] `src/pages/MentorRelatorio.tsx:216, 140-149` — `ai_insights` é serializado como texto com marcadores "⚠ Alerta"/"✦ Sugestão estratégica" e re-parseado por regex. — Se o mentor editar o texto e incluir esses marcadores, o parse quebra; legado cai tudo em "estratégia". — Duas colunas (`ai_alert`, `ai_strategy`) ou JSONB.

- [SEVERIDADE: baixo] `src/pages/MentorRelatorio.tsx:132, 599-600, 24` — `pdfSent` calculado e nunca usado; `_icons_used = [Paperclip]` para silenciar lint; `RefreshCcw` importado em linha separada. — Ruído/qualidade. — Remover.

- [SEVERIDADE: baixo] `src/pages/MentorRelatorio.tsx:34-35` — Usuário com papéis `mentor` + `admin` na rota `/mentor/...` recebe `layoutRole="admin"` e `goBack` para `/admin/membros`. — Navegação incoerente com a rota. — Derivar layout do prefixo da rota (`useLocation`).

### PDFs

- [SEVERIDADE: médio] `src/lib/sessionReportPdf.ts` (arquivo inteiro) — `generateSessionReportPdf`/`downloadSessionReportPdf` não são importados em lugar nenhum (grep confirma só auto-referência). Coluna `pdf_delivered_at` existe (`20260720223558:3-6`) mas nunca é escrita. — Código morto + checklist de "PDF enviado" impossível de cumprir. — Remover ou integrar ao fluxo do relatório.

- [SEVERIDADE: médio] `src/lib/mentorReportPdf.ts:102-103, 141` — Status usa `s.status === "completed"` bruto em vez de `getEffectiveBookingStatus`; qualquer outro (`awaiting_report`, `cancelled`, `not_realized`, `pending_approval`) vira "Agendada" e soma em "Projeção total". — Relatório de repasse superestima projeção e rotula errado. — Passar status efetivo do `AdminFinanceiro` e filtrar canceladas/não realizadas.

- [SEVERIDADE: médio] `src/lib/mentorReportPdf.ts:171-180` — Rodapé desenhado uma vez em `pageH - 40` com "Página 1" fixo, após `autoTable` que pode paginar. — Páginas anteriores sem rodapé; rodapé pode sobrepor a tabela; numeração errada. — Loop `for p in getNumberOfPages()` como em `sessionReportPdf.ts:156-168`.

- [SEVERIDADE: baixo] `src/lib/sessionReportPdf.ts:76, 83-84` / `mentorReportPdf.ts:86` — `doc.text(d.session_name)` e nomes em 18pt sem `splitTextToSize` nem `maxWidth`. — Títulos longos estouram a margem direita/cortam. — Usar `splitTextToSize` ou `maxWidth`.

- [SEVERIDADE: baixo] `src/lib/sessionReportPdf.ts:103-108` / `mentorReportPdf.ts` — Fonte Helvetica padrão (WinAnsi): acentos OK, mas emojis/`✦`/`⚠` vindos da transcrição do Zoom são renderizados como glifos inválidos. — Texto corrompido no PDF. — Sanitizar caracteres fora de Latin-1 ou embutir fonte TTF.

- [SEVERIDADE: baixo] `src/lib/mentorReportPdf.ts:111-112, 144` — `toLocaleString("pt-BR")` sem `minimumFractionDigits` (1500.5 → "R$ 1.500,5"). — Formatação monetária inconsistente. — `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })`.

- [SEVERIDADE: baixo] `src/lib/sessionDeliverablePdf.ts:363-380, 396-400` — Cada página é rasterizada em JPEG 3200×1800 e embutida em PDF de 1600×900 px. — PDF sem texto selecionável/pesquisável, ~1–2 MB/página, pesado em mobile. — Aceitável para WhatsApp, mas documentar; considerar `scale: 1.5`.

- [SEVERIDADE: baixo] `src/components/SessionDeliverableDialog.tsx:176` — `onOpenChange` chama `reset()` ao fechar (incluindo clique fora). — Rascunho gerado pela IA (com custo) é perdido sem confirmação; nada é persistido no banco. — Confirmar descarte ou salvar rascunho em `booking_reports`.

- [SEVERIDADE: baixo] `src/components/SessionDeliverableDialog.tsx:84` vs `supabase/functions/build-session-deliverable/index.ts:50` — Prompt instrui "NÃO use o nome literal da sessão", mas o cliente sobrescreve `strategic_title` com `sessionName`. — Título estratégico gerado é descartado. — Decidir um comportamento.

- [SEVERIDADE: baixo] `src/components/SessionDeliverableDialog.tsx:147-163` — JSON colado do clipboard não valida tipos (ex.: `tags` com não-strings → `t.toUpperCase` lança em `sessionDeliverablePdf.ts:120`). — Erro ao baixar PDF sem mensagem clara. — Validar com zod.

- [SEVERIDADE: baixo] `src/pages/MentorRelatorio.tsx:583-594` — `sessionContext` nunca é passado ao dialog → coluna "CONTEXTO" da capa nunca aparece. — Feature morta. — Passar data/mentor ou remover.

---

## Disponibilidade/Slots

- [SEVERIDADE: alto] `src/pages/MentorDisponibilidade.tsx:172-188, 268, 327, 335` — Verificação de sobreposição usa apenas o cache `slots` do React Query; não há `UNIQUE`/exclusion constraint em `mentor_availability` (`20260317183035:125-135`). — Duas abas, admin (`AdminAgenda.tsx:419`) ou refetch atrasado geram slots duplicados/sobrepostos; membros veem dois horários iguais e podem gerar dois bookings no mesmo horário do mentor. — `EXCLUDE USING gist (mentor_id WITH =, specific_date WITH =, tsrange(start,end) WITH &&)` ou ao menos `UNIQUE(mentor_id, specific_date, start_time)`; tratar 23505 no cliente.

- [SEVERIDADE: alto] `src/pages/MentorDisponibilidade.tsx:105-122, 371-386` + `20260830142524:81-83` — Linhas legadas `is_recurring=true` são expandidas semana a semana mas `is_booked` é um único booleano na linha. Quando um booking marca a linha (trigger `sync_availability_booked`), **todas** as ocorrências futuras aparecem "Agendado" e desaparecem para membros (`AgendarSessao.tsx:160` filtra `is_booked=false`). — Perda de disponibilidade do mentor; contadores "sessões agendadas" inflados (L162). — Migrar recorrências legadas para datas concretas (o código novo já faz isso) e/ou calcular "booked" por `bookings` da data, não pela flag.

- [SEVERIDADE: médio] `src/pages/MentorDisponibilidade.tsx:193-229, 538-545, 751-759` — Remoção de slot não recorrente é imediata ao clicar no `X`/`Trash2`, sem confirmação e sem undo (só o recorrente pede `confirm`). — Exclusão acidental; membros perdem horário. — `AlertDialog` de confirmação ou undo no toast.

- [SEVERIDADE: médio] `src/pages/MentorDisponibilidade.tsx:198-220` + `20260914164421:1-4` — Guarda de exclusão checa só `bookings.availability_id`; bookings criados sem vínculo (admin, retroativos, legado antes do trigger) não são detectados; FK agora é `ON DELETE SET NULL`. — Slot com sessão real é apagado silenciosamente; a agenda do mentor "some" mas a sessão continua. — Também checar `bookings` por `mentor_id + scheduled_date + start_time` sobrepostos.

- [SEVERIDADE: médio] `src/pages/MentorDisponibilidade.tsx:169-172` vs `src/pages/AgendarSessao.tsx:170-184` — Slots legados de 90 min ("legacy 1h30") não satisfazem `fits` (precisa ≥120 e <180) e slots de 3h só servem kickoff. — Mentor vê horários "Disponível" que nenhum membro consegue reservar, sem aviso. — Sinalizar na UI slots "sem uso possível" (duração fora de 120/180) e oferecer conversão.

- [SEVERIDADE: médio] `src/pages/MentorDisponibilidade.tsx:280-296, 231-237` — Permite cadastrar disponibilidade em datas passadas (navegação para mês anterior + clique) e em horário já passado do dia atual; "Adicionar por período" idem (`rangeStart` livre). — Slots inúteis poluem "Todas as disponibilidades" e contadores. — Bloquear `isBefore(date, today)` e horário < agora.

- [SEVERIDADE: médio] `src/pages/MentorDisponibilidade.tsx:84-96` — `const { data } = ...` ignora `error`; com RLS/rede falhando, `slots=[]` e a tela mostra "Você ainda não cadastrou nenhuma disponibilidade" (L719). — Mentor acha que perdeu tudo e recadastra (gerando duplicatas quando a rede volta). — Propagar `error`, exibir estado de erro com retry.

- [SEVERIDADE: médio] `src/pages/MentorDisponibilidade.tsx:298-361` — Estado é otimista apenas no sentido de fechar o formulário após `await invalidateQueries`; porém em `handleSaveRange` (L268-272) e `handleRemoveSlot` (L227) a invalidação não é aguardada e o toast de sucesso aparece antes do refetch. — Slot removido continua visível por instantes; clique duplo dispara segundo delete/insert. — `await` na invalidação ou `setQueryData` com rollback em erro.

- [SEVERIDADE: baixo] `src/pages/MentorDisponibilidade.tsx:172-188` — Parâmetro `recurring` nunca é passado `true` (todas as chamadas usam `false`); ramo L183 é código morto. `calendarDays` nunca contém `null` (L129-134) → L449 morto. — Manutenção confusa. — Remover.

- [SEVERIDADE: baixo] `src/pages/MentorDisponibilidade.tsx:302-322` — Repetição semanal pula datas em conflito silenciosamente; toast só informa quantas foram criadas. — Mentor não sabe quais semanas ficaram de fora. — Listar datas puladas.

- [SEVERIDADE: baixo] `src/pages/MentorDisponibilidade.tsx:32, 105-122, 175` e `AgendarSessao.tsx:206` — Convenção `getDay()` 0=domingo bate com `EXTRACT(DOW)` do Postgres e com `WEEKDAY_LABELS`; correto. Timezone: tudo em horário local do browser (`new Date(str+"T00:00:00")`), banco guarda `date`/`time` sem TZ e o sync Google fixa `-03:00`. — Mentor/aluno fora de São Paulo vê "hoje"/"passado" deslocado (`isBookingPast` em `bookingStatus.ts:21-26` também usa local). — Padronizar em `America/Sao_Paulo` via `date-fns-tz` e documentar.

- [SEVERIDADE: baixo] `src/pages/MentorDisponibilidade.tsx:165-166, 66` — Trocar de mês mantém `selectedDate` do mês anterior; painel direito mostra dia que não está no calendário exibido. — Confusão visual. — Resetar `selectedDate` ao navegar ou destacar.

- [SEVERIDADE: baixo] `src/pages/MentorDisponibilidade.tsx:390, 413-422` vs `GoogleCalendarBanner.tsx:25` — Estado "conectado" usa `google_calendar_email` numa tela e `google_connected` na outra. — Se um campo estiver nulo e o outro não, UI diverge. — Um único seletor (`google_connected`).

- [SEVERIDADE: baixo] `src/pages/MentorDisponibilidade.tsx:610-617` — Toggle "Repetir semanalmente" é `div onClick` dentro de `label`, sem `role="switch"`/teclado. — Inacessível. — Usar `Switch` do shadcn.

---

## Google Calendar

- [SEVERIDADE: alto] `supabase/functions/google-calendar-sync/index.ts:8-22, 96-135, 149` — `refreshAccessToken` lança em `invalid_grant` (token revogado/expirado) e `handleCalendar` só faz `console.error`; `createEvent` retorna `null` em erro. A função responde `{ ok: true, updates: {} }` e todos os chamadores fazem `.catch(() => {})`. — Mentor com Google desconectado continua vendo "Google Agenda: email" e nenhum evento é criado, sem qualquer alerta; `profiles.google_connected` nunca é revertido. — Em `invalid_grant`, setar `google_connected=false` e notificar; retornar `ok:false`/lista de erros; exibir toast no cliente.

- [SEVERIDADE: alto] `supabase/functions/google-oauth-callback/index.ts:28, 30-32, 102` — Origem do app é derivada de `Origin`/`Referer` da requisição vinda do redirect do Google (navegador envia `https://accounts.google.com/` ou nada). — Redirect final pode cair em `https://accounts.google.com//mentor/dashboard?google=connected` (404) ou no fallback hardcoded, quebrando ambientes de preview/staging; no branch `error` não há `replace(/\/$/,"")` (L31), gerando `//`. — Embutir `appOrigin` no `state` assinado (gerado pelo `google-oauth-start`, que recebe `Origin` real do app) ou usar env `APP_URL`.

- [SEVERIDADE: médio] `supabase/functions/google-oauth-callback/index.ts:15-20, 30-32` — `htmlRedirect` interpola `to` em `href="${to}"` sem escape; `to` deriva do `Referer` e o branch `?error=` executa antes de validar `state`. — XSS refletido na origem `*.functions.supabase.co` acionável por link com Referer controlado; impacto limitado (sem cookies/tokens do app nessa origem), mas viabiliza phishing. — Escapar HTML, validar `appOrigin` contra allowlist.

- [SEVERIDADE: médio] `supabase/functions/google-calendar-sync/index.ts:91, 137-138, 143` — Evento do mentor inclui `attendees=[liberty, mentor]` com `sendUpdates=all`; evento separado é criado no calendário do aluno; evento institucional (criador admin) também leva attendees. — Aluno recebe até 3 entradas para a mesma sessão (convite do mentor, evento próprio, convite institucional) e e-mails a cada re-sync/backfill. — Um evento canônico com attendees (mentor) ou sem attendees em cada calendário; `sendUpdates=none` em backfill/patch idempotente.

- [SEVERIDADE: médio] `supabase/functions/google-calendar-sync/index.ts:192-199` vs `src/pages/AgendarSessao.tsx:413-419` — Backfill sincroniza tudo que não é `cancelled`, incluindo `pending_approval`; o cliente deliberadamente não sincroniza pendentes. — Evento criado no calendário para sessão não aprovada; se recusada vira `cancelled` e é removido, mas o aluno já recebeu convite. — `.not("status","in",'("cancelled","pending_approval","not_realized")')`.

- [SEVERIDADE: médio] `supabase/functions/google-calendar-sync/index.ts:114-121, 137` — Se `booking.mentor_id` muda (reatribuição pelo admin), `google_event_id_mentor` aponta para evento no calendário do mentor antigo; o PATCH com token do novo mentor retorna 404 (logado e ignorado) e o evento antigo permanece. — Mentor antigo mantém sessão na agenda; novo mentor fica sem. — Guardar `google_event_owner_profile_id` por evento; ao divergir, deletar no antigo e criar no novo.

- [SEVERIDADE: médio] `src/components/GoogleCalendarBanner.tsx:12-23` + `src/hooks/useAuth.tsx:189` — `refreshProfile` não é memoizado → o `useEffect` reexecuta a cada render do provider; o branch `denied` não remove o parâmetro da URL. — `toast.error("Conexão com Google Agenda cancelada.")` repetido; se `Profile.tsx:20-42` também estiver montado, toasts duplicados de "conectado". — `useCallback` em `refreshProfile`; limpar `?google=` em ambos os branches; centralizar o handler.

- [SEVERIDADE: médio] `supabase/functions/google-calendar-sync/index.ts:38-48, 50-61` — `patchEvent`/`deleteEvent` não tratam 404/410 no PATCH nem `401` (token inválido) de forma distinta; nada propaga para `updates`. — Eventos "fantasma" no banco: `google_event_id_*` apontando para eventos apagados manualmente pelo usuário nunca são recriados. — Em 404/410 no PATCH, limpar o id e criar novo evento.

- [SEVERIDADE: baixo] `supabase/functions/google-calendar-sync/index.ts:87-88` — Offset fixo `-03:00` + `timeZone: "America/Sao_Paulo"`; correto hoje (sem horário de verão desde 2019), mas frágil. Se `end_time < start_time` (`AgendarSessao.tsx:262` usa `% 24`), Google retorna 400 → evento não criado silenciosamente. — Sessão atravessando meia-noite não sincroniza. — Construir datas com `Temporal`/lib TZ e validar `end > start`.

- [SEVERIDADE: baixo] `supabase/functions/google-oauth-start/index.ts:47-49` / `google-oauth-callback/index.ts:42-49` — `state` inclui `Date.now()` mas o callback nunca valida TTL; `returnTo` não é validado (aceita qualquer string). — Replay de state (mitigado pelo `code` de uso único); redirect para path arbitrário dentro do host. — Validar `Date.now() - ts < 10min`; aceitar `returnTo` só se começar com `/` e não `//`.

- [SEVERIDADE: baixo] `supabase/functions/google-oauth-callback/index.ts:79-91` — Upsert grava `tokens.refresh_token` mesmo se `undefined` (sobrescreve token válido com `null`); `google_connected=true` é setado mesmo se `prof` não existir. — Estado "conectado" sem token → falha silenciosa no sync. — Só upsert se `refresh_token` presente; senão manter e avisar.

- [SEVERIDADE: baixo] `supabase/functions/google-calendar-sync/index.ts:196` — `.or(\`mentor_id.eq.${profileId},...\`)` interpola string sem validar UUID (admin pode enviar qualquer valor). — Filtro PostgREST malformado/injeção de filtro. — Validar UUID via regex antes.

- [SEVERIDADE: baixo] `src/components/GoogleCalendarBanner.tsx:10, 61` — `dismissed` não persiste (estado local). — Banner reaparece em todo reload para quem não quer conectar. — Persistir em `localStorage` ou `profiles`.

- [SEVERIDADE: baixo] Sync é unidirecional (app → Google). Alterações/remoções feitas no Google não refletem no app; não há webhook/`watch`. — Mentor apaga/move evento no Google e a sessão continua no app. — Documentar como limitação ou implementar `events.watch`.

---

## UX/Consistência visual

- [SEVERIDADE: médio] `src/pages/MentorRelatorio.tsx:556-560` — Texto do checklist contradiz o comportamento real (ver achado crítico). — Mentor não entende por que sessão foi concluída sem ferramenta. — Corrigir texto.

- [SEVERIDADE: médio] `src/pages/MentorRelatorio.tsx:566-571` — Botão "Gerar "Nome da sessão"" (nome da sessão entre aspas como label). — Rótulo estranho; para nome longo o botão estoura em mobile. — "Gerar material da sessão".

- [SEVERIDADE: médio] `src/pages/MentorDisponibilidade.tsx:527-531, 747-749` vs `src/lib/bookingStatus.ts:124-160` — Três estilos de badge para o mesmo conceito: `bg-status-blue/15 … border border-border` (painel), `bg-status-blue/10` sem borda (lista), e `bookingStatusConfig` (`/12`, `border-status-blue/25`) usado no resto do app. — Inconsistência visual entre telas do mentor. — Componente `StatusBadge` único baseado em `bookingStatusConfig`.

- [SEVERIDADE: médio] `src/pages/MentorDisponibilidade.tsx:195, 247-248` (`MentorSessoes.tsx:230, 247-249`) — `window.confirm`/`prompt` nativos em fluxos destrutivos, enquanto o resto usa `Dialog` Radix (L769). — Quebra a identidade visual; `prompt` não funciona em alguns webviews. — `AlertDialog`.

- [SEVERIDADE: médio] `src/index.css:231-235` + `MentorDisponibilidade.tsx:428, 683, 710` — `.glass-card:hover` aplica `translateY(-2px)` + sombra a todo `glass-card`, inclusive containers estáticos (calendário, resumo, lista). — Blocos inteiros "flutuam" ao passar o mouse sem serem clicáveis. — Variante `glass-card-static` ou aplicar hover só a cards interativos.

- [SEVERIDADE: baixo] `src/pages/MentorRelatorio.tsx:353, 377, 544` (`rounded-2xl … p-5`) vs `:410, 445` (`rounded-xl … p-4`) vs `glass-card` (`rounded-xl`) em Disponibilidade — Raios e paddings de card divergem dentro da mesma página e entre páginas. — Falta de sistema. — Padronizar em `glass-card`/`Card`.

- [SEVERIDADE: baixo] `src/pages/MentorRelatorio.tsx:608` (`text-xs text-muted-foreground`) vs `:355, 411, 447` (`text-[10px] uppercase tracking-wider font-semibold`) vs `MentorDisponibilidade.tsx:684` (`text-xs … font-medium uppercase tracking-wider`) vs `:492, 714` (`text-sm font-semibold`) — Quatro estilos de label/título de seção. — Hierarquia tipográfica inconsistente. — Definir `SectionLabel`/`SectionTitle`.

- [SEVERIDADE: baixo] `src/components/GoogleCalendarBanner.tsx:53-59` — Botão primário com classes inline (`bg-primary px-4 py-2 text-xs … hover:opacity-90`) em vez de `.btn-silver`. — Hover e raio diferentes do botão primário padrão. — Usar `btn-silver`.

- [SEVERIDADE: baixo] `src/pages/MentorDisponibilidade.tsx:421` — `Google Agenda: ${email}` sem `truncate`/`max-w`; `MentorRelatorio.tsx:328` `SelectTrigger w-[260px]` fixo. — Overflow horizontal em telas < 400px. — `truncate max-w-[220px]`; `w-full sm:w-[260px]`.

- [SEVERIDADE: baixo] `src/pages/MentorDisponibilidade.tsx:522-537` — Linha do slot com horário + até 3 badges em `flex` sem `flex-wrap`. — Quebra em mobile. — `flex-wrap`.

- [SEVERIDADE: baixo] Empty states divergentes: `MentorDisponibilidade.tsx:504-506` (texto simples `py-4`), `:719` (`py-6`), `:673-676` (`glass-card p-10` com ícone), `MentorRelatorio.tsx:266-270` (`min-h-[60vh]` com ícone), `:415, 458` (itálico), `SessionDeliverableDialog.tsx:368-370` (`text-[11px] italic`). — Sem padrão. — Componente `EmptyState`.

- [SEVERIDADE: baixo] `src/pages/MentorRelatorio.tsx` — Nenhum loading de página; `MentorDisponibilidade.tsx:499-500` spinner só no painel direito (calendário renderiza vazio). — Percepção de "sem dados" durante fetch. — Skeleton por bloco.

- [SEVERIDADE: baixo] `src/pages/MentorRelatorio.tsx:211` — String de erro interna em inglês ("No booking ID"); UI está toda em PT-BR (nenhum texto visível em inglês encontrado no escopo). — Consistência. — Traduzir.

---

## Segurança/Qualidade

- [SEVERIDADE: alto] `supabase/migrations/20260701211005_...sql:4-7` (afeta `MentorRelatorio.tsx:228-236`) — Política "Mentors can manage all session_tasks" permite qualquer mentor inserir/editar/apagar tarefas de qualquer booking. — Vetor do achado de injeção de tarefas em sessão alheia. — Restringir a `booking.mentor_id = current_profile_id()` ou admin.

- [SEVERIDADE: médio] `supabase/functions/build-session-deliverable/index.ts` (inteiro) + `supabase/config.toml` — Função não está no `config.toml` (então `verify_jwt=true` no gateway), mas não valida papel nem tamanho máximo de `zoom_transcript`. — Qualquer usuário autenticado (membro) pode consumir créditos do gateway de IA; transcrições enormes elevam custo. — Replicar a checagem de papel de `organize-zoom-report/index.ts:13-42`; limitar a ~30k chars.

- [SEVERIDADE: médio] `supabase/config.toml:30-34` — `google-oauth-start` e `google-calendar-sync` estão com `verify_jwt=false`, mas ambas validam manualmente o Bearer (`google-oauth-start:30-38`, `google-calendar-sync:156-181`) e o sync checa posse/admin. `google-oauth-callback` precisa ser pública (redirect do Google) e se protege via HMAC. — OK funcionalmente, porém a proteção depende de código e não do gateway; regressão fácil. — Ligar `verify_jwt=true` nas duas primeiras (o callback fica false).

- [SEVERIDADE: baixo] `google-calendar-sync/index.ts:3-6`, `google-oauth-start:3-6`, `build-session-deliverable:4` — `Access-Control-Allow-Origin: *` em todas as functions. — Aceitável com Bearer obrigatório; sem cookies não há CSRF. — Restringir ao domínio do app quando houver `APP_URL`.

- [SEVERIDADE: baixo] `supabase/functions/google-oauth-callback/index.ts:63-66` — Erro de troca de token devolve `JSON.stringify(tokens)` ao navegador. — Vaza `error_description` do Google (não secrets). — Mensagem genérica + log.

- [SEVERIDADE: baixo] Secrets: `LOVABLE_API_KEY`, `GOOGLE_OAUTH_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` lidos via `Deno.env` e nunca enviados ao cliente — correto. `Deno.env.get(...)!` sem checagem em `google-calendar-sync:13-14` lança dentro do `try` e vira log silencioso. — Falha invisível de configuração. — Validar env no boot da função.

- [SEVERIDADE: baixo] `src/components/GoogleCalendarBanner.tsx:8` — `useAuth() as any`. — Perde tipagem de `refreshProfile`. — Tipar `refreshProfile` no `AuthContextType`.

- [SEVERIDADE: baixo] `src/pages/MentorDisponibilidade.tsx:180, 241, 306` — `as any[]` / `any[]` para inserts. — Perde validação do tipo gerado `Database["public"]["Tables"]["mentor_availability"]["Insert"]`. — Usar tipos gerados.

---

## Inventário de componentes/classes (escopo auditado)

| Elemento | Onde | Classes/Componente |
|---|---|---|
| Título de página | `MentorRelatorio.tsx:314-315`, `MentorDisponibilidade.tsx:397-398` | `h1.text-2xl.font-semibold.text-foreground` + `p.text-muted-foreground.text-sm.mt-0.5` / `mt-1` |
| Título de seção (h2/h3) | `MentorDisponibilidade.tsx:492, 714` | `text-sm font-semibold text-foreground` |
| Label de seção "eyebrow" | `MentorRelatorio.tsx:355, 411, 447, 545`; `SessionDeliverableDialog.tsx:341` | `text-[10px] uppercase tracking-wider font-semibold` (`text-muted-foreground` ou `text-primary`) |
| Label de seção (variante) | `MentorDisponibilidade.tsx:684` | `text-xs text-muted-foreground font-medium uppercase tracking-wider` |
| Label de campo | `MentorRelatorio.tsx:608`; `MentorDisponibilidade.tsx:562, 590` | `text-xs text-muted-foreground mb-1 block` / `text-[10px] text-muted-foreground block mb-1` |
| Card padrão (CSS) | `MentorDisponibilidade.tsx:428, 491, 673, 683, 710`; `MentorRelatorio.tsx:519` | `.glass-card` (`bg-card border border-border rounded-xl` + hover lift, `index.css:218-235`) |
| Card inline A | `MentorRelatorio.tsx:353, 544` | `rounded-2xl border border-border bg-card/70 p-5` / `p-4` |
| Card inline B | `MentorRelatorio.tsx:410, 445` | `rounded-xl border border-border bg-card/70 p-4` |
| Card destaque (primary) | `MentorRelatorio.tsx:377`; `MentorDisponibilidade.tsx:560`; `GoogleCalendarBanner.tsx:44`; `SessionDeliverableDialog.tsx:186` | `rounded-2xl/xl border border-primary/20|40 bg-primary/5 p-4|5` |
| Card de alerta | `MentorRelatorio.tsx:285` | `rounded-2xl border border-destructive/30 bg-destructive/5` / `border-status-yellow/30 bg-status-yellow/5` |
| Grupo de formulário | `SessionDeliverableDialog.tsx:339` | `rounded-xl border border-border bg-card/50 p-4 space-y-2` |
| Botão primário | `MentorRelatorio.tsx:390, 572`; `MentorDisponibilidade.tsx:642, 871`; `SessionDeliverableDialog.tsx:202, 306` | `.btn-silver` (`bg-primary text-primary-foreground font-semibold rounded-lg`, `index.css:237-244`) com overrides `text-xs px-4 py-2` |
| Botão primário (fora do padrão) | `GoogleCalendarBanner.tsx:53-59` | `rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90` |
| Botão secundário "primary ghost" | `MentorRelatorio.tsx:566`; `MentorDisponibilidade.tsx:408` | `rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary text-xs` |
| Botão secundário neutro | `MentorDisponibilidade.tsx:650, 865`; `SessionDeliverableDialog.tsx:296, 302` | `border border-border rounded-lg text-muted-foreground hover:text-foreground` / `hover:bg-muted` |
| Botão "adicionar" tracejado | `MentorDisponibilidade.tsx:663` | `border border-dashed border-primary/30 rounded-lg text-sm text-primary hover:bg-primary/5` |
| Botão link/terciário | `MentorRelatorio.tsx:358, 452`; `SessionDeliverableDialog.tsx:343` | `text-xs|[10px]|[11px] text-primary hover:underline` |
| Botão ícone | `MentorRelatorio.tsx:310`; `MentorDisponibilidade.tsx:430, 541, 755` | `p-1.5 rounded-lg hover:bg-muted` / `hover:bg-destructive/10 hover:text-destructive` |
| Toggle/segmento | `MentorDisponibilidade.tsx:567-583, 806-823, 844-858` | `px-3 py-2 rounded-lg border` ativo `bg-primary/10 border-primary/40` ou `bg-primary text-primary-foreground` |
| Badge status (painel) | `MentorDisponibilidade.tsx:528, 530, 533` | `text-[10px] px-2 py-0.5 rounded-full bg-status-*/15 text-status-* border border-border` |
| Badge status (lista) | `MentorDisponibilidade.tsx:742, 747, 749` | `text-[10px] px-2 py-0.5 rounded-full bg-status-*/10 text-status-*` (sem borda) |
| Badge status (padrão global, não usado aqui) | `bookingStatus.ts:124-160` | `bg-status-*/12 text-status-* border-status-*/25` + `dot` |
| Empty state (ícone grande) | `MentorRelatorio.tsx:266-270`; `MentorDisponibilidade.tsx:673-676` | `flex-col items-center min-h-[60vh]` + `AlertCircle h-10` / `glass-card p-10 text-center` + `Calendar h-8` |
| Empty state (texto) | `MentorDisponibilidade.tsx:504, 719`; `MentorRelatorio.tsx:415, 458`; `SessionDeliverableDialog.tsx:368` | `text-xs text-muted-foreground py-4|6 text-center` / `italic` / `text-[11px] italic` |
| Loading | `MentorDisponibilidade.tsx:500, 647, 876`; `MentorRelatorio.tsx:395, 577`; `SessionDeliverableDialog.tsx:207, 311`; `GoogleCalendarBanner.tsx:58` | `Loader2 animate-spin` (h-3 / h-3.5 / h-4 / h-5) ou texto "Abrindo..." — nenhum skeleton |
| Dialog | `MentorDisponibilidade.tsx:769`; `SessionDeliverableDialog.tsx:176` | `Dialog/DialogContent/DialogHeader/DialogTitle/DialogFooter` (shadcn) |
| Confirmação destrutiva | `MentorDisponibilidade.tsx:195` | `window.confirm` nativo |
| Inputs | `MentorRelatorio.tsx:388, 616`; `MentorDisponibilidade.tsx:594, 629`; `SessionDeliverableDialog.tsx:335-336` | `bg-card border border-border rounded-lg px-3 py-2 text-sm focus:border-primary/20|30|40` (`.input-begin` existe em `index.css:246` mas não é usado) |
| Animação | ambos | `motion.div` + `staggerContainer`/`fadeUpItem` (`@/lib/animations`) |