# Auditoria de Design System — Área do Membro (role `liberty`)

Escopo lido integralmente: `index.css`, `ui/button.tsx`, `ui/card.tsx`, `ui/badge.tsx`, `AppLayout.tsx`, `StatusBadge.tsx`, `EmptyState.tsx`, `lib/bookingStatus.ts` (para labels), e as 10 telas/componentes do escopo. Nenhum arquivo foi editado.

> Premissa sobre radius: `--radius: 0.75rem` (12px). Com o `tailwind.config` padrão shadcn, `rounded-lg = 12px`, `rounded-md = 10px`, `rounded-sm = 8px`; `rounded-xl` (12px fixo), `rounded-2xl` (16px), `rounded` (4px) são fixos do Tailwind. Ou seja, **`rounded-lg` e `rounded-xl` renderizam iguais hoje**, mas divergem assim que alguém mexer em `--radius`.

---

## 0. Achados estruturais (base) que afetam todas as telas

- [alto] `src/index.css:261-263` — regra global `:where([class*=" border-"])… { border-color: hsl(var(--stroke-subtle)) !important }` neutraliza **toda** borda colorida (`border-status-yellow/40`, `border-primary/50`, `border-status-blue/25`…) — em relação ao que o código das telas declara — resultado: dezenas de classes de borda colorida são código morto (ex.: `UrgencyBookingCard.tsx:42`, `Journey.tsx:362`, `AgendaOverview.tsx:573`, `bookingStatusConfig` em `bookingStatus.ts:127`). Só `MemberTimeline.tsx:341` escapa (inline style). Decidir: ou remover o override e padronizar bordas via token, ou remover as classes coloridas.
- [médio] `src/index.css:265-267` — `border-2` forçado para 1px (`!important`) — em relação a `Dashboard.tsx:203`, `MemberTimeline.tsx:320/337/354` que pedem `border-2` — sugestão: eliminar `border-2` do código ou remover o override.
- [médio] `src/index.css:273-276` — `ring-*` forçado para `stroke-focus` com offset 0 — em relação a `Journey.tsx:362`, `AgendarSessao.tsx:677`, `AgendaOverview.tsx:690` (`ring-primary/30-40`) — o destaque de kickoff/selecionado fica quase invisível. Padronizar um único token de "selected".
- [alto] `src/index.css:218-235` — `.glass-card` tem `hover: translateY(-2px) + shadow` **sempre**, inclusive em cards estáticos (hero do Dashboard, Login, resumo de confirmação) — as telas contornam com `style={{ transform: "none" }}` em `AgendarSessao.tsx:587, 759, 849, 890, 952, 985` — sugestão: `glass-card` estático por padrão e `glass-card--interactive` (ou prop `interactive` no `SectionCard`).
- [alto] `src/index.css:237-239` vs `src/components/ui/button.tsx:8-24` — dois sistemas de botão primário coexistem: `.btn-silver` (`rounded-lg`, `px-6 py-3`, `font-semibold`, sem altura fixa, sem `focus-visible`, sem `disabled`) vs `<Button>` (`rounded-md`, `h-10`, `font-medium`, com foco/disabled). Radius, peso e altura divergem. Sugestão: `btn-silver` vira `variant="primary"` do `<Button>` e a classe é deprecada.
- [médio] `src/components/ui/card.tsx:6,12,19` — `<Card>` é `rounded-lg shadow-sm`, `CardHeader p-6`, `CardTitle text-2xl` — em relação a `.glass-card` (`rounded-xl`, sem sombra, padding livre) — `<Card>` não é usado em nenhuma tela do membro; existe um componente canônico ignorado. Unificar em um só.
- [médio] `src/components/ui/badge.tsx:7` (`px-2.5 py-0.5 text-xs font-semibold`) vs `StatusBadge.tsx:17-18` (`text-[10px] px-2 py-0.5 font-medium`) vs `.status-badge` em `index.css:250-252` (`px-3 py-1 text-xs uppercase tracking-wide`) — três "pills" base com métricas diferentes. Manter só `StatusBadge` (renomear `StatusPill`).
- [médio] `AppLayout.tsx:198-201, 194-197` — 4 bolhas flutuantes fixas (Profile, Bell, Theme, Refresh) + backdrop de 4rem + `paddingTop 4.5rem` — em relação a um header de página convencional — a página não tem header estrutural; cada tela reinventa o título. Sugestão: `PageHeader` dentro do layout, bolhas viram ações do header.
- [baixo] `AppLayout.tsx:185` — botão "Sair" sem `rounded-lg hover:bg-sidebar-accent` — em relação ao botão de tema em `:176` — igualar.
- [baixo] `AppLayout.tsx:225` — bottom nav `text-[10px]` — contraste/legibilidade; HIG recomenda ≥ 10pt com peso medium; usar `text-[11px] font-medium`.

---

## 1. Título de página

| Tela | arquivo:linha | Tag | Classes | Tamanho / peso | Subtítulo | Eyebrow |
|---|---|---|---|---|---|---|
| Login (hero desktop) | `Login.tsx:85` | h1 | `text-5xl font-bold leading-tight mb-4` | 48px / 700 | `p text-lg font-light` (:88) | — |
| Login (card) | `Login.tsx:99-102` | h2 | `text-xl font-medium mb-2` + linha decorativa `w-8 h-px bg-primary` | 20px / 500 | — | — |
| Onboarding (etapa) | `Onboarding.tsx:588` | h1 | `text-2xl md:text-4xl font-bold leading-tight mb-2` | 24→36px / 700 | `p text-sm md:text-base mb-8` (:589) | `text-xs uppercase tracking-wider text-primary/80` + emoji (:584) |
| Onboarding (done) | `Onboarding.tsx:321` | h1 | `text-4xl md:text-5xl font-bold mb-3` | 36→48px / 700 | `p text-lg` (:322) | — |
| Dashboard | `Dashboard.tsx:150` | h1 | `text-2xl font-semibold` | 24px / 600 | `p text-sm mt-1` (:151) | `p text-[10px] uppercase tracking-[0.14em] font-semibold` "Minha jornada" (:149) |
| Jornada | `Journey.tsx:133` | h1 | `text-2xl font-semibold` | 24px / 600 | `p text-sm` **sem mt-1** (:134) | — |
| Agenda overview | `AgendaOverview.tsx:524` | h1 | `text-2xl font-semibold` | 24px / 600 | `p text-sm mt-1` (:525) | — (stats à direita `text-xs`, :529) |
| Agendar sessão | `AgendarSessao.tsx:501` | h1 | `text-2xl font-semibold` (título dinâmico "Agendar: {sessão}") | 24px / 600 | `p text-sm` "Etapa X de Y" **sem mt-1** (:504) | — (botão voltar à esquerda) |
| Agendar — sucesso | `AgendarSessao.tsx:580` | h2 | `text-2xl font-semibold` | 24px / 600 | `p text-sm mt-2` | — |
| Minha Agenda | `MemberAgenda.tsx:126` | h1 | `text-2xl font-semibold` | 24px / 600 | `p text-sm mt-1` (:127) | — (btn-silver à direita) |
| Programa encerrado | `AgendaOverview.tsx:506`, `AgendarSessao.tsx:460` | h1 | `text-xl font-semibold` | 20px / 600 | `p text-sm` | — |

Achados:
- [alto] `Login.tsx:85`, `Onboarding.tsx:321,588` — `font-bold` + `text-4xl/5xl` — em relação ao padrão `text-2xl font-semibold` das 5 telas logadas — reduzir para dois níveis: Display (`text-3xl font-semibold`, só Login/Onboarding) e Title (`text-2xl font-semibold`).
- [alto] `Dashboard.tsx:149` — eyebrow "Minha jornada" na tela **Início** enquanto `Journey.tsx:133` tem h1 "Minha Jornada" — duas telas com o mesmo rótulo — em relação ao menu (`AppLayout.tsx:31-32` "Início"/"Minha Jornada") — trocar eyebrow por "Início" ou remover.
- [médio] `AgendaOverview.tsx:524` "Sua agenda" vs `MemberAgenda.tsx:126` "Minha Agenda" vs menu "Agenda" — três nomes para a mesma área — unificar em "Agenda".
- [médio] `Journey.tsx:134`, `AgendarSessao.tsx:504` — subtítulo sem `mt-1` — em relação a `Dashboard.tsx:151`, `AgendaOverview.tsx:525`, `MemberAgenda.tsx:127` — `PageHeader` resolve.
- [médio] `Login.tsx:102` — linha decorativa `w-8 h-px bg-primary` sob título — ornamento único no app — remover.
- [baixo] `AgendarSessao.tsx:501` — título dinâmico longo "Agendar: Mapeamento do Negócio" quebra em 2 linhas no mobile — usar h1 fixo "Agendar sessão" e nome da sessão no subtítulo.

---

## 2. Botões

### 2.1 Inventário de variações

| # | Variação | Classes | Altura est. | Radius | Peso | Onde |
|---|---|---|---|---|---|---|
| A | `<Button>` default | `h-10 px-4 rounded-md text-sm font-medium` | 40px | md (10) | 500 | `Onboarding.tsx:605` (size lg → 44px) |
| B | `<Button variant=ghost>` | `h-10 rounded-md` | 40px | md | 500 | `Onboarding.tsx:596` |
| C | `<Button variant=outline size=icon>` | `h-11 w-11` | 44px | md | — | `Onboarding.tsx:426` |
| D | `.btn-silver` full | `px-6 py-3 rounded-lg font-semibold text-sm` | ~44px | lg (12) | 600 | `Login.tsx:129` (+`uppercase tracking-wider`), `Dashboard.tsx:350` (`<a>`), `AgendarSessao.tsx:617,939,968,993`, `MemberTimeline.tsx:430` (text-xs) |
| E | `.btn-silver` compacto | `text-xs px-3 py-1.5` | **~28px** | lg | 600 | `Journey.tsx:451,462`, `MemberAgenda.tsx:255` |
| F | `.btn-silver` micro | `text-[11px] px-3 py-1.5` | **~27px** | lg | 600 | `Journey.tsx:276` |
| G | `.btn-silver` médio | `text-sm px-4 py-2` | ~36px | lg | 600 | `MemberAgenda.tsx:130,180` |
| H | `.btn-silver` FAB | `rounded-full px-5 py-3 shadow-lg fixed` | ~40px | full | 600 | `Dashboard.tsx:391` |
| I | CTA invertido (span) | `px-4 py-2.5 rounded-lg bg-foreground text-background text-sm font-semibold shadow-lg` | 40px | lg | 600 | `UrgencyBookingCard.tsx:74`, `PendingNpsCard.tsx:80` |
| J | Secundário nativo | `py-3 border border-border rounded-lg text-sm text-muted-foreground` | ~44px | lg | 400 | `AgendarSessao.tsx:620 (a), 942` |
| K | Secundário nativo baixo | `py-2.5 border rounded-lg text-sm` | ~40px | lg | 400 | `AgendarSessao.tsx:971` |
| L | Ícone nativo | `p-1.5 rounded-lg hover:bg-muted` + ícone h-4 | **28px** | lg | — | `AgendaOverview.tsx:632,650`, `AgendarSessao.tsx:761,765`, `MemberAgenda.tsx:143,149` |
| M | Ícone nativo maior | `p-2 rounded-lg` + h-4 | **32px** | lg | — | `AgendarSessao.tsx:495` |
| N | Ícone sem área | `absolute right-3` + h-4, sem padding | **16px** | — | — | `Login.tsx:122` |
| O | Texto puro | `text-sm text-muted-foreground hover:text-primary` | linha | — | 400 | `Login.tsx:137,138,144`; `text-xs` em `Onboarding.tsx:573` |
| P | Link-CTA inline | `text-sm text-primary` + `ArrowRight h-3.5` + `group-hover:gap-2.5` | linha | — | 400 | `Dashboard.tsx:318,365,375` |
| Q | Link `text-[11px] text-primary hover:underline` | | linha | — | 400 | `AgendaOverview.tsx:723,748` |
| R | Chip filtro | `text-[11px] px-2.5 py-1 rounded-full border` | **~22px** | full | 400 | `AgendaOverview.tsx:788` |
| S | Chip resposta | `px-3.5 py-2 rounded-lg border text-sm` | ~36px | lg | 400 | `Onboarding.tsx:388-396` |
| T | Dia do calendário | `aspect-square rounded-lg text-xs` (com/sem borda) | variável | lg | 500 | `AgendaOverview.tsx:684-696`, `AgendarSessao.tsx:786-799` |
| U | Slot horário | `p-4 rounded-xl border text-sm font-semibold` | ~56px | xl | 600 | `AgendarSessao.tsx:829-837` |
| V | Slot horário (lista) | `<Link>` `rounded border py-1.5` | ~36px | **4px** | — | `AgendaOverview.tsx:887-891` |
| W | Card-botão | `<button class="dark glass-card">` | — | xl | — | `AgendarSessao.tsx:667-680` |
| X | Dot da timeline | `h-5 w-5 rounded-full border-2` | **20px** | full | 700 | `MemberTimeline.tsx:332-344` |
| Y | `<details><summary>` nativo | `text-lg font-semibold cursor-pointer` | — | — | 600 | `Dashboard.tsx:262-270` |

**25 variações** para o que deveria ser ~5 (Primary, Secondary, Tertiary/Text, Icon, Chip).

### 2.2 Contagem por tela

| Tela | shadcn `<Button>` | `btn-silver` | nativo/`<a>`/span estilizado | ícone sem aria-label |
|---|---|---|---|---|
| Login | 0 | 1 (D) | 4 (N, O×3) + 1 link | 1 (`:122`) |
| Onboarding | 3 (A,B,C) | 0 | 1 (O `:573`) + chips (S) + label-checkbox (`:516`) | 0 |
| Dashboard | 0 | 2 (D,H) | 3 (P) + summary (Y) + 3 `<Link>` cards | 1 (FAB no mobile, `:391-394`) |
| Jornada | 0 | 3 (E,E,F) | 2 divs clicáveis (`:368,391`) | — (chevron decorativo `:470`) |
| Agenda overview | 0 | 0 | 2 (L) + 2 (Q) + 3 (R) + N grupos + 42 dias (T) + N slots (V) | 0 (tem aria-label) |
| Agendar sessão | 0 | 4 (D) | 3 (J,J,K) + 3 (L,L,M) + N cards (W) + N dias (T) + N slots (U) | 3 (`:495,761,765`) |
| Minha Agenda | 0 | 3 (G,G,E) | 2 (L) + 2 divs clicáveis (`:199,213`) | 2 (`:143,149`) |
| Urgency/NPS | 0 | 0 | 1 cada (I) | 0 |
| MemberTimeline | 0 | 1 (D text-xs) | 12 (X) | 0 (usa `title`) |

Achados:
- [alto] `Journey.tsx:276,451,462`, `MemberAgenda.tsx:255` — `btn-silver` com `py-1.5` → 27-28px de altura — em relação ao mínimo 44px HIG e ao `Button lg` de `Onboarding.tsx:605` — substituir por `<Button size="sm">` (36px) com hit-area ≥44 via `min-h-11` no mobile.
- [alto] `UrgencyBookingCard.tsx:74`, `PendingNpsCard.tsx:80` — botão invertido `bg-foreground text-background` — quarta cor de CTA primário (o app já tem `bg-primary`) — usar `<Button>` default.
- [alto] `Login.tsx:129` (`uppercase tracking-wider` via classe) vs `AgendarSessao.tsx:939` ("ENVIAR PARA CONFIRMAÇÃO" caps literal) vs demais em sentence case — três casings para o CTA primário — sentence case em todos.
- [médio] `AgendarSessao.tsx:620,942` (py-3) vs `:971` (py-2.5) — secundário com duas alturas no mesmo arquivo — `<Button variant="outline">`.
- [médio] `Dashboard.tsx:318,365,375` — CTA "texto + seta" com `group-hover:gap-2.5` — padrão que só existe no Dashboard — virar `<Button variant="link">` ou chevron à direita no `ListRow`.
- [médio] `Dashboard.tsx:387-395` — FAB fixo `bottom-24 right-6` — único no app; concorre com bottom-nav e as 4 bolhas — mover "Suporte" para menu (já existe em `AppLayout.tsx:40`) ou para `PageHeader`.
- [baixo] `Onboarding.tsx:603,608` — `ArrowLeft className="w-4 h-4 mr-2"` — `Button` já aplica `gap-2` e `[&_svg]:size-4`; `mr-2` duplica espaçamento (24px). Remover `mr-2/ml-2`.

---

## 3. Cards

| Tela | arquivo:linha | Tipo | Radius | Padding | Sombra | Borda | Obs. |
|---|---|---|---|---|---|---|---|
| Login | `Login.tsx:98` | glass-card | xl | `p-8 sm:p-10` | hover | border | hover lift em card estático |
| Dashboard hero | `Dashboard.tsx:155` | glass-card | xl | p-6 | hover | border | estático com lift |
| Dashboard resultado | `:277` | glass-card | xl | p-4 | hover | border | |
| Dashboard CTA tarefas | `:306` | glass-card (Link) | xl | p-5 | hover | border | |
| Dashboard próxima sessão | `:327` | **`dark` glass-card** | xl | p-6 | hover | border | força tema escuro |
| Dashboard atalhos | `:359,369` | glass-card (Link) | xl | p-6 | hover | border | |
| Urgency / NPS | `UrgencyBookingCard.tsx:42`, `PendingNpsCard.tsx:51` | div custom | **2xl** | **p-6 md:p-7** | glows blur-3xl animados | border colorida (neutralizada) | gradiente de fundo |
| Urgency/NPS stat | `:81` / `:87` | div | xl | p-4 | backdrop-blur | border | |
| MemberTimeline | `MemberTimeline.tsx:187` | div custom | **2xl** | `p-5 md:p-6` | nenhuma | border | `bg-card/70` translúcido |
| MemberTimeline mapa | `:288` | div aninhado | xl | p-4 | — | `border-border/70` | `bg-background/30` |
| MemberTimeline resumo | `:378` | div | lg | `px-2.5 py-2` | — | `border-border/60` | `bg-card/50` |
| MemberTimeline placeholder | `:278` | div | xl | p-6 | — | dashed | |
| Jornada progresso | `Journey.tsx:138` | glass-card | xl | p-6 | hover | border | faixa gradiente h-1 no topo |
| Jornada stats | `:239-272` | glass-card ×4 | xl | p-4 | hover | border | |
| Jornada resultados | `:313` | glass-card | xl | p-5 | hover | border | itens internos `rounded-xl bg-background/40 p-3` (:322) |
| Jornada sessão | `:361` | **`dark` glass-card** | xl | `p-5` (`pt-3` c/ capa) | hover | border + ring | |
| Jornada bônus | `:512` | glass-card | xl | p-6 | hover | dashed/ring | radial-gradient inline |
| Agenda overview agendadas | `AgendaOverview.tsx:572` | **div `rounded-lg border bg-card shadow-sm`** | lg | p-4 | **shadow-sm** | colorida (neutralizada) + barra w-1 | única com shadow-sm |
| Agenda overview calendário | `:626` | glass-card | xl | p-5 | hover | border | |
| Agenda overview slots | `:732` | glass-card | xl | p-5 | hover | border | `lg:max-h-[640px]` |
| Agenda overview grupo | `:838` | div `rounded-md border bg-card` | **md** | `px-2 py-1.5` | — | border | |
| Agenda overview slot | `:890` | Link `rounded border` | **4px** | `pl-2 pr-2 py-1.5` | — | border | menor radius do app |
| Agenda overview hint | `:545` | div `rounded-lg dashed` | lg | `px-4 py-2.5` | — | dashed | |
| Agendar sessão card | `AgendarSessao.tsx:676` | **`dark` glass-card** (button) | xl | p-5 | hover + rgba hardcoded | border + ring | |
| Agendar aviso kickoff | `:633` | div | **xl** | p-4 | — | `border-primary/30` | |
| Agendar aviso mentor | `:861,874` | div | **lg** | p-4 | — | colorida | mesmo padrão, radius diferente de :633 |
| Agendar calendário | `:759` | glass-card | xl | p-5 | transform:none | border | |
| Agendar slot horário | `:835` | button | xl | p-4 | — | border | |
| Agendar confirmação | `:890`, `:587` | glass-card | xl | p-6 | transform:none | border + barra h-0.5 | duplicado |
| Agendar confirmando | `:528` | glass-card | xl | **p-10** | — | border | |
| Agendar modal | `:953,985` | glass-card | xl | p-6 | — | border | `max-w-sm` |
| Agendar "encerrado" | `:459`, `AgendaOverview.tsx:505` | glass-card | xl | p-8 | hover | border | |
| Minha Agenda item | `MemberAgenda.tsx:196` | **`dark` glass-card** | xl | p-4 | hover | border | |
| Minha Agenda loading | `:170` | glass-card | xl | p-8 | hover | border | |
| Onboarding | — | sem cards | — | — | — | — | layout de formulário aberto |

Achados:
- [alto] `Dashboard.tsx:327`, `Journey.tsx:361`, `AgendarSessao.tsx:676`, `MemberAgenda.tsx:196` — classe `dark` forçada em cards de sessão — em relação ao tema claro (`index.css:98-159`) — no light mode esses cards viram "ilhas escuras" enquanto o resto da página é claro. Remover `dark`; se a intenção é legibilidade sobre a capa, aplicar overlay escuro apenas na área da imagem.
- [alto] Padding de card: `p-4 / p-5 / p-6 / p-6 md:p-7 / p-8 / p-8 sm:p-10 / p-10` — 7 valores — definir 2: `p-4` (compacto/lista) e `p-6` (seção).
- [alto] Radius de card: `rounded` (4) / `md` (10) / `lg` (12) / `xl` (12) / `2xl` (16) — 5 valores — definir `rounded-xl` para cards de seção, `rounded-lg` para linhas/itens internos, `rounded-full` para pills. Eliminar `rounded` e `rounded-md` em containers (`AgendaOverview.tsx:838,845,890,910`).
- [médio] `AgendaOverview.tsx:572` — único card com `shadow-sm` e barra lateral `w-1` colorida (`:576`) — em relação a glass-card em toda a área — usar `SectionCard` + `StatusPill`.
- [médio] `Journey.tsx:139` (faixa gradiente h-1), `AgendarSessao.tsx:689-692,891` (barras h-0.5), `Journey.tsx:514-520` (radial-gradient inline), Urgency/NPS glows — 4 ornamentos de topo/fundo diferentes — remover; status vai na `StatusPill`.
- [médio] `UrgencyBookingCard.tsx:42-56`, `PendingNpsCard.tsx:51-58` — dois banners com gradiente + glow `blur-3xl` animado infinito, empilhados no Dashboard (`Dashboard.tsx:224-234`) — em relação à estética flat do resto — criar `AlertCard` (tom `warning`/`info`) flat, sem animação infinita (HIG: evitar motion contínuo).
- [médio] `MemberTimeline.tsx:187,288,378` — três níveis de card aninhado (2xl > xl > lg) com opacidades diferentes (`bg-card/70`, `bg-background/30`, `bg-card/50`) — aplanar: um `SectionCard` e listas internas sem borda (divisores).
- [baixo] `AgendarSessao.tsx:587-614` e `:890-919` — o mesmo card "Confirmação de Sessão" duplicado — extrair `SummaryList` (key/value com divisores).

---

## 4. Badges / status

Labels usados para **o mesmo estado**:

| Estado | `bookingStatusConfig` (`bookingStatus.ts`) | `Journey.tsx` | `MemberTimeline.tsx` | `AgendarSessao.tsx` | `AgendaOverview.tsx` / `MemberAgenda.tsx` |
|---|---|---|---|---|---|
| completed | "Realizada" (:131) | "Realizada" (:21) | "Realizada" (:153) | **"Concluída"** (:697) | StatusBadge ✓ |
| scheduled | "Agendada" (:126) | "Agendada" (:22) | "Agendada" (:157) | "Agendada" (:701) | ✓ / stat "confirmada(s)" (`MemberAgenda.tsx:156`) |
| pending_approval | "Aguardando confirmação" (:151) | **"Aguardando mentor"** (:266) | **"Pendente"** (:156, :372 "Pendentes") | — | **"aguardando aprovação"** (`MemberAgenda.tsx:161`); `AgendaOverview.tsx:560` "aguardando confirmação" |
| awaiting_report | "Aguardando relatório" (:156) | — | **"Realizada · aguardando relatório"** (:154) | — | ✓ |
| não agendada (sem booking) | — | **"Pendente"** (:23, :220) | **"A agendar"** (:374) | **"Disponível"** (:709) | "a agendar" (`AgendaOverview.tsx:536`) |
| not_realized | "Não realizada" | — | "Não realizada" | — | — |

Implementações visuais:

| Implementação | Métrica | Onde |
|---|---|---|
| `StatusBadge` (canônico) | `text-[10px] px-2 py-0.5 rounded-full border font-medium tracking-tight` + dot | `AgendaOverview.tsx:586,607`, `MemberAgenda.tsx:208,239` |
| `statusConfig` local + ícone | `text-[10px] px-2 py-0.5 rounded-full border font-medium` + ícone h-2.5 | `Journey.tsx:20-24, 379, 403` |
| `.status-badge` + override | `px-3 py-1 text-xs uppercase` sobrescrito por `text-[10px]` + ícone h-3 | `AgendarSessao.tsx:696-710` |
| `statusMeta` chip | classes `/15` `/30` (não renderizado como pill; usado no Dialog como texto) | `MemberTimeline.tsx:151-159, 413` |
| Pace chip | `rounded-lg border px-3 py-1.5 text-xs font-semibold` | `MemberTimeline.tsx:207` |
| Pill uppercase pulsante | `text-[11px] px-3 py-1.5 rounded-full uppercase tracking-wider` | `UrgencyBookingCard.tsx:61`, `PendingNpsCard.tsx:63` |
| Pill kickoff | `text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold` "✦ Kickoff · 3h" / "✦ Kickoff · Comece por aqui" | `Journey.tsx:399`, `AgendarSessao.tsx:713` |
| Pill pilar | `text-[10px] px-2 py-0.5 rounded-full` — `bg-muted` (Journey :383) vs `pillar-*` colorido (AgendarSessao :722) vs texto sublabel (AgendaOverview :809) | 3 formas |
| Pill contador tarefas | `text-[10px] px-2 py-0.5 rounded-full bg-muted` | `Journey.tsx:427,439`, `MemberAgenda.tsx:241` ✓ consistente |
| Pill resultado | `text-[10px] px-1.5 py-0.5 rounded-full` (Dashboard :287,291) vs `text-[9px] uppercase` sem pill (Journey :323) | 2 formas |
| Pill contador seção | `text-xs bg-muted px-2 py-0.5 rounded-full` | `Dashboard.tsx:266` |
| Chip "requer aprovação" | `text-[9px] px-1.5 py-0.5 rounded` (4px) | `AgendaOverview.tsx:910` |

Achados:
- [alto] `MemberTimeline.tsx:156` "Pendente" = *aguardando aprovação* vs `Journey.tsx:23` "Pendente" = *ainda não agendada* — a mesma palavra para dois estados diferentes, ambas visíveis no Journey (timeline + lista) — usar sempre `bookingStatusConfig` e "A agendar" para slot vazio.
- [alto] `AgendarSessao.tsx:697` "Concluída" vs "Realizada" em todo o resto — unificar em "Realizada".
- [alto] `pending_approval` tem 4 labels — padronizar "Aguardando confirmação" (já é o canônico).
- [médio] `Journey.tsx:20-24` — `statusConfig` local duplica `bookingStatusConfig` com opacidades diferentes (`/15` + `border-border` vs `/12` + `border-status-*/25`) — apagar e usar `<StatusBadge>`.
- [médio] `AgendarSessao.tsx:696-710` — `.status-badge` (uppercase, text-xs) sobrescrito com `text-[10px]` — resultado híbrido — usar `<StatusBadge>`.
- [baixo] `StatusBadge.tsx:17` — `size="sm"` default é `text-[10px]` — abaixo do mínimo legível; default deveria ser `md` (`text-xs`).

---

## 5. Tipografia

Tamanhos encontrados (11): `text-[9px]`, `text-[10px]`, `text-[11px]`, `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-4xl`, `text-5xl`.
Pesos (5): `font-light` (Login :88, Urgency/NPS :84/:89), `normal`, `medium`, `semibold`, `bold`.

Eyebrows/labels uppercase — 6 variantes:

| Variante | Onde |
|---|---|
| `text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground` | `Dashboard.tsx:149,158,175` |
| `text-xs uppercase tracking-wider font-medium text-muted-foreground` | `Dashboard.tsx:338,360,370`, `Journey.tsx:144,161`, `AgendarSessao.tsx:588,892` |
| `text-[10px] uppercase tracking-wider text-muted-foreground` (sem peso) | `Journey.tsx:179,240,245,266,273`, `MemberTimeline.tsx:300`, Urgency/NPS `:86/:90` |
| `text-[10px] uppercase tracking-[0.2em] font-semibold text-primary` | `Journey.tsx:526` |
| `text-[10px] font-semibold uppercase tracking-wider text-primary` | `MemberTimeline.tsx:191,412,417,423` |
| `text-xs font-medium uppercase tracking-wider text-primary/80` + emoji | `Onboarding.tsx:584` |
| `text-sm font-semibold uppercase tracking-wider` (h2) + emoji | `Journey.tsx:315` |
| `text-[11px] font-semibold uppercase tracking-wider` (pill) | Urgency/NPS `:61/:63` |

Títulos de seção dentro da página — 5 estilos: `text-lg font-semibold` (`Dashboard.tsx:263`, `MemberTimeline.tsx:194`), `text-lg font-medium` (`AgendarSessao.tsx:630,748,821,859`), `text-sm font-semibold` (`AgendaOverview.tsx:559,735`, `MemberTimeline.tsx:291`), `text-sm font-semibold uppercase` (`Journey.tsx:315`), `text-xl md:text-2xl font-semibold` (Urgency/NPS h3 `:68/:70`).

Achados:
- [alto] `UrgencyBookingCard.tsx:68`, `PendingNpsCard.tsx:70` — h3 de card em `text-2xl` = tamanho do h1 da página (`Dashboard.tsx:150`) — hierarquia invertida — usar `text-lg font-semibold`.
- [alto] Uso de `text-[9px]` em `Journey.tsx:323`, `AgendaOverview.tsx:700,910,920`, `MemberTimeline.tsx:320,337,362` e `text-[10px]` em ~40 ocorrências — abaixo do mínimo HIG (11pt) — escala canônica: 11 / 13 / 15 / 17 / 22 / 28 (ou `text-[11px]`, `text-xs`… mapeados) e banir `[9px]`/`[10px]`.
- [médio] `AgendarSessao.tsx:630,748,821,859` — `font-medium` em títulos de etapa — em relação a `font-semibold` nos demais h2 — padronizar semibold.
- [médio] `Journey.tsx:315`, `Journey.tsx:400,413`, `AgendarSessao.tsx:580,587,637,647,714,892`, `Onboarding.tsx:55-137,321` — emojis/`✦` como ornamento tipográfico — em relação ao uso de lucide no resto — remover ou substituir por ícone.
- [médio] Dados numéricos grandes: `text-2xl font-bold` (`Journey.tsx:241,267,274`), `text-4xl font-light` (Urgency/NPS), `text-lg font-bold` (`MemberTimeline.tsx:297`, date block `AgendaOverview.tsx:597`) — 3 estilos de "número de destaque" — um `Stat` com `text-2xl font-semibold tabular-nums`.
- [baixo] `Login.tsx:107` label `text-sm text-muted-foreground` vs `Onboarding.tsx:335` `text-sm font-medium text-foreground` vs `AgendarSessao.tsx:922` `text-xs text-muted-foreground` — três estilos de label de formulário — `FormLabel` único.

---

## 6. Espaçamento

| Tela | Container externo | space-y raiz | Gaps de grid | Padding de card predominante |
|---|---|---|---|---|
| AppLayout | `px-5 sm:px-8 lg:px-10 xl:px-12 py-6 lg:py-8 max-w-[1400px]` (`:206`) | — | — | — |
| Login | `px-6 sm:px-10` (`:73`), `max-w-md` | `space-y-5` form; `mt-6/mt-8 pt-6/mt-4` | `gap-10 lg:gap-16` | `p-8 sm:p-10` |
| Onboarding | `px-4 sm:px-6 py-8 md:py-12` (`:582`), `max-w-2xl`; header `px-6 py-5` | `space-y-2` por campo | `gap-x-5 gap-y-6` (:591); `mt-10` footer | — |
| Dashboard | layout | **`space-y-8`** (`:147`) | `gap-6` (:156,358), `space-y-3` (:271) | p-6 / p-5 / p-4 |
| Jornada | layout | **`space-y-8`** (`:131`) | `gap-6` (:141), `gap-3` (:238), `gap-4` (:341), `gap-2` (:318), `gap-5` (:211) | p-6 / p-5 / p-4 |
| Agenda overview | layout | **`space-y-5`** (`:520`) | `gap-5` (:623), `gap-3` (:564,522,529), `gap-1.5` (:657,665,778), `space-y-1.5` (:797), `space-y-1` (:869) | p-5 / p-4 |
| Agendar sessão | layout + `max-w-2xl mx-auto` (`:478`) | **`space-y-6`** | `space-y-4` (:629,746,819), `space-y-5` (:858), `gap-3` (:656,825), `space-y-8` (:528) | p-5 / p-6 / p-10 |
| Minha Agenda | layout | **`space-y-6`** (`:123`) | `gap-4` (:168), `gap-3` (:124), `gap-4` (:141) | p-4 |
| MemberTimeline | — | `space-y-6` (:187) | `space-y-3/4`, `gap-2` (:368) | p-5 md:p-6 |

Achados:
- [alto] `space-y-8` (Dashboard, Jornada) vs `space-y-6` (Agendar, Minha Agenda) vs `space-y-5` (Agenda overview) — ritmo vertical de página diferente em cada tela — fixar `space-y-6` (24) mobile / `lg:space-y-8` (32).
- [alto] `AgendarSessao.tsx:478` `max-w-2xl` e `Onboarding.tsx:583` `max-w-2xl` vs demais telas em 1400px — largura de leitura muda ao navegar Agenda → Agendar — decidir um `max-w` por tipo (formulário: `max-w-2xl`; dashboard: `max-w-5xl`), aplicado via `PageContainer`.
- [médio] Valores fora da grade 4/8: `gap-1.5`, `space-y-1.5`, `py-1.5`, `px-2.5`, `py-2.5`, `mt-0.5`, `p-7` (`md:p-7`), `gap-x-5` — em ~30 pontos (`AgendaOverview.tsx:657,665,778,797,841,869`, `Urgency:42`, `Onboarding.tsx:591`) — arredondar para 4/8/12/16/24/32.
- [médio] `Onboarding.tsx:569,582` `px-6` header vs `px-4 sm:px-6` main — descolado do `AppLayout` (`px-5 sm:px-8`) — usar o mesmo `PageContainer`.
- [baixo] `Login.tsx:73` `px-6 sm:px-10` — diferente de AppLayout `px-5 sm:px-8` — igualar.

---

## 7. Ícones

| Ação/conceito | Ícones usados | Onde |
|---|---|---|
| Agenda / sessão | `Calendar` (`MemberAgenda.tsx:134,155`, `Dashboard.tsx:158,339`), `CalendarDays` (`Journey.tsx:22`, `MemberTimeline.tsx:406`, menu Eventos), `CalendarCheck` (`AgendaOverview.tsx:531,757,848`, Urgency :82), `CalendarClock` (`AgendaOverview.tsx:703,718,736,765,853`), `CalendarIcon` (`Onboarding.tsx:433`, `AgendarSessao.tsx:621`) | **5 ícones** |
| Jornada | `Map` (menu `AppLayout.tsx:32`), `BookOpen` (`Dashboard.tsx:361`, `Journey.tsx:144`), `Target` (`MemberTimeline.tsx:192`, `Journey.tsx:161,485`) | 3 ícones; `BookOpen` também é "Conteúdos" (`Dashboard.tsx:371`, menu :35) — mesmo ícone para 2 destinos |
| Tarefas | `ListChecks` (`Dashboard.tsx:175,309`), `ClipboardCheck` (menu, `PendingNpsCard.tsx:88`), `Target` (`Journey.tsx:485`, `MemberAgenda.tsx:265`) | 3 ícones |
| Voltar | `ArrowLeft` (`Onboarding.tsx:603`, `AgendarSessao.tsx:497`), `ChevronLeft` (nav mês), texto "← Voltar" (`Login.tsx:144`), texto "Voltar" sem ícone (`AgendarSessao.tsx:942`) | 4 formas |
| Abrir externo (Zoom) | `ExternalLink h-3` (`MemberAgenda.tsx:257`), sem ícone (`Journey.tsx:465`, `Dashboard.tsx:351`), `Video` (`AgendarSessao.tsx:56`) | 3 formas |
| Expandir | `ChevronDown` rotate (`Dashboard.tsx:269`, `AgendaOverview.tsx:863`), `ChevronUp/ChevronDown` swap (`Journey.tsx:470-471`) | 2 padrões |
| Realizada | `CheckCircle2` (`Journey.tsx:21`), `Check` (`AgendarSessao.tsx:697,552,575`, `Onboarding.tsx:319`), dot | 3 |
| Alerta | `AlertTriangle` (Urgency :65, `AgendarSessao.tsx:862,954,987`), `Info` (`:875`, `AgendaOverview.tsx:547`) | ok |
| Destaque/kickoff | `Star` (`MemberTimeline.tsx:347,391`), `Star` = "a agendar" (`AgendaOverview.tsx:535`), `✦` texto | conflito semântico |

Tamanhos de ícone: `h-2 / h-2.5 / h-3 / h-3.5 / h-4 / h-5 / h-6 / h-7 / h-8 / h-10 / h-12` — **11 tamanhos**.

Achados:
- [alto] Cinco ícones de calendário para "agenda" e `Star` significando "kickoff" e "a agendar" — em relação ao princípio de 1 ícone = 1 conceito — dicionário: Agenda=`Calendar`, Agendada=`CalendarCheck`, Aguardando=`Clock`, Kickoff=`Star`, Tarefas=`ListChecks`, Jornada=`Map`, Conteúdos=`BookOpen`.
- [médio] Tamanhos — reduzir para 4: `size-3.5` (inline em texto xs), `size-4` (botões/linhas), `size-5` (nav/cabeçalho de card), `size-8` (empty state/sucesso). Eliminar `h-2`, `h-2.5` (`Journey.tsx:380,404`, `AgendarSessao.tsx:727`, `MemberAgenda.tsx:236`, `AgendaOverview.tsx:703`).
- [baixo] `Journey.tsx:144,161,485`, `MemberAgenda.tsx:265` — ícone `inline mr-1.5 -mt-0.5` dentro de `<p>` — hack de alinhamento — usar `flex items-center gap-1.5` como em `Dashboard.tsx:158`.

---

## 8. Modais / sheets / drawers

| Interação | Implementação | Onde |
|---|---|---|
| Detalhe de sessão (timeline) | shadcn `<Dialog>` `sm:max-w-lg`, `DialogTitle` padrão | `MemberTimeline.tsx:398-441` |
| Aviso "2 sessões no mês" | **hand-rolled** `fixed inset-0 bg-background/80 backdrop-blur-sm` + `glass-card p-6 max-w-sm`; título `h3 text-sm font-semibold` | `AgendarSessao.tsx:950-978` |
| Aviso "jornada completa" | idem hand-rolled | `AgendarSessao.tsx:983-996` |
| Date picker | shadcn `<Popover>` + `<Calendar>` + `<style>` inline | `Onboarding.tsx:424-449, 549-567` |
| Confirmação de agendamento | tela inline (step 4) + animação de "confirmando" em card `p-10` | `AgendarSessao.tsx:522-562, 857-945` |
| Expandir sessão | `<details>` nativo (`Dashboard.tsx:262`), div clicável com estado (`Journey.tsx:391`, `MemberAgenda.tsx:213`), botão acordeão (`AgendaOverview.tsx:839`) | 3 padrões de acordeão |
| Seleção de horário | grade de botões em página (`AgendarSessao.tsx:825`) vs lista acordeão em painel lateral (`AgendaOverview.tsx:797`) | 2 fluxos paralelos para a mesma tarefa |
| Toasts | `sonner` | Login, Onboarding, Agendar ✓ |
| Sheet/Drawer mobile | **inexistente** | — |

Achados:
- [alto] `AgendarSessao.tsx:950-996` — modais manuais sem focus-trap, sem `aria-modal`, sem fechar com Esc — em relação ao `<Dialog>` shadcn em `MemberTimeline.tsx:398` — migrar para `Dialog`/`AlertDialog`; no mobile, `BottomSheet` (vaul/Drawer).
- [alto] `AgendaOverview.tsx` e `AgendarSessao.tsx` — dois fluxos de agendamento com calendários visualmente diferentes (dia com borda + contador vs dia sem borda + ponto; slot `rounded` 4px em lista vs botão `rounded-xl p-4`) — um `CalendarGrid` e um `SlotButton` compartilhados; o overview deve deep-linkar para a etapa 4 (já faz em `:889`) usando os mesmos componentes.
- [médio] `AgendarSessao.tsx:955,988` — título de modal `text-sm` vs `DialogTitle` (text-lg) — herdar do `Dialog`.
- [médio] `Dashboard.tsx:262` `<details>`, `Journey.tsx:391` div `onClick`, `MemberAgenda.tsx:213` div `onClick`, `AgendaOverview.tsx:839` `<button>` — 4 acordeões — um `Disclosure`/`Accordion` shadcn com `aria-expanded`.
- [baixo] `AgendarSessao.tsx:55-59, 424-436` — "Criando sala Zoom… / Adicionando ao Google Agenda…" são timers falsos (1.4s/1.6s) e o Zoom não é criado nesse momento (link chega por e-mail, `:935`) — copy enganosa; substituir por spinner único + texto real.

---

## 9. Estados loading / empty / erro

| Tela | Loading | Empty | Erro |
|---|---|---|---|
| Login | texto "Aguarde..." no botão (`:130`) | — | toast |
| Onboarding | "Salvando..."/"Finalizando..." no botão (`:606-608`) | — | toast (`:270,278,302`) |
| Dashboard | **nenhum** (queries sem `isLoading`; hero renderiza "Sessão 1 de 0"/NaN se `totalSessions=0`, `:79,160`) | seções somem (`:260,304,326`) | nenhum |
| Jornada | **nenhum** | texto itálico "Nenhuma tarefa atribuída…" (`:494`); "Nenhuma agendada" em stat (`:260`) | nenhum |
| Agenda overview | **nenhum** | 2 empties ad hoc: ícone h-8 + `text-sm font-medium` + `text-xs`, `py-10` (`:756-774`) | nenhum |
| Agendar sessão | `Loader2` spinner em etapas fake (`:552`); grid vazio enquanto carrega sessões (`:657`) | `glass-card p-8` texto (`:849`) | toast (`:364,398-402`) |
| Minha Agenda | `glass-card p-8` "Carregando..." (`:170`) | **`<EmptyState>`** ✓ (`:175-184`) | nenhum |
| MemberTimeline | — | placeholder dashed `rounded-xl p-6 text-xs` (`:278`) — copy fala com o admin ("deste aluno") | — |
| UrgencyBookingCard / NPS | — (retorna null) | — | — |

Achados:
- [alto] `MemberTimeline.tsx:279` — "Defina a data de início e término do programa **deste aluno**" exibido ao membro no Dashboard/Jornada — copy de admin vazando — variante por `role`.
- [alto] Dashboard, Jornada, Agenda overview sem loading — flash de zeros e cards vazios — `Skeleton` do shadcn dentro de `SectionCard`.
- [médio] 5 padrões de empty (`AgendaOverview.tsx:756,764`, `AgendarSessao.tsx:849`, `Journey.tsx:494`, `MemberTimeline.tsx:278`) vs `EmptyState` em `MemberAgenda.tsx:175` — usar `EmptyState` (com `compact`) em todos.
- [médio] `MemberAgenda.tsx:170` "Carregando..." em texto — sem skeleton — `Skeleton`.
- [baixo] `EmptyState.tsx:45` — descrição `text-xs` — subir para `text-sm`.

---

## 10. Mobile

- [alto] `MemberTimeline.tsx:332-344` — 12 botões de 20×20px (`h-5 w-5`) lado a lado — alvo mínimo 44 — no mobile usar lista vertical (`ListRow`) ou aumentar para `h-8 w-8` com hit-area `before:` 44.
- [alto] `Journey.tsx:451,462`, `MemberAgenda.tsx:255`, `Journey.tsx:276` — botões ~27-28px.
- [alto] Ícones nativos `p-1.5` (28px): `AgendaOverview.tsx:632,650`, `AgendarSessao.tsx:761,765`, `MemberAgenda.tsx:143,149`; `p-2` (32px) `AgendarSessao.tsx:495`; `Login.tsx:122` (16px sem padding) — `<Button variant="ghost" size="icon">` (40) com `min-h-11 min-w-11` no mobile.
- [alto] `AgendaOverview.tsx:788` chips 22px; `:723,748` links `text-[11px]`; `:890` slots `py-1.5` (~36px).
- [médio] `Dashboard.tsx:391` — FAB `bottom-24 right-6` + bottom-nav + 4 bolhas do `AppLayout` (`:198-201`) — 6 elementos flutuantes sobre conteúdo; o FAB no mobile é só ícone (40px) e o texto some (`sm:inline`).
- [médio] `AppLayout.tsx:206-207` — `paddingTop 4.5rem` para as bolhas; conteúdo fica atrás delas em scroll (backdrop gradiente `:194` tenta esconder) — header sólido resolve.
- [médio] `AgendaOverview.tsx:623` — grid `lg:grid-cols-[1fr_minmax(360px,440px)]` empilha no mobile: calendário de 42 células + painel `lg:max-h-[640px]` sem limite no mobile → página muito longa; painel de slots deveria virar `BottomSheet` ao tocar um dia.
- [médio] `AgendarSessao.tsx:501` título dinâmico + botão voltar em `flex items-center gap-3` — quebra em 2-3 linhas em 360px.
- [médio] `MemberTimeline.tsx:362` — label "Presente" `absolute top-7` fora do container `h-7` — pode colidir com o grid abaixo em telas estreitas.
- [baixo] `Journey.tsx:183-207` — 13 bolinhas `w-3.5` em `flex justify-between` — em 360px ficam a ~10px umas das outras; `title` não funciona em touch.
- [baixo] `UrgencyBookingCard.tsx:81`, `PendingNpsCard.tsx:87` — coluna de destaque `hidden md:flex` — no mobile o card perde a informação numérica.

---

## 11. Acessibilidade

- [alto] Botões-ícone sem `aria-label`: `Login.tsx:122` (mostrar senha), `AgendarSessao.tsx:495` (voltar), `:761,765` (mês), `MemberAgenda.tsx:143,149` (mês), `Dashboard.tsx:387-395` (FAB com texto oculto no mobile). Contraste: `AgendaOverview.tsx:632,650` têm ✓.
- [alto] Divs clicáveis sem `role="button"`, `tabIndex`, `onKeyDown`: `Journey.tsx:368,391`, `MemberAgenda.tsx:199,213`. Chevron em `Journey.tsx:470` é decorativo, sem `aria-expanded`.
- [alto] `AgendarSessao.tsx:950-996` — modal sem `role="dialog"`, `aria-modal`, focus-trap, Esc.
- [alto] `text-[9px]`/`text-[10px]` em `text-muted-foreground` (`--muted-foreground: 38 8% 64%` sobre `--card 40 7% 8%`) — contraste OK em cor, mas tamanho < 11px falha em legibilidade; `text-muted-foreground/70` (`MemberTimeline.tsx:320`) e `text-muted-foreground/35-40` (`AgendaOverview.tsx:695`, `AgendarSessao.tsx:797`) caem abaixo de 3:1.
- [médio] `.btn-silver` (`index.css:237`) sem `focus-visible:ring` — em relação a `Button` (`button.tsx:8`) — botões primários sem indicação de foco por teclado em Login, Dashboard, Jornada, Agendar, Agenda.
- [médio] `Login.tsx:107-121` — `<label>` sem `htmlFor` e inputs sem `id`; `Onboarding.tsx:335` idem — usar `FormLabel`/`Input` com ids.
- [médio] `Journey.tsx:186-194`, `:200-206`, `MemberTimeline.tsx:316-325` — divs de status só com `title` — adicionar `aria-label` ou texto visível.
- [médio] `UrgencyBookingCard.tsx:45-56,60-63`, `PendingNpsCard.tsx:53-58,62-65` — animações infinitas sem `motion-reduce:` — respeitar `prefers-reduced-motion`.
- [baixo] `index.css:273-276` — `--tw-ring-offset-width: 0px !important` e ring em `stroke-focus` (alpha 0.14-0.22) — o anel de foco global fica quase invisível no dark; subir opacidade do `--stroke-focus` usado em foco ou usar `--ring` sólido para `focus-visible`.
- [baixo] `AgendaOverview.tsx:581-583`, `:845` — `<img alt="">` correto para decorativas ✓; `Dashboard.tsx:330`, `Journey.tsx:373`, `MemberAgenda.tsx:202` repetem o nome já visível no h3 (redundante, usar `alt=""`).

---

## 12. Componentes canônicos propostos + mapa de substituição

### 12.1 Componentes

| Componente | Spec (Apple HIG-like) |
|---|---|
| `PageContainer` | `max-w` por variante (`default` 1200 / `narrow` 672), `px-4 sm:px-6 lg:px-8`, `space-y-6 lg:space-y-8`. |
| `PageHeader` | `eyebrow?` (`text-xs font-medium uppercase tracking-wide text-muted-foreground`), `title` (`h1 text-2xl font-semibold tracking-tight`), `description?` (`text-sm text-muted-foreground mt-1`), `back?` (icon button 44px com aria-label), `actions?` (slot direita, `Button`). Único lugar onde h1 existe. |
| `SectionHeader` | `h2 text-base font-semibold` + `description text-sm` + `action?` (link/`Button variant="ghost" size="sm"`). Substitui os 5 estilos de título de seção. |
| `SectionCard` | `rounded-xl border bg-card p-4 sm:p-6`, sem sombra, **sem hover** por padrão; props `interactive` (hover border + `focus-visible`), `tone: default \| info \| warning \| success` (só fundo `/8` + ícone; sem gradiente/glow), `padding: compact \| default`. Substitui `glass-card`, `<Card>`, divs `bg-card`, banners. |
| `Button` (shadcn estendido) | variantes: `primary` (= btn-silver, `bg-primary font-semibold`), `secondary` (`bg-secondary`), `outline`, `ghost`, `link`, `destructive`; sizes `sm` 36 / `md` 44 / `lg` 48 / `icon` 44; `rounded-lg` em todos. Deprecar `.btn-silver`, spans-botão, `<a>` estilizado (usar `asChild`). |
| `IconButton` | `Button size="icon" variant="ghost"` com `aria-label` obrigatório (TS). |
| `StatusPill` | = `StatusBadge` renomeado; `size md` default (`text-xs px-2.5 py-1`), dot opcional, ícone opcional; labels **somente** de `bookingStatusConfig`/`taskStatusConfig` + novo `journeySlotStatus` (`available: "A agendar"`). Variante `neutral` para contadores ("3/5 tarefas", pilar). |
| `Chip` (toggle/filter) | `h-9 px-3 rounded-full text-sm border`, `aria-pressed`. Substitui chips do Onboarding e filtros do Agenda overview. |
| `Stat` | `label` (eyebrow), `value` (`text-2xl font-semibold tabular-nums`), `hint` (`text-sm muted`). |
| `ProgressBar` | `h-2 rounded-full bg-muted`, fill sólido `bg-primary`/`bg-status-*`; sem gradiente. Um só tamanho. |
| `ListRow` | `min-h-[56px] px-4 py-3 flex items-center gap-3`, leading (ícone/date-block 40×40 `rounded-lg`), título `text-sm font-medium`, subtítulo `text-xs muted`, trailing (`StatusPill`/chevron/`Button size=sm`); `as="button" \| "a"`, `onToggle` com `aria-expanded`. Substitui sessão do Journey, item da Minha Agenda, grupos e slots do overview, "Minhas tarefas" do Dashboard. |
| `DateBlock` | `w-12 h-12 rounded-lg bg-muted`, mês `text-[11px] uppercase`, dia `text-lg font-semibold tabular-nums`. |
| `EmptyState` (existente) | subir `description` para `text-sm`; usar em todo lugar. |
| `Skeleton` sets | `SectionCardSkeleton`, `ListRowSkeleton`. |
| `Callout` | `SectionCard tone` + ícone `size-5` + título `text-sm font-semibold` + corpo `text-sm`. Substitui os 3 avisos do Agendar e o hint do overview. |
| `BottomSheet` | `Drawer` (vaul) no mobile / `Dialog` no desktop, via `useMediaQuery`; header padrão com `DialogTitle`. Substitui modais manuais e o painel lateral de slots. |
| `Disclosure` | `Collapsible` shadcn com `ListRow` como trigger; chevron rotaciona. |
| `CalendarGrid` + `SlotButton` | um calendário (dia `h-10 rounded-lg`, estados: disponível/selecionado/agendado/indisponível) e um botão de horário (`ListRow` com hora `tabular-nums` à direita). |
| `SummaryList` | pares chave/valor com `divide-y`. |
| `FormField` | `Label` (`text-sm font-medium`) + `Input h-11 rounded-lg` + hint. Substitui `input-begin`, `FIELD_CLASSES`, textarea nativo. |

### 12.2 Mapa "onde substituir"

**Login.tsx**
- `:98` glass-card → `SectionCard` (não interativo) · `:99-102` h2 + linha → `PageHeader` (variante `display`) · `:107-121` inputs `input-begin` → `FormField` · `:122` → `IconButton aria-label` · `:129` btn-silver uppercase → `Button variant="primary" size="lg"` sentence case · `:137,138,144` → `Button variant="link"`.

**Onboarding.tsx**
- `:569-575` header → `PageHeader` (eyebrow "Etapa 1 de 6", action "Sair" como `Button variant="ghost" size="sm"`) · `:578` progress → `ProgressBar` · `:584-589` eyebrow+h1+p → `PageHeader` (sem emoji) · `:388-402` chips → `Chip` · `:365,466` select nativo → manter nativo mas `h-11 rounded-lg` via `FormField` · `:512-527` → `FormField` · `:596-609` → manter `Button`, remover `mr-2/ml-2` · `:549-567` `<style>` → mover para `index.css` ou `Calendar` theme · `:313-325` done → `EmptyState`-like `SuccessState`.

**Dashboard.tsx**
- `:148-152` → `PageHeader` (eyebrow "Início" ou nenhum) · `:155-220` hero → `SectionCard` + 2×`Stat` + 2×`ProgressBar` (`:162,179` h-1.5 → h-2) · `:158,175` eyebrow → `SectionHeader`/`Stat.label` · `:203` `border-2` → `size-12 rounded-full bg-status-yellow/15` sem borda · `:224-234` `PendingNpsCard`/`UrgencyBookingCard` → `Callout tone` com `Button` (ver abaixo) · `:262-270` `<details>` → `SectionHeader` + `Disclosure` · `:277-296` → `ListRow` com `StatusPill neutral` (`:287,291`) · `:306-322` → `ListRow interactive` · `:327-355` `dark glass-card` → `SectionCard` (remover `dark`) + `Button variant="primary" asChild` (`:350`) · `:359-378` → 2×`ListRow interactive` (ícones `Map` e `BookOpen`) · `:387-395` FAB → remover (Suporte já está no menu) ou `PageHeader.actions`.

**Journey.tsx**
- `:20-24` `statusConfig` → apagar; usar `StatusPill` · `:132-135` → `PageHeader` · `:138-223` → `SectionCard` + `Stat` + `ProgressBar` (`:149,166` h-2.5 gradiente → h-2 sólido; `:139` faixa → remover) · `:183-207` bolinhas → remover (duplicado com `MemberTimeline`) · `:238-281` 4 stats → `Stat` em `SectionCard compact`; `:276` btn-silver micro → `Button size="sm"` · `:313-336` → `SectionHeader` + `ListRow` com `StatusPill neutral` (`:323`) · `:358-501` cards de sessão → `ListRow` (leading capa 40×40 ou `DateBlock`, trailing `StatusPill` + `Button size="sm"`) dentro de `Disclosure`; `:379,383,399,403,407,412,427,439` chips → `StatusPill`; `:451,462` → `Button size="sm"`; `:361` remover `dark`; `:362` ring → `data-[highlight]` token · `:494` → `EmptyState compact` · `:510-553` bônus → `SectionCard tone="info"` + `ProgressBar` (`:514-520` gradiente inline → remover; `:526` tracking-[0.2em] → eyebrow padrão).

**AgendaOverview.tsx**
- `:522-539` → `PageHeader` (title "Agenda", `actions` = stats como 2×`StatusPill neutral`) · `:520` `space-y-5` → `PageContainer` · `:543-553` → `Callout tone="info"` · `:556-618` → `SectionHeader` + `ListRow` (leading `DateBlock`, trailing `StatusPill`); remover `:572` shadow-sm/barra `:576` · `:626-729` calendário → `CalendarGrid` em `SectionCard`; `:632,650` → `IconButton`; `:710-728` legenda → `text-xs`, link → `Button variant="link" size="sm"` · `:732-935` painel → `SectionCard` desktop / `BottomSheet` mobile; `:756-774` → `EmptyState compact`; `:785-794` → `Chip`; `:838-866` grupo → `ListRow` + `Disclosure`; `:887-922` slot → `SlotButton` (`rounded` → `rounded-lg`, `text-[9px]` → `text-xs`); `:910` chip → `StatusPill size="sm" tone="warning"`.

**AgendarSessao.tsx**
- `:474-479` `max-w-2xl` → `PageContainer variant="narrow"` · `:481-507` → `PageHeader` (`back` = `IconButton aria-label="Voltar"`, title fixo "Agendar sessão", description "Etapa X de Y · {sessão}") · `:510-518` → `ProgressBar` · `:630,748,821,859` h2 `font-medium` → `SectionHeader` · `:633-654,861-871,873-887` → `Callout` (`:633` `rounded-xl` → padronizado) · `:667-737` cards → `ListRow interactive` ou `SectionCard interactive` sem `dark` (`:676`), sem shadow rgba (`:677`); `:696-716` `.status-badge` → `StatusPill` ("Concluída" → "Realizada"; "Disponível" → "A agendar"); `:722` pilar → `StatusPill neutral` · `:759-813` → `CalendarGrid`; `:761,765` → `IconButton` · `:825-846` → `SlotButton` · `:849-851` → `EmptyState compact` · `:586-614` e `:890-919` → `SummaryList` em `SectionCard` (remover `:891` barra e "✦") · `:921-932` textarea → `FormField` · `:939` → `Button variant="primary" size="lg"` sentence case; `:942,971,620` → `Button variant="outline"`; `:617` → `Button asChild` · `:950-996` → `AlertDialog` / `BottomSheet` · `:522-562` confirmando → spinner único (remover steps fake) · `:565-625` sucesso → `SuccessState` compartilhado com Onboarding `:313-325`.

**MemberAgenda.tsx**
- `:124-138` → `PageHeader` (title "Agenda", `actions` = `Button variant="primary"`) · `:141-165` → `SectionHeader` com nav de mês (`IconButton` ×2, `:143,149`) e stats como `StatusPill neutral` · `:169-172` → `ListRowSkeleton` · `:175-184` `EmptyState` ✓ (action → `Button asChild`) · `:196-274` → `ListRow` + `Disclosure` (remover `dark`; `:217` → `DateBlock`; `:241` → `StatusPill neutral`; `:255` → `Button size="sm" variant="outline"` com `ExternalLink`).

**UrgencyBookingCard.tsx / PendingNpsCard.tsx**
- Unificar em um `AlertCard`/`Callout tone="warning" | "info"` com `title text-lg font-semibold`, `description text-sm`, `Button variant="primary"` e `Stat` opcional: `:42` (`rounded-2xl p-6 md:p-7` → `SectionCard`), `:45-56`/`:53-58` glows → remover, `:61-67`/`:63-69` pill pulsante → `StatusPill` estático, `:68`/`:70` h3 `text-2xl` → `text-lg`, `:74`/`:80` span → `Button`, `:81-89`/`:87-93` → `Stat`.

**MemberTimeline.tsx**
- `:187` → `SectionCard` · `:191-204` → `SectionHeader` (eyebrow padrão muted, não primary) · `:207-210` pace → `StatusPill` (`rounded-lg` → full) · `:278-280` → `EmptyState compact` com copy por role · `:288` card aninhado → seção plana com `SectionHeader` (`:291-301`) · `:305-365` dots 20px → no mobile `ListRow` por sessão; no desktop `size-8` com `aria-label` (`:337` `text-white` → `text-primary-foreground`) · `:368-388` resumo → `StatusPill` com contador ou `Stat` compacto; labels via `bookingStatusConfig` ("Pendentes" → "Aguardando confirmação"; "A agendar" ✓) · `:151-159` `statusMeta` → derivar de `bookingStatusConfig` (cores) · `:398-441` `Dialog` ✓ → `BottomSheet` no mobile; `:411-425` blocos → `SummaryList`; `:430` → `Button`.

**AppLayout.tsx**
- `:194-201` bolhas → `PageHeader.actions` (perfil, notificações) e tema/refresh para menu "Perfil" · `:206-207` → `PageContainer` · `:225` bottom-nav `text-[10px]` → `text-[11px] font-medium`, item `min-h-11` · `:185` → mesmas classes de `:176`.

**index.css**
- `:218-235` `.glass-card` → deprecar em favor de `SectionCard`; `:237-244` `.btn-silver` → deprecar (`Button primary`); `:246-248` `.input-begin` → deprecar (`FormField`); `:250-252` `.status-badge` → deprecar (`StatusPill`); `:261-280` overrides `!important` → decidir política de bordas e remover as classes coloridas mortas ou o override.

---

## Resumo executivo (top 10 por impacto na sensação de "trocou de app")

1. Dois sistemas de botão (`btn-silver` × `Button`) com 25 variações e alturas de 20 a 56px.
2. Cards de sessão com `dark` forçado quebram o tema claro em 4 telas.
3. Banners com gradiente + glow animado (Urgency/NPS) e h3 do tamanho do h1.
4. Labels de status conflitantes ("Pendente" com dois significados; "Concluída" × "Realizada"; 4 labels para `pending_approval`).
5. Progresso da jornada renderizado 3-4 vezes (hero, bolinhas, stats, timeline) em Dashboard e Jornada.
6. Dois fluxos/calendários de agendamento visualmente distintos (overview × agendar).
7. Ritmo vertical e largura de página diferentes por tela (`space-y-5/6/8`, `max-w-2xl` × 1400).
8. 11 tamanhos tipográficos e 6 estilos de eyebrow; `text-[9px]/[10px]` em ~50 pontos.
9. Overrides globais `!important` em `index.css` que neutralizam bordas/rings coloridos declarados nas telas.
10. Ausência de header estrutural: 4 bolhas + FAB + bottom-nav flutuando sobre conteúdo; cada tela monta o título à mão.