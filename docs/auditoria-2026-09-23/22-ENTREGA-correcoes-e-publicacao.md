# Entrega das correções e roteiro de publicação

Data: 23/09/2026. Este documento resume o que foi corrigido no código a partir das decisões confirmadas
(D1 a D8 do `00-RESUMO-EXECUTIVO.md`) e lista, em ordem, o que precisa ser feito no painel do Supabase
para as correções entrarem em vigor. Nada aqui altera dados sozinho: o banco só muda quando os scripts
e as migrations forem executados por você.

## 1. Decisões aplicadas

| # | Decisão | Como ficou |
|---|---|---|
| D1 | Sessão que passou e o mentor não fechou | Deixa de contar como realizada. Aparece como **A confirmar** (laranja) para membro, mentor e admin; não soma na jornada, não entra no financeiro e não dá pontos. O mentor tem ação "Confirmar realizada" ou "Não realizada" (aba Pendências em Sessões e no dashboard do mentor). Lembrete ao mentor após 2h do fim; alerta ao admin depois de 7 dias (job diário 12:15 UTC). |
| D2 | Mapeamento do Negócio | Permitido com 0 a 3 sessões realizadas; bloqueado a partir de 4 (contando as "A confirmar"). Regra no banco (`KICKOFF_NOT_ALLOWED`) e nas três telas de agendamento (Jornada, Agendar sessão, Agenda geral). Mensagem em português. |
| D3 | Numeração da trilha | Bolinhas cronológicas mantidas. Estrela e rótulo "Mapeamento" vêm de `is_kickoff`, nunca da posição 1. |
| D4 | Design System | Tokens `--ds-*` do DESIGN-SYSTEM.md aplicados sobre as cores atuais (obsidiana/prata, dourado Liberty, tema claro). Componentes canônicos em `src/components/ds/`. Veja seção 4. |
| D5 | Mentor vê todos os membros | Mantido. Nenhuma restrição de leitura foi adicionada. |
| D6 | Cadastro público | Removido da tela de login e do `useAuth`. Contas só via admin ("Gerar acesso"). Ainda é preciso desligar no painel (seção 3, item 4). |
| D7 | Contas demo e senhas fixas | Funções `seed-demo-members`, `seed-mentors`, `bulk-generate-access`, `bulk-import-members` apagadas do código. `create-user`, `reset-and-invite` e `bulk-upsert-members-full` geram senha aleatória e a mostram uma única vez ao admin (dialog com botão copiar). |
| D8 | Rodar SQL | Passo a passo em `sql/LEIA-ME.md`. |

## 2. Novo modelo de status de sessão (para leitura das telas)

| Status na tela | Quando acontece | Conta como realizada? | Entra no financeiro? |
|---|---|---|---|
| Agendada | Sessão futura | Não | Não |
| A confirmar | Sessão passou e o mentor ainda não fechou | Não | Não |
| Realizada · sem relatório | Mentor confirmou, relatório pendente | Sim | Sim |
| Realizada | Mentor confirmou e relatório entregue (ou sessão não exige relatório, ex.: Mapeamento) | Sim | Sim |
| Não realizada | Mentor marcou que não aconteceu | Não | Não |
| Cancelada | Cancelada por qualquer lado | Não | Não |
| Aguardando confirmação | Pedido de agendamento pendente de aprovação | Não | Não |

Regras que o banco agora impede: marcar "Realizada" antes do horário de término (`COMPLETION_BEFORE_SESSION_END`),
duas sessões ativas para a mesma etapa, Mapeamento com 4+ realizadas, e membro alterando campos que são
do admin (status, mentor, valor, tier, etc.).

## 3. O que fazer no painel do Supabase (na ordem)

Projeto: `roddclbsxqrlgmxvjsqr`. Abra <https://supabase.com/dashboard>.

1. **Scripts dos casos dos prints** (Kaoru, Alexandre, Esequiel, Emerson, Rogério): siga `sql/LEIA-ME.md`.
   Rode primeiro `01` e `02` (só leitura) e me mande os prints; depois `03` a `06`.
2. **Migrations novas** (SQL Editor → New query → colar → Run), nesta ordem:
   1. `supabase/migrations/20260923120000_confirmacao_sessoes_e_regra_mapeamento.sql`
   2. `supabase/migrations/20260923121000_seguranca_rls.sql`
   Cada uma pode ser rodada de novo sem problema (são idempotentes). Se aparecer erro, copie a mensagem inteira e me envie.
3. **Edge Functions** (menu Edge Functions): publicar novamente as funções abaixo. Se você usa o Supabase CLI:
   `supabase functions deploy <nome> --project-ref roddclbsxqrlgmxvjsqr`. Sem CLI, pelo painel: abrir a função →
   "Deploy new version" → colar o conteúdo de `supabase/functions/<nome>/index.ts` (e os arquivos de `_shared/`).
   - Atualizadas: `create-user`, `reset-and-invite`, `admin-update-user`, `admin-set-user-active`, `admin-delete-user`,
     `admin-merge-profiles`, `bulk-upsert-members-full`, `organize-zoom-report`, `build-session-deliverable`, `pick-featured-case`.
   - Apagar do painel: `seed-demo-members`, `seed-mentors`, `bulk-generate-access`, `bulk-import-members`.
   - Verificar que todas estão com **Verify JWT desligado** (a verificação é feita dentro da função, com resposta em português).
4. **Authentication → Sign In / Providers → Email**: desligar **Allow new users to sign up**.
5. **Authentication → URL Configuration**: Site URL = endereço real (https). Redirect URLs deve conter
   `https://SEU-DOMINIO/reset-password` e `https://SEU-DOMINIO/**`.
6. **Authentication → Emails → SMTP**: ativar Custom SMTP (Resend, Brevo, Postmark ou Gmail Workspace).
   Sem isso o "Esqueci minha senha" continua não chegando; use "Gerar acesso" + WhatsApp enquanto isso.
7. **Deploy do front-end**: publicar a nova versão do site (o build gera `dist/`). Após publicar, peça aos usuários
   para atualizar a página; o PWA mostra o aviso "Nova versão disponível".

## 4. Design System aplicado

Base (já feita): `src/index.css` com tokens `--ds-*` mapeados às cores atuais, fonte do sistema (SF Pro no iPhone/Mac),
foco visível, movimento reduzido respeitado, botões `.btn-*` e inputs de 44px no celular, sem `!important` de borda.
Componentes canônicos em `src/components/ds/`: `PageContainer`, `PageHeader`, `SectionHeader`, `SectionCard`, `Callout`,
`IconButton`, `StatusPill`, `Chip`, `ListRow`, `DateBlock`, `Stat`, `ProgressBar`, `LoadingState`, `EmptyState`, `ErrorState`,
`BottomSheet`, `ConfirmDialog`, `TextField`, `TextAreaField`, `SelectField`.

Aplicação por área: ver seção 7 (preenchida ao final da execução).

## 5. Pendências que dependem de você

1. **Número do WhatsApp de suporte**: está como `https://wa.me/` em `src/lib/authErrors.ts` (`SUPPORT_WHATSAPP_URL`).
   Me envie o número com DDI (ex.: 5511999999999) e eu troco.
2. **Esequiel**: o script `05` marca SWOT e Marketing de Tração como realizadas se as sessões já estiverem
   agendadas no passado. Se elas nunca foram agendadas na plataforma, o caminho é o admin criar a sessão retroativa
   em Admin → Agenda (a regra permite) e o mentor confirmar.
3. **Sessões retroativas e pagamento**: hoje uma sessão marcada como retroativa entra no financeiro do mentor
   normalmente. Confirmar se é isso mesmo.
4. **Tarefas de sessão e ferramentas (`session_tasks`, `tool_applications`)**: qualquer mentor pode editar tarefas de
   qualquer membro. Mantido por causa da decisão D5; se quiser restringir a "só o mentor da sessão", aviso que é uma
   migration pequena.
5. **Disponibilidade do mentor**: não existe travamento no banco contra horários duplicados/sobrepostos. A tela já evita,
   mas recomendo uma restrição no banco em uma próxima rodada.

## 6. Como validar depois de publicar (checklist rápido)

- Membro: abrir Jornada e conferir que sessões passadas sem confirmação aparecem "A confirmar" e não somam.
- Membro com 4+ realizadas: tentar agendar Mapeamento → mensagem "Mapeamento do Negócio só pode ser agendado até a 3ª sessão realizada".
- Mentor: aba Pendências → "Confirmar realizada" muda para Realizada e o membro ganha os pontos.
- Admin: Dashboard mostra alerta de "A confirmar há mais de 7 dias" com link para a Agenda filtrada.
- Admin: Financeiro não soma sessões "A confirmar".
- Login: não existe mais "Criar conta"; "Esqueci minha senha" mostra mensagem neutra.
- Admin → Membros → Gerar acesso: aparece a senha gerada uma única vez.

## 7. Resumo visual por área

Mesma estrutura nas três áreas: cabeçalho fino no topo (logo ou nome da área, sino e avatar com menu de perfil,
tema, atualizar e sair), menu lateral no computador com item ativo em fundo translúcido, barra inferior no celular
com alvos de 44px e menu "Mais" quando há mais de 5 destinos. As bolhas flutuantes foram removidas. Cada página tem
um único título, seções com cabeçalho, cartões planos sem brilho ou gradiente, e estados de carregando, vazio e erro reais.
Todos os `window.confirm`/`prompt` viraram diálogos da plataforma.

- **Entrada**: login em cartão único (sem "Criar conta"), redefinição de senha com confirmação, onboarding com "Etapa X de Y"
  e barra de progresso, perfil e suporte padronizados, 404 em português.
- **Membro**: início com Próxima sessão → Progresso (realizadas, a confirmar, agendadas) → Tarefas → Resultados; jornada em
  bolinhas cronológicas planas (verde realizada, laranja a confirmar, azul agendada) com estrela no Mapeamento; agenda em lista
  com bloco de data e etiqueta de status; agendamento em 3 passos com botão fixo no celular; ferramentas, tarefas, ranking,
  conteúdos, eventos e NPS no mesmo padrão (NPS com botões 0 a 10 de 44px).
- **Mentor**: início com Pendências (confirmar realizada / não realizada / relatório) em destaque, próximas sessões, impacto e
  alunos; Sessões com abas Pendências, Próximas, Realizadas, Todas; Alunos com busca e progresso; Relatório em coluna estreita
  com aviso quando a sessão ainda não terminou; Disponibilidade com células de 44px e formulários em folha inferior.
- **Admin**: Dashboard com indicadores, alerta de sessões a confirmar há 7+ dias e próximas sessões; Membros com tabela no
  computador e lista no celular, filtros com contadores, senha gerada exibida uma vez; Detalhe do membro com indicadores e
  linha do tempo; Agenda com barra de filtros fixa (inclui "A confirmar"), calendário e folhas inferiores para todas as ações;
  Financeiro separando "A confirmar" do repasse; Relatórios, Sessões, Conteúdos, Eventos, Configurações, NPS, Encerramentos e
  Mentores no mesmo padrão.

Validação: `tsc` sem erros, `npm run build` ok, tela de login verificada no navegador. As telas autenticadas precisam ser
conferidas com uma conta real após publicar (checklist da seção 6).
