# Auditoria — Liberty Begin (membro: Dashboard / Agenda / Perfil / Suporte)

Base das regras: `src/lib/bookingStatus.ts` (status efetivo; "realizada" = `completed` OU `awaiting_report`; usa `is_retroactive` e `report_required`) e `src/lib/sessionProgress.ts` (deduplica por sessão, só `order > 0`, exclui `cancelled`/`not_realized`).

---

## Cruzamento de dados

- [SEVERIDADE: crítico] `src/components/PendingNpsCard.tsx:26` — `.eq("status", "completed")` usa status bruto no banco em vez da regra efetiva — (a) sessões já ocorridas ainda com `scheduled` (efetivo `awaiting_report`, "realizadas" pela regra única) nunca pedem NPS; (b) não filtra `order > 0`, logo pede NPS do Onboarding (`order=0`); (c) não exclui `is_retroactive` (registros históricos lançados pelo admin viram "avaliação pendente" para o aluno) — correção: buscar bookings com `select("..., is_retroactive, report_required, sessions(name, order)")`, filtrar com `isRealizedSessionBooking` + `isJourneySession` + `!is_retroactive` no cliente.

- [SEVERIDADE: alto] `src/components/MemberTimeline.tsx:63-70` e `:161-168` — a trilha de 12 slots é preenchida por **booking** cronológico (1 booking = 1 slot), enquanto `buildSessionProgress` (Dashboard.tsx:77) deduplica por **sessão** — o Dashboard mostra na mesma tela "X/12 concluídas" (Dashboard.tsx:171) e "Y/12 sessões alcançadas" (MemberTimeline.tsx:298) com X ≠ Y sempre que houver sessão repetida (o AgendaOverview.tsx:266-275 permite explicitamente repetir sessão concluída) ou dois bookings da mesma sessão — correção: passar `statusMap`/`journeySessions` de `buildSessionProgress` para o timeline e montar os slots por sessão, não por booking.

- [SEVERIDADE: alto] `src/components/MemberTimeline.tsx:64` — só exclui `cancelled`; `not_realized` e `pending_approval` ocupam slot e o `not_realized` é contado (`:176`) — `sessionProgress.ts:34` usa `isVisibleSessionBooking` (exclui `not_realized`). Resultado: "A agendar" do timeline = 12 − bookings, "sessões a agendar" do AgendaOverview.tsx:536 = 12 − sessões realizadas − agendadas; números diferentes para o mesmo conceito — correção: filtrar com `isVisibleSessionBooking` e reutilizar `availableCount`.

- [SEVERIDADE: alto] `src/pages/Dashboard.tsx:34` e `src/pages/AgendaOverview.tsx:126` — `select` não traz `is_retroactive` nem `report_required`, então `getEffectiveBookingStatus` não consegue aplicar a regra "mapeamento/retroativo não exige relatório" — no Dashboard, o kickoff (3h) passado e lançamentos retroativos aparecem como "Realizada · aguardando relatório" (MemberTimeline.tsx:154) e o modal mostra "Aguardando relatório." (`:435`) eternamente — correção: incluir as duas colunas em todos os selects de bookings que alimentam `getEffectiveBookingStatus` (MemberAgenda usa `select("*")`, está ok).

- [SEVERIDADE: alto] `src/pages/AgendarSessao.tsx:373-421` (fora do escopo, mas causa direta) — após o `insert` do booking não há `invalidateQueries` (grep confirma zero ocorrências no arquivo) e o `QueryClient` global tem `staleTime: 60_000`, `refetchOnMount: false` (App.tsx:61-65) — ao voltar para `/dashboard` (`liberty-bookings`), `/agenda` (`member-agenda`) ou `/agenda/overview` (`overview-bookings`, `overview-availability-all`) o aluno vê por até 60s a sessão que acabou de marcar como inexistente, o slot ainda "disponível" e o `UrgencyBookingCard` ainda gritando "nenhuma sessão agendada" — correção: após sucesso, `queryClient.invalidateQueries` nos prefixos `["liberty-bookings"]`, `["member-agenda"]`, `["overview-bookings"]`, `["overview-availability-all"]`, `["liberty-availability-count"]`, `["journey-bookings"]`.

- [SEVERIDADE: alto] `src/pages/MemberAgenda.tsx:270` vs `:90` — a query de tarefas usa key `["member-agenda-tasks", realBookingIds]` (todos os bookings, `:88`), mas o `invalidateKeys` passa `["member-agenda-tasks", bookingIds]` (só visíveis, `:104`, mais ids demo). Com qualquer booking cancelado no mês os arrays divergem (índices deslocados) e o partial-match do React Query falha → marcar tarefa como feita não atualiza o checklist até o stale expirar — correção: `invalidateKeys={[["member-agenda-tasks"]]}` (prefixo) e não colocar arrays de ids em keys quando o prefixo basta.

- [SEVERIDADE: médio] `src/pages/AgendaOverview.tsx:532` vs `:562` vs `src/pages/MemberAgenda.tsx:156-161` — três semânticas para "agendadas": header do overview usa `scheduledCount` (só efetivo `scheduled`, exclui `pending_approval`), a lista logo abaixo diz "N futuras" incluindo `pending_approval` (`:243`), e a Minha Agenda mostra "confirmadas" + "aguardando aprovação" separados. É possível ver "0 agendadas" no header e "1 futura" na lista — correção: um único par de contadores (confirmadas / aguardando confirmação) com o mesmo vocabulário nas três telas.

- [SEVERIDADE: médio] `src/pages/Dashboard.tsx:109` — `nextScheduled` só aceita `scheduled`; um aluno com booking `pending_approval` (agendou para hoje) não vê card "Próxima sessão", mas a Minha Agenda lista essa sessão como próxima (`MemberAgenda.tsx:110-118`) — correção: incluir `pending_approval` com badge "Aguardando confirmação".

- [SEVERIDADE: médio] `src/pages/Dashboard.tsx:112-134` — `availabilityCount` conta disponibilidade de **todos** os mentores, sem filtrar por mentores que atendem as sessões ainda disponíveis para o aluno (AgendaOverview.tsx:278-283), sem excluir domingo (AgendaOverview.tsx:440 exclui) e sem respeitar o horizonte de 60 dias — o `UrgencyBookingCard` diz "Restam N dias disponíveis" com N diferente do que o aluno encontra em `/agenda/overview` — correção: reutilizar a mesma derivação de `allSlots`/`daysWithSlots` (extrair para hook `useMemberAvailability`).

- [SEVERIDADE: médio] `src/components/MemberTimeline.tsx:370` — legenda "Realizadas — com relatório enviado", mas a contagem (`:174`) inclui `awaiting_report` (sem relatório) — texto contradiz o número — correção: "realizadas (com ou sem relatório)" ou separar o contador de `awaiting_report`.

- [SEVERIDADE: médio] `src/components/UrgencyBookingCard.tsx:25` — "Você só tem 1 sessão agendada **este mês**", porém `scheduledCount` é o total de sessões futuras da jornada, sem recorte mensal — texto factualmente errado — correção: remover "este mês" ou calcular por mês.

- [SEVERIDADE: médio] `src/pages/AgendaOverview.tsx:237-252` — reimplementa parse de data/hora e ordenação (`new Date(\`${date}T${time}\`)`) em vez de `sortByScheduledDateAsc`/`isBookingPast`; hoje é equivalente, mas é a terceira cópia da lógica e ficará fora de sincronia na primeira mudança em `bookingStatus.ts` — correção: `sortByScheduledDateAsc(effectiveBookings.filter(b => ["scheduled","pending_approval"].includes(getEffectiveBookingStatus(b))))`.

- [SEVERIDADE: médio] `src/lib/bookingStatus.ts:51` (regra) refletida em `MemberTimeline.tsx:175` — `pending_approval` no passado nunca expira: um pedido de aprovação não respondido continua "Pendente" na trilha para sempre e ocupa slot — correção: no `getEffectiveBookingStatus`, `pending_approval` com `isBookingPast` → tratar como `not_realized`/`expired` (decisão de produto).

- [SEVERIDADE: baixo] `src/pages/AgendaOverview.tsx:489-494` — `bookedDateMap` só marca dias com `scheduled`; dias com `pending_approval` não ganham o marcador "Já agendada" no calendário, embora apareçam na lista acima — correção: marcar também `pending_approval` com cor amarela.

- [SEVERIDADE: baixo] `src/components/UrgencyBookingCard.tsx:19` — `completedCount >= 12` hardcoded em vez de `BEGIN_JOURNEY_SESSIONS` — correção: importar a constante.

- [SEVERIDADE: baixo] Datas construídas de 4 formas: `new Date(d + "T00:00:00")` (Dashboard.tsx:345), `parseISO(d)` (AgendaOverview.tsx:595, MemberAgenda.tsx:219, PendingNpsCard.tsx:44), `new Date(d + "T12:00:00")` (MemberTimeline.tsx:35), `new Date(\`${d}T${t}\`)` (AgendaOverview.tsx:244) — todas locais, resultado hoje igual, mas `parseISO` de string só-data em ambientes que passem ISO com `Z` quebraria — correção: um helper `parseLocalDate(date, time?)` em `bookingStatus.ts` (já existe `parseBookingDateTime`, exportá-lo).

## Lógica

- [SEVERIDADE: alto] `src/pages/Dashboard.tsx:28-40, 52-64, 66-72, 82-90, 94-102, 112-134` — nenhuma das 6 queries expõe `isLoading`/`isError`; erros do Supabase são descartados (`const { data } = ...; return data || []`) — em falha de rede/RLS o Dashboard renderiza "0/12 concluídas", "Sessão 1 de 12", card de urgência "nenhuma sessão agendada" como se fosse verdade, sem toast — correção: `throw error` no `queryFn`, `isError` → `EmptyState` de erro com retry; `isLoading` → skeleton.

- [SEVERIDADE: alto] `src/pages/AgendaOverview.tsx:106-157, 286-298` — mesmo padrão: sem loading/error; enquanto `sessions` carrega, `bookableSessions` é `[]`, `availableSessions.length === 0` e a tela mostra "Tudo agendado! Você não tem sessões pendentes da jornada" (`:755-762`) por alguns instantes para todo aluno — estado vazio falso — correção: usar `isLoading` das queries de sessions/bookings e renderizar skeleton antes de decidir entre os empty states.

- [SEVERIDADE: médio] `src/pages/AgendaOverview.tsx:106-118` — `sessions` filtra `is_active = true`; se o aluno tem booking `completed` de uma sessão desativada depois, ela sai de `journeySessions` e `buildSessionProgress` deixa de contar (`sessionProgress.ts:35`), enquanto Dashboard.tsx:69 e Journey buscam sem `is_active` — contadores divergem entre telas — correção: alinhar o filtro (buscar todas e usar `is_active` só para "bookable").

- [SEVERIDADE: médio] `src/pages/Dashboard.tsx:53, 83, 95` — `queryKey` contém arrays de ids derivados do render (`allBookingIds`, `mentorIds`) que incluem ids demo → key muda quando o toggle demo liga, gerando refetch com ids `demo-*` para o Supabase (`.in("booking_id", [...demo ids])`) — requisições inúteis e possíveis erros de uuid inválido silenciados — correção: keys com `profile.id` + flag `demoEnabled`; filtrar ids demo antes do `.in()`.

- [SEVERIDADE: médio] `src/pages/MemberAgenda.tsx:62` — `useMemo` com deps `queryStart.toISOString()`/`monthEnd.toISOString()` (strings) e uso de `queryStart`/`monthEnd` (objetos) dentro; funciona, mas `react-hooks/exhaustive-deps` aponta e é frágil — correção: memorizar `queryStart`/`monthEnd` e usá-los como deps.

- [SEVERIDADE: médio] `src/pages/Profile.tsx:19-42` — `useEffect` com dep `refreshProfile`, que em `useAuth.tsx:189` é função recriada a cada render do provider → efeito roda a cada atualização de auth. O `replaceState` evita toast duplo, mas o `setTimeout(500)` (`:25`) com `supabase.functions.invoke` não é cancelado no unmount e o erro do invoke é ignorado (sem `error` check, `:30`) — correção: `useCallback` no `refreshProfile`, dep `[]` no efeito, `AbortController`/flag de unmount, tratar `error`.

- [SEVERIDADE: médio] `src/pages/Profile.tsx:78-96` — `handleDisconnectGoogle` apaga `user_oauth_tokens` sem checar `error` do delete (`:82`); se falhar, o profile é marcado desconectado mas o token continua no banco — correção: checar `error` de ambos e usar RPC transacional.

- [SEVERIDADE: médio] `src/pages/Profile.tsx:110-119` — `handleSave` não valida `fullName` vazio nem formata/valida telefone; permite salvar nome em branco — correção: `trim()` + mínimo de caracteres, máscara de telefone.

- [SEVERIDADE: médio] `src/components/AvatarCropUpload.tsx:19-39` — `getCroppedBlob` com `rotation` aplica rotação ao canvas de saída, mas `areaPx` vem do `react-easy-crop` já em coordenadas da imagem rotacionada; o resultado com rotação ≠ 0 fica deslocado/cortado — correção: usar a receita oficial da lib (`getRotatedImage`/`rotateSize` e desenhar a imagem inteira rotacionada antes de recortar).

- [SEVERIDADE: médio] `src/components/AvatarCropUpload.tsx:73` — path `${user?.id ?? profileId}` enquanto `AvatarUpload.tsx:34` usa `${profileId}`; para o mesmo perfil, uploads pelo admin e pelo próprio usuário vão para pastas diferentes; políticas de storage por pasta podem negar um dos dois — correção: padronizar em `profileId`.

- [SEVERIDADE: médio] `src/components/AvatarUpload.tsx:18-19` — `currentUrl` inicializado de `avatarUrl` uma vez (`useState(avatarUrl)`) e nunca sincronizado quando a prop muda (admin troca de membro no mesmo modal) — mostra a foto do membro anterior — correção: `useEffect(() => setCurrentUrl(avatarUrl), [avatarUrl])` ou componente controlado.

- [SEVERIDADE: médio] `src/components/AvatarUpload.tsx` e `AvatarCropUpload.tsx` — upload novo não apaga o arquivo anterior do bucket (`avatar-${Date.now()}`), acúmulo indefinido — correção: `storage.remove([oldPath])` após update bem-sucedido.

- [SEVERIDADE: baixo] `src/components/PendingNpsCard.tsx:17-35` — sem `isError`; em erro o card simplesmente some (ok), mas também não tem `staleTime` próprio: respondido o NPS, o card permanece até 60s salvo se `NpsForm` invalidar `["pending-nps"]` (grep não encontrou invalidação dessa key em lugar algum) — correção: invalidar `["pending-nps"]` após submit do NPS.

- [SEVERIDADE: baixo] `src/pages/MemberAgenda.tsx:34-37, 143-151` — navegação para meses anteriores sempre resulta em lista vazia por design (`queryStart = today`), mas o botão "‹" continua habilitado e mostra "Nenhuma sessão futura neste mês" — correção: desabilitar retrocesso abaixo do mês atual ou mostrar histórico.

- [SEVERIDADE: baixo] `src/components/WeekTasksBento.tsx:44-47` — `today` calculado a cada render sem memo, e `upcoming` inclui tarefas com `planned_date` inválida (`parseISO` → `Invalid Date`, `d >= todayStart` é `false`, ok) — sem impacto funcional; baixo.

- [SEVERIDADE: baixo] `src/components/MemberQuickMessages.tsx:59` — `document.execCommand("copy")` depreciado; fallback aceitável, mas sem checagem de retorno — o toast "Mensagem copiada!" aparece mesmo se falhar — correção: checar o boolean de retorno.

## UX / Consistência visual

- [SEVERIDADE: alto] Labels para o mesmo estado divergem: "Realizada" (`bookingStatus.ts:131`, `MemberTimeline.tsx:153`), "concluídas" (`Dashboard.tsx:171`, `Journey.tsx:146`), "alcançadas" (`MemberTimeline.tsx:300`), "Já realizadas" (`Journey.tsx:240`); para `pending_approval`: "Aguardando confirmação" (`bookingStatus.ts:151`), "Pendente" (`MemberTimeline.tsx:156`), "aguardando aprovação" (`MemberAgenda.tsx:161`), "aguardando o mentor confirmar" (`MemberTimeline.tsx:372`), "requer aprovação" (`AgendaOverview.tsx:911`) — quem aprova? Mentor ou admin (`AgendarSessao.tsx:368` diz administrador) — correção: usar exclusivamente `bookingStatusConfig.label` e definir no glossário quem aprova.

- [SEVERIDADE: alto] Badge de status com 3 implementações: `StatusBadge` (pill com dot, `StatusBadge.tsx:39-49`) em MemberAgenda/AgendaOverview; chips inline próprios em `MemberTimeline.tsx:151-159` (`statusMeta.chip`, sem dot, cores diferentes: `not_realized` vermelho vs amarelo no config); texto puro no modal (`MemberTimeline.tsx:413`); `Journey.tsx:21` tem outro mapa próprio — correção: `MemberTimeline` e `Journey` devem consumir `StatusBadge`/`bookingStatusConfig`.

- [SEVERIDADE: alto] Toques < 44px em mobile: setas de mês `p-1.5` com ícone 16px (~28px) em `AgendaOverview.tsx:632,650` e `MemberAgenda.tsx:143,149`; botões de semana `p-1` com ícone 14px (~22px) em `WeekTasksBento.tsx:147-160`; botão copiar `p-1.5` em `MemberQuickMessages.tsx:92`; link "Enviar" `text-[10px] px-1` em `:102`; dots da trilha `h-5 w-5` (20px) em `MemberTimeline.tsx:337`; grupo toggle `py-1 text-[11px]` em `AgendaOverview.tsx:788` — correção: `min-h-11 min-w-11` nos alvos de toque ou área de clique expandida.

- [SEVERIDADE: médio] Botão primário com 5 variantes: `.btn-silver` (`px-6 py-3`, index.css:238) usado com override `text-xs px-3 py-1.5` (`MemberAgenda.tsx:255`), `text-sm px-4 py-2` (`:132`), `w-full text-sm` (`Dashboard.tsx:350`), `py-4 text-base` (`Support.tsx:42`); e um segundo primário ad hoc `bg-foreground text-background rounded-lg px-4 py-2.5` (`UrgencyBookingCard.tsx:73`, `PendingNpsCard.tsx:80`) — correção: componente `Button` com `size`/`variant`.

- [SEVERIDADE: médio] Botão secundário sem padrão: `border border-border rounded-lg text-xs px-3 py-1.5` (`AvatarUpload.tsx:101`, `AvatarCropUpload.tsx:129`, `Profile.tsx:239`), `text-sm px-4 py-2` (`AvatarCropUpload.tsx:199`), `text-xs px-4 py-2 border text-destructive` (`Profile.tsx:226`), `text-[11px] px-2.5 py-1.5 bg-background/60` (`MemberDiagnosticCard.tsx:98`), `text-[11px] bg-card` (`MemberQuickMessages.tsx:72`) — correção: idem, `Button variant="outline"`.

- [SEVERIDADE: médio] Cards: `.glass-card` (`rounded-xl`) na maioria; `rounded-2xl border bg-card/70` em `MemberTimeline.tsx:187` e `MemberDiagnosticCard.tsx:85`; `rounded-2xl` com gradiente em `UrgencyBookingCard.tsx:42` / `PendingNpsCard.tsx:51`; `rounded-lg border bg-card shadow-sm` em `AgendaOverview.tsx:572`; `dark glass-card` forçando tema escuro dentro de tela clara em `Dashboard.tsx:327` e `MemberAgenda.tsx:196` — ilhas escuras em página clara — correção: eliminar `dark` inline; um `Card` com `variant`.

- [SEVERIDADE: médio] `.glass-card:hover` (index.css:231-235) aplica `translateY(-2px)` + sombra em **todo** card, inclusive não clicáveis (hero de progresso `Dashboard.tsx:155`, form de perfil `Profile.tsx:157`, FAQ `Support.tsx:57`) — affordance falsa de clicável — correção: hover só em `.glass-card-interactive`/`a.glass-card`.

- [SEVERIDADE: médio] Empty states: componente `EmptyState` só em `MemberAgenda.tsx:175`; `AgendaOverview.tsx:755-774` e `WeekTasksBento.tsx:67-73` usam markup próprio (ícone + p), `MemberTimeline.tsx:278` usa bloco `border-dashed`; Dashboard não tem empty state algum para 0 bookings/0 tarefas (só omite blocos) — correção: usar `EmptyState` em todos.

- [SEVERIDADE: médio] Loading: `MemberAgenda.tsx:170` texto "Carregando..."; `MemberDiagnosticCard.tsx:72` `Loader2` spinner; Dashboard/AgendaOverview/Journey nada (renderizam zeros) — correção: `Skeleton` compartilhado.

- [SEVERIDADE: médio] Hierarquia tipográfica de título: `h1 text-2xl` (Dashboard:150, AgendaOverview:524, MemberAgenda:126, Profile:130) vs `h1 text-3xl` centralizado (`Support.tsx:29`) vs `h1 text-xl` (`AgendaOverview.tsx:506`); `h2` varia entre `text-sm` (`AgendaOverview.tsx:559`, `Profile.tsx:158`), `text-lg` (`MemberTimeline.tsx:194`, `WeekTasksBento.tsx:83`) e `text-xl` (`Support.tsx:54`) — correção: escala fixa (h1 2xl / h2 lg / h3 sm).

- [SEVERIDADE: médio] Datas em formatos diferentes na mesma jornada: "EEEE, dd 'de' MMMM" (`Dashboard.tsx:345`), bloco MMM/dd (`AgendaOverview.tsx:595`, `MemberAgenda.tsx:219`), "dd MMM" via `toLocaleDateString` (`MemberTimeline.tsx:35`), "dd 'de' MMMM" (`PendingNpsCard.tsx:44`), "EEE, dd MMM" (`AgendaOverview.tsx:885`, `WeekTasksBento.tsx:108`) — correção: `formatDateLong/Short` em `lib/date.ts`.

- [SEVERIDADE: médio] Ícones divergentes para a mesma ação/conceito: "Agendar" usa `Calendar` (`MemberAgenda.tsx:134`), `CalendarCheck` (`UrgencyBookingCard.tsx:82`), `Star` para "a agendar" (`AgendaOverview.tsx:535`); "sessão agendada" usa `Calendar` azul (MemberAgenda:155) e `CalendarCheck` azul (AgendaOverview:531) e `CalendarClock` (AgendaOverview:703,718); suporte usa `Headphones` (`Dashboard.tsx:393`) e `MessageCircle` (`Support.tsx:44`); "Jornada" e "Conteúdos" usam o mesmo `BookOpen` (`Dashboard.tsx:361,371`) — correção: mapa de ícones semântico único.

- [SEVERIDADE: médio] `src/components/AvatarUpload.tsx:59`, `AvatarCropUpload.tsx:94` — `window.confirm` nativo para ação destrutiva, enquanto o resto do app usa `Dialog` — correção: `AlertDialog` do design system.

- [SEVERIDADE: médio] `src/pages/Profile.tsx:232` — botão de conexão Google mostra apenas `"..."` durante loading; `Profile.tsx:237-242` "Sincronizar minhas sessões agora" fica fora do card de integração (margem `mt-3` solta) — correção: `Loader2` + texto, mover para dentro do bloco.

- [SEVERIDADE: médio] `src/pages/Support.tsx:8,10,11` — FAQ promete "Remarcar" (não existe botão de remarcar na Minha Agenda), usa termo em inglês "no-show" (o app chama "Não realizada") e diz que o link Zoom "aparece no dashboard" (só aparece se `zoom_join_url` existir) — correção: alinhar FAQ ao produto.

- [SEVERIDADE: médio] `src/pages/Dashboard.tsx:387-395` e `Support.tsx:39` — número de WhatsApp placeholder `5511999999999` hardcoded — correção: `import.meta.env.VITE_SUPPORT_WHATSAPP`.

- [SEVERIDADE: baixo] `src/pages/Dashboard.tsx:160` — "Sessão 13 de 12" é evitado com `Math.min`, mas "Sessão N de 12" com N = concluídas+1 pressupõe ordem linear; com sessão repetida o número não corresponde à sessão real — correção: mostrar "N de 12 realizadas".

- [SEVERIDADE: baixo] `src/pages/AgendaOverview.tsx:601-604`, `MemberAgenda.tsx:227,231` — `truncate` em nome de sessão e mentor em cards de 1/3 de largura em mobile (grid `md:grid-cols-2 xl:grid-cols-3`) — nomes longos cortados sem tooltip — correção: `title` ou `line-clamp-2`.

- [SEVERIDADE: baixo] `src/components/MemberTimeline.tsx:312-364` — 13 elementos (`justify-between`) de 20px em largura de celular (~340px) ficam com ~6px de gap; o rótulo "Presente" absoluto (`:362`) sobrepõe a legenda; sem scroll horizontal — correção: grid 6×2 em `sm:`.

- [SEVERIDADE: baixo] `src/components/UrgencyBookingCard.tsx:45-56`, `PendingNpsCard.tsx:53-58` — animações infinitas (`repeat: Infinity`) sem respeitar `prefers-reduced-motion` — correção: `useReducedMotion()` do framer-motion.

- [SEVERIDADE: baixo] `src/components/WeekTasksBento.tsx:172` — clicar em um dia com N tarefas abre o diálogo apenas da primeira (`dayTasks[0]`), sem indicar que há outras — correção: listar tarefas do dia.

- [SEVERIDADE: baixo] `src/pages/MemberAgenda.tsx:263` — seção expandida só aparece se `bTasks.length > 0`; o card inteiro é clicável (`cursor-pointer`, `:213`) mesmo sem nada para expandir — correção: `cursor-default` quando não há tarefas.

## Acessibilidade / idioma

- [SEVERIDADE: médio] Botões só-ícone sem `aria-label`: `MemberAgenda.tsx:143,149` (setas de mês), `WeekTasksBento.tsx:147-160` (usam `title`, não lido por todos os leitores), `MemberQuickMessages.tsx:90` (só `title`), `Support.tsx:58` (FAQ sem `aria-expanded`), `AgendaOverview.tsx:839` (acordeão sem `aria-expanded`/`aria-controls`) — correção: `aria-label` + `aria-expanded`.

- [SEVERIDADE: médio] `src/pages/MemberAgenda.tsx:198-215` — `div` com `onClick` e `cursor-pointer` (sem `role="button"`, `tabIndex`, `onKeyDown`) — não operável por teclado — correção: `<button>`.

- [SEVERIDADE: médio] `src/pages/Profile.tsx:164-165,169,178` — `<label>` sem `htmlFor`/`id` no input — correção: associar.

- [SEVERIDADE: médio] `src/components/MemberTimeline.tsx:316-326` — slots vazios são `div` com `title` apenas; dots preenchidos dependem de cor de fundo para status (sem texto além do número) — correção: `aria-label` com status.

- [SEVERIDADE: baixo] `src/pages/Dashboard.tsx:263` — `<summary>` com `list-none` remove o marcador nativo e não adiciona indicação acessível de expansível além do ícone — baixo.

- [SEVERIDADE: baixo] Inglês misturado em UI: "no-show" (`Support.tsx:10`), `humanize` de status desconhecido gera label em inglês (`StatusBadge.tsx:29`); comentários/nomes em inglês são ok, mas `alt=""` em imagens de capa (`AgendaOverview.tsx:581,845`) enquanto Dashboard usa `alt={nome}` — inconsistente.

## Qualidade

- [SEVERIDADE: médio] `src/pages/Dashboard.tsx:136-141` — `sessionSummaries` calculado e nunca usado (código morto com custo de render).
- [SEVERIDADE: médio] `any`: `Dashboard.tsx:73,103,128,241,243`; `AgendaOverview.tsx:787`; `MemberAgenda.tsx:85`; `PendingNpsCard.tsx:30-32`; `MemberTimeline.tsx:21,25,59,245`; `MemberDiagnosticCard.tsx:51,55` (com eslint-disable); `Profile.tsx:15` (`useAuth() as any` — esconde que `refreshProfile`/`updateProfile` já estão tipados); `WeekTasksBento.tsx:237`; `AvatarUpload.tsx:51,72`; `AvatarCropUpload.tsx:86,103`; `StatusBadge.tsx:36`; `AgendarSessao.tsx:380` — correção: tipar `Booking`/`Report` a partir de `Database["public"]["Tables"]`.
- [SEVERIDADE: médio] Duplicação: `AvatarUpload.tsx` vs `AvatarCropUpload.tsx` (mesmo fluxo de upload/remoção/invalidação, um sem crop) — manter só o crop com prop `enableCrop`. `UrgencyBookingCard.tsx` vs `PendingNpsCard.tsx` — markup ~90% idêntico (card com glow, chip, headline, CTA, número grande) → extrair `HighlightCard`.
- [SEVERIDADE: baixo] Imports não usados: `Dashboard.tsx:16` `getEffectiveBookingStatus`/`isVisibleSessionBooking` são usados, ok; `AgendaOverview.tsx:18 Filter` usado; `MemberTimeline.tsx:1` `useState` usado. `Profile.tsx` importa `supabase` e `useEffect` usados. Nenhum import morto relevante além de `AgendaOverview.tsx:12 ArrowRight` (não usado) e `MemberAgenda.tsx:4 Target` (usado). → `ArrowRight` em `AgendaOverview.tsx:12`.
- [SEVERIDADE: baixo] `src/components/MemberTimeline.tsx:183` — `noDataYet` calculado e não usado; `completedCount` (`:79`) não usado.
- [SEVERIDADE: baixo] `src/pages/AgendaOverview.tsx:160-216, 300-354` — ~120 linhas de dados demo dentro do componente de produção; mover para `lib/demoForUser.ts` (que já existe e é usado pelo Dashboard/MemberAgenda — duas fontes de dados demo divergentes).
- [SEVERIDADE: baixo] `src/lib/bookingStatus.ts:1` — `EffectiveBookingStatus` inclui `| string`, anulando o union; `switch` em `MemberTimeline.tsx:152` não é exaustivo (viola regra `typescript-exhaustive-switch`).
- [SEVERIDADE: baixo] `src/components/StatusBadge.tsx:9-13` — prop `variant="task"` aceita `TaskStatus` mas o tipo `status` é `string`, sem exaustividade.
- [SEVERIDADE: baixo] Mistura de `format` (date-fns) e `toLocaleDateString` (`MemberTimeline.tsx:35,101`) — padronizar em date-fns com `ptBR`.

---

## Inventário do design system (por tela)

| Tela | Título | Card | Botão primário | Botão secundário | Badge status | Empty state | Loading |
|---|---|---|---|---|---|---|---|
| Dashboard.tsx | eyebrow `text-[10px] uppercase` + `h1 text-2xl font-semibold` (:149-150) | `.glass-card p-6` (:155); `dark glass-card` (:327); `<Link className="glass-card p-5/6">` (:306,359) | `.btn-silver w-full text-sm` (:350); `.btn-silver rounded-full px-5 py-3` FAB (:391) | link texto `text-primary` + `ArrowRight` (:318,365) | nenhum (delegado ao MemberTimeline: chips próprios) | nenhum (blocos omitidos) | nenhum |
| AgendaOverview.tsx | `h1 text-2xl font-semibold` (:524); `h1 text-xl` (:506) | `.glass-card p-5` (:626,732); `rounded-lg border bg-card shadow-sm` (:572); aviso `rounded-lg border-dashed bg-primary/5` (:545) | nenhum (slots são `<Link rounded border py-1.5>` :890) | pills `text-[11px] px-2.5 py-1 rounded-full border` (:788); `text-[11px] text-primary hover:underline` (:723,748); setas `p-1.5 rounded-lg` (:632) | `StatusBadge` (:586,607); chip texto `text-[9px] rounded bg-muted/40` "requer aprovação" (:910) | markup próprio: ícone 32px + `p text-sm font-medium` + `p text-xs` (:755-774) | nenhum |
| MemberAgenda.tsx | `h1 text-2xl font-semibold` + sub `text-sm` (:126-127) | `dark glass-card bg-card` (:196) | `.btn-silver text-sm px-4 py-2` (:132,180); `.btn-silver text-xs px-3 py-1.5` (:255) | setas `p-1.5 rounded-lg` sem aria (:143) | `StatusBadge` (:208,239); pill `text-[10px] rounded-full bg-muted` tarefas (:241) | `EmptyState` (:175) | `.glass-card p-8` + texto "Carregando..." (:170) |
| MemberTimeline.tsx | eyebrow `text-[10px]` + `h2 text-lg font-semibold` (:191-194); `h3 text-sm` (:291) | `rounded-2xl border bg-card/70 p-5/6` (:187); interno `rounded-xl border-border/70 bg-background/30` (:288) | `.btn-silver w-full text-xs` (:430) | `px-3 py-1.5 rounded-lg border bg-background/40` pace chip (:207) | chips próprios `statusMeta.chip` (:151-159); texto puro no modal (:413); dots coloridos via `style` (:340) | `rounded-xl border-dashed p-6 text-xs` (:278) | nenhum |
| UrgencyBookingCard / PendingNpsCard | `h3 text-xl md:text-2xl` (:68 / :70) | `rounded-2xl border gradient p-6 md:p-7` (:42 / :51) | `bg-foreground text-background rounded-lg px-4 py-2.5 text-sm font-semibold` (:73 / :80) | — | chip `rounded-full text-[11px] uppercase` animado (:61 / :63) | — (retorna `null`) | — |
| WeekTasksBento.tsx | `h2 text-lg font-semibold` + ícone (:83) | `.glass-card overflow-hidden` (:77); foco `rounded-xl border-primary/30 bg-primary/5` (:96); item `rounded-lg bg-card border` (:224) | — | `text-[10px] px-2 py-0.5 rounded bg-muted` (:142); `p-1 rounded` setas (:149) | ícones `CheckCircle2/PlayCircle/CircleDot` (:59-63), pills `text-[11px] rounded-full` (:107,112) | `.glass-card p-8 text-center` + `h2 text-lg` (:67-73); `rounded-xl border-dashed p-5` (:125) | nenhum |
| MemberDiagnosticCard.tsx | eyebrow `text-[10px] uppercase` (:88) | `rounded-2xl border bg-card/70 p-4` (:85) | — | `rounded-lg border bg-background/60 px-2.5 py-1.5 text-[11px]` (:98) | — | `null` (:78) | `rounded-2xl border p-6` + `Loader2 h-4` (:71-75) |
| MemberQuickMessages.tsx | `p text-[10px] uppercase` (:82) | popover `rounded-xl border bg-card shadow-xl p-2` (:81); item `rounded-lg border-border/70 bg-background/40 p-2` (:86) | link `text-[10px] text-status-green` "Enviar" (:102) | trigger `px-2.5 py-1.5 rounded-lg bg-card border text-[11px]` (:72); `p-1.5 rounded-md` copiar (:92) | — | — | — |
| Support.tsx | `h1 text-3xl font-semibold` centralizado (:29); `h2 text-xl` (:54) | `.glass-card` (:57) | `.btn-silver w-full py-4 text-base` (:42) | — | — | — | — |
| Profile.tsx | `h1 text-2xl font-semibold` (:130); `h2 text-sm font-semibold` + ícone (:158,193) | `.glass-card p-6` (:135,157,192); interno `rounded-lg border bg-background/50 p-4` (:201) | `.btn-silver text-sm` (:185); `.btn-silver` via classe condicional `text-xs px-4 py-2` (:226) | `text-xs px-4 py-2 rounded-lg border text-destructive` (:226); `text-xs px-3 py-1.5 rounded-lg border` (:239); link texto `text-destructive` sair (:254) | `CheckCircle2 h-3 text-status-green` + texto (:149,215) | — | texto "Carregando..." (:145); botão `"..."` (:232) |
| AvatarUpload / AvatarCropUpload | `DialogTitle` padrão (Crop :161) | círculo `bg-primary/10 border-primary/20` (:82) / `UserAvatar` | `.btn-silver text-sm` (Crop :207) | `text-xs px-3 py-1.5 rounded-lg border` (:101 / :129,187); `text-sm px-4 py-2 rounded-lg border` (Crop :199); destrutivo `text-muted-foreground hover:text-destructive` (:111 / :139) | — | — | overlay `Loader2 h-5` (Upload :91); `Loader2 h-4` inline (Crop :209) |
| StatusBadge.tsx (canônico) | — | — | — | — | `rounded-full border font-medium` `sm: text-[10px] px-2 py-0.5` / `md: text-xs px-2.5 py-1` + dot (:16-19,39-49) | — | — |
| EmptyState.tsx (canônico) | `p text-base/sm font-semibold` | `rounded-xl border-dashed bg-card/40 px-6 py-12` | via `action` | — | — | ícone em círculo `h-12 w-12 bg-muted/60` | — |

Resumo da inconsistência: 3 radii para card (`xl`, `2xl`, `lg`), 5 tamanhos de `.btn-silver` mais um primário paralelo (`bg-foreground`), 6 variantes de secundário, 3 implementações de badge de status, 4 empty states distintos (1 canônico), 4 estados de loading distintos (nenhum canônico), 2 escalas de `h1` e 3 de `h2`.