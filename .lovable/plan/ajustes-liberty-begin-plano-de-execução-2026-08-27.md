# Ajustes Liberty Begin — plano de execução

Já corrigi agora, antes do plano: no card de sessão do mentor com **"Aguardando relatório"**, clicar no card leva direto ao formulário do relatório (a seta ao lado abre tarefas/opções). Isso valia para sessões que já passaram e ainda não tinham relatório — antes só expandia.

## O que encontrei no banco (diagnóstico)

- **Juliana Guidotti**: tem 2 sessões em **agosto** (11/08 e 14/08, ambas realizadas). O bloqueio vem de uma regra do banco que limita **2 sessões por mês-calendário** e não olha quantas sessões ainda faltam na jornada. É a causa real do "não consigo agendar".
- **Marielen**: 5 sessões, 4 realizadas — não há hoje um jeito do admin marcar sessão feita fora da plataforma sem inventar um agendamento manual completo.
- **Fabíola**: 4 sessões, incluindo uma duplicada cancelada no mesmo dia. Isso polui a visualização da jornada dela.
- **Aprovação do mentor**: o fluxo já existe parcialmente (status "Aguardando aprovação", notificação + botões Confirmar/Recusar no painel do mentor), mas hoje só entra nesse fluxo quando o agendamento é feito com **menos de 48h** de antecedência. Fora disso, entra já confirmado.
- **"Michelle Araujo"**: não existe nenhum cadastro com esse nome na base (nem login, nem cadastro sem login). Os nomes parecidos existentes são Michelle Aparecida Rissato, Michele Menegalli, Michele Turri Salvador e Michel Bridi. Também não há nenhum cadastro apagado com esse nome. Preciso do e-mail dela para localizar/recriar — não foi algo que "sumiu" do sistema; ela nunca teve cadastro com esse nome.

## Prioridade alta

### 1. Contagem de "Membros sem sessão"
Passar a classificar cada membro em um de quatro estados, e o contador "sem agendamento" usar só o primeiro grupo relevante:
- nunca teve sessão;
- já fez sessões, mas **sem próxima** marcada;
- com sessão futura confirmada;
- com sessão aguardando aprovação do mentor.
Sessões passadas sem relatório param de contar como "próxima sessão". Filtros na área de Membros ganham esses estados.

### 2. Limite de agendamentos
Nova regra: o limite passa a ser **a jornada** (12 sessões Begin), não o mês.
- Bloqueio real: só quando o membro já usou todas as sessões da jornada.
- 2 por mês continua como **meta/aviso** ("você já tem 2 sessões neste mês, quer mesmo marcar outra?"), sem impedir.
- Mensagem de erro clara quando de fato não há sessão disponível.

### 3. Marcar sessão/ação como "já realizada" (retroativo)
Na ficha do membro (admin), botão **"Registrar sessão já realizada"**: escolhe a sessão, a data, o mentor e marca como concluída, com marca de "registro retroativo". Conta no progresso e sai das pendências, sem exigir agendamento nem relatório. Também permite marcar tarefas antigas como concluídas.

### 4. Aprovação do mentor em todo agendamento
Todo agendamento feito pelo membro entra como **"Aguardando aprovação do mentor"**, com notificação (push + no app) mostrando membro, sessão, data e horário. O mentor aprova, recusa ou pede outro horário; ao aprovar vira **"Sessão confirmada"** e sincroniza com o Google Agenda. O membro é avisado nas duas situações.

## Prioridade média

### 5. NPS dentro da plataforma
O formulário interno já existe. Vou automatizar: quando a sessão é concluída (relatório enviado), o membro recebe automaticamente o convite de NPS ligado àquela sessão. Painel admin de NPS passa a mostrar membro, sessão, mentor, notas, comentário e **quem ainda não respondeu**.

### 6. Eventos + confirmação de presença
Novos campos e uma tabela de presença. Membro vê o evento (nome, data, hora, local, descrição, imagem) e responde **Vou / Não vou**. Admin vê por evento: confirmados, recusados e sem resposta, com opção de exportar a lista.

### 7. Visualização da jornada do membro
Revisão da tela de jornada usando o caso da Fabíola: bloco de resumo (realizadas / agendadas / disponíveis), próximo passo em destaque, e sessões duplicadas/canceladas fora da linha principal.

## Detalhes técnicos

- Alterar o gatilho `enforce_member_booking_rules` (limite mensal → limite de jornada) e `approval_required` no fluxo de criação em `AgendarSessao.tsx`.
- Novos campos/tabela: `events` (RSVP) + `event_attendance`, com políticas de acesso por membro e admin.
- `bookings` ganha marca de registro retroativo para não exigir relatório nem gerar cobrança de pendência.
- Ajustes de contagem em `useAdminData.tsx`, `bookingStatus.ts` e `sessionProgress.ts`.
- Automação de NPS via gatilho na criação do relatório da sessão.

## Preciso de você

- **E-mail da Michelle Araujo** (e das sessões dela com mentores, se souber quais) para eu localizar ou recriar o cadastro.
- Confirmar se o limite de 2 por mês pode virar só aviso (recomendado) ou se deve continuar bloqueando em algum caso.
