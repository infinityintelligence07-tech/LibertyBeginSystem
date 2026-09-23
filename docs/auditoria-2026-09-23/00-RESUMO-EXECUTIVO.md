# Auditoria geral — Plataforma Liberty Begin (23/09/2026)

Nenhum arquivo de código foi alterado nesta etapa. Este documento consolida a leitura completa do repositório (front, hooks, libs, 18 edge functions, 130 migrations) feita por 17 auditorias paralelas por módulo, mais a análise dos casos reais enviados pela equipe (prints). Os relatórios detalhados, com `arquivo:linha` e correção sugerida para cada item, estão nos arquivos `01-…` a `21-…` desta pasta.

**Volume:** ~1.030 achados — 35 críticos, 175 altos, 429 médios, 387 baixos + ~350 achados do inventário visual (`18` a `21`).

**Estado do build:** `npm install` falha por conflito de peer-deps (só instala com `--legacy-peer-deps`); `tsc` tem 1 erro (`src/pages/AgendaOverview.tsx:226`); `eslint` reporta 473 erros (quase todos `any`) e 37 avisos.

---

## 1. Os casos reais (prints) — causa raiz e correção

### 1.1 Kaoru Sasaki — "Vendas" cancelada com a Djeni consta como realizada; Mapeamento aparece como Sessão 2

**O que o sistema fez.** O booking de "Vendas" (Djeniffer, 17/09) ficou com status `scheduled`. A regra única da plataforma (`src/lib/bookingStatus.ts:53-55` e `74-77`) diz: *sessão agendada cuja data/hora já passou vira `awaiting_report` e conta como "realizada"* em todas as telas (jornada, admin, financeiro, ranking). O cancelamento combinado com a Djeni nunca foi registrado na plataforma, então o sistema assumiu que a sessão aconteceu.

**Por que o Mapeamento virou "Sessão 2".** O "Mapa das 12 sessões" (`src/components/MemberTimeline.tsx:63-70, 162-168`) numera os círculos pela **ordem cronológica dos bookings** (1º booking = Sessão 1), e a estrela de "Kickoff" é colocada sempre no índice 1 (`:314`), independentemente de qual sessão está ali. Como Vendas (17/09) veio antes do Mapeamento (19/09), Vendas recebeu o "1 ★".

**Correção de dados (hoje, via SQL — script em `02-agendamento-e-jornada.md`, seção "SQL (ii)")**
- Cancelar o booking de Vendas com `status = 'cancelled'` (não `not_realized`: o índice único `bookings_unique_liberty_session_active` só libera reagendamento quando o status é `cancelled`). Com isso o Mapeamento passa a ser a Sessão 1 e Vendas volta a "pendente" para reagendar. Mentor/membro recebem notificação de cancelamento e o admin recebe um alerta de "cancelamento < 24h" (efeito colateral do trigger) — o script já inclui como limpar.
- A Djeni deixa de ter essa sessão contabilizada no Financeiro.

**Correção de código (precisa da sua decisão — ver D1 e D3 abaixo)**
- Numerar os círculos pela sessão do catálogo (`sessions.order` / `is_kickoff`), reservando o círculo 1 para o Mapeamento.
- Rever a regra "passou = realizada": hoje basta o mentor não fechar a sessão para ela contar como feita (e ser paga).

### 1.2 Alexandre Ribeiro da Silva — agendou Mapeamento como "Sessão 10" (regra: só até 3 realizadas)

**Quatro portas abertas, nenhuma trava no banco:**
1. A migration `20260827213401` **reescreveu** `enforce_member_booking_rules` e removeu a regra do kickoff (e também o limite mensal). O banco hoje só valida o teto de 13 bookings.
2. `src/pages/Journey.tsx:447-454` — o botão "Agendar Kickoff" aparece sempre que não há booking do Mapeamento (`kickoffLocked = false` fixo em `:345`), sem olhar quantas sessões foram realizadas.
3. `src/pages/AgendarSessao.tsx:223-252` — quando a página abre com `?sessionId=…` (vindo da Jornada ou do Dashboard), a pré-seleção **ignora `hideKickoff`** (`:120`), que só filtra a lista do passo 1.
4. `src/pages/AgendaOverview.tsx:260-275, 370-434` — os slots "agendar agora" oferecem o Mapeamento sem checar realizadas e sem checar duração (slot de 2h para sessão de 3h).

**"Sessão 10"** é o índice cronológico da timeline (mesmo mecanismo do caso 1.1): Alexandre tinha 9 bookings antes.

**Botão "Preencher relatório" no card do print** (`src/components/MemberTimeline.tsx:427-433`) — é exibido para sessão **futura** e para **Mapeamento** (que por regra não exige relatório), porque só verifica se existe rota e se não há relatório salvo.

**Correção de dados:** cancelar esse booking (status `cancelled`) e avisar o membro/Rinaldo.
**Correção de código:** regra no trigger do banco + bloqueio nos 3 pontos do front + botão de relatório condicionado a `isAwaitingReport` e `bookingRequiresReport`.

### 1.3 Esequiel S. Rodrigues — fez SWOT e Marketing de Tração, plataforma não mostra

Sem acesso ao banco não dá para afirmar qual das causas abaixo é a dele; todas existem no código (detalhes em `02-agendamento-e-jornada.md`, seção B3). Rode primeiro a query de diagnóstico "SQL (i)" com `'%Esequiel%'`.

1. **Sessão passou sem relatório** → status efetivo `awaiting_report`. Em `Journey`/`Dashboard` conta como realizada; em `MentorAlunos.tsx:133`, `MemberBookingsManager.tsx:80-85` (editor do admin) e no rótulo da timeline ("Realizada · aguardando relatório", amarelo) **não** — e a notificação do banco diz ao aluno "sem o relatório, elas não contam como realizadas", contradizendo a regra.
2. **Sessão renomeada/fora das 12.** "SWOT Inovações" virou "Tecnologia" (`20260914224202`). "SWOT Estratégico" e "Sessão de Marketing" são do tier Liberty (`order` 105/104). `sessionProgress.ts:28-30` faz `sort(order).slice(0,12)` — qualquer sessão além da 12ª posição **some silenciosamente** da jornada, do dashboard e da contagem.
3. **Marcada como "não realizada"** por engano pelo mentor → fica invisível para o membro e ainda impede reagendar a mesma sessão.
4. **Sessão desativada** (`is_active=false`) — `Journey` filtra, `Dashboard` não → telas discordam.
5. **Perfil duplicado** — booking criado pelo mentor em outro perfil do mesmo nome.

**Resposta à pergunta ("posso marcar como realizada ou te passo?"):** pode marcar, mas com cuidado. O caminho na UI é Admin → Membro → Detalhes → editar sessão → status "Realizada". Só que:
- esse editor tem um bug **crítico**: quando a sessão está `awaiting_report`, o `Select` de status fica vazio e o salvar falha com erro de enum (`MemberSessionEditor.tsx:95,109`); e bookings `awaiting_report` **nem aparecem** nas listas do editor (`MemberBookingsManager.tsx:80-85`);
- ao salvar como "Realizada" ele força `is_retroactive = true` → a sessão deixa de exigir relatório, ganha +10 pontos, entra no honorário do mentor, e não dispara NPS.

Se as duas sessões existirem como bookings, o mais seguro hoje é o script "SQL (iii)" do relatório 02 (mantém o pedido de relatório ao mentor). Se não existirem, criar via "Já realizada (histórico)" no editor. Se preferir, me passa o resultado da query e eu preparo o SQL exato.

### 1.4 Emerson e Rogério — "e-mail ou senha incorretos" e e-mail de redefinição não chega

Diagnóstico ranqueado (código em `01-autenticacao-e-acesso.md` e `17-edge-functions.md`):

1. **Não existe usuário em `auth.users` para o e-mail que eles digitam.** A plataforma permite perfil "só cadastro" (sem login): `create-user` cria profile-only; a edição rápida em `AdminMembros.tsx:511-522` grava `profiles.email` **sem** propagar ao auth; `admin-update-user` só toca o auth se já houver `user_id`; `bulk-upsert-members-full` marca "Atualizado" e nunca cria acesso para perfil existente sem `user_id`. Não há nenhum badge "sem acesso" na lista de membros. O GoTrue responde 200 ao "esqueci minha senha" mesmo sem usuário (anti-enumeração) → a tela mostra "E-mail de recuperação enviado!" e nada chega. **Explica os dois sintomas ao mesmo tempo.**
2. **Nenhuma edge function envia e-mail** — o "convite" é `createUser` + senha devolvida ao admin para mandar por WhatsApp. O único e-mail do sistema é o `resetPasswordForEmail` do Login, que usa o **SMTP interno do Supabase** (sem SMTP próprio configurado; limite de poucos e-mails/hora; frequentemente em spam).
3. **Texto errado na UI**: o formulário de novo membro diz "senha padrão Liberty@2026" (`AdminMembros.tsx:879`), mas o backend gera senha **aleatória** e a mostra só num toast que desaparece (`:567-569`). Admin envia a senha errada → "incorretos".
4. **Mensagem genérica**: `Login.tsx:63-66` transforma qualquer erro (`Email not confirmed`, `User is banned`, `Too many requests`, rede) em "Email ou senha incorretos".
5. Redirect URL `/reset-password` pode não estar na allow-list do painel → link cai em `/` e o usuário é jogado no dashboard sem trocar a senha.

**O que fazer hoje (sem código):** rodar a query cruzada `auth.users × profiles × user_roles` do relatório 01 (seção "Checklist"), e para cada um usar **"Gerar acesso"** na tela de membros (edge `reset-and-invite`) e mandar a senha pelo WhatsApp via o diálogo de credenciais. Conferir no painel: Auth → Users (existe? e-mail confirmado?), Auth → URL Configuration (Redirect URLs inclui `/reset-password`), Project Settings → Auth → SMTP.

**O que corrigir no código:** badge/filtro "Sem acesso"; edição de e-mail sempre via `admin-update-user` criando/vinculando auth; textos de senha; mapa de erros do GoTrue em PT; SMTP próprio (ou remover "Esqueci minha senha" e trocar por "Solicitar nova senha ao suporte"); número de WhatsApp de suporte real (hoje `5511999999999` em `Login.tsx:151` e `Support.tsx:39`).

---

## 2. Os 10 problemas estruturais que geram a maioria dos erros de "dados não batem"

1. **"Passou = realizada" sem confirmação** (`bookingStatus.ts`). Sessão que ninguém fechou conta como feita e é paga. Caso Kaoru/Djeni.
2. **Três (ou mais) contagens diferentes de "realizadas"**: `useAdminData.tsx:168` (bookings, qualquer `order>0`), `sessionProgress.ts:28-47` (sessões únicas, `slice(0,12)`), `MemberTimeline.tsx:76-79` (bookings cronológicos sem corte), `MentorAlunos.tsx:133` e `useMentors` (`=== "completed"` estrito). Resultado: 13/12, 7/12 na lista e 12/12 no detalhe, mentor e admin com números diferentes.
3. **`slice(0,12)` por posição** em vez de por tier/flag: sessões novas criadas pelo admin nascem com `order ≈ 1000` (`AdminSessoes.tsx:101`) e nunca entram na jornada; sessões Liberty (101-107) nunca aparecem.
4. **`report_required`/`is_retroactive` não vêm nos `select`** de várias telas (`AdminMembroDetalhes.tsx:159-162`, `MentorDashboard.tsx:136-148`, `AgendarSessao.tsx:100-102`) → Mapeamento realizado fica eternamente "aguardando relatório".
5. **Sem `hasReport` no admin**: `useAdminData` nunca consulta `booking_reports` → "concluída sem relatório" é paga como realizada; "Aguardando relatório" do Financeiro subconta.
6. **Leitura de `bookings` inteira sem paginação** (5 lugares) — PostgREST corta em 1000 linhas → a partir do 1001º booking todos os totais do admin ficam silenciosamente errados.
7. **Cache do react-query** (`staleTime 60s`, `refetchOnMount false`) sem `invalidateQueries` após agendar/cancelar/salvar relatório → "agendei e não apareceu", "salvei o relatório e continua pendente".
8. **Fuso horário**: `toISOString().slice(0,10)` (UTC) para "hoje" em Journey, tarefas, `monthEnd` do admin; `new Date(\`${date}T${time}\`)` no fuso do navegador; triggers do banco comparando `timestamp` sem fuso com `now()` → 3h de erro; último dia do mês excluído do filtro mensal.
9. **Disponibilidade recorrente com `is_booked` único** — um agendamento apaga aquele horário semanal do mentor para todas as semanas (`sync_availability_booked` + `AgendarSessao.tsx:409-411`).
10. **Duração fixa** (+90min, 1h30, 10:30) em três lugares do admin ignorando `duration_minutes` (Mapeamento = 3h) → conflitos de agenda não detectados.

---

## 3. Segurança — o que precisa ser fechado antes de qualquer outra coisa

- Membro pode inserir booking com `status='completed'`/`is_retroactive=true` via API (ganha pontos, consome vaga, entra no financeiro) — policy `Libertys can insert own bookings` só valida `liberty_id`.
- Membro pode alterar **qualquer coluna** do próprio perfil (`member_tier`, `is_active`, `courtesy_reschedules_left`, `session_rate`, `is_ranking_featured`, `user_id`) — policy `Users can update own profile` sem restrição de colunas.
- Membro lê `admin_note` (anotação interna do admin) no próprio perfil.
- Admin comum cria/reseta/apaga **super_admin** (RLS de `user_roles` e edge functions `create-user`, `reset-and-invite`, `admin-update-user`, `admin-delete-user`).
- Qualquer mentor lê/edita/apaga diagnósticos (`tool_applications`) e tarefas (`session_tasks`) de alunos de outros mentores; salvar relatório em booking alheio mostra "salvo" e injeta tarefas.
- `ProtectedRoute.tsx:37`: usuário autenticado **sem role** renderiza qualquer rota, inclusive `/admin/*`.
- Cadastro público ("Criar conta") aberto numa plataforma fechada + trigger que vincula o novo login ao perfil órfão de mesmo e-mail → sequestro de perfil.
- Senhas fixas versionadas: `Demo@2026` (seed-demo-members, contas reais em produção), `Liberty@2026`/`Mentor@2026` (bulk-generate-access).
- `build-session-deliverable` e `pick-featured-case` chamáveis sem checar papel (proxy de IA pago; envia nome/empresa/faturamento de membros a terceiro).
- `service_role key` guardada em `system_config` (tabela legível por admin via API).
- `profiles.user_id ON DELETE CASCADE`: apagar um usuário no painel Auth apaga perfil, bookings, NPS, ferramentas.
- Pontos: farm infinito via inserir/apagar depoimento (+20) e auto-conclusão de tarefa (+3).
- `signOut` não remove token push → aparelho compartilhado continua recebendo notificações do usuário anterior.

---

## 4. Design System — situação e proposta

**Não encontrei no repositório nem nas pastas vizinhas o "Design System Apple" que vocês montaram.** Preciso que você me aponte o arquivo (Figma, CSS, MD ou outro projeto). Enquanto isso, o inventário visual (`18` a `21`) mapeia o que precisa ser unificado. O que já está confirmado pelos relatórios:

- **Bordas/rings globais com `!important`** em `src/index.css:261-276` anulam `border-status-*`, `border-primary/*`, `border-2` e o **anel de foco do teclado** (a11y) em todo o app — é a primeira coisa a remover.
- Coexistem `.btn-silver`, `<Button>` shadcn (6 variantes), `<button>` nativos com classes soltas e `.input-begin` vs `<Input>` vs `<select>` nativo — o mesmo funil (Login → Reset → Onboarding) usa dois sistemas de botão e três de input.
- Badge de status tem 4 implementações com labels diferentes para o mesmo estado ("Realizada" / "Concluída" / "alcançadas" / "Realizada · aguardando relatório"; "Aguardando confirmação" / "Pendente" / "aguardando aprovação" / "requer aprovação").
- Menu mobile do PWA tem só 5 itens por papel e **não tem "Mais"**: liberty perde Conteúdos, Ferramentas, Eventos, Ranking, Suporte; admin perde 7 telas.
- `MentorSessoes.tsx:362` força `dark` no card independentemente do tema.
- 8 pilares do diagnóstico com 7 cores (`--pillar-1..7`): "Pessoas" recebe a cor de "Gestão".
- Alvos de toque < 44px em dezenas de pontos; ações só em `hover` (invisíveis no celular) em `MemberSessionEditor`, `TaskChecklist`, `Conteudos` (botão Play).
- **Classes fantasma**: `btn-primary` (`MentorFerramentas.tsx:176,414`, `ToolWizard.tsx:292,387,499,589`) e `btn-gold` (`ToolWizard.tsx:668`) **não existem** em nenhum CSS → esses botões renderizam sem fundo/radius.
- `<Button>` do shadcn tem **zero** usos nas telas do mentor e nas 15 telas do membro parte 2; ~95 `<button>` nativos só na área do mentor. `.btn-silver` define `px-6 py-3` mas 100% dos usos sobrescrevem o padding → não é um token, é só um fundo.
- Erros de query silenciados (`Conteudos.tsx:13`, `Ferramentas.tsx:32-79`, `Ranking.tsx:29`, `TarefasPage.tsx:42-53`, `Eventos.tsx:40`) → a tela mostra "vazio" quando na verdade falhou.
- 3 bubbles fixas no topo direito do mobile (`ProfileBubble`, `ThemeToggleBubble`, `RefreshBubble`) cobrindo conteúdo; 5 larguras máximas de página diferentes; 7 padrões de loading; 10 tamanhos de fonte (3 abaixo de 12px).

Proposta (mantendo as cores/tokens atuais): criar `PageHeader`, `SectionCard`, `StatusPill` (única fonte: `bookingStatusConfig`), `EmptyState`/`ErrorState`/`Skeleton` padrão, `ConfirmDialog` (substituir `window.confirm`/`prompt`), `FilterBar` admin, `ListRow`, `BottomSheet` "Mais" no mobile; padronizar em `<Button>` shadcn (remover `.btn-silver`) e `<Input>`/`<Select>` shadcn (remover `.input-begin` e nativos); escala tipográfica de 6 tamanhos; radius único; espaçamento 4/8.

---

## 5. Decisões que preciso de você antes de corrigir

| # | Decisão | Minha recomendação |
|---|---|---|
| D1 | Sessão agendada que já passou e o mentor não fechou: continua contando como **realizada** automaticamente (e sendo paga)? | Não. Mostrar como **"A confirmar"** (não conta, não paga) e cobrar do mentor: "Realizada" ou "Não realizada" em até 48h; após 7 dias, alerta ao admin. Isso teria evitado o caso Kaoru/Djeni. |
| D2 | Regra do Mapeamento: "só pode marcar até 3 sessões realizadas" = pode agendar enquanto tiver **0, 1, 2 ou 3** realizadas (bloqueia a partir da 4ª)? | Sim, bloquear quando realizadas ≥ 4 — no banco (trigger) e no front (3 pontos). |
| D3 | Numeração "Sessão N": pela **ordem em que aconteceu** (atual) ou pela **posição no catálogo**, com o Mapeamento sempre no círculo 1? | Círculo 1 reservado ao Mapeamento; demais círculos preenchidos em ordem cronológica (2..12). O rótulo mostra o nome da sessão, não "Sessão N". |
| D4 | Design System Apple: onde está o arquivo de referência? | — |
| D5 | Mentor vê **todos** os alunos e bookings da plataforma (`MentorAlunos.tsx`, RLS de `bookings`, `session_tasks`, `tool_applications`)? | Restringir ao próprio mentor (+ admin). |
| D6 | Manter "Criar conta" público no Login? | Remover; acesso só criado pelo admin. |
| D7 | Contas demo (`demo.novo@libertydemo.com` / `Demo@2026`) e função `bulk-generate-access` (senhas fixas) em produção? | Apagar. |
| D8 | Esequiel: marco como realizada agora via SQL (após você me mandar o resultado da query) ou você faz pelo painel? | Me manda o resultado da query (i) do relatório 02 e eu preparo o SQL exato. |
| D9 | Kaoru e Alexandre: posso preparar o SQL final de cancelamento dos dois bookings (Vendas/Djeni e Mapeamento/Alexandre) para você rodar? | Sim. |

---

## 6. Plano de correção proposto (em ordem)

**Fase 0 — Dados (hoje, SQL/painel, sem deploy)**
Kaoru (cancelar Vendas), Alexandre (cancelar Mapeamento), Esequiel (diagnóstico → marcar), Emerson/Rogério (query cruzada → "Gerar acesso" → WhatsApp), conferir Redirect URLs e SMTP no painel.

**Fase 1 — Travas de negócio e segurança (1 deploy de banco + front)**
Trigger com regra do Mapeamento (D2) e restrição de `status`/`is_retroactive` no INSERT do membro; proteger colunas do perfil; mover `admin_note`; hierarquia de papéis nas edge functions e RLS de `user_roles`; RLS de `tool_applications`/`session_tasks` por mentor; `ProtectedRoute` com roles vazias; remover signup público; apagar seeds/senhas fixas; auth em `build-session-deliverable`/`pick-featured-case`; `service_role` para Vault; `ON DELETE SET NULL` em `profiles.user_id`; limpar push no logout.

**Fase 2 — Regra única de dados**
Um único `useJourneyProgress` (tier + `is_active` + `order 1..12`) usado por Dashboard, Jornada, Timeline, Admin lista/detalhe, Mentor; `select` sempre com `report_required, is_retroactive`; `hasReport` no admin; paginação/RPC para bookings; `invalidateQueries` centralizado após toda mutação; helper de datas em `America/Sao_Paulo`; `computeEndTime(duration)`; correção de `MemberSessionEditor`/`MemberBookingsManager`; `session_rate` na whitelist; D1 implementado.

**Fase 3 — Acesso e login**
Badge/filtro "Sem acesso"; edição de e-mail via `admin-update-user` criando auth; textos de senha e diálogo de credenciais; mapa de erros PT; SMTP; suporte real.

**Fase 4 — Design System unificado (D4)**
Remover overrides `!important`; componentes canônicos; menu "Mais" mobile; `StatusPill` única; substituição tela a tela conforme mapa dos relatórios 18 a 21.

**Fase 5 — Qualidade**
Erro de `tsc`; `eslint`; remover código morto (`MemberHistoryPanel`, `MemberTasksList`, `WeekTasksBento`, `MentorImpactBar`, `FeaturedCaseCard`, `OnboardingGate` banner, rota duplicada `/admin/ferramentas`, `bookingRules` de erros que o banco não emite mais); quebrar `AdminAgenda.tsx` (1874), `AdminMembros.tsx` (1714), `AgendarSessao.tsx` (1003), `MentorDashboard.tsx` (988); tipar `any`.

---

## 7. Índice dos relatórios detalhados

| Arquivo | Escopo |
|---|---|
| `01-autenticacao-e-acesso.md` | Login, reset, useAuth, ProtectedRoute, onboarding, functions de usuário — inclui checklist e SQL para Emerson/Rogério |
| `02-agendamento-e-jornada.md` | Regras de agendamento, estado vigente do banco, casos Kaoru/Alexandre/Esequiel com SQL |
| `03-membro-dashboard-agenda-perfil.md` | Dashboard, AgendaOverview, MemberAgenda, Perfil, Suporte |
| `04-mentor.md` | MentorDashboard, MentorSessoes, MentorAlunos, componentes mentor |
| `05-relatorio-disponibilidade-google.md` | MentorRelatorio, MentorDisponibilidade, PDFs, Google Calendar |
| `06-admin-agenda-e-editores.md` | AdminAgenda (1874 linhas), MemberBookingsManager, MemberSessionEditor — respostas Q1/Q2/Q3 |
| `07-admin-membros.md` | AdminMembros (1714), Detalhes, Editar, importações |
| `08-admin-dados-dashboard-encerramentos.md` | useAdminData métrica a métrica, AdminDashboard, Encerramentos, Relatórios |
| `09-financeiro-e-mentores.md` | AdminFinanceiro, AdminMentores, honorários |
| `10-sessoes-conteudos-eventos-config-nps.md` | AdminSessoes (order/kickoff), Conteúdos, Eventos, Configurações, NPS |
| `11-ferramentas-e-diagnostico.md` | Ferramentas, ToolWizard, diagnóstico 8 pilares, permissões |
| `12-tarefas.md` | TarefasPage, TaskChecklist, status/prazos, RLS |
| `13-ranking-perfil-rotas.md` | Ranking/privacidade, Perfil, rotas mortas |
| `14-shell-pwa-notificacoes-design-global.md` | App.tsx, AppLayout, notificações, push, splash, cache, index.css |
| `15-demo-viewas-seeds.md` | Dados demo, ViewAs, seeds em produção |
| `16-banco-schema-triggers-rls.md` | Estado final do schema, triggers, funções, 25 tabelas com RLS, SQL de diagnóstico |
| `17-edge-functions.md` | Tabela das 18 functions: auth, verify_jwt, CORS, erros, vulnerabilidades |
| `18-visual-membro-1.md` | Inventário visual: Login, Onboarding, Dashboard, Jornada, Agenda, Agendar, Timeline |
| `19-visual-membro-2.md` | Inventário visual: Conteúdos, Ferramentas, Eventos, Ranking, Perfil, Suporte, NPS, Tarefas, bubbles |
| `20-visual-mentor.md` | Inventário visual: todas as telas do mentor + ToolWizard |
| `21-visual-admin.md` | Inventário visual: todas as telas do admin + editores |
