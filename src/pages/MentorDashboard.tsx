import { useState, useMemo } from "react";
import { sessionFee } from "@/lib/mentorFees";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { GoogleCalendarBanner } from "@/components/GoogleCalendarBanner";
import { Calendar, Users, ClipboardList, AlertTriangle, ExternalLink, ChevronLeft, ChevronRight, FileText, Clock, DollarSign, TrendingUp, Wallet, User, History, ChevronDown, Bell, CheckCheck } from "lucide-react";

import { MentorActiveStudents, type ActiveStudent } from "@/components/mentor/MentorActiveStudents";
import { MentorFollowUp, type FollowUpItem } from "@/components/mentor/MentorFollowUp";
import { MentorStudentOfWeek } from "@/components/mentor/MentorStudentOfWeek";
import { MentorClosingSoon, type ClosingStudent } from "@/components/mentor/MentorClosingSoon";
import { MentorActionBanner } from "@/components/mentor/MentorActionBanner";

import { differenceInDays } from "date-fns";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, addMonths, subMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { shortName, initials } from "@/lib/formatName";
import { useNavigate } from "react-router-dom";
import { ResultsRanking } from "@/components/ResultsRanking";
import { TaskChecklist } from "@/components/TaskChecklist";
import { useDemoData } from "@/contexts/DemoDataContext";
import { demoBookingsForMentor, demoTasksForBookings, demoReportsForBookings, demoLibertyProfiles } from "@/lib/demoForUser";
import { bookingRequiresReport, getEffectiveBookingStatus, isVisibleSessionBooking, sortByScheduledDateAsc, sortByScheduledDateDesc, isAwaitingReport } from "@/lib/bookingStatus";

type ViewMode = "month" | "overview";

const MentorDashboardPage = () => {
  const { profile } = useAuth();
  const { demoEnabled } = useDemoData();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("month");

  const monthStart = startOfMonth(currentMonth);
  const nextMonthStart = addMonths(monthStart, 1);

  // Carrega TODAS as sessões do mentor — filtramos por mês na memória para a visão "Mês".
  // Isso garante que sessões futuras (em qualquer mês) apareçam nas listas de "Próximas".
  const { data: allMentorBookings = [] } = useQuery({
    queryKey: ["mentor-dash-bookings", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("bookings")
        .select("*")
        .eq("mentor_id", profile.id)
        .order("scheduled_date");
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const bookings = useMemo(() => {
    if (viewMode !== "month") return allMentorBookings;
    const start = format(monthStart, "yyyy-MM-dd");
    const end = format(nextMonthStart, "yyyy-MM-dd");
    return allMentorBookings.filter((b: any) => b.scheduled_date >= start && b.scheduled_date < end);
  }, [allMentorBookings, viewMode, monthStart, nextMonthStart]);

  // Lookup maps — derive from ALL bookings so names load even outside the current month
  const libertyIds = [...new Set(allMentorBookings.map((b) => b.liberty_id).filter((x): x is string => !!x))];

  const { data: libertyProfiles = [] } = useQuery({
    queryKey: ["dash-liberties", libertyIds],
    queryFn: async () => {
      if (!libertyIds.length) return [];
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", libertyIds);
      return data || [];
    },
    enabled: libertyIds.length > 0,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["dash-sessions"],
    queryFn: async () => {
      const { data } = await supabase.from("sessions").select("id, name").order("order");
      return data || [];
    },
  });

  const bookingIds = bookings.map((b) => b.id);
  const { data: reports = [] } = useQuery({
    queryKey: ["dash-reports", bookingIds],
    queryFn: async () => {
      if (!bookingIds.length) return [];
      const { data } = await supabase.from("booking_reports").select("booking_id").in("booking_id", bookingIds);
      return data || [];
    },
    enabled: bookingIds.length > 0,
  });

  // Fetch tasks for all bookings in this month
  const { data: monthTasks = [] } = useQuery({
    queryKey: ["dash-tasks", bookingIds],
    queryFn: async () => {
      if (!bookingIds.length) return [];
      const { data } = await supabase
        .from("session_tasks")
        .select("*")
        .in("booking_id", bookingIds)
        .order("created_at");
      return data || [];
    },
    enabled: bookingIds.length > 0,
  });

  // Inject demo data when toggle is on
  const demoBks = useMemo(
    () => (demoEnabled && profile?.id ? demoBookingsForMentor(profile.id) : []),
    [demoEnabled, profile?.id]
  );
  const demoTks = useMemo(() => demoTasksForBookings(demoBks), [demoBks]);
  const demoReps = useMemo(() => demoReportsForBookings(demoBks), [demoBks]);

  const bookingsAll = (demoEnabled ? [...bookings, ...demoBks] : bookings).filter(isVisibleSessionBooking);
  const monthTasksAll = demoEnabled ? [...monthTasks, ...demoTks] : monthTasks;
  const reportsAll = demoEnabled ? [...reports, ...demoReps] : reports;

  const libertyMap = Object.fromEntries([
    ...libertyProfiles.map((p) => [p.id, p.full_name] as const),
    ...(demoEnabled ? demoLibertyProfiles.map((p) => [p.id, p.full_name] as const) : []),
  ]);
  const sessionMap = Object.fromEntries([
    ...sessions.map((s) => [s.id, s.name] as const),
    ...(demoEnabled
      ? [["demo-s-1","Diagnóstico Inicial"],["demo-s-2","Posicionamento"],["demo-s-3","Funil de Vendas"],["demo-s-4","Plano Financeiro"],["demo-s-5","Mentalidade"],["demo-s-6","Liderança"]] as const
      : []),
  ]);
  const reportSet = new Set(reportsAll.map((r) => r.booking_id));

  // All-time bookings for total earnings + impact + follow-up
  const { data: allTimeBookings = [] } = useQuery({
    queryKey: ["mentor-all-bookings", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("bookings")
        .select("id, liberty_id, session_id, scheduled_date, start_time, end_time, status")
        .eq("mentor_id", profile.id);
      return data || [];
    },
    enabled: !!profile?.id,
  });

  // All-time tasks across this mentor's bookings — for impact count, follow-up, aluno da semana
  const allTimeBookingIds = useMemo(() => allTimeBookings.map((b: any) => b.id), [allTimeBookings]);
  const { data: allTimeTasks = [] } = useQuery({
    queryKey: ["mentor-all-tasks", allTimeBookingIds],
    queryFn: async () => {
      if (!allTimeBookingIds.length) return [];
      const { data } = await supabase
        .from("session_tasks")
        .select("id, booking_id, is_completed, is_validated, created_at, completed_at")
        .in("booking_id", allTimeBookingIds);
      return data || [];
    },
    enabled: allTimeBookingIds.length > 0,
  });

  // Enrich active liberty profiles (avatar, phone, tier, program_end_date)
  const activeLibertyIds = useMemo(() => {
    const ids = new Set<string>();
    allTimeBookings.forEach((b: any) => {
      if (b.liberty_id) ids.add(b.liberty_id);
    });
    return [...ids];
  }, [allTimeBookings]);
  const { data: activeLibertyProfiles = [] } = useQuery({
    queryKey: ["mentor-active-liberty-profiles", activeLibertyIds],
    queryFn: async () => {
      if (!activeLibertyIds.length) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, phone, member_tier, program_end_date, is_active")
        .in("id", activeLibertyIds);
      return data || [];
    },
    enabled: activeLibertyIds.length > 0,
  });


  // Default session value from system config
  const { data: defaultRate = 300 } = useQuery({
    queryKey: ["session-value-config"],
    queryFn: async () => {
      const { data } = await supabase.from("system_config").select("value").eq("key", "session_value").maybeSingle();
      return data?.value ? parseFloat(data.value) : 300;
    },
  });

  // Mentor's individual session_rate
  const { data: mentorRate } = useQuery({
    queryKey: ["mentor-rate", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;
      const { data } = await supabase.from("profiles").select("session_rate").eq("id", profile.id).maybeSingle();
      return (data as any)?.session_rate ?? null;
    },
    enabled: !!profile?.id,
  });

  const rate = mentorRate ?? defaultRate;

  // Stats
  const completed = sortByScheduledDateDesc(bookingsAll.filter((b) => getEffectiveBookingStatus(b) === "completed"));
  const scheduled = sortByScheduledDateAsc(bookingsAll.filter((b) => getEffectiveBookingStatus(b) === "scheduled"));
  // Relatório pendente: qualquer sessão passada sem relatório enviado (mesmo que ainda
  // esteja como "scheduled"/"rescheduled"), além das que já estão "completed" sem relatório.
  const pendingReports = sortByScheduledDateDesc(
    bookingsAll.filter((b) => isAwaitingReport(b, reportSet.has(b.id))),
  );
  const uniqueLiberties = new Set(bookingsAll.map((b) => b.liberty_id)).size;

  const allTimeBookingsMerged = demoEnabled
    ? [...allTimeBookings, ...demoBookingsForMentor(profile?.id || "_")]
    : allTimeBookings;

  // Mapeamento do Negócio (3h) = dobro do valor da sessão
  const feeOf = (b: any) => sessionFee(rate, { session_name: sessionMap[b.session_id] });
  const sumFees = (list: any[]) => list.reduce((acc, b) => acc + feeOf(b), 0);

  const earnedThisPeriod = sumFees(completed);
  const projectedThisPeriod = sumFees([...completed, ...scheduled]);
  const totalEarnedAllTime = sumFees(
    allTimeBookingsMerged.filter((b: any) => isVisibleSessionBooking(b) && getEffectiveBookingStatus(b) === "completed"),
  );

  const stats = [
    { label: "Sessões realizadas", value: completed.length, icon: ClipboardList, accent: "green" as const, tab: "completed" as const, tooltip: "Ver sessões realizadas" },
    { label: "Sessões agendadas", value: scheduled.length, icon: Calendar, accent: "blue" as const, tab: "upcoming" as const, tooltip: "Ver sessões agendadas" },
    { label: "Relatórios pendentes", value: pendingReports.length, icon: AlertTriangle, accent: "yellow" as const, tab: "completed" as const, tooltip: "Ver relatórios pendentes" },
  ];

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Faça um bom dia";
    if (h < 18) return "Faça uma boa tarde";
    return "Faça uma boa noite";
  })();

  const accentBg: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    green: "bg-status-green/10 text-status-green",
    blue: "bg-status-blue/10 text-status-blue",
    yellow: "bg-status-yellow/10 text-status-yellow",
  };

  // Próximas sessões — SEMPRE da lista completa do mentor (não depende do filtro de mês)
  const todayISO = format(new Date(), "yyyy-MM-dd");
  const upcomingAll = sortByScheduledDateAsc(
    (demoEnabled ? [...allMentorBookings, ...demoBks] : allMentorBookings)
      .filter(isVisibleSessionBooking)
      .filter((b: any) => getEffectiveBookingStatus(b) === "scheduled" && b.scheduled_date >= todayISO)
  );
  const upcoming = upcomingAll.slice(0, 5);

  // ============== IMPACTO / FOLLOW-UP / ALUNOS ATIVOS ==============
  const libertyProfileMap = useMemo(
    () => Object.fromEntries(activeLibertyProfiles.map((p: any) => [p.id, p])),
    [activeLibertyProfiles]
  );

  const allTimeVisible = useMemo(
    () => allTimeBookings.filter((b: any) => isVisibleSessionBooking(b)),
    [allTimeBookings]
  );
  const allTimeCompleted = useMemo(
    () => allTimeVisible.filter((b: any) => getEffectiveBookingStatus(b) === "completed"),
    [allTimeVisible]
  );

  const companiesImpacted = useMemo(() => {
    const s = new Set<string>();
    allTimeCompleted.forEach((b: any) => b.liberty_id && s.add(b.liberty_id));
    return s.size;
  }, [allTimeCompleted]);

  const sessionsConducted = allTimeCompleted.length;

  const studentTasksCompleted = useMemo(
    () => allTimeTasks.filter((t: any) => t.is_validated).length,
    [allTimeTasks]
  );

  const milestones = useMemo(() => {
    const out: { key: string; label: string; icon: string }[] = [];
    if (companiesImpacted >= 1) out.push({ key: "first", label: "Primeiro aluno", icon: "🌱" });
    if (companiesImpacted >= 10) out.push({ key: "ten", label: "10 empresas impactadas", icon: "🏛" });
    if (companiesImpacted >= 25) out.push({ key: "25", label: "25 empresas", icon: "✨" });
    if (sessionsConducted >= 50) out.push({ key: "s50", label: "50 sessões", icon: "🎯" });
    if (sessionsConducted >= 100) out.push({ key: "s100", label: "100 sessões", icon: "🏆" });
    if (studentTasksCompleted >= 100) out.push({ key: "t100", label: "100 tarefas destravadas", icon: "🔥" });
    return out.slice(0, 4);
  }, [companiesImpacted, sessionsConducted, studentTasksCompleted]);

  // Alunos ativos (com pelo menos 1 sessão + is_active !== false)
  const activeStudents: ActiveStudent[] = useMemo(() => {
    const byStudent = new Map<string, { completed: number; nextDate?: string }>();
    allTimeVisible.forEach((b: any) => {
      if (!b.liberty_id) return;
      const cur = byStudent.get(b.liberty_id) || { completed: 0 };
      if (getEffectiveBookingStatus(b) === "completed") cur.completed++;
      byStudent.set(b.liberty_id, cur);
    });
    // pega próxima sessão futura por aluno
    upcomingAll.forEach((b: any) => {
      if (!b.liberty_id) return;
      const cur = byStudent.get(b.liberty_id);
      if (cur && !cur.nextDate) cur.nextDate = b.scheduled_date;
    });
    return [...byStudent.entries()]
      .map(([id, agg]) => {
        const p = libertyProfileMap[id];
        if (!p || p.is_active === false) return null;
        return {
          id,
          full_name: p.full_name || "Membro",
          avatar_url: p.avatar_url,
          tier: p.member_tier,
          completedCount: agg.completed,
          nextDate: agg.nextDate ? format(parseISO(agg.nextDate), "dd/MM") : null,
        } as ActiveStudent;
      })
      .filter((x): x is ActiveStudent => !!x)
      .sort((a, b) => {
        // com próxima sessão primeiro, depois por progresso decrescente
        if (a.nextDate && !b.nextDate) return -1;
        if (!a.nextDate && b.nextDate) return 1;
        return b.completedCount - a.completedCount;
      });
  }, [allTimeVisible, upcomingAll, libertyProfileMap]);

  // Follow-up
  const followUpItems: FollowUpItem[] = useMemo(() => {
    const now = new Date();
    const items: FollowUpItem[] = [];
    // Sem sessão há > 30 dias
    activeStudents.forEach((s) => {
      const lastCompleted = allTimeCompleted
        .filter((b: any) => b.liberty_id === s.id)
        .sort((a: any, b: any) => b.scheduled_date.localeCompare(a.scheduled_date))[0];
      if (!lastCompleted) return;
      const daysSince = differenceInDays(now, parseISO(lastCompleted.scheduled_date));
      if (daysSince > 30) {
        const hasFuture = upcomingAll.some((b: any) => b.liberty_id === s.id);
        if (!hasFuture) {
          items.push({
            studentId: s.id,
            studentName: s.full_name,
            phone: libertyProfileMap[s.id]?.phone,
            reason: "no_session_30d",
            detail: `última sessão há ${daysSince} dias`,
            urgency: 100 + daysSince,
          });
        }
      }
    });
    // Tarefas atrasadas (pending/in_progress criadas há > 14 dias)
    const bookingToStudent = new Map<string, string>();
    allTimeVisible.forEach((b: any) => b.liberty_id && bookingToStudent.set(b.id, b.liberty_id));
    const overdueByStudent = new Map<string, number>();
    const awaitingByStudent = new Map<string, number>();
    allTimeTasks.forEach((t: any) => {
      const sid = bookingToStudent.get(t.booking_id);
      if (!sid) return;
      if (!t.is_completed) {
        const ageDays = differenceInDays(now, parseISO(t.created_at));
        if (ageDays > 14) overdueByStudent.set(sid, (overdueByStudent.get(sid) || 0) + 1);
      } else if (t.is_completed && !t.is_validated && t.completed_at) {
        const ageDays = differenceInDays(now, parseISO(t.completed_at));
        if (ageDays > 3) awaitingByStudent.set(sid, (awaitingByStudent.get(sid) || 0) + 1);
      }
    });
    overdueByStudent.forEach((count, sid) => {
      const p = libertyProfileMap[sid];
      if (!p || p.is_active === false) return;
      items.push({
        studentId: sid,
        studentName: p.full_name || "Membro",
        phone: p.phone,
        reason: "tasks_overdue",
        detail: `${count} ${count === 1 ? "tarefa" : "tarefas"} há mais de 14 dias`,
        urgency: 50 + count,
      });
    });
    awaitingByStudent.forEach((count, sid) => {
      const p = libertyProfileMap[sid];
      if (!p || p.is_active === false) return;
      items.push({
        studentId: sid,
        studentName: p.full_name || "Membro",
        phone: p.phone,
        reason: "awaiting_validation",
        detail: `${count} ${count === 1 ? "tarefa" : "tarefas"} para validar`,
        urgency: 30 + count,
      });
    });
    return items;
  }, [activeStudents, allTimeCompleted, allTimeVisible, allTimeTasks, upcomingAll, libertyProfileMap]);

  // Aluno da semana
  const studentOfWeek = useMemo(() => {
    const now = new Date();
    const bookingToStudent = new Map<string, string>();
    allTimeVisible.forEach((b: any) => b.liberty_id && bookingToStudent.set(b.id, b.liberty_id));
    const counts = new Map<string, number>();
    allTimeTasks.forEach((t: any) => {
      if (!t.is_validated || !t.completed_at) return;
      const days = differenceInDays(now, parseISO(t.completed_at));
      if (days > 7 || days < 0) return;
      const sid = bookingToStudent.get(t.booking_id);
      if (!sid) return;
      counts.set(sid, (counts.get(sid) || 0) + 1);
    });
    let top: { sid: string; count: number } | null = null;
    counts.forEach((count, sid) => {
      if (!top || count > top.count) top = { sid, count };
    });
    if (!top) return null;
    const p = libertyProfileMap[top.sid];
    if (!p) return null;
    return {
      studentId: top.sid,
      studentName: p.full_name || "Membro",
      avatarUrl: p.avatar_url,
      tasksThisWeek: top.count,
    };
  }, [allTimeTasks, allTimeVisible, libertyProfileMap]);

  // Encerramentos próximos (30 dias)
  const closingSoon: ClosingStudent[] = useMemo(() => {
    const now = new Date();
    return activeStudents
      .map((s) => {
        const p = libertyProfileMap[s.id];
        if (!p?.program_end_date) return null;
        const end = parseISO(p.program_end_date);
        const days = differenceInDays(end, now);
        if (days < 0 || days > 30) return null;
        return {
          id: s.id,
          full_name: s.full_name,
          daysLeft: days,
          endDateLabel: format(end, "dd MMM yyyy", { locale: ptBR }),
        } as ClosingStudent;
      })
      .filter((x): x is ClosingStudent => !!x)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [activeStudents, libertyProfileMap]);

  const firstName = (profile?.full_name || "").split(" ")[0] || "mentor";

  // Notificações do mentor
  const { data: notifications = [], refetch: refetchNotifications } = useQuery({
    queryKey: ["mentor-notifications", profile?.user_id],
    queryFn: async () => {
      if (!profile?.user_id) return [];
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", profile.user_id)
        .order("created_at", { ascending: false })
        .limit(8);
      return data || [];
    },
    enabled: !!profile?.user_id,
    staleTime: 60_000,
    refetchInterval: 300_000,

  });
  const unreadCount = notifications.filter((n: any) => !n.read_at).length;

  const markAllRead = async () => {
    if (!profile?.user_id || unreadCount === 0) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", profile.user_id).is("read_at", null);
    refetchNotifications();
  };



  return (
    <AppLayout role="mentor">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-8">
        <GoogleCalendarBanner />



        {/* Header com filtro de mês (layout original) */}
        <motion.div variants={fadeUpItem} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1">Mentoria</p>
            <h1 className="text-2xl font-semibold text-foreground">
              {greeting}, {firstName}
            </h1>
            <p className="text-sm mt-1.5 text-foreground/80">
              Você já impactou{" "}
              <span className="tabular-nums font-semibold text-primary text-base">{companiesImpacted}</span>{" "}
              {companiesImpacted === 1 ? "empresa" : "empresas"}.
            </p>
            <p className="text-muted-foreground text-xs mt-1 capitalize">
              {viewMode === "month" ? format(currentMonth, "MMMM yyyy", { locale: ptBR }) : "Visão geral · todos os períodos"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
              <button
                onClick={() => setViewMode("month")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${viewMode === "month" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Mês
              </button>
              <button
                onClick={() => setViewMode("overview")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${viewMode === "overview" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Geral
              </button>
            </div>
            {viewMode === "month" && (
              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <span className="text-sm font-semibold text-foreground capitalize min-w-[140px] text-center">
                  {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
                </span>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            )}
          </div>
        </motion.div>

        {/* Stats do período (layout original) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {stats.map((s) => (
            <motion.button
              key={s.label}
              variants={fadeUpItem}
              onClick={() => {
                if ((s as any).to) navigate((s as any).to);
                else if (s.tab) navigate(`/mentor/sessoes?tab=${s.tab}`);
              }}
              title={s.tooltip}
              className="glass-card p-5 text-left hover:border-primary/40 hover:shadow-lg transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium leading-tight">{s.label}</p>
                <span className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${accentBg[s.accent]} group-hover:scale-110 transition-transform`}>
                  <s.icon className="h-4 w-4" />
                </span>
              </div>
              <p className="text-3xl font-semibold text-foreground tabular-nums leading-none">{s.value}</p>
            </motion.button>
          ))}
        </div>

        {/* Financeiro */}
        <motion.div variants={fadeUpItem} className="glass-card p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><DollarSign className="h-3 w-3 text-status-green" /> Faturamento {viewMode === "month" ? "no mês" : "(geral)"}</p>
            <p className="text-xl font-semibold text-status-green tabular-nums mt-1">
              R$ {(viewMode === "overview" ? totalEarnedAllTime : earnedThisPeriod).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><TrendingUp className="h-3 w-3 text-status-blue" /> Previsto {viewMode === "month" ? "no mês" : "total"}</p>
            <p className="text-xl font-semibold text-status-blue tabular-nums mt-1">
              R$ {projectedThisPeriod.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><Wallet className="h-3 w-3 text-primary" /> Acumulado no programa</p>
            <p className="text-xl font-semibold text-primary tabular-nums mt-1">
              R$ {totalEarnedAllTime.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </motion.div>

        <MentorActionBanner />


        {/* Encerramentos próximos — útil para o mentor saber quais alunos estão finalizando o programa */}
        <MentorClosingSoon students={closingSoon} />

        {/* Pending reports alert */}
        {pendingReports.length > 0 && (
          <motion.div variants={fadeUpItem} className="border border-status-yellow/30 bg-status-yellow/5 rounded-xl p-5">
            <div className="flex items-center gap-2 text-status-yellow text-sm font-medium mb-3">
              <AlertTriangle className="h-4 w-4" />
              Você tem {pendingReports.length === 1 ? "1 sessão" : `${pendingReports.length} sessões`} sem relatório
            </div>
            <div className="space-y-2">
              {pendingReports.map((b) => (
                <div key={b.id} className="flex items-center justify-between">
                  <div>
                    {b.liberty_id ? (
                      <button
                        onClick={() => navigate(`/mentor/alunos/${b.liberty_id}`)}
                        className="text-sm text-foreground hover:text-primary hover:underline transition-colors"
                      >
                        {shortName(libertyMap[b.liberty_id] || "Membro")}
                      </button>
                    ) : (
                      <span className="text-sm text-foreground">{shortName(b.guest_name || "Membro")}</span>
                    )}
                    <span className="text-xs text-muted-foreground ml-2">
                      {sessionMap[b.session_id] || "Sessão"} · {format(parseISO(b.scheduled_date), "dd MMM", { locale: ptBR })}
                    </span>
                  </div>
                  <button
                    onClick={() => navigate(`/mentor/sessoes/${b.id}/relatorio`)}
                    className="text-xs text-primary hover:underline transition-colors flex items-center gap-1"
                  >
                    <FileText className="h-3 w-3" /> Preencher →
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Notificações agora aparecem no sino fixo no topo (NotificationsBell) */}



        {upcoming.length > 0 && (
          <motion.div variants={fadeUpItem}>
            <div className="flex items-end justify-between mb-3">
              <h2 className="text-lg font-semibold text-foreground">Próximas sessões agendadas</h2>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {upcomingAll.length} no total
              </span>
            </div>

            <div className="space-y-2">
              {upcoming.map((b) => {
                const memberName = libertyMap[b.liberty_id] || b.guest_name || "Membro";
                const sName = sessionMap[b.session_id] || "Sessão";
                const dateObj = parseISO(b.scheduled_date);
                return (
                  <div key={b.id} className="glass-card p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-muted flex flex-col items-center justify-center shrink-0">
                        <span className="text-[9px] text-muted-foreground leading-none">{format(dateObj, "MMM", { locale: ptBR })}</span>
                        <span className="text-sm font-semibold text-foreground leading-tight">{format(dateObj, "dd")}</span>
                      </div>
                      <button
                        onClick={() => b.liberty_id && navigate(`/mentor/alunos/${b.liberty_id}`)}
                        className="text-left min-w-0"
                        disabled={!b.liberty_id}
                      >
                        <p className="text-sm font-medium text-foreground truncate hover:text-primary transition-colors">{shortName(memberName)}</p>
                        <p className="text-xs text-muted-foreground truncate">{sName} · {format(dateObj, "dd MMM", { locale: ptBR })} · {b.start_time.slice(0, 5)}</p>

                      </button>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {b.zoom_join_url && (
                        <a href={b.zoom_join_url} target="_blank" rel="noopener noreferrer" className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted/40 flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" /> Zoom
                        </a>
                      )}
                      <button
                        onClick={() => navigate(`/mentor/sessoes/${b.id}/relatorio`)}
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/15 text-primary hover:bg-primary/15 flex items-center gap-1"
                      >
                        <FileText className="h-3 w-3" /> Relatório
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}






        {/* Completed sessions with tasks */}
        {completed.length > 0 && (
          <motion.div variants={fadeUpItem}>
            <h2 className="text-lg font-semibold text-foreground mb-4">Sessões realizadas</h2>
            <div className="space-y-3">
              {completed.map((b) => {
                const bTasks = monthTasksAll.filter((t) => t.booking_id === b.id);
                const completedCount = bTasks.filter((t) => t.is_completed).length;
                const isExpanded = expandedMember === b.id;
                const hasReport = reportSet.has(b.id);
                const requiresReport = bookingRequiresReport(b);

                return (
                  <div key={b.id} className="glass-card overflow-hidden">
                    <div
                      onClick={() => setExpandedMember(isExpanded ? null : b.id)}
                      className="w-full p-4 flex items-center justify-between text-left cursor-pointer hover:bg-muted/20 transition-colors"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-status-green/10 flex items-center justify-center text-sm font-medium text-foreground shrink-0">
                          {initials(libertyMap[b.liberty_id] || b.guest_name || "M")}
                        </div>
                        <div className="min-w-0">
                          {b.liberty_id ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/mentor/alunos/${b.liberty_id}`); }}
                              className="text-sm font-medium text-foreground hover:text-primary hover:underline transition-colors text-left"
                            >
                              {shortName(libertyMap[b.liberty_id] || "Membro")}
                            </button>
                          ) : (
                            <p className="text-sm font-medium text-foreground">{shortName(b.guest_name || "Membro")}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {sessionMap[b.session_id] || "Sessão"} · {format(parseISO(b.scheduled_date), "dd MMM", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {bTasks.length > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {completedCount}/{bTasks.length} tarefas
                          </span>
                        )}
                        {requiresReport && !hasReport && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-yellow/15 text-status-yellow border border-status-yellow/20">
                            Sem relatório
                          </span>
                        )}
                        {(hasReport || requiresReport) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/mentor/sessoes/${b.id}/relatorio`); }}
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            <FileText className="h-3 w-3" /> {hasReport ? "Ver" : "Preencher"}
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-border/30 pt-3">
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
            </div>
          </motion.div>
        )}

        {/* Results ranking */}
        <MentorResultsSection mentorId={profile?.id} />
      </motion.div>
    </AppLayout>
  );
};

// Sub-component for mentor results
const MentorResultsSection = ({ mentorId }: { mentorId?: string }) => {
  const { data: mentorBookings = [] } = useQuery({
    queryKey: ["mentor-results-bookings", mentorId],
    queryFn: async () => {
      if (!mentorId) return [];
      const { data } = await supabase
        .from("bookings")
        .select("id, liberty_id, scheduled_date, start_time, end_time, status")
        .eq("mentor_id", mentorId)
      return (data || []).filter((b) => isVisibleSessionBooking(b) && getEffectiveBookingStatus(b) === "completed");
    },
    enabled: !!mentorId,
  });

  const bookingIds = mentorBookings.map((b) => b.id);
  const { data: tasks = [] } = useQuery({
    queryKey: ["mentor-results-tasks", bookingIds],
    queryFn: async () => {
      if (!bookingIds.length) return [];
      const { data } = await supabase
        .from("session_tasks")
        .select("*")
        .in("booking_id", bookingIds)
        .eq("is_completed", true);
      return data || [];
    },
    enabled: bookingIds.length > 0,
  });

  const libertyIds = [...new Set(mentorBookings.map((b) => b.liberty_id))];
  const { data: libertyProfiles = [] } = useQuery({
    queryKey: ["mentor-results-profiles", libertyIds],
    queryFn: async () => {
      if (!libertyIds.length) return [];
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", libertyIds);
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
      result[t.booking_id] = libertyToName[libertyId] || "Membro";
    });
    return result;
  }, [tasks, mentorBookings, libertyProfiles]);

  if (tasks.length === 0) return null;

  return <ResultsRanking tasks={tasks} profileMap={profileMap} />;
};

// History panel for the featured upcoming session
const MemberHistoryPanel = ({
  mentorId,
  libertyId,
  excludeBookingId,
  sessionMap,
}: {
  mentorId: string;
  libertyId: string;
  excludeBookingId: string;
  sessionMap: Record<string, string>;
}) => {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  const { data: pastBookings = [] } = useQuery({
    queryKey: ["mentor-past-with-liberty", mentorId, libertyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id, session_id, scheduled_date, start_time, status, report_required, is_retroactive")
        .eq("mentor_id", mentorId)
        .eq("liberty_id", libertyId)
        .neq("id", excludeBookingId)
        .order("scheduled_date", { ascending: false });
      return sortByScheduledDateDesc((data || []).filter((b) => isVisibleSessionBooking(b) && getEffectiveBookingStatus(b) === "completed"));
    },
  });

  const bookingIds = pastBookings.map((b) => b.id);
  const { data: reports = [] } = useQuery({
    queryKey: ["mentor-past-reports", bookingIds],
    queryFn: async () => {
      if (!bookingIds.length) return [];
      const { data } = await supabase
        .from("booking_reports")
        .select("*")
        .in("booking_id", bookingIds);
      return data || [];
    },
    enabled: bookingIds.length > 0,
  });

  if (pastBookings.length === 0) {
    return (
      <div className="relative mt-6 pt-6 border-t border-border/40">
        <p className="text-xs text-muted-foreground italic">
          Esta é a primeira sessão deste aluno com você. Clique em "Ficha do aluno" para ver o cadastro completo e respostas do onboarding.
        </p>
      </div>
    );
  }

  const reportMap = Object.fromEntries(reports.map((r) => [r.booking_id, r]));
  const lastBooking = pastBookings[0];
  const lastReport = reportMap[lastBooking.id];
  const lastRequiresReport = bookingRequiresReport(lastBooking);
  const olderBookings = pastBookings.slice(1);

  return (
    <div className="relative mt-6 pt-6 border-t border-border/40 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-foreground text-sm font-semibold">
          <History className="h-4 w-4 text-primary" />
          Resumo da última sessão
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {sessionMap[lastBooking.session_id] || "Sessão"} · {format(parseISO(lastBooking.scheduled_date), "dd MMM yyyy", { locale: ptBR })}
        </span>
      </div>

      {lastReport ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {lastReport.summary && (
            <div className="md:col-span-3 rounded-xl bg-background/40 border border-border/40 p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Resumo</p>
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed line-clamp-6">{lastReport.summary}</p>
            </div>
          )}
          {lastReport.goals && (
            <div className="rounded-xl bg-background/40 border border-border/40 p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Metas</p>
              <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-5">{lastReport.goals}</p>
            </div>
          )}
          {lastReport.action_plan && (
            <div className="rounded-xl bg-background/40 border border-border/40 p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Plano de ação</p>
              <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-5">{lastReport.action_plan}</p>
            </div>
          )}
          {lastReport.mentor_impressions && (
            <div className="rounded-xl bg-background/40 border border-border/40 p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Suas impressões</p>
              <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-5">{lastReport.mentor_impressions}</p>
            </div>
          )}
        </div>
      ) : lastRequiresReport ? (
        <p className="text-xs text-status-yellow">A última sessão ainda não tem relatório preenchido.</p>
      ) : (
        <p className="text-xs text-muted-foreground">Esta sessão é concluída pelo próprio diagnóstico e não exige relatório adicional.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(lastReport || lastRequiresReport) && (
          <button
            onClick={() => navigate(`/mentor/sessoes/${lastBooking.id}/relatorio`)}
            className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/15 transition-colors flex items-center gap-1.5"
          >
            <FileText className="h-3 w-3" /> {lastReport ? "Ver relatório completo" : "Preencher relatório"}
          </button>
        )}
        {olderBookings.length > 0 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors flex items-center gap-1.5"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${showAll ? "rotate-180" : ""}`} />
            {showAll ? "Ocultar" : `Ver outras ${olderBookings.length === 1 ? "1 sessão" : `${olderBookings.length} sessões`}`}
          </button>
        )}
      </div>

      {showAll && olderBookings.length > 0 && (
        <div className="space-y-2 pt-2">
          {olderBookings.map((pb) => {
            const r = reportMap[pb.id];
            const requiresReport = bookingRequiresReport(pb);
            return (
              <button
                key={pb.id}
                onClick={() => (r || requiresReport) && navigate(`/mentor/sessoes/${pb.id}/relatorio`)}
                className={`w-full text-left rounded-lg border border-border/40 bg-background/30 p-3 transition-colors ${r || requiresReport ? "hover:border-primary/40" : "cursor-default"}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-foreground">{sessionMap[pb.session_id] || "Sessão"}</span>
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {format(parseISO(pb.scheduled_date), "dd MMM yyyy", { locale: ptBR })}
                  </span>
                </div>
                {r?.summary ? (
                  <p className="text-xs text-muted-foreground line-clamp-2">{r.summary}</p>
                ) : requiresReport ? (
                  <p className="text-xs text-status-yellow italic">Sem relatório</p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Não exige relatório adicional</p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MentorDashboardPage;

