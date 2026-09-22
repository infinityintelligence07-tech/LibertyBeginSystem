# [LB] Plataforma Liberty Begin

Crie a plataforma "Liberty Begin" — um ecossistema completo de gestão de mentorias empresariais para o programa Begin by Liberty. A plataforma centraliza agendamentos, sessões, relatórios, jornada dos membros e gestão operacional. Design premium dark mode idêntico à Liberty Members, substituindo dourado por prata.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STACK TÉCNICA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- React + TypeScript + Vite
- Tailwind CSS
- Framer Motion
- Supabase (auth + database + realtime)
- React Router DOM v6
- Lucide React
- React Hot Toast
- date-fns (pt-BR)
- Recharts (gráficos admin)
- Google Calendar API (OAuth2)
- Zoom API (JWT ou OAuth2 Server-to-Server)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DESIGN SYSTEM — IDENTIDADE BEGIN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PALETA (prata no lugar do dourado):
--bg:              #0a0a08
--bg-surface:      #111110
--bg-surface-2:    #1a1a18
--bg-card:         #161614
--border:          rgba(160,168,180,0.12)
--border-hover:    rgba(160,168,180,0.30)
--silver:          #a0a8b4   ← prata principal
--silver-light:    #c8d0d8   ← prata clara
--silver-dark:     #707880   ← prata escura
--silver-glow:     rgba(160,168,180,0.15)
--silver-soft:     rgba(160,168,180,0.06)
--text:            #f0ece0
--text-2:          #9a9890
--text-muted:      #5a5650
--green:           #4a9c6a   ← sessão realizada
--yellow:          #c9943a   ← pendente / atenção
--red:             #c45a4a   ← cancelada / alerta
--blue:            #4a7ab8   ← agendada

TIPOGRAFIA:
Google Fonts:
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">

- Display/Títulos grandes: Cormorant Garamond 600
- Interface e corpo: DM Sans 300/400/500/600
- Números e destaque: DM Sans 700

LOGO (replicar exatamente os arquivos fornecidos):
- Ícone: leão alado em prata/cinza (SVG como img)
- "BEGIN" Cormorant Garamond 600 letter-spacing 0.2em cor #a0a8b4
- "by LIBERTY" DM Sans 300 smaller, cor #707880
- Horizontal: ícone + textos lado a lado
- Em telas pequenas: só ícone

COMPONENTES BASE:
- Cards: #161614, border rgba(160,168,180,0.12), radius 12px
- Hover: border rgba(160,168,180,0.30) + shadow 0 8px 32px rgba(160,168,180,0.06)
- Botão primário: #a0a8b4, texto #0a0a08, radius 8px, weight 600
- Botão hover: #c8d0d8 + glow
- Input: #161614, border rgba(160,168,180,0.15), focus border #a0a8b4
- Scrollbar: 4px, thumb #a0a8b4 40%
- Animações: fade+slideUp 400ms ao entrar na tela, stagger 70ms nos cards

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BANCO DE DADOS — SUPABASE SCHEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TABLE: profiles
  id uuid PK references auth.users
  full_name text NOT NULL
  email text NOT NULL
  phone text
  role text DEFAULT 'liberty' CHECK IN ('liberty','mentor','admin','gestor')
  status text DEFAULT 'active' CHECK IN ('active','inactive','suspended')
  avatar_url text
  company_name text
  company_segment text
  city text
  state text
  linkedin_url text
  bio text
  created_at timestamptz DEFAULT now()
  last_login timestamptz

TABLE: mentors (perfil estendido para mentores)
  id uuid PK references profiles(id)
  specialties text[]
  default_session_duration integer DEFAULT 90 (minutos)
  zoom_email text
  google_calendar_email text
  zoom_user_id text (para criar salas via API)
  monthly_rate numeric (valor por sessão para cálculo financeiro)
  is_active boolean DEFAULT true

TABLE: sessions_catalog (catálogo das 12 sessões)
  id uuid PK DEFAULT gen_random_uuid()
  name text NOT NULL
  description text
  pillar text CHECK IN ('negocios','emocional','mentalidade','espiritual')
  duration_minutes integer DEFAULT 90
  order_index integer (ordem na jornada 1-12)
  is_active boolean DEFAULT true

TABLE: mentor_sessions (quais mentores fazem quais sessões)
  id uuid PK DEFAULT gen_random_uuid()
  mentor_id uuid REFERENCES mentors(id)
  session_catalog_id uuid REFERENCES sessions_catalog(id)
  UNIQUE(mentor_id, session_catalog_id)

TABLE: mentor_availability (disponibilidade dos mentores)
  id uuid PK DEFAULT gen_random_uuid()
  mentor_id uuid REFERENCES mentors(id)
  available_date date NOT NULL
  start_time time NOT NULL
  end_time time NOT NULL
  is_booked boolean DEFAULT false
  recurrence text CHECK IN ('none','weekly','biweekly') DEFAULT 'none'
  notes text
  valid_until date
  created_at timestamptz DEFAULT now()

TABLE: bookings (agendamentos)
  id uuid PK DEFAULT gen_random_uuid()
  liberty_id uuid REFERENCES profiles(id)
  mentor_id uuid REFERENCES mentors(id)
  session_catalog_id uuid REFERENCES sessions_catalog(id)
  availability_id uuid REFERENCES mentor_availability(id)
  scheduled_date date NOT NULL
  start_time time NOT NULL
  end_time time NOT NULL
  status text DEFAULT 'scheduled' CHECK IN ('scheduled','completed','rescheduled','cancelled','no_show')
  zoom_meeting_id text
  zoom_join_url text
  zoom_start_url text
  google_event_id_mentor text
  google_event_id_liberty text
  notes_liberty text (observações do liberty antes da sessão)
  cancellation_reason text
  created_at timestamptz DEFAULT now()
  updated_at timestamptz DEFAULT now()

TABLE: session_reports (relatório pós-sessão — preenchido pelo mentor)
  id uuid PK DEFAULT gen_random_uuid()
  booking_id uuid REFERENCES bookings(id) UNIQUE
  mentor_id uuid REFERENCES mentors(id)
  liberty_id uuid REFERENCES profiles(id)
  session_catalog_id uuid REFERENCES sessions_catalog(id)
  summary text NOT NULL (resumo da sessão)
  action_plan text NOT NULL (plano de ação definido)
  goals_defined text NOT NULL (metas estabelecidas)
  tools_used text (ferramentas aplicadas)
  next_steps text (próximos passos sugeridos)
  mentor_impressions text (impressões do mentor — visível apenas para mentores e admins, NÃO para o liberty)
  is_completed boolean DEFAULT false
  completed_at timestamptz
  created_at timestamptz DEFAULT now()
  updated_at timestamptz DEFAULT now()

TABLE: liberty_journey (progresso da jornada de cada liberty)
  id uuid PK DEFAULT gen_random_uuid()
  liberty_id uuid REFERENCES profiles(id)
  session_catalog_id uuid REFERENCES sessions_catalog(id)
  booking_id uuid REFERENCES bookings(id)
  status text DEFAULT 'pending' CHECK IN ('pending','scheduled','completed','skipped')
  completed_at timestamptz
  UNIQUE(liberty_id, session_catalog_id) — cada sessão só pode aparecer 1 vez por liberty

TABLE: content_library (biblioteca de conteúdos)
  id uuid PK DEFAULT gen_random_uuid()
  title text NOT NULL
  description text
  type text CHECK IN ('video','pdf','presentation','tool','checklist','template')
  url text
  pillar text CHECK IN ('negocios','emocional','mentalidade','espiritual')
  session_catalog_id uuid REFERENCES sessions_catalog(id)
  phase integer (fase da jornada que libera)
  is_public boolean DEFAULT false
  created_at timestamptz DEFAULT now()

TABLE: notifications
  id uuid PK DEFAULT gen_random_uuid()
  user_id uuid REFERENCES profiles(id)
  title text NOT NULL
  message text NOT NULL
  type text CHECK IN ('session','reminder','system','content','alert')
  is_read boolean DEFAULT false
  action_url text
  created_at timestamptz DEFAULT now()

TABLE: cs_requests (solicitações para a CS Mariana)
  id uuid PK DEFAULT gen_random_uuid()
  liberty_id uuid REFERENCES profiles(id)
  subject text
  message text
  status text DEFAULT 'open' CHECK IN ('open','in_progress','resolved')
  created_at timestamptz DEFAULT now()

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERFIS E CONTROLE DE ACESSO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ROLE: liberty
- Acessa: dashboard, minha jornada, agenda (agendamento), conteúdos, ferramentas, perfil, comunidade
- NÃO vê: impressões do mentor, dados financeiros, painel admin
- PODE: agendar sessões, cancelar/remarcar, ver histórico próprio, acionar CS

ROLE: mentor
- Acessa: dashboard próprio, agenda (suas sessões), disponibilidade, membros atendidos, relatórios de suas sessões, impressões de outros mentores (lê), histórico dos libertys que atende
- PODE: preencher disponibilidade, preencher relatório pós-sessão, ver histórico completo do liberty (exceto impressões de outros mentores que são restritas ao admin... NA VERDADE impressões visíveis para TODOS os mentores)
- NÃO vê: dados financeiros detalhados, painel admin completo

ROLE: admin
- Acessa: tudo, incluindo painel administrativo completo, financeiro, todos os relatórios, impressões dos mentores
- PODE: cadastrar/editar/remover qualquer usuário, gerenciar sessões, ver agenda completa, gerar relatórios financeiros, cancelar/remarcar sessões

ROLE: gestor
- Acessa: visão macro, dashboards estratégicos, relatórios gerais
- NÃO gerencia operação diretamente, apenas visualiza

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROTAS DO APP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PUBLIC:
/login
/cadastro
/esqueci-senha

LIBERTY:
/dashboard
/jornada
/agenda
/agenda/agendar
/agenda/agendar/:session_id
/conteudos
/ferramentas
/comunidade
/perfil
/suporte

MENTOR:
/mentor/dashboard
/mentor/disponibilidade
/mentor/sessoes
/mentor/sessoes/:booking_id
/mentor/sessoes/:booking_id/relatorio
/mentor/membros
/mentor/membros/:liberty_id
/mentor/perfil

ADMIN:
/admin/dashboard
/admin/membros
/admin/membros/:id
/admin/mentores
/admin/mentores/:id
/admin/agenda
/admin/sessoes
/admin/sessoes/:catalog_id
/admin/relatorios
/admin/financeiro
/admin/conteudos
/admin/configuracoes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPLASH SCREEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Fundo #0a0a08
- Leão Begin SVG watermark gigante, opacity 0.04
- Centro: ícone Begin (80px) + "BEGIN" + "by LIBERTY"
- Linha prata animada preenchendo da esquerda (1.4s)
- Fade-out após 2.5s

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TELA: LOGIN (/login)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Fullscreen, fundo #0a0a08, leão watermark opacity 0.04

COLUNA ESQUERDA (60% desktop):
- Logo Begin grande centralizado
- Headline Cormorant Garamond 52px: "Sua jornada começa aqui."
- Subtítulo DM Sans 300: "Desenvolvimento empresarial com propósito."
- 4 bullets: ✦ 12 sessões de mentoria · ✦ Mentores especialistas · ✦ Sua jornada acompanhada · ✦ Crescimento com método

COLUNA DIREITA (40% desktop):
- Card #111110, border prata sutil, padding 40px
- Título: "Acessar plataforma" DM Sans 500 20px
- Linha decorativa prata 32px
- Campo email, campo senha (toggle ver)
- Botão "ENTRAR" prata pill, fullwidth
- Link "Esqueci minha senha"
- Rodapé: "Dúvidas? Fale com a Mariana" → abre WhatsApp

Mobile: 1 coluna, apenas o formulário com logo no topo

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAYOUT PRINCIPAL (após login)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SIDEBAR FIXA (240px, desktop):
- Background #0d0d0b, border-right prata sutil
- Logo Begin no topo
- Menu conforme role do usuário
- Item ativo: bg prata soft, border-left 2px prata, texto prata
- Rodapé: avatar + nome + "Sair"

LIBERTY MENU:
- 🏠 Início
- 🗺️ Minha Jornada
- 📅 Agenda
- 📚 Conteúdos
- 🛠️ Ferramentas
- 👥 Comunidade
- 🔔 Avisos
- 👤 Perfil
- 💬 Suporte (CS)

MENTOR MENU:
- 🏠 Início
- 📅 Minha Agenda
- 🕐 Disponibilidade
- 👥 Meus Membros
- 📋 Relatórios
- 👤 Perfil

ADMIN MENU:
- 📊 Dashboard
- 👥 Membros
- 🎓 Mentores
- 📅 Agenda Geral
- 📋 Sessões
- 📈 Relatórios
- 💰 Financeiro
- 📚 Conteúdos
- ⚙️ Configurações

MOBILE: Bottom navigation bar com 5 ícones principais por role

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DASHBOARD DO LIBERTY (/dashboard)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HEADER:
- "Olá, [Nome] 👋" Cormorant Garamond 300 40px
- "Continue sua jornada." DM Sans 300 muted

PROGRESS CARD (hero):
- Barra de progresso prata: X/12 sessões concluídas
- "Você está na sessão [N] de 12"
- Porcentagem grande: "33% concluído"
- "Próxima sessão: [nome]" com botão "Agendar →"

GRID 3 CARDS:
- Próxima sessão agendada: data, hora, mentor, link Zoom
- Última sessão: nome, data, "Ver resumo →"
- Conteúdo recomendado: título + tipo + "Acessar →"

PRÓXIMOS COMPROMISSOS:
- Lista das sessões agendadas (até 3)
- Cada item: data, horário, mentor, sessão, badge status, botão Zoom

AVISOS RECENTES:
- Feed de notificações não lidas
- Cada item: ícone tipo + título + "há X tempo"

BOTÃO FLUTUANTE "PRECISA DE AJUDA?":
- Canto inferior direito
- Abre modal: "Falar com a Mariana" → link WhatsApp: wa.me/[número_mariana]
- Ícone de headset prata

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MINHA JORNADA (/jornada)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VISÃO GERAL (topo):
- "Jornada Liberty Begin — 12 sessões · 6 meses"
- Barra de progresso visual com 12 nós
- Nós coloridos: verde (realizada) · prata (agendada) · cinza (pendente)

GRID DAS 12 SESSÕES (3 colunas):
Para cada sessão, card com:
- Número da sessão (1-12) grande prata
- Nome da sessão
- Pilar: badge colorido (Negócios/Emocional/Mentalidade/Espiritual)
- Status badge: REALIZADA (verde) | AGENDADA (azul) | PENDENTE (cinza)
- Mentor que realizou (se concluída)
- Data de realização (se concluída)
- Botão "Agendar" se pendente
- Botão "Ver resumo" se realizada (mostra resumo + plano de ação, mas NÃO as impressões do mentor)

REGRA NEGÓCIO:
- Uma sessão só aparece como disponível para agendar se ainda não foi realizada por aquele liberty
- Nunca pode repetir sessão
- O botão "Ver resumo" mostra apenas: resumo da sessão + plano de ação + metas + ferramentas
- NÃO mostra: mentor_impressions (restrito a mentores e admins)

OS 4 PILARES (seção visual):
Cards dos 4 pilares com ícone + nome + sessões vinculadas
Negócios · Emocional · Mentalidade · Espiritual

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AGENDAMENTO (/agenda/agendar)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FLUXO EM STEPS (wizard de 4 etapas):

STEP 1 — "Qual sessão você quer agendar?"
- Grid das sessões ainda não realizadas
- Cada card: nome da sessão, pilar, duração (90min), mentores disponíveis
- Sessões já realizadas: bloqueadas com badge "Concluída ✓"
- Ao selecionar: avança para step 2

STEP 2 — "Escolha o mentor"
- Mostra apenas mentores habilitados para a sessão selecionada
- Card de cada mentor: foto, nome, especialidades, próxima disponibilidade
- "Ver agenda" expande calendário de disponibilidades do mentor

STEP 3 — "Escolha o horário"
- Calendário visual do mentor selecionado
- Dias com disponibilidade destacados em prata
- Ao clicar no dia: mostra os horários disponíveis daquele dia como chips
- Horários ocupados: desabilitados/cinza
- Ao selecionar horário: preview do agendamento

STEP 4 — "Confirmar agendamento"
- Resumo completo: sessão + mentor + data + horário + duração
- Campo opcional: "Observações para o mentor" (textarea)
- Informação: "Você receberá o link do Zoom por email e no Google Agenda"
- Checkbox: "Confirmo que estarei disponível neste horário"
- Botão "CONFIRMAR AGENDAMENTO"

APÓS CONFIRMAR:
1. Marcar mentor_availability.is_booked = true
2. Criar booking na tabela
3. Chamar Zoom API → criar meeting → salvar zoom_join_url e zoom_start_url
4. Chamar Google Calendar API:
   - Criar evento na agenda do mentor com zoom_join_url
   - Criar evento na agenda do liberty com zoom_join_url
5. Atualizar liberty_journey status para 'scheduled'
6. Enviar notificação para o mentor
7. Tela de sucesso: "Sessão agendada com sucesso! ✦"
   - Card com todos os detalhes
   - Botão "Adicionar ao Google Agenda" (link direto)
   - Botão "Ver minha jornada"

REGRAS:
- Liberty só pode ter 2 sessões agendadas por mês
- Mesmo liberty não pode ter 2 sessões no mesmo dia
- Aviso se tentar agendar próximo de uma sessão já marcada

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DASHBOARD DO MENTOR (/mentor/dashboard)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MÉTRICAS DO MÊS (cards topo):
- Sessões realizadas no mês (com relatório preenchido)
- Sessões agendadas (futuras)
- Sessões pendentes de relatório ⚠️ (alerta visual)
- Membros atendidos no mês

ALERTA DE RELATÓRIOS PENDENTES:
Se houver sessões sem relatório preenchido:
- Banner amarelo proeminente: "⚠️ Você tem X sessões sem relatório. Preencha para contabilizar."
- Lista das sessões pendentes com botão "Preencher relatório →"

AGENDA DA SEMANA:
- Visualização semanal das sessões agendadas
- Cada bloco: nome do liberty, sessão, horário, link Zoom

PRÓXIMAS SESSÕES (lista):
- Cada item: liberty (avatar + nome), sessão, data/hora, botão "Acessar Zoom"
- Click no item: abre perfil completo do liberty com histórico

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DISPONIBILIDADE DO MENTOR (/mentor/disponibilidade)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CALENDÁRIO INTERATIVO:
- Visualização mensal com seleção de datas
- Click no dia: abre painel lateral com horários
- Em cada dia: adicionar slots de horário (início + fim)
- Opção de recorrência: Não recorre / Semanal / Quinzenal
- Data de validade da recorrência
- Observações por slot
- Cor dos dias: verde = tem disponibilidade | azul = tem sessão agendada | cinza = sem nada

LISTA DE DISPONIBILIDADES:
- Tabela com: data, horário, status (disponível/ocupado), observações
- Botão editar/remover por linha
- Filtro por mês

FORMULÁRIO DE ADIÇÃO RÁPIDA:
- Data(s) — pode selecionar múltiplas datas de uma vez
- Horário início + fim
- Recorrência
- Validade
- Observações
- Botão "Salvar disponibilidade"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSÃO + RELATÓRIO DO MENTOR (/mentor/sessoes/:id/relatorio)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Esta é uma das telas mais importantes do sistema.

ANTES DE PREENCHER:
- Mostra dados do liberty: foto, nome, empresa, segmento, cidade
- Histórico de sessões anteriores do liberty:
  · Nome de cada sessão realizada
  · Mentor que realizou
  · Data
  · Resumo (expandível)
  · Plano de ação anterior
- Impressões de outros mentores sobre este liberty (todos os mentores podem ler)
- Observações que o liberty deixou antes desta sessão

FORMULÁRIO DE RELATÓRIO (obrigatório para contar a sessão):
- "Resumo da Sessão" — textarea grande, obrigatório, mín 100 chars
- "Plano de Ação Definido" — textarea, obrigatório
- "Metas Estabelecidas ou Revisadas" — textarea, obrigatório
- "Ferramentas Aplicadas" — textarea, opcional
- "Próximos Passos Sugeridos" — textarea, opcional
- "Minhas Impressões" — textarea especial com aviso:
  ⚠️ "Esta seção é visível apenas para mentores e administradores, não para o membro."
  — percepções estratégicas, dificuldades percebidas, potencial identificado, pontos de atenção

VALIDAÇÃO:
- Botão "SALVAR RELATÓRIO" só ativa quando os 3 campos obrigatórios preenchidos
- Ao salvar:
  · session_reports.is_completed = true
  · bookings.status = 'completed'
  · liberty_journey.status = 'completed'
  · Notificação para admin: "Sessão [nome] concluída — [Mentor] com [Liberty]"
  · Notificação para liberty: "Sua sessão foi concluída! ✦ Acesse para ver o resumo."

ESTADO BLOQUEADO (se já preenchido):
- Mostrar relatório em modo leitura
- Botão "Editar" disponível apenas dentro de 24h após preenchimento

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERFIL DO LIBERTY (visão do mentor) (/mentor/membros/:id)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HEADER:
- Foto circular grande, nome, empresa, segmento, cidade
- Badge: "Sessão X/12 concluída"
- Barra de progresso da jornada

ABAS:
1. "Sobre" — empresa, segmento, metas, redes sociais
2. "Jornada" — todas as 12 sessões com status, mentor, data
3. "Histórico de Sessões" — relatórios de sessões anteriores
   - Resumo + plano de ação + metas + ferramentas (VISÍVEL para mentor)
   - Impressões do mentor que escreveu (VISÍVEL para todos os mentores)
4. "Observações" — notas rápidas da equipe

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AGENDA GERAL ADMIN (/admin/agenda)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Inspiração: visualização operacional estilo SimplyBook

HEADER:
- Seletores: Dia / Semana / Mês
- Filtros: por mentor | por liberty | por sessão | por status
- Botão "+ Agendar sessão" (admin agenda manualmente)
- Data navigation: < Hoje >

VISUALIZAÇÃO DIA (principal):
- Grade vertical com horários (08:00 às 20:00, intervalos 30min)
- COLUNAS: uma coluna por mentor com sessões agendadas
- Cada bloco de sessão:
  ┌─────────────────────┐
  │ 14:00 – 15:30       │
  │ [Avatar] João Silva │
  │ Cultura Org.        │
  │ ● AGENDADA         │
  │ [Zoom] [Editar]     │
  └─────────────────────┘
- Cores dos blocos por status: azul (agendada) · verde (realizada) · amarelo (remarcada) · vermelho (cancelada)
- Horários disponíveis dos mentores: fundo levemente verde (slots abertos)
- Horários sem nada: fundo padrão escuro

VISUALIZAÇÃO SEMANA:
- 7 colunas (dias) × N linhas (horários)
- Blocos menores mas com info essencial

VISUALIZAÇÃO MÊS:
- Calendário tradicional
- Pontos coloridos por mentor
- Click no dia: abre modal com detalhes

AÇÕES EM CADA SESSÃO (menu dropdown):
- Ver detalhes
- Editar agendamento
- Remarcar → abre modal com calendário
- Cancelar → motivo obrigatório
- Ver relatório (se concluída)
- Abrir Zoom

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PLANILHA OPERACIONAL ADMIN (/admin/membros)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tabela dinâmica substituindo a planilha manual atual.

FILTROS:
- Por membro | por sessão | por mentor | por status | por mês | por turma

COLUNAS DA TABELA:
Nome | Empresa | Sessão | Mentor | Status | Data Agendada | Data Realizada | Próxima Sessão | Obs | Progresso

Cada linha editável inline:
- Status: dropdown colorido
- Data: date picker
- Obs: click para editar

LEGENDA DE STATUS:
🔘 Não agendada  🔵 Agendada  🟢 Realizada  🟡 Remarcada  🔴 Cancelada

BOTÕES DE AÇÃO:
- "Exportar CSV" — exporta todos os dados filtrados
- "Exportar PDF" — relatório formatado
- "+ Adicionar membro" — abre formulário de cadastro

VIEW INDIVIDUAL DO MEMBRO:
- Clique no nome abre drawer lateral com:
  · Info completa do liberty
  · Linha do tempo da jornada (visual)
  · Histórico de todas as sessões com relatórios
  · Próximo passo sugerido

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RELATÓRIO FINANCEIRO (/admin/financeiro)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELETOR DE MÊS: < Fevereiro 2025 >

CARDS DE RESUMO:
- Total de sessões realizadas no mês (com relatório preenchido)
- Quantidade de mentores ativos
- Total estimado a pagar (soma de all mentor_rate × sessions)
- Sessões sem relatório (pendentes — não contabilizadas)

TABELA POR MENTOR:
Nome | Sessões que realiza | Qtd sessões no mês | Datas | Membros atendidos | Valor por sessão | Total do mês

DETALHAMENTO POR MENTOR (expansível):
- Lista de cada sessão: liberty atendido + data + sessão + status relatório + valor

ALERTAS:
- Mentores com sessões sem relatório preenchido: badge amarelo + lista
- "Estas sessões NÃO foram contabilizadas pois o relatório não foi preenchido."

AÇÕES:
- "Exportar relatório mensal" → PDF formatado para o financeiro
- "Marcar mês como fechado" → bloqueia edições retroativas

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTEGRAÇÕES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

── ZOOM API ──
Usar Zoom Server-to-Server OAuth (sem precisar de login do usuário).

Ao confirmar agendamento, chamar:
POST https://api.zoom.us/v2/users/{userId}/meetings
Body:
{
  "topic": "[Nome da Sessão] — [Nome Liberty] com [Nome Mentor]",
  "type": 2,
  "start_time": "[ISO 8601 datetime]",
  "duration": 90,
  "timezone": "America/Sao_Paulo",
  "agenda": "Sessão de mentoria Liberty Begin",
  "settings": {
    "join_before_host": false,
    "waiting_room": true,
    "auto_recording": "none"
  }
}

Salvar na booking: zoom_meeting_id, zoom_join_url, zoom_start_url
Exibir zoom_join_url para o liberty e zoom_start_url para o mentor.

Credenciais via .env:
VITE_ZOOM_ACCOUNT_ID=
VITE_ZOOM_CLIENT_ID=
VITE_ZOOM_CLIENT_SECRET=
(token gerado via Client Credentials no backend/Edge Function Supabase)

── GOOGLE CALENDAR API ──
OAuth2 por usuário (mentor e liberty conectam suas contas Google).

Botão "Conectar Google Agenda" no perfil de cada usuário.
Após OAuth: salvar refresh_token no profile (criptografado).

Ao confirmar agendamento:
1. Criar evento na agenda do MENTOR:
   POST https://www.googleapis.com/calendar/v3/calendars/primary/events
   {
     summary: "[Sessão] com [Liberty]",
     description: "Sessão Liberty Begin\nMembro: [nome]\nAcessar Zoom: [url]",
     start: { dateTime, timeZone: "America/Sao_Paulo" },
     end: { dateTime, timeZone: "America/Sao_Paulo" },
     conferenceData: { createRequest: { requestId: uuid, conferenceSolutionKey: { type: "hangoutsMeet" }}},
     reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 30 }, { method: "email", minutes: 60 }]}
   }

2. Criar evento na agenda do LIBERTY com mesmos dados.

Salvar google_event_id em cada booking para poder editar/cancelar depois.

Se usuário não tiver Google conectado: gerar link "Adicionar ao Google Agenda" manual
https://calendar.google.com/calendar/render?action=TEMPLATE&text=...&dates=...&details=...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ONBOARDING DO NOVO LIBERTY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Quando um liberty faz login pela primeira vez (onboarding_completed = false):

STEP 1 — Boas-vindas:
- Animação do leão Begin
- "Bem-vindo ao Liberty Begin, [Nome]!"
- "Sua jornada de desenvolvimento começa agora."
- Botão "Começar →"

STEP 2 — O Programa:
- "O Liberty Begin tem duração de 6 meses"
- "São 12 sessões individuais com mentores especialistas"
- "2 sessões por mês, cada uma com 1h30"
- Cards visuais dos 4 pilares: Negócios · Emocional · Mentalidade · Espiritual

STEP 3 — As 12 Sessões (preview visual):
- Grid com as 12 sessões desbloqueadas uma por uma com animação
- Nome + pilar de cada sessão

STEP 4 — Regras e Compromissos:
- "Seus compromissos para aproveitar ao máximo:"
- ✦ Presença ativa em todas as sessões
- ✦ Aplicar o conteúdo entre as sessões
- ✦ Presença de pelo menos um sócio é essencial
- Checkbox: "Confirmo meu comprometimento com a jornada"

STEP 5 — Complete seu perfil:
- Nome da empresa, segmento, cidade, foto, LinkedIn
- Botão "Concluir e Acessar"

Após completar: onboarding_completed = true, redirecionar para /dashboard

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUPORTE / CS (/suporte)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tela simples com:
- Foto da Mariana (CS) + "Olá! Sou a Mariana, sua consultora de sucesso."
- "Estou aqui para ajudar com dúvidas sobre agendamento, acesso e direcionamento."
- Botão grande: "💬 Falar com a Mariana no WhatsApp" → wa.me/[NUMERO_MARIANA]
- Horário de atendimento: Seg-Sex 9h-18h
- Perguntas frequentes (accordion):
  · Como faço para agendar uma sessão?
  · Posso remarcar uma sessão?
  · Com que frequência devo agendar?
  · O que acontece se eu perder uma sessão?
  · Como acesso o Zoom?

Botão flutuante na home também abre diretamente o WhatsApp da Mariana.

NÚMERO DA MARIANA: configurável via admin em /admin/configuracoes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEÚDOS (/conteudos)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILTROS (tabs + chips):
- Por pilar: Negócios | Emocional | Mentalidade | Espiritual
- Por tipo: Vídeo | PDF | Ferramenta | Checklist | Template
- Por sessão relacionada

GRID DE CARDS:
- Thumbnail/ícone por tipo
- Título, descrição curta, pilar badge, tipo badge
- Conteúdos bloqueados (fases futuras): cadeado + "Disponível após sessão X"
- Click: abre em modal ou nova aba

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AS 12 SESSÕES — SEED DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Inserir no catalog com order_index:
1.  Vendas              · Negócios    · Djeniffer
2.  Mapa do Negócio     · Negócios    · Richard Costa, Rubens Júnior
3.  Financeiro 1        · Negócios    · Richard Costa
4.  Financeiro 2        · Negócios    · Morgana Costa
5.  Cultura Org.        · Mentalidade · Lucas Garcez, Samuel Castilho
6.  SWOT Inovações      · Negócios    · Lucas Garcez
7.  Organograma         · Negócios    · Lucas Garcez, Morgana, Samuel
8.  Marketing de Tração · Negócios    · Lucas Garcez, Matheus Cardoso
9.  Equipe Autoger.     · Negócios    · Lucas Garcez, Patrícia Zordenunes
10. Gestão de Processos · Negócios    · Rinaldo Alves, Rubens Júnior
11. Branding Book       · Negócios    · Matheus Cardoso
12. Liderança           · Mentalidade · Djeniffer, Samuel Castilho

MENTORES SEED:
- Lucas Garcez
- Morgana Costa
- Richard Costa
- Rinaldo Alves
- Rubens Júnior
- Matheus Cardoso
- Djeniffer
- Patrícia Zordenunes
- Samuel Castilho

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NOTIFICAÇÕES EM TEMPO REAL (Supabase Realtime)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Para LIBERTY:
- "Sua sessão [nome] foi confirmada! ✦" → após agendamento
- "Sua sessão com [mentor] é em 24h. Link: [Zoom]"
- "Sua sessão foi concluída. Veja o resumo →"
- "Novo conteúdo disponível: [título]"
- "Lembrete: você tem X sessões disponíveis para agendar"

Para MENTOR:
- "Nova sessão agendada: [liberty] · [data/hora]"
- "Lembrete: sessão com [liberty] em 1h"
- "⚠️ Você tem [X] relatórios pendentes"
- "Nova mensagem da equipe"

Para ADMIN:
- "Nova sessão agendada: [liberty] com [mentor]"
- "Sessão concluída: relatório preenchido por [mentor]"
- "⚠️ Sessão realizada sem relatório há +48h: [mentor]/[liberty]"
- "Novo membro cadastrado: [nome]"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANIMAÇÕES E UX POLISH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Splash screen com barra prata animada
- Transições de página: fade + translateY suave
- Cards de sessão na jornada: aparecem em stagger (cascade)
- Barra de progresso da jornada: anima ao entrar na viewport
- Status de sessão: pill com cor que pulsa levemente (agendada)
- Hover nos cards: translateY(-2px) + shadow prata
- Botão de confirmar agendamento: pulse por 1s após click
- Notificações: slide-in da direita
- Modal de relatório: slide-up do fundo
- Leão watermark: presente em todas as telas de fundo

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MOBILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Bottom navigation bar: 5 ícones conforme role
- Agenda: scroll horizontal por mentor no mobile
- Wizard de agendamento: fullscreen step por step
- Relatório do mentor: scroll longo em coluna única
- Botão Zoom: grande e destacado, fácil de tocar

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VARIÁVEIS DE AMBIENTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_ZOOM_ACCOUNT_ID=
VITE_ZOOM_CLIENT_ID=
VITE_ZOOM_CLIENT_SECRET=
VITE_GOOGLE_CLIENT_ID=
VITE_GOOGLE_CLIENT_SECRET=
VITE_MARIANA_WHATSAPP=5511999999999
VITE_APP_URL=https://begin.libertybegin.com.br

Construa a plataforma completa agora. Ordem:
1. Supabase schema + seed data
2. Auth + perfis + proteção de rotas
3. Splash + Login + Onboarding
4. Dashboard Liberty + Jornada
5. Fluxo de agendamento completo (Zoom + Google)
6. Dashboard Mentor + Disponibilidade + Relatório
7. Agenda Geral Admin + Planilha Operacional
8. Relatório Financeiro
9. Conteúdos + Ferramentas + Suporte CS

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://libertybegin.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2fd69dec-3955-484f-b035-bb16e448ebca).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
