import { useMemo } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { RankingHighlightsBlock } from "@/components/RankingHighlightsBlock";
import { Calendar, Map, BookOpen, TrendingUp, BarChart3, ListChecks, Sprout, Leaf, TreePine, Trophy, ExternalLink } from "lucide-react";
import { LibertyMark } from "@/components/LibertyMark";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format as fmtDate, addDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { demoBookingsForMember, demoTasksForBookings, demoMentorProfiles, demoProfileFill } from "@/lib/demoForUser";
import { getEffectiveBookingStatus, PENDING_CONFIRMATION_HINT, sortByScheduledDateAsc, todayPlatformDate } from "@/lib/bookingStatus";
import { UrgencyBookingCard } from "@/components/UrgencyBookingCard";
import { PendingNpsCard } from "@/components/PendingNpsCard";
import { MemberTimeline } from "@/components/MemberTimeline";
import { WeekTasksBento } from "@/components/WeekTasksBento";
import { useJourneyProgress } from "@/hooks/useJourneyProgress";
import { Button } from "@/components/ui/button";
import {
  ErrorState,
  ListRow,
  LoadingState,
  PageContainer,
  PageHeader,
  ProgressBar,
  SectionCard,
  SectionHeader,
  Stat,
  StatusPill,
} from "@/components/ds";

const DashboardPage = () => {
  const { profile } = useAuth();
  const firstName = profile?.full_name?.split(" ")[0] ?? "...";

  const {
    demoEnabled,
    sessions,
    bookings,
    realBookingIds: allBookingIds,
    progress: progressData,
    isLoading,
    isError,
    refetch,
  } = useJourneyProgress();

  // Tarefas fictícias (modo demo do admin) seguem os mesmos bookings fictícios do hook.
  const demoBks = useMemo(
    () => (demoEnabled && profile?.id ? demoBookingsForMember(profile.id) : []),
    [demoEnabled, profile?.id]
  );
  const demoTks = useMemo(() => demoTasksForBookings(demoBks), [demoBks]);

  const { data: _tasks = [] } = useQuery({
    queryKey: ["liberty-tasks", allBookingIds],
    queryFn: async () => {
      if (!allBookingIds.length) return [];
      const { data, error } = await supabase
        .from("session_tasks")
        .select("*")
        .in("booking_id", allBookingIds)
        .order("created_at");
      if (error) throw error;
      return data || [];
    },
    enabled: allBookingIds.length > 0,
  });

  const tasks = demoEnabled ? [..._tasks, ...demoTks] : _tasks;
  const sessionMap = Object.fromEntries(sessions.map((s) => [s.id, s.name]));
  const sessionCoverMap = Object.fromEntries(sessions.map((s) => [s.id, s.cover_image_url]));
  const {
    completedCount: completedSessions,
    pendingConfirmationCount,
    scheduledCount: scheduledSessionsCount,
    totalSessions,
  } = progressData;
  const progress = (completedSessions / totalSessions) * 100;

  const mentorIds = [...new Set(bookings.map((b) => b.mentor_id).filter((id) => !id.startsWith("demo-")))];
  const { data: _mentorProfiles = [] } = useQuery({
    queryKey: ["mentor-profiles", mentorIds],
    queryFn: async () => {
      if (!mentorIds.length) return [];
      const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", mentorIds);
      if (error) throw error;
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
      const { data, error } = await supabase.from("booking_reports").select("booking_id, summary").in("booking_id", allBookingIds);
      if (error) throw error;
      return data || [];
    },
    enabled: allBookingIds.length > 0,
  });
  const reportsMap = Object.fromEntries(reports.map((r) => [r.booking_id, r]));

  const completedTasks = tasks.filter((t) => t.is_completed);
  const pendingTasks = tasks.filter((t) => !t.is_completed);
  const taskProgress = tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0;

  // Próxima sessão: futura (`scheduled`) ou ainda aguardando aprovação. Sessões que já passaram
  // sem fechamento do mentor viram "A confirmar" e não são "próximas".
  const nextScheduled = sortByScheduledDateAsc(bookings).find((b) => {
    const s = getEffectiveBookingStatus(b);
    return s === "scheduled" || s === "pending_approval";
  });
  const nextScheduledStatus = nextScheduled ? getEffectiveBookingStatus(nextScheduled) : null;

  // Count available days in the next 21 days (for the booking CTA)
  const { data: availabilityCount = 0 } = useQuery({
    queryKey: ["liberty-availability-count"],
    queryFn: async () => {
      // Data de hoje no fuso da plataforma (não no fuso do navegador).
      const today = parseISO(todayPlatformDate());
      const { data, error } = await supabase
        .from("mentor_availability")
        .select("specific_date, day_of_week, is_recurring, is_booked")
        .eq("is_booked", false);
      if (error) throw error;
      if (!data) return 0;
      const days = new Set<string>();
      for (let i = 0; i < 21; i++) {
        const d = addDays(today, i);
        const dow = d.getDay();
        const ds = fmtDate(d, "yyyy-MM-dd");
        const has = data.some((a) =>
          a.is_recurring ? a.day_of_week === dow : a.specific_date === ds
        );
        if (has) days.add(ds);
      }
      return days.size;
    },
  });

  const tasksWithResults = completedTasks.filter((t) => t.result_value);

  // Nome da sessão por booking, para o bloco "Tarefas da semana".
  const sessionNameByBooking = Object.fromEntries(
    bookings.map((b) => [b.id, sessionMap[b.session_id] || "Sessão"])
  );

  const taskPct = Math.round(taskProgress);
  const tier =
    taskPct >= 95 ? { name: "Liberty", icon: <LibertyMark size={22} />, next: null } :
    taskPct >= 85 ? { name: "Águia", icon: <TreePine className="h-5 w-5 text-status-yellow" aria-hidden />, next: 95 } :
    taskPct >= 75 ? { name: "Falcão", icon: <TreePine className="h-5 w-5 text-status-yellow" aria-hidden />, next: 85 } :
    taskPct >= 50 ? { name: "Muda", icon: <Leaf className="h-5 w-5 text-status-yellow" aria-hidden />, next: 75 } :
    taskPct >= 25 ? { name: "Broto", icon: <Leaf className="h-5 w-5 text-status-yellow" aria-hidden />, next: 50 } :
    { name: "Semente", icon: <Sprout className="h-5 w-5 text-status-yellow" aria-hidden />, next: 25 };

  const nextSessionName = nextScheduled ? sessionMap[nextScheduled.session_id] || "Sessão" : "";
  const nextSessionCover = nextScheduled ? sessionCoverMap[nextScheduled.session_id] : null;

  return (
    <AppLayout role="liberty">
      <PageContainer>
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-8">
          {/* 1. Saudação */}
          <motion.div variants={fadeUpItem}>
            <PageHeader
              size="large"
              eyebrow="Minha jornada"
              title={`Olá, ${firstName}`}
              description="Continue de onde parou."
            />
          </motion.div>

          {isError && (
            <motion.div variants={fadeUpItem}>
              <ErrorState
                compact
                title="Não foi possível carregar suas sessões"
                description="Os números abaixo podem estar incompletos. Verifique sua conexão e tente novamente."
                onRetry={() => void refetch()}
              />
            </motion.div>
          )}

          {isLoading ? (
            <motion.div variants={fadeUpItem}>
              <LoadingState variant="page" />
            </motion.div>
          ) : (
            <>
              {/* 2. Próxima sessão (ou aviso para agendar) */}
              {nextScheduled ? (
                <motion.div variants={fadeUpItem}>
                  <SectionCard padding="none" as="section" aria-labelledby="next-session-title">
                    {nextSessionCover && (
                      <div className="relative h-32 w-full overflow-hidden rounded-t-ds-lg">
                        <img src={nextSessionCover} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="p-4 sm:p-6">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <p className="ds-kicker inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-status-blue" aria-hidden />
                          Próxima sessão
                        </p>
                        {nextScheduledStatus && <StatusPill status={nextScheduledStatus} size="sm" />}
                      </div>
                      <h2 id="next-session-title" className="text-[17px] font-semibold text-foreground leading-tight">
                        {nextSessionName}
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1 first-letter:uppercase">
                        {fmtDate(parseISO(nextScheduled.scheduled_date), "EEEE, dd 'de' MMMM", { locale: ptBR })} · {nextScheduled.start_time?.slice(0, 5)}
                      </p>
                      <p className="text-sm text-muted-foreground">com {mentorMap[nextScheduled.mentor_id] || "Mentor"}</p>
                      <div className="flex flex-col sm:flex-row gap-2 mt-4">
                        {nextScheduledStatus === "scheduled" && nextScheduled.zoom_join_url && (
                          <Button asChild className="w-full sm:w-auto">
                            <a href={nextScheduled.zoom_join_url} target="_blank" rel="noopener noreferrer">
                              Acessar Zoom
                              <ExternalLink className="h-4 w-4" aria-hidden />
                            </a>
                          </Button>
                        )}
                        <Button asChild variant="outline" className="w-full sm:w-auto">
                          <Link to="/agenda">Ver minha agenda</Link>
                        </Button>
                      </div>
                    </div>
                  </SectionCard>
                </motion.div>
              ) : (
                <motion.div variants={fadeUpItem}>
                  <UrgencyBookingCard
                    scheduledCount={scheduledSessionsCount}
                    completedCount={completedSessions}
                    availabilityCount={availabilityCount}
                  />
                </motion.div>
              )}

              {/* 3. Progresso */}
              <motion.section variants={fadeUpItem} aria-labelledby="progress-title" className="space-y-3">
                <SectionHeader
                  title={<span id="progress-title">Seu progresso</span>}
                  actions={
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/jornada">Ver jornada</Link>
                    </Button>
                  }
                />
                <SectionCard>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <Stat
                        icon={Calendar}
                        label="Sessões realizadas"
                        value={`${completedSessions}/${totalSessions}`}
                        hint={`${Math.round(progress)}% da jornada`}
                        tone="success"
                      />
                      <ProgressBar value={completedSessions} max={totalSessions} tone="success" label="Sessões realizadas" />
                      <div className="flex flex-wrap gap-2">
                        {scheduledSessionsCount > 0 && (
                          <StatusPill tone="info" size="sm">
                            {scheduledSessionsCount} agendada{scheduledSessionsCount !== 1 ? "s" : ""}
                          </StatusPill>
                        )}
                        {pendingConfirmationCount > 0 && (
                          <span title={PENDING_CONFIRMATION_HINT} className="inline-flex">
                            <StatusPill tone="pending" size="sm">
                              {pendingConfirmationCount} a confirmar
                            </StatusPill>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Stat
                        icon={ListChecks}
                        label="Tarefas concluídas"
                        value={`${completedTasks.length}/${tasks.length}`}
                        hint={`${pendingTasks.length} pendente${pendingTasks.length !== 1 ? "s" : ""}`}
                        tone="brand"
                      />
                      <ProgressBar value={completedTasks.length} max={Math.max(tasks.length, 1)} tone="brand" label="Tarefas concluídas" />
                    </div>
                  </div>
                  {tasks.length > 0 && (
                    <div className="mt-5 pt-5 border-t border-border flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-status-yellow/15 border border-status-yellow/30 flex items-center justify-center shrink-0">
                        {tier.icon}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Nível {tier.name}</p>
                        <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                          {taskPct}% das tarefas concluídas
                          {tier.next
                            ? ` · Faltam ${tier.next - taskPct}% para o próximo nível`
                            : <span className="inline-flex items-center gap-1"> · Nível máximo <Trophy className="h-3 w-3" aria-hidden /></span>}
                        </p>
                      </div>
                    </div>
                  )}
                </SectionCard>
              </motion.section>

              {/* 4. Tarefas da semana */}
              {tasks.length > 0 && (
                <motion.div variants={fadeUpItem} className="space-y-3">
                  <WeekTasksBento tasks={tasks} sessionNameByBooking={sessionNameByBooking} />
                  <div className="flex justify-end">
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/tarefas">Ver todas as tarefas</Link>
                    </Button>
                  </div>
                </motion.div>
              )}


              {/* Linha do tempo: realizado × projetado */}
              <motion.div variants={fadeUpItem}>
                <MemberTimeline
                  profile={demoEnabled ? demoProfileFill(profile) : profile}
                  bookings={bookings}
                  sessionNames={sessionMap}
                  journeySessionIds={progressData.journeySessionIds}
                  mentorNames={mentorMap}
                  reports={reportsMap}
                  hideReportButton
                />
              </motion.div>






              {/* Meus resultados */}
              {tasksWithResults.length > 0 && (
                <motion.section variants={fadeUpItem} aria-labelledby="results-title" className="space-y-3">
                  <SectionHeader
                    title={<span id="results-title">Meus resultados</span>}
                    description={`${tasksWithResults.length} resultado${tasksWithResults.length !== 1 ? "s" : ""} registrado${tasksWithResults.length !== 1 ? "s" : ""}`}
                  />
                  <SectionCard padding="none">
                    {tasksWithResults.map((task, i) => {
                      const booking = bookings.find((b) => b.id === task.booking_id);
                      const sName = booking ? sessionMap[booking.session_id] : "Sessão";
                      const isQuantitative = task.result_type === "quantitative";
                      return (
                        <ListRow
                          key={task.id}
                          leading={
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isQuantitative ? "bg-status-green/15" : "bg-status-blue/15"}`}>
                              {isQuantitative
                                ? <TrendingUp className="h-4 w-4 text-status-green" aria-hidden />
                                : <BarChart3 className="h-4 w-4 text-status-blue" aria-hidden />}
                            </div>
                          }
                          title={task.result_value}
                          subtitle={`${task.description} · ${sName}${task.result_metric ? ` · ${task.result_metric}` : ""}`}
                          trailing={
                            <StatusPill tone={isQuantitative ? "success" : "info"} size="sm" withDot={false}>
                              {isQuantitative ? "Quantitativo" : "Qualitativo"}
                            </StatusPill>
                          }
                          last={i === tasksWithResults.length - 1}
                        />
                      );
                    })}
                  </SectionCard>
                </motion.section>
              )}

              {/* Atalhos */}
              <motion.div variants={fadeUpItem}>
                <SectionCard padding="none">
                  <ListRow
                    href="/jornada"
                    leading={
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Map className="h-4 w-4 text-primary" aria-hidden />
                      </div>
                    }
                    title="Minha jornada"
                    subtitle="Progresso completo e histórico de sessões"
                  />
                  <ListRow
                    href="/conteudos"
                    leading={
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <BookOpen className="h-4 w-4 text-primary" aria-hidden />
                      </div>
                    }
                    title="Conteúdos"
                    subtitle="Materiais, ferramentas e templates"
                    last
                  />
                </SectionCard>
              </motion.div>

              {/* 5. NPS e ranking */}
              <motion.div variants={fadeUpItem}>
                <PendingNpsCard />
              </motion.div>

              <motion.div variants={fadeUpItem}>
                <RankingHighlightsBlock />
              </motion.div>
            </>
          )}
        </motion.div>
      </PageContainer>
    </AppLayout>
  );
};

export default DashboardPage;
