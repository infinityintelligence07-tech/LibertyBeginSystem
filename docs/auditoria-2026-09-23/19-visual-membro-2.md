# Auditoria de Design System — Páginas do membro (parte 2)

Repositório: `LibertyBeginSystem` · Data: 23/09/2026 · Escopo: 8 páginas + 7 componentes · Nenhum arquivo editado.

## 0. Base lida (tokens e componentes canônicos existentes)

| Fonte | O que define | Observação |
|---|---|---|
| `src/index.css:38` | `--radius: 0.75rem` (12px) | shadcn `rounded-md` = radius−2px, `rounded-lg` = radius; `rounded-xl`/`rounded-2xl` Tailwind puro (12/16px) — dois sistemas de radius convivendo. |
| `src/index.css:218-235` | `.glass-card`: `bg-card border rounded-xl overflow-hidden`, hover `translateY(-2px)` + sombra | Único card com "lift" no hover — aplicado até em accordion (Support) e em cards estáticos (Stat). |
| `src/index.css:237-244` | `.btn-silver`: `rounded-lg px-6 py-3 font-semibold`, sem altura fixa nem tamanho de fonte | Altura depende do `text-*` do consumidor → 28px a 56px na prática. |
| `src/index.css:246-248` | `.input-begin`: `rounded-lg px-4 py-3` | Só usada em Profile; demais telas usam `px-3 py-2` inline. |
| `src/index.css:250-252` | `.status-badge`: `rounded-full px-3 py-1 text-xs uppercase tracking-wide` | Não é usada pelo componente `StatusBadge` (que usa `text-[10px]`, sem uppercase) → duas definições de badge. |
| `src/index.css:261-263` | Regra global `!important` força **toda** borda para `--stroke-subtle` | Anula `border-primary/40`, `border-status-green/30`, `border-status-blue/30` etc. usadas em 12+ pontos do escopo (o código expressa intenção que não renderiza). |
| `src/index.css:273-276` | `ring-2`/`ring-primary` → `--stroke-focus`, offset 0 | Anula `ring-background` do `ProfileBubble` e `focus:ring-primary/40` do NpsForm. |
| `src/components/ui/button.tsx:8-24` | `<Button>`: `rounded-md text-sm font-medium`, `h-9/h-10/h-11`, `[&_svg]:size-4`, focus-visible ring | **Não é usado em nenhum dos 15 arquivos do escopo.** |
| `src/components/StatusBadge.tsx:16-19` | `sm: text-[10px] px-2 py-0.5`, `md: text-xs px-2.5 py-1`, `rounded-full`, dot | Suporta `variant="task"`; TaskChecklist reimplementa o mesmo badge à mão. |
| `src/components/EmptyState.tsx:23-48` | `rounded-xl border-dashed bg-card/40`, `py-12`/`py-8`, ícone em círculo 48/36px | Usado em 3 de 11 lugares com estado vazio. |

---

## 1. Título de página por tela

| Tela | Tag | Classes | Tamanho | Peso | Subtítulo | Extra |
|---|---|---|---|---|---|---|
| Conteudos `:27-28` | `h1` | `text-2xl font-semibold text-foreground` | 24px | 600 | `text-sm text-muted-foreground` (sem `mt`) | — |
| Ferramentas `:105-106` | `h1` | idem | 24px | 600 | `text-sm` (sem `mt`) | — |
| Eventos `:95-96` | `h1` | idem | 24px | 600 | `text-sm` (sem `mt`) | — |
| Ranking `:47-55` | `h1` | idem | 24px | 600 | `text-sm` | Ícone em caixa `h-11 w-11 rounded-2xl bg-primary/10` à esquerda (único) |
| Profile `:130-131` | `h1` | idem | 24px | 600 | `text-sm mt-1` | `mt-1` só aqui |
| Support `:29-34` | `h1` | `text-3xl font-semibold mb-2`, centralizado | **30px** | 600 | `text-muted-foreground` (**base 16px**) + 2º subtítulo `text-sm mt-1` | Ícone em círculo `w-20 h-20` acima |
| NpsForm `:188-196` | `h1` dentro de `<header>` | `text-2xl font-semibold` | 24px | 600 | `text-sm` | Eyebrow `text-xs uppercase tracking-wide` + ícone `h-5 w-5` |
| TarefasPage `:143-155` | `h1` | `text-2xl font-semibold mt-1` | 24px | 600 | `text-sm mt-1` | Eyebrow `text-[10px] uppercase tracking-wider` + ícone `h-3.5 w-3.5` |

Achados:
- [alto] `src/pages/Support.tsx:29` — `text-3xl` centralizado com hero-icon de 80px — em relação ao padrão `text-2xl` alinhado à esquerda das outras 7 telas — usar `PageHeader` padrão (2xl, esquerda); se quiser destaque, usar `PageHeader variant="hero"` único e documentado.
- [médio] `src/pages/Support.tsx:30` — subtítulo em 16px (`text-muted-foreground` sem `text-sm`) e um segundo parágrafo `text-sm` — em relação ao subtítulo único `text-sm` das demais — um único subtítulo `text-sm`.
- [médio] `src/pages/NpsForm.tsx:190-191` vs `src/pages/TarefasPage.tsx:144-145` vs `src/pages/Ranking.tsx:64` — eyebrow (rótulo acima do título) com 3 receitas: `text-xs tracking-wide` + ícone 20px / `text-[10px] tracking-wider` + ícone 14px / idem em seção — padronizar `PageHeader.eyebrow` (sugestão: `text-[11px] font-semibold uppercase tracking-wider`, ícone 14px).
- [médio] `src/pages/Ranking.tsx:47-51` — título com ícone em caixa 44px `rounded-2xl` — nenhuma outra tela do escopo tem ícone no título — remover ou tornar prop opcional `PageHeader.icon` com tamanho fixo.
- [baixo] `src/pages/Profile.tsx:131` — `mt-1` no subtítulo; Conteudos/Ferramentas/Eventos não têm — o `PageHeader` define o gap uma vez (sugestão: `space-y-1`).
- [baixo] `src/pages/Ranking.tsx`, `TarefasPage.tsx`, `NpsForm.tsx` — sem `framer-motion` stagger, enquanto Conteudos/Ferramentas/Eventos/Profile usam `staggerContainer/fadeUpItem` e Support usa animação inline própria (`:19-22`) — decidir um padrão de entrada de página no `AppLayout`/`PageHeader`.

---

## 2. Botões

Contagem por padrão (padrões distintos, não instâncias renderizadas):

| Tela | shadcn `<Button>` | `btn-silver` | `<button>`/`<a>` nativo com classes soltas | Alturas resultantes (aprox.) | Radius |
|---|---|---|---|---|---|
| Conteudos | 0 | 0 | 0 (card inteiro é `<a>`) | — | — |
| Ferramentas | 0 | 0 | 1 (`:116-122` `text-[11px] px-2.5 py-1.5`) | ~28px | `rounded-lg` |
| Eventos | 0 | 1 condicional (`:193-197`) | 2 (`:190-211`) + link `:150-157` | ~32px | `rounded-lg` |
| Ranking | 0 | 0 | 0 | — | — |
| Profile | 0 | 2 (`:185`, `:229` condicional) | 4 (`:185`, `:223-233`, `:236-242`, `:254`) | 44 / 32 / 28 / ~20px | `rounded-lg`, sem radius (texto) |
| Support | 0 | 1 (`<a>` `:38-46` `py-4 text-base`) | 1 padrão FAQ (`:58-64` `p-4 text-sm`) | ~56 / ~52px | `rounded-lg`, nenhum (dentro do card) |
| NpsForm | 0 | 0 | 3 (`:53-64` escala `h-9`; `:294-299` Voltar; `:300-308` Enviar) | 36 / 36 / 36px | **`rounded-xl`** |
| TarefasPage | 0 | 0 | 2 (`:186-192` Limpar `text-[11px] px-3 py-2`; `:200-207` chips `text-[10px] px-2.5 py-1`) | ~32 / ~22px | `rounded-lg`, `rounded-full` |
| StudentTools | 0 | 1 (`:410` `text-xs px-3 py-1.5`) | 8 (`:298`, `:311/319`, `:381` label-botão, `:396`, `:437` card, `:497`, `:516`, `:551`) | ~15 / 24 / 28 / 28 / 28 / 132+ / 26 / 26 / 26px | `rounded-md`, `rounded-lg`, `rounded-2xl`, `rounded` (4px) |
| TaskChecklist | 0 | 1 (`:714` `w-full text-sm`) | ~12 (`:292` checkbox 20px; `:311/317`; `:339`; `:349-369`; `:407`; `:455/462/471`; `:482`; `:500`; `:510/518`; `:614`; `:621`; `:626`; `:654/664`) | 20 / 22 / 22 / 24 / 26 / 44px | `rounded` (4px), `rounded-lg`, `rounded-full` |
| ResultsRanking | 0 | 0 | 1 (`:69-79` chips `text-xs px-3 py-1.5`) | ~28px | `rounded-full` |
| EventAttendanceList | 0 | 0 | 2 (`:77-88` tabs; `:89-94` export — `text-[11px] px-3 py-1.5`) | ~28px | `rounded-lg` |
| Bubbles | 0 | 0 | 2 `<button>` + 1 `<Link>` (40px) | 40px | `rounded-full` |
| **Total** | **0** | **6** | **~38 padrões** | **≥ 10 alturas** (15, 20, 22, 24, 26, 28, 32, 36, 40, 44, 52, 56) | **5 radius** (4, 6/10, 12, 12+, full) |

Achados:
- [alto] escopo inteiro — `src/components/ui/button.tsx` **não é importado em nenhum dos 15 arquivos**; toda ação usa `btn-silver` ou `<button className="...">` — em relação ao componente canônico já existente com focus-visible, `disabled`, tamanho de ícone e alturas fixas — migrar tudo para `<Button variant size>` e apagar `.btn-silver` ao final.
- [alto] `src/index.css:237-239` `btn-silver` sem altura/tamanho de fonte → `src/pages/Profile.tsx:185` (44px), `src/pages/Eventos.tsx:193` (`text-xs px-4 py-2` → 32px; **conflito** `px-4`/`py-2` sobrescrevendo `px-6 py-3`), `src/components/StudentTools.tsx:410` (`text-xs px-3 py-1.5` → 28px), `src/pages/Support.tsx:42` (`py-4 text-base` → 56px) — 4 alturas para o mesmo "botão primário" — `Button size="sm|default|lg"` (36/40/44).
- [alto] `src/pages/Eventos.tsx:190-200` e `src/pages/Profile.tsx:223-233` — o mesmo botão alterna entre `btn-silver` e "outline" conforme o estado (classe condicional) — em relação a variantes estáveis — usar `variant={active ? "secondary" : "default"}` do `Button`, nunca trocar classe utilitária por classe componente.
- [alto] `src/components/TaskChecklist.tsx:341, 409, 457, 465, 473, 485, 502, 617` — botões `text-[10px] px-2 py-1 rounded` (≈22px de altura, radius 4px) — em relação a `rounded-lg`/`rounded-md` do resto e ao mínimo 44px — `Button size="sm"` (`h-9`) com `text-xs`; radius único.
- [alto] `src/pages/NpsForm.tsx:294-308` — Voltar/Enviar com `rounded-xl` e primário reimplementado (`bg-primary hover:bg-primary/90 font-semibold`) — em relação a `Button` (`rounded-md`) e `btn-silver` (`rounded-lg`) → 3 radius diferentes para botão primário — `Button`.
- [médio] `src/pages/Ferramentas.tsx:116-122` — botão "Acessar a ferramenta" `text-[11px] px-2.5 py-1.5 rounded-lg border bg-background/60` — variante ad hoc de outline — `Button variant="outline" size="sm"`.
- [médio] `src/pages/Profile.tsx:232` — texto de loading `"..."` no botão — em relação a `Loader2 animate-spin` usado em NpsForm `:305` e StudentTools `:413` — `Button loading` prop com spinner.
- [médio] `src/pages/Profile.tsx:254-257` — botão "Sair da conta" como texto solto `text-sm text-destructive` sem padding (alvo ~20px) — `Button variant="ghost"` destructive ou `variant="link"` com `h-10`.
- [médio] `src/components/StudentTools.tsx:298-303` — "Adicionar ferramenta" `text-[10px] hover:underline` ícone 12px (~15px de altura) — em relação a `TaskChecklist.tsx:626-631` "Adicionar tarefa" `text-xs py-1` ícone 14px — mesma ação, dois tamanhos; `Button variant="ghost" size="sm"`.
- [médio] `src/components/StudentTools.tsx:310-327` — segmented control caseiro (`p-1 rounded-lg` + `px-3 py-1 rounded-md text-xs`) — em relação a `TaskChecklist.tsx:653-674` (tipo de resultado: `flex-1 px-3 py-2.5 rounded-lg border`) — mesma interação, dois visuais — usar shadcn `Tabs` ou `ToggleGroup` canônico.
- [médio] `src/components/StudentTools.tsx:381-391` — `<label>` estilizado como botão (`text-xs px-3 py-1.5 rounded-lg border-primary/30`) com `border-primary/30` anulado pela regra global — `Button variant="outline" size="sm" asChild` com `<label>`.
- [baixo] `src/pages/Support.tsx:38-46` — `<a>` com `btn-silver` + `gap-3` (demais usam `gap-2`/`gap-1.5`) — `Button asChild size="lg"`.

---

## 3. Cards

| Tela | Estilo(s) | Radius | Padding | Sombra | Borda / fundo |
|---|---|---|---|---|---|
| Conteudos `:44,54` | `glass-card` | xl | `p-5` (corpo) | hover lift | `bg-card` |
| Ferramentas `:110` / `:185` | `glass-card p-5 space-y-4` / `glass-card p-5 gap-4 min-h-[132px]` | xl | p-5 | hover lift | `bg-card`; bloqueado `opacity-60` |
| Eventos `:125` / `:102` | `glass-card p-6` / skeleton `glass-card p-6 h-32` | xl | **p-6** | hover lift (em card informativo) | `bg-card` |
| Ranking `:71` / `:101` / `:146` | `rounded-2xl border-primary/40 bg-gradient p-5` / `rounded-2xl border bg-card/70 divide-y` / `rounded-2xl border bg-card/70 p-4` | **2xl** | p-5 / p-3 (rows) / p-4 | nenhuma | `bg-card/70`, gradiente |
| Profile `:135,157,192` / `:201` | `glass-card p-6` / row `rounded-lg border bg-background/50 p-4` | xl / **lg** | p-6 / p-4 | hover lift em card de formulário | `bg-card` / `bg-background/50` |
| Support `:57` | `glass-card` (accordion) | xl | `p-4` (botão) | **hover lift em accordion** | `bg-card` |
| NpsForm `:204` / `:210` | `rounded-2xl border-status-green/30 bg-status-green/5 p-6` / `rounded-2xl border bg-card/80 p-5 md:p-6` | 2xl | p-6 / p-5→6 | nenhuma | `bg-card/80` |
| TarefasPage `:272` / `:218` / `:239` | Stat `glass-card p-3` / grupo `rounded-lg border bg-card/70 p-3` / row `rounded-xl border bg-card/70 p-3` | xl / **lg** / xl (na mesma tela) | **p-3** | hover lift em Stat estático | `bg-card`, `bg-card/70` |
| StudentTools `:282` / `:441` / `:467` / `:308` | wrapper `rounded-2xl border bg-card/70 p-5` / card aluno `rounded-2xl border bg-background/40 p-5 min-h-[132px]` / item `rounded-lg border bg-background/40 px-3 py-2.5` / form `rounded-xl border-primary/30 bg-primary/5 p-3` | 2xl / 2xl / lg / xl | p-5 / p-5 / 12×10 / p-3 | nenhuma | `bg-card/70`, `bg-background/40`, `bg-primary/5` |
| TaskChecklist `:291,378,445,495` / `:529` | rows `rounded-lg border px-3 py-2.5` com borda/fundo por status / resultado `rounded-lg bg-muted/50 p-2 ml-8` | lg | 12×10 / p-2 | nenhuma | `bg-card`, `bg-status-*/5`, `bg-card/50` |
| ResultsRanking `:92` / `:85` | `glass-card p-4` / empty `glass-card p-6` | xl | **p-4** / p-6 | hover lift | `bg-card` |
| EventAttendanceList `:106` | `rounded-lg border bg-card/60 px-3 py-2` | lg | 12×8 | nenhuma | `bg-card/60` |

Achados:
- [alto] escopo — 4 famílias de card (`glass-card`, `rounded-2xl border bg-card/70`, `rounded-lg border bg-card/70`, `rounded-xl border bg-card/70`) e 8 opacidades de fundo (`bg-card`, `/80`, `/70`, `/60`, `/50`, `bg-background/40`, `/50`, `/60`) — em relação a um card canônico — `SectionCard` com `padding="sm|md|lg"` (12/16/24) e uma superfície (`bg-card`), radius fixo.
- [alto] `src/pages/Ferramentas.tsx:185-195` vs `src/components/StudentTools.tsx:437-458` — o **mesmo** "tool card" (ícone em caixa `w-11 h-11 rounded-xl`, título `text-base font-semibold`, `min-h-[132px]`, `gap-4`) duplicado com radius `xl` vs `2xl` e fundo `bg-card` vs `bg-background/40` — extrair `ToolCard`.
- [médio] `src/pages/TarefasPage.tsx:218` (`rounded-lg`) vs `:239` (`rounded-xl`) — dois radius para containers irmãos na mesma tela — unificar.
- [médio] `src/index.css:230-235` `.glass-card:hover` translate/sombra aplicado a elementos não-interativos: `Support.tsx:57` (accordion), `Profile.tsx:135,157,192` (formulários), `TarefasPage.tsx:272` (Stat), `Eventos.tsx:125` — em relação ao princípio "hover = affordance de clique" — separar `SectionCard` (estático) de `SectionCard interactive` / `ListRow`.
- [médio] paddings `p-3`, `p-4`, `p-5`, `p-6` para cards de mesmo nível (Stat p-3, ResultsRanking p-4, Ferramentas p-5, Eventos p-6) — grade 4/8 pede 2 valores (16/24) para cards e 12 para rows.
- [baixo] `src/pages/Ranking.tsx:71` — `border-primary/40` + gradiente para destaque: borda anulada por `index.css:261` → só o gradiente renderiza — usar `SectionCard tone="highlight"` com token explícito.
- [baixo] `src/pages/NpsForm.tsx:204-208` — card de sucesso `border-status-green/30 bg-status-green/5` ad hoc — usar `EmptyState`/`SectionCard tone="success"`.

---

## 4. Badges / status

| Local | Implementação | Label |
|---|---|---|
| `StatusBadge.tsx` | canônico (`rounded-full`, `text-[10px]`/`text-xs`, dot) | via `bookingStatusConfig`/`taskStatusConfig` |
| `TaskChecklist.tsx:553-563` SectionHeader | badge manual `text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border` com `cfg.classes` | `taskStatusConfig[status].label` |
| `TaskChecklist.tsx:397,402` | texto `text-[10px] text-status-blue` | "Em andamento" |
| `TaskChecklist.tsx:449-451` | texto `text-[10px] text-status-yellow` | "O aluno marcou como concluída. Aguardando validação do mentor" |
| `TarefasPage.tsx:18-24` chips | `text-[10px] uppercase rounded-full border` | "Pendentes / Em andamento / **Aguardando validação** / Concluídas" |
| `TarefasPage.tsx:158-161` Stat | label `text-[10px] uppercase` | "Pendentes / Em andamento / **Aguardando** / Concluídas" |
| `TarefasPage.tsx:240` | dot `w-2 h-2` por status, sem texto | — |
| `TarefasPage.tsx:251-256` / `TaskChecklist.tsx:275-279` | chip "Prazo" `text-[10px] px-1.5 py-0.5 rounded-full` com ícone **Calendar** vs **Clock** (10px) e formato de data `dd MMM` vs `dd 'de' MMM` | "Prazo … · vencido" |
| `TaskChecklist.tsx:282-284` | chip responsável `bg-muted` (sem `/50`) | nome |
| `TaskChecklist.tsx:536-538` | rótulo `text-[10px] uppercase` | "Quantitativo / Qualitativo" |
| `Eventos.tsx:180-186` | texto `text-xs text-status-green font-medium` | "Presença confirmada ✦" / "Você marcou que não vai participar." |
| `Profile.tsx:148-151` / `:214-217` | `CheckCircle2 h-3 w-3` + `text-xs text-status-green` | "Google Agenda conectado" / "Conectado: email" |
| `Ranking.tsx:121-123` | `text-[9px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-primary/10` | `role_label` |
| `Ranking.tsx:81-83` | círculo `h-6 w-6 text-xs font-bold border-2` | posição |
| `ResultsRanking.tsx:94-101` | círculo `w-8 h-8 text-xs font-bold` com cor por posição | "1º" |
| `Ferramentas.tsx:197` | texto `text-[11px]` | "Disponível após a sessão" |
| `EventAttendanceList.tsx:67-71` | tabs com contagem | "Confirmados / Sem resposta / Não vão" |

Achados:
- [alto] `src/components/TaskChecklist.tsx:553-563` — reimplementa o badge de status de tarefa com `uppercase tracking-wider` — em relação a `StatusBadge variant="task"` já existente (sem uppercase, `tracking-tight`, com dot) — substituir por `<StatusBadge variant="task" status={status} withDot />`.
- [alto] `src/pages/TarefasPage.tsx:22` "Aguardando validação" vs `:160` "Aguardando" vs `TaskChecklist.tsx:450` "Aguardando validação do mentor" — 3 labels para `done_by_student` — usar somente `taskStatusConfig.label`.
- [médio] `src/pages/TarefasPage.tsx:251-256` vs `src/components/TaskChecklist.tsx:275-279` — mesmo chip "Prazo" com ícone diferente (Calendar/Clock), formatação de data diferente (`toLocaleDateString` vs `date-fns`) — extrair `DueChip`.
- [médio] `src/pages/Eventos.tsx:182` — `✦` decorativo no texto de status (lido por leitor de tela) e status como texto solto — `StatusPill tone="success"` com ícone `aria-hidden`.
- [médio] `src/pages/Ranking.tsx:121` — `text-[9px]` (menor fonte do sistema) em badge `rounded` 4px — `StatusPill size="sm"` (mín. 11px).
- [médio] `src/pages/Profile.tsx:148-151` e `:214-217` — status "conectado" duplicado em dois cards com ícone `h-3 w-3` (12px) — um `StatusPill` na linha de integração apenas.
- [baixo] `src/index.css:250-252` `.status-badge` (uppercase, `text-xs`, `px-3`) não usada no escopo e divergente do `StatusBadge` — remover a classe CSS.
- [baixo] `src/components/TaskChecklist.tsx:275` (`bg-muted/50`) vs `:282` (`bg-muted`) — chips vizinhos com opacidade de fundo diferente.

---

## 5. Tipografia

Tamanhos encontrados no escopo (10): `text-[9px]` (Ranking:121), `text-[10px]` (≈35 ocorrências: TarefasPage, TaskChecklist, StudentTools, Ranking, ResultsRanking, EventAttendanceList), `text-[11px]` (Ferramentas:119,197; Ranking:153; TarefasPage:188; TaskChecklist:544; EventAttendanceList:80,91), `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl` (Support:54), `text-2xl`, `text-3xl` (Support:29).

Hierarquia de seção (h2) — 5 receitas:
- `text-lg font-semibold` + ícone 16px `text-primary` (Ferramentas:114)
- `text-lg font-semibold` + ícone 20px `text-status-yellow` (ResultsRanking:62-65)
- `text-lg font-medium` (Eventos:127 — título de card)
- `text-sm font-semibold` + ícone 16px (Profile:158, 193)
- `text-sm font-semibold uppercase tracking-wider` + ícone 16px (StudentTools:293)
- `text-xl font-semibold` sem ícone (Support:54)
- Section label `text-[10px] font-semibold uppercase tracking-wider` + ícone 14px (Ranking:64, 98, 139; TarefasPage:144)

Labels de formulário — 4 receitas:
- `text-sm text-muted-foreground mb-2` (Profile:164, 169, 178)
- `text-xs font-semibold uppercase tracking-wide` (NpsForm:213, 228)
- `text-sm font-medium text-foreground` (NpsForm:246, 255, 269, 282 — no mesmo formulário que o anterior)
- `text-xs text-muted-foreground mb-1|mb-2` (TaskChecklist:652, 679, 690, 702)
- `text-[10px] uppercase tracking-wider mb-1` (StudentTools:353)

Achados:
- [alto] escopo — 10 tamanhos, 3 deles abaixo de 12px (`9/10/11px`) usados para metadados, chips, labels e até botões — em relação a uma escala de ~6 passos (11/12/14/16/20/24) — remover `text-[9px]`/`text-[10px]`; `text-[11px]` só em `StatusPill`/caption com token `text-caption`.
- [alto] `src/pages/NpsForm.tsx:213-215` vs `:246` — dois estilos de label no mesmo formulário (uppercase xs vs sm medium) — um `FieldLabel` único.
- [médio] `src/components/StudentTools.tsx:293` — único `h2` em caixa alta; `Profile.tsx:158` mesmo nível em `text-sm` sem caixa alta; `Ferramentas.tsx:114` em `text-lg` — `SectionCard.title` com um estilo fixo (sugestão `text-base font-semibold`).
- [médio] `src/pages/Eventos.tsx:127` `font-medium` vs `Ferramentas.tsx:114`/`ResultsRanking.tsx:62` `font-semibold` para títulos de card do mesmo nível — um peso por nível.
- [médio] `src/pages/Conteudos.tsx:55` título de card `text-sm font-medium` vs `Ferramentas.tsx:195` `text-base font-semibold` vs `Eventos.tsx:127` `text-lg font-medium` — três níveis para "título de item".
- [baixo] `src/pages/Ranking.tsx:64` `text-primary` vs `:98` `text-muted-foreground` para section labels do mesmo nível — uma cor por nível.
- [baixo] `src/components/TaskChecklist.tsx:544`, `src/components/StudentTools.tsx:427-433`, `src/pages/TarefasPage.tsx:214` — `italic` para estados/notas; nenhum outro lugar usa itálico — remover.

---

## 6. Espaçamento

| Tela | Container | Vertical | Gaps de grid/lista |
|---|---|---|---|
| Conteudos `:25,36` | (AppLayout) | `space-y-8` | grid `gap-6` |
| Ferramentas `:103,175` | (AppLayout) | `space-y-8` | grid `gap-3` |
| Eventos `:93,114,100` | (AppLayout) | `space-y-8`; lista `space-y-6`; skeleton `space-y-4` | — |
| Ranking `:46,67,142` | `max-w-5xl mx-auto` | `space-y-8`; seções `space-y-3` | grid `gap-4` / `gap-3` |
| Profile `:128` | `max-w-2xl mx-auto lg:mx-0` | `space-y-8`; card interno `space-y-5`/`space-y-4` | `gap-5` |
| Support `:23,55` | `max-w-2xl mx-auto` | `space-y-8`; FAQ `space-y-2` | — |
| NpsForm `:187,210` | `max-w-3xl mx-auto` | `space-y-6`; form `space-y-6` | grid `gap-4` |
| TarefasPage `:142,157,216` | `max-w-4xl mx-auto` | `space-y-4`; lista `space-y-3` | grid `gap-3` |
| StudentTools `:292,308,463` | — | `mb-3`; form `space-y-2`; lista `space-y-2` | grid `gap-3` |
| TaskChecklist `:567,571` | — | `space-y-4`; grupos `space-y-1` | — |
| ResultsRanking `:60,90` | — | `space-y-4`; lista `space-y-3` | — |
| EventAttendanceList `:74,104` | — | `mt-4 pt-4`; `mb-3` | grid `gap-1.5` |

Achados:
- [alto] larguras máximas: nenhuma (Conteudos/Ferramentas/Eventos), `max-w-2xl` (Profile, Support), `max-w-3xl` (NpsForm), `max-w-4xl` (TarefasPage), `max-w-5xl` (Ranking) — 5 larguras de conteúdo — `PageContainer size="narrow|default|wide"` (ex.: 42rem / 56rem / 72rem).
- [alto] `src/pages/Profile.tsx:128` `mx-auto lg:mx-0` vs `Support.tsx:23`/`Ranking.tsx:46` `mx-auto` — mesma largura, alinhamento diferente em desktop — decidir uma regra no `PageContainer`.
- [médio] `space-y-8` (6 telas) vs `space-y-6` (NpsForm) vs `space-y-4` (TarefasPage) para o gap título→conteúdo — fixar em `PageContainer` (sugestão 24px mobile / 32px desktop).
- [médio] `src/pages/Conteudos.tsx:36` `gap-6` vs `Ferramentas.tsx:175` `gap-3` vs `Ranking.tsx:67` `gap-4` para grids de cards do mesmo tipo — um gap de grid (16px).
- [baixo] `src/components/EventAttendanceList.tsx:104` `gap-1.5` (6px, fora da grade 4/8) e `TaskChecklist.tsx:571` `space-y-1` — usar 8px.
- [baixo] `src/components/StudentTools.tsx:292` `mb-3` em header enquanto irmãos usam `space-y-*` — evitar margens em filhos; usar gap do pai.

---

## 7. Ícones

Tamanhos usados: `h-2.5` 10px (TarefasPage:252; TaskChecklist:276, 283), `h-3` 12px (Eventos:156; Profile:149, 215; StudentTools:302, 317; TaskChecklist:344, 412, 460, 478, 488, 516, 523, 532/535; EventAttendanceList:86, 93), `h-3.5` 14px (Ferramentas:121; Eventos:199, 210; Ranking:65; Support:49; TarefasPage:145; StudentTools:382, 413, 502, 545, 557; TaskChecklist:315, 318, 354, 361, 368…; ResultsRanking:67), `h-4` 16px (padrão), `h-[18px]` (ThemeToggle:16; Refresh:20), `h-5` 20px (Ferramentas:—; Support:44; NpsForm:190; Ranking:49; ResultsRanking:63; TaskChecklist:497), `h-6` 24px (Conteudos:33, 50; Ranking:58; ResultsRanking:86), `h-8` 32px (Support:27; NpsForm:205), `h-12` 48px (Conteudos:47).

Mesma ação, ícone diferente:
- [médio] "Prazo": `Calendar` (TarefasPage:252) vs `Clock` (TaskChecklist:276) — um ícone.
- [médio] "Aguardando/pendente": `ShieldCheck` (TarefasPage:160), `Clock` (TaskChecklist:446), `Clock3` (EventAttendanceList:69) — `Clock` e `Clock3` são visualmente quase iguais mas são dois ícones — um só.
- [médio] "Abrir item": `ExternalLink` para link (StudentTools:449, 502; Ferramentas:193; Eventos:156) e `Download` para arquivo (StudentTools:451, 504) — ok semanticamente, mas em `Ferramentas.tsx:193` o `ExternalLink` é decorativo (o card inteiro é o link) enquanto em `StudentTools.tsx:497` é botão — decidir: ícone decorativo ou ação.
- [médio] "Concluir tarefa": círculo vazio `w-5 h-5 border-2` (TaskChecklist:300), círculo com `PlayCircle` (:385), `Clock` (:446), `CheckCircle2` (:497) — 4 metáforas para a coluna de status da mesma linha — `TaskRow.leading` com `StatusPill`/checkbox único.
- [baixo] `Trophy` em `text-primary` (Ranking:49) vs `text-status-yellow` (ResultsRanking:63) — cor de ícone de seção: um token.
- [baixo] `h-[18px]` (ThemeToggleBubble:16, RefreshBubble:20) fora da escala 16/20 — usar `h-5`.
- [baixo] `h-2.5` (10px) em chips (TarefasPage:252; TaskChecklist:276, 283) — abaixo do mínimo legível; `h-3` em `StatusPill size="sm"`.
- [baixo] `src/pages/Profile.tsx:194-197` — SVG inline customizado para "Integrações" enquanto o resto usa lucide — usar `Plug`/`Link2` do lucide; SVG do Google (`:204-209`) em `aria-hidden`.

---

## 8. Modais / sheets / drawers

| Interação | Tela | Mecanismo | Observação |
|---|---|---|---|
| Ver diagnóstico por pilar | Ferramentas `:140-160` | `Dialog` `max-w-5xl max-h-[90vh] overflow-y-auto p-4 sm:p-6`, `DialogTitle text-base` | Conteúdo longo em modal centralizado; no mobile deveria ser `BottomSheet`/full-screen. `DialogTitle` reduzido para `text-base` (padrão shadcn `text-lg`). |
| Registrar resultado | TaskChecklist `:641-720` | `Dialog sm:max-w-md`, formulário inline, submit `btn-silver w-full` | Sem `DialogFooter`; sem botão cancelar; labels `mb-1`/`mb-2` misturados. |
| Planejar tarefa | TaskChecklist `:723-728` | `TaskPlanDialog` (fora do escopo) | — |
| Editar ferramenta | StudentTools `:518-527` | **`window.prompt` ×3 encadeados** | Nativo do browser, não estilizado, quebra PWA/iOS. |
| Confirmar exclusão | StudentTools `:553`; TaskChecklist `:364, 432, 519` | **`window.confirm`** | Idem; `AlertDialog` shadcn não usado. |
| Editar descrição de tarefa | TaskChecklist `:303-320` | Edição inline `border-b` | Ok como padrão, mas único lugar. |
| Adicionar ferramenta | StudentTools `:307-424` | Formulário inline expandível `rounded-xl border-primary/30 bg-primary/5` | Sem modal; ok, mas visual próprio. |
| Adicionar tarefa | TaskChecklist `:600-624` | Linha inline | — |
| FAQ | Support `:56-75` | Accordion caseiro com `motion.div height:auto` | shadcn `Accordion` não usado. |
| RSVP evento | Eventos `:188-212` | Botões inline | — |

Achados:
- [alto] `src/components/StudentTools.tsx:518-527, 553` e `src/components/TaskChecklist.tsx:364, 432, 519` — `prompt`/`confirm` nativos — em relação a `Dialog`/`AlertDialog` shadcn existentes — `ConfirmDialog` canônico e `BottomSheet` para edição.
- [alto] `src/pages/Ferramentas.tsx:141` — `Dialog max-w-5xl` para leitura longa — no mobile vira caixa 90vh com scroll interno — `BottomSheet` (Drawer/vaul) em `< md`, `Dialog` em `≥ md`, via componente responsivo único.
- [médio] `src/components/TaskChecklist.tsx:641-719` — Dialog sem `DialogFooter` e sem ação secundária (fechar só no X) — padronizar footer com `Cancelar`/`Salvar` em `Button`.
- [médio] `src/pages/Support.tsx:56-75` — accordion caseiro sem `aria-expanded`, com `glass-card` (hover lift) — shadcn `Accordion` dentro de `SectionCard`.
- [baixo] `src/pages/Ferramentas.tsx:143` — `DialogTitle className="text-base"` reduz o título padrão — manter escala do `Dialog`.

---

## 9. Estados loading / empty / erro por tela

| Tela | Loading | Empty | Erro |
|---|---|---|---|
| Conteudos `:31-34, 62-66, 13-19` | `Loader2 h-6` em `py-20` | `EmptyState` | Nenhum (`const { data }` ignora `error`) |
| Ferramentas `:170-173, 205-209, 32-38` | `Loader2 h-6` em `py-20` (só para tools; diagnóstico/StudentTools sem loading próprio) | `EmptyState` condicionado a `!hasSessionTools` | Nenhum |
| Eventos `:99-104, 106-112, 79` | **Skeleton** `glass-card h-32 animate-pulse` ×2 | `EmptyState` | `toast.error` só na mutação; load sem tratamento |
| Ranking `:58, 103` | `Loader2 h-6` em `py-12` | `<p>` `p-6 text-center text-sm` inline | Nenhum |
| Profile | Nenhum (mostra "Carregando..." no nome `:145`) | — | `toast.error` |
| Support | — (estático) | — | — |
| NpsForm `:199-202, 204-208` | `Loader2 h-4` + texto inline | Estado "já respondido" em card verde ad hoc | `toast.error` (`:133, 179`) |
| TarefasPage `:212, 214` | **texto** "Carregando…" `text-sm` centralizado | `<p>` `italic` "Nenhuma tarefa…" | Nenhum |
| StudentTools `:427, 429-433` | texto `text-xs italic` "Carregando..." | `<p>` `text-xs italic` (2 mensagens por papel) | `toast.error` traduzido (`:119-140`) |
| TaskChecklist `:636-638` | — | `<p>` `text-xs italic` (só liberty) | `toast.error` |
| ResultsRanking `:84-88` | — | `glass-card p-6` + `Trophy h-6` + texto | — |
| EventAttendanceList `:97-102` | texto `text-xs` "Carregando lista…" | `<p>` `text-xs` + `Users h-3.5` | Nenhum |

Achados:
- [alto] escopo — 7 padrões de loading (spinner 24px/py-20, spinner 24px/py-12, skeleton, spinner 16px + texto, texto sm, texto xs itálico, texto xs) — `LoadingState` (skeleton para listas, spinner para ações) e `Skeleton` shadcn.
- [alto] escopo — `EmptyState` usado em 3 de 11 empties; 8 empties ad hoc (`Ranking:103`, `TarefasPage:214`, `StudentTools:429`, `TaskChecklist:637`, `EventAttendanceList:100`, `ResultsRanking:85`, `NpsForm:204`) — usar `EmptyState compact` em listas e `EmptyState` cheio em páginas.
- [alto] `src/pages/Conteudos.tsx:13`, `src/pages/Ferramentas.tsx:32, 47, 63, 79`, `src/pages/Ranking.tsx:29`, `src/pages/TarefasPage.tsx:42-53`, `src/pages/Eventos.tsx:40` — erros de query silenciados → tela mostra "vazio" quando na verdade falhou — `ErrorState` com retry (`refetch`).
- [médio] `src/pages/TarefasPage.tsx:212` `"Carregando…"` (elipse tipográfica) vs `StudentTools.tsx:427` `"Carregando..."` (três pontos) vs `Profile.tsx:145` `"Carregando..."` — padronizar copy em `LoadingState`.
- [médio] `src/pages/Ferramentas.tsx:204-210` — lógica de empty depende de contagem de outra query (`hasSessionTools`); enquanto `sessionToolsCount` carrega, o `EmptyState` pode piscar — `LoadingState` agregado.
- [baixo] `src/pages/Profile.tsx:145` — placeholder "Carregando..." dentro do campo de nome — usar `Skeleton`.

---

## 10. Mobile

Alvos < 44px (alto impacto — todos em `TaskChecklist`/`StudentTools`, telas de uso diário):
- [alto] `src/components/TaskChecklist.tsx:292-301, 379-388` — checkbox de conclusão `w-5 h-5` (**20px**) — alvo mínimo 44px — `TaskRow` com hit-area 44px (padding no botão, visual 20px).
- [alto] `src/components/TaskChecklist.tsx:510-524` — Reabrir/Remover `p-1` + ícone 12px (**20px**) e `opacity-0 group-hover:opacity-100` → **invisíveis no touch** — ações em `ListRow.trailing` sempre visíveis ou em menu `⋯` (`DropdownMenu`) de 44px.
- [alto] `src/components/TaskChecklist.tsx:341, 409, 457, 465, 473, 485, 502, 617` — botões `text-[10px] px-2 py-1` (~22px) — `Button size="sm"` (36px) mínimo; ideal 44px em mobile.
- [alto] `src/pages/TarefasPage.tsx:200-207` — chips de filtro `text-[10px] px-2.5 py-1` (~22px) — `FilterChip` com `h-9`/`h-11`.
- [médio] `src/components/TaskChecklist.tsx:349-369, 417-437`, `src/components/StudentTools.tsx:497-506, 516-545, 551-558` — ícones `p-1.5` + 14px (**26px**) — `Button variant="ghost" size="icon"` (40px) ou 44px.
- [médio] `src/components/StudentTools.tsx:298-303` — "Adicionar ferramenta" ~15px de altura — `Button size="sm"`.
- [médio] `src/pages/NpsForm.tsx:56` — escala 0–10 com `h-9 min-w-9` (36px) e `gap-1.5` — 11 botões em `flex-wrap` quebram irregular em 360px — `h-11 min-w-11`, grid `grid-cols-6`/`grid-cols-11` responsivo.
- [médio] `src/pages/Ferramentas.tsx:116-122` (28px), `src/pages/Profile.tsx:236-242` (28px), `:254` (~20px), `src/pages/Eventos.tsx:190-211` (32px), `src/components/EventAttendanceList.tsx:77-94` (28px), `src/components/ResultsRanking.tsx:69-79` (28px), `src/components/StudentTools.tsx:311-327` (24px), `:381-420` (28px) — todos abaixo de 44px.
- [médio] `ProfileBubble.tsx:24` (avatar 40px), `ThemeToggleBubble.tsx:14` (`h-10 w-10`), `RefreshBubble.tsx:18` (`h-10 w-10`) — 40px — subir para 44px.

Overflow / hover-only:
- [alto] `src/pages/Conteudos.tsx:48-52` — botão Play aparece só em `group-hover` → no touch não há affordance de "assistir" além do card inteiro — mostrar overlay sempre (ou ícone estático) em `< lg`.
- [médio] `src/pages/Ferramentas.tsx:141` — `Dialog max-w-5xl max-h-[90vh]` com `DiagnosticSheet` — scroll interno em modal centralizado no mobile — `BottomSheet`.
- [médio] `src/components/EventAttendanceList.tsx:104` — `max-h-56 overflow-y-auto` (scroll aninhado) dentro de card — no mobile gera scroll-trap — remover `max-h` ou paginar.
- [baixo] `src/pages/Eventos.tsx:189` — dois botões `flex-wrap`; em 360px quebram em 2 linhas com larguras diferentes — `grid grid-cols-2` ou `w-full` no mobile.

Bubbles flutuantes sobre conteúdo:
- [alto] `src/components/ProfileBubble.tsx:21-22` (`fixed right-5`, top `safe-area + 1rem`), `ThemeToggleBubble.tsx:14` (`right-[8rem]`), `RefreshBubble.tsx:18` (`right-[11rem]`) — 3 elementos fixos no topo direito em mobile, ocupando ~176px+40px = ~216px da largura; sobrepõem `h1` longos ("Tarefas dos meus mentorados" `TarefasPage:148`, "Ranking Liberty" com ícone `Ranking:47`) e o eyebrow, a menos que o `AppLayout` reserve padding-top (não verificado, fora do escopo) — mover para uma `TopBar` do `AppLayout` (linha própria de 44px com safe-area), não flutuar sobre o conteúdo.
- [médio] espaçamento irregular entre bubbles: Profile ocupa 20→60px; Theme 128→168px; Refresh 176→216px → gap 68px entre Profile e Theme, 8px entre Theme e Refresh — alinhar com `gap-2` numa `flex` row.
- [baixo] `src/components/ProfileBubble.tsx:22` — `ring-2 ring-background` anulado por `index.css:273` → o anel vira `stroke-focus` fino em vez do "recorte" de fundo — usar `border-2 border-background` ou remover.
- [baixo] `src/components/RefreshBubble.tsx` — ação destrutiva de cache (`forceAppReload`) com um toque, sem confirmação, ao lado do tema — considerar mover para Perfil/Configurações.

---

## 11. Acessibilidade

Ícone/botão sem nome acessível:
- [alto] `src/components/TaskChecklist.tsx:292-301, 379-388` — checkbox de conclusão é `<button>` vazio só com `title` — `title` não é lido de forma confiável (e não existe no touch) — `aria-label` + `aria-pressed`/`role="checkbox" aria-checked`.
- [alto] `src/components/TaskChecklist.tsx:311-319, 349-369, 417-437, 510-524, 621-623` — botões icon-only só com `title` (ou nenhum: `:311`, `:317`, `:621`) — `aria-label`.
- [alto] `src/components/StudentTools.tsx:497-506, 516-545, 551-558` — icon-only com `Tooltip` mas sem `aria-label` (tooltip Radix não vira nome acessível automaticamente) — `aria-label` no `TooltipTrigger`.
- [médio] `src/pages/Support.tsx:58-64` — accordion sem `aria-expanded`/`aria-controls` — `Accordion` shadcn.
- [médio] `src/components/EventAttendanceList.tsx:77-88` e `src/pages/TarefasPage.tsx:200-207`, `src/components/ResultsRanking.tsx:69-79` — tabs/chips sem `role="tab"`/`aria-selected` ou `aria-pressed` — `Tabs` shadcn ou `aria-pressed`.
- [médio] `src/pages/NpsForm.tsx:48-66` — escala 0–10 sem `role="radiogroup"`/`aria-checked`, e sem `aria-labelledby` para a pergunta — `RadioGroup` ou `ToggleGroup` com labels.
- [médio] `src/pages/NpsForm.tsx:213, 228, 246, 255, 269, 282`, `src/pages/Profile.tsx:164, 169, 178`, `src/components/TaskChecklist.tsx:652, 679, 690, 702`, `src/components/StudentTools.tsx:353` — `<label>` sem `htmlFor` / input sem `id` — `FormField` com `id` gerado (`useId`).
- [médio] `src/pages/Profile.tsx:194-197, 204-209` — SVGs inline sem `aria-hidden="true"` — marcar decorativos.
- [baixo] `src/pages/Eventos.tsx:182` — `✦` lido pelo leitor de tela — `aria-hidden` ou remover.

Contraste / tamanho:
- [alto] `text-[10px]`/`text-[9px]` em `text-muted-foreground` (`Ranking:121, 128`; `TarefasPage:222, 243, 276`; `TaskChecklist:275-284, 397, 449, 536, 561`; `StudentTools:300, 353, 392, 482, 487`; `ResultsRanking:126`; `EventAttendanceList:108`) — abaixo de 11pt (HIG) independentemente do contraste; `muted-foreground` (38 8% 64% sobre 3%) passa AA em corpo, mas em 9–10px a legibilidade cai — mínimo 12px (`text-xs`) para texto de leitura; `11px` só em `StatusPill`.
- [médio] `src/pages/Ferramentas.tsx:186` — cards bloqueados `opacity-60` reduzem todo o contraste (título + ícone) — usar `text-muted-foreground` + ícone `Lock`, sem opacidade global.
- [médio] `src/components/TaskChecklist.tsx:498` — `text-foreground/70 line-through` — contraste cai; manter `line-through` com `text-muted-foreground` (token controlado).

Foco:
- [alto] praticamente todos os `<button>` nativos do escopo (`Eventos:190, 201`; `Profile:185, 223, 236, 254`; `Support:58`; `NpsForm:53, 294, 300`; `TarefasPage:186, 200`; `StudentTools:*`; `TaskChecklist:*`; `ResultsRanking:69`; `EventAttendanceList:77, 89`) — sem `focus-visible:ring` (perdem o anel padrão do browser ao aplicar `focus:outline-none` em inputs `NpsForm:219, 233, 262`; `StudentTools:333, 340, 348, 360`; `TaskChecklist:308, 610, 683, 696, 706`; `TarefasPage:170, 183`) — migrar para `<Button>`/`<Input>` shadcn, que já trazem `focus-visible:ring-2`.
- [médio] `src/pages/NpsForm.tsx:219, 233, 262, 275, 288` — `focus:ring-2` (não `focus-visible`) → anel aparece no clique de mouse; cor `ring-primary/40` anulada por `index.css:273` — usar `<Input>`/`<Textarea>`/`<Select>` shadcn.
- [baixo] `src/components/ProfileBubble.tsx:22` — `hover:ring-primary/40` sem `focus-visible` equivalente — adicionar.

---

## 12. Componentes canônicos propostos e mapa de substituição

### 12.1 Especificação resumida (cores mantidas; tokens existentes)

| Componente | API mínima | Regras visuais |
|---|---|---|
| `PageContainer` | `size="narrow\|default\|wide"` (42/56/72rem), `mx-auto` sempre | `px-4 md:px-6`, `space-y-6 md:space-y-8`, `pt` que respeite a `TopBar` |
| `PageHeader` | `title`, `subtitle?`, `eyebrow?` (`{icon,label}`), `icon?`, `actions?`, `align="start"` | `h1 text-2xl font-semibold tracking-tight`; subtítulo `text-sm text-muted-foreground`; eyebrow `text-[11px] font-semibold uppercase tracking-wider text-primary` + ícone 14px; `space-y-1` |
| `SectionCard` | `title?`, `icon?`, `description?`, `actions?`, `padding="sm\|md\|lg"` (12/16/24), `interactive?`, `tone="default\|highlight\|success"` | `rounded-xl border bg-card` (uma superfície); sombra/lift **só** com `interactive`; título `text-base font-semibold` + ícone 16px `text-primary`; radius único (`--radius`) |
| `Button` (shadcn existente) | usar `variant/size`; adicionar `loading?` e `size="xs"` **não** (mínimo `sm`=36px; padrão em mobile `default`=40 → subir para 44 via `h-11` em `< md`) | remover `.btn-silver`; `[&_svg]:size-4` já resolve tamanho de ícone |
| `IconButton` | `Button variant="ghost" size="icon"` + `aria-label` obrigatório (tipo TS) | 40/44px, ícone 16–20px |
| `StatusPill` | `tone="neutral\|info\|success\|warning\|danger\|primary"`, `size="sm\|md"` (11/12px), `icon?`, `dot?`, `label` | `rounded-full border font-medium`; padding `px-2 py-0.5` / `px-2.5 py-1`; **sem uppercase**; substitui `StatusBadge`+`.status-badge`+`SectionHeader`+chips ad hoc (`StatusBadge` vira wrapper de `StatusPill` alimentado por `bookingStatusConfig`/`taskStatusConfig`) |
| `FilterChip` | `active`, `count?`, `icon?`, `aria-pressed` | `h-9` (36) desktop / `h-11` mobile, `rounded-full`, `text-sm`; substitui 3 estilos de chip/tab |
| `EmptyState` (existente) | manter; adicionar `variant="inline"` (texto + ícone 16px, `py-6`) e `ErrorState` irmão com `onRetry` | usar em **todos** os empties |
| `LoadingState` | `variant="list\|card\|inline"` (Skeleton) e `Spinner` para ações | substitui 7 padrões |
| `ListRow` | `leading?`, `title`, `meta?` (`ReactNode[]` → renderiza `StatusPill`s), `trailing?` (ações sempre visíveis ≥40px ou `⋯` menu), `onClick?`, `tone?` | `min-h-[56px] px-3 py-2.5 rounded-lg border bg-card`; base de `TaskRow`, `ToolRow`, `RankingRow`, `AttendanceRow` |
| `ToolCard` | `icon`, `title`, `locked?`, `href?/onClick`, `trailingIcon?` | unifica `Ferramentas:185-199` e `StudentTools:437-458` |
| `BottomSheet` | responsivo: `Drawer` (vaul) em `< md`, `Dialog` em `≥ md`; `title`, `description?`, `footer?` | substitui `Dialog` de leitura longa, `prompt`, formulários em mobile |
| `ConfirmDialog` | `title`, `description`, `confirmLabel`, `destructive?`, `onConfirm` (AlertDialog) | substitui `window.confirm` |
| `FormField` | `label`, `hint?`, `error?`, `children`; gera `id`/`htmlFor` | label `text-sm font-medium text-foreground`; inputs = shadcn `Input/Textarea/Select` (`h-10`, `rounded-md`); remove `.input-begin` e 4 receitas de input |
| `TopBar` (AppLayout) | slot direito: `RefreshBubble`, `ThemeToggle`, `ProfileBubble` em `flex gap-2`, `h-11`, safe-area | remove 3 `fixed` independentes |
| `DueChip` | `date`, `overdue?` | `StatusPill tone={overdue?"danger":"neutral"} icon={Calendar}`; formatação única (`date-fns`) |

### 12.2 Mapa "onde substituir" (arquivo:linha → componente)

**PageContainer / PageHeader**
- `src/pages/Conteudos.tsx:25-29` → `PageContainer size="default"` + `PageHeader`
- `src/pages/Ferramentas.tsx:103-107` → idem
- `src/pages/Eventos.tsx:93-97` → idem
- `src/pages/Ranking.tsx:46-55` → `PageContainer size="wide"` + `PageHeader icon={Trophy}` (ou sem ícone)
- `src/pages/Profile.tsx:128-132` → `PageContainer size="narrow"` + `PageHeader`
- `src/pages/Support.tsx:23-35` → `PageContainer size="narrow"` + `PageHeader` (abandonar 3xl/hero)
- `src/pages/NpsForm.tsx:187-197` → `PageContainer size="default"` + `PageHeader eyebrow={{icon: ClipboardCheck, label: "Pesquisa de satisfação"}}`
- `src/pages/TarefasPage.tsx:142-155` → `PageContainer size="default"` + `PageHeader eyebrow={{icon: ListTodo, …}}`

**SectionCard**
- `src/pages/Ferramentas.tsx:110-137` → `SectionCard title="Mapeamento do Negócio" icon={Radar} actions={<Button variant="outline" size="sm">}`
- `src/pages/Eventos.tsx:125-224` → `SectionCard padding="lg"` (não interativo) + `EventCard` interno
- `src/pages/Profile.tsx:135-154, 157-189, 192-244` → `SectionCard title icon padding="lg"`
- `src/pages/Support.tsx:53-77` → `SectionCard title="Perguntas frequentes"` + shadcn `Accordion`
- `src/pages/NpsForm.tsx:210` → `SectionCard padding="lg"`
- `src/pages/NpsForm.tsx:204-208` → `EmptyState icon={CheckCircle2} title description` (tone success)
- `src/pages/TarefasPage.tsx:218-233` → `SectionCard padding="sm" title={session_name} description={"com …"}`
- `src/pages/TarefasPage.tsx:269-278` (`Stat`) → `StatCard` (variante de `SectionCard padding="md"`, sem hover)
- `src/pages/Ranking.tsx:71, 101, 146` → `SectionCard tone="highlight"`, `SectionCard padding="none"` (lista), `SectionCard padding="md"`
- `src/components/StudentTools.tsx:282-296` → `SectionCard title icon={Wrench} actions={<Button variant="ghost" size="sm">Adicionar</Button>}`
- `src/components/StudentTools.tsx:308` → `SectionCard tone="highlight" padding="sm"` (formulário inline)
- `src/components/ResultsRanking.tsx:92` → `SectionCard padding="md"`
- `src/components/TaskChecklist.tsx:529-549` → `SectionCard padding="sm" tone="neutral"` (resultado)

**Button / IconButton**
- `src/pages/Ferramentas.tsx:116-122` → `Button variant="outline" size="sm"`
- `src/pages/Eventos.tsx:190-200` → `Button variant={going ? "secondary" : "default"} size="sm" loading`
- `src/pages/Eventos.tsx:201-211` → `Button variant="outline" size="sm"`
- `src/pages/Eventos.tsx:150-157` → `Button variant="link" size="sm" asChild`
- `src/pages/Profile.tsx:185-188` → `Button loading={saving}`
- `src/pages/Profile.tsx:223-233` → `Button variant={connected ? "outline" : "default"} size="sm" loading`
- `src/pages/Profile.tsx:236-242` → `Button variant="outline" size="sm"`
- `src/pages/Profile.tsx:254-257` → `Button variant="ghost" className="text-destructive"`
- `src/pages/Support.tsx:38-46` → `Button size="lg" asChild><a …>`
- `src/pages/NpsForm.tsx:294-308` → `Button variant="outline"` + `Button loading`
- `src/pages/NpsForm.tsx:48-66` → `ToggleGroup type="single"` com itens `h-11 min-w-11`
- `src/pages/TarefasPage.tsx:186-192` → `Button variant="ghost" size="sm"`
- `src/components/StudentTools.tsx:298-303, 396-402, 403-420` → `Button variant="ghost|outline|default" size="sm"`
- `src/components/StudentTools.tsx:310-327` → `Tabs`/`ToggleGroup`
- `src/components/StudentTools.tsx:381-391` → `Button variant="outline" size="sm" asChild><label>`
- `src/components/StudentTools.tsx:497-506, 516-545, 551-558` → `IconButton aria-label`
- `src/components/TaskChecklist.tsx:292-301, 379-388` → `TaskRow` leading checkbox (44px hit-area, `role="checkbox"`)
- `src/components/TaskChecklist.tsx:311-319, 349-369, 417-437, 510-524, 621-623` → `IconButton aria-label` (sempre visível) ou `DropdownMenu ⋯`
- `src/components/TaskChecklist.tsx:339-345, 407-413, 455-479, 482-489, 500-505, 614-620, 626-631, 654-674, 711-717` → `Button size="sm"` (variantes `default/secondary/ghost`), `ToggleGroup` para tipo
- `src/components/EventAttendanceList.tsx:89-94` → `Button variant="outline" size="sm"`
- `src/components/ThemeToggleBubble.tsx:9-18`, `RefreshBubble.tsx:13-21` → `IconButton` dentro de `TopBar`

**StatusPill / FilterChip / DueChip**
- `src/components/TaskChecklist.tsx:553-563` → `StatusBadge variant="task"` (→ `StatusPill`)
- `src/components/TaskChecklist.tsx:397, 402, 449-451` → `StatusPill` na `TaskRow.meta` (label de `taskStatusConfig`)
- `src/components/TaskChecklist.tsx:275-279` e `src/pages/TarefasPage.tsx:251-256` → `DueChip`
- `src/components/TaskChecklist.tsx:282-284` → `StatusPill tone="neutral" icon={User}`
- `src/components/TaskChecklist.tsx:536-538` → `StatusPill size="sm"`
- `src/pages/TarefasPage.tsx:194-209` → `FilterChip` (labels de `taskStatusConfig`)
- `src/pages/TarefasPage.tsx:240` → `StatusPill dot` ou `TaskRow` leading
- `src/components/ResultsRanking.tsx:69-79` → `FilterChip`
- `src/components/EventAttendanceList.tsx:77-88` → `Tabs` ou `FilterChip role="tab"`
- `src/pages/Eventos.tsx:180-186` → `StatusPill tone="success|neutral"`
- `src/pages/Profile.tsx:148-151, 214-217` → um único `StatusPill tone="success" icon={CheckCircle2}` em `:214`
- `src/pages/Ranking.tsx:121-123` → `StatusPill size="sm" tone="primary"`
- `src/pages/Ferramentas.tsx:197` → `StatusPill tone="neutral" icon={Lock}`
- `src/index.css:250-252` → remover `.status-badge`

**EmptyState / LoadingState / ErrorState**
- `src/pages/Conteudos.tsx:31-34`, `Ferramentas.tsx:170-173` → `LoadingState variant="card"`
- `src/pages/Eventos.tsx:99-104` → `LoadingState variant="card"` (já é skeleton; padronizar)
- `src/pages/Ranking.tsx:58` → `LoadingState variant="list"`; `:103` → `EmptyState variant="inline"`
- `src/pages/NpsForm.tsx:199-202` → `LoadingState variant="inline"`
- `src/pages/TarefasPage.tsx:212` → `LoadingState variant="list"`; `:214` → `EmptyState icon={ListTodo}`
- `src/components/StudentTools.tsx:427, 429-433` → `LoadingState inline` / `EmptyState variant="inline"`
- `src/components/TaskChecklist.tsx:636-638` → `EmptyState variant="inline"`
- `src/components/ResultsRanking.tsx:84-88` → `EmptyState compact icon={Trophy}`
- `src/components/EventAttendanceList.tsx:97-102` → `LoadingState inline` / `EmptyState variant="inline"`
- `src/pages/Conteudos.tsx:13`, `Ferramentas.tsx:32, 47, 63, 79`, `Ranking.tsx:29`, `TarefasPage.tsx:42`, `Eventos.tsx:40` → capturar `error` → `ErrorState onRetry={refetch}`

**ListRow / ToolCard**
- `src/pages/Ferramentas.tsx:185-199` e `src/components/StudentTools.tsx:437-458` → `ToolCard`
- `src/components/StudentTools.tsx:465-567` → `ListRow leading={iconBox} title meta trailing={IconButtons}`
- `src/components/TaskChecklist.tsx:291-375, 378-441, 445-492, 495-551` → `TaskRow` (4 render functions → 1 componente com `status`)
- `src/pages/TarefasPage.tsx:239-259` → `TaskRow` compacto
- `src/pages/Ranking.tsx:108-129` → `ListRow leading={rank+avatar} trailing={points}`
- `src/components/EventAttendanceList.tsx:106-109` → `ListRow` compacto
- `src/pages/Support.tsx:57-74` → `Accordion` (não `ListRow`)

**BottomSheet / ConfirmDialog / FormField**
- `src/pages/Ferramentas.tsx:140-160` → `BottomSheet title` (Drawer em mobile)
- `src/components/TaskChecklist.tsx:641-720` → `BottomSheet` com `footer={<Button variant="outline">Cancelar</Button><Button loading>Salvar</Button>}`
- `src/components/StudentTools.tsx:518-527` → `BottomSheet` de edição com `FormField`
- `src/components/StudentTools.tsx:553`, `src/components/TaskChecklist.tsx:364, 432, 519` → `ConfirmDialog destructive`
- `src/pages/Profile.tsx:163-183`, `src/pages/NpsForm.tsx:212-291`, `src/components/StudentTools.tsx:329-375`, `src/components/TaskChecklist.tsx:651-709`, `src/pages/TarefasPage.tsx:167-184` → `FormField` + `Input/Textarea/Select` shadcn; remover `.input-begin`

**TopBar**
- `src/components/ProfileBubble.tsx`, `ThemeToggleBubble.tsx`, `RefreshBubble.tsx` → slot direito de `TopBar` no `AppLayout` (fora do escopo de leitura, mas é o ponto de inserção)

### 12.3 Ordem sugerida de execução
1. Criar `Button` loading + `IconButton`, `StatusPill`, `FilterChip`, `SectionCard`, `PageHeader/PageContainer`, `LoadingState/ErrorState`, `FormField`, `BottomSheet/ConfirmDialog`.
2. Migrar `TaskChecklist` e `StudentTools` primeiro (concentram ~60% dos achados de toque/acessibilidade).
3. Migrar páginas (Tarefas → Eventos → Profile → Ferramentas → Ranking → NpsForm → Support → Conteudos).
4. Remover `.btn-silver`, `.input-begin`, `.status-badge` e revisar as regras `!important` de `src/index.css:261-276` (hoje anulam bordas/rings coloridos que o código tenta aplicar — decidir se a intenção é "borda sempre neutra" e então apagar as classes `border-status-*/border-primary/*` do código, ou remover o override).