import { useMemo } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { RankingHighlightsBlock } from "@/components/RankingHighlightsBlock";
import { Calendar, ArrowRight, BookOpen, Headphones, ChevronDown, TrendingUp, BarChart3, ListChecks, Sprout, Leaf, TreePine, Trophy } from "lucide-react";
import { LibertyMark } from "@/components/LibertyMark";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format as fmtDate, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useDemoData } from "@/contexts/DemoDataContext";
import { demoBookingsForMember, demoTasksForBookings, demoMentorProfiles, mergeDemoSessions, demoProfileFill } from "@/lib/demoForUser";
import { getEffectiveBookingStatus, isVisibleSessionBooking, sortByScheduledDateAsc } from "@/lib/bookingStatus";
import { UrgencyBookingCard } from "@/components/UrgencyBookingCard";
import { PendingNpsCard } from "@/components/PendingNpsCard";
import { MemberTimeline } from "@/components/MemberTimeline";
import { buildSessionProgress } from "@/lib/sessionProgress";

const DashboardPage = () => {
  const { profile } = useAuth();
  const { demoEnabled } = useDemoData();
  
  const firstName = profile?.full_name?.split(" ")[0] ?? "...";

  const { data: _bookings = [] } = useQuery({
    queryKey: ["liberty-bookings", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("bookings")
        .select("id, status, session_id, scheduled_date, start_time, end_time, mentor_id, zoom_join_url")
        .eq("liberty_id", profile.id)
        .order("scheduled_date");
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const demoBks = useMemo(
    () => (demoEnabled && profile?.id ? demoBookingsForMember(profile.id) : []),
    [demoEnabled, profile?.id]
  );
  const demoTks = useMemo(() => demoTasksForBookings(demoBks), [demoBks]);
  const bookings = (demoEnabled ? [..._bookings, ...demoBks] : _bookings).filter(isVisibleSessionBooking);

  // completedSessions is computed below (after sessions query) excluding onboarding (order=0)

  const allBookingIds = bookings.map((b) => b.id);
  const { data: _tasks = [] } = useQuery({
    queryKey: ["liberty-tasks", allBookingIds],
    queryFn: async () => {
      if (!allBookingIds.length) return [];
      const { data } = await supabase
        .from("session_tasks")
        .select("*")
        .in("booking_id", allBookingIds)
        .order("created_at");
      return data || [];
    },
    enabled: allBookingIds.length > 0,
  });

  const { data: _sessions = [] } = useQuery({
    queryKey: ["sessions-map"],
    queryFn: async () => {
      const { data } = await supabase.from("sessions").select("id, name, cover_image_url, \"order\"").order("order");
      return data || [];
    },
  });
  const sessions = demoEnabled ? mergeDemoSessions(_sessions as any[]) : _sessions;
  const tasks = demoEnabled ? [..._tasks, ...demoTks] : _tasks;
  const sessionMap = Object.fromEntries(sessions.map((s) => [s.id, s.name]));
  const sessionCoverMap = Object.fromEntries(sessions.map((s) => [s.id, s.cover_image_url]));
  const progressData = buildSessionProgress(sessions, bookings);
  const { journeySessions, statusMap, completedCount: completedSessions, scheduledCount: scheduledSessionsCount, totalSessions } = progressData;
  const progress = (completedSessions / totalSessions) * 100;

  const mentorIds = [...new Set(bookings.map((b) => b.mentor_id))];
  const { data: _mentorProfiles = [] } = useQuery({
    queryKey: ["mentor-profiles", mentorIds],
    queryFn: async () => {
      if (!mentorIds.length) return [];
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", mentorIds);
      return data || [];
    },
    enabled: mentorIds.length > 0,
  });
  const mentorProfiles = demoEnabled ? [..._mentorProfiles, ...demoMentorProfiles] : _mentorProfiles;
  const mentorMap = Object.fromEntries(mentorProfiles.map((p) => [p.id, p.full_name]));

  const { data: reports = [] } = useQuery({
    queryKey: ["dashboard-reports", allBookingIds],
    queryFn: async () => {
      if (!allBookingIds.length) return [];
      const { data } = await supabase.from("booking_reports").select("booking_id, summary").in("booking_id", allBookingIds);
      return data || [];
    },
    enabled: allBookingIds.length > 0,
  });
  const reportsMap = Object.fromEntries(reports.map((r: any) => [r.booking_id, r]));

  const completedTasks = tasks.filter((t) => t.is_completed);
  const pendingTasks = tasks.filter((t) => !t.is_completed);
  const taskProgress = tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0;

  const nextScheduled = sortByScheduledDateAsc(bookings).find((b) => getEffectiveBookingStatus(b) === "scheduled");

  // Count available days in the next 21 days (for the booking CTA)
  const { data: availabilityCount = 0 } = useQuery({
    queryKey: ["liberty-availability-count"],
    queryFn: async () => {
      const today = new Date();
      const horizon = addDays(today, 21);
      const { data } = await supabase
        .from("mentor_availability")
        .select("specific_date, day_of_week, is_recurring, is_booked")
        .eq("is_booked", false);
      if (!data) return 0;
      const days = new Set<string>();
      for (let i = 0; i < 21; i++) {
        const d = addDays(today, i);
        const dow = d.getDay();
        const ds = fmtDate(d, "yyyy-MM-dd");
        const has = data.some((a: any) =>
          a.is_recurring ? a.day_of_week === dow : a.specific_date === ds
        );
        if (has) days.add(ds);
      }
      return days.size;
    },
  });

  const sessionSummaries = journeySessions.map((s) => {
    const booking = statusMap.get(s.id)?.booking || sortByScheduledDateAsc(bookings).find((b) => b.session_id === s.id);
    const sessionTasks = booking ? tasks.filter((t) => t.booking_id === booking.id) : [];
    const done = sessionTasks.filter((t) => t.is_completed).length;
    return { session: s, booking, status: statusMap.get(s.id)?.status || "pending", totalTasks: sessionTasks.length, completedTaskCount: done };
  });

  const tasksWithResults = completedTasks.filter((t) => t.result_value);

  return (
    <AppLayout role="liberty">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-8">
        <motion.div variants={fadeUpItem}>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1">Minha jornada</p>
          <h1 className="text-2xl font-semibold text-foreground">Olá, {firstName}</h1>
          <p className="text-muted-foreground text-sm mt-1">Continue de onde parou.</p>
        </motion.div>

        {/* Progress Hero */}
        <motion.div variants={fadeUpItem} className="glass-card p-6 relative overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.14em] mb-2 font-semibold flex items-center gap-1.5"><Calendar className="h-3 w-3" /> Sessões</p>
              <p className="text-foreground text-base mb-3">
                Sessão <span className="font-semibold text-foreground tabular-nums">{Math.min(completedSessions + 1, totalSessions)}</span> de {totalSessions}
              </p>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
                  className="h-full rounded-full bg-status-green"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2 tabular-nums">
                {completedSessions}/{totalSessions} concluídas · {Math.round(progress)}%
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.14em] mb-2 font-semibold flex items-center gap-1.5"><ListChecks className="h-3 w-3" /> Tarefas</p>
              <p className="text-foreground text-base mb-3">
                <span className="font-semibold text-foreground tabular-nums">{completedTasks.length}</span> de {tasks.length} concluídas
              </p>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${taskProgress}%` }}
                  transition={{ duration: 1, delay: 0.7, ease: "easeOut" }}
                  className="h-full rounded-full bg-primary"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2 tabular-nums">
                {pendingTasks.length} pendente{pendingTasks.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          {tasks.length > 0 && (() => {
            const pct = Math.round(taskProgress);
            const tier =
              pct >= 95 ? { name: "Liberty", icon: <LibertyMark size={22} />, next: null } :
              pct >= 85 ? { name: "Águia", icon: <TreePine className="h-5 w-5 text-status-yellow" />, next: 95 } :
              pct >= 75 ? { name: "Falcão", icon: <TreePine className="h-5 w-5 text-status-yellow" />, next: 85 } :
              pct >= 50 ? { name: "Muda", icon: <Leaf className="h-5 w-5 text-status-yellow" />, next: 75 } :
              pct >= 25 ? { name: "Broto", icon: <Leaf className="h-5 w-5 text-status-yellow" />, next: 50 } :
              { name: "Semente", icon: <Sprout className="h-5 w-5 text-status-yellow" />, next: 25 };
            return (
              <div className="mt-5 pt-5 border-t border-border flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-status-yellow/15 border-2 border-status-yellow flex items-center justify-center">
                  {tier.icon}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    Nível {tier.name}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    {pct}% das tarefas concluídas
                    {tier.next
                      ? ` · Faltam ${tier.next - pct}% para o próximo nível`
                      : <span className="inline-flex items-center gap-1"> · Nível máximo <Trophy className="h-3 w-3" /></span>}
                  </p>
                </div>
              </div>
            );
          })()}
        </motion.div>


        {/* ===== NPS PENDENTE — avaliação de sessões realizadas ===== */}
        <motion.div variants={fadeUpItem}>
          <PendingNpsCard />
        </motion.div>

        {/* ===== URGENCY CARD — for members with 0 or 1 scheduled session ===== */}
        <motion.div variants={fadeUpItem}>
          <UrgencyBookingCard
            scheduledCount={scheduledSessionsCount}
            completedCount={completedSessions}
            availabilityCount={availabilityCount}
          />
        </motion.div>


        {/* ===== LINHA DO TEMPO — realizado × projetado ===== */}
        <motion.div variants={fadeUpItem}>
          <MemberTimeline
            profile={demoEnabled ? demoProfileFill(profile as any) : profile}

            bookings={bookings as any}
            sessionNames={sessionMap}
            journeySessionIds={progressData.journeySessionIds}
            mentorNames={mentorMap}
            reports={reportsMap}
            hideReportButton
          />
        </motion.div>

        {/* Estudo de caso do dia: oculto até termos casos reais de membros Begin */}






        {/* ===== MEUS RESULTADOS — right after hero, open by default ===== */}
        {tasksWithResults.length > 0 && (
          <motion.div variants={fadeUpItem}>
            <details open className="group">
              <summary className="flex items-center gap-2 cursor-pointer text-lg font-semibold text-foreground mb-4 list-none select-none">
                <BarChart3 className="h-5 w-5 text-status-green" />
                Meus Resultados
                <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {tasksWithResults.length}
                </span>
                <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-3">
                {tasksWithResults.map((task) => {
                  const booking = bookings.find((b) => b.id === task.booking_id);
                  const sName = booking ? sessionMap[booking.session_id] : "Sessão";
                  const isQuantitative = task.result_type === "quantitative";
                  return (
                    <div key={task.id} className="glass-card p-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isQuantitative ? "bg-status-green/15 border border-border" : "bg-status-blue/15 border border-border"}`}>
                          {isQuantitative ? <TrendingUp className="h-4 w-4 text-status-green" /> : <BarChart3 className="h-4 w-4 text-status-blue" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{task.result_value}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{task.description} · {sName}</p>
                          {task.result_metric && (
                            <span className="inline-block mt-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                              {task.result_metric}
                            </span>
                          )}
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${isQuantitative ? "bg-status-green/10 text-status-green border border-border" : "bg-status-blue/10 text-status-blue border border-border"}`}>
                          {isQuantitative ? "Quantitativo" : "Qualitativo"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          </motion.div>
        )}

        {/* CTA para tarefas — movido para a página dedicada */}
        {tasks.length > 0 && (
          <motion.div variants={fadeUpItem}>
            <Link to="/tarefas" className="glass-card p-5 flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <ListChecks className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Minhas tarefas</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {completedTasks.length}/{tasks.length} concluídas · {pendingTasks.length} pendente{pendingTasks.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm text-primary group-hover:gap-2.5 transition-all">
                Abrir <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          </motion.div>
        )}

        {/* Next session card */}
        {nextScheduled && (
          <motion.div variants={fadeUpItem} className="dark glass-card overflow-hidden border-border bg-card text-card-foreground">
            {sessionCoverMap[nextScheduled.session_id] && (
              <div className="relative h-28 w-full overflow-hidden">
                <img src={sessionCoverMap[nextScheduled.session_id]!} alt={sessionMap[nextScheduled.session_id] || "Sessão"} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                <div className="absolute bottom-3 left-6 right-6">
                  <h3 className="text-lg font-medium text-foreground drop-shadow-sm">{sessionMap[nextScheduled.session_id] || "Sessão"}</h3>
                </div>
              </div>
            )}
            <div className="p-6">
              <div className="flex items-center gap-2 text-status-blue text-xs font-medium uppercase tracking-wider mb-4">
                <Calendar className="h-3.5 w-3.5" />
                <span>Próxima sessão</span>
              </div>
              {!sessionCoverMap[nextScheduled.session_id] && (
                <h3 className="text-lg font-medium text-foreground mb-1">{sessionMap[nextScheduled.session_id] || "Sessão"}</h3>
              )}
              <p className="text-sm text-muted-foreground mb-1 capitalize">
                {fmtDate(new Date(nextScheduled.scheduled_date + "T00:00:00"), "EEEE, dd 'de' MMMM", { locale: ptBR })} · {nextScheduled.start_time?.slice(0, 5)}
              </p>
              <p className="text-sm text-muted-foreground mb-4">com {mentorMap[nextScheduled.mentor_id] || "Mentor"}</p>
              {nextScheduled.zoom_join_url && (
                <a href={nextScheduled.zoom_join_url} target="_blank" rel="noopener noreferrer" className="btn-silver w-full text-sm text-center block">
                  Acessar Zoom
                </a>
              )}
            </div>
          </motion.div>
        )}

        <motion.div variants={fadeUpItem} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link to="/jornada" className="glass-card p-6 group">
            <div className="flex items-center gap-2 text-primary text-xs font-medium uppercase tracking-wider mb-4">
              <BookOpen className="h-3.5 w-3.5" />
              <span>Minha Jornada</span>
            </div>
            <p className="text-sm text-muted-foreground">Veja seu progresso completo e histórico de sessões</p>
            <span className="inline-flex items-center gap-1.5 text-sm text-primary mt-3 group-hover:gap-2.5 transition-all">
              Ver jornada <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
          <Link to="/conteudos" className="glass-card p-6 group">
            <div className="flex items-center gap-2 text-primary text-xs font-medium uppercase tracking-wider mb-4">
              <BookOpen className="h-3.5 w-3.5" />
              <span>Conteúdos</span>
            </div>
            <p className="text-sm text-muted-foreground">Acesse materiais, ferramentas e templates</p>
            <span className="inline-flex items-center gap-1.5 text-sm text-primary mt-3 group-hover:gap-2.5 transition-all">
              Acessar <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        </motion.div>

        {/* ===== RANKING — mais para o final ===== */}
        <motion.div variants={fadeUpItem}>
          <RankingHighlightsBlock />
        </motion.div>
      </motion.div>

      <a
        href="https://wa.me/5511999999999"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-24 lg:bottom-8 right-6 z-20 flex items-center gap-2 btn-silver rounded-full px-5 py-3 shadow-lg"
      >
        <Headphones className="h-4 w-4" />
        <span className="text-sm hidden sm:inline">Falar com suporte</span>
      </a>
    </AppLayout>
  );
};

export default DashboardPage;
