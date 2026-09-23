# Auditoria — módulo Ferramentas / Mapeamento do Negócio

Escopo lido integralmente: `Ferramentas.tsx`, `FerramentaModelo.tsx`, `FerramentaAplicacao.tsx`, `MentorFerramentas.tsx`, `StudentTools.tsx`, `ToolWizard.tsx`, `DiagnosticRadar.tsx`, `DiagnosticSheet.tsx`, `GiftReveal.tsx`, `NextStepsTrail.tsx`, `StateMap.tsx`, `TrailPath.tsx`, `diagnosticoBegin.ts`, `MemberDiagnosticCard.tsx`, `App.tsx` (rotas), `index.css`/`tailwind.config.ts` (tokens) e as migrations `20260727151530` (tool_templates/tool_applications + RLS), `20260727155047`, `20260727155724`, `20260916231255`, `20260916231353`, `20260819163100`, `20260625194840` (student_tools + RLS), `20260626224352`, `20260710123928`, `20260721202318`.

Observação prévia: **não existe** nenhuma migration chamada "Preservar visualização histórica do Mapeamento" em `supabase/migrations` (rg por "preservar|histor" não retorna nada; o git tem um único commit de import). A preservação histórica é feita **apenas no cliente**, em `diagnosticoBegin.ts:667-676` (`diagnosticPillarsForAnswers` + `LEGACY_GESTAO_VISAO_QUESTION`). Os achados sobre versão de template abaixo partem dessa realidade.

---

## Diagnóstico/Pontuação

- [SEVERIDADE: alto] `src/lib/diagnosticoBegin.ts:36-664` + `src/index.css:57-63,142-148` + `src/components/tools/ToolWizard.tsx:31` + `src/components/tools/TrailPath.tsx:10` — São **8 pilares** (`gestao, lideranca, financeiro, marketing, inovacao, vendas, processos, pessoas`) mas o CSS define só `--pillar-1..7`; `pillarAccent(i)`/`accentOf(i)` fazem `(i % 7) + 1`, então o pilar índice 7 (**Pessoas**) recebe exatamente a cor do índice 0 (**Gestão**). — Impacto: na trilha (`TrailPath`), cards da trilha (`ToolWizard:353`), tela de pergunta (`ToolWizard:146`), pontos da etapa concluída (`ToolWizard:534`), StateMap (`StateMap:193,219`) e nó final da trilha (`TrailPath:82`, que usa `accentOf(7)` = pillar-1) dois setores distintos são indistinguíveis por cor. — Correção: adicionar `--pillar-8` (light/dark) e trocar `% 7` por `% 8` ou, melhor, derivar de `DIAGNOSTICO_BEGIN_PILLARS.length`; centralizar `pillarAccent` em `diagnosticoBegin.ts` (hoje duplicado em `ToolWizard:31` e `TrailPath:10`).

- [SEVERIDADE: médio] `src/lib/diagnosticoBegin.ts:690-712` — `pillarScore` devolve **0** para pilar sem resposta de escala (escala real é 1–5) e `overallScore` filtra `v > 0` para a média. — Impacto: 0 vira sentinela ambígua: no radar (`DiagnosticRadar:41-45,98`) o eixo colapsa ao centro como se fosse "pior nota", nas barras (`DiagnosticRadar:214`) aparece `0.0`, na folha (`DiagnosticSheet:70`) "Nota 0.0/5"; a média geral ignora pilares vazios silenciosamente, então um diagnóstico com 1 pilar respondido tem "Maturidade 4.0" e status `completed`. — Correção: usar `null`/`undefined` para "sem dado", exibir "—" e marcar no radar; exigir `allComplete` (ou nº mínimo de pilares) para `startProcessing` (`ToolWizard:385-389` só bloqueia `answered === 0`).

- [SEVERIDADE: médio] `src/lib/diagnosticoBegin.ts:714-723` — Faixas de `MATURITY_LEVELS` com buracos: `max: 1.9`, `2.9`, `3.9`, `4.6`. Score 1.91 → "Em estruturação", 1.90 → "Inicial", ambos exibidos como `1.9` (`toFixed(1)`). Também `maturityLabel(0)` → "Inicial" para diagnóstico vazio. — Impacto: dois alunos com o mesmo número na tela e rótulos diferentes. — Correção: usar limites `< 2`, `< 3`, `< 4`, `< 4.6` (ou comparar o valor já arredondado com 1 casa) e tratar 0/vazio como "Sem dados".

- [SEVERIDADE: médio] `src/lib/diagnosticoBegin.ts:700-712` — Arredondamento duplo: `computeScores` arredonda cada pilar a 2 casas e `overallScore` faz a média dos valores já arredondados e arredonda de novo. — Impacto: desvio pequeno, mas o `total` do `ToolWizard:139` (calculado de `answers`) pode divergir do `overallScore(a.scores)` de `MentorFerramentas:291` (lido do JSON) para o mesmo diagnóstico. — Correção: `overallScore` receber `answers` e calcular a partir das notas brutas; arredondar só na exibição.

- [SEVERIDADE: médio] `src/components/tools/ToolWizard.tsx:138` vs `src/components/MemberDiagnosticCard.tsx:60-68` vs `src/pages/Ferramentas.tsx:128-131` — Três fontes de verdade para o score: o wizard **recalcula** de `answers`; o card do membro usa `stored[p.id] ?? pillarScore(...)`; a página do aluno usa **só** `scores` gravado, sem fallback. Como o conjunto de perguntas é versionado só no código (IDs como `gestao_faturamento` estão hoje no pilar Financeiro; `mkt_midia` tem título "aquisição de clientes"), uma aplicação antiga reabre no wizard com nota diferente da que o aluno vê. — Impacto: mentor e aluno olham números diferentes para o mesmo diagnóstico. — Correção: guardar `template_version`/snapshot das perguntas na aplicação (coluna `schema` em `tool_templates` já existe e está vazia `'{}'` — `20260727151530:8`) e renderizar sempre a partir do snapshot; ou sempre recalcular no cliente a partir de `answers` e nunca ler `scores`.

- [SEVERIDADE: médio] `src/lib/diagnosticoBegin.ts:667-676` + `src/components/tools/DiagnosticSheet.tsx:17-18` + `src/components/tools/StateMap.tsx:33-35` — A "preservação histórica" só reinsere `gestao_visao`. Respostas de escala antigas são chaves `A..E` que são traduzidas pelo **label atual** da opção; se um título/opção mudou (evidência: id `mkt_midia` ≠ título atual sobre aquisição; `gestao_faturamento` no pilar financeiro), a folha mostra ao aluno uma frase que ele nunca escolheu. — Impacto: distorção silenciosa em diagnósticos antigos. — Correção: snapshot das perguntas/opções por aplicação (ver item anterior) ou gravar o `label` junto com a chave em `answers`.

- [SEVERIDADE: médio] `src/pages/Ferramentas.tsx:93-96,128-131` vs `src/components/MemberDiagnosticCard.tsx:49-56,105-109` — Regras de "qual aplicação é a base" divergem: aluno usa `base = final || inicial` (folha mostra respostas do **final**) mas o radar principal usa `inicial?.scores` com `label="Diagnóstico inicial"`; o card mentor/admin usa `base = inicial || final`. Quando só existe `final`, ambos exibem o radar rotulado "Diagnóstico inicial" com dados do final. — Impacto: folha e radar da mesma tela falam de aplicações diferentes; rótulo errado. — Correção: extrair um hook `useMemberDiagnostics(memberId)` que resolve `inicial`/`final`/`base` de um único jeito e rotula conforme a fase real.

- [SEVERIDADE: médio] `src/components/MemberDiagnosticCard.tsx:27-32,49-55` — Consulta **sem filtro de status** e `find` pega a primeira `phase !== "final"` por `created_at asc`. Uma aplicação "inicial" abandonada `in_progress` (criada antes) vence uma `completed`. Não há indicador de "em andamento". — Impacto: mentor/admin vê radar parcial achando que é o diagnóstico oficial; aluno (`Ferramentas.tsx:82`) vê outro. — Correção: priorizar `completed` (ordenar por `status`, `completed_at desc`) e exibir badge "Em preenchimento" quando aplicável; considerar `@@unique(member_id, template_id, phase)` ou pelo menos regra de negócio no insert.

- [SEVERIDADE: médio] `src/components/tools/DiagnosticRadar.tsx:34-39,41` — Mapeamento radar→pilar por `p.short` (texto), não por `id`. Funciona hoje porque os 8 `short` são únicos, mas `diagnosticPillarsForAnswers` já renomeia `name` (não `short`) de forma condicional. — Impacto: frágil; qualquer `short` duplicado quebra o clique no eixo. — Correção: colocar `id` no `data` e usar `payload.payload.id`.

- [SEVERIDADE: baixo] `src/components/tools/DiagnosticRadar.tsx:128-130` — Ponto de valor ≤ 0.1 é deslocado 38px do centro para ser clicável; fica fora da posição real do dado. — Impacto: leitura enganosa. — Correção: manter o ponto no lugar e usar o eixo/barra como alvo clicável.

- [SEVERIDADE: baixo] `src/components/tools/ToolWizard.tsx:178-183` — `answerAndAdvance` chama `setTimeout(goNext, 480)`; um segundo clique (ou "Próxima") nesse intervalo avança duas vezes e pula pergunta. — Correção: flag `advancing` que bloqueia interações até o timeout.

- [SEVERIDADE: baixo] `src/components/tools/ToolWizard.tsx:134-136` + `src/pages/FerramentaAplicacao.tsx:120` — Quando `onFinish` grava `completed` e o refetch chega durante `processing`, `startAtResult` vira `true` e o `useEffect` força `view="result"` antes da animação terminar; o `setTimeout` de `ToolWizard:196` dispara depois e reseta de novo. — Correção: só aplicar `startAtResult` na montagem (remover o effect) ou ignorar enquanto `view === "processing"`.

- [SEVERIDADE: baixo] `src/components/tools/GiftReveal.tsx` / `src/components/tools/NextStepsTrail.tsx:13,63-75` — Não há **nenhuma** contagem de sessões: `TOTAL_SESSIONS = 12` fixo e todos os 12 nós renderizam sempre com `Check` e `GREEN`, isto é, aparecem como **concluídos** já no kickoff; `GiftReveal` é exibido incondicionalmente como última view do wizard (`ToolWizard:705-709`) e o texto oscila entre "Agora você ganhou um presente" (`GiftReveal:31`) e "você vai ganhar ao final do programa" (`GiftReveal:73`). A premissa "recompensa após a 12ª sessão" não está implementada em lugar nenhum. — Impacto: mensagem enganosa ao aluno, sem gating. — Correção: receber `completedSessions` (via `bookings` com `getEffectiveBookingStatus === "completed"`, como `Ferramentas.tsx:43-54`) e pintar só as concluídas; condicionar `GiftReveal` a `completed >= 12` ou reescrever o copy como "prévia".

- [SEVERIDADE: baixo] Divisão por zero: não encontrada. `pillarScore:696`, `overallScore:710` estão guardados; `TOTAL_QUESTIONS` (`ToolWizard:29`) e `p.questions.length` (`ToolWizard:352`) são sempre > 0. Escala é consistentemente 1–5 (`SCALE_VALUE:678`, `domain={[0,5]}` em `DiagnosticRadar:98`, `/5` em todas as telas); nenhum uso de 0–10.

---

## Aplicações/Permissões

- [SEVERIDADE: crítico] `supabase/migrations/20260727151530_...sql:53-64` + `src/pages/MentorFerramentas.tsx:63-72,144-155,319-325` — Policy `"Mentors and admins manage applications" FOR ALL` para **qualquer** mentor, sem vínculo com `applied_by` nem com bookings do aluno; o front lista todas as aplicações (`select("*")` sem filtro) e expõe botão **Excluir** para mentor e admin. `applied_by` também não é verificado no `WITH CHECK` (pode ser forjado). — Impacto: qualquer mentor lê, edita e apaga permanentemente diagnósticos de alunos de outros mentores (delete sem soft-delete). — Correção: policy de UPDATE/DELETE restrita a `applied_by = profile do auth.uid()` ou admin; SELECT de mentor restrito a alunos com booking com ele; `WITH CHECK (applied_by = (select id from profiles where user_id = auth.uid()))`; no front filtrar por `applied_by` para mentor e esconder o lixo para não-donos; considerar `deleted_at`.

- [SEVERIDADE: alto] `src/pages/FerramentaAplicacao.tsx:85-91,131` + `src/components/tools/ToolWizard.tsx:231-237` — Autosave só após 8 s de inatividade e o `useEffect` limpa o timer no unmount; `onExit` navega sem *flush*. `onSaveStep` só é chamado em `goNext`/`stage`/`map→nextsteps`. — Impacto: mentor digita resposta de texto (ou meta no StateMap) e fecha com o X em menos de 8 s → resposta perdida sem aviso. Recarregar a página também perde `view/pi/qi` (estado só em memória) e qualquer resposta ainda não persistida. — Correção: `persist()` em `onExit` (await antes de navegar), `beforeunload` com aviso quando `dirty`, e guardar `view/pi/qi` em `sessionStorage` por `id`.

- [SEVERIDADE: alto] `src/pages/FerramentaAplicacao.tsx:58-83,130` + `src/components/tools/ToolWizard.tsx:185-200` — `persist` engole o erro (toast) e `startProcessing` segue para `view="result"` com "Diagnóstico pronto" mesmo quando o `update` falhou. — Impacto: mentor acredita que concluiu; aluno nunca vê (RLS exige `completed`). — Correção: `persist` retornar `boolean`/lançar; `startProcessing` voltar para `trail` com erro visível se falhar.

- [SEVERIDADE: médio] `src/pages/FerramentaAplicacao.tsx:58-83` — Reabrir aplicação `completed`, voltar para a trilha e alterar respostas persiste `answers/scores` mas mantém `status="completed"` e **não** atualiza `completed_at`. Também `setDirty(false)` após a resposta do servidor descarta como "limpas" alterações digitadas durante a requisição. — Impacto: aluno vê diagnóstico mudando sem trilha de auditoria; possível perda de tecla. — Correção: usar contador de versão de `answers` (comparar antes de limpar `dirty`); atualizar `completed_at`/`updated_by` ou bloquear edição após concluído sem ação explícita "Reabrir".

- [SEVERIDADE: médio] `supabase/migrations/20260727151530_...sql:29-44` — `tool_applications` **não tem `booking_id`**; não há vínculo com a sessão em que foi aplicada, e não há `UNIQUE (member_id, template_id, phase)`. `member_id NOT NULL` está correto (não há como criar sem aluno). — Impacto: duas "iniciais" para o mesmo aluno; impossível saber em que sessão foi feita; `find()` escolhe arbitrariamente (ver seção anterior). — Correção: adicionar `booking_id uuid REFERENCES bookings` (nullable) e índice único parcial em `(member_id, template_id, phase) WHERE status='completed'`.

- [SEVERIDADE: médio] `src/pages/MentorFerramentas.tsx:184-190,116-139` + `src/pages/FerramentaAplicacao.tsx:113-132` + `src/pages/FerramentaModelo.tsx:36-46` — Toda a UI está acoplada ao template `diagnostico-begin`: o card de **cada** template navega para `${base}/modelo` (que sempre abre o Diagnóstico), a mutation `create` aceita qualquer `templateId` do Select e a página de aplicação renderiza o `ToolWizard` do diagnóstico sem checar `application.template_id`. — Impacto: latente; o dia em que um segundo template for inserido, aplicações serão criadas com `template_id` errado e renderizadas com o wizard errado. — Correção: mapear `slug → componente` e validar `template.slug` em `FerramentaAplicacao`.

- [SEVERIDADE: médio] `src/pages/MentorFerramentas.tsx:175-179,184-190` — Admin não vê "Aplicar ferramenta" (`!isAdmin`) mas pode clicar no card do template → `FerramentaModelo` → atribuir e preencher como admin (`FerramentaModelo:69-93`). — Impacto: regra "admin só acompanha" (texto da linha 171) não é aplicada. — Correção: em `FerramentaModelo`, se `role==="admin"` esconder o picker e permitir só demonstração; ou assumir que admin aplica e mostrar o botão.

- [SEVERIDADE: baixo] `src/pages/FerramentaModelo.tsx:33,188-203` + `src/pages/MentorFerramentas.tsx:400-409` — Pode-se criar "Diagnóstico final" sem existir "inicial" concluído. — Correção: desabilitar `final` quando não houver `inicial completed` para o aluno.

- [SEVERIDADE: baixo] `src/pages/FerramentaAplicacao.tsx:20,51-56` — `loaded` é `useRef` global do componente; se `id` mudar sem unmount, `answers` do diagnóstico anterior permanecem. Hoje não há navegação direta entre aplicações, mas é armadilha. — Correção: `key={id}` na rota/página ou resetar `loaded` quando `id` muda.

- [SEVERIDADE: baixo] `src/components/StudentTools.tsx:93-100,236-252` — Delete ignora erro do `storage.remove` (linha 96) e upload seguido de falha no `insert` não remove o arquivo. — Impacto: órfãos no bucket. — Correção: checar erro do `remove`; em falha do insert, `remove([path])`.

- [SEVERIDADE: baixo] `src/components/StudentTools.tsx:76-88` — Mentor sem `bookingId` escolhe sessão em dropdown com **todos** os bookings do aluno, inclusive de outros mentores. — Impacto: ferramenta vinculada a sessão de outro mentor. — Correção: filtrar `mentor_id = profile.id` quando `!hasRole("admin")`.

- OK (sem achado): membro **não** consegue editar aplicação — não há policy de UPDATE para membro (`20260727151530:66-71` é só SELECT de `completed`) e a UI do aluno (`Ferramentas.tsx`) não monta o wizard. `has_role('admin')` inclui `super_admin` (`20260506204538:11-13`), então as policies de `student_tools` que só citam `mentor/admin` cobrem super_admin.

---

## Rotas

- [SEVERIDADE: alto] `src/App.tsx:138` e `src/App.tsx:143` — `/admin/ferramentas` está declarada duas vezes com elementos diferentes: linha 138 `MentorFerramentasPage role="admin"`, linha 143 `AdminFilterProvider > AdminConteudosPage`. No react-router v6 (`@remix-run/router` `rankRouteBranches`/`compareIndexes`, `router.cjs.js:898-931`): rotas irmãs com mesmo *score* são desempatadas pelo **índice de declaração** ("we should try to match the earlier sibling first"). Logo a linha **138 vence** e a **143 é código morto** (nunca renderiza). — Impacto: sem bug visível hoje, mas `AdminConteudosPage` já é servida em `/admin/conteudos` (linha 142); a duplicata confunde e qualquer reordenação futura troca a página do admin silenciosamente. — Correção: remover a linha 143.

- [SEVERIDADE: baixo] `src/App.tsx:125-126,139-140` — `/mentor/ferramentas/modelo` vs `/mentor/ferramentas/:id`: **não há colisão**. Segmento estático pontua 10 e dinâmico 3 (`computeScore`, `router.cjs.js:903-917`), então `modelo` sempre vence independentemente da ordem; `:id` é UUID e nunca será "modelo". — Correção: nenhuma obrigatória; opcionalmente renomear para `/mentor/ferramentas/nova` para semântica.

- [SEVERIDADE: baixo] `src/App.tsx:124-126,138-140` + `src/pages/FerramentaModelo.tsx:29` + `src/pages/FerramentaAplicacao.tsx:131` + `src/pages/MentorFerramentas.tsx:29` — O `base` (`/admin/...` vs `/mentor/...`) é recalculado em três páginas a partir da prop `role`. — Correção: helper `toolsBasePath(role)` único.

---

## UX/Consistência visual

- [SEVERIDADE: alto] `src/components/tools/ToolWizard.tsx:292,386,499,589` + `src/components/tools/StateMap.tsx:203` + `src/components/tools/NextStepsTrail.tsx:142` + `src/pages/MentorFerramentas.tsx:176,415` — Classe **`btn-primary` não existe** em `src/index.css` (só `.btn-silver:237`), `src/App.css` nem `tailwind.config.ts`; `rg` no repositório encontra `btn-primary` apenas nesses 8 usos, todos no módulo de ferramentas. — Impacto: os CTAs principais ("Iniciar", "Acessar diagnóstico", "Próxima", "Voltar para a trilha", "Próxima etapa", "Aplicar ferramenta", "Iniciar preenchimento") renderizam **sem fundo, sem borda e sem raio** — texto solto. Demais telas do app usam `btn-silver`. A única exceção estilizada é `ToolWizard:668`, que usa `btn-gold` (também inexistente) mas compensa com `bg-primary text-primary-foreground rounded-xl` inline. — Correção: definir `.btn-primary` em `@layer components` ou trocar por `btn-silver`/`<Button>` do shadcn; remover `btn-gold`.

- [SEVERIDADE: alto] `src/components/tools/StateMap.tsx:103-115` — "Resumo em uma frase": `{current ? <p>…</p> : <textarea …/>}`. Na primeira tecla `current` fica não-vazio, o `<textarea>` é desmontado e substituído por `<p>` somente leitura; o mentor não consegue digitar a segunda letra nem editar. — Impacto: campo inutilizável no mapa (só funciona se preenchido antes, na tela "stage" `ToolWizard:574-580`). — Correção: renderizar sempre `<textarea>` (como faz o campo "Onde quer chegar" na linha 148-158).

- [SEVERIDADE: médio] `src/components/tools/StateMap.tsx:87,58-62,100` + `src/components/tools/DiagnosticSheet.tsx:87,68,83` — Tipografia fora da escala e ilegível: `text-[7px]`, `text-[8px]`, `text-[9px]`, `text-[10.5px]`, `text-[12px]`, `text-[15px]`, `text-[17px]`; `grid-cols-2` fixo em `StateMap:87` (sem empilhar no mobile) com `h-[26rem]` por card. — Impacto: em 360px cada coluna tem ~150px com fonte de 7–9px; falha WCAG 1.4.4. — Correção: usar `text-xs/sm/base`, `grid-cols-1 md:grid-cols-2`, altura automática.

- [SEVERIDADE: médio] `src/components/tools/NextStepsTrail.tsx:14-15,50,95,102-105,109,113-115,122-124` — Cores hardcoded `#16a34a`, `#d4af37`, `#f4d77a`, `#5a4500`, `rgba(212,175,55,…)`, sem variante dark; `DiagnosticRadar.tsx:63,66-67,171,175` usa fallbacks literais `210 90% 55%`, `142 70% 45%` embora `--status-blue`/`--status-green` existam. — Impacto: quebra do tema (claro/escuro) e do design system baseado em tokens. — Correção: usar `hsl(var(--status-green))`, criar `--gold` no `index.css`.

- [SEVERIDADE: médio] `src/components/tools/NextStepsTrail.tsx:43` — `min-w-[900px]` força rolagem horizontal no mobile; a animação de 2 s começa fora da viewport. — Correção: layout em coluna/grid responsivo no mobile (`grid-cols-4 sm:grid-cols-7 lg:grid-cols-13`).

- [SEVERIDADE: médio] `src/components/StudentTools.tsx:518-525,553` — Edição/remoção via `prompt()`/`confirm()` nativos, enquanto `MentorFerramentas.tsx:345-367` usa `AlertDialog` e o resto do app usa dialogs shadcn. — Impacto: UX inconsistente, sem tema, bloqueante, ruim em mobile. — Correção: `Dialog` com formulário e `AlertDialog` de confirmação.

- [SEVERIDADE: médio] `src/pages/Ferramentas.tsx:204-210` — Quando existe diagnóstico (`base`) mas não há `contents` tipo tool, a página mostra `EmptyState "Nenhuma ferramenta disponível"` logo abaixo do radar; além disso `StudentTools:428-433` renderiza seu próprio empty ("Nenhuma ferramenta disponível ainda."), então podem aparecer dois estados vazios na mesma tela. — Correção: um único empty-state consolidado quando `!base && !hasSessionTools && effectiveTools.length === 0`.

- [SEVERIDADE: médio] `src/pages/FerramentaModelo.tsx:131-170` vs `src/components/tools/ToolWizard.tsx:269-319` — Hero duplicado com o mesmo copy ("Uma conversa guiada, uma pergunta por vez…", badge "Ferramenta Begin", botão "Iniciar"); mentor vê a landing em `FerramentaModelo`, escolhe aluno, e cai em outra capa quase igual (`view="cover"`) quando vem de `MentorFerramentas:139` (sem `state.start`). Só o fluxo de `FerramentaModelo:90` passa `start: true`. — Correção: sempre iniciar em `trail` para aplicações reais e manter a capa só no demo.

- [SEVERIDADE: médio] Nomenclatura de status inconsistente: `MentorFerramentas.tsx:242` "Em preenchimento" (filtro) vs `:316` "Preenchendo" (badge); `MentorFerramentas.tsx:304` "Diagnóstico inicial/final" vs `Ferramentas.tsx:114` "Mapeamento do Negócio" vs `MemberDiagnosticCard.tsx:89` "Mapeamento do Negócio" vs `FerramentaAplicacao.tsx:130` toast "Diagnóstico concluído" vs `DiagnosticRadar.tsx:661` "Radar da maturidade" vs migration `20260727155047` que renomeou para "Mapeamento do Negócio". `FerramentaModelo.tsx:186` diz "Vincular ao membro" e `MentorFerramentas.tsx:388` "Aluno". — Correção: glossário único (Mapeamento do Negócio / inicial / final / Em preenchimento / Concluído / membro).

- [SEVERIDADE: médio] `src/components/tools/ToolWizard.tsx:223-230` — Toggle de tema dentro do wizard, que não existe nas demais telas full-screen (`FerramentaModelo`). — Correção: mover para `AppLayout` ou remover.

- [SEVERIDADE: baixo] `src/components/tools/StateMap.tsx:184` — Typo de classe `px- py-1` (classe inválida `px-`). — Correção: `px-2`.

- [SEVERIDADE: baixo] `src/components/tools/ToolWizard.tsx:681,694,706` + `src/components/tools/GiftReveal.tsx:64` — `animate-fade-in` não existe (tailwind.config só define `fade-up`, `silver-line`, `pulse-soft`; `tailwindcss-animate` expõe `animate-in fade-in`, não `animate-fade-in`). — Impacto: classe no-op. — Correção: `animate-fade-up` ou `animate-in fade-in`.

- [SEVERIDADE: baixo] `src/components/tools/ToolWizard.tsx:681,694` — `xl:mx-[calc(50%-47vw)]` hack de "breakout" do container `max-w-3xl`; gera scroll horizontal quando há scrollbar vertical. — Correção: alargar o container do wizard nessas views (`max-w-6xl`) em vez de margem negativa.

- [SEVERIDADE: baixo] Acessibilidade — `src/components/tools/DiagnosticRadar.tsx:52-180`: SVG do radar sem `role="img"`/`aria-label`; ticks clicáveis são `<text onClick>` sem `tabIndex`/`role="button"` (`:79-92`), inacessíveis por teclado; a alternativa textual existe apenas porque `showBars` é `true` por padrão (`:200-221`) — se algum consumidor passar `showBars={false}` perde-se a alternativa. `TrailPath.tsx:87-99`: botões sem `aria-current`/`aria-pressed` para o ativo. `ToolWizard.tsx:463-491`: opções A–E são botões sem `role="radiogroup"`/`aria-checked`. `GiftReveal.tsx:60`: `<img alt="" aria-hidden className="hidden">` para pré-carregar — usar `<link rel="preload">` ou `new Image()`. — Correção: adicionar `role="img" aria-label={\`Radar: média ${total}/5\`}` no wrapper, `<title>/<desc>` no SVG, tornar ticks focáveis, `radiogroup` nas opções.

- [SEVERIDADE: baixo] Textos em inglês na UI: **nenhum** encontrado; só comentários/identificadores em inglês (`// Fetch tools from contents table`, `MICRO_REWARDS`, `PROCESSING_STEPS`), o que é aceitável. `StudentTools.tsx:347` placeholder "Notion, Drive, Figma" são nomes próprios.

---

## Qualidade

- [SEVERIDADE: médio] Arquivos acima de 700 linhas — `src/components/tools/ToolWizard.tsx` (734) e `src/lib/diagnosticoBegin.ts` (742). `ToolWizard` mistura 9 views (`cover/trail/question/stage/processing/result/map/nextsteps/gift`), máquina de estados, micro-recompensas e layout. `diagnosticoBegin.ts` mistura ~630 linhas de conteúdo (perguntas) com lógica de score/formatters. — Correção: `ToolWizard` → `views/CoverView.tsx`, `TrailView.tsx`, `QuestionView.tsx`, `StageView.tsx`, `ProcessingView.tsx`, `ResultView.tsx` + hook `useWizardState`; `diagnosticoBegin.ts` → `diagnosticoBegin.content.ts` (pilares) e `diagnosticoBegin.scoring.ts` (score, maturidade, chaves, máscaras). `StudentTools.tsx` (572) também deve separar formulário de upload (`StudentToolForm`) e listagem (`StudentToolList`).

- [SEVERIDADE: médio] Código morto:
  - `src/components/tools/ToolWizard.tsx:41-85` `GOAL_EXAMPLES` — nunca referenciado (nem em outros arquivos).
  - `src/components/tools/ToolWizard.tsx:16` import `pillarGoalKey` não usado.
  - `src/components/tools/StateMap.tsx:25` `ORDER_INDICES = [0..7]` identidade, com comentário (`:19-24`) descrevendo layout "3-3-2, dois últimos maiores" que não corresponde ao grid `md:grid-cols-2` da linha 188; prop `featured` (`:47,52`) nunca usada.
  - `src/components/tools/NextStepsTrail.tsx:7,10,18` — props `answers` e `accentFor` declaradas e nunca usadas (`accentFor` até desestruturado).
  - `src/lib/diagnosticoBegin.ts:682` `pillarQuestionCount` e `:732` `pillarSessionGoalKey` — sem uso no `src`.
  - `src/components/tools/GiftReveal.tsx:11` `forwardRef` — nenhum consumidor passa `ref`.
  - `src/pages/Ferramentas.tsx:23,25` `_profile` e `profile` com cast; `src/components/tools/ToolWizard.tsx:105,219` prop `demo` só altera subtítulo.
  - `src/App.tsx:143` rota duplicada (ver Rotas).
  — Correção: remover; ativar `noUnusedLocals`/`no-unused-vars` no lint.

- [SEVERIDADE: médio] Uso de `any` (todos com tipos disponíveis via `Database` do Supabase):
  - `src/pages/Ferramentas.tsx:25,88,89,91,93,94,96,128,129,152,155,176,178`
  - `src/pages/FerramentaModelo.tsx:51,53,61,92,225` — `(supabase as any).rpc("list_tool_members")` na linha 51, enquanto `MentorFerramentas.tsx:56` chama `supabase.rpc("list_tool_members")` tipado, provando que o cast é desnecessário.
  - `src/pages/FerramentaAplicacao.tsx:63`
  - `src/pages/MentorFerramentas.tsx:37,58,75,83,93,100,141,154,184,185,289,381,392,402`
  - `src/components/StudentTools.tsx:90,119,182,187,251,256,363,478`
  - `src/components/tools/DiagnosticRadar.tsx:58,76,93,121,154,159`
  - `src/components/MemberDiagnosticCard.tsx:51,55`
  — Correção: `type ToolApplication = Database["public"]["Tables"]["tool_applications"]["Row"]` com `answers: Answers; scores: Record<string, number>` refinados via `z.parse`/type guard; tipar callbacks do recharts com `RadarProps`/`TickProps`.

- [SEVERIDADE: médio] Duplicação:
  - `sectorStatements` copiado em `DiagnosticSheet.tsx:11-22` e `StateMap.tsx:28-39`.
  - `norm()` copiado em `FerramentaModelo.tsx:17-18` e `MentorFerramentas.tsx:23-24`.
  - Mutation de criar aplicação copiada em `FerramentaModelo.tsx:69-93` e `MentorFerramentas.tsx:116-142`.
  - Resolução inicial/final copiada em `Ferramentas.tsx:93-96` e `MemberDiagnosticCard.tsx:49-56`.
  - `pillarAccent` duplicado (`ToolWizard.tsx:31`, `TrailPath.tsx:10`).
  — Correção: mover para `src/lib/diagnosticoBegin.ts` / `src/lib/text.ts` / hook `useCreateToolApplication`.

- [SEVERIDADE: baixo] `src/pages/FerramentaAplicacao.tsx:85-91` — `useEffect` com `eslint-disable react-hooks/exhaustive-deps` e dependência `answers` (objeto novo a cada tecla) — o debounce funciona por acidente; `src/components/MemberDiagnosticCard.tsx:67` idem. — Correção: `useDebouncedCallback` ou `useEffect` dependendo de um contador `version`.

- [SEVERIDADE: baixo] `src/pages/MentorFerramentas.tsx:63-72` — `select("*")` de todas as aplicações do sistema sem paginação e sem `error` check (`data || []` esconde falhas de RLS). Mesmo padrão em `Ferramentas.tsx:32-38,78-84`, `MemberDiagnosticCard.tsx:27-32`, `FerramentaModelo.tsx:39-44`. — Correção: tratar `error` (lançar para o React Query) e paginar/filtrar por mentor.

- [SEVERIDADE: baixo] `src/components/StudentTools.tsx:119-140` — `traduzirErro` faz *string-matching* de mensagens do Postgres; frágil. — Correção: mapear por `error.code` (`23514`, `42501`, `23505`, `23503`).

- [SEVERIDADE: baixo] `src/lib/diagnosticoBegin.ts:29-34` — `LEGACY_GESTAO_VISAO_QUESTION` é a única "versão" preservada; não há mecanismo genérico. Ver seção Diagnóstico para snapshot por aplicação.

---

### Resumo por severidade
- **Crítico (1):** RLS de `tool_applications` permite a qualquer mentor gerenciar/excluir aplicações de qualquer aluno.
- **Alto (6):** 8 pilares × 7 cores; `btn-primary` inexistente (CTAs sem estilo); textarea do resumo no StateMap trava após 1 tecla; perda de respostas ao sair antes do autosave; "Diagnóstico pronto" mesmo com gravação falha; rota `/admin/ferramentas` duplicada (linha 138 vence, 143 morta).
- **Médio (~20):** fontes de verdade divergentes para score/base, sentinela 0, faixas de maturidade com lacunas, ausência de `booking_id`/unique, acoplamento a um único template, tipografia/mobile no StateMap e NextStepsTrail, cores hardcoded, `prompt/confirm`, arquivos >700 linhas, `any`, código morto, duplicações.
- **Baixo:** demais itens acima.