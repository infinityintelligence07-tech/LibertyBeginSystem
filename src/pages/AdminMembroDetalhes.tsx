import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Pencil, MessageCircle, CalendarDays, ChevronDown,
  Building2, DollarSign, Instagram, Target, AlertCircle, BookOpen,
  CheckCircle2, Clock, Plus, Users, Crown, StickyNote, TrendingUp, MessageSquare,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { toTitleCase, shortName } from "@/lib/formatName";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import {
  getEffectiveBookingStatus,
  isVisibleSessionBooking,
  isRealizedSessionBooking,
  isPendingConfirmationBooking,
  parsePlatformDateTime,
  sortByScheduledDateDesc,
} from "@/lib/bookingStatus";
import { countByStatus, getTaskStatus, taskStatusConfig, type TaskStatus } from "@/lib/taskStatus";
import { StudentTools } from "@/components/StudentTools";
import { MemberBookingsManager } from "@/components/MemberBookingsManager";
import { SendNpsButton } from "@/components/SendNpsButton";
import { MemberQuickMessages } from "@/components/MemberQuickMessages";
import { AdminMemberNote } from "@/components/AdminMemberNote";
import { TaskChecklist } from "@/components/TaskChecklist";
import { Button } from "@/components/ui/button";
import {
  BottomSheet, Callout, Chip, EmptyState, ErrorState, ListRow, LoadingState, PageContainer, PageHeader,
  SectionCard, SectionHeader, SelectField, Stat, StatusPill, TextAreaField,
} from "@/components/ds";
import { MemberTimeline } from "@/components/MemberTimeline";
import { useGoBack } from "@/lib/navigation";
import { MemberDiagnosticCard } from "@/components/MemberDiagnosticCard";
import { AvatarLightbox } from "@/components/AvatarLightbox";

type Profile = Record<string, any>;

type MemberBooking = {
  id: string;
  session_id: string;
  mentor_id: string | null;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  is_retroactive: boolean | null;
  report_required: boolean | null;
  sessions: { is_kickoff: boolean | null; name: string | null; order: number | null; duration_minutes: number | null } | null;
};

const SECTIONS: { title: string; fields: { key: string; label: string }[] }[] = [
  {
    title: "Identificação",
    fields: [
      { key: "full_name", label: "Nome completo" },
      { key: "email", label: "E-mail" },
      { key: "phone", label: "WhatsApp" },
      { key: "birth_date", label: "Data de nascimento" },
      { key: "marital_status", label: "Estado civil" },
      { key: "city_state", label: "Cidade / Estado" },
      { key: "instagram_personal", label: "Instagram pessoal" },
      { key: "dietary_restriction", label: "Restrição alimentar" },
      { key: "favorite_chocolate", label: "Chocolate preferido" },
      { key: "member_tier", label: "Tipo de membro" },
    ],
  },
  {
    title: "Empresa",
    fields: [
      { key: "company_name", label: "Nome da empresa" },
      { key: "company_segment", label: "Ramo / Segmento" },
      { key: "company_address", label: "Endereço da empresa" },
      { key: "company_instagram", label: "Instagram da empresa" },
      { key: "business_age", label: "Tempo de negócio" },
      { key: "employees_count", label: "Colaboradores" },
      { key: "monthly_revenue", label: "Faturamento mensal médio" },
      { key: "profit_margin", label: "Margem de lucro" },
    ],
  },
  {
    title: "Diagnóstico financeiro",
    fields: [
      { key: "financial_control", label: "Controle financeiro atual" },
      { key: "uses_dre", label: "Elabora e analisa o DRE?" },
      { key: "costs_expenses", label: "Principais custos e despesas" },
      { key: "financial_challenge", label: "Principal desafio financeiro" },
      { key: "would_buy_self", label: "Compraria de você hoje? Por quê?" },
    ],
  },
  {
    title: "Visão e expectativa",
    fields: [
      { key: "challenge_2026", label: "Maior desafio para romper em 2026" },
      { key: "dream_2026", label: "Maior sonho para 2026" },
      { key: "program_expectation", label: "Expectativa com o Liberty Begin" },
      { key: "sector_to_develop", label: "Setor a desenvolver" },
    ],
  },
  {
    title: "Programa",
    fields: [
      { key: "program_start_date", label: "Início do programa" },
      { key: "program_end_date", label: "Término do programa" },
    ],
  },
];


const formatValue = (key: string, v: any) => {
  if (v === null || v === undefined || v === "") return "Sem dados";
  if (key.endsWith("_date") || key === "birth_date") {
    try {
      return new Date(String(v) + "T12:00:00").toLocaleDateString("pt-BR");
    } catch {
      return String(v);
    }
  }
  if (key === "member_tier") return v === "liberty" ? "Liberty" : "Begin";
  return String(v);
};

const formatRevenue = (v: any): string => {
  if (v === null || v === undefined || v === "") return "Sem dados";
  const s = String(v).trim();
  if (/[a-zA-Z$R]/.test(s) && !/^\d+[.,]?\d*$/.test(s)) return s;
  const num = Number(s.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(num)) return s;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(num);
};

const AdminMembroDetalhesPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useGoBack(location.pathname.startsWith("/mentor") ? "/mentor/alunos" : "/admin/membros");
  const { roles } = useAuth();
  const isAdminUser = roles.includes("admin") || roles.includes("super_admin");
  const layoutRole: "admin" | "mentor" = location.pathname.startsWith("/mentor") ? "mentor" : "admin";
  const isAdminArea = layoutRole === "admin";
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [memberBookings, setMemberBookings] = useState<MemberBooking[]>([]);
  const [cancelledBookings, setCancelledBookings] = useState<MemberBooking[]>([]);
  const [memberReports, setMemberReports] = useState<Record<string, any>>({});
  const [sessionNames, setSessionNames] = useState<Record<string, string>>({});
  const [journeySessionIds, setJourneySessionIds] = useState<Set<string>>(new Set());
  const [mentorNames, setMentorNames] = useState<Record<string, string>>({});
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<string[]>([]);
  
  const [showCancelled, setShowCancelled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [memberTasks, setMemberTasks] = useState<any[]>([]);
  const [taskFilter, setTaskFilter] = useState<TaskStatus | "all">("all");
  const [expandedTaskBookings, setExpandedTaskBookings] = useState<Set<string>>(new Set());
  const [tasksAllExpanded, setTasksAllExpanded] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [newTaskBookingId, setNewTaskBookingId] = useState<string>("");
  const [newTaskText, setNewTaskText] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  // Após qualquer mutação dos filhos: recarrega o estado local desta página e as queries react-query relacionadas.
  const refreshAll = () => {
    setReloadKey((k) => k + 1);
    queryClient.invalidateQueries({ queryKey: ["admin-members"] });
    queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    if (id) queryClient.invalidateQueries({ queryKey: ["member-bookings-manager", id] });
  };


  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      setNotFound(false);
      const { data, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
      if (error) {
        toast.error("Erro ao carregar membro: " + error.message);
        setLoading(false);
        return;
      }
      if (!data) {
        setProfile(null);
        setNotFound(true);
        setLoading(false);
        return;
      }
      setProfile(data);
      const { data: bookings, error: bErr } = await supabase
        .from("bookings")
        .select("id, session_id, mentor_id, scheduled_date, start_time, end_time, status, is_retroactive, report_required, sessions(is_kickoff, name, \"order\", duration_minutes)")
        .eq("liberty_id", id)
        .order("scheduled_date", { ascending: false });
      if (bErr) toast.error("Erro ao carregar sessões: " + bErr.message);
      const allBookings = (bookings || []) as unknown as MemberBooking[];
      const visibleBookings = sortByScheduledDateDesc(allBookings.filter(isVisibleSessionBooking));
      const cancelled = sortByScheduledDateDesc(allBookings.filter((b) => getEffectiveBookingStatus(b) === "cancelled"));
      setMemberBookings(visibleBookings);
      setCancelledBookings(cancelled);

      const bookingIds = visibleBookings.map((b) => b.id);
      const sessionIds = [...new Set([...visibleBookings, ...cancelled].map((b) => b.session_id))];
      const mentorIds = [...new Set([...visibleBookings, ...cancelled].map((b) => b.mentor_id).filter(Boolean))];
      if (bookingIds.length) {
        const [reportsRes, tasksRes] = await Promise.all([
          supabase.from("booking_reports").select("*").in("booking_id", bookingIds),
          supabase.from("session_tasks").select("*").in("booking_id", bookingIds).order("created_at", { ascending: false }),
        ]);
        if (reportsRes.error) toast.error("Erro ao carregar relatórios: " + reportsRes.error.message);
        if (tasksRes.error) toast.error("Erro ao carregar tarefas: " + tasksRes.error.message);
        setMemberReports(Object.fromEntries((reportsRes.data || []).map((r) => [r.booking_id, r])));
        setMemberTasks(tasksRes.data || []);
      } else {
        setMemberReports({});
        setMemberTasks([]);
      }
      if (sessionIds.length) {
        const { data: sessions, error: sErr } = await supabase.from("sessions").select("id, name, \"order\"").in("id", sessionIds);
        if (sErr) toast.error("Erro ao carregar sessões do catálogo: " + sErr.message);
        setSessionNames(Object.fromEntries((sessions || []).map((s) => [s.id, s.name])));
        // Onboarding (order 0) não faz parte da trilha de 12 sessões.
        setJourneySessionIds(new Set((sessions || []).filter((s) => (s.order ?? 1) > 0).map((s) => s.id)));
      } else {
        setSessionNames({});
        setJourneySessionIds(new Set());
      }
      if (mentorIds.length) {
        const { data: mentors, error: mErr } = await supabase.from("profiles").select("id, full_name").in("id", mentorIds);
        if (mErr) toast.error("Erro ao carregar mentores: " + mErr.message);
        setMentorNames(Object.fromEntries((mentors || []).map((m) => [m.id, m.full_name])));
      } else {
        setMentorNames({});
      }
      setLoading(false);
    })();
  }, [id, reloadKey]);

  const cleanPhone = (p?: string) => (p ? p.replace(/\D/g, "") : "");
  const isJourneyBooking = (b: MemberBooking) => journeySessionIds.size === 0 || journeySessionIds.has(b.session_id);
  // Regra única da plataforma: realizada = fechada pelo mentor/admin (com ou sem relatório).
  const completedBookings = memberBookings.filter((b) => isRealizedSessionBooking(b));
  // Contador do topo: somente sessões realizadas que fazem parte da trilha de 12.
  const realizedJourneyCount = completedBookings.filter(isJourneyBooking).length;
  // Passaram do horário e o mentor ainda não confirmou: ocupam vaga, mas não contam como realizadas.
  const pendingConfirmationCount = memberBookings.filter((b) => isPendingConfirmationBooking(b) && isJourneyBooking(b)).length;
  const lastSession = completedBookings.find((b) => memberReports[b.id]?.summary) || completedBookings[0];
  const lastReport = lastSession ? memberReports[lastSession.id] : null;
  const nextSession = useMemo(() => {
    const now = Date.now();
    const upcoming = memberBookings
      .filter((b) => {
        const st = getEffectiveBookingStatus(b);
        if (st !== "scheduled" && st !== "pending_approval") return false;
        const start = parsePlatformDateTime(b.scheduled_date, b.start_time || "00:00");
        return start ? start.getTime() > now : false;
      })
      .sort((a, b) => `${a.scheduled_date}T${a.start_time}`.localeCompare(`${b.scheduled_date}T${b.start_time}`));
    return upcoming[0] || null;
  }, [memberBookings]);
  const reportRoute = (bookingId: string) => layoutRole === "mentor" ? `/mentor/sessoes/${bookingId}/relatorio` : `/admin/sessoes/${bookingId}/relatorio`;
  const toggleSection = (section: string) => {
    setOpenSections((current) => current.includes(section) ? current.filter((s) => s !== section) : [...current, section]);
  };

  const quickFacts = useMemo(() => {
    if (!profile) return [];
    const employees = profile.employees_count_num ?? profile.employees_count;
    return [
      { key: "company_name", label: "Empresa", value: profile.company_name, icon: Building2 },
      { key: "monthly_revenue", label: "Faturamento", value: formatRevenue(profile.monthly_revenue), icon: DollarSign },
      { key: "employees", label: "Colaboradores", value: employees ? String(employees) : null, icon: Users },
      { key: "leaders", label: "Líderes", value: profile.leaders_count ? String(profile.leaders_count) : null, icon: Crown },
      { key: "instagram", label: "Instagram", value: profile.company_instagram || profile.instagram_personal, icon: Instagram },
    ].filter((i) => i.value && i.value !== "Sem dados");
  }, [profile]);
  const narrative = useMemo(() => {
    if (!profile) return [];
    return [
      { key: "vision_6_months", label: "Principal objetivo", value: profile.vision_6_months || profile.dream_2026, icon: Target },
      { key: "main_pain", label: "Principal dor", value: profile.main_pain, icon: AlertCircle },
    ].filter((i) => i.value);
  }, [profile]);
  // Histórias longas ficam numa única seção no fim (sem repetir o que já está acima)
  const stories = useMemo(() => {
    if (!profile) return [] as { key: string; label: string; value: string; icon: any }[];
    const businessStory = profile.business_story || profile.business_description;
    const list = [
      { key: "business_story", label: "História do negócio", value: businessStory, icon: Building2 },
      { key: "personal_story", label: "História pessoal", value: profile.personal_story, icon: BookOpen },
    ].filter((i) => i.value);
    // evita duplicar o mesmo texto nos dois cards
    const seen = new Set<string>();
    return list.filter((i) => {
      const t = String(i.value).trim();
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    }) as any;
  }, [profile]);
  const shownKeys = useMemo(() => {
    const s = new Set<string>([
      "company_name", "monthly_revenue", "company_instagram", "instagram_personal",
      "vision_6_months", "dream_2026", "main_pain", "business_description",
      "personal_story", "business_story", "employees_count", "leaders_count",
      "full_name", "email",
    ]);
    return s;
  }, []);

  // Contadores do cabeçalho (mesmos critérios já usados na página / na jornada de 12 sessões).
  const scheduledJourneyCount = memberBookings.filter((b) => {
    const st = getEffectiveBookingStatus(b);
    return (st === "scheduled" || st === "pending_approval") && isJourneyBooking(b);
  }).length;
  const availableJourneyCount = Math.max(0, 12 - realizedJourneyCount - pendingConfirmationCount - scheduledJourneyCount);
  const hasAccess = Boolean(profile?.user_id);
  const editHref = layoutRole === "mentor" ? `/mentor/alunos/${id}/editar` : `/admin/membros/${id}/editar`;

  const handleAddTask = async () => {
    if (!newTaskBookingId || !newTaskText.trim()) {
      toast.error("Preencha a sessão e a descrição.");
      return;
    }
    const { error } = await supabase.from("session_tasks").insert({
      booking_id: newTaskBookingId,
      description: newTaskText.trim(),
      origin: "mentor",
    });
    if (error) { toast.error("Erro ao adicionar tarefa: " + error.message); return; }
    toast.success("Tarefa adicionada!");
    setAddTaskOpen(false);
    setNewTaskText("");
    refreshAll();
  };

  const newTaskMentor = (() => {
    if (!newTaskBookingId) return null;
    const b = memberBookings.find((x) => x.id === newTaskBookingId);
    if (!b?.mentor_id) return null;
    return mentorNames[b.mentor_id] ? shortName(mentorNames[b.mentor_id]) : null;
  })();

  const renderTasks = () => {
    if (memberTasks.length === 0 && memberBookings.length === 0) return null;
    const counts = countByStatus(memberTasks);
    const chronologicalBookings = [...memberBookings].sort((a, b) =>
      `${a.scheduled_date}T${a.start_time || ""}`.localeCompare(`${b.scheduled_date}T${b.start_time || ""}`)
    );
    const bookingsWithTasks = chronologicalBookings.filter((b) =>
      memberTasks.some((t) => {
        if (t.booking_id !== b.id) return false;
        if (taskFilter === "all") return true;
        return getTaskStatus(t) === taskFilter;
      })
    );
    const checklistRole: "mentor" | "admin" = isAdminUser ? "admin" : "mentor";
    const activePending = counts.pending + counts.in_progress + counts.awaiting;
    const chips: { key: TaskStatus | "all"; label: string; count: number }[] = [
      { key: "all", label: "Todas", count: counts.total },
      { key: "pending", label: "Pendentes", count: counts.pending },
      { key: "in_progress", label: "Em andamento", count: counts.in_progress },
      { key: "done_by_student", label: "Aguardando validação", count: counts.awaiting },
      { key: "validated", label: "Concluídas", count: counts.validated },
    ];
    return (
      <SectionCard as="section" className="space-y-4">
        <SectionHeader
          title="Tarefas do aluno"
          description="Revise com o aluno cada tarefa. Marque como concluída e registre o resultado obtido."
          actions={
            <Button
              variant="outline"
              size="sm"
              disabled={memberBookings.length === 0}
              onClick={() => {
                setNewTaskBookingId(memberBookings[0]?.id || "");
                setNewTaskText("");
                setAddTaskOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Nova tarefa
            </Button>
          }
        />
        <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
          <Stat label="A fazer" value={activePending} icon={Clock} tone="pending" size="sm" />
          <Stat label="Concluídas" value={counts.validated} icon={CheckCircle2} tone="success" size="sm" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <Chip key={c.key} active={taskFilter === c.key} onClick={() => setTaskFilter(c.key)} count={c.count}>
              {c.label}
            </Chip>
          ))}
        </div>
        {bookingsWithTasks.length === 0 ? (
          <EmptyState
            compact
            icon={Target}
            title={taskFilter === "all" ? "Nenhuma tarefa cadastrada" : "Nenhuma tarefa nesse filtro"}
            description={taskFilter === "all" ? "Use Nova tarefa para registrar a primeira." : undefined}
          />
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{bookingsWithTasks.length} {bookingsWithTasks.length === 1 ? "sessão com tarefas" : "sessões com tarefas"}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (tasksAllExpanded) {
                    setExpandedTaskBookings(new Set());
                    setTasksAllExpanded(false);
                  } else {
                    setExpandedTaskBookings(new Set(bookingsWithTasks.map((b) => b.id)));
                    setTasksAllExpanded(true);
                  }
                }}
              >
                {tasksAllExpanded ? "Recolher todas" : "Expandir todas"}
              </Button>
            </div>
            <div className="space-y-2">
              {bookingsWithTasks.map((b) => {
                const bookingTasks = memberTasks.filter((t) => t.booking_id === b.id);
                const sessionName = sessionNames[b.session_id] || "Sessão";
                const dateStr = formatValue("scheduled_date", b.scheduled_date);
                const mentorLabel = b.mentor_id && mentorNames[b.mentor_id] ? shortName(mentorNames[b.mentor_id]) : null;
                const bCounts = countByStatus(bookingTasks);
                const bPending = bCounts.pending + bCounts.in_progress + bCounts.awaiting;
                // Auto-expand when a specific filter is applied, otherwise respect user toggle
                const isOpen = taskFilter !== "all" || expandedTaskBookings.has(b.id);
                return (
                  <SectionCard key={b.id} padding="none" className="overflow-hidden">
                    <ListRow
                      last
                      onPress={() => {
                        setExpandedTaskBookings((prev) => {
                          const next = new Set(prev);
                          if (next.has(b.id)) next.delete(b.id); else next.add(b.id);
                          return next;
                        });
                      }}
                      aria-expanded={isOpen}
                      title={sessionName}
                      subtitle={
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="h-3 w-3" aria-hidden /> {dateStr}
                          {mentorLabel && <span>· {mentorLabel}</span>}
                        </span>
                      }
                      trailing={
                        <>
                          {bPending > 0 && <StatusPill tone="pending" size="sm" withDot={false}>{bPending} a fazer</StatusPill>}
                          {bCounts.validated > 0 && <StatusPill tone="success" size="sm" withDot={false}>{bCounts.validated} ok</StatusPill>}
                          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-ds-1 ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                        </>
                      }
                    />
                    {isOpen && (
                      <div className="px-4 pb-4 border-t border-border">
                        <TaskChecklist
                          tasks={bookingTasks}
                          bookingId={b.id}
                          role={checklistRole}
                          invalidateKeys={[["session-tasks", b.id]]}
                          onChanged={refreshAll}
                          filter={taskFilter}
                          hideAdd
                        />
                      </div>
                    )}
                  </SectionCard>
                );
              })}
            </div>
          </>
        )}
      </SectionCard>
    );
  };

  const renderResults = () => {
    const withResults = memberTasks
      .filter((t) => t.result_value)
      .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));
    if (withResults.length === 0) return null;
    return (
      <SectionCard as="section" className="space-y-4">
        <SectionHeader
          title="Histórico de resultados"
          description={`${withResults.length} ${withResults.length === 1 ? "conquista registrada" : "conquistas registradas"}`}
        />
        <div className="relative pl-4 border-l border-status-green/30 space-y-3">
          {withResults.map((t) => {
            const bk = memberBookings.find((b) => b.id === t.booking_id);
            const sessionName = bk ? (sessionNames[bk.session_id] || "Sessão") : "Sessão";
            const isQuant = t.result_type === "quantitative";
            const dateLabel = t.completed_at
              ? new Date(t.completed_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
              : "";
            return (
              <div key={t.id} className="relative">
                <span className="absolute -left-[21px] top-3 h-3 w-3 rounded-full bg-status-green border-2 border-background" aria-hidden />
                <SectionCard padding="compact">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <StatusPill tone={isQuant ? "success" : "info"} size="sm" withDot={false}>
                      {isQuant ? <TrendingUp className="h-3 w-3" aria-hidden /> : <MessageSquare className="h-3 w-3" aria-hidden />}
                      {isQuant ? "Quantitativo" : "Qualitativo"}
                    </StatusPill>
                    <span className="text-xs text-muted-foreground">{sessionName}</span>
                    {dateLabel && <span className="text-xs text-muted-foreground ml-auto">{dateLabel}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">{t.description}</p>
                  <p className="text-sm text-foreground font-medium leading-snug">
                    {t.result_metric ? <span className="text-muted-foreground">{t.result_metric}: </span> : null}
                    {t.result_value}
                  </p>
                  {(t as any).result_notes && (
                    <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap">{(t as any).result_notes}</p>
                  )}
                </SectionCard>
              </div>
            );
          })}
        </div>
      </SectionCard>
    );
  };

  return (
    <AppLayout role={layoutRole}>
      <PageContainer>
        {notFound ? (
          <>
            <PageHeader title="Membro" back={goBack} size="large" />
            <ErrorState
              title="Membro não encontrado"
              description="O cadastro pode ter sido excluído ou mesclado com outro perfil."
              onRetry={goBack}
            />
          </>
        ) : loading || !profile ? (
          <>
            <PageHeader title="Membro" back={goBack} size="large" />
            <LoadingState variant="page" />
          </>
        ) : (
          <>
            <PageHeader
              size="large"
              back={goBack}
              eyebrow={
                <span className="inline-flex items-center gap-2 flex-wrap">
                  <span>{toTitleCase(profile.company_name || "Sem empresa")}</span>
                  {profile.member_tier === "liberty" && <StatusPill tone="brand" size="sm" withDot={false}>Liberty</StatusPill>}
                  {profile.is_active === false && <StatusPill tone="neutral" size="sm" withDot={false}>Inativo</StatusPill>}
                  {!hasAccess && <StatusPill tone="warning" size="sm" withDot={false}>Sem acesso</StatusPill>}
                </span>
              }
              title={
                <span className="inline-flex items-center gap-3">
                  <AvatarLightbox name={profile.full_name} avatarUrl={profile.avatar_url} size={48} />
                  <span className="truncate">{toTitleCase(profile.full_name || "")}</span>
                </span>
              }
              description={profile.email || undefined}
              actions={
                <>
                  {cleanPhone(profile.phone) && (
                    <a
                      href={`https://wa.me/${cleanPhone(profile.phone)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary btn-sm text-status-green"
                    >
                      <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
                    </a>
                  )}
                  <MemberQuickMessages memberName={profile.full_name} phone={profile.phone} />
                  {profile?.id && (
                    <SendNpsButton
                      libertyProfileId={profile.id}
                      libertyName={profile.full_name}
                      sessionName={lastSession ? sessionNames[lastSession.session_id] : null}
                      bookingId={lastSession?.id ?? null}
                      phone={(profile as any)?.phone ?? null}
                    />
                  )}
                  <Button size="sm" onClick={() => navigate(editHref)}>
                    <Pencil className="h-4 w-4" /> Editar cadastro
                  </Button>
                </>
              }
            />

            {/* Resumo da jornada */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Realizadas" value={`${realizedJourneyCount}/12`} icon={CheckCircle2} tone="success" />
              <Stat
                label="A confirmar"
                value={pendingConfirmationCount}
                icon={AlertCircle}
                tone={pendingConfirmationCount > 0 ? "pending" : "default"}
                hint={pendingConfirmationCount > 0 ? "Passaram do horário" : undefined}
              />
              <Stat
                label="Agendadas"
                value={scheduledJourneyCount}
                icon={Clock}
                tone="info"
                hint={nextSession ? `Próxima: ${formatValue("scheduled_date", nextSession.scheduled_date)}` : "Sem próxima sessão"}
              />
              <Stat label="Disponíveis" value={availableJourneyCount} icon={Target} tone="default" hint="Vagas na jornada" />
            </div>

            {/* Observação do administrador: visível no topo para mentor e admin */}
            {isAdminUser ? (
              <AdminMemberNote memberId={profile.id} initialNote={profile.admin_note ?? null} />
            ) : profile.admin_note ? (
              <Callout tone="warning" icon={StickyNote} title="Observação da coordenação">
                <span className="whitespace-pre-wrap">{profile.admin_note}</span>
              </Callout>
            ) : null}

            {/* Quick facts */}
            {quickFacts.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {quickFacts.map((f) => (
                  <div key={f.key} className="flex items-center gap-2 h-8 px-3 rounded-full border border-border bg-card text-xs">
                    <f.icon className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden />
                    <span className="text-muted-foreground">{f.label}</span>
                    <span className="font-medium text-foreground truncate max-w-[220px]">{String(f.value)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Mapeamento do negócio (radar) */}
            {profile?.id && <MemberDiagnosticCard libertyId={profile.id} />}

            {/* Linha do tempo */}
            <MemberTimeline
              profile={profile}
              bookings={memberBookings}
              sessionNames={sessionNames}
              journeySessionIds={journeySessionIds}
              mentorNames={mentorNames}
              reports={memberReports}
              reportRoute={reportRoute}
              onChanged={refreshAll}
            />

            {/* Objetivo e dor */}
            {narrative.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2">
                {narrative.map((n) => (
                  <SectionCard key={n.key} padding="compact" className="h-full">
                    <p className="ds-kicker flex items-center gap-1.5 mb-1.5">
                      <n.icon className="h-3.5 w-3.5 text-primary" aria-hidden /> {n.label}
                    </p>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{String(n.value)}</p>
                  </SectionCard>
                ))}
              </div>
            )}

            {renderTasks()}
            {renderResults()}

            {/* Histórias (negócio + pessoal), sem repetição */}
            {stories.length > 0 && (
              <div className={`grid gap-3 ${stories.length > 1 ? "md:grid-cols-2" : ""}`}>
                {stories.map((s: any) => (
                  <SectionCard key={s.key}>
                    <p className="ds-kicker flex items-center gap-1.5 mb-2">
                      <s.icon className="h-3.5 w-3.5 text-primary" aria-hidden /> {s.label}
                    </p>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{String(s.value)}</p>
                  </SectionCard>
                ))}
              </div>
            )}

            {/* Ferramentas enviadas por mentores/admins */}
            {profile?.id && <StudentTools libertyId={profile.id} />}

            {/* Sessões do aluno: adicionar / editar / excluir */}
            {profile?.id && (
              <MemberBookingsManager
                libertyId={profile.id}
                libertyName={profile.full_name || "Aluno"}
                onReportClick={(bid) => navigate(reportRoute(bid))}
                onChanged={refreshAll}
              />
            )}

            {/* Cadastro completo, por seção */}
            <div className="space-y-3">
              <SectionHeader title="Cadastro completo" description="Toque numa seção para ver os campos." />
              {SECTIONS.map((section) => {
                const isOpen = openSections.includes(section.title);
                return (
                  <SectionCard key={section.title} padding="none" className="overflow-hidden">
                    <ListRow
                      last
                      onPress={() => toggleSection(section.title)}
                      aria-expanded={isOpen}
                      title={<h3 className="text-sm font-semibold text-foreground">{section.title}</h3>}
                      trailing={<ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-ds-1 ${isOpen ? "rotate-180" : ""}`} aria-hidden />}
                    />
                    {isOpen && (
                      <div className="px-4 pb-4 border-t border-border pt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {section.fields.filter((f) => !shownKeys.has(f.key)).map((f) => {
                          const val = formatValue(f.key, profile[f.key]);
                          const isLong = typeof profile[f.key] === "string" && profile[f.key]?.length > 180;
                          return (
                            <div key={f.key} className={`rounded-ds border border-border bg-background/30 p-3 ${isLong ? "md:col-span-2 xl:col-span-3" : ""}`}>
                              <span className="text-xs text-muted-foreground block mb-1">{f.label}</span>
                              <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">{val}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </SectionCard>
                );
              })}
            </div>
          </>
        )}
      </PageContainer>

      <BottomSheet
        open={addTaskOpen}
        onOpenChange={setAddTaskOpen}
        title="Adicionar tarefa"
        description="A tarefa fica vinculada a uma sessão do aluno."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddTaskOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddTask} disabled={!newTaskBookingId || !newTaskText.trim()}>Adicionar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectField
            label="Sessão"
            value={newTaskBookingId}
            onChange={(e) => setNewTaskBookingId(e.target.value)}
            hint={newTaskMentor ? `Mentor da sessão: ${newTaskMentor}` : undefined}
          >
            {memberBookings.length === 0 && <option value="">Nenhuma sessão disponível</option>}
            {[...memberBookings]
              .sort((a, b) => `${b.scheduled_date}T${b.start_time || ""}`.localeCompare(`${a.scheduled_date}T${a.start_time || ""}`))
              .map((b) => {
                const sn = sessionNames[b.session_id] || "Sessão";
                const dt = formatValue("scheduled_date", b.scheduled_date);
                const mn = b.mentor_id && mentorNames[b.mentor_id] ? ` · ${shortName(mentorNames[b.mentor_id])}` : "";
                return (
                  <option key={b.id} value={b.id}>{sn} · {dt}{mn}</option>
                );
              })}
          </SelectField>
          <TextAreaField
            label="Descrição"
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            rows={3}
            placeholder="Descreva a tarefa"
          />
        </div>
      </BottomSheet>
    </AppLayout>
  );
};

export default AdminMembroDetalhesPage;

