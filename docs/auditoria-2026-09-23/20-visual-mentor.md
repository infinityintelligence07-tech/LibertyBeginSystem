# Auditoria de Design System — Área do Mentor
**Repo:** LibertyBeginSystem (React + Vite + TS + Tailwind + shadcn/ui) · **Data:** 23/09/2026
**Escopo lido integralmente:** `src/index.css` (1–300), `ui/button.tsx`, `StatusBadge.tsx`, `EmptyState.tsx`, `MentorDashboard.tsx` (989 l.), `MentorSessoes.tsx` (521), `MentorAlunos.tsx` (297), `MentorDisponibilidade.tsx` (885), `MentorRelatorio.tsx` (621), `MentorFerramentas.tsx` (427), `FerramentaModelo.tsx` (265), `FerramentaAplicacao.tsx` (136), `mentor/MentorActionBanner.tsx` (259), `tools/ToolWizard.tsx` (734).

---

## 0. Base disponível (o que já existe e deveria ser o canônico)

| Primitivo | Onde | Especificação | Uso real na área do mentor |
|---|---|---|---|
| `<Button>` shadcn | `ui/button.tsx:7-24` | `rounded-md text-sm font-medium`, sizes `h-9 / h-10 / h-11 / icon h-10 w-10`, svg `size-4`, focus ring | **0 usos** em todo o escopo |
| `.btn-silver` | `index.css:237-239` | `bg-primary rounded-lg px-6 py-3 font-semibold` | 9 usos — sempre sobrescrevendo `px/py` |
| `.btn-primary` / `.btn-gold` | **não existem** (grep em todo o repo: 0 definições) | — | 7 usos (ver §2) |
| `.glass-card` | `index.css:218-235` | `bg-card border rounded-xl overflow-hidden` + hover `translateY(-2px)` + sombra | 30+ usos, inclusive em elementos **não interativos** que recebem hover-lift |
| `.input-begin` | `index.css:246-248` | `rounded-lg px-4 py-3` | 1 uso (`MentorAlunos:194`) — sobrescrito com `h-9 text-xs` |
| `.status-badge` | `index.css:250-252` | `rounded-full px-3 py-1 text-xs uppercase` | 0 usos |
| `<StatusBadge>` | `StatusBadge.tsx` | `sm: text-[10px] px-2 py-0.5` / `md: text-xs px-2.5 py-1`, dot | apenas `MentorSessoes:374,416` |
| `<EmptyState>` | `EmptyState.tsx` | `rounded-xl border-dashed`, ícone 12x12, `text-base` | `MentorSessoes:334`, `MentorAlunos:231`, `MentorFerramentas:264` |
| `--radius` | `index.css:39` | `0.75rem` (= `rounded-xl`) | shadcn Button usa `rounded-md`, código usa `rounded-lg/xl/2xl/full` sem regra |
| Override global de borda | `index.css:261-281` | Força **toda** `border-*` para `--stroke-subtle` com `!important` e `border-2` → 1px | Anula `border-primary/30`, `border-status-red/30`, `border-dashed border-primary/30` etc. (ver §3) |

---

## 1. Título de página

| Tela | Tag | Classes | Tamanho / Peso | Subtítulo | Eyebrow / Extra |
|---|---|---|---|---|---|
| MentorDashboard `:497` | `h1` | `text-2xl font-semibold text-foreground` | 24px / 600 | 2 parágrafos: `text-sm mt-1.5 text-foreground/80` (`:500`) **e** `text-xs mt-1 capitalize text-muted-foreground` (`:505`) | Eyebrow `text-[10px] uppercase tracking-[0.14em] font-semibold` (`:496`) |
| MentorSessoes `:268` | `h1` | `text-2xl font-semibold text-foreground` | 24px / 600 | `text-muted-foreground text-sm mt-1` (`:269`) | — |
| MentorAlunos `:181` | `h1` | `text-2xl font-semibold text-foreground` | 24px / 600 | `text-muted-foreground text-sm mt-1` (`:182`) | — |
| MentorDisponibilidade `:397` | `h1` | `text-2xl font-semibold text-foreground` | 24px / 600 | `text-muted-foreground text-sm mt-1` (`:398`) | — |
| MentorRelatorio `:314` | `h1` | `text-2xl font-semibold text-foreground` | 24px / 600 | `text-muted-foreground text-sm mt-0.5` (`:315`) | Botão voltar `p-1.5` à esquerda; `<Select h-7>` inline no header (`:328`) |
| MentorRelatorio (bloqueada) `:289` | `h2` | `text-base font-semibold` | 16px / 600 | `text-sm text-muted-foreground` | Página inteira sem `h1` |
| MentorFerramentas `:168` | `h1` | `text-2xl font-semibold text-foreground` | 24px / 600 | `text-muted-foreground text-sm` (**sem `mt-1`**, `:169`) | — |
| FerramentaModelo `:143` | `motion.h1` | `text-4xl sm:text-6xl font-semibold leading-[1.02] tracking-tight` | 36→60px / 600 | `text-base sm:text-lg text-muted-foreground mt-5` (`:151`) | Eyebrow pill `text-[10px] uppercase tracking-[0.28em]` (`:139`); título também repetido no topbar como `p.text-sm font-semibold` (`:123`) |
| FerramentaAplicacao | — | delega ao `ToolWizard` | — | — | Sem `h1` próprio |
| ToolWizard (topbar) `:217` | `p` | `text-sm font-semibold truncate` | 14px / 600 | `text-[11px] text-muted-foreground` (`:218`) | Cover: `h1 text-3xl sm:text-5xl leading-[1.05]` (`:282`) — diverge do `text-4xl sm:text-6xl` de FerramentaModelo |

**Achados**
- [alto] `MentorDashboard.tsx:496-507` — header com eyebrow + h1 + 2 subtítulos em tamanhos/cores distintas — em relação às outras 5 telas que usam h1 + 1 subtítulo `text-sm` — consolidar num `PageHeader` com slot único de `description` e `meta`.
- [médio] `MentorRelatorio.tsx:315` `mt-0.5` vs `mt-1` (Sessoes/Alunos/Disponibilidade) vs sem margem (`MentorFerramentas:169`) — espaçamento h1→subtítulo em 3 valores — padronizar em `mt-1` (4px) via `PageHeader`.
- [médio] `FerramentaModelo.tsx:143` vs `ToolWizard.tsx:282` — mesmo hero ("Mapeamento do Negócio") com escalas `text-4xl/6xl` vs `text-3xl/5xl` e `tracking-[0.28em]` vs `tracking-[0.22em]` no eyebrow — unificar em um único `ToolHero`.
- [baixo] `MentorRelatorio.tsx:277-303` — tela de bloqueio usa `h2` como título principal sem `h1` na página — acessibilidade/hierarquia — usar `PageHeader` + `Callout`.

---

## 2. Botões

### 2.1 Contagem por tela (aprox., contando ocorrências no JSX)

| Tela | `<Button>` shadcn | `.btn-silver` | `.btn-primary` (indefinido) | `<button>` nativo c/ classes soltas | `<a>`/`<Link>` estilizado como botão |
|---|---|---|---|---|---|
| MentorDashboard | 0 | 0 | 0 | ~17 (`:511,517,526,532,543,604,617,654,670,704*,713,739,936,944,960`) | 1 (`:666` Zoom) |
| MentorSessoes | 0 | 2 (`:432,448`) | 0 | ~11 (`:275,281,311,400,436,454,461,487,496`) | 0 |
| MentorAlunos | 0 | 0 | 0 | 5 (`:198,204,215,221,243`) | 0 |
| MentorDisponibilidade | 0 | 2 (`:645,874`) | 0 | ~18 (`:401,430,436,455,539,567,611,642,650,663,727,752,806,844,865`) | 1 (`:412` Link) |
| MentorRelatorio | 0 | 3 (`:345`(a), `:392,575`) | 0 | ~10 (`:282,310,356,390,450,469,492,517,566`) | 1 (`:345`) |
| MentorFerramentas | 0 | 0 | **2 (`:176,414`)** | ~8 (`:188,244,299,319`) | 0 |
| FerramentaModelo | 0 | 0 | 0 | 7 (`:116,160,173,191,226`) | 0 |
| ToolWizard | 0 | 3 (`:496,673`) | **4 (`:292,387,499,589`)** + `btn-gold` (`:668`) | ~12 (`:223,231,290,355,385,438,466,551,716`) | 0 |
| MentorActionBanner | 0 | 0 | 0 | 7 (`:151,175,209,217,226,233,240`) | 0 |
| **Total** | **0** | **10** | **7** | **~95** | 3 |

### 2.2 Alturas e radius observados (mesma função: "ação primária pequena")

| Ocorrência | Classes | Altura efetiva | Radius | Fonte |
|---|---|---|---|---|
| shadcn `Button` default | `h-10 px-4 rounded-md text-sm` | 40px | 6px | 14px |
| `MentorSessoes:432` Confirmar | `btn-silver text-xs px-3 py-1.5` | ~28px | 8px (`rounded-lg` da classe) | 12px |
| `MentorDisponibilidade:645` Adicionar | `btn-silver text-xs px-4 py-2` | ~32px | 8px | 12px |
| `MentorRelatorio:575` Salvar | `btn-silver px-6 py-2.5 text-sm` | ~40px | 8px | 14px |
| `MentorRelatorio:345` Zoom (`<a>`) | `btn-silver text-xs px-3 py-2` | ~32px | 8px | 12px |
| `MentorFerramentas:176` Aplicar ferramenta | `btn-primary text-sm px-4 py-2` | ~36px | **nenhum** (classe indefinida) | 14px |
| `FerramentaModelo:160` Iniciar | `px-10 py-4 rounded-full bg-primary text-base shadow-xl` | ~56px | 9999px | 16px |
| `ToolWizard:292` Iniciar | `btn-primary px-8 py-4 text-base shadow-lg` | ~56px | **nenhum** | 16px |
| `ToolWizard:668` Próxima etapa | `btn-gold rounded-xl bg-primary py-3 text-sm` | ~44px | 12px | 14px |
| `MentorDashboard:670` Relatório | `text-xs px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/15` | ~28px | 8px | 12px |
| `MentorDashboard:936` Ver relatório completo | `text-xs px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30` | ~28px | 8px | 12px |
| `MentorRelatorio:566` Gerar material | `text-xs px-4 py-2.5 rounded-lg border border-primary/30 bg-primary/5` | ~36px | 8px | 12px |
| `MentorDisponibilidade:408` Adicionar por período | `px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 text-xs` | ~32px | 8px | 12px |
| `FerramentaModelo:116` Voltar | `h-9 px-3 rounded-xl border text-xs` | 36px | 12px | 12px |
| `MentorActionBanner:209` Confirmar | `text-xs px-2 py-1` (sem borda/fundo) | ~24px | 0 | 12px |

**Achados**
- [alto] `MentorFerramentas.tsx:176,414`, `ToolWizard.tsx:292,387,499,589` — usam classe `btn-primary` que **não está definida** em nenhum CSS/config do repositório — em relação a `.btn-silver` (definida) — botões renderizam sem fundo/radius/cor (apenas texto). O CTA "Aplicar ferramenta" e "Iniciar/Continuar trilha" ficam invisíveis como botão. Trocar por `<Button>` (ou criar a classe até migrar).
- [alto] `ToolWizard.tsx:668` — `btn-gold` também indefinida; só funciona porque o autor repetiu `bg-primary rounded-xl py-3` inline — em relação a `:292` — remover classe fantasma e usar `<Button size="lg" className="w-full">`.
- [alto] Todo o escopo — **0 usos de `<Button>` shadcn**; ~95 `<button>` nativos com classes soltas — em relação ao componente canônico existente — migrar para `<Button variant=… size=…>` e apagar `.btn-silver`.
- [alto] `.btn-silver` (`index.css:237`) define `px-6 py-3` mas **todos os 10 usos sobrescrevem** padding e font-size (`text-xs px-3 py-1.5`, `px-4 py-2`, `px-6 py-2.5`) — a classe não é um token, é um "bg-primary" glorificado — substituir por `<Button>`.
- [alto] Mesmo papel "ação primária de card" tem 6 alturas diferentes: 24px (`ActionBanner:209`), 28px (`Dashboard:670`, `Sessoes:432`), 32px (`Disponibilidade:645`), 36px (`Ferramentas:176`), 40px (`Relatorio:575`), 56px (`Modelo:160`) — em relação à escala shadcn `h-9/h-10/h-11` — reduzir a 3 tamanhos.
- [médio] Botão "secundário outline" tem 5 receitas: `border border-border rounded-lg text-muted-foreground` (`Disponibilidade:652,867`), `border border-border/50 rounded-lg` (`Sessoes:456`), `border border-border/60 rounded-lg` (`Dashboard:946`), `border border-primary/30 bg-primary/5 rounded-lg text-primary` (`Relatorio:566`, `Disponibilidade:408`), `h-9 rounded-xl border` (`Modelo:116`) — usar `variant="outline"` / `variant="ghost"`.
- [médio] Botão destrutivo tem 3 receitas: `border-status-red/30 text-status-red hover:bg-status-red/10` (`Sessoes:439,489`), `hover:text-destructive hover:bg-destructive/10` icon-only (`Disponibilidade:541,755`, `Ferramentas:322`), `text-muted-foreground hover:text-destructive` sem borda (`ActionBanner:220`) — usar `variant="destructive"` ou `variant="ghost"` + `text-destructive`.
- [médio] Radius de botões varia `rounded-md` (tabs), `rounded-lg` (maioria), `rounded-xl` (`Modelo:116,174`, `Wizard:224,232,668`), `rounded-full` (`Modelo:160`, `Ferramentas:247`, `Modelo:194`, `Wizard:441,723`) — em relação a `--radius: 0.75rem` — definir 2 raios para botões: `rounded-lg` padrão, `rounded-full` só para pills/FAB.
- [médio] `MentorSessoes.tsx:200,230,247` e `MentorDisponibilidade.tsx:195` — `window.prompt`/`window.confirm` nativos para motivo de recusa/cancelamento — em relação ao `AlertDialog` shadcn usado em `MentorFerramentas:345` — substituir por `AlertDialog` com `Textarea`.
- [baixo] Segmented control (Mês/Geral, Ativos/Concluídos, Begin/Liberty, tabs de sessões) replicado 5× com `px-3 py-1` (`Dashboard:513`, `Alunos:200`) vs `px-4 py-1.5` (`Sessoes:314`, `Alunos:217`) — extrair `SegmentedControl` (ou usar `Tabs` shadcn).

---

## 3. Cards

| Tela | Contêiner | Radius | Padding | Sombra | Borda | Obs |
|---|---|---|---|---|---|---|
| Dashboard `:551` stats (button) | `glass-card p-5` | xl (12) | 20 | hover: `hover:shadow-lg` + lift da classe | `border` → subtle | `hover:border-primary/40` **anulado** pelo override global (`index.css:269` força `--stroke-focus`) |
| Dashboard `:565` financeiro | `glass-card p-5` | xl | 20 | **hover-lift em card estático** | subtle | não é interativo, mas "pula" no hover |
| Dashboard `:594` alerta relatórios | `border border-status-yellow/30 bg-status-yellow/5 rounded-xl p-5` | xl | 20 | — | `status-yellow/30` **anulada** pelo override → vira `--stroke-subtle` | cor da borda perdida |
| Dashboard `:648` próximas | `glass-card p-4` | xl | 16 | hover-lift | subtle | |
| Dashboard `:702` realizadas | `glass-card overflow-hidden` + `p-4` interno | xl | 16 | hover-lift | subtle | |
| Dashboard `:904-922` resumo relatório | `rounded-xl bg-background/40 border border-border/40 p-4` | xl | 16 | — | subtle | div solta |
| Dashboard `:963` sessão antiga | `rounded-lg border border-border/40 bg-background/30 p-3` | **lg (8)** | 12 | — | subtle | |
| Sessoes `:362` card sessão | **`dark glass-card bg-card text-card-foreground`** | xl | `p-4` | hover-lift | subtle | **Tema `dark` forçado** — em light mode o card fica escuro dentro da página clara |
| Sessoes `:329` loading | `glass-card p-8` | xl | 32 | hover-lift | subtle | |
| Alunos `:246` linha membro (button) | `glass-card w-full p-4` | xl | 16 | hover-lift + `hover:bg-muted/10` | subtle | |
| Disponibilidade `:428,491,683,710` | `glass-card p-5` | xl | 20 | hover-lift em 4 cards estáticos | subtle | |
| Disponibilidade `:516` slot | `p-3 rounded-lg border bg-muted/20 border-border/40` | lg | 12 | — | subtle | |
| Disponibilidade `:560` form inline | `p-4 rounded-lg border border-primary/20 bg-primary/5` | lg | 16 | — | `primary/20` anulada | |
| Disponibilidade `:673` vazio | `glass-card p-10` | xl | 40 | hover-lift | subtle | |
| Relatorio `:285` callout bloqueio | `rounded-2xl border p-6` | **2xl (16)** | 24 | — | `destructive/30` ou `status-yellow/30` anulada | |
| Relatorio `:353,377,544` | `rounded-2xl border bg-card/70 p-5` / `p-4` | **2xl** | 20 / 16 | — | subtle | |
| Relatorio `:365` essentials | `rounded-xl border bg-background/40 p-3` | xl | 12 | — | subtle | |
| Relatorio `:410,445` aside | `rounded-xl border bg-card/70 p-4` | xl | 16 | — | subtle | |
| Relatorio `:519` observações (button) | `glass-card p-4` | xl | 16 | hover-lift | `hover:border-primary/30` anulada | |
| Relatorio `:528` observações aberto | `border border-status-yellow/20 rounded-xl` | xl | 0 (header `px-3 py-2`, textarea `p-3`) | — | anulada | |
| Ferramentas `:191` catálogo (button) | `glass-card p-6` + gradient overlay | xl | 24 | hover-lift | subtle | |
| Ferramentas `:270` lista agrupada | `glass-card divide-y` + `p-4 sm:p-5` | xl | 16/20 | **hover-lift no contêiner inteiro da lista** | subtle | |
| Ferramentas `:296` item aplicação | `rounded-xl border bg-background/40 p-3` | xl | 12 | — | subtle | |
| Modelo `:230` membro no picker | `glass-card p-3` | xl | 12 | hover-lift dentro de Dialog | subtle | |
| ToolWizard `:272` hero | `glass-card p-6 sm:p-9` | xl | 24/36 | hover-lift em hero estático | subtle | |
| ToolWizard `:307,326,360,422,541,567,642,658` | `glass-card p-4/p-5/p-6` | xl | 16/20/24 | hover-lift | `:361` inline `borderColor` (única que sobrevive ao override, por ser inline) | |
| ToolWizard `:473` opção resposta | `rounded-2xl border p-4` (inline colors) | **2xl** | 16 | — | inline | |
| ToolWizard `:554` revisão | `rounded-xl border bg-card/60 p-3` | xl | 12 | — | `hover:border-primary/50` anulada | |
| ToolWizard `:435,459,579` inputs | `rounded-2xl bg-card border p-4` | **2xl** | 16 | — | subtle | inputs com radius maior que cards |
| ActionBanner `:148` | `rounded-lg border border-border/60 bg-card/40 backdrop-blur-sm` | **lg** | header `px-3 py-2`, itens `px-3 py-2.5` | — | subtle | único card do dashboard com `rounded-lg` |

**Achados**
- [alto] `MentorSessoes.tsx:362` — classe **`dark` fixa** no card (`dark glass-card bg-card text-card-foreground`) — em relação a todos os outros cards que respeitam o tema — em light mode gera "ilha escura"; e `.dark .glass-card { background-image: none }` (`index.css:227`) remove o gradiente só nesses cards. Remover `dark`.
- [alto] `index.css:261-271` override global `border-color: … !important` — anula **todas** as bordas semânticas do escopo: `border-status-yellow/30` (`Dashboard:594`), `border-primary/20` (`Disponibilidade:560`), `border-destructive/30` (`Relatorio:285`), `border-status-red/30` (`Sessoes:439`), `hover:border-primary/40` (`Dashboard:551`, `Ferramentas:191`), `border-dashed border-primary/30` (`Disponibilidade:665`), `focus:border-primary/30` (`Relatorio:388`) — o código "acha" que tem borda colorida mas renderiza cinza. Ou remover o override, ou parar de escrever bordas coloridas.
- [alto] `.glass-card` tem `transform: translateY(-2px)` + sombra no hover (`index.css:230-235`) e é usada em ~15 cards **não interativos** (`Dashboard:565`, `Disponibilidade:428,683,710`, `Sessoes:329`, `Ferramentas:270`, `Wizard:272,326,422,541,567,642,658`) — em relação ao princípio "só o que é clicável reage" — separar `SectionCard` (estático) de `InteractiveCard`/`ListRow` (com lift).
- [médio] Radius de contêiner em 3 valores no mesmo fluxo: `rounded-lg` (`ActionBanner:148`, `Dashboard:963`, `Disponibilidade:516,560`), `rounded-xl` (glass-card), `rounded-2xl` (`Relatorio:285,353,377,544`, `Wizard:435,459,473,579`) — em relação a `--radius: 0.75rem` — 1 radius para cards (xl), 1 para sub-itens aninhados (lg).
- [médio] Padding de card em 6 valores: `p-3, p-4, p-5, p-6, p-8, p-10` (+ `sm:p-9`) — em relação à grade 4/8 — fixar `p-4` (compacto) e `p-6` (padrão); `p-5` (20px) quebra a grade de 8.
- [médio] `MentorRelatorio.tsx:353,377,410,445,544` — 5 variações de superfície na mesma tela: `bg-card/70 rounded-2xl`, `bg-primary/5 rounded-2xl`, `bg-card/70 rounded-xl`, `bg-background/40 rounded-xl` — nenhuma é `glass-card` — usar `SectionCard` com `tone`.
- [baixo] `MentorFerramentas.tsx:193` — overlay `bg-gradient-to-r from-primary/10` + `glass-card` que já tem gradiente próprio (`index.css:224`) — gradiente duplo.

---

## 4. Badges / status

### 4.1 Inventário

| Local | Implementação | Classes | Label | Estado que representa |
|---|---|---|---|---|
| `Sessoes:374,416` | `<StatusBadge status={effectiveStatus}/>` | `text-[10px] px-2 py-0.5 rounded-full border` + dot | via `bookingStatusConfig` | booking status ✅ canônico |
| `Sessoes:418` | ad hoc `<span>` | `text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground` | "x/y tarefas" | contador |
| `Dashboard:729` | ad hoc | idem `:418` | "x/y tarefas" | contador (duplicata) |
| `Dashboard:734` | ad hoc | `text-[10px] px-2 py-0.5 rounded-full bg-status-yellow/15 text-status-yellow border border-status-yellow/20` | **"Sem relatório"** | awaiting_report — `StatusBadge` existe para isso |
| `Dashboard:637,896,967` | ad hoc texto | `text-[10px] uppercase tracking-wider text-muted-foreground` | contadores/datas | meta |
| `Disponibilidade:528` | ad hoc | `text-[10px] px-2 py-0.5 rounded-full bg-status-blue/15 text-status-blue border border-border font-medium` | **"Agendado"** | slot booked |
| `Disponibilidade:747` | ad hoc | `text-[10px] px-2 py-0.5 rounded-full bg-status-blue/10 text-status-blue font-medium` (**sem borda**, /10 vs /15) | **"Agendado"** | mesmo estado, receita diferente |
| `Disponibilidade:530` | ad hoc | `bg-status-green/15 … border border-border` | "Disponível" | slot livre |
| `Disponibilidade:749` | ad hoc | `bg-status-green/10` sem borda | "Disponível" | mesmo estado, receita diferente |
| `Disponibilidade:533` | ad hoc | `px-2 py-0.5 bg-primary/10 text-primary border border-primary/20` + ícone 2.5 | "Recorrente" | |
| `Disponibilidade:742` | ad hoc | `px-1.5 py-0.5 bg-primary/10 text-primary/90` sem borda | "Recorrente" | mesmo estado, 3ª receita |
| `Ferramentas:283` | ad hoc | `text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted` | "n aplicações" | contador |
| `Ferramentas:311` | ad hoc | `text-[10px] px-2 py-0.5 rounded-full bg-status-green/10 text-status-green` + `CheckCircle2 h-3` | "4.2/5" | completed |
| `Ferramentas:315` | ad hoc | `bg-muted text-muted-foreground` + `Clock h-3` | **"Preenchendo"** | in_progress |
| `Ferramentas:241` filtro | pill button | `text-xs px-3 py-1.5 rounded-full border` | **"Em preenchimento"** | in_progress — label ≠ `:315` |
| `Modelo:139`, `Wizard:277` | eyebrow pill | `text-[10px] uppercase tracking-[0.28em]` / `[0.22em]` `px-3 py-1.5` / `px-2.5 py-1` `rounded-full bg-primary/10` | "Ferramenta Begin" | mesma pill, 2 receitas |
| `Wizard:404` | pill | `text-[11px] px-2.5 py-1 rounded-full font-semibold` inline color | "Etapa 1/7 · …" | |
| `ActionBanner:157,199` | dot 1.5×1.5 | `bg-status-yellow` etc. (`dotFor`) | — | tipo de notificação (mapa próprio de cores) |
| `Sessoes:191-196` tabs | texto | — | **"Confirmadas"** | scheduled |
| `Dashboard:234`/`Alunos:278`/`Sessoes:293` | texto | — | **"agendadas"** | scheduled — label ≠ "Confirmadas" |

### 4.2 Labels diferentes para o mesmo estado
- **scheduled**: "Confirmadas" (`Sessoes:191`), "agendadas" (`Sessoes:293`, `Dashboard:235`, `Alunos:278`, `Disponibilidade:703` "sessões agendadas"), "Agendado" (slot, `Disponibilidade:528`).
- **awaiting_report**: "Sem relatório" (`Dashboard:734,974`), "relatório(s) pendente(s)" (`Sessoes:298`, `Dashboard:236`), "A última sessão ainda não tem relatório preenchido" (`Dashboard:929`); `StatusBadge` tem label próprio via `bookingStatusConfig`.
- **in_progress (ferramenta)**: "Preenchendo" (`Ferramentas:316`), "Em preenchimento" (`Ferramentas:242`).
- **completed (ferramenta)**: "Concluídos" (`Ferramentas:241`), "Concluídas" (`Ferramentas:210`), score "x/5" como badge (`Ferramentas:312`).

**Achados**
- [alto] `MentorDashboard.tsx:734` — badge "Sem relatório" ad hoc — em relação a `<StatusBadge status="awaiting_report">` já usado em `Sessoes:374` — substituir.
- [alto] `MentorDisponibilidade.tsx:528-535` vs `:742-750` — os mesmos 3 estados (Agendado/Disponível/Recorrente) com 2 receitas cada (com/sem borda, /15 vs /10, `px-2` vs `px-1.5`) na mesma página — criar `StatusPill` com `tone="blue|green|primary|neutral"`.
- [médio] `MentorFerramentas.tsx:241-242` vs `:315-316` — "Em preenchimento" vs "Preenchendo" para `in_progress` — unificar label num `toolStatusConfig`.
- [médio] Contador "x/y tarefas" duplicado (`Dashboard:729`, `Sessoes:418`) e "n aplicações" (`Ferramentas:283`) — 3 pills neutras diferentes — `StatusPill tone="neutral"`.
- [baixo] `MentorActionBanner.tsx:129-137` — mapa de cores `dotFor` próprio, desacoplado de `bookingStatusConfig` — centralizar.

---

## 5. Tipografia

### 5.1 Tamanhos em uso (font-size)
`text-[9px]` (`Dashboard:651`), `text-[10px]` (**~70 ocorrências** em todo o escopo), `text-[11px]` (~20: `Dashboard:554`, `Disponibilidade:716,737`, `Ferramentas:275,280`, `Modelo:243`, `Wizard:218,308,315,373,393,404,408,556,581`, `ActionBanner:157,184`), `text-xs` (massivo), `text-sm`, `text-base`, `text-lg`, `text-xl` (`Dashboard:568`, `Wizard:424,522`), `text-2xl` (h1s, stats), `text-3xl` (`Dashboard:559`, `Wizard:282`), `text-4xl/5xl/6xl` (heros). **Total: 12 tamanhos distintos.**

### 5.2 Labels uppercase tracking
| Receita | Onde |
|---|---|
| `text-[10px] uppercase tracking-[0.14em] font-semibold` | `Dashboard:496`, `Ferramentas:199` |
| `text-[11px] uppercase tracking-wider font-medium` | `Dashboard:554` |
| `text-[10px] uppercase tracking-wider` (sem peso) | `Dashboard:566,573,579,637,896,905…`, `Ferramentas:206,210,214` |
| `text-[10px] uppercase tracking-wider font-semibold` | `Relatorio:321,355,366,411,419,430,447,545` |
| `text-xs uppercase tracking-wider font-medium` | `Disponibilidade:684` |
| `text-[11px] uppercase tracking-[0.14em] font-medium` | `ActionBanner:157` |
| `text-[10px] uppercase tracking-[0.28em]` / `[0.22em]` | `Modelo:139` / `Wizard:277` |
| `text-xs font-semibold uppercase tracking-wider` (colorido) | `Relatorio:378` |
| `text-[10px] uppercase` (sem tracking) | `Dashboard:967`, `Disponibilidade:732` |

### 5.3 Pesos
`font-medium` e `font-semibold` misturados para o mesmo papel (nome de aluno: `font-medium` em `Dashboard:659`, `Alunos:257`; `font-semibold` em `Ferramentas:278`, `Modelo:240`). `font-bold` só em iniciais/números de etapa (`Ferramentas:275`, `Wizard:309,366,480`). `h1,h2,h3` já recebem `font-semibold tracking-tight` do CSS base (`index.css:204-207`), mas todos os h1 repetem `font-semibold` inline.

**Achados**
- [alto] Todo o escopo — `text-[10px]` (~70×) e `text-[11px]` (~20×) como tamanho de corpo de badges, labels, metadados e até texto de ajuda (`Sessoes:493,503`, `Wizard:393,581`) — em relação à escala Tailwind (`text-xs` = 12px mínimo legível) — definir `text-2xs` (11px) único para eyebrow/badge e proibir 9/10px.
- [médio] 9 receitas diferentes de "eyebrow uppercase" (tabela 5.2) — criar `Eyebrow` (ou classe `.label-caps`) com 1 tamanho, 1 tracking, 1 peso.
- [médio] `MentorDashboard.tsx:497-507` — no mesmo header: `text-2xl`, `text-sm`, `text-base` (inline em `:502`), `text-xs`, `text-[10px]` — 5 tamanhos em 12 linhas.
- [baixo] h1 repetem `font-semibold` já herdado de `index.css:206` — redundante; e `Dashboard:236 / Disponibilidade:433` usam `capitalize` em datas ptBR (gera "Setembro 2026") de forma inconsistente com `Sessoes:279` (também capitalize) vs `Relatorio:316` (sem).

---

## 6. Espaçamento

| Tela | Container externo | `space-y` raiz | Gaps internos predominantes | Largura máx |
|---|---|---|---|---|
| Dashboard | `AppLayout` (px herdado) | **`space-y-8`** (`:488`) | `gap-3` stats, `gap-4` financeiro, `space-y-2` listas, `space-y-3` realizadas, `mb-3/mb-4` títulos de seção | — |
| Sessoes | AppLayout | `space-y-6` (`:266`) | `gap-4` grid, `gap-4` header, `gap-2` ações, `-mx-1` tabs (`:305`) | — |
| Alunos | AppLayout | `space-y-6` | `space-y-3` lista, `gap-3/gap-4` | — |
| Disponibilidade | AppLayout | `space-y-6` | `gap-6` grid 2 col, `space-y-4`, `space-y-2` slots, `space-y-0.5` lista (`:721`) | `lg:grid-cols-[360px_1fr]` |
| Relatorio | AppLayout | `space-y-6` | `gap-5` grid (`:401`), `space-y-4`, `space-y-3`, `gap-3` | **`max-w-5xl mx-auto`** (`:307`) |
| Relatorio (bloqueio) | — | — | — | `max-w-2xl mt-12` (`:281`) |
| Ferramentas | AppLayout | `space-y-6` | `gap-3` catálogo, `space-y-4`, `gap-2` grid itens, `gap-5/gap-6` interno (`:194,203`) | — |
| Modelo | **`fixed inset-0`** próprio | — | `px-4`, `pt-14 pb-10 sm:pt-24 sm:pb-16`, `pb-24` | `max-w-5xl` |
| ToolWizard | `fixed inset-0` próprio | `space-y-4` por view | `px-4 py-6 pb-24`, `gap-2.5/3/4` | **`max-w-3xl`** (≠ Modelo `5xl`) |
| ActionBanner | — | — | `px-3 py-2` / `py-2.5` / `py-1.5` | — |

**Achados**
- [médio] `MentorDashboard.tsx:488` `space-y-8` vs `space-y-6` nas outras 5 páginas — ritmo vertical diferente na tela principal — padronizar `space-y-6`.
- [médio] `MentorRelatorio.tsx:307` `max-w-5xl mx-auto` — única página do AppLayout com largura máxima própria; `:281` outra (`max-w-2xl`) — mover para prop do `PageContainer`.
- [médio] `FerramentaModelo.tsx:113` `max-w-5xl` vs `ToolWizard.tsx:207` `max-w-3xl` — o topbar "salta" de largura ao entrar na demo/aplicação — unificar.
- [médio] Gaps fora da grade 4/8: `gap-2.5` (`Wizard:301,428,462,543`), `gap-1.5` (badges), `space-y-0.5` (`Disponibilidade:721`), `p-5` (20px) em toda parte, `py-2.5`, `mt-0.5`, `-mt-0.5` (`Sessoes:476`) — fixar escala 4/8/12/16/24/32.
- [baixo] `MentorSessoes.tsx:305` `-mx-1` para compensar `p-1` das tabs — hack de alinhamento — resolver no componente `SegmentedControl`.

---

## 7. Ícones

| Ação/conceito | Ícone(s) | Tamanhos encontrados |
|---|---|---|
| Ir para relatório | `FileText` | `h-3 w-3` (`Dashboard:621,674,743,940`, `Sessoes:450,458`), `h-4 w-4` (`Relatorio:569,577`) |
| Abrir Zoom | `ExternalLink` | `h-3` (`Dashboard:667`, `Relatorio:346`) |
| Voltar | `ArrowLeft` | `h-3` (`Relatorio:283`), `h-4` (`Relatorio:311`, `Modelo:120`, `Wizard:497,674`), `h-3.5` (`Wizard:726`) |
| Fechar/remover | `X` `h-3.5` (`Disponibilidade:543`), `X` `h-3` (`Relatorio:496`), `X` `h-4` (`Wizard:236`), **`Trash2`** `h-3.5` (`Disponibilidade:757`, `Ferramentas:324`) | mesma ação "remover slot" com `X` em `:543` e `Trash2` em `:757` na mesma página |
| Alerta | `AlertTriangle` (`Dashboard:236,596`), **`AlertCircle`** (`Sessoes:297,491,501`, `Relatorio:*`) | `h-4`, `h-3.5`, `h-3`, `h-5`, `h-10` |
| Concluído | `CheckCircle2` `h-3.5` (`Sessoes:288`), `h-3` (`Alunos:273`, `Ferramentas:312`, `Sessoes:434`), `h-7` (`Wizard:650`); `Check` `h-3` (`Relatorio:474,550`), `h-4` (`Wizard:369`, `Modelo:177`) | |
| Relógio | `Clock` `h-2.5 w-2.5` (`Sessoes:413`), `h-3` (`Disponibilidade:697`, `Ferramentas:316`), `h-4` (`Disponibilidade:523`) | 3 tamanhos |
| Recorrente | `Repeat` `h-2.5 w-2.5` (`Disponibilidade:534,743`) | 10px — menor do que qualquer texto |
| Calendário | `Calendar`, `CalendarDays`, `CalendarRange` | `h-3`, `h-3.5`, `h-4`, `h-8` |
| Chevron nav mês | `ChevronLeft/Right` `h-4` em `p-1.5` | consistente entre 3 telas ✅ |
| Expandir | `ChevronDown` `h-4` (`Sessoes:467`), `h-3` (`Dashboard:948`), **texto "▾"** (`ActionBanner:162`) | |
| Ferramenta | `Radar` `h-7` (`Ferramentas:196`), `h-4` (`Modelo:126`, `Wizard:214`); `Wrench` (`Ferramentas:265` empty) | |
| Ícone de campo (essentials) | vários `h-3` | |

**Achados**
- [alto] `MentorDisponibilidade.tsx:543` (`X`) vs `:757` (`Trash2`) — mesma ação "remover horário" com ícones diferentes na mesma página — usar `Trash2` nos dois.
- [médio] Tamanhos de ícone em **7 valores** (`h-2.5, h-3, h-3.5, h-4, h-5, h-7, h-8`) — em relação ao shadcn `[&_svg]:size-4` — fixar 3: 14px (inline em texto xs), 16px (botões/linhas), 20px+ só em ilustrações/empty.
- [médio] `AlertTriangle` (`Dashboard`) vs `AlertCircle` (`Sessoes`, `Relatorio`) para "relatório pendente" — escolher um.
- [médio] `MentorActionBanner.tsx:162` — caractere "▾" como ícone — em relação a `ChevronDown` lucide usado em `Sessoes:467` — trocar.
- [baixo] `Clock h-2.5 w-2.5` (`Sessoes:413`) e `Repeat h-2.5` (`Disponibilidade:534`) — ícones de 10px ilegíveis — mínimo 12px.

---

## 8. Modais / sheets / drawers

| Interação | Tela | Implementação | Observação |
|---|---|---|---|
| Adicionar disponibilidade por período | `Disponibilidade:769` | `<Dialog max-w-md>` shadcn, footer com `<button>` nativos (`:865,871`) | sem `DialogDescription`; footer não usa `<Button>` |
| Adicionar horário (dia) | `Disponibilidade:553` | **inline expand** (AnimatePresence height) | mesma família de ação que o Dialog acima, padrão diferente |
| Confirmar remoção recorrente | `Disponibilidade:195` | **`window.confirm`** | |
| Recusar / não realizada / cancelar sessão | `Sessoes:200,230,247-248` | **`window.prompt` (+ `window.confirm`)** | pede texto livre num prompt nativo |
| Excluir aplicação de ferramenta | `Ferramentas:345` | `<AlertDialog>` shadcn ✅ | canônico |
| Aplicar ferramenta | `Ferramentas:370` | `<Dialog max-w-md>` + `<Select>` shadcn; footer `<button class="btn-primary">` (indefinida) | botão do footer sem estilo |
| Vincular ao membro | `Modelo:183` | `<Dialog sm:max-w-lg>` com busca + lista `glass-card` | resultados com hover-lift dentro do modal |
| Trocar sessão entregue | `Relatorio:327` | `<Select h-7>` inline no header + `<Tooltip>` | ação destrutiva de dado (muda `session_id`) sem confirmação |
| Gerar material | `Relatorio:584` | `SessionDeliverableDialog` (fora do escopo lido) | |
| Ferramenta (wizard) | `Modelo:110`, `Wizard:203` | **`fixed inset-0 z-50`** full-screen próprio, com topbar `sticky` e safe-area | sai do `AppLayout`; 2 topbars quase iguais (`Modelo:111-129` vs `Wizard:205-248`) |
| Pendências | `ActionBanner:143` | accordion inline (`aria-expanded`) | |
| Expandir tarefas da sessão | `Dashboard:749`, `Sessoes:473` | expand inline no card | |
| Observações privadas | `Relatorio:516` | botão-card que vira textarea | |
| Nenhum uso de `Sheet`/`Drawer`/bottom sheet em mobile | — | — | ações em cards ficam em linha horizontal comprimida |

**Achados**
- [alto] `MentorSessoes.tsx:200,230,247,248` e `MentorDisponibilidade.tsx:195` — `window.prompt/confirm` — em relação a `AlertDialog` (`Ferramentas:345`) — substituir por `ConfirmDialog` com campo de motivo.
- [médio] `MentorDisponibilidade.tsx:553` inline vs `:769` Dialog para "adicionar horário" — dois padrões para a mesma tarefa — usar um `BottomSheet`/`Dialog` único com modo "dia" e "período".
- [médio] `FerramentaModelo.tsx:111-129` vs `ToolWizard.tsx:205-248` — topbar full-screen duplicado (mesmo `h-9 w-9 rounded-xl`, safe-area, blur) — extrair `FullscreenShell`.
- [baixo] `MentorRelatorio.tsx:327` — troca de `session_id` via `Select` sem confirmação — envolver em `AlertDialog`.

---

## 9. Estados loading / empty / erro

| Tela | Loading | Empty | Erro |
|---|---|---|---|
| Dashboard | **nenhum** (queries sem `isLoading`; seções simplesmente não renderizam) | seções ocultas por `length > 0` (`:632,690`); `MemberHistoryPanel:873` texto itálico `text-xs` | nenhum |
| Sessoes | `glass-card p-8` + texto "Carregando sessões..." (`:329`) | `<EmptyState icon=Calendar>` (`:334`) ✅ | `toast.error` nas mutações; query `throw` sem UI |
| Alunos | **nenhum** | `<EmptyState icon=Users>` (`:231`) ✅ | nenhum |
| Disponibilidade | `Loader2 h-5 animate-spin` (`:500`) | 3 receitas: `p text-xs py-4 text-center` (`:504`), `glass-card p-10` + `Calendar h-8` (`:673`), `p text-xs py-6` (`:719`) | toasts |
| Relatorio | **nenhum** para `booking`/`report`; `Loader2 h-3.5` em botão (`:395`), `h-4` (`:577`) | `AlertCircle h-10` + `text-sm` (`:267`); textos itálicos (`:415,458`) | callout `rounded-2xl` (`:285`) para cancelada/pendente; toasts |
| Ferramentas | `Loader2 h-6` centralizado `py-16` (`:260`) | `<EmptyState icon=Wrench>` (`:264`) ✅ | toasts |
| Modelo | `Loader2 h-5 py-8` (`:216`) dentro do Dialog | `p text-sm py-6 text-center` "Digite para localizar." / "Nenhum resultado." (`:220,255`) | toast |
| Aplicacao | `Loader2 h-6 py-24` (`:96`) | `p text-sm` "Aplicação não encontrada." (`:106`) — sem card, sem ação | toast |
| ToolWizard | `Loader2 h-4` no topbar (`:222`); tela "processing" animada (`:597`) | — | — |
| ActionBanner | nenhum | oculta-se (`items.length > 0`) | toast |

**Achados**
- [alto] `MentorDashboard.tsx`, `MentorAlunos.tsx`, `MentorRelatorio.tsx` — sem estado de loading em nenhuma query principal — tela aparece vazia/pisca até os dados chegarem — adicionar `Skeleton` no `SectionCard`.
- [médio] Loading tem 4 receitas: texto em card (`Sessoes:329`), `Loader2` em 4 tamanhos (`h-4/h-5/h-6`) com `py-8/py-16/py-24` — padronizar `LoadingState` (skeleton) e `Loader2 size-4` só em botões.
- [médio] `MentorDisponibilidade.tsx:504,673,719` e `FerramentaAplicacao.tsx:106`, `FerramentaModelo.tsx:220,255`, `MentorRelatorio.tsx:267` — 7 empties ad hoc — em relação ao `<EmptyState>` existente — substituir (usar `compact` onde couber).
- [baixo] `FerramentaAplicacao.tsx:106` — "Aplicação não encontrada." sem botão de voltar — adicionar `action`.

---

## 10. Mobile

**Alvos < 44px (altura estimada)**
- [alto] `MentorDashboard.tsx:526,532`, `MentorSessoes.tsx:275,281`, `MentorDisponibilidade.tsx:430,436` — chevrons de mês `p-1.5` + ícone 16px = **28px**.
- [alto] `MentorSessoes.tsx:461-468` — botão expandir `p-1` + 16px = **24px**.
- [alto] `MentorActionBanner.tsx:209-245` — "Confirmar/Recusar/Ver/Ok" `px-2 py-1 text-xs` = **~24px**, lado a lado com separador "·".
- [alto] `MentorDashboard.tsx:617,739`, `MentorRelatorio.tsx:356,450` — links-botão `text-xs` sem padding = **~16px**.
- [médio] `MentorDisponibilidade.tsx:539,752`, `MentorFerramentas.tsx:319` (`h-7 w-7` = 28px), `MentorRelatorio.tsx:469` (checkbox `h-4 w-4` = **16px**), `:492` (`X h-3` = 12px).
- [médio] Tabs/segmentos `px-3 py-1 text-xs` ≈ 24px (`Dashboard:511`, `Alunos:198`), `px-4 py-1.5` ≈ 28px (`Sessoes:311`, `Alunos:215`).
- [médio] Toggle custom `w-9 h-5` (`Disponibilidade:611`) = 20px — e é `div` com onClick.
- [médio] `btn-silver text-xs px-3 py-1.5` (`Sessoes:432,448`) ≈ 28px para ações críticas (Confirmar sessão).
- [baixo] Células do calendário `aspect-square` dentro de 360px/7 ≈ 46px ✅.

**Overflow / layout**
- [médio] `MentorSessoes.tsx:379-469` — linha do card com date-badge 48px + texto + até 3 botões (`Confirmar`, `Recusar`, chevron) em `flex` sem `flex-wrap` → em 360px os botões espremem o nome (truncado) e podem vazar.
- [médio] `MentorDashboard.tsx:648-677` — mesma estrutura (Zoom + Relatório lado a lado) sem wrap.
- [médio] `MentorSessoes.tsx:306-309` — tabs com `WebkitMaskImage` para indicar scroll; `MentorSessoes:286` stats com `overflow-x-auto` — solução ad hoc repetida.
- [médio] `MentorRelatorio.tsx:328` — `SelectTrigger w-[260px]` fixo no header — em 320–360px estoura junto ao label e ao botão Zoom.
- [médio] `MentorDisponibilidade.tsx:421` — `Link` com e-mail do Google inteiro em `text-xs` sem truncate → pode estourar a linha.
- [baixo] `MentorFerramentas.tsx:203` — bloco de 3 métricas `gap-6` + `sm:border-l` empilha OK, mas os números `text-2xl` ficam sem alinhamento em coluna no mobile.

**Ações só em hover**
- [alto] `MentorRelatorio.tsx:492-497` — botão remover sugestão `opacity-0 group-hover:opacity-100` — **invisível no touch**.
- [médio] `MentorAlunos.tsx:271` — métricas `hidden sm:flex` (não é hover, mas a informação some totalmente em mobile sem alternativa).
- [baixo] `MentorDashboard.tsx:556` `group-hover:scale-110`, `Ferramentas:216` `group-hover:translate-x-1` — decorativos, OK.

---

## 11. Acessibilidade

**Ícone sem `aria-label`/texto**
- [alto] `MentorDashboard.tsx:526,532` · `MentorSessoes.tsx:275,281` · `MentorDisponibilidade.tsx:430,436` — chevrons de mês (6 botões) sem `aria-label`.
- [alto] `MentorDisponibilidade.tsx:539-544` — botão `X` remover slot sem `aria-label` (o `:752` tem só `title`).
- [alto] `MentorRelatorio.tsx:310` — voltar (`ArrowLeft`) sem label; `:492` remover sugestão sem label; `:469` checkbox custom com `title` mas sem `role="checkbox"`/`aria-checked`.
- [médio] `MentorDisponibilidade.tsx:611-616` — toggle é `<div onClick>` sem `role="switch"`, sem `aria-checked`, sem teclado.
- [médio] `MentorSessoes.tsx:363-367,378-381` e `MentorDashboard.tsx:703-706` — `div onClick` como área clicável de card, sem `role="button"`/`tabIndex`.
- [médio] `MentorDashboard.tsx:543` — `motion.button` com `title` (tooltip nativo) em vez de texto acessível/`aria-label`.
- ✅ Bons exemplos: `Sessoes:463` `aria-label` no chevron; `Ferramentas:321` `aria-label="Excluir aplicação"`; `Wizard:226,234` `aria-label`; `ActionBanner:149,155` `aria-label` + `aria-expanded`.

**Contraste / tamanho**
- [alto] `text-[10px]`/`text-[9px]` + `text-muted-foreground` (L 64% sobre card L 8%; em light `muted-foreground` L 38% sobre branco) em ~70 pontos — em 10px, mesmo com contraste AA de cor, falha o critério de legibilidade prática; `text-muted-foreground/50` (`Alunos:260`), `/90` (`:258`), `text-muted-foreground/20` (`Disponibilidade:460`, dias fora do mês) e `text-primary/90` (`Disponibilidade:742`) reduzem ainda mais.
- [médio] `MentorDashboard.tsx:500` `text-foreground/80` para subtítulo — 4ª cor de texto secundário (além de `muted-foreground`, `/90`, `/50`).
- [médio] `MentorDisponibilidade.tsx:459-464` — dia selecionado `ring-2 ring-primary/40` → override `index.css:273` troca por `--stroke-focus` e `ring-offset 0` — o foco visual é fraco.

**Foco**
- [alto] ~95 `<button>` nativos sem `focus-visible:ring` — em relação ao `<Button>` shadcn que já traz `focus-visible:ring-2 ring-offset-2` — a migração resolve.
- [médio] Inputs/selects nativos (`Disponibilidade:594,629,787,831`, `Relatorio:388,617`, `Ferramentas:235`, `Modelo:212`, `Wizard:435,459,579`) usam `focus:outline-none` + `focus:border-primary/…` — e a borda de foco é anulada/uniformizada pelo override global (`index.css:269`) → indicador de foco reduzido a um cinza `--stroke-focus`. Usar `<Input>`/`<Textarea>`/`<Select>` shadcn.
- [baixo] `MentorSessoes.tsx:462` `aria-label` dinâmico ✅, mas o card-pai `div onClick` captura o clique e o botão precisa de `stopPropagation` — modelo frágil para teclado.

---

## 12. Componentes canônicos propostos e mapa de substituição

### 12.1 Especificação resumida

| Componente | API mínima | Regras |
|---|---|---|
| **`PageHeader`** | `eyebrow?`, `title`, `description?`, `meta?` (data/período), `actions?` (slot), `back?` (href/onClick) | `h1 text-2xl font-semibold`, `description text-sm text-muted-foreground mt-1`, `actions` alinha à direita em `sm+`, empilha no mobile com `gap-3`. Único lugar com eyebrow. |
| **`SectionCard`** | `title?`, `icon?`, `meta?`, `tone?: default\|warning\|danger\|primary`, `padding?: sm\|md` | `rounded-xl border bg-card p-4 \| p-6`. **Sem hover/lift.** Substitui `glass-card` estático e `rounded-2xl bg-card/70`. |
| **`ListRow`** | `leading` (avatar/date-badge), `title`, `subtitle?`, `badges?`, `trailing?` (ações), `onClick?`, `expandable?` | `min-h-[56px] px-4 py-3 gap-3`, `rounded-lg`, hover `bg-muted/20` só se `onClick`; ações agrupam em `Menu` (⋯) quando > 1 no mobile. Substitui cards de sessão/aluno/slot/pendência. |
| **`StatusPill`** | `label`, `tone: neutral\|green\|yellow\|red\|blue\|primary`, `icon?`, `dot?`, `size: sm\|md` | `rounded-full text-2xs(11px) px-2 py-0.5` / `text-xs px-2.5 py-1`, borda opcional única. `StatusBadge` vira wrapper de `StatusPill` que mapeia `bookingStatusConfig`/`toolStatusConfig`. |
| **`EmptyState`** (existente) | + `variant: default\|compact\|inline` | Manter; adicionar `inline` (sem borda) para dentro de cards. |
| **`BottomSheet`** | `open`, `title`, `description?`, `children`, `footer` | Em `< sm` renderiza `Drawer` (vaul) de baixo; em `sm+` renderiza `Dialog`. Footer sempre com `<Button>`. |
| **`ConfirmDialog`** | `title`, `description`, `confirmLabel`, `destructive?`, `reasonField?` | Substitui `window.confirm/prompt`. |
| **`SegmentedControl`** | `options[{key,label,count?}]`, `value`, `onChange` | `h-9`, item `px-3 rounded-md text-sm`, scroll horizontal com fade embutido. |
| **`Eyebrow`** | `children`, `tone?` | `text-2xs uppercase tracking-[0.12em] font-semibold text-muted-foreground`. |
| **`IconButton`** | `icon`, `label` (obrigatório → `aria-label`), `size: sm(36)\|md(44)`, `variant: ghost\|outline\|destructive` | Wrapper de `<Button size="icon">` com alvo ≥ 44px em touch. |
| **`FullscreenShell`** | `title`, `subtitle?`, `icon?`, `accent?`, `onExit`, `progress?`, `maxWidth` | Extrai topbar de `FerramentaModelo` + `ToolWizard`. |
| **`Button`** (shadcn, existente) | — | Único primitivo de botão. Apagar `.btn-silver`, referências a `.btn-primary`/`.btn-gold`. Ajustar `rounded-md` → `rounded-lg` para casar com `--radius`. |

### 12.2 Mapa "onde substituir"

**PageHeader**
- `MentorDashboard.tsx:493-538` → `PageHeader eyebrow="Mentoria" title description meta actions={<SegmentedControl/> + nav mês}`
- `MentorSessoes.tsx:267-270` (+ mover `:273-302` para `actions/meta`) → `PageHeader`
- `MentorAlunos.tsx:179-212` → `PageHeader actions={search + SegmentedControl}`
- `MentorDisponibilidade.tsx:395-424` → `PageHeader actions={2 × Button variant="outline"}`
- `MentorRelatorio.tsx:309-349` → `PageHeader back title description actions={Zoom}`; mover `Select` de troca (`:320-342`) para dentro de `SectionCard "Sobre o aluno"` ou `meta`
- `MentorRelatorio.tsx:281-284` → `PageHeader back` (tela bloqueada)
- `MentorFerramentas.tsx:166-180` → `PageHeader actions={Button}`

**SectionCard**
- `MentorDashboard.tsx:565` (financeiro), `:594` (`tone="warning"`), `:904-926` (resumo), `:875,890` (histórico)
- `MentorDisponibilidade.tsx:428` (calendário), `:491` (slots do dia), `:683` (resumo), `:710` (lista)
- `MentorRelatorio.tsx:285` (`tone="danger|warning"`), `:353`, `:377` (`tone="primary"`), `:410`, `:445`, `:528` (`tone="warning"`), `:544`
- `MentorFerramentas.tsx:270` (contêiner da lista → `SectionCard padding="none"` + `ListRow`)
- `ToolWizard.tsx:272,326,422,541,567,642,658`
- `MentorActionBanner.tsx:148` → `SectionCard` colapsável (`rounded-xl`, não `lg`)

**ListRow**
- `MentorDashboard.tsx:601-623` (pendentes), `:648-677` (próximas), `:702-747` (realizadas, `expandable`), `:960-978` (sessões antigas)
- `MentorSessoes.tsx:362-511` → `ListRow expandable` (remover `dark`, cover opcional como `leading`)
- `MentorAlunos.tsx:243-287`
- `MentorDisponibilidade.tsx:512-547` (slots), `:723-761` (lista completa)
- `MentorFerramentas.tsx:272-336` (grupo por aluno → `ListRow` + sub-`ListRow`)
- `FerramentaModelo.tsx:226-252` (membros no picker)
- `MentorActionBanner.tsx:195-248`
- `ToolWizard.tsx:551-560` (revisão de respostas)

**StatusPill / StatusBadge**
- `MentorDashboard.tsx:729` (`tone="neutral"`), `:734` → `<StatusBadge status="awaiting_report"/>`
- `MentorSessoes.tsx:418` (`neutral`)
- `MentorDisponibilidade.tsx:528,530,533,742,747,749` → `StatusPill tone="blue|green|primary"` (uma receita)
- `MentorFerramentas.tsx:283` (`neutral`), `:311` (`green`), `:315` (`neutral`, label único "Em preenchimento"), `:241-255` filtros → `SegmentedControl`
- `FerramentaModelo.tsx:139`, `ToolWizard.tsx:277,404` → `StatusPill tone="primary"` ou `Eyebrow`

**EmptyState**
- `MentorDisponibilidade.tsx:503-506` (`variant="inline"`), `:673-676`, `:718-719` (`compact`)
- `MentorRelatorio.tsx:266-270`, `:415`, `:458` (`inline`)
- `FerramentaModelo.tsx:219-222,254-256` (`compact`)
- `FerramentaAplicacao.tsx:105-107` (com `action` voltar)
- `MentorDashboard.tsx:873-880` (`inline`)
- `MentorSessoes.tsx:329-331` → `Skeleton`/`LoadingState`

**BottomSheet / ConfirmDialog**
- `MentorSessoes.tsx:200-203` (não realizada), `:230` (recusar), `:247-249` (desmarcar) → `ConfirmDialog reasonField destructive`
- `MentorDisponibilidade.tsx:195` → `ConfirmDialog destructive`
- `MentorDisponibilidade.tsx:553-660` (inline) + `:769-880` (Dialog) → um `BottomSheet "Adicionar horário"` com abas Dia/Período
- `MentorFerramentas.tsx:370-421` → `BottomSheet` (footer com `<Button>`)
- `FerramentaModelo.tsx:183-260` → `BottomSheet`
- `MentorRelatorio.tsx:327-336` → `ConfirmDialog` antes de `swapSession`

**Button / IconButton**
- Todos os `btn-silver`: `Sessoes:432,448` · `Disponibilidade:645,874` · `Relatorio:345,392,575` · `Wizard:496,673` → `<Button>` / `<Button variant="secondary">`
- Todos os `btn-primary`/`btn-gold` (indefinidos): `Ferramentas:176,414` · `Wizard:292,387,499,589,668` → `<Button size="lg">`
- Chevrons de mês `Dashboard:526,532` · `Sessoes:275,281` · `Disponibilidade:430,436` → `IconButton label="Mês anterior/próximo"`
- Remover/fechar: `Disponibilidade:539,752` · `Ferramentas:319` · `Relatorio:492` · `Wizard:223,231` → `IconButton variant="ghost|destructive"`
- Links-botão `text-xs text-primary hover:underline`: `Dashboard:604,617,713,739` · `Sessoes:400` · `Relatorio:356,450` → `<Button variant="link" size="sm">`
- Outline: `Dashboard:666,946` · `Sessoes:456,496` · `Disponibilidade:401,412,650,865` · `Relatorio:566` · `Modelo:116,173` → `variant="outline"`
- Destrutivo: `Sessoes:436,487` · `ActionBanner:217` → `variant="destructive"` / `variant="ghost" className="text-destructive"`
- `ActionBanner:209,226,233,240` → `<Button variant="ghost" size="sm">` (≥ 36px)

**SegmentedControl**
- `MentorDashboard.tsx:510-523` · `MentorSessoes.tsx:305-324` · `MentorAlunos.tsx:197-210,214-227` · `MentorFerramentas.tsx:238-256` · `FerramentaModelo.tsx:189-203` · `MentorDisponibilidade.tsx:563-585,802-824` (2h/3h) e `:840-861` (dias)

**FullscreenShell**
- `FerramentaModelo.tsx:110-129` e `ToolWizard.tsx:203-248` → um shell; `Modelo:132-179` e `Wizard:270-319` → um `ToolHero`

**Eyebrow**
- Todas as ocorrências da tabela 5.2 (`Dashboard:496,554,566,573,579,637,896,905,911,917,923,967` · `Relatorio:321,355,366,378,411,419,430,447,545` · `Ferramentas:199,206,210,214,283` · `Disponibilidade:684,732` · `ActionBanner:157` · `Modelo:139` · `Wizard:277`)

---

## Resumo executivo (prioridade de execução)

1. **[alto] Corrigir classes fantasmas** `btn-primary`/`btn-gold` (7 pontos) — CTAs principais de Ferramentas/Wizard estão sem estilo hoje.
2. **[alto] Remover `dark` fixo** em `MentorSessoes.tsx:362`.
3. **[alto] Decidir sobre o override global de borda** (`index.css:261-281`) — ou removê-lo ou parar de escrever bordas coloridas; hoje ~20 intenções de cor/foco são silenciosamente anuladas.
4. **[alto] Migrar ~95 `<button>` nativos + 10 `.btn-silver` → `<Button>`** (resolve foco, alturas, radius e alvos de toque de uma vez).
5. **[alto] Substituir `window.prompt/confirm`** (5 pontos) por `ConfirmDialog`.
6. **[alto] `StatusPill` único** e eliminar duplicatas de "Agendado/Disponível/Recorrente/Sem relatório/x/y tarefas".
7. **[médio] `PageHeader`, `SectionCard` (sem lift), `ListRow`** e fixar escala tipográfica (11/12/14/16/20/24/32) eliminando `text-[9px]/[10px]`.
8. **[médio] Loading states** em Dashboard/Alunos/Relatorio; `EmptyState` nos 7 empties ad hoc.
9. **[médio] Mobile:** wrap/menus nas linhas com 2–3 ações; remover `opacity-0 group-hover` de `Relatorio:494`; `aria-label` nos 10+ ícones-botão.