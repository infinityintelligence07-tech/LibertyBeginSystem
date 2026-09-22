/**
 * Generates in-memory demo content for the *current* logged-in user
 * so admins toggling "Dados fictícios" can preview Mentor / Member views
 * fully populated without touching the database.
 *
 * IMPORTANTE: os dados fictícios usam SEMPRE as sessões REAIS da plataforma
 * (mesmos ids, nomes, capas e ordem da jornada) e tarefas coerentes com
 * o conteúdo de cada sessão. Apenas as pessoas (alunos/mentores) são fictícias.
 */
import { addDays, format } from "date-fns";

export const isDemoOn = () =>
  typeof window !== "undefined" && localStorage.getItem("lb_demo_data") === "1";

const d = (offset: number) => format(addDays(new Date(), offset), "yyyy-MM-dd");

export interface DemoBookingRow {
  id: string;
  liberty_id: string;
  mentor_id: string;
  session_id: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: string;
  zoom_join_url: string | null;
  guest_name: string | null;
  __demo__: true;
}

export interface DemoTaskRow {
  id: string;
  booking_id: string;
  description: string;
  is_completed: boolean;
  created_at: string;
  completed_at: string | null;
  result_value: string | null;
  result_type: "quantitative" | "qualitative" | null;
  result_metric: string | null;
  __demo__: true;
}

export interface DemoReportRow {
  id: string;
  booking_id: string;
  summary?: string;
  action_plan?: string;
  goals?: string;
  next_steps?: string;
  delivered?: string;
  created_at?: string;
  __demo__: true;
}


const fakeMentorIds = ["demo-mentor-1", "demo-mentor-2"];
const fakeMemberIds = ["demo-m-1", "demo-m-2", "demo-m-3", "demo-m-4"];

const CDN = "https://wyoidjjalbycimqpqzao.supabase.co/storage/v1/object/public/session-covers";

/** Catálogo REAL da jornada Begin (ids, nomes, capas e ordem do banco). */
export const demoSessionsCatalog = [
  { id: "0c66bfa4-8ba9-4cb0-a6de-9b412a699654", name: "Mapeamento do Negócio", order: 1, duration: 180, cover_image_url: `${CDN}/kickoff/mapeamento-do-negocio-v2.jpg` },
  { id: "f3461844-1828-4a81-91d9-748fea629dd3", name: "Cultura Organizacional", order: 2, duration: 90, cover_image_url: `${CDN}/v2/cultura-organizacional.png` },
  { id: "60ceadd4-7060-492c-ab44-bd3e426a6501", name: "Organograma", order: 3, duration: 90, cover_image_url: `${CDN}/v2/organograma.png` },
  { id: "6dd0f9c0-c6f5-48ca-a27e-a744daca37af", name: "Tecnologia", order: 4, duration: 90, cover_image_url: `${CDN}/v2/swot-inovacoes.png` },
  { id: "3f253459-2f59-4493-ab32-42e438848b00", name: "Financeiro 1", order: 5, duration: 90, cover_image_url: `${CDN}/v2/financeiro-1.png` },
  { id: "ac3b942e-07f2-45b0-aa5e-c722118acd94", name: "Financeiro 2", order: 6, duration: 90, cover_image_url: `${CDN}/v2/financeiro-2.png` },
  { id: "334f769f-d6a3-4346-a60e-9cb9c8838d83", name: "Gestão de Processos", order: 7, duration: 90, cover_image_url: `${CDN}/v2/processos.png` },
  { id: "44dfe503-d8b6-46f3-8651-cea423770366", name: "Marketing de Tração", order: 8, duration: 90, cover_image_url: `${CDN}/v2/marketing-tracao.png` },
  { id: "42123376-d1f1-4f01-8870-2f42abc2efc2", name: "Branding Book", order: 9, duration: 90, cover_image_url: `${CDN}/v2/branding.png` },
  { id: "9e4a7e01-d38e-47dc-ae01-aaed21a4f36b", name: "Vendas", order: 10, duration: 90, cover_image_url: `${CDN}/v2/vendas.png` },
  { id: "0b51b774-9ef0-459f-80e4-1f0515836ea9", name: "Liderança", order: 11, duration: 90, cover_image_url: `${CDN}/v2/lideranca.png` },
  { id: "18f5ddee-34c5-4d88-b852-43f573a92447", name: "Equipe Autogerenciável", order: 12, duration: 90, cover_image_url: `${CDN}/v2/autogerenciavel.png` },
];

/** Junta o catálogo real do banco com o de demo sem duplicar sessões. */
export const mergeDemoSessions = <T extends { id: string }>(real: T[]): T[] => {
  const ids = new Set(real.map((s) => s.id));
  const extras = demoSessionsCatalog.filter((s) => !ids.has(s.id)) as unknown as T[];
  return [...real, ...extras];
};

const SESSION_BY_ID = Object.fromEntries(demoSessionsCatalog.map((s) => [s.id, s]));
const SESSION_IDS = demoSessionsCatalog.map((s) => s.id);

/** Tarefas coerentes com o conteúdo real de cada sessão. */
const TASKS_BY_SESSION: Record<string, { desc: string; metric?: string; result?: string }[]> = {
  "0c66bfa4-8ba9-4cb0-a6de-9b412a699654": [
    { desc: "Preencher o diagnóstico dos 8 pilares com os números reais do negócio", metric: "Pilares mapeados", result: "8 de 8 pilares preenchidos" },
    { desc: "Definir a visão de onde a empresa quer chegar em 12 meses" },
    { desc: "Listar os 3 principais gargalos apontados no radar" },
  ],
  "f3461844-1828-4a81-91d9-748fea629dd3": [
    { desc: "Escrever missão, visão e valores em uma página", metric: "Documento de cultura", result: "Documento aprovado pela equipe" },
    { desc: "Apresentar os valores em reunião com o time" },
    { desc: "Definir 3 comportamentos esperados para cada valor" },
  ],
  "60ceadd4-7060-492c-ab44-bd3e426a6501": [
    { desc: "Desenhar o organograma atual da empresa", metric: "Cargos mapeados", result: "11 cargos descritos" },
    { desc: "Identificar funções acumuladas pelo dono" },
    { desc: "Definir o organograma ideal para os próximos 12 meses" },
  ],
  "6dd0f9c0-c6f5-48ca-a27e-a744daca37af": [
    { desc: "Concluir a matriz SWOT com o time de liderança", metric: "Ações priorizadas", result: "8 ações priorizadas" },
    { desc: "Escolher 2 inovações para testar no trimestre" },
    { desc: "Definir responsável e prazo para cada ação da SWOT" },
  ],
  "3f253459-2f59-4493-ab32-42e438848b00": [
    { desc: "Separar as contas pessoais das contas da empresa", metric: "Contas separadas", result: "Pró-labore definido em R$ 8.000" },
    { desc: "Montar o fluxo de caixa das últimas 12 semanas" },
    { desc: "Levantar todos os custos fixos mensais" },
  ],
  "ac3b942e-07f2-45b0-aa5e-c722118acd94": [
    { desc: "Montar o DRE do último trimestre", metric: "Margem de lucro", result: "Margem subiu de 9% para 14%" },
    { desc: "Calcular o ponto de equilíbrio mensal" },
    { desc: "Revisar preço de venda dos 5 produtos principais" },
  ],
  "334f769f-d6a3-4346-a60e-9cb9c8838d83": [
    { desc: "Mapear o processo comercial do início ao fim", metric: "Processos documentados", result: "3 processos com POP escrito" },
    { desc: "Criar um POP (procedimento) do atendimento ao cliente" },
    { desc: "Definir indicadores de acompanhamento por processo" },
  ],
  "44dfe503-d8b6-46f3-8651-cea423770366": [
    { desc: "Definir a oferta principal e a promessa de valor", metric: "Leads no mês", result: "Leads passaram de 40 para 96/mês" },
    { desc: "Estruturar o calendário de conteúdo do mês" },
    { desc: "Testar 2 canais de aquisição e medir o resultado" },
  ],
  "42123376-d1f1-4f01-8870-2f42abc2efc2": [
    { desc: "Consolidar o Branding Book (logo, cores e tom de voz)", metric: "Branding Book", result: "Manual da marca finalizado" },
    { desc: "Padronizar as artes das redes sociais com a nova identidade" },
    { desc: "Revisar a bio e o posicionamento no Instagram" },
  ],
  "9e4a7e01-d38e-47dc-ae01-aaed21a4f36b": [
    { desc: "Estruturar o funil de vendas com etapas e metas", metric: "Taxa de conversão", result: "Conversão de 18% para 27%" },
    { desc: "Criar o script de abordagem comercial", },
    { desc: "Definir a meta de vendas individual do time" },
  ],
  "0b51b774-9ef0-459f-80e4-1f0515836ea9": [
    { desc: "Fazer 1:1 com cada liderado da equipe", metric: "Reuniões 1:1", result: "6 conversas 1:1 realizadas" },
    { desc: "Definir o ritual de reunião semanal de liderança" },
    { desc: "Delegar 2 tarefas que hoje são só do dono" },
  ],
  "18f5ddee-34c5-4d88-b852-43f573a92447": [
    { desc: "Definir os indicadores de cada área para autogestão", metric: "Horas do dono na operação", result: "De 44h para 22h semanais na operação" },
    { desc: "Implantar a reunião de resultados mensal com o time" },
    { desc: "Criar o plano de sucessão das funções críticas" },
  ],
};

const genericTasks: { desc: string; metric?: string; result?: string }[] = [
  { desc: "Revisar o plano de ação definido na sessão" },
  { desc: "Registrar os resultados da semana na plataforma" },
];

/** Bookings the current MENTOR user has (as mentor). */
export const demoBookingsForMentor = (mentorUserProfileId: string): DemoBookingRow[] => {
  const ids = [...fakeMemberIds];
  const endOf = (sessionId: string, start: string) => {
    const dur = SESSION_BY_ID[sessionId]?.duration ?? 90;
    const [h, m] = start.split(":").map(Number);
    const total = h * 60 + m + dur;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00`;
  };
  const mk = (
    id: string,
    memberIdx: number,
    sessionId: string,
    dateOffset: number,
    start: string,
    status: string,
    zoom = false,
  ): DemoBookingRow => ({
    id,
    liberty_id: ids[memberIdx % ids.length],
    mentor_id: mentorUserProfileId,
    session_id: sessionId,
    scheduled_date: d(dateOffset),
    start_time: start,
    end_time: endOf(sessionId, start),
    status,
    zoom_join_url: zoom ? "https://zoom.us/j/demo" : null,
    guest_name: null,
    __demo__: true as const,
  });

  return [
    // realizadas (passado) — jornada real, do kickoff em diante
    mk("demo-bk-mt-c-0", 0, SESSION_IDS[0], -10, "09:00:00", "completed"),
    mk("demo-bk-mt-c-1", 1, SESSION_IDS[1], -7, "10:00:00", "completed"),
    mk("demo-bk-mt-c-2", 2, SESSION_IDS[2], -4, "14:00:00", "completed"),
    mk("demo-bk-mt-c-3", 3, SESSION_IDS[3], -2, "16:00:00", "completed"),
    // próximas
    mk("demo-bk-mt-s-0", 0, SESSION_IDS[4], 1, "14:00:00", "scheduled", true),
    mk("demo-bk-mt-s-1", 1, SESSION_IDS[5], 3, "09:00:00", "scheduled", true),
    mk("demo-bk-mt-s-2", 2, SESSION_IDS[6], 6, "15:00:00", "scheduled", true),
    mk("demo-bk-mt-s-3", 3, SESSION_IDS[7], 10, "10:00:00", "scheduled", true),
    // aguardando confirmação do mentor
    mk("demo-bk-mt-pending", 1, SESSION_IDS[9], 2, "19:00:00", "pending_approval"),
    // remarcada pelo aluno
    mk("demo-bk-mt-resc", 2, SESSION_IDS[10], 5, "08:00:00", "rescheduled", true),
    // não realizada (no-show) — dispara ação do admin
    mk("demo-bk-mt-nr", 3, SESSION_IDS[2], -1, "16:00:00", "not_realized"),
  ];
};

/** Bookings the current MEMBER user has (as liberty). */
export const demoBookingsForMember = (libertyProfileId: string): DemoBookingRow[] => {
  const endOf = (sessionId: string, start: string) => {
    const dur = SESSION_BY_ID[sessionId]?.duration ?? 90;
    const [h, m] = start.split(":").map(Number);
    const total = h * 60 + m + dur;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00`;
  };
  const plan: { off: number; start: string; status: string; zoom: boolean }[] = [
    { off: -45, start: "09:00:00", status: "completed", zoom: false },
    { off: -30, start: "10:00:00", status: "completed", zoom: false },
    { off: -18, start: "14:00:00", status: "completed", zoom: false },
    { off: -7, start: "16:00:00", status: "completed", zoom: false },
    { off: 2, start: "10:00:00", status: "scheduled", zoom: true },
    { off: 16, start: "16:00:00", status: "scheduled", zoom: true },
  ];
  return plan.map((p, i) => ({
    id: `demo-bk-mb-${i}`,
    liberty_id: libertyProfileId,
    mentor_id: fakeMentorIds[i % fakeMentorIds.length],
    session_id: SESSION_IDS[i],
    scheduled_date: d(p.off),
    start_time: p.start,
    end_time: endOf(SESSION_IDS[i], p.start),
    status: p.status,
    zoom_join_url: p.zoom ? "https://zoom.us/j/demo" : null,
    guest_name: null,
    __demo__: true as const,
  }));
};

export const demoTasksForBookings = (bookings: DemoBookingRow[]): DemoTaskRow[] => {
  const tasks: DemoTaskRow[] = [];
  bookings.forEach((b) => {
    const isCompleted = b.status === "completed";
    const tpl = TASKS_BY_SESSION[b.session_id] ?? genericTasks;
    const list = isCompleted ? tpl : tpl.slice(0, 2);
    list.forEach((t, i) => {
      const done = isCompleted && i < 2;
      tasks.push({
        id: `demo-task-${b.id}-${i}`,
        booking_id: b.id,
        description: t.desc,
        is_completed: done,
        created_at: new Date().toISOString(),
        completed_at: done ? new Date().toISOString() : null,
        result_value: done && i === 0 && t.result ? t.result : null,
        result_type: done && i === 0 && t.result ? "quantitative" : null,
        result_metric: done && i === 0 && t.metric ? t.metric : null,
        __demo__: true,
      });
    });
  });
  return tasks;
};

/** Relatórios completos (resumo, plano de ação, metas, próximos passos) para as sessões realizadas. */
export const demoReportsForBookings = (bookings: DemoBookingRow[]): DemoReportRow[] =>
  bookings
    .filter((b) => b.status === "completed")
    .map((b) => {
      const s = SESSION_BY_ID[b.session_id];
      const tpl = TASKS_BY_SESSION[b.session_id] ?? genericTasks;
      const name = s?.name ?? "Sessão";
      return {
        id: `demo-rep-${b.id}`,
        booking_id: b.id,
        summary:
          `Na sessão de ${name} revisamos os números do negócio e organizamos as prioridades do período. ` +
          `O aluno trouxe o cenário atual, identificamos os principais gargalos e fechamos um plano de ação objetivo para as próximas duas semanas.`,
        action_plan: tpl.map((t, i) => `${i + 1}. ${t.desc}`).join("\n"),
        goals: `Concluir os itens do plano de ação de ${name} antes da próxima sessão e trazer os números atualizados.`,
        next_steps:
          "Executar o plano de ação, registrar os resultados na plataforma e revisar os indicadores na próxima sessão.",
        delivered: `Ferramenta e material de apoio da sessão ${name}.`,
        created_at: `${b.scheduled_date}T18:00:00.000Z`,
        __demo__: true as const,
      } as DemoReportRow;
    });


export const demoLibertyProfiles = [
  { id: "demo-m-1", full_name: "Ana Beatriz Silva" },
  { id: "demo-m-2", full_name: "Carlos Mendes" },
  { id: "demo-m-3", full_name: "Juliana Pereira" },
  { id: "demo-m-4", full_name: "Rafael Costa" },
];

export const demoMentorProfiles = [
  { id: "demo-mentor-1", full_name: "Ricardo Almeida" },
  { id: "demo-mentor-2", full_name: "Patrícia Souza" },
];

/** Bookings for the admin agenda (uses fake members over real mentors + real sessions). */
export const demoBookingsForAdmin = (realMentorIds: string[]): DemoBookingRow[] => {
  const mentors = realMentorIds.length ? realMentorIds : fakeMentorIds;
  const offsets = [-5, -3, -1, 0, 0, 1, 2, 4, 6, 8];
  return offsets.map((off, i) => {
    const sessionId = SESSION_IDS[i % SESSION_IDS.length];
    const start = ["09:00:00", "10:30:00", "14:00:00", "16:00:00"][i % 4];
    const dur = SESSION_BY_ID[sessionId]?.duration ?? 90;
    const [h, m] = start.split(":").map(Number);
    const total = h * 60 + m + dur;
    return {
      id: `demo-bk-adm-${i}`,
      liberty_id: fakeMemberIds[i % fakeMemberIds.length],
      mentor_id: mentors[i % mentors.length],
      session_id: sessionId,
      scheduled_date: d(off),
      start_time: start,
      end_time: `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00`,
      status: off < 0 ? "completed" : "scheduled",
      zoom_join_url: off < 0 ? null : "https://zoom.us/j/demo",
      guest_name: i === 5 ? "Convidado Externo Demo" : null,
      __demo__: true as const,
    };
  });
};

/** Notificações de exemplo para popular o Banner de Ações do mentor
 *  quando o modo demo está ligado. Cada item cobre um tipo de gatilho real. */
export const demoMentorActionNotifications = () => {
  const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();
  const dm = (off: number) => d(off).slice(8, 10) + "/" + d(off).slice(5, 7);
  return [
    {
      id: "demo-notif-pending",
      type: "booking_pending",
      title: "Nova sessão aguardando sua confirmação",
      message: `Vendas: ${dm(2)} às 19:00 · Carlos Mendes`,
      link: "/mentor/sessoes?tab=pending",
      related_booking_id: "demo-bk-mt-pending",
      created_at: iso(20),
    },
    {
      id: "demo-notif-reminder",
      type: "booking_reminder",
      title: "Lembrete: sessão amanhã",
      message: `Financeiro 1: ${dm(1)} às 14:00 · Ana Beatriz`,
      link: "/mentor/sessoes",
      related_booking_id: "demo-bk-mt-s-0",
      created_at: iso(60),
    },
    {
      id: "demo-notif-report",
      type: "report_pending",
      title: "Preencha o relatório da sessão",
      message: `Tecnologia de ${dm(-2)} aguarda seu relatório.`,
      link: "/mentor/sessoes",
      related_booking_id: "demo-bk-mt-c-3",
      created_at: iso(120),
    },
    {
      id: "demo-notif-resc",
      type: "booking_rescheduled",
      title: "Sessão remarcada",
      message: `Liderança · novo horário: ${dm(5)} às 08:00 · Juliana Pereira`,
      link: "/mentor/sessoes",
      related_booking_id: "demo-bk-mt-resc",
      created_at: iso(240),
    },
  ] as const;
};

/* ============================================================
 * PERFIL / FERRAMENTAS FICTÍCIAS
 * Garantem que nenhuma área fique vazia ou pedindo dados
 * (datas do programa, diagnóstico, ferramentas do aluno).
 * ============================================================ */

/** Preenche campos do perfil que a plataforma precisa para renderizar tudo. */
export const demoProfileFill = <T extends Record<string, any> | null | undefined>(profile: T): T => {
  if (!profile) return profile;
  const p: any = { ...profile };
  p.program_start_date = p.program_start_date || d(-60);
  p.program_end_date = p.program_end_date || d(120);
  p.company_name = p.company_name || "Doceria Doce Ana";
  p.company_segment = p.company_segment || "Alimentação · Confeitaria";
  p.business_age = p.business_age || "6 anos";
  p.employees_count = p.employees_count || "14";
  p.employees_count_num = p.employees_count_num ?? 14;
  p.leaders_count = p.leaders_count ?? 3;
  p.monthly_revenue = p.monthly_revenue || "R$ 180.000";
  p.profit_margin = p.profit_margin || "14%";
  p.city_state = p.city_state || "Campinas / SP";
  p.main_pain = p.main_pain || "Dono ainda no operacional e margem apertada.";
  p.dream_2026 = p.dream_2026 || "Dobrar o faturamento com um time que roda sozinho.";
  p.member_tier = p.member_tier || "begin";
  return p as T;
};

/** Scores do diagnóstico (0–5) por pilar — inicial e final, para comparação. */
export const DEMO_DIAGNOSTIC_SCORES: Record<string, number> = {
  gestao: 2.4, lideranca: 2.0, financeiro: 1.8, marketing: 2.6,
  inovacao: 2.2, vendas: 3.0, processos: 1.6, pessoas: 2.4,
};

export const DEMO_DIAGNOSTIC_SCORES_FINAL: Record<string, number> = {
  gestao: 4.0, lideranca: 3.6, financeiro: 3.8, marketing: 3.8,
  inovacao: 3.2, vendas: 4.2, processos: 3.4, pessoas: 3.8,
};

const DEMO_TEXT_ANSWERS: Record<string, string> = {
  gestao_contexto_cnpj: "CNPJ ativo desde 2019 — 6 anos de operação.",
  gestao_contexto_time: "14 colaboradores, sendo 3 líderes de área.",
  gestao_visao: "Dobrar o faturamento e sair da operação do dia a dia em 6 meses.",
};

/**
 * Respostas fictícias coerentes com os scores: perguntas de escala recebem a
 * letra correspondente ao score do pilar; perguntas de texto recebem contexto real.
 */
export const buildDemoDiagnosticAnswers = (
  pillars: { id: string; questions: { id: string; type: string }[] }[],
  scores: Record<string, number> = DEMO_DIAGNOSTIC_SCORES,
) => {
  const letters = ["A", "B", "C", "D", "E"];
  const answers: Record<string, string> = {};
  pillars.forEach((p) => {
    const idx = Math.max(0, Math.min(4, Math.round((scores[p.id] ?? 3) - 1)));
    p.questions.forEach((q) => {
      if (q.type === "scale") answers[q.id] = letters[idx];
      else answers[q.id] = DEMO_TEXT_ANSWERS[q.id] ?? "Registrado na sessão de Mapeamento do Negócio.";
    });
  });
  return answers;
};

/** Aplicação do diagnóstico (ferramenta) já concluída para o aluno logado. */
export const demoDiagnosticApplications = (
  memberId: string,
  pillars: { id: string; questions: { id: string; type: string }[] }[],
) => [
  {
    id: "demo-tool-app-inicial",
    member_id: memberId,
    template_id: "demo-template-diagnostico",
    status: "completed",
    phase: "inicial",
    scores: DEMO_DIAGNOSTIC_SCORES,
    answers: buildDemoDiagnosticAnswers(pillars, DEMO_DIAGNOSTIC_SCORES),
    notes: "Diagnóstico aplicado na sessão de Mapeamento do Negócio.",
    completed_at: `${d(-60)}T12:00:00.000Z`,
    __demo__: true as const,
  },
];

/** Ferramentas (entregáveis) liberadas para o aluno. */
export const demoContentTools = () => [
  {
    id: "demo-tool-1",
    title: "Planilha de Fluxo de Caixa (12 semanas)",
    description: "Entregue na sessão Financeiro 1 — controle semanal de entradas e saídas.",
    content_type: "tool",
    url: "https://docs.google.com/spreadsheets",
    is_public: true,
    is_active: true,
    session_id: SESSION_IDS[4],
    phase_unlock: 1,
    __demo__: true as const,
  },
  {
    id: "demo-tool-2",
    title: "Modelo de DRE Simplificado",
    description: "Entregue na sessão Financeiro 2 — apuração de margem e ponto de equilíbrio.",
    content_type: "tool",
    url: "https://docs.google.com/spreadsheets",
    is_public: true,
    is_active: true,
    session_id: SESSION_IDS[5],
    phase_unlock: 2,
    __demo__: true as const,
  },
  {
    id: "demo-tool-3",
    title: "Mapa de Organograma e Funções",
    description: "Entregue na sessão Organograma — cargos, responsáveis e funções acumuladas.",
    content_type: "tool",
    url: "https://docs.google.com/presentation",
    is_public: true,
    is_active: true,
    session_id: SESSION_IDS[2],
    phase_unlock: 1,
    __demo__: true as const,
  },
  {
    id: "demo-tool-4",
    title: "POP — Procedimento Comercial",
    description: "Liberado após a sessão Gestão de Processos.",
    content_type: "tool",
    url: "https://docs.google.com/document",
    is_public: false,
    is_active: true,
    session_id: SESSION_IDS[6],
    phase_unlock: 3,
    __demo__: true as const,
  },
];

/** Arquivos/ferramentas anexadas ao aluno (student_tools). */
export const demoStudentTools = (libertyId: string) => [
  {
    id: "demo-st-1",
    liberty_id: libertyId,
    booking_id: "demo-bk-mb-0",
    uploaded_by: "demo-mentor-1",
    title: "Radar do Mapeamento do Negócio",
    description: "Diagnóstico dos 8 pilares aplicado na sessão de kickoff.",
    file_name: "radar-mapeamento.pdf",
    file_path: null,
    file_type: "link",
    file_size: null,
    external_url: "https://docs.google.com/document",
    created_at: `${d(-60)}T12:00:00.000Z`,
    __demo__: true as const,
  },
  {
    id: "demo-st-2",
    liberty_id: libertyId,
    booking_id: "demo-bk-mb-2",
    uploaded_by: "demo-mentor-2",
    title: "Fluxo de Caixa preenchido — últimas 12 semanas",
    description: "Planilha entregue e revisada com o mentor na sessão Financeiro 1.",
    file_name: "fluxo-de-caixa.xlsx",
    file_path: null,
    file_type: "link",
    file_size: null,
    external_url: "https://docs.google.com/spreadsheets",
    created_at: `${d(-18)}T12:00:00.000Z`,
    __demo__: true as const,
  },
];
