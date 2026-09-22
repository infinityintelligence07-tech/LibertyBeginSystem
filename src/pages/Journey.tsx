import { useState } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { CheckCircle2, Clock, CalendarDays, ChevronDown, ChevronUp, BookOpen, Target, Gift, Lock, LockOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { shortName } from "@/lib/formatName";
import { TaskChecklist } from "@/components/TaskChecklist";
import { getEffectiveBookingStatus, isVisibleSessionBooking, sortByScheduledDateAsc } from "@/lib/bookingStatus";
import { buildSessionProgress } from "@/lib/sessionProgress";
import { MemberTimeline } from "@/components/MemberTimeline";
import { TestimonialsCard } from "@/components/TestimonialsCard";
import { useDemoData } from "@/contexts/DemoDataContext";
import { demoBookingsForMember, demoTasksForBookings, demoReportsForBookings, demoMentorProfiles, demoProfileFill } from "@/lib/demoForUser";
import { useMemo } from "react";

const statusConfig = {
  completed: { label: "Realizada", classes: "bg-status-green/15 text-status-green border border-border", icon: CheckCircle2 },
  scheduled: { label: "Agendada", classes: "bg-status-blue/15 text-status-blue border border-border", icon: CalendarDays },
  pending: { label: "Pendente", classes: "bg-muted text-muted-foreground", icon: Clock },
};

const JourneyPage = () => {
  const { profile } = useAuth();
  const { demoEnabled } = useDemoData();
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  // Demo data injection
  const demoBks = useMemo(
    () => (demoEnabled && profile?.id ? demoBookingsForMember(profile.id) : []),
    [demoEnabled, profile?.id]
  );
  const demoTks = useMemo(() => demoTasksForBookings(demoBks), [demoBks]);
  const demoReps = useMemo(() => demoReportsForBookings(demoBks), [demoBks]);


  // Fetch all 12 sessions
  const { data: sessions = [] } = useQuery({
    queryKey: ["journey-sessions"],
    queryFn: async () => {
      const { data } = await supabase.from("sessions").select("*").eq("is_active", true).order("order");
      return data || [];
    },
  });

  // Fetch member bookings
  const { data: bookings = [] } = useQuery({
    queryKey: ["journey-bookings", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("bookings")
        .select("*")
        .eq("liberty_id", profile.id)
        .order("scheduled_date");
      return data || [];
    },
    enabled: !!profile?.id,
  });

  // Fetch tasks for all bookings
  const bookingIds = bookings.map((b) => b.id);
  const { data: tasks = [] } = useQuery({
    queryKey: ["journey-tasks", bookingIds],
    queryFn: async () => {
      if (!bookingIds.length) return [];
      const { data } = await supabase.from("session_tasks").select("*").in("booking_id", bookingIds).order("created_at");
      return data || [];
    },
    enabled: bookingIds.length > 0,
  });

  // Fetch mentor names
  const mentorIds = [...new Set(bookings.map((b) => b.mentor_id))];
  const { data: mentorProfiles = [] } = useQuery({
    queryKey: ["journey-mentors", mentorIds],
    queryFn: async () => {
      if (!mentorIds.length) return [];
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", mentorIds);
      return data || [];
    },
    enabled: mentorIds.length > 0,
  });
  const mentorMap = Object.fromEntries(mentorProfiles.map((p) => [p.id, p.full_name]));

  // Reports for timeline modal
  const { data: reports = [] } = useQuery({
    queryKey: ["journey-reports", bookingIds],
    queryFn: async () => {
      if (!bookingIds.length) return [];
      const { data } = await supabase.from("booking_reports").select("booking_id, summary").in("booking_id", bookingIds);
      return (data || []) as any[];
    },
    enabled: bookingIds.length > 0,
  });
  // === Overlay demo data (remap demo session_ids -> real session ids) ===
  const remappedDemoBks = useMemo(() => {
    if (!demoEnabled || !sessions.length) return [];
    const realIds = sessions.slice(0, 12).map((s: any) => s.id);
    return demoBks.map((b, i) => ({ ...b, session_id: realIds[i % realIds.length] || b.session_id }));
  }, [demoEnabled, demoBks, sessions]);
  const effectiveBookings: any[] = demoEnabled ? [...bookings, ...remappedDemoBks] : bookings;
  const effectiveTasks: any[] = demoEnabled ? [...tasks, ...demoTks] : tasks;
  const effectiveMentorMap = demoEnabled
    ? { ...mentorMap, ...Object.fromEntries(demoMentorProfiles.map((m) => [m.id, m.full_name])) }
    : mentorMap;
  const reportsMap = Object.fromEntries(
    [...reports, ...(demoEnabled ? demoReps : [])].map((r: any) => [r.booking_id, r])
  );
  const sessionNames = Object.fromEntries(sessions.map((s: any) => [s.id, s.name]));

  const visibleBookings = effectiveBookings.filter(isVisibleSessionBooking);
  const progressData = buildSessionProgress(sessions, visibleBookings);
  const { journeySessions, statusMap, completedCount, scheduledCount, totalSessions } = progressData;
  const bookingBySession = Object.fromEntries(
    sortByScheduledDateAsc(visibleBookings.filter((b) => progressData.journeySessionIds.has(b.session_id))).map((b) => [b.session_id, b])
  );


  // Stats
  const progress = (completedCount / totalSessions) * 100;
  const completedTasks = effectiveTasks.filter((t) => t.is_completed).length;
  const totalTasks = effectiveTasks.length;
  const taskProgress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  return (
    <AppLayout role="liberty">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-8">
        <motion.div variants={fadeUpItem}>
          <h1 className="text-2xl font-semibold text-foreground">Minha Jornada</h1>
          <p className="text-muted-foreground text-sm">Liberty Begin · {totalSessions} sessões</p>
        </motion.div>

        {/* Progress overview */}
        <motion.div variants={fadeUpItem} className="glass-card p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-status-red via-status-yellow to-status-green" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
            {/* Sessions progress */}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 font-medium"><BookOpen className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />Sessões</p>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">{completedCount}/{totalSessions} concluídas</span>
                <span className="text-sm font-semibold text-status-green tabular-nums">{Math.round(progress)}%</span>
              </div>
              <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-status-yellow to-status-green"
                />
              </div>
            </div>

            {/* Tasks progress */}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 font-medium"><Target className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />Tarefas</p>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">{completedTasks}/{totalTasks} concluídas</span>
                <span className="text-sm font-semibold text-status-blue tabular-nums">{Math.round(taskProgress)}%</span>
              </div>
              <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${taskProgress}%` }}
                  transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-status-blue to-primary"
                />
              </div>
            </div>
          </div>

          {/* Session dots */}
          <div className="mt-5 pt-4 border-t border-border">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Cada bolinha é uma sessão da jornada, na ordem do programa
            </p>
            <div className="flex justify-between">
            {journeySessions.map((s) => {
              const st = statusMap.get(s.id)?.status;
              return (
                <div
                  key={s.id}
                  className={`w-3.5 h-3.5 rounded-full border transition-all ${
                    st === "completed" ? "bg-status-green border-status-green shadow-[0_0_6px_rgba(74,156,106,0.4)]"
                    : st === "scheduled" ? "bg-status-blue border-status-blue animate-pulse-soft shadow-[0_0_6px_rgba(74,122,184,0.4)]"
                    : "bg-muted border-muted-foreground/20"
                  }`}
                  title={s.name}
                />
              );
            })}
            {(() => {
              const unlocked = completedCount >= totalSessions;
              return (
                <div
                  title={unlocked ? "Presente desbloqueado: Sessão Próximo Nível" : "Presente bloqueado: conclua a jornada"}
                  className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${unlocked ? "border-primary bg-primary/20 text-primary" : "border-dashed border-muted-foreground/40 text-muted-foreground"}`}
                >
                   {unlocked ? <LockOpen className="h-2.5 w-2.5" /> : <Lock className="h-2 w-2" />}
                </div>
              );
            })()}
            </div>
          </div>


          <div className="flex gap-5 mt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-status-green" /> Realizada ({completedCount})
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-status-blue" /> Agendada ({scheduledCount})
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-muted border border-muted-foreground/20" /> Pendente ({totalSessions - completedCount - scheduledCount})
            </div>
          </div>
        </motion.div>

        {/* Onde estou e qual é o próximo passo */}
        {(() => {
          const today = new Date().toISOString().slice(0, 10);
          const upcoming = visibleBookings
            .filter((b: any) => b.scheduled_date >= today && getEffectiveBookingStatus(b) === "scheduled")
            .sort((a: any, b: any) => a.scheduled_date.localeCompare(b.scheduled_date))[0];
          const pendingApproval = visibleBookings.filter((b: any) => b.status === "pending_approval");
          const used = visibleBookings.filter(
            (b: any) => b.status !== "cancelled" && b.status !== "not_realized",
          ).length;
          const available = Math.max(0, totalSessions - used);

          return (
            <motion.div variants={fadeUpItem} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="glass-card p-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Já realizadas</p>
                <p className="text-2xl font-bold text-status-green tabular-nums">{completedCount}</p>
                <p className="text-[11px] text-muted-foreground">de {totalSessions} sessões da jornada</p>
              </div>
              <div className="glass-card p-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Próxima sessão</p>
                {upcoming ? (
                  <>
                    <p className="text-sm font-semibold text-foreground">
                      {new Date(upcoming.scheduled_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                      {" · "}
                      {String(upcoming.start_time).slice(0, 5)}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {sessionNames[upcoming.session_id] || "Sessão"}
                      {effectiveMentorMap[upcoming.mentor_id] ? ` · ${shortName(effectiveMentorMap[upcoming.mentor_id])}` : ""}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-muted-foreground">Nenhuma agendada</p>
                    <p className="text-[11px] text-muted-foreground">Escolha um horário para seguir na jornada.</p>
                  </>
                )}
              </div>
              <div className="glass-card p-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Aguardando mentor</p>
                <p className="text-2xl font-bold text-status-yellow tabular-nums">{pendingApproval.length}</p>
                <p className="text-[11px] text-muted-foreground">
                  {pendingApproval.length > 0 ? "Confirmação em análise pelo mentor" : "Nenhuma solicitação pendente"}
                </p>
              </div>
              <div className="glass-card p-4 flex flex-col">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Disponíveis para agendar</p>
                <p className="text-2xl font-bold text-primary tabular-nums">{available}</p>
                {available > 0 && (
                  <Link to="/agenda/agendar" className="btn-silver text-[11px] px-3 py-1.5 rounded-lg mt-2 text-center">
                    Agendar próxima sessão
                  </Link>
                )}
              </div>
            </motion.div>
          );
        })()}


        {/* Linha do tempo — Realizado × Projetado */}
        <motion.div variants={fadeUpItem}>
          <MemberTimeline
            profile={demoEnabled ? demoProfileFill(profile as any) : profile}

            bookings={effectiveBookings as any}
            sessionNames={sessionNames}
            mentorNames={effectiveMentorMap}
            reports={reportsMap}
            totalSessions={totalSessions}
            journeySessionIds={progressData.journeySessionIds}
            hideReportButton
          />
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <TestimonialsCard />
        </motion.div>




        {/* Results achieved */}
        {(() => {
          const withResults = effectiveTasks.filter((t: any) => t.result_value);
          if (withResults.length === 0) return null;
          return (
            <motion.div variants={fadeUpItem} className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">🏆 Seus resultados</h2>
                <span className="text-xs text-muted-foreground">{withResults.length} registrados</span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {withResults.map((t: any) => {
                  const isQuant = t.result_type === "quantitative";
                  return (
                    <div key={t.id} className="rounded-xl border border-border bg-background/40 p-3">
                      <span className={`text-[9px] uppercase tracking-wider font-semibold ${isQuant ? "text-status-green" : "text-status-blue"}`}>
                        {isQuant ? "Quantitativo" : "Qualitativo"}
                      </span>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{t.description}</p>
                      <p className="text-sm text-foreground font-medium mt-1">
                        {t.result_metric ? <span className="text-muted-foreground">{t.result_metric}: </span> : null}
                        {t.result_value}
                      </p>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })()}


        {/* Sessions list */}
        <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(() => {
            const kickoff = journeySessions.find((s: any) => s.is_kickoff);
            const kickoffStatus = kickoff ? statusMap.get(kickoff.id)?.status : undefined;
            const kickoffLocked = false; // Mapeamento é sugerido, nunca bloqueia agendamento
            return journeySessions.map((session: any) => {
              const booking = bookingBySession[session.id];
              const st = (statusMap.get(session.id)?.status as keyof typeof statusConfig) || "pending";
              const cfg = statusConfig[st];
              const StatusIcon = cfg.icon;
              const isExpanded = expandedSession === session.id;
              const sessionTasks = booking ? effectiveTasks.filter((t) => t.booking_id === booking.id) : [];
              const sessionCompletedTasks = sessionTasks.filter((t) => t.is_completed).length;
              const isKickoff = Boolean(session.is_kickoff);
              const lockedByKickoff = kickoffLocked && !isKickoff;

              return (
                <motion.div
                  key={session.id}
                  variants={fadeUpItem}
                  className={`dark glass-card overflow-hidden bg-card text-card-foreground ${
                    isKickoff ? "md:col-span-2 border-primary/50 ring-1 ring-primary/30" : ""
                  }`}
                >
                  {/* Cover image preview */}
                  {session.cover_image_url && (
                    <div
                      className="relative h-28 w-full cursor-pointer overflow-hidden"
                      onClick={() => setExpandedSession(isExpanded ? null : session.id)}
                    >
                      <img
                        src={session.cover_image_url}
                        alt={session.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                      <div className="absolute bottom-3 left-5 right-5 flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-foreground drop-shadow-sm">{session.name}</h3>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium inline-flex items-center gap-1 ${cfg.classes}`}>
                          <StatusIcon className="h-2.5 w-2.5" /> {cfg.label}
                        </span>
                        {session.pillar && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {session.pillar}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  <div
                    className={`p-5 flex items-center gap-4 cursor-pointer hover:bg-muted/20 transition-colors ${session.cover_image_url ? 'pt-3' : ''}`}
                    onClick={() => setExpandedSession(isExpanded ? null : session.id)}
                  >
                    {!session.cover_image_url && (
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-medium text-foreground">{session.name}</h3>
                          {isKickoff && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 font-semibold uppercase tracking-wider">
                              ✦ Kickoff · 3h
                            </span>
                          )}
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium inline-flex items-center gap-1 ${cfg.classes}`}>
                            <StatusIcon className="h-2.5 w-2.5" /> {cfg.label}
                          </span>
                          {session.pillar && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              {session.pillar}
                            </span>
                          )}
                          {lockedByKickoff && !booking && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                              🔒 Faça o Mapeamento primeiro
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {session.cover_image_url && (
                      <div className="flex-1 min-w-0">
                        {booking && (
                          <p className="text-xs text-muted-foreground">
                            com {shortName(effectiveMentorMap[booking.mentor_id] || "Mentor")} · {booking.scheduled_date}
                            {sessionTasks.length > 0 && (
                              <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-muted">
                                {sessionCompletedTasks}/{sessionTasks.length} tarefas
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    )}

                    {booking && !session.cover_image_url && (
                      <p className="text-xs text-muted-foreground mt-1">
                        com {shortName(effectiveMentorMap[booking.mentor_id] || "Mentor")} · {booking.scheduled_date}
                        {sessionTasks.length > 0 && (
                          <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-muted">
                            {sessionCompletedTasks}/{sessionTasks.length} tarefas
                          </span>
                        )}
                      </p>
                    )}

                    <div className="flex items-center gap-2 shrink-0">
                      {!booking && profile?.is_active !== false && !lockedByKickoff && (
                        <Link
                          to={`/agenda/agendar?sessionId=${session.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="btn-silver text-xs px-3 py-1.5"
                        >
                          {isKickoff ? "Agendar Kickoff" : "Agendar"}
                        </Link>
                      )}
                      {booking && getEffectiveBookingStatus(booking) === "scheduled" && booking.zoom_join_url && (
                        <a
                          href={booking.zoom_join_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="btn-silver text-xs px-3 py-1.5"

                      >
                        Zoom
                      </a>
                    )}
                    {(sessionTasks.length > 0 || booking) && (
                      isExpanded
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Expanded: tasks + details */}
                {isExpanded && booking && (
                  <div className="border-t border-border px-5 py-4 space-y-4">
                    {session.description && (
                      <p className="text-xs text-muted-foreground">{session.description}</p>
                    )}

                    {sessionTasks.length > 0 ? (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2"><Target className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />Tarefas</p>
                        <TaskChecklist
                          tasks={sessionTasks}
                          bookingId={booking.id}
                          role="liberty"
                          invalidateKeys={[["journey-tasks", bookingIds]]}
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Nenhuma tarefa atribuída para esta sessão.</p>
                    )}
                  </div>
                )}
              </motion.div>
            );
            });
          })()}
        </motion.div>

        {/* Sessão bônus bloqueada (última da jornada) */}
        {(() => {
          const unlocked = completedCount >= totalSessions;
          const remaining = Math.max(totalSessions - completedCount, 0);
          const giftProgress = Math.min((completedCount / totalSessions) * 100, 100);
          return (
            <motion.div
              variants={fadeUpItem}
              className={`glass-card relative overflow-hidden p-6 ${unlocked ? "border-primary/50 ring-1 ring-primary/30" : "border-dashed"}`}
            >
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(70% 60% at 80% 0%, color-mix(in srgb, hsl(var(--primary)) 16%, transparent) 0%, transparent 70%)",
                }}
              />
              <div className="relative flex items-start gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${unlocked ? "border-primary/40 bg-primary/15 text-primary" : "border-border bg-muted text-muted-foreground"}`}>
                  {unlocked ? <Gift className="h-6 w-6" /> : <Lock className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                    Sessão bônus
                  </span>
                  <h3 className="mt-1 text-base font-semibold text-foreground">
                    Próximo Nível: o segredo do seu negócio
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {unlocked
                      ? "Presente desbloqueado. Fale com seu mentor para agendar sua sessão exclusiva."
                      : "Uma sessão exclusiva que revela o ponto oculto que destrava o próximo nível da sua empresa. Liberada quando você concluir a jornada."}
                  </p>

                  <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${giftProgress}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      className="h-full rounded-full bg-gradient-to-r from-status-yellow to-primary"
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                    {unlocked
                      ? "100% concluído · presente liberado"
                      : `Faltam ${remaining} sessão${remaining !== 1 ? "ões" : ""} para abrir seu presente · ${Math.round(giftProgress)}%`}
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })()}

      </motion.div>

    </AppLayout>
  );
};

export default JourneyPage;
