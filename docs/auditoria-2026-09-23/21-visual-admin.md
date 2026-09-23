# Auditoria de Design System — Páginas Admin (LibertyBeginSystem)

Escopo lido: 9 arquivos base + 13 páginas + 6 componentes. Nenhum arquivo foi editado.

## Diagnóstico geral (5 causas-raiz)

1. **Não existe primitivo de página.** Cada tela monta header, filtros e lista com JSX solto; 4 famílias de header coexistem.
2. **`StatusBadge` existe mas nenhuma página admin usa.** Agenda, Membros, Financeiro, Encerramentos, Sessões e Eventos definem mapas próprios de cor/label.
3. **Botões: 6 famílias.** shadcn `Button` (só em dialogs/Financeiro/Encerramentos), `btn-silver` (CSS global com `px-6 py-3` sempre sobrescrito), `<button>` solto (4 alturas: py-1 / py-1.5 / py-2 / py-2.5), chips `rounded-full`, links estilo botão, `<a>` estilo botão.
4. **Inputs: 4 famílias.** `input-begin` (padrão de fato), shadcn `Select/Input` (só `MemberSessionEditor`), `<select>/<input>` nativos com classes inline (Agenda drawer, MembroDetalhes, NPS, Encerramentos, TaskPlanDialog, SessionDeliverableDialog).
5. **Radius e superfície não normalizados.** `glass-card` (rounded-xl) vs `<Card>` shadcn (rounded-lg, nunca usado no admin) vs `rounded-2xl border bg-card/70|80` (MembroDetalhes, NPS) vs `rounded-xl border bg-card/50` (Encerramentos) — todos para "card de conteúdo".

---

## 1. Título de página por tela

| Tela | Tag | Classes | Subtítulo | Ações no header | Wrapper |
|---|---|---|---|---|---|
| AdminDashboard:172-178 | `h1` | `text-2xl font-semibold` + eyebrow `text-[10px] uppercase tracking-[0.14em]` | `text-sm mt-1 capitalize` | `AdminMonthFilter` | `space-y-8`, `lg:items-end` |
| AdminAgenda:774-779 | `h1` | `text-2xl font-semibold` | `text-sm mt-1` + pill de contagem inline | 3 grupos: segmented view, 2 botões soltos, nav prev/next | `space-y-6`, `lg:items-center` |
| AdminMembros:928-935 | `h1` | `text-2xl font-semibold` com `<span class="text-amber-400">` | `text-sm mt-1` | 4 botões soltos `h-10` + `AdminMonthFilter` | `space-y-6` |
| AdminMembroDetalhes:302 | `h1` | **`text-base font-semibold truncate`** dentro de card `rounded-2xl` | `text-xs` | Voltar (link texto) + "Editar cadastro" pill `text-xs` | `max-w-5xl space-y-4` |
| AdminMembroEditar:170 | `h1` | **`text-xl font-semibold`** dentro de `glass-card p-6` | `text-sm` | Voltar + `btn-silver text-sm` | `max-w-5xl p-6 space-y-6` (padding duplo com AppLayout) |
| AdminMentores:288 | `h1` | `text-2xl font-semibold` | `text-sm mt-1` | `btn-silver h-10` + `AdminMonthFilter` | `space-y-6` |
| AdminFinanceiro:250 | `h1` | `text-2xl font-semibold` | `text-sm mt-1` | `AdminMonthFilter` | `space-y-6` |
| AdminSessoes:159 | `h1` | `text-2xl font-semibold` | `text-sm mt-1` | `btn-silver h-10` | `space-y-6` |
| AdminConteudos:148 | `h1` | `text-2xl font-semibold` | `text-sm mt-1` | nenhuma (ação primária fica em h2 na linha 259) | `space-y-6` |
| AdminEventos:97 | `h1` | `text-2xl font-semibold` | `text-sm mt-1` | `btn-silver h-10` | `space-y-6` |
| AdminConfiguracoes:86-88 | `h1` | `text-2xl font-semibold` **+ ícone `h-6 w-6` inline** | `text-sm mt-1` | nenhuma | `space-y-8` |
| AdminNps:181-190 | `h1` em `<header>` | `text-2xl font-semibold` **+ ícone em caixa `h-10 w-10 rounded-xl`** | `text-sm` (sem mt-1) | nenhuma | `space-y-6`, sem motion |
| AdminEncerramentos:113-118 | `h1` em `<header>` | `text-2xl font-semibold` + ícone `h-6 w-6` inline, **sem `text-foreground`** | `text-sm mt-1` com `<strong>` | shadcn `Button outline sm` prev/next + `Button ghost` Hoje | `max-w-[1600px] space-y-6`, sem motion |

Achados:
- [alto] AdminMembroDetalhes.tsx:302 — h1 `text-base` — vs `text-2xl` em todas as outras — usar PageHeader com título `text-2xl` e mover identidade para um `ProfileHeader` abaixo.
- [alto] AdminMembroEditar.tsx:152,170 — `p-6` adicional + h1 `text-xl` — vs `space-y-6` sem padding e `text-2xl` — remover `p-6`, usar PageHeader.
- [médio] AdminDashboard.tsx:173 — eyebrow "Administração" existe só aqui — vs nenhuma outra tela — ou adotar em todas (prop `eyebrow` no PageHeader) ou remover.
- [médio] AdminConfiguracoes.tsx:87, AdminNps.tsx:182, AdminEncerramentos.tsx:116 — ícone no h1 com 3 tratamentos (inline 24px, caixa 40px rounded-xl, inline 24px) — vs 10 telas sem ícone — decidir uma regra (HIG: sem ícone em título de página).
- [médio] AdminAgenda.tsx:777 — pill de contagem `text-[10px] rounded-full bg-status-blue/10` dentro do subtítulo — vs contagem em texto no subtítulo em Membros/Mentores/Sessões — usar texto.
- [médio] AdminMembros.tsx:929 — cor `text-amber-400` no h1 (tema Liberty) — vs tokens `--silver`/`--primary` no theme-liberty do `index.css:77` — usar token, não amber hardcoded (também em :908, :974, :984, :1086, :1445; AccessManagement.tsx:269; AdminEncerramentos.tsx:231-233).
- [baixo] AdminDashboard.tsx:170 usa `lg:items-end`; demais `lg:items-center`; Encerramentos `sm:items-end`.
- [baixo] AdminNps.tsx / AdminEncerramentos.tsx / AdminMembroDetalhes.tsx / AdminMembroEditar.tsx não usam `motion.div staggerContainer` — vs 9 telas com animação de entrada — transição de página diferente ao navegar.

---

## 2. Botões

### Famílias e contagem (aproximada, por tela)

| Tela | shadcn `Button` | `btn-silver` | `<button>` solto (texto) | ícone-only solto | chips `rounded-full` | `<a>/<Link>` estilo botão |
|---|---|---|---|---|---|---|
| Dashboard | 0 | 0 | 1 (:372 `text-[10px] px-2 py-1 rounded-md`) | 0 | 0 | 0 |
| Agenda | 0 | 6 (:800,:1565,:1759,:1805,:1863 — todos com override de padding) | ~22 | ~14 (`p-0.5` a `p-2`) | ~10 (:911-961) | 1 (:1506 Zoom) |
| Membros | 9 (só em Dialogs) | 1 (:950) | 3 header (:938-948) + ~6 | 5 por linha (:1137-1197, `p-1.5`) + 1 (:1323) | 6 (:1011-1035) | 2 (:1100,:1365) |
| MembroDetalhes | 0 | 0 | 5 (:446,:474,:501,:654,:723,:729) | 0 | 5 (:456) | 2 (:286,:322) |
| MembroEditar | 0 | 1 (:157) | 1 (Voltar :154) | 0 | 0 | 0 |
| Mentores | 2 (Dialog) | 2 (:294,:313) | 1 (:322 texto puro) | 4 por card (:357-391 `p-1.5`) | N (:553 sessões) | 0 |
| Financeiro | 1 (:222 `h-7`) | 0 | 0 | 0 | 0 | 0 |
| Sessões | 2 (Dialog) | 3 (:164,:181,:256) | 1 (:257 Cancelar) | 2 por card (:311-317 `p-2`) | N (:248) | 0 |
| Conteúdos | 2 (Dialog) | 2 (:259,:270) | 0 | 2 por item (:298-303 `p-2`) | 0 | 1 (:294 "Abrir ↗" texto) |
| Eventos | 0 | 3 (:100,:153,:168) | 1 (:154) | 4 por card (:198-213 `p-2`) | 0 | 0 |
| Configurações | 0 | 3 (:121,:164,:212) | 0 | 0 | 0 | 0 |
| NPS | 0 | 0 | 1 (:237 `rounded-xl bg-primary py-2.5`) + linha clicável | 0 | 0 | 0 |
| Encerramentos | 4 (:124,:130,:133,:284) | 0 | 0 | 0 | 0 | 0 |
| AccessManagement | 0 | 0 | 1 (:278 Ativo/Inativo) | 1 (:293 `p-1.5`) | 6 tabs + 4 roles + 2 tier | 0 |
| AccessCredentialsDialog | 0 | 1 (:110) | 1 (:102) | 0 | 0 | 0 |
| MemberSessionEditor | 6 (`h-7`, `sm`, `outline`) | 0 | 1 (:268 "Relatório" texto `text-[10px]`) | 2 (:275-286 `p-1`, hover-only) | 0 | 0 |
| SessionDeliverableDialog | 0 | 2 (:202,:306) | 4 (:295-303) | 1 (:361 hover-only) | 0 | 0 |
| TaskPlanDialog | 0 | 1 (:100) | 1 (:87 texto) | 0 | 0 | 0 |

### Alturas e radius divergentes

- [alto] `index.css:236-239` — `.btn-silver` define `rounded-lg px-6 py-3` (≈48px) e **toda** ocorrência sobrescreve (`text-xs px-4 py-2` Agenda:800, `h-10 py-2.5` Membros:950, `py-2` Agenda:1805, `h-11` Agenda:1759, `text-sm px-5 py-2.5` Deliverable:202) — vs shadcn `Button` `rounded-md h-10` — eliminar `btn-silver`, usar `Button variant="default"`.
- [alto] Radius do botão primário: `btn-silver` = `rounded-lg`; shadcn `Button` = `rounded-md`; NPS:240 = `rounded-xl`; MembroDetalhes:747 = `rounded-lg`. Quatro radius para a mesma ação "Salvar/Confirmar".
- [alto] Alturas de botão secundário observadas: `h-7` (Financeiro:225, SessionEditor:195-244), `py-1` (Agenda:1008,1025; Dashboard:374), `py-1.5` (Agenda:797,842,890), `py-2` (Deliverable:295; MembroDetalhes:725), `py-2.5` (Membros:943; Agenda:1497), `h-9` (Encerramentos:124), `h-10` (Membros:938). Sete alturas — HIG pede 2 (regular 44 / compact 32-36).
- [médio] AdminAgenda.tsx:842-855 — botões Aprovar/Recusar com fundo tint colorido (`bg-status-green/15 border-status-green/30`) — vs Financeiro/Encerramentos que usam `Button` neutro — padronizar: primário neutro + destructive.
- [médio] AdminAgenda.tsx:1440,1450,1460 — "Trocar"/"Alterar" como `text-[10px] px-2 py-0.5 rounded` (≈20px) — vs `Button size="sm"` (36px) — usar `Button variant="link"` ou `ghost sm`.
- [médio] AdminMembroDetalhes.tsx:723-750 — footer de dialog com `<button>` soltos — vs `DialogFooter + Button` em Membros:1398-1403 — mesmo padrão de dialog, dois footers diferentes.
- [médio] AccessCredentialsDialog.tsx:102-114 — footer com `<button>` solto + `btn-silver` — idem.
- [médio] AdminMentores.tsx:322 — toggle "Mostrar inativos" é texto puro `text-[11px]` sem borda — vs AdminMembros que usa tab "Encerrados" (:962) — mesma função, dois padrões.
- [baixo] AdminConteudos.tsx:294 — "Abrir ↗" com caractere unicode — vs `ExternalLink` icon de lucide — usar ícone.
- [baixo] AdminSessoes.tsx:207,275 — ícone "✦" em texto — usar lucide `Sparkles`/`Star`.

---

## 3. Inputs / Selects

| Tela | `input-begin` | shadcn `Select`/`Input` | nativo com classes inline |
|---|---|---|---|
| Agenda | :1650,1678,1689,1704,1716,1722,1732,1744 (modal manual) | 0 | :948 (busca `rounded-full text-[11px] py-1.5`), :1468 (`<select>` status `px-2 py-1 text-xs`), :1558,1562,1585 (drawer), :1789-1798, :1854-1860 |
| Membros | :866-892, :999 | `Input` 0; `Select` 0 | 0 |
| MembroDetalhes | 0 | 0 | :686-690, :714-720 (`focus:ring-2 ring-primary/40`) |
| MembroEditar | :183, :204, :210, :221 | 0 | 0 |
| Mentores | :524-543 | 0 | 0 |
| Sessões | :210-235, :335-351 | 0 | 0 |
| Conteúdos | :321-344 | 0 | checkbox :347 |
| Eventos | :109-148 | 0 | checkbox :122,133,137 |
| Configurações | :104-208 | 0 | 0 |
| NPS | 0 | 0 | :221-231 (`rounded-xl bg-background`) |
| Encerramentos | 0 | 0 | :268-282 (`h-9 rounded-md bg-background px-2`) |
| AccessManagement | :203-208 | 0 | 0 |
| MemberSessionEditor | 0 | `Select` :193-222 (`h-7 text-xs`), :361-395; `Calendar+Popover` | 0 |
| SessionDeliverableDialog | 0 | 0 | `inputClass` :335 (`px-2.5 py-1.5`), `taClass` :336, **style inline** :253 |
| TaskPlanDialog | 0 | 0 | :76-81 |

Achados:
- [alto] Três alturas de campo: `input-begin` sem `h-10` = `py-3` (≈46px, MembroEditar:204 textarea, Membros:999 busca); com `h-10` (40px, maioria); `h-9` (Encerramentos:271); `h-7` (SessionEditor:195). HIG: uma altura padrão (44) + compact.
- [alto] Três estilos de foco: `focus:border-primary` (`input-begin`), `focus:ring-2 focus:ring-primary/40` (MembroDetalhes:689, NPS:224), `focus:border-primary/20` (Agenda:1471,1558). Unificar em `FormField`/`Input`.
- [alto] Dois fundos: `bg-card` (`input-begin`, drawer Agenda) vs `bg-background` (Agenda:952 busca, NPS:224, Encerramentos:272, shadcn `SelectTrigger`). Em light mode ambos são branco; em dark `card` = 8% e `background` = 3% — inputs visivelmente diferentes.
- [alto] `<select>` nativo (Agenda:1468,1686,1701,1729,1853; Sessões:221-238; Conteúdos:330-339; MembroDetalhes:686; NPS:221; MembroEditar:207) — vs shadcn `Select` (SessionEditor) — dropdown nativo do SO quebra visual do app; migrar para `Select`.
- [médio] Radius de campo: `rounded-lg` (`input-begin`), `rounded-md` (shadcn, Encerramentos:272), `rounded-xl` (NPS:224), `rounded-full` (busca Agenda:952), `borderRadius: 6` inline (Deliverable:253).
- [médio] Busca: Membros:993-1001 (`Search h-4 w-4 left-3`, `pl-10`, `input-begin`) vs Agenda:946-954 (`Search h-3.5 left-2.5`, `pl-8`, `rounded-full text-[11px]`) vs Agenda:1644-1651 (`left-3 h-3.5`, `pl-9`) vs AccessManagement:203 (sem ícone). Quatro caixas de busca.
- [médio] Label de campo: `text-[10px] font-semibold uppercase tracking-wider mb-1.5` (padrão em modais), `text-xs text-muted-foreground mb-1` (Agenda:1788, MembroEditar:198, SessionEditor:360 com `font-medium text-foreground`), `text-[10px] text-muted-foreground` sem uppercase (Agenda:1557), `text-[11px] uppercase tracking-wide` (NPS:218), `text-[10px] uppercase` sem tracking (Eventos:113). Cinco estilos de label.
- [médio] Checkbox nativo `<input type="checkbox" className="rounded border-border">` (Conteúdos:347, Eventos:122,133,137) — shadcn `Checkbox`/`Switch` não usado — tema não aplicado ao checkbox.
- [baixo] AdminEventos.tsx:109-131 — inputs sem `<label>`, só placeholder — vs demais com label.

---

## 4. Cards e tabelas

### Superfícies "card"

| Padrão | Onde | Radius / bg |
|---|---|---|
| `.glass-card` | Dashboard, Agenda, Membros, MembroEditar, Mentores, Financeiro, Sessões, Conteúdos, Eventos, Configurações, AccessManagement | `rounded-xl bg-card border` + hover translateY(-2px) |
| `rounded-2xl border bg-card/70\|80` | MembroDetalhes:299,381,615,653,772; NPS:202,255,283,357; MemberBookingsManager:113 | 16px, semi-transparente |
| `rounded-xl border bg-card/50` | Encerramentos:155 | 12px |
| `rounded-xl border bg-background/40` | MembroDetalhes:500 | 12px |
| `rounded-lg border bg-card` | Agenda:831,875 (linhas de pendência) | 8px |
| `rounded-lg bg-background/40 border` | Dashboard:350-358, AccessManagement:218 | 8px |
| shadcn `<Card>` | **nenhuma tela admin** | rounded-lg + shadow-sm |

Achados:
- [alto] `index.css:231-235` — `.glass-card:hover` aplica `translateY(-2px)` + sombra em **qualquer** glass-card, inclusive não interativos; por isso Agenda:819,866,1042,1243,1334,1430,1483 e drawer usam `style={{ transform: "none" }}` como workaround. Cards estáticos em Mentores:338, Sessões:265, Conteúdos:201, Eventos:176, Configurações:97 **sobem no hover sem ser clicáveis**. Separar `Card` (estático) de `Card interactive`.
- [alto] AdminMembroDetalhes e AdminNps usam `rounded-2xl` em 100% dos cards; todo o resto usa `rounded-xl`. Sensação de "outro app" ao abrir detalhe do membro.
- [alto] StatCard: Dashboard:194-215 (`glass-card p-5`, label `text-[11px] uppercase` topo, ícone caixa `h-8 w-8 rounded-lg` à direita, valor `text-3xl`), Financeiro:259-287 (`glass-card p-5`, ícone `h-5 w-5` solto no topo, valor `text-2xl`, label `text-xs` **abaixo**, lowercase), NPS:339-366 (`rounded-2xl bg-card/80 p-4`, ícone caixa `h-10 w-10 rounded-xl` à esquerda, valor `text-xl font-bold`), MembroDetalhes `InlineStat`:782-800 (chip `rounded-lg px-2.5 py-1.5`), MembroDetalhes `StatCard`:765-780 (definido e **não usado**), Mentores:402-433 (ícone + `text-lg`). **Cinco anatomias de StatCard.**
- [alto] Lista de membros (Membros:1047-1250) = grid CSS custom com `glass-card p-4` por linha e header `hidden lg:grid`; lista de mentores (Mentores:338) = cards altos; Financeiro = shadcn `Table`; NPS:284-332 = `<ul>` com grid `grid-cols-[1fr,1fr,auto,auto]` imitando tabela; Encerramentos = kanban + `divide-y`; AccessManagement:218 = linhas flex; Membros import:1483 = `<table>` nativa; relatório de sessões Conteúdos:201 = cards. Para "lista de entidades" há **6 implementações**.
- [médio] AdminMembroDetalhes.tsx:417 — card de tarefas com `bg-gradient-to-br from-primary/8` + `shadow-[0_8px_30px_-18px]` custom; :562 outro gradiente `from-status-green/5`; NPS:202 `from-primary/10`. Sombras/gradientes ad hoc — vs zero sombra no resto — remover ou tokenizar.
- [médio] AdminFinanceiro.tsx:303 — `Table` com override `[&_th]:text-[10px] uppercase tracking-[0.12em] h-10` — vs `TableHead` base `h-12 font-medium` — a única tabela shadcn já é customizada; extrair `DataTable` com esse header como padrão.
- [médio] AdminMembros.tsx:1483-1507 — `<table>` nativa com `p-2` — vs shadcn `Table` — migrar.
- [baixo] AdminMentores.tsx:438-455 — "Full info" grid repete nome/email já mostrados no header do mesmo card (:346-351).
- [baixo] AdminEncerramentos.tsx:231 — seção de alerta usa `amber-500` hardcoded — vs `status-yellow` token no resto.

---

## 5. Badges e status

Fonte canônica: `src/lib/bookingStatus.ts:124-158` (`bookingStatusConfig`) + `StatusBadge.tsx`. **Nenhuma página admin importa `StatusBadge`** (só MemberAgenda, MentorSessoes, AgendaOverview).

| Tela | Implementação | Labels divergentes |
|---|---|---|
| AdminAgenda.tsx:79-104 | `statusBg`, `statusText`, `statusLabel` próprios | `pending_approval` = "Aguardando aprovação" (canônico: "Aguardando confirmação"); `rescheduled` amarelo (canônico: azul); `cancelled` cinza (canônico: destructive) |
| AdminAgenda.tsx:1208 | `● {statusLabel}` texto colorido, sem pill | — |
| AdminAgenda.tsx:1169 | emoji "⏳ " prefixado no nome | — |
| AdminFinanceiro.tsx:146-152 | `tagClass`/`tagLabel` próprios, `text-[9px] uppercase rounded` (não full) | "Aguardando relatório" ok; sem borda, sem dot |
| AdminMembros.tsx:821-831 | `getMonthColor`/`getMonthBadgeBg` — ritmo mensal | "No ritmo/Parcial/Sem sessão" |
| AdminEncerramentos.tsx:25-30 | `memberPace` — mesma regra, outras classes (`/35`, `/40` borders) | mesmos labels, cores de borda diferentes de Membros |
| AdminMembros.tsx:1107, Mentores:348 | "Inativo" `text-[9px] uppercase rounded` (não full) | — |
| AccessManagement.tsx:281-287 | "Ativo/Inativo" como `<button>` `rounded-md text-[11px]` | — |
| AdminSessoes.tsx:286 | Ativa/Inativa `rounded-full text-[10px]` | — |
| AdminConfiguracoes.tsx:183-186 | Configurado/Não configurado `rounded-full text-[10px]` com ícone | — |
| AdminMembros.tsx:1496-1499 | Criado/Atualizado/Ignorado/Erro com `text-emerald-500`, `text-amber-500` hardcoded | cores fora dos tokens |
| AdminNps.tsx:37-42 | `scoreTone` — `rounded-lg text-sm font-bold` | — |
| MemberSessionEditor.tsx:255-259 | círculo `w-4 h-4` com "✓"/"⏱" caractere | — |
| AdminMembroDetalhes.tsx:520-527 | "N a fazer"/"N ok" `text-[10px] rounded-full` | — |
| AdminMembros.tsx:1240 | pill de ritmo com dot manual `w-1.5 h-1.5` — reimplementa `StatusBadge withDot` | — |

Achados:
- [alto] AdminAgenda.tsx:79-104 — mapa duplicado com 3 divergências de cor/label em relação a `bookingStatusConfig` — substituir por `StatusBadge` e derivar `statusBg` do config.
- [alto] AdminAgenda.tsx:1208 vs AdminFinanceiro.tsx:163 vs canônico — três formatos visuais de status de sessão (texto com ●, tag uppercase `rounded`, pill `rounded-full` com dot).
- [médio] AdminMembros.tsx:821-831 e AdminEncerramentos.tsx:25-30 — regra de "ritmo" duplicada com classes distintas — extrair `memberPaceConfig` em `lib/` e usar `StatusPill`.
- [médio] `index.css:250-252` — `.status-badge` (uppercase tracking-wide) definido e não usado por `StatusBadge.tsx` (que usa `tracking-tight`, sem uppercase) — dois "padrões oficiais" contraditórios; remover a classe CSS.
- [médio] Tamanho de texto de pill: `text-[8px]` (Agenda:1367), `text-[9px]` (Financeiro:163, Membros:1107), `text-[10px]` (maioria), `text-[11px]` (Encerramentos:202), `text-xs` (Conteúdos:164). `StatusBadge` só oferece 10px/12px.
- [baixo] Shadcn `Badge` (`badge.tsx`) nunca usado no admin.

---

## 6. Tipografia

Escala real encontrada (14 tamanhos): `text-[8px]`, `[9px]`, `[10px]`, `[11px]`, `xs`(12), `[13px]`, `sm`(14), `base`(16), `lg`(18), `xl`(20), `2xl`(24), `3xl`(30) + `font-mono`.

- [alto] Uso massivo de `text-[9px]`/`text-[10px]` para conteúdo (não só eyebrow): Agenda:1066,1131,1165,1281 (grade), Agenda:1367,1375 (`8px` no mês), Membros:1110-1129 (metadados da linha), Mentores:351,407, Financeiro:210, Dashboard:212,251,265. HIG mínimo legível ≈ 11px; 8-9px reprovado em acessibilidade.
- [alto] Eyebrow/label uppercase com 6 variações: `text-[10px] uppercase tracking-wider font-semibold` (modais), `text-[11px] uppercase tracking-wider font-medium` (Dashboard:200), `text-[11px] uppercase tracking-[0.18em] font-semibold` (Dashboard:24), `text-[10px] uppercase tracking-[0.14em]` (Dashboard:173), `text-[10px] uppercase tracking-[0.12em]` (Financeiro:137,303), `text-[11px] uppercase tracking-wide` (NPS:218,234,285,371), `text-[9px] uppercase tracking-wider` (Dashboard:265-279, MembroDetalhes:587), `text-sm uppercase tracking-wider` (MembroDetalhes:654, MemberBookingsManager:116 — h2 em caps). Definir 1 token `label-caps` (11px/600/tracking 0.08em).
- [médio] Pesos: `font-bold` em NPS:235,304,318,363 e Membros:1094,1226,1353 vs `font-semibold` padrão (CSS base h1-h3 = semibold). Padronizar em 500/600.
- [médio] Títulos de seção (h2): `text-sm font-semibold` (Dashboard:257, Configurações:98, AccessManagement:176), `text-base font-semibold` (Conteúdos:174, MembroEditar:191, MembroDetalhes:423,568), `text-sm font-semibold uppercase tracking-wider` (MembroDetalhes:654, BookingsManager:116), `text-lg` (Agenda drawer:1409). Quatro escalas para h2.
- [médio] `CardTitle` shadcn (`text-2xl`) nunca usado; `DialogTitle` recebe `className="text-lg"` em Membros/Mentores/Sessões/Conteúdos e `text-base` em SessionEditor:356/AccessCredentials:67 e default em MembroDetalhes:681/TaskPlan:63. Três tamanhos de título de dialog.
- [baixo] `text-[13px]` (MembroDetalhes:344,619) fora da escala Tailwind.
- [baixo] `capitalize` em subtítulo de datas (Dashboard:175, Agenda:776, NPS:224) vs `toTitleCase` util em outros lugares.

---

## 7. Espaçamento

| Tela | wrapper | gap header | cards internos |
|---|---|---|---|
| Dashboard | `space-y-8` | gap-4 | grid `gap-3` (:191,:317) e `gap-4` (:182,:389); `p-5`/`p-6`/`p-4` |
| Agenda | `space-y-6` | gap-4 | `p-4`(:819), `p-5`(:976), `p-3`(:831), `p-6`(drawer/modal), `p-5`(slot modals) |
| Membros | `space-y-6` | gap-4; header actions `gap-3` | linhas `p-4`, expand `p-5`, `space-y-2` |
| MembroDetalhes | `space-y-4` | gap-3 | `p-3`/`p-4`, grids `gap-2`/`gap-2.5`/`gap-3` |
| MembroEditar | `p-6 space-y-6` | — | `p-6`, `gap-4` |
| Mentores | `space-y-6` | gap-3 | `p-5 lg:p-6`, `space-y-4` |
| Financeiro | `space-y-6` | gap-4 | `p-5`, grid `gap-4` |
| Sessões | `space-y-6` | gap-4 | `p-5`, grid `gap-4` |
| Conteúdos | `space-y-6` | gap-4 | `p-4`, `space-y-2` |
| Eventos | `space-y-6` | gap-4 | `p-5`, `space-y-3` |
| Configurações | `space-y-8` | — | `p-6`, `gap-4` |
| NPS | `space-y-6` | gap-3 | `p-4`/`p-5`, grid `gap-3` |
| Encerramentos | `space-y-6` | gap-3 | `p-3`, `gap-4` |

- [alto] Padding de card oscila entre `p-3`, `p-4`, `p-5`, `p-6` sem regra por hierarquia. Definir: card padrão `p-5` (20), compacto `p-4`, linha `px-4 py-3`.
- [médio] `space-y-8` em Dashboard/Configurações vs `space-y-6` no resto vs `space-y-4` em MembroDetalhes. Escolher 24px entre seções.
- [médio] Gap de lista: `space-y-1` (SessionEditor:303), `space-y-1.5` (Financeiro:141, Agenda:1274), `space-y-2` (Membros, Conteúdos, Agenda:829), `space-y-3` (Eventos, Agenda mobile), `space-y-4` (Mentores). Definir 8px entre linhas, 12px entre cards.
- [médio] Valores fora da grade 4/8: `gap-2.5`, `p-2.5`, `py-1.5`, `px-2.5`, `mb-0.5`, `mt-1.5`, `gap-0.5` em dezenas de pontos (ex. MembroDetalhes:429,659; Agenda:1442; Financeiro:187). Restringir a 4/8/12/16/20/24.
- [baixo] AdminMembroEditar.tsx:152 `p-6` duplica padding do `AppLayout` — única tela com margem extra.

---

## 8. Ícones

Tamanhos usados: `h-2.5` (10px — Agenda:1140,1147,1305,1312,1321; :1009,1027), `h-3` (12), `h-3.5` (14), `h-4` (16), `h-5` (20), `h-6` (24). Seis tamanhos.

Mesma ação, ícones diferentes:
- **Editar**: `Edit` (Membros:1170, Mentores:371, Sessões:312, Conteúdos:299, Eventos:209) vs `Pencil` (Agenda:1140,1225; MembroDetalhes:289; SessionEditor:279) vs `UserCog` (Membros:1157 "editar completo").
- **Excluir**: `Trash2` (maioria) vs `X` (Agenda:1147,1312 slot delete) vs `Ban` (Agenda:855 recusar).
- **Salvar**: `Save` (Mentores form não, Sessões:256, Eventos:153, Configurações:126, MembroEditar:158, Encerramentos:290, TaskPlan:105) vs sem ícone (Dialogs shadcn "Salvar" em Membros:1416, Mentores:571).
- **Adicionar**: `Plus h-3.5` (headers) vs `Plus h-4` (EmptyState CTAs: Mentores:314, Sessões:182) vs `Plus h-3` (SessionEditor:349, Deliverable:344) vs `Plus h-2.5` (Agenda:1321).
- **Agenda/data**: `Calendar` (Dashboard:394, Mentores:411, Financeiro:265) vs `CalendarDays` (MembroDetalhes:514, Eventos:191) vs `CalendarClock` (Encerramentos) vs `CalendarIcon` (SessionEditor).
- **Voltar**: `ArrowLeft` texto (MembroDetalhes:282, MembroEditar:155) vs `ChevronLeft` (navegação de período).
- **Loading**: `Loader2 animate-spin` (padrão) vs `RotateCcw animate-spin` (SessionEditor:286) vs texto "Salvando..." sem ícone (Dialogs).

Achados:
- [alto] Ícones de ação em botões `h-3.5` (14px) dentro de alvos `p-1.5` (26px) — HIG: ícone 16-20px em alvo 44px. Ver §12.
- [médio] Ícone de botão em `Button` shadcn é forçado a `size-4` pelo base (`[&_svg]:size-4`), mas botões soltos usam `h-3.5` — ao migrar, ícones crescem 2px; aceitar e padronizar 16px.
- [médio] Tamanhos dentro de header de card: `h-4 w-4 text-primary` (Dashboard:258, Configurações:99, Conteúdos:175) vs `h-3.5` (MembroDetalhes:421, 566) vs `h-3` (MembroDetalhes:383, 617; Mentores:461). Definir 16px.

---

## 9. Modais / sheets / drawers / confirmações

| Interação | Implementação | Onde |
|---|---|---|
| Editar entidade (form) | shadcn `Dialog` + `DialogFooter/Button` | Membros:1392-1421, Mentores:504-574, Sessões:327-360, Conteúdos:313-356, SessionEditor:353-424 |
| Editar entidade (form) | **inline** no card (`glass-card border-primary/30`) | Sessões:196-260, Eventos:105-158 |
| Editar sessão | `Dialog` com footer `<button>` solto | MembroDetalhes:678-754 |
| Editar sessão | inline em linha (`h-7` selects) | SessionEditor:189-249 |
| Gerenciar booking | **drawer custom** framer-motion `fixed right-0 max-w-md` | Agenda:1394-1603 |
| Agendar manual | **modal custom** framer-motion `fixed inset-0` | Agenda:1606-1768 |
| Editar/excluir/adicionar slot | **modal custom** framer-motion `glass-card max-w-sm` | Agenda:1771-1868 |
| Confirmar exclusão | `window.confirm` | Membros:585,603,620,650,761; Mentores:203,223,246; Sessões:123; Conteúdos:132; Eventos:85 |
| Confirmar exclusão | `AlertDialog` shadcn | AccessManagement:290-321 |
| Confirmar exclusão | modal custom | Agenda:1815-1836 |
| Confirmar exclusão | **sem confirmação** | SessionEditor:127 (delete direto) |
| Confirmar mesclagem | `Dialog` com `Button` | Membros:1656-1707 |
| Motivo de recusa | `window.prompt` | Agenda:849 |
| Cancelar sessão | painel inline acordeão dentro do drawer | Agenda:1572-1597 |
| Detalhes (relatório) | `Dialog` read-only | Membros:1519-1557 |
| Detalhes (presença) | acordeão inline no card | Eventos:216 |
| Painel lateral (lembretes) | acordeão `AnimatePresence height` | Agenda:968-1036 |

Achados:
- [alto] 11 `window.confirm`/`prompt` nativos — vs `AlertDialog` em AccessManagement — janela do sistema operacional quebra totalmente a identidade; substituir por `ConfirmDialog`.
- [alto] AdminAgenda.tsx:1394-1868 — 4 overlays custom com backdrop `bg-background/60 backdrop-blur-sm` e animação própria — vs shadcn `Dialog/Sheet` (que têm overlay `bg-black/80` e animações `zoom-in-95`) — ao abrir um modal na Agenda e outro em Membros, backdrop, radius (`rounded-xl` vs `rounded-lg`) e botão fechar (`p-2 X` vs `absolute right-4 top-4 X h-4`) são diferentes. Migrar drawer para `Sheet` e modais para `Dialog`.
- [alto] MemberSessionEditor.tsx:127-141 — exclusão de sessão sem confirmação — vs Membros:603 com `confirm` — risco de perda de dados; adicionar `ConfirmDialog`.
- [médio] Edição inline (Sessões, Eventos, SessionEditor) vs Dialog (Membros, Mentores, Conteúdos) para o mesmo tipo de operação (CRUD de entidade). Escolher: Dialog para criar; Sheet para editar; inline só para campos únicos.
- [médio] `DialogContent` max-width variado: `max-w-sm`, `max-w-md`, `max-w-lg`, `max-w-2xl`, `max-w-4xl`, `sm:max-w-md`, `sm:max-w-lg`. Definir 3 tamanhos (sm/md/lg).
- [baixo] AdminMembros.tsx:1569 — `<p className="-mt-2">` para compensar espaçamento do `DialogHeader` — sinal de falta de `DialogDescription`.

---

## 10. Estados loading / empty / erro

| Tela | Loading | Empty | Erro |
|---|---|---|---|
| Dashboard:181-186 | 6 skeletons `glass-card h-24 animate-pulse` | — | — |
| Agenda | **nenhum** (queries sem `isLoading`) | texto `text-[10px] opacity-40` "Sem sessões" (:1272); nada no mês/dia | toast |
| Membros:1040-1045 | 8 skeletons `h-16` | `EmptyState` (:1381) | toast |
| MembroDetalhes:295 | texto "Carregando…" `py-12` | texto itálico (:467) | toast |
| MembroEditar:147-148 | texto "Carregando…" `p-8` | "Membro não encontrado." sem estilo | toast |
| Mentores:301-306 | 4 skeletons `h-32` | `EmptyState` com CTA `btn-silver` | toast |
| Financeiro:292 | texto "Carregando..." `animate-pulse` | `EmptyState compact` dentro de `p-4` | toast |
| Sessões:169-174 | 6 skeletons `h-24` | `EmptyState` com CTA | toast |
| Conteúdos:178-183 | 4 skeletons `h-16` | `EmptyState` ×2 | toast |
| Eventos:161 | 3 skeletons `h-28` | `EmptyState` com CTA | toast |
| Configurações:72-79 | 3 skeletons `h-40` **sem header** | — | silencioso (:41 `return` sem toast) |
| NPS:276-281 | texto "Carregando…" | div `border-dashed rounded-2xl` custom (não `EmptyState`) | toast |
| Encerramentos:144 | texto "Carregando…" sem padding | `EmptyState` dentro de seção amber | toast |
| AccessManagement:211 | `Loader2` spinner centralizado | texto `text-xs py-8` | toast |
| Membros report dialog:1551,1555 | — | texto centralizado ×2 variantes | — |

Achados:
- [alto] AdminAgenda.tsx — sem estado de loading em nenhuma view; calendário aparece vazio e depois "pula". Adicionar skeleton da grade.
- [alto] Quatro padrões de loading: skeleton (6 telas, alturas 16/24/28/32/40 sem relação com o conteúdo real), texto "Carregando…" (5 telas, com 3 paddings), spinner (1), nenhum (1). Definir `PageSkeleton` por tipo (stat-grid, list, table, form).
- [médio] `EmptyState` existe e é bom, mas NPS:279, MembroDetalhes:467, AccessManagement:326, Agenda:1272, Financeiro:132, MembroEditar:148 reinventam. Usar `EmptyState compact`.
- [médio] Configurações:72-79 — skeleton oculta header inteiro; demais telas mantêm header durante loading.
- [baixo] Grafia "Carregando..." (3 pontos, Financeiro:292) vs "Carregando…" (reticências, demais).

---

## 11. Filtros

| Filtro | Componente | Telas |
|---|---|---|
| Mês (global) | `AdminMonthFilter` (botões soltos `rounded-lg text-xs py-2`, `min-w-[160px]`) | Dashboard, Membros, Mentores, Financeiro |
| Mês/período | prev/next `p-1.5` + "Hoje" texto + segmented dia/semana/mês | Agenda:784-813 |
| Mês | `<select>` nativo `rounded-xl` | NPS:221-231 |
| Janela 6 meses | shadcn `Button outline h-9` prev/next + label `bg-muted min-w-[220px]` + `Button ghost` Hoje | Encerramentos:124-139 |
| Mentor | chips `rounded-full text-[10px] py-1.5` com dot colorido | Agenda:910-931 |
| Status sessão | chips `rounded-full text-[10px]` | Agenda:934-945 |
| Ritmo membro | chips `rounded-full text-[11px]` com ícone `h-3` | Membros:1003-1023 |
| Status tarefa | chips `rounded-full text-[10px] uppercase` com contagem | MembroDetalhes:452-464 |
| Tier (tabs) | tabs underline `border-b-2 py-2.5 text-sm` + badge contagem | Membros:958-989 |
| Tier/role (tabs) | chips `rounded-full text-[11px]` + badge contagem | AccessManagement:184-201 |
| Ativos/inativos | texto link `text-[11px]` | Mentores:322-329 |
| Ordenação | chip amarelo `bg-status-yellow text-background` | Membros:1024-1035 |
| Busca | ver §3 | Membros, Agenda ×2, AccessManagement |

Achados:
- [alto] Seletor de mês em 4 formas (AdminMonthFilter, Agenda nav, NPS select, Encerramentos Buttons). Estender `AdminMonthFilter` (ou criar `PeriodNav`) com props `views`, `range` e usar nas 4.
- [alto] Chips de filtro em 5 variantes (`text-[10px]`/`[11px]`, com/sem ícone, com/sem dot, com/sem contagem, uppercase ou não). Criar `FilterChip` único (h-8, text-xs, rounded-full, `active` = `bg-primary`).
- [médio] Tabs: underline (Membros) vs chips (AccessManagement) para a mesma semântica "segmentar por tipo". Shadcn `Tabs` não usado. Escolher um.
- [médio] AdminMonthFilter.tsx:9-19 — botão "Visão Geral" `rounded-lg text-xs px-3 py-2` (≈32px) e prev/next `p-2` (32px) — abaixo de 44px; e estilo diferente dos chips de filtro da mesma tela.
- [baixo] AdminMembros.tsx:1028 — estado ativo do chip "Priorizar" em amarelo sólido — único chip com cor de status como fundo.

---

## 12. Mobile

- [alto] Alvos < 44px em praticamente todas as ações de ícone: `p-1.5` + `h-3.5` = 26px (Membros:1137-1197, Mentores:357-391, Agenda:1224-1228, AccessManagement:293); `p-2` + `h-4` = 32px (Sessões:311, Conteúdos:298, Eventos:198-213, Agenda:1410,1618); `p-1` + `h-3` = 20px (SessionEditor:275-286); `p-0.5` + `h-2.5` = 14px (Agenda:1136-1148,1300-1313); "Trocar/Alterar" ≈20px (Agenda:1440); chips `py-1.5 text-[10px]` ≈26px (Agenda:911-961).
- [alto] Ações só em hover: Agenda:1134 (`opacity-0 group-hover:opacity-100` editar/excluir slot desktop), Agenda:1299, Agenda:1319 (botão "+ disponibilidade" invisível até hover), SessionEditor:277,283 (editar/excluir booking invisíveis — **também em desktop até hover, e em touch nunca aparecem**), Deliverable:361 (remover linha). Em Membros:1327 o mesmo padrão foi corrigido (`opacity-100 lg:opacity-0`) — aplicar igual.
- [alto] AdminMembros.tsx:1049,1090 — grid `repeat(12,36px)` em overview; header `hidden lg:grid` — em <lg as 12 colunas de mês somem da linha e só aparecem no expand (:1345) — ok, mas a linha "Progresso/Sessões/Status" empilha sem labels (perde contexto).
- [médio] AdminFinanceiro.tsx:303 — `Table` com 8 colunas; wrapper shadcn tem `overflow-auto` mas não há indicação de scroll nem coluna fixa; no celular a 1ª coluna (mentor) sai da tela ao rolar.
- [médio] AdminMembros.tsx:1483 — `<table>` de import dentro de `max-h-64 overflow-auto` sem `min-w`; colunas espremem.
- [médio] AdminEncerramentos.tsx:148-149 — kanban `auto-cols-[minmax(260px,1fr)]` com `overflow-x-auto` — sem snap nem indicador; header sticky (:157) não funciona porque o container de scroll é horizontal.
- [médio] AdminAgenda.tsx:1042 — day view `hidden lg:block`; mobile list (:1193) ok. Mas week view (:1243) `min-w-[700px]` e month view (:1334) `min-w-[600px]` forçam scroll horizontal com células `text-[8px]`.
- [médio] AdminMembros.tsx:937-954 — 4-5 botões `h-10` + AdminMonthFilter no header; em mobile viram 2-3 linhas com `flex-wrap`; mover secundários para menu "…" (`DropdownMenu`).
- [baixo] AdminAgenda.tsx:1405 — drawer `w-full max-w-md` sem `safe-area` e sem gesto de fechar; shadcn `Sheet` resolveria.

---

## 13. Acessibilidade

- [alto] Botões ícone-only sem `aria-label`: Agenda:804,810 (prev/next), 1410, 1618, 1779, 1848 (fechar), 1136-1148 e 1300-1313 (só `title`), 1224-1228 (só `title`), 1520,1554,1580; Sessões:311-317; Conteúdos:298-303; Eventos:198-213 (:199 só `title`); SessionEditor:275-286; Deliverable:361; AdminMonthFilter.tsx:21-42 (prev/next). Contraste: Membros:1137-1197 e Mentores:357-391 têm `aria-label` — usar como referência.
- [alto] `focus-visible` inexistente em `<button>` soltos (nenhuma classe `focus-visible:ring` fora de Membros:1082 e shadcn `Button`). Navegação por teclado invisível na Agenda inteira.
- [alto] Contraste: `text-muted-foreground/40` (Agenda:1272), `/50` (Agenda:1112 dot, Membros:1112), `/70` (Agenda:1066, Financeiro:157) sobre `bg-card` em dark — abaixo de 3:1. `text-[8px]`/`[9px]` agrava.
- [médio] `index.css:261-276` — regras `!important` globais forçam `--stroke-subtle` (10% alpha) em **toda** borda e `--tw-ring-offset-width: 0` em todo ring — o anel de foco do shadcn `Button` fica com 22% de alpha e sem offset; foco quase invisível. Revisar: excluir `focus-visible:ring-*` dessas regras.
- [médio] AdminMembros.tsx:1072-1081 — linha clicável com `role="button"` + botões internos com `stopPropagation` — botões aninhados em elemento interativo; leitores de tela anunciam mal. Preferir célula "nome" como link + coluna de ações fora do alvo da linha.
- [médio] AdminAgenda.tsx:1348 — célula do mês é `<button>` contendo `<div>`s e handlers de drag; AdminNps.tsx:295 — `<button>` com grid de `<div>`/`<p>` (conteúdo de bloco em botão é inválido).
- [médio] Ícones decorativos sem `aria-hidden` em todo lugar (lucide não adiciona por padrão).
- [médio] `<select>` nativos sem `<label htmlFor>` associado (labels são `<label>` sem `for`): Agenda:1685-1737, Sessões:216-238, Conteúdos:329-338, MembroDetalhes:685.
- [baixo] Emoji como sinal de estado (Agenda:1169 "⏳", Membros:1216 "✓ 12/12", Membros:1616 "🎉", Agenda:1752 "⚠") — sem texto alternativo.
- [baixo] AdminMembroDetalhes.tsx:790 — `title` como único texto do `InlineStat` (tooltip não acessível por teclado).

---

## 14. Componentes canônicos propostos e mapa de substituição

### `PageHeader`
`{ eyebrow?, title, subtitle?, actions?: ReactNode, back?: { to|onClick, label } }` → `h1 text-2xl font-semibold`, subtitle `text-sm text-muted-foreground mt-1`, `flex-col lg:flex-row lg:items-center gap-4`, sem ícone.

| Substituir em |
|---|
| AdminDashboard.tsx:170-179 · AdminAgenda.tsx:772-815 · AdminMembros.tsx:926-955 · AdminMembroDetalhes.tsx:280-292 (+ título 2xl) · AdminMembroEditar.tsx:153-160 · AdminMentores.tsx:286-299 · AdminFinanceiro.tsx:248-256 · AdminSessoes.tsx:157-167 · AdminConteudos.tsx:146-153 (mover CTA de :259 para `actions`) · AdminEventos.tsx:95-103 · AdminConfiguracoes.tsx:85-90 · AdminNps.tsx:181-191 · AdminEncerramentos.tsx:113-141 |

### `FilterBar` + `FilterChip` + `PeriodNav`
`FilterChip { active, icon?, count?, dot? }` h-8, `text-xs`, `rounded-full`. `PeriodNav { mode: 'month'|'range'|'day-week-month', value, onChange, showToday, showOverview }` substitui `AdminMonthFilter`.

| Substituir em |
|---|
| AdminMonthFilter.tsx (inteiro → PeriodNav) · AdminAgenda.tsx:784-813, 910-963 · AdminMembros.tsx:1003-1035 · AdminMembroDetalhes.tsx:452-464 · AccessManagement.tsx:184-201 · AdminNps.tsx:216-231 · AdminEncerramentos.tsx:123-140 · AdminMentores.tsx:322-329 (vira chip "Mostrar inativos") |

### `SearchInput`
`Input` com `Search` 16px à esquerda, `h-10 rounded-lg pl-9`.

| AdminMembros.tsx:993-1001 · AdminAgenda.tsx:946-954, 1644-1651 · AccessManagement.tsx:203-208 |

### `StatCard`
`{ icon, label, value, hint?, tone?, to?, size?: 'md'|'sm' }` — anatomia única: `Card p-5`, label caps 11px topo, ícone 16px em caixa 32px `rounded-lg` à direita, valor `text-3xl` (md) / `text-xl` (sm) `tabular-nums`, hint `text-xs`.

| AdminDashboard.tsx:193-218, 318-338, 350-361 · AdminFinanceiro.tsx:258-288 · AdminNps.tsx:193-199 e 339-366 (deletar local) · AdminMembroDetalhes.tsx:309-310 (`InlineStat` → `StatCard size="sm"`) e 765-780 (deletar `StatCard` local não usado) · AdminMentores.tsx:402-433 · AdminDashboard.tsx:262-283 (mini-stats da meta) |

### `Card` (estático) e `Card interactive`
Refatorar `.glass-card` → componente `Surface`/`Card` `rounded-xl border bg-card`; hover/translate só em `interactive`. Remover `style={{ transform: "none" }}`.

| Todos os `glass-card` estáticos: AdminAgenda.tsx:819,866,976,1042,1243,1334,1430,1483,1776,1819,1845 · AdminMentores.tsx:338 · AdminSessoes.tsx:196,265 · AdminConteudos.tsx:157,201,278 · AdminEventos.tsx:106,176 · AdminConfiguracoes.tsx:97,131,174 · AccessManagement.tsx:175 · AdminMembroEditar.tsx:162,190 · `rounded-2xl` em AdminMembroDetalhes.tsx:299,381,417,500,562,583,615,653,664,772,790 · AdminNps.tsx:202,255,283,315,357 · MemberBookingsManager.tsx:113 · AdminEncerramentos.tsx:155 |

### `DataTable` / `ListRow`
`DataTable` = shadcn `Table` com header caps 11px `h-10` (já em Financeiro:303), primeira coluna sticky, `min-w` por breakpoint e linha expansível. `ListRow { leading, title, meta, trailing, onClick? }` = `px-4 py-3 rounded-lg border` para listas em card.

| DataTable: AdminFinanceiro.tsx:303-329 (torna-se base) · AdminMembros.tsx:1047-1250 (header :1049 + linhas) e 1483-1507 · AdminNps.tsx:283-332 · AccessManagement.tsx:213-328 |
| ListRow: AdminAgenda.tsx:831-858, 875-902, 1003-1029 · AdminConteudos.tsx:201-247, 278-306 · AdminEventos.tsx:176-219 · AdminFinanceiro.tsx:154-170 · MemberSessionEditor.tsx:252-290 · AdminNps.tsx:262-270 · AdminEncerramentos.tsx:255-294 · AdminMembroDetalhes.tsx:500-546 |

### `StatusPill`
Evoluir `StatusBadge` para aceitar `config` genérico (`bookingStatusConfig`, `taskStatusConfig`, novo `memberPaceConfig`, `activeConfig`) e tamanhos `sm`(11px)/`md`(12px); deletar `.status-badge` do CSS.

| AdminAgenda.tsx:79-104 (deletar mapas), 1208, 1169, 1367 · AdminFinanceiro.tsx:146-165 · AdminMembros.tsx:821-831, 1107, 1240-1246, 1496-1499 · AdminEncerramentos.tsx:25-30, 203-208 · AdminMentores.tsx:348 · AdminSessoes.tsx:282-293 · AdminEventos.tsx:181-188 · AdminConfiguracoes.tsx:183-186, 199-202 · AccessManagement.tsx:278-288 · AdminMembroDetalhes.tsx:520-527 · MemberSessionEditor.tsx:255-259 |

### `ConfirmDialog`
Wrapper de `AlertDialog` `{ title, description, confirmLabel, destructive?, onConfirm, requireReason? }`.

| AdminMembros.tsx:585, 603, 620, 650, 761 · AdminMentores.tsx:203, 223, 246 · AdminSessoes.tsx:123 · AdminConteudos.tsx:132 · AdminEventos.tsx:85 · AdminAgenda.tsx:849 (`requireReason`), 1572-1597, 1815-1836 · MemberSessionEditor.tsx:127 (adicionar) · AccessManagement.tsx:290-321 (já é a referência) |

### `FormField` + `Input`/`Select`/`Textarea`/`Checkbox` shadcn
`FormField { label, hint?, required?, error?, children }` com label 11px caps 600 `mb-1.5`; `Input` `h-10 rounded-lg bg-card` + `focus-visible:ring`. Deletar `.input-begin`.

| Todas as ocorrências de `input-begin` (Agenda:1650-1744, Membros:866-892,999, MembroEditar:183-221, Mentores:524-543, Sessões:210-235,335-351, Conteúdos:321-344, Eventos:109-148, Configurações:104-208, AccessManagement:203) · nativos: Agenda:948,1468,1558,1562,1585,1789-1798,1854-1860 · AdminMembroDetalhes.tsx:686-720 · AdminNps.tsx:221-231 · AdminEncerramentos.tsx:268-282 · TaskPlanDialog.tsx:76-81 · SessionDeliverableDialog.tsx:195-200, 220-289, 335-336 (deletar `inputClass`/`taClass`), 253 (style inline) · AccessCredentialsDialog.tsx:92-97 · checkboxes Conteúdos:347, Eventos:122,133,137 → `Checkbox`/`Switch` · `<select>` → `Select`: Agenda:1468,1686,1701,1729,1853; Sessões:221,228,235,348; Conteúdos:330,336; MembroDetalhes:686; MembroEditar:207; NPS:221 |

### `Button` (shadcn) como única família + `IconButton`
Manter `default / secondary(outline) / ghost / destructive / link`; `size: default(h-10) | sm(h-9) | icon(h-10 w-10, min 44 em touch)`. Deletar `.btn-silver`. `IconButton { label (aria), icon, tooltip? }`.

| btn-silver: Agenda:800,1565,1759,1805,1863 · Membros:950 · MembroEditar:157 · Mentores:294,313 · Sessões:164,181,256 · Conteúdos:259,270 · Eventos:100,153,168 · Configurações:121,164,212 · AccessCredentialsDialog:110 · Deliverable:202,306 · TaskPlan:100 |
| IconButton: Membros:1137-1197,1323 · Mentores:357-391 · Sessões:311-317 · Conteúdos:298-303 · Eventos:198-213 · Agenda:804,810,1136-1148,1224-1228,1300-1313,1410,1520,1554,1580,1618,1779,1848 · AccessManagement:293 · SessionEditor:275-286 · Deliverable:361 · AdminMonthFilter:21-42 |
| `<button>` texto solto → `Button variant`: Agenda:797,842,850,888,894,988,1005,1023,1440,1450,1460,1497,1501,1592,1627,1634,1802,1830,1831 · Membros:938-948,1011,1024,1440,1596 · MembroDetalhes:446,474,501,654,723,729 · MembroEditar:154 · Mentores:322,553 · Sessões:248,257 · Eventos:154 · NPS:237 · AccessManagement:186,233,253,264,278 · AccessCredentialsDialog:102 · Deliverable:295-303,344 · TaskPlan:87 · Dashboard:372 |

### `Sheet` para o drawer da Agenda
| AdminAgenda.tsx:1394-1603 → `Sheet side="right"`; 1606-1768, 1771-1868 → `Dialog` |

### `PageSkeleton` + `EmptyState` (existente)
| Loading: AdminAgenda (adicionar) · MembroDetalhes:295 · MembroEditar:147 · Financeiro:292 · NPS:277 · Encerramentos:144 · AccessManagement:211 · Configurações:72-79 (manter header) |
| Empty: NPS:279 · MembroDetalhes:467 · AccessManagement:326 · Agenda:1272 · Financeiro:132 · MembroEditar:148 · Membros:1551,1555,1615 |

---

## Ordem sugerida de execução (maior impacto visual por esforço)

1. `Button` + `IconButton` + remover `btn-silver` (afeta todas as telas; ≥44px resolve §12 em massa).
2. `FormField/Input/Select` + remover `input-begin` e `<select>` nativos.
3. `ConfirmDialog` no lugar de `window.confirm` (11 pontos).
4. `StatusPill` sobre `bookingStatusConfig` na Agenda/Financeiro/Membros/Encerramentos.
5. `PageHeader` + `PeriodNav` + `FilterChip`.
6. `Card` sem hover-transform + normalizar `rounded-2xl` → `rounded-xl` em MembroDetalhes/NPS.
7. `StatCard` único; `DataTable` em Membros/NPS/AccessManagement.
8. Agenda: `Sheet`/`Dialog`, skeleton, ações visíveis em touch, tipografia mínima 11px.
9. Revisar `index.css:261-276` (`!important` em bordas/ring) para que o foco do shadcn volte a aparecer.