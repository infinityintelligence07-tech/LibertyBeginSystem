import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { ChevronDown, ChevronUp, BookOpen, Target, Gift, Lock, LockOpen, Check, Star, Trophy, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { shortName } from "@/lib/formatName";
import { TaskChecklist } from "@/components/TaskChecklist";
import { getEffectiveBookingStatus, PENDING_CONFIRMATION_HINT, sortByScheduledDateAsc } from "@/lib/bookingStatus";
import { KICKOFF_MAX_REALIZED_SESSIONS, KICKOFF_NOT_ALLOWED_MESSAGE, type SessionProgressStatus } from "@/lib/sessionProgress";
import { MemberTimeline } from "@/components/MemberTimeline";
import { TestimonialsCard } from "@/components/TestimonialsCard";
import { demoBookingsForMember, demoTasksForBookings, demoReportsForBookings, demoMentorProfiles, demoProfileFill } from "@/lib/demoForUser";
import { useJourneyProgress, type JourneyBooking } from "@/hooks/useJourneyProgress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Callout,
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

const KICKOFF_UNAVAILABLE_SHORT = `Mapeamento não disponível: só até a ${KICKOFF_MAX_REALIZED_SESSIONS}ª sessão realizada`;

/** Bolinha da trilha por estado: cores planas, sem brilho nem pulso. */
const dotClassFor = (status: SessionProgressStatus | undefined) => {
  switch (status) {
    case "completed":
      return "bg-status-green border-status-green text-primary-foreground";
    case "pending_confirmation":
      return "bg-status-orange border-status-orange";
    case "scheduled":
      return "bg-status-blue border-status-blue";
    case "available":
    case undefined:
      return "bg-card border-border";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
};

const statusLabelFor = (status: SessionProgressStatus): string => {
  switch (status) {
    case "completed":
      return "Realizada";
    case "pending_confirmation":
      return "A confirmar";
    case "scheduled":
      return "Agendada";
    case "available":
      return "A agendar";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
};

const formatDay = (iso: string) => format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR });

const JourneyPage = () => {
  const { profile } = useAuth();
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  const {
    demoEnabled,
    sessions,
    bookings: visibleBookings,
    realBookingIds: bookingIds,
    progress: progressData,
    kickoffAllowed,
    isLoading,
    isError,
    refetch,
  } = useJourneyProgress();

  // Tarefas/relatórios fictícios (modo demo do admin) seguem os mesmos bookings fictícios do hook.
  const demoBks = useMemo(
    () => (demoEnabled && profile?.id ? demoBookingsForMember(profile.id) : []),
    [demoEnabled, profile?.id],
  );
  const demoTks = useMemo(() => demoTasksForBookings(demoBks), [demoBks]);
  const demoReps = useMemo(() => demoReportsForBookings(demoBks), [demoBks]);

  // Fetch tasks for all bookings
  const { data: tasks = [] } = useQuery({
    queryKey: ["journey-tasks", bookingIds],
    queryFn: async () => {
      if (!bookingIds.length) return [];
      const { data, error } = await supabase.from("session_tasks").select("*").in("booking_id", bookingIds).order("created_at");
      if (error) throw error;
      return data || [];
    },
    enabled: bookingIds.length > 0,
  });

  // Fetch mentor names
  const mentorIds = [...new Set(visibleBookings.map((b) => b.mentor_id).filter((id) => !id.startsWith("demo-")))];
  const { data: mentorProfiles = [] } = useQuery({
    queryKey: ["journey-mentors", mentorIds],
    queryFn: async () => {
      if (!mentorIds.length) return [];
      const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", mentorIds);
      if (error) throw error;
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
      const { data, error } = await supabase.from("booking_reports").select("booking_id, summary").in("booking_id", bookingIds);
      if (error) throw error;
      return data || [];
    },
    enabled: bookingIds.length > 0,
  });

  const effectiveTasks = demoEnabled ? [...tasks, ...demoTks] : tasks;
  const effectiveMentorMap = demoEnabled
    ? { ...mentorMap, ...Object.fromEntries(demoMentorProfiles.map((m) => [m.id, m.full_name])) }
    : mentorMap;
  const reportsMap = Object.fromEntries(
    [...reports, ...(demoEnabled ? demoReps : [])].map((r) => [r.booking_id, r])
  );
  const sessionNames = Object.fromEntries(sessions.map((s) => [s.id, s.name]));

  const {
    journeySessions,
    statusMap,
    completedCount,
    pendingConfirmationCount,
    scheduledCount,
    availableCount,
    totalSessions,
  } = progressData;
  const bookingBySession: Record<string, JourneyBooking> = Object.fromEntries(
    sortByScheduledDateAsc(visibleBookings.filter((b) => progressData.journeySessionIds.has(b.session_id))).map((b) => [b.session_id, b])
  );

  // D3: a jornada é cronológica. Sessões com agendamento vêm primeiro, na ordem em que
  // aconteceram (ou vão acontecer); as vagas livres ficam depois, na ordem do catálogo.
  // O Mapeamento se identifica por `is_kickoff`, nunca pela posição.
  const orderedJourneySessions = useMemo(() => {
    const booked = journeySessions.filter((s) => statusMap.has(s.id));
    const free = journeySessions.filter((s) => !statusMap.has(s.id));
    const bookedSorted = sortByScheduledDateAsc(
      booked.map((s) => ({ session: s, ...(statusMap.get(s.id)?.booking ?? {}) })),
    ).map((entry) => entry.session);
    return [...bookedSorted, ...free];
  }, [journeySessions, statusMap]);

  const kickoffSession = journeySessions.find((s) => s.is_kickoff) ?? null;
  const kickoffHasBooking = kickoffSession ? statusMap.has(kickoffSession.id) : false;

  // Stats
  const progress = (completedCount / totalSessions) * 100;
  const completedTasks = effectiveTasks.filter((t) => t.is_completed).length;
  const totalTasks = effectiveTasks.length;
  const taskProgress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  const giftUnlocked = completedCount >= totalSessions;

  return (
    <AppLayout role="liberty">
      <PageContainer>
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-8">
        <motion.div variants={fadeUpItem}>
          <PageHeader
            size="large"
            eyebrow="Liberty Begin"
            title="Minha jornada"
            description={`${totalSessions} sessões, na ordem em que aconteceram ou vão acontecer.`}
            actions={
              availableCount > 0 && profile?.is_active !== false ? (
                <Button asChild>
                  <Link to="/agenda/agendar">Agendar sessão</Link>
                </Button>
              ) : undefined
            }
          />
        </motion.div>

        {isError && (
          <motion.div variants={fadeUpItem}>
            <ErrorState
              compact
              title="Não foi possível carregar sua jornada"
              description="Verifique sua conexão e tente novamente."
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
        {/* Visão geral do progresso */}
        <motion.div variants={fadeUpItem}>
          <SectionCard>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Stat
                  icon={BookOpen}
                  label="Sessões realizadas"
                  value={`${completedCount}/${totalSessions}`}
                  hint={`${Math.round(progress)}%`}
                  tone="success"
                />
                <ProgressBar value={completedCount} max={totalSessions} tone="success" label="Sessões realizadas" />
              </div>
              <div className="space-y-3">
                <Stat
                  icon={Target}
                  label="Tarefas concluídas"
                  value={`${completedTasks}/${totalTasks}`}
                  hint={`${Math.round(taskProgress)}%`}
                  tone="info"
                />
                <ProgressBar value={completedTasks} max={Math.max(totalTasks, 1)} tone="info" label="Tarefas concluídas" />
              </div>
            </div>

            {/* Bolinhas das sessões */}
            <div className="mt-5 pt-4 border-t border-border">
              <div className="flex items-center gap-1.5 flex-wrap" role="list" aria-label="Sessões da jornada">
                {orderedJourneySessions.map((s, index) => {
                  const st = statusMap.get(s.id)?.status;
                  const label = `Sessão ${index + 1} · ${s.name}${s.is_kickoff ? " (Mapeamento)" : ""} · ${statusLabelFor(st ?? "available")}`;
                  return (
                    <span
                      key={s.id}
                      role="listitem"
                      className={cn(
                        "inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border",
                        dotClassFor(st),
                        s.is_kickoff && "ring-2 ring-primary/30 ring-offset-1 ring-offset-card",
                      )}
                      title={label}
                      aria-label={label}
                    >
                      {st === "completed" && <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />}
                    </span>
                  );
                })}
                <span
                  role="listitem"
                  title={giftUnlocked ? "Presente desbloqueado: Sessão Próximo Nível" : "Presente bloqueado: conclua a jornada"}
                  aria-label={giftUnlocked ? "Presente desbloqueado: Sessão Próximo Nível" : "Presente bloqueado: conclua a jornada"}
                  className={cn(
                    "inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border",
                    giftUnlocked ? "border-primary bg-primary/20 text-primary" : "border-dashed border-border text-muted-foreground",
                  )}
                >
                  {giftUnlocked ? <LockOpen className="h-2.5 w-2.5" aria-hidden /> : <Lock className="h-2 w-2" aria-hidden />}
                </span>
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-status-green" aria-hidden /> Realizada ({completedCount})
                </div>
                {pendingConfirmationCount > 0 && (
                  <div className="flex items-center gap-1.5" title={PENDING_CONFIRMATION_HINT}>
                    <span className="w-2.5 h-2.5 rounded-full bg-status-orange" aria-hidden /> A confirmar ({pendingConfirmationCount})
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-status-blue" aria-hidden /> Agendada ({scheduledCount})
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-card border border-border" aria-hidden /> A agendar ({availableCount})
                </div>
              </div>
            </div>
          </SectionCard>
        </motion.div>

        {/* Onde estou e qual é o próximo passo */}
        {(() => {
          // Só sessões realmente futuras (status efetivo `scheduled`; as que já passaram viram "A confirmar").
          const upcoming = sortByScheduledDateAsc(
            visibleBookings.filter((b) => getEffectiveBookingStatus(b) === "scheduled"),
          )[0];
          const pendingApproval = visibleBookings.filter((b) => getEffectiveBookingStatus(b) === "pending_approval");

          return (
            <motion.div variants={fadeUpItem} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SectionCard padding="compact">
                <Stat
                  label="Já realizadas"
                  value={completedCount}
                  hint={`de ${totalSessions}`}
                  tone="success"
                />
                {pendingConfirmationCount > 0 && (
                  <p className="text-xs text-status-orange mt-2" title={PENDING_CONFIRMATION_HINT}>
                    + {pendingConfirmationCount} a confirmar pelo mentor
                  </p>
                )}
              </SectionCard>
              <SectionCard padding="compact">
                <p className="text-xs font-medium text-muted-foreground">Próxima sessão</p>
                {upcoming ? (
                  <>
                    <p className="text-[17px] font-semibold text-foreground mt-1 tabular-nums">
                      {format(parseISO(upcoming.scheduled_date), "dd MMM", { locale: ptBR })}
                      {" · "}
                      {String(upcoming.start_time).slice(0, 5)}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {sessionNames[upcoming.session_id] || "Sessão"}
                      {effectiveMentorMap[upcoming.mentor_id] ? ` · ${shortName(effectiveMentorMap[upcoming.mentor_id])}` : ""}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[17px] font-semibold text-muted-foreground mt-1">Nenhuma agendada</p>
                    <p className="text-xs text-muted-foreground">Escolha um horário para seguir na jornada.</p>
                  </>
                )}
              </SectionCard>
              <SectionCard padding="compact">
                <Stat
                  label="Aguardando confirmação"
                  value={pendingApproval.length}
                  tone={pendingApproval.length > 0 ? "warning" : "default"}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  {pendingApproval.length > 0 ? "Solicitação em análise pela equipe" : "Nenhuma solicitação pendente"}
                </p>
              </SectionCard>
              <SectionCard padding="compact" className="flex flex-col">
                <Stat label="Disponíveis para agendar" value={availableCount} tone="brand" />
                {availableCount > 0 && (
                  <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                    <Link to="/agenda/agendar">Agendar próxima sessão</Link>
                  </Button>
                )}
              </SectionCard>
            </motion.div>
          );
        })()}


        {/* Linha do tempo — Realizado × Projetado */}
        <motion.div variants={fadeUpItem}>
          <MemberTimeline
            profile={demoEnabled ? demoProfileFill(profile) : profile}
            bookings={visibleBookings}
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
          const withResults = effectiveTasks.filter((t) => t.result_value);
          if (withResults.length === 0) return null;
          return (
            <motion.section variants={fadeUpItem} aria-labelledby="journey-results-title" className="space-y-3">
              <SectionHeader
                title={
                  <span id="journey-results-title" className="inline-flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-status-yellow" aria-hidden />
                    Seus resultados
                  </span>
                }
                description={`${withResults.length} registrado${withResults.length !== 1 ? "s" : ""}`}
              />
              <SectionCard padding="none">
                {withResults.map((t, i) => {
                  const isQuant = t.result_type === "quantitative";
                  return (
                    <ListRow
                      key={t.id}
                      title={
                        <>
                          {t.result_metric ? <span className="text-muted-foreground">{t.result_metric}: </span> : null}
                          {t.result_value}
                        </>
                      }
                      subtitle={t.description}
                      trailing={
                        <StatusPill tone={isQuant ? "success" : "info"} size="sm" withDot={false}>
                          {isQuant ? "Quantitativo" : "Qualitativo"}
                        </StatusPill>
                      }
                      last={i === withResults.length - 1}
                    />
                  );
                })}
              </SectionCard>
            </motion.section>
          );
        })()}


        {/* Trilha das sessões (cronológica) */}
        <motion.section variants={fadeUpItem} aria-labelledby="journey-trail-title" className="space-y-3">
          <SectionHeader
            title={<span id="journey-trail-title">Trilha de sessões</span>}
            description="Sessões com agendamento aparecem primeiro, na ordem em que aconteceram."
          />

          {kickoffSession && !kickoffAllowed && !kickoffHasBooking && (
            <Callout tone="info" icon={Star} title={KICKOFF_UNAVAILABLE_SHORT}>
              {KICKOFF_NOT_ALLOWED_MESSAGE}
            </Callout>
          )}

          <SectionCard padding="none">
            <ol className="list-none m-0 p-0">
            {(() => {
            // D2: o Mapeamento só pode ser agendado até a 3ª sessão realizada. Se já passou desse ponto
            // e ainda não tem agendamento, escondemos o item (a jornada segue sem ele).
            const trail = orderedJourneySessions.filter((session) => {
              const isKickoff = Boolean(session.is_kickoff);
              return !(isKickoff && !bookingBySession[session.id] && !kickoffAllowed);
            });
            return trail.map((session, index) => {
              const booking = bookingBySession[session.id];
              const st = statusMap.get(session.id)?.status ?? "available";
              const isExpanded = expandedSession === session.id;
              const sessionTasks = booking ? effectiveTasks.filter((t) => t.booking_id === booking.id) : [];
              const sessionCompletedTasks = sessionTasks.filter((t) => t.is_completed).length;
              const isKickoff = Boolean(session.is_kickoff);
              const canSchedule = !booking && profile?.is_active !== false && (!isKickoff || kickoffAllowed);
              const canExpand = Boolean(booking);
              const isLast = index === trail.length - 1;
              const detailsId = `journey-session-${session.id}`;

              return (
                <li key={session.id} className="relative">
                  {/* Linha da trilha */}
                  {!isLast && (
                    <span
                      aria-hidden
                      className="absolute left-[27px] sm:left-[35px] top-[44px] bottom-0 w-px bg-border"
                    />
                  )}
                  <div
                    className={cn(
                      "flex items-start gap-3 sm:gap-4 px-4 sm:px-6 py-4 min-h-[56px]",
                      !isLast && !isExpanded && "border-b border-border",
                      isExpanded && "bg-muted/30",
                    )}
                  >
                    {/* Bolinha */}
                    <span
                      aria-hidden
                      className={cn(
                        "relative z-10 mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                        dotClassFor(st),
                        isKickoff && "ring-2 ring-primary/30 ring-offset-2 ring-offset-card",
                      )}
                    >
                      {st === "completed" && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      {st !== "completed" && isKickoff && <Star className={cn("h-3 w-3", st === "available" ? "text-primary" : "text-primary-foreground")} />}
                    </span>

                    {/* Conteúdo */}
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        className={cn(
                          "w-full text-left rounded-ds focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
                          !canExpand && "cursor-default",
                        )}
                        onClick={() => canExpand && setExpandedSession(isExpanded ? null : session.id)}
                        aria-expanded={canExpand ? isExpanded : undefined}
                        aria-controls={canExpand ? detailsId : undefined}
                        disabled={!canExpand}
                      >
                        <div className="flex items-start gap-2 flex-wrap">
                          <p className="text-[15px] font-medium text-foreground leading-snug">
                            <span className="text-muted-foreground tabular-nums mr-1.5">{index + 1}.</span>
                            {session.name}
                          </p>
                          {isKickoff && (
                            <StatusPill tone="brand" size="sm" withDot={false}>
                              <Star className="h-3 w-3" aria-hidden /> Mapeamento · 3h
                            </StatusPill>
                          )}
                          <span title={st === "pending_confirmation" ? PENDING_CONFIRMATION_HINT : undefined} className="inline-flex">
                            {st === "available" ? (
                              <StatusPill tone="neutral" size="sm">A agendar</StatusPill>
                            ) : (
                              <StatusPill status={st} size="sm" />
                            )}
                          </span>
                          {session.pillar && (
                            <StatusPill tone="neutral" size="sm" withDot={false}>{session.pillar}</StatusPill>
                          )}
                        </div>
                        {booking && (
                          <p className="text-xs text-muted-foreground mt-1">
                            com {shortName(effectiveMentorMap[booking.mentor_id] || "Mentor")} · {formatDay(booking.scheduled_date)}
                            {sessionTasks.length > 0 && ` · ${sessionCompletedTasks}/${sessionTasks.length} tarefas`}
                          </p>
                        )}
                      </button>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-2 shrink-0">
                      {canSchedule && (
                        <Button asChild variant={isKickoff ? "default" : "outline"} size="sm">
                          <Link
                            to={`/agenda/agendar?sessionId=${session.id}`}
                            title={isKickoff ? "Recomendado para o início da jornada" : undefined}
                          >
                            {isKickoff ? "Agendar mapeamento" : "Agendar"}
                          </Link>
                        </Button>
                      )}
                      {booking && getEffectiveBookingStatus(booking) === "scheduled" && booking.zoom_join_url && (
                        <Button asChild variant="outline" size="sm">
                          <a href={booking.zoom_join_url} target="_blank" rel="noopener noreferrer">
                            Zoom
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          </a>
                        </Button>
                      )}
                      {canExpand && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={isExpanded ? "Recolher detalhes da sessão" : "Ver detalhes da sessão"}
                          aria-expanded={isExpanded}
                          aria-controls={detailsId}
                          onClick={() => setExpandedSession(isExpanded ? null : session.id)}
                        >
                          {isExpanded
                            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Expandido: tarefas + detalhes */}
                  {isExpanded && booking && (
                    <div
                      id={detailsId}
                      className={cn("px-4 sm:px-6 pb-4 pl-[52px] sm:pl-[68px] space-y-4 bg-muted/30", !isLast && "border-b border-border")}
                    >
                      {session.description && (
                        <p className="text-sm text-muted-foreground">{session.description}</p>
                      )}

                      {sessionTasks.length > 0 ? (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2 inline-flex items-center gap-1.5">
                            <Target className="h-3.5 w-3.5" aria-hidden />Tarefas
                          </p>
                          <TaskChecklist
                            tasks={sessionTasks}
                            bookingId={booking.id}
                            role="liberty"
                            invalidateKeys={[["journey-tasks"]]}
                          />
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Nenhuma tarefa atribuída para esta sessão.</p>
                      )}
                    </div>
                  )}
                </li>
              );
            });
            })()}
            </ol>
          </SectionCard>
        </motion.section>

        {/* Sessão bônus bloqueada (última da jornada) */}
        {(() => {
          const unlocked = completedCount >= totalSessions;
          const remaining = Math.max(totalSessions - completedCount, 0);
          const giftProgress = Math.min((completedCount / totalSessions) * 100, 100);
          return (
            <motion.div variants={fadeUpItem}>
              <SectionCard tone={unlocked ? "brand" : "default"} className={unlocked ? "" : "border-dashed"}>
                <div className="flex items-start gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-ds-lg border ${unlocked ? "border-primary/30 bg-primary/15 text-primary" : "border-border bg-muted text-muted-foreground"}`}>
                    {unlocked ? <Gift className="h-6 w-6" aria-hidden /> : <Lock className="h-5 w-5" aria-hidden />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="ds-kicker text-primary">Sessão bônus</p>
                    <h3 className="mt-1 text-[17px] font-semibold text-foreground">
                      Próximo Nível: o segredo do seu negócio
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {unlocked
                        ? "Presente desbloqueado. Fale com seu mentor para agendar sua sessão exclusiva."
                        : "Uma sessão exclusiva que revela o ponto oculto que destrava o próximo nível da sua empresa. Liberada quando você concluir a jornada."}
                    </p>

                    <div className="mt-4">
                      <ProgressBar value={giftProgress} max={100} tone="brand" label="Progresso para a sessão bônus" />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                      {unlocked
                        ? "100% concluído · presente liberado"
                        : `Faltam ${remaining} sessão${remaining !== 1 ? "ões" : ""} para abrir seu presente · ${Math.round(giftProgress)}%`}
                    </p>
                  </div>
                </div>
              </SectionCard>
            </motion.div>
          );
        })()}
        </>
        )}

      </motion.div>
      </PageContainer>
    </AppLayout>
  );
};

export default JourneyPage;
