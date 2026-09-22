import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import {
  ArrowLeft, Pencil, MessageCircle, CalendarDays, ChevronDown, FileText,
  Building2, DollarSign, Instagram, Target, AlertCircle, BookOpen,
  CheckCircle2, Clock, XCircle, Plus, Users, Crown, StickyNote,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { toTitleCase, shortName } from "@/lib/formatName";
import { useAuth } from "@/hooks/useAuth";
import { getEffectiveBookingStatus, isVisibleSessionBooking, isRealizedSessionBooking, sortByScheduledDateDesc } from "@/lib/bookingStatus";
import { countByStatus, getTaskStatus, taskStatusConfig, type TaskStatus } from "@/lib/taskStatus";
import { parseISO, isAfter } from "date-fns";
import { StudentTools } from "@/components/StudentTools";
import { MemberBookingsManager } from "@/components/MemberBookingsManager";
import { SendNpsButton } from "@/components/SendNpsButton";
import { MemberQuickMessages } from "@/components/MemberQuickMessages";
import { AdminMemberNote } from "@/components/AdminMemberNote";
import { TaskChecklist } from "@/components/TaskChecklist";
import { TrendingUp, MessageSquare } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MemberTimeline } from "@/components/MemberTimeline";
import { useGoBack } from "@/lib/navigation";
import { MemberDiagnosticCard } from "@/components/MemberDiagnosticCard";
import { AvatarLightbox } from "@/components/AvatarLightbox";






type Profile = Record<string, any>;

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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberBookings, setMemberBookings] = useState<any[]>([]);
  const [cancelledBookings, setCancelledBookings] = useState<any[]>([]);
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
  const refreshAll = () => setReloadKey((k) => k + 1);


  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
      if (error) {
        toast.error("Erro ao carregar membro");
        setLoading(false);
        return;
      }
      setProfile(data);
      const { data: bookings, error: bErr } = await supabase
        .from("bookings")
        .select("id, session_id, mentor_id, scheduled_date, start_time, end_time, status")
        .eq("liberty_id", id)
        .order("scheduled_date", { ascending: false });
      if (bErr) toast.error("Erro ao carregar sessões: " + bErr.message);
      const allBookings = bookings || [];
      const visibleBookings = sortByScheduledDateDesc(allBookings.filter(isVisibleSessionBooking));
      const cancelled = sortByScheduledDateDesc(allBookings.filter((b) => getEffectiveBookingStatus(b) === "cancelled"));
      setMemberBookings(visibleBookings);
      setCancelledBookings(cancelled);

      const bookingIds = visibleBookings.map((b) => b.id);
      const sessionIds = [...new Set([...visibleBookings, ...cancelled].map((b) => b.session_id))];
      const mentorIds = [...new Set([...visibleBookings, ...cancelled].map((b) => b.mentor_id).filter(Boolean))];
      if (bookingIds.length) {
        const [{ data: reports = [] }, { data: tasks = [] }] = await Promise.all([
          supabase.from("booking_reports").select("*").in("booking_id", bookingIds),
          supabase.from("session_tasks").select("*").in("booking_id", bookingIds).order("created_at", { ascending: false }),
        ]);
        setMemberReports(Object.fromEntries((reports || []).map((r) => [r.booking_id, r])));
        setMemberTasks(tasks || []);
      } else {
        setMemberReports({});
        setMemberTasks([]);
      }
      if (sessionIds.length) {
        const { data: sessions = [] } = await supabase.from("sessions").select("id, name, \"order\"").in("id", sessionIds);
        setSessionNames(Object.fromEntries((sessions || []).map((s) => [s.id, s.name])));
        // Onboarding (order 0) não faz parte da trilha de 12 sessões.
        setJourneySessionIds(new Set((sessions || []).filter((s: any) => (s.order ?? 1) > 0).map((s: any) => s.id)));
      } else {
        setSessionNames({});
        setJourneySessionIds(new Set());
      }
      if (mentorIds.length) {
        const { data: mentors = [] } = await supabase.from("profiles").select("id, full_name").in("id", mentorIds);
        setMentorNames(Object.fromEntries((mentors || []).map((m) => [m.id, m.full_name])));
      } else {
        setMentorNames({});
      }
      setLoading(false);
    })();
  }, [id, reloadKey]);

  const cleanPhone = (p?: string) => (p ? p.replace(/\D/g, "") : "");
  const completedBookings = memberBookings.filter((b) => getEffectiveBookingStatus(b) === "completed");
  // Contador do topo: mesma regra do histórico — sessões já realizadas (inclui as que
  // aguardam relatório) e somente as que fazem parte da trilha de 12.
  const realizedJourneyCount = memberBookings.filter(
    (b) => isRealizedSessionBooking(b) && (journeySessionIds.size === 0 || journeySessionIds.has(b.session_id)),
  ).length;
  const lastSession = completedBookings.find((b) => memberReports[b.id]?.summary) || completedBookings[0];
  const lastReport = lastSession ? memberReports[lastSession.id] : null;
  const nextSession = useMemo(() => {
    const now = new Date();
    const upcoming = memberBookings
      .filter((b) => {
        const st = getEffectiveBookingStatus(b);
        if (st !== "scheduled" && st !== "pending_approval") return false;
        try { return isAfter(parseISO(`${b.scheduled_date}T${b.start_time || "00:00"}`), now); }
        catch { return false; }
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



  return (
    <AppLayout role={layoutRole}>
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <button onClick={goBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          {profile && (
            <Link
              to={layoutRole === "mentor" ? `/mentor/alunos/${id}/editar` : `/admin/membros/${id}/editar`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/15 text-primary text-xs font-semibold hover:bg-primary/15 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" /> Editar cadastro
            </Link>
          )}
        </div>

        {loading || !profile ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Carregando…</div>
        ) : (
          <>
            {/* Compact header — avatar + identity + quick stats inline */}
            <div className="rounded-2xl border border-border bg-card/80 p-3 flex flex-col gap-3 md:flex-row md:items-center">
              <AvatarLightbox name={profile.full_name} avatarUrl={profile.avatar_url} size={56} />
              <div className="flex-1 min-w-0">
                <h1 className="text-base font-semibold text-foreground truncate">{toTitleCase(profile.full_name || "")}</h1>
                <p className="text-xs text-muted-foreground truncate">
                  {toTitleCase(profile.company_name || "Sem dados")}
                  {profile.email ? ` · ${profile.email}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <InlineStat icon={CheckCircle2} tone="green" label="Realizadas" value={`${realizedJourneyCount}/12`} />
                <InlineStat icon={Clock} tone="primary" label="Próxima" value={nextSession ? formatValue("scheduled_date", nextSession.scheduled_date) : "Sem dados"} />
                {profile?.id && (
                  <SendNpsButton
                    libertyProfileId={profile.id}
                    libertyName={profile.full_name}
                    sessionName={lastSession ? sessionNames[lastSession.session_id] : null}
                    bookingId={lastSession?.id ?? null}
                    phone={(profile as any)?.phone ?? null}
                  />
                )}
                <MemberQuickMessages memberName={profile.full_name} phone={profile.phone} />
                {cleanPhone(profile.phone) && (
                  <a
                    href={`https://wa.me/${cleanPhone(profile.phone)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir WhatsApp"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-status-green/10 border border-border text-status-green text-[11px] font-semibold hover:bg-status-green/15 transition-colors"
                  >
                    <MessageCircle className="h-3 w-3" /> WhatsApp
                  </a>
                )}
              </div>

            </div>

            {/* Observação do administrador — visível no topo para mentor e admin */}
            {isAdminUser ? (
              <AdminMemberNote memberId={profile.id} initialNote={profile.admin_note ?? null} />
            ) : profile.admin_note ? (
              <div className="rounded-xl border border-amber-400/40 bg-amber-200/10 dark:bg-amber-300/5 px-3 py-2.5 flex items-start gap-2">
                <StickyNote className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-500 mb-0.5">Observação da coordenação</p>
                  <p className="text-[13px] text-foreground leading-snug whitespace-pre-wrap">{profile.admin_note}</p>
                </div>
              </div>
            ) : null}

            {/* Quick facts — inline compact chips */}
            {quickFacts.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {quickFacts.map((f) => (
                  <div key={f.key} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card/70">
                    <f.icon className="h-3 w-3 text-primary shrink-0" />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{f.label}</span>
                    <span className="text-xs font-medium text-foreground truncate max-w-[220px]">{String(f.value)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ============ MAPEAMENTO DO NEGÓCIO (radar interativo) ============ */}
            {profile?.id && <MemberDiagnosticCard libertyId={profile.id} />}

            {/* ============ LINHA DO TEMPO — Realizado × Projetado ============ */}

            <MemberTimeline
              profile={profile}
              bookings={memberBookings}
              sessionNames={sessionNames}
              journeySessionIds={journeySessionIds}
              mentorNames={mentorNames}
              reports={memberReports}
              reportRoute={reportRoute}
            />

            {/* Narrative — objetivo e dor lado a lado (histórias ficam mais abaixo) */}
            {narrative.length > 0 && (
              <div className="grid gap-2 md:grid-cols-2">
                {narrative.map((n) => (
                  <div key={n.key} className="rounded-2xl border border-border bg-card/70 p-3 flex flex-col h-full">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                      <n.icon className="h-3 w-3 text-primary" /> {n.label}
                    </div>
                    <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                      {String(n.value)}
                    </p>
                  </div>
                ))}
              </div>
            )}


            {/* ============ CONDUÇÃO DA SESSÃO — Tarefas em destaque (Bento) ============ */}
            {(memberTasks.length > 0 || memberBookings.length > 0) && (() => {
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
              const chips: { key: TaskStatus | "all"; label: string; count: number; classes: string }[] = [
                { key: "all", label: "Todas", count: counts.total, classes: "border-border text-muted-foreground" },
                { key: "pending", label: "Pendentes", count: counts.pending, classes: "border-muted-foreground/30 text-muted-foreground" },
                { key: "in_progress", label: "Em andamento", count: counts.in_progress, classes: "border-status-blue/30 text-status-blue" },
                { key: "done_by_student", label: "Aguardando validação", count: counts.awaiting, classes: "border-status-yellow/30 text-status-yellow" },
                { key: "validated", label: "Concluídas", count: counts.validated, classes: "border-status-green/30 text-status-green" },
              ];
              return (
                <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/8 via-card to-card p-4 shadow-[0_8px_30px_-18px_hsl(var(--primary)/0.35)]">
                  <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 text-primary text-[10px] font-semibold uppercase tracking-wider">
                        <Target className="h-3.5 w-3.5" /> Condução da sessão
                      </div>
                      <h2 className="text-base font-semibold text-foreground mt-1">Tarefas do aluno</h2>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Revise com o aluno cada tarefa. Marque como concluída e registre o resultado obtido.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-background/40">
                        <Clock className="h-3 w-3 text-status-yellow" />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">A fazer</span>
                        <span className="text-xs font-semibold text-foreground">{activePending}</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-background/40">
                        <CheckCircle2 className="h-3 w-3 text-status-green" />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Concluídas</span>
                        <span className="text-xs font-semibold text-foreground">{counts.validated}</span>
                      </div>
                      <button
                        onClick={() => {
                          setNewTaskBookingId(memberBookings[0]?.id || "");
                          setNewTaskText("");
                          setAddTaskOpen(true);
                        }}
                        disabled={memberBookings.length === 0}
                        className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors flex items-center gap-1.5 disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" /> Nova tarefa
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mb-4 text-[10px] uppercase tracking-wider">
                    {chips.map((c) => {
                      const active = taskFilter === c.key;
                      return (
                        <button
                          key={c.key}
                          onClick={() => setTaskFilter(c.key)}
                          className={`px-2.5 py-1 rounded-full border transition-colors ${c.classes} ${active ? "bg-foreground/10 ring-1 ring-foreground/20" : "hover:bg-foreground/5"}`}
                        >
                          {c.label} <span className="ml-1 font-semibold">{c.count}</span>
                        </button>
                      );
                    })}
                  </div>
                  {bookingsWithTasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic text-center py-6">
                      Nenhuma tarefa {taskFilter === "all" ? "cadastrada" : "nesse filtro"}.
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2 text-[10px] text-muted-foreground">
                        <span>{bookingsWithTasks.length} {bookingsWithTasks.length === 1 ? "sessão com tarefas" : "sessões com tarefas"}</span>
                        <button
                          onClick={() => {
                            if (tasksAllExpanded) {
                              setExpandedTaskBookings(new Set());
                              setTasksAllExpanded(false);
                            } else {
                              setExpandedTaskBookings(new Set(bookingsWithTasks.map((b) => b.id)));
                              setTasksAllExpanded(true);
                            }
                          }}
                          className="uppercase tracking-wider hover:text-foreground transition-colors"
                        >
                          {tasksAllExpanded ? "Recolher todas" : "Expandir todas"}
                        </button>
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
                            <div key={b.id} className="rounded-xl border border-border bg-background/40 overflow-hidden">
                              <button
                                onClick={() => {
                                  setExpandedTaskBookings((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(b.id)) next.delete(b.id); else next.add(b.id);
                                    return next;
                                  });
                                }}
                                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-background/60 transition-colors text-left"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold text-foreground truncate">{sessionName}</p>
                                  <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                    <CalendarDays className="h-3 w-3" /> {dateStr}
                                    {mentorLabel && <span className="text-muted-foreground/70">· {mentorLabel}</span>}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {bPending > 0 && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-status-yellow/30 text-status-yellow bg-status-yellow/5 font-semibold">
                                      {bPending} a fazer
                                    </span>
                                  )}
                                  {bCounts.validated > 0 && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-status-green/30 text-status-green bg-status-green/5 font-semibold">
                                      {bCounts.validated} ok
                                    </span>
                                  )}
                                  <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                </div>
                              </button>
                              {isOpen && (
                                <div className="px-3 pb-3 border-t border-border/50">
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
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* ============ HISTÓRICO DE RESULTADOS — timeline ============ */}
            {(() => {
              const withResults = memberTasks
                .filter((t) => t.result_value)
                .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));
              if (withResults.length === 0) return null;
              return (
                <div className="rounded-2xl border border-status-green/20 bg-gradient-to-br from-status-green/5 to-card p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 text-status-green text-[10px] font-semibold uppercase tracking-wider">
                        <TrendingUp className="h-3.5 w-3.5" /> Linha do tempo
                      </div>
                      <h2 className="text-base font-semibold text-foreground mt-1">Histórico de resultados</h2>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{withResults.length} {withResults.length === 1 ? "conquista" : "conquistas"}</span>
                  </div>
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
                          <span className="absolute -left-[21px] top-2 h-3 w-3 rounded-full bg-status-green border-2 border-background" />
                          <div className="rounded-xl border border-border bg-background/50 p-3">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              {isQuant ? <TrendingUp className="h-3 w-3 text-status-green" /> : <MessageSquare className="h-3 w-3 text-status-blue" />}
                              <span className={`text-[9px] uppercase tracking-wider font-semibold ${isQuant ? "text-status-green" : "text-status-blue"}`}>
                                {isQuant ? "Quantitativo" : "Qualitativo"}
                              </span>
                              <span className="text-[10px] text-muted-foreground">· {sessionName}</span>
                              {dateLabel && <span className="text-[10px] text-muted-foreground ml-auto">{dateLabel}</span>}
                            </div>
                            <p className="text-xs text-foreground/80 mb-1">{t.description}</p>
                            <p className="text-sm text-foreground font-medium leading-snug">
                              {t.result_metric ? <span className="text-muted-foreground">{t.result_metric}: </span> : null}
                              {t.result_value}
                            </p>
                            {(t as any).result_notes && (
                              <p className="text-[11px] text-muted-foreground italic mt-1.5 whitespace-pre-wrap">{(t as any).result_notes}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Última sessão removida — a linha do tempo horizontal já traz esse acesso. */}

            {/* ============ Histórias (negócio + pessoal), sem repetição ============ */}
            {stories.length > 0 && (
              <div className={`grid gap-3 ${stories.length > 1 ? "md:grid-cols-2" : ""}`}>
                {stories.map((s: any) => (
                  <div key={s.key} className="rounded-2xl border border-border bg-card/70 p-4">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                      <s.icon className="h-3 w-3 text-primary" /> {s.label}
                    </div>
                    <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">{String(s.value)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Tools library (uploaded by mentors/admins) */}
            {profile?.id && <StudentTools libertyId={profile.id} />}



            {/* Bookings manager — add / edit / delete sessions (admin + mentor) */}
            {profile?.id && (
              <MemberBookingsManager
                libertyId={profile.id}
                libertyName={profile.full_name || "Aluno"}
                onReportClick={(bid) => navigate(reportRoute(bid))}
                onChanged={refreshAll}
              />
            )}






            {/* "Histórico" removido — Sessões do aluno já lista concluídas com acesso ao relatório */}

            {/* Sessões canceladas ficam fora do perfil — o admin remaneja pela notificação/agenda. */}



            {/* Full sections */}
            {SECTIONS.map((section) => (
              <div key={section.title} className="rounded-2xl border border-border bg-card/70 overflow-hidden">
                <button onClick={() => toggleSection(section.title)} className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left">
                  <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">{section.title}</h2>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.includes(section.title) ? "rotate-180" : ""}`} />
                </button>
                {openSections.includes(section.title) && (
                  <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                    {section.fields.filter((f) => !shownKeys.has(f.key)).map((f) => {
                      const val = formatValue(f.key, profile[f.key]);
                      const isLong = typeof profile[f.key] === "string" && profile[f.key]?.length > 180;
                      return (
                        <div key={f.key} className={`rounded-xl border border-border bg-background/35 p-2.5 ${isLong ? "md:col-span-2 xl:col-span-3" : ""}`}>
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">{f.label}</span>
                          <p className="text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed">{val}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      <Dialog open={addTaskOpen} onOpenChange={setAddTaskOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar tarefa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">Sessão</label>
              <select
                value={newTaskBookingId}
                onChange={(e) => setNewTaskBookingId(e.target.value)}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
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
              </select>
              {newTaskBookingId && (() => {
                const b = memberBookings.find((x) => x.id === newTaskBookingId);
                if (!b?.mentor_id) return null;
                const mn = mentorNames[b.mentor_id];
                return mn ? (
                  <p className="text-[10px] text-muted-foreground mt-1">Mentor da sessão: <span className="text-foreground">{shortName(mn)}</span></p>
                ) : null;
              })()}
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">Descrição</label>
              <textarea
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                rows={3}
                placeholder="Descreva a tarefa..."
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setAddTaskOpen(false)}
                className="px-3 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
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
                }}
                disabled={!newTaskBookingId || !newTaskText.trim()}
                className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                Adicionar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

const toneClasses: Record<string, { icon: string; value: string }> = {
  primary: { icon: "text-primary", value: "text-foreground" },
  green: { icon: "text-status-green", value: "text-foreground" },
  yellow: { icon: "text-status-yellow", value: "text-foreground" },
};

const StatCard = ({
  icon: Icon, label, value, hint, tone = "primary",
}: {
  icon: any; label: string; value: string; hint?: string; tone?: "primary" | "green" | "yellow";
}) => {
  const t = toneClasses[tone];
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
        <Icon className={`h-3 w-3 ${t.icon}`} /> {label}
      </div>
      <p className={`text-base font-semibold ${t.value} truncate`}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
    </div>
  );
};

const InlineStat = ({
  icon: Icon, label, value, tone = "primary",
}: {
  icon: any; label: string; value: string; tone?: "primary" | "green" | "yellow";
}) => {
  const t = toneClasses[tone];
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-background/40"
      title={`${label}: ${value}`}
    >
      <Icon className={`h-3 w-3 ${t.icon}`} />
      <div className="flex items-baseline gap-1 leading-none">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold text-foreground">{value}</span>
      </div>
    </div>
  );
};

export default AdminMembroDetalhesPage;
