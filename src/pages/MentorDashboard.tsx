import { useState, useMemo } from "react";
import { sessionFee } from "@/lib/mentorFees";
import { AppLayout } from "@/components/AppLayout";
import { GoogleCalendarBanner } from "@/components/GoogleCalendarBanner";
import { Calendar, ClipboardList, AlertTriangle, ExternalLink, ChevronLeft, ChevronRight, ChevronDown, FileText, DollarSign, TrendingUp, Wallet, CalendarDays, PhoneOff, Video } from "lucide-react";
import { MentorClosingSoon, type ClosingStudent } from "@/components/mentor/MentorClosingSoon";
import { MentorActiveStudents, type ActiveStudent } from "@/components/mentor/MentorActiveStudents";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import {
  Callout,
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  LoadingState,
  PageContainer,
  PageHeader,
  SectionCard,
  SectionHeader,
  Stat,
  StatusPill,
} from "@/components/ds";
import { cn } from "@/lib/utils";
import { MentorActionBanner } from "@/components/mentor/MentorActionBanner";
import {
  NotRealizedDialog,
  useMentorBookingActions,
} from "@/components/mentor/MentorBookingActions";
import { differenceInDays } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { invokeEndMeeting } from "@/lib/meetingWhatsApp";
import { format, startOfMonth, addMonths, subMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { shortName } from "@/lib/formatName";
import { useNavigate } from "react-router-dom";
import { ResultsRanking } from "@/components/ResultsRanking";
import { TaskChecklist } from "@/components/TaskChecklist";
import { useDemoData } from "@/contexts/DemoDataContext";
import { demoBookingsForMentor, demoTasksForBookings, demoReportsForBookings, demoLibertyProfiles } from "@/lib/demoForUser";
import { BEGIN_JOURNEY_SESSIONS, buildSessionProgress } from "@/lib/sessionProgress";
import {
  getEffectiveBookingStatus,
  getMentorPendingAction,
  isFutureScheduledBooking,
  isRealizedSessionBooking,
  isSessionHappeningNow,
  isVisibleSessionBooking,
  sortByScheduledDateAsc,
  sortByScheduledDateDesc,
  todayPlatformDate,
} from "@/lib/bookingStatus";

type ViewMode = "month" | "overview";

type SessionInfo = { id: string; name: string; order?: number | null; is_kickoff?: boolean | null; duration_minutes?: number | null };

const MentorDashboardPage = () => {
  const { profile } = useAuth();
  const { demoEnabled } = useDemoData();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [notRealizedTarget, setNotRealizedTarget] = useState<string | null>(null);
  const [endingMeetId, setEndingMeetId] = useState<string | null>(null);
  const { actingId, markNotRealized } = useMentorBookingActions();

  const endMeetForAll = async (bookingId: string) => {
    if (endingMeetId) return;
    setEndingMeetId(bookingId);
    try {
      const r = await invokeEndMeeting(bookingId);
      if (r.ok === false || r.error) {
        toast.error(r.error || "Não foi possível encerrar o Meet");
        return;
      }
      toast.success("Sessão encerrada", {
        description: "Agora finalize o relatório — o resumo Gemini chega em alguns minutos.",
      });
      navigate(`/mentor/sessoes/${bookingId}/relatorio`, { state: { meetEnded: true } });
    } finally {
      setEndingMeetId(null);
    }
  };

  const monthStart = startOfMonth(currentMonth);
  const nextMonthStart = addMonths(monthStart, 1);

  // Carrega TODAS as sessões do mentor (única query de bookings da tela). O recorte por mês é feito em memória.
  const { data: allMentorBookings = [], isLoading: bookingsLoading, isError: bookingsError, refetch: refetchBookings } = useQuery({
    queryKey: ["mentor-dash-bookings", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("mentor_id", profile.id)
        .order("scheduled_date");
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  // Dados demo (quando o toggle está ligado)
  const demoBks = useMemo(
    () => (demoEnabled && profile?.id ? demoBookingsForMentor(profile.id) : []),
    [demoEnabled, profile?.id]
  );
  const demoTks = useMemo(() => demoTasksForBookings(demoBks), [demoBks]);
  const demoReps = useMemo(() => demoReportsForBookings(demoBks), [demoBks]);

  // Todas as sessões visíveis (sem canceladas/não realizadas), de todos os períodos
  const allVisible = useMemo(
    () => (demoEnabled ? [...allMentorBookings, ...demoBks] : allMentorBookings).filter(isVisibleSessionBooking),
    [allMentorBookings, demoBks, demoEnabled],
  );

  // Recorte do período selecionado (Mês) ou tudo (Geral)
  const bookingsAll = useMemo(() => {
    if (viewMode !== "month") return allVisible;
    const start = format(monthStart, "yyyy-MM-dd");
    const end = format(nextMonthStart, "yyyy-MM-dd");
    return allVisible.filter((b) => b.scheduled_date >= start && b.scheduled_date < end);
  }, [allVisible, viewMode, monthStart, nextMonthStart]);

  // Perfis dos membros atendidos (nome, avatar, encerramento do programa) para todas as sessões
  const libertyIds = useMemo(
    () => [...new Set(allMentorBookings.map((b) => b.liberty_id).filter((x): x is string => !!x))],
    [allMentorBookings],
  );

  const { data: libertyProfiles = [] } = useQuery({
    queryKey: ["dash-liberties", libertyIds],
    queryFn: async () => {
      if (!libertyIds.length) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, phone, member_tier, program_end_date, is_active")
        .in("id", libertyIds);
      if (error) throw error;
      return data || [];
    },
    enabled: libertyIds.length > 0,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["dash-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions").select("id, name, order, is_kickoff, duration_minutes").order("order");
      if (error) throw error;
      return (data || []) as SessionInfo[];
    },
  });

  // Jornada completa de cada aluno (todas as sessões, qualquer mentor) — para o progresso  X/12
  const { data: journeyBookings = [] } = useQuery({
    queryKey: ["mentor-dash-journey-bookings", libertyIds],
    queryFn: async () => {
      if (!libertyIds.length) return [] as Array<{
        liberty_id: string | null;
        session_id: string;
        status: string | null;
        scheduled_date: string | null;
        start_time: string | null;
        end_time: string | null;
        is_retroactive: boolean | null;
        report_required: boolean | null;
      }>;
      const chunkSize = 100;
      const rows: Array<{
        liberty_id: string | null;
        session_id: string;
        status: string | null;
        scheduled_date: string | null;
        start_time: string | null;
        end_time: string | null;
        is_retroactive: boolean | null;
        report_required: boolean | null;
      }> = [];
      for (let i = 0; i < libertyIds.length; i += chunkSize) {
        const chunk = libertyIds.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from("bookings")
          .select("liberty_id, session_id, status, scheduled_date, start_time, end_time, is_retroactive, report_required")
          .in("liberty_id", chunk);
        if (error) throw error;
        rows.push(...(data || []));
      }
      return rows;
    },
    enabled: libertyIds.length > 0,
  });

  // Relatórios de todas as sessões do mentor (via join), independente do mês exibido
  const { data: reports = [] } = useQuery({
    queryKey: ["dash-reports", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("booking_reports")
        .select("booking_id, bookings!inner(mentor_id)")
        .eq("bookings.mentor_id", profile.id);
      if (error) throw error;
      return (data || []).map((r: { booking_id: string }) => ({ booking_id: r.booking_id }));
    },
    enabled: !!profile?.id,
  });

  const bookingIds = useMemo(() => bookingsAll.map((b) => b.id), [bookingsAll]);
  const { data: monthTasks = [] } = useQuery({
    queryKey: ["dash-tasks", bookingIds],
    queryFn: async () => {
      if (!bookingIds.length) return [];
      const { data, error } = await supabase
        .from("session_tasks")
        .select("*")
        .in("booking_id", bookingIds)
        .order("created_at");
      if (error) throw error;
      return data || [];
    },
    enabled: bookingIds.length > 0,
  });

  const monthTasksAll = demoEnabled ? [...monthTasks, ...demoTks] : monthTasks;
  const reportsAll = useMemo(() => (demoEnabled ? [...reports, ...demoReps] : reports), [demoEnabled, reports, demoReps]);

  const libertyProfileMap = useMemo(
    () => Object.fromEntries([
      ...libertyProfiles.map((p) => [p.id, p] as const),
      ...(demoEnabled ? demoLibertyProfiles.map((p) => [p.id, p as unknown as (typeof libertyProfiles)[number]] as const) : []),
    ]),
    [libertyProfiles, demoEnabled],
  );
  const libertyName = (id?: string | null) => (id ? libertyProfileMap[id]?.full_name : undefined) || undefined;

  const sessionInfoMap = useMemo(() => {
    const entries: [string, SessionInfo][] = sessions.map((s) => [s.id, s]);
    if (demoEnabled) {
      ([["demo-s-1", "Diagnóstico Inicial"], ["demo-s-2", "Posicionamento"], ["demo-s-3", "Funil de Vendas"], ["demo-s-4", "Plano Financeiro"], ["demo-s-5", "Mentalidade"], ["demo-s-6", "Liderança"]] as const)
        .forEach(([id, name]) => entries.push([id, { id, name }]));
    }
    return Object.fromEntries(entries);
  }, [sessions, demoEnabled]);
  const sessionName = (id: string) => sessionInfoMap[id]?.name || "Sessão";
  const reportSet = useMemo(() => new Set(reportsAll.map((r) => r.booking_id)), [reportsAll]);

  // Valor padrão da sessão (config) e taxa individual do mentor
  const { data: defaultRate = 300 } = useQuery({
    queryKey: ["session-value-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("system_config").select("value").eq("key", "session_value").maybeSingle();
      if (error) throw error;
      return data?.value ? parseFloat(data.value) : 300;
    },
  });

  const { data: mentorRate } = useQuery({
    queryKey: ["mentor-rate", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;
      const { data, error } = await supabase.from("profiles").select("session_rate").eq("id", profile.id).maybeSingle();
      if (error) throw error;
      return (data as { session_rate?: number | null } | null)?.session_rate ?? null;
    },
    enabled: !!profile?.id,
  });

  const rate = mentorRate ?? defaultRate;

  // ============== STATS DO PERÍODO (mesmo trio que o mentor já usava) ==============
  const realized = sortByScheduledDateDesc(bookingsAll.filter(isRealizedSessionBooking));
  const scheduled = sortByScheduledDateAsc(bookingsAll.filter(isFutureScheduledBooking));
  // Relatórios pendentes: sessão já realizada (ou passada) que ainda exige relatório
  const pendingReports = useMemo(
    () =>
      sortByScheduledDateDesc(
        allVisible.filter((b) => getMentorPendingAction(b, reportSet.has(b.id)) === "report"),
      ),
    [allVisible, reportSet],
  );
  const toConfirm = useMemo(
    () =>
      sortByScheduledDateDesc(
        allVisible.filter((b) => getEffectiveBookingStatus(b) === "pending_confirmation"),
      ),
    [allVisible],
  );

  // Mapeamento do Negócio (3h) = dobro do valor da sessão; mesma regra do admin (flag, duração ou nome)
  const feeOf = (b: { session_id: string }) => {
    const s = sessionInfoMap[b.session_id];
    return sessionFee(rate, { session_name: s?.name, is_kickoff: s?.is_kickoff, duration_minutes: s?.duration_minutes });
  };
  const sumFees = (list: { session_id: string }[]) => list.reduce((acc, b) => acc + feeOf(b), 0);

  const earnedThisPeriod = sumFees(realized);
  const projectedThisPeriod = sumFees([...realized, ...scheduled]);
  const allTimeRealized = useMemo(() => allVisible.filter(isRealizedSessionBooking), [allVisible]);
  const totalEarnedAllTime = sumFees(allTimeRealized);

  const stats = [
    { label: "Sessões realizadas", value: realized.length, icon: ClipboardList, tone: "default" as const, tab: "completed", tooltip: "Ver sessões realizadas" },
    { label: "Sessões agendadas", value: scheduled.length, icon: Calendar, tone: "default" as const, tab: "upcoming", tooltip: "Ver sessões agendadas" },
    { label: "Relatórios pendentes", value: pendingReports.length, icon: AlertTriangle, tone: "default" as const, tab: "completed", tooltip: "Sessões sem relatório" },
  ];

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Faça um bom dia";
    if (h < 18) return "Faça uma boa tarde";
    return "Faça uma boa noite";
  })();

  const money = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  /** Sessões no horário agora (com Meet) — bloco AO VIVO no Início. */
  const liveMeetSessions = useMemo(
    () =>
      allVisible.filter(
        (b) =>
          isSessionHappeningNow(b) &&
          !!(b.zoom_join_url || (b as { zoom_link?: string | null }).zoom_link),
      ),
    [allVisible],
  );
  const liveIds = useMemo(() => new Set(liveMeetSessions.map((b) => b.id)), [liveMeetSessions]);

  // Próximas: lista completa do mentor; AO VIVO fica só no card de cima
  const upcomingAll = useMemo(
    () => sortByScheduledDateAsc(allVisible.filter((b) => isFutureScheduledBooking(b) && !liveIds.has(b.id))),
    [allVisible, liveIds],
  );
  const upcoming = upcomingAll.slice(0, 5);

  // ============== IMPACTO / ENCERRAMENTOS ==============
  const companiesImpacted = useMemo(() => {
    const s = new Set<string>();
    allTimeRealized.forEach((b) => b.liberty_id && s.add(b.liberty_id));
    return s.size;
  }, [allTimeRealized]);

  // Encerramentos próximos (30 dias) entre alunos ativos com jornada em curso
  const closingSoon: ClosingStudent[] = useMemo(() => {
    const now = new Date();
    const today = todayPlatformDate();
    const studentIds = new Set<string>();
    allVisible.forEach((b) => {
      if (!b.liberty_id) return;
      if (!isRealizedSessionBooking(b) && !isFutureScheduledBooking(b)) return;
      studentIds.add(b.liberty_id);
    });
    return [...studentIds]
      .map((id) => {
        const p = libertyProfileMap[id];
        if (!p || p.is_active === false || !p.program_end_date) return null;
        if (p.program_end_date < today) return null;
        const end = parseISO(p.program_end_date);
        const days = differenceInDays(end, now);
        if (days < 0 || days > 30) return null;
        return {
          id,
          full_name: p.full_name || "Membro",
          daysLeft: days,
          endDateLabel: format(end, "dd MMM yyyy", { locale: ptBR }),
        } as ClosingStudent;
      })
      .filter((x): x is ClosingStudent => !!x)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [allVisible, libertyProfileMap]);

  // Alunos ativos deste mentor: progresso da JORNADA do membro (todas as sessões, qualquer mentor).
  // Contar só as sessões com este mentor gerava 1/12 falso para quem já avançou com outros.
  const activeStudents: ActiveStudent[] = useMemo(() => {
    const byStudent = new Map<string, ActiveStudent>();
    const nextIso = new Map<string, string>();
    const today = todayPlatformDate();
    const journeyByLiberty = new Map<string, typeof journeyBookings>();
    journeyBookings.forEach((b) => {
      if (!b.liberty_id) return;
      const list = journeyByLiberty.get(b.liberty_id) ?? [];
      list.push(b);
      journeyByLiberty.set(b.liberty_id, list);
    });

    allVisible.forEach((b) => {
      if (!b.liberty_id) return;
      const p = libertyProfileMap[b.liberty_id];
      if (!p || p.is_active === false) return;
      if (p.program_end_date && p.program_end_date < today) return;

      if (!byStudent.has(b.liberty_id)) {
        const progress = buildSessionProgress(sessions, journeyByLiberty.get(b.liberty_id) || []);
        byStudent.set(b.liberty_id, {
          id: b.liberty_id,
          full_name: p.full_name || "Membro",
          avatar_url: p.avatar_url,
          tier: p.member_tier,
          completedCount: progress.completedCount,
          nextDate: null,
        });
      }

      if (isFutureScheduledBooking(b)) {
        const current = nextIso.get(b.liberty_id);
        if (!current || b.scheduled_date < current) {
          nextIso.set(b.liberty_id, b.scheduled_date);
          const entry = byStudent.get(b.liberty_id);
          if (entry) entry.nextDate = format(parseISO(b.scheduled_date), "dd/MM");
        }
      }
    });

    return [...byStudent.values()]
      .filter((s) => s.completedCount < BEGIN_JOURNEY_SESSIONS)
      .sort((a, b) => {
        if (a.nextDate && !b.nextDate) return -1;
        if (!a.nextDate && b.nextDate) return 1;
        return b.completedCount - a.completedCount;
      });
  }, [allVisible, libertyProfileMap, journeyBookings, sessions]);

  const firstName = (profile?.full_name || "").split(" ")[0] || "mentor";
  const periodLabel = viewMode === "month" ? format(currentMonth, "MMMM yyyy", { locale: ptBR }) : "Todos os períodos";

  const periodControls = (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5">
        <Chip active={viewMode === "month"} onClick={() => setViewMode("month")}>Mês</Chip>
        <Chip active={viewMode === "overview"} onClick={() => setViewMode("overview")}>Geral</Chip>
      </div>
      {viewMode === "month" && (
        <div className="flex items-center gap-1">
          <IconButton aria-label="Mês anterior" size="sm" variant="outline" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
          <span className="text-sm font-medium text-foreground capitalize min-w-[120px] text-center tabular-nums">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </span>
          <IconButton aria-label="Próximo mês" size="sm" variant="outline" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </IconButton>
        </div>
      )}
    </div>
  );

  return (
    <AppLayout role="mentor">
      <PageContainer>
      <div className="space-y-6 lg:space-y-8">
        <GoogleCalendarBanner />

        {/* Saudação + filtro de mês (ordem familiar ao time) */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <PageHeader
            size="large"
            eyebrow="Mentoria"
            title={`${greeting}, ${firstName}`}
            description={
              bookingsLoading
                ? "Carregando suas sessões..."
                : `Você já impactou ${companiesImpacted} ${companiesImpacted === 1 ? "empresa" : "empresas"}.`
            }
          />
          {periodControls}
        </div>

        {bookingsError && (
          <ErrorState title="Não foi possível carregar suas sessões" onRetry={() => refetchBookings()} />
        )}

        {!bookingsLoading && liveMeetSessions.length > 0 && (
          <section aria-label="Sessão ao vivo" className="space-y-3">
            {liveMeetSessions.map((b) => {
              const memberName = shortName((b.liberty_id ? libertyName(b.liberty_id) : b.guest_name) || "Membro");
              const memberAvatar = b.liberty_id ? libertyProfileMap[b.liberty_id]?.avatar_url : null;
              const meetUrl = b.zoom_join_url || (b as { zoom_link?: string | null }).zoom_link || "";
              return (
                <SectionCard
                  key={b.id}
                  tone="success"
                  className="border-status-green/40 ring-1 ring-status-green/20"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3 min-w-0">
                      <UserAvatar name={memberName} avatarUrl={memberAvatar} size={48} />
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusPill tone="success" withDot={false} className="gap-1.5">
                            <span className="relative flex h-2 w-2" aria-hidden>
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-green opacity-60" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-status-green" />
                            </span>
                            Ao vivo
                          </StatusPill>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {b.start_time?.slice(0, 5)}–{b.end_time?.slice(0, 5)}
                          </span>
                        </div>
                        <p className="text-base font-semibold text-foreground truncate">{memberName}</p>
                        <p className="text-sm text-muted-foreground truncate">{sessionName(b.session_id)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row flex-wrap gap-2 shrink-0 sm:items-center">
                      {meetUrl && (
                        <Button
                          asChild
                          size="default"
                          className="bg-status-green text-primary-foreground hover:bg-status-green/90"
                        >
                          <a href={meetUrl} target="_blank" rel="noopener noreferrer">
                            <Video /> Entrar no Meet
                          </a>
                        </Button>
                      )}
                      <Button
                        size="default"
                        variant="outline"
                        disabled={endingMeetId === b.id}
                        onClick={() => endMeetForAll(b.id)}
                        title="Encerra a call para todos, libera o resumo Gemini e abre o relatório"
                      >
                        <PhoneOff /> {endingMeetId === b.id ? "Encerrando…" : "Encerrar sessão"}
                      </Button>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Ao encerrar, todos saem da call → o Gemini gera o resumo → você cai no relatório para revisar e enviar.
                  </p>
                </SectionCard>
              );
            })}
          </section>
        )}

        {bookingsLoading ? (
          <LoadingState variant="stats" rows={3} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {stats.map((s) => (
              <SectionCard
                key={s.label}
                as="button"
                interactive
                padding="compact"
                onClick={() => navigate(`/mentor/sessoes?tab=${s.tab}`)}
                aria-label={s.tooltip}
              >
                <Stat label={s.label} value={s.value} icon={s.icon} />
              </SectionCard>
            ))}
          </div>
        )}

        {!bookingsLoading && (
          <SectionCard className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Stat
                size="sm"
                icon={DollarSign}
                tone="success"
                label={viewMode === "month" ? "Faturamento no mês" : "Faturamento geral"}
              value={money(viewMode === "overview" ? totalEarnedAllTime : earnedThisPeriod)}
            />
            <Stat
              size="sm"
              icon={TrendingUp}
              label={viewMode === "month" ? "Previsto no mês" : "Previsto total"}
              value={money(projectedThisPeriod)}
            />
            <Stat size="sm" icon={Wallet} label="Acumulado no programa" value={money(totalEarnedAllTime)} />
          </SectionCard>
        )}

        <MentorActionBanner />

        <MentorClosingSoon students={closingSoon} />

        {!bookingsLoading && pendingReports.length > 0 && (
          <Callout
            tone="info"
            icon={FileText}
            title={
              pendingReports.length === 1
                ? "1 relatório em aberto"
                : `${pendingReports.length} relatórios em aberto`
            }
          >
            <ul className="space-y-2 mt-1">
              {pendingReports.slice(0, 8).map((b) => {
                const memberName = shortName((b.liberty_id ? libertyName(b.liberty_id) : b.guest_name) || "Membro");
                const memberAvatar = b.liberty_id ? libertyProfileMap[b.liberty_id]?.avatar_url : null;
                return (
                  <li key={b.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-2">
                      <UserAvatar name={memberName} avatarUrl={memberAvatar} size={28} />
                      <p className="text-sm text-foreground truncate">{memberName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {sessionName(b.session_id)} · {format(parseISO(b.scheduled_date), "dd MMM", { locale: ptBR })}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/mentor/sessoes/${b.id}/relatorio`)}>
                      <FileText /> Preencher
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Callout>
        )}

        {!bookingsLoading && toConfirm.length > 0 && (
          <Callout
            tone="info"
            icon={Calendar}
            title={
              toConfirm.length === 1
                ? "1 sessão passou e ainda não foi fechada"
                : `${toConfirm.length} sessões passaram e ainda não foram fechadas`
            }
          >
            <p className="mb-2">
              Elas não contam como realizadas para você nem para o aluno. Abra cada uma e marque como realizada ou não realizada.
            </p>
            <ul className="space-y-2">
              {toConfirm.slice(0, 8).map((b) => {
                const memberName = shortName((b.liberty_id ? libertyName(b.liberty_id) : b.guest_name) || "Membro");
                const memberAvatar = b.liberty_id ? libertyProfileMap[b.liberty_id]?.avatar_url : null;
                const month = b.scheduled_date.slice(0, 7);
                return (
                  <li key={b.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-2">
                      <UserAvatar name={memberName} avatarUrl={memberAvatar} size={28} />
                      <p className="text-sm text-foreground truncate">{memberName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {sessionName(b.session_id)} · {format(parseISO(b.scheduled_date), "dd MMM", { locale: ptBR })}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/mentor/sessoes?tab=pending&month=${month}`)}>
                      Fechar
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Callout>
        )}

        <section className="space-y-3">
          <SectionHeader
            title="Próximas sessões agendadas"
            description={upcomingAll.length > 0 ? `${upcomingAll.length} no total` : undefined}
            actions={
              <Button variant="ghost" size="sm" onClick={() => navigate("/mentor/sessoes")}>
                Ver agenda <ChevronRight />
              </Button>
            }
          />
          {bookingsLoading ? (
            <LoadingState variant="list" rows={3} />
          ) : upcoming.length === 0 && liveMeetSessions.length > 0 ? (
            <p className="text-sm text-muted-foreground">A sessão do momento está no card Ao vivo acima.</p>
          ) : upcoming.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              compact
              title="Nenhuma sessão agendada"
              description="Quando um membro agendar com você, a sessão aparece aqui."
              action={<Button variant="outline" size="sm" onClick={() => navigate("/mentor/disponibilidade")}>Ver disponibilidade</Button>}
            />
          ) : (
            <SectionCard padding="none">
              {upcoming.map((b, idx) => {
                const memberName = libertyName(b.liberty_id) || b.guest_name || "Membro";
                const memberAvatar = b.liberty_id ? libertyProfileMap[b.liberty_id]?.avatar_url : null;
                return (
                  <ListRow
                    key={b.id}
                    last={idx === upcoming.length - 1}
                    leading={<UserAvatar name={memberName} avatarUrl={memberAvatar} size={40} />}
                    title={shortName(memberName)}
                    subtitle={`${sessionName(b.session_id)} · ${format(parseISO(b.scheduled_date), "dd MMM", { locale: ptBR })} · ${b.start_time?.slice(0, 5) ?? "--:--"}${b.end_time ? ` – ${b.end_time.slice(0, 5)}` : ""}`}
                    chevron={false}
                    trailing={
                      <>
                        {b.zoom_join_url && (
                          <Button
                            asChild
                            size="sm"
                            className={
                              isSessionHappeningNow(b)
                                ? "bg-status-green text-primary-foreground hover:bg-status-green/90"
                                : undefined
                            }
                            variant={isSessionHappeningNow(b) ? "default" : "outline"}
                          >
                            <a href={b.zoom_join_url} target="_blank" rel="noopener noreferrer">
                              {isSessionHappeningNow(b) ? <Video /> : <ExternalLink />}
                              {isSessionHappeningNow(b) ? "Ao vivo" : "Meet"}
                            </a>
                          </Button>
                        )}
                        {b.zoom_join_url && isSessionHappeningNow(b) && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={endingMeetId === b.id}
                            onClick={() => endMeetForAll(b.id)}
                            title="Encerra a call para todos, libera o resumo Gemini e abre o relatório"
                          >
                            <PhoneOff /> {endingMeetId === b.id ? "Encerrando…" : "Encerrar"}
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => navigate(`/mentor/sessoes/${b.id}/relatorio`)}>
                          <FileText /> Relatório
                        </Button>
                      </>
                    }
                  />
                );
              })}
            </SectionCard>
          )}
        </section>

        {!bookingsLoading && realized.length > 0 && (
          <section className="space-y-3">
            <SectionHeader title="Sessões realizadas" description={<span className="capitalize">{periodLabel}</span>} />
            <SectionCard padding="none">
              {realized.map((b, idx) => {
                const bTasks = monthTasksAll.filter((t) => t.booking_id === b.id);
                const completedCount = bTasks.filter((t) => t.is_completed).length;
                const isExpanded = expandedMember === b.id;
                const hasReport = reportSet.has(b.id);
                const effectiveStatus = getEffectiveBookingStatus(b, { hasReport });
                const pendingAction = getMentorPendingAction(b, hasReport);
                const memberName = libertyName(b.liberty_id) || b.guest_name || "Membro";
                const memberAvatar = b.liberty_id ? libertyProfileMap[b.liberty_id]?.avatar_url : null;
                const isLast = idx === realized.length - 1;

                return (
                  <div key={b.id} className={cn(!isLast && "border-b border-border")}>
                    <ListRow
                      last
                      leading={<UserAvatar name={memberName} avatarUrl={memberAvatar} size={40} />}
                      title={shortName(memberName)}
                      subtitle={`${sessionName(b.session_id)} · ${format(parseISO(b.scheduled_date), "dd MMM", { locale: ptBR })}`}
                      chevron={false}
                      trailing={
                        <>
                          {bTasks.length > 0 && (
                            <StatusPill tone="neutral" withDot={false} className="hidden sm:inline-flex">
                              {completedCount}/{bTasks.length} tarefas
                            </StatusPill>
                          )}
                          <StatusPill status={effectiveStatus} />
                          {pendingAction === "report" ? (
                            <Button size="sm" onClick={() => navigate(`/mentor/sessoes/${b.id}/relatorio`)}>
                              <FileText /> Relatório
                            </Button>
                          ) : hasReport ? (
                            <Button size="sm" variant="ghost" onClick={() => navigate(`/mentor/sessoes/${b.id}/relatorio`)}>
                              <FileText /> Ver relatório
                            </Button>
                          ) : null}
                          <IconButton
                            aria-label={isExpanded ? "Recolher tarefas" : "Ver tarefas"}
                            aria-expanded={isExpanded}
                            size="sm"
                            onClick={() => setExpandedMember(isExpanded ? null : b.id)}
                          >
                            <ChevronDown className={cn("h-4 w-4 transition-transform duration-ds-2 ease-ds", isExpanded && "rotate-180")} />
                          </IconButton>
                        </>
                      }
                    />

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-border">
                        <TaskChecklist
                          tasks={bTasks as any}
                          bookingId={b.id}
                          role="mentor"
                          invalidateKeys={[["dash-tasks", bookingIds]]}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </SectionCard>
          </section>
        )}

        {!bookingsLoading && <MentorActiveStudents students={activeStudents} />}

        <MentorResultsSection mentorId={profile?.id} />
      </div>
      </PageContainer>

      <NotRealizedDialog
        open={!!notRealizedTarget}
        onOpenChange={(open) => { if (!open) setNotRealizedTarget(null); }}
        busy={!!notRealizedTarget && actingId === notRealizedTarget}
        onConfirm={async (reason) => (notRealizedTarget ? markNotRealized(notRealizedTarget, reason) : false)}
      />
    </AppLayout>
  );
};

// Sub-component for mentor results
const MentorResultsSection = ({ mentorId }: { mentorId?: string }) => {
  const { data: mentorBookings = [] } = useQuery({
    queryKey: ["mentor-results-bookings", mentorId],
    queryFn: async () => {
      if (!mentorId) return [];
      const { data, error } = await supabase
        .from("bookings")
        .select("id, liberty_id, scheduled_date, start_time, end_time, status, is_retroactive, report_required")
        .eq("mentor_id", mentorId);
      if (error) throw error;
      return (data || []).filter((b) => isRealizedSessionBooking(b));
    },
    enabled: !!mentorId,
  });

  const bookingIds = mentorBookings.map((b) => b.id);
  const { data: tasks = [] } = useQuery({
    queryKey: ["mentor-results-tasks", bookingIds],
    queryFn: async () => {
      if (!bookingIds.length) return [];
      const { data, error } = await supabase
        .from("session_tasks")
        .select("*")
        .in("booking_id", bookingIds)
        .eq("is_completed", true);
      if (error) throw error;
      return data || [];
    },
    enabled: bookingIds.length > 0,
  });

  const libertyIds = [...new Set(mentorBookings.map((b) => b.liberty_id).filter((x): x is string => !!x))];
  const { data: libertyProfiles = [] } = useQuery({
    queryKey: ["mentor-results-profiles", libertyIds],
    queryFn: async () => {
      if (!libertyIds.length) return [];
      const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", libertyIds);
      if (error) throw error;
      return data || [];
    },
    enabled: libertyIds.length > 0,
  });

  const profileMap = useMemo(() => {
    const bookingToLiberty = Object.fromEntries(mentorBookings.map((b) => [b.id, b.liberty_id]));
    const libertyToName = Object.fromEntries(libertyProfiles.map((p) => [p.id, p.full_name]));
    const result: Record<string, string> = {};
    tasks.forEach((t) => {
      const libertyId = bookingToLiberty[t.booking_id];
      result[t.booking_id] = (libertyId && libertyToName[libertyId]) || "Membro";
    });
    return result;
  }, [tasks, mentorBookings, libertyProfiles]);

  if (tasks.length === 0) return null;

  return <ResultsRanking tasks={tasks} profileMap={profileMap} />;
};

export default MentorDashboardPage;
