import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { Calendar, Clock, CheckCircle2, ChevronLeft, ChevronRight, FileText, AlertCircle, Target, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BottomSheet,
  Callout,
  Chip,
  DateBlock,
  ErrorState,
  IconButton,
  ListRow,
  LoadingState,
  PageContainer,
  PageHeader,
  SectionCard,
  StatusPill,
  TextAreaField,
} from "@/components/ds";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, startOfMonth, addMonths, subMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { shortName } from "@/lib/formatName";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TaskChecklist } from "@/components/TaskChecklist";
import { useDemoData } from "@/contexts/DemoDataContext";
import {
  demoBookingsForMentor, demoTasksForBookings, demoReportsForBookings,
  demoLibertyProfiles, mergeDemoSessions,
} from "@/lib/demoForUser";
import {
  bookingStatusConfig,
  getEffectiveBookingStatus,
  getMentorPendingAction,
  isFutureScheduledBooking,
  isRealizedSessionBooking,
  sortByScheduledDateDesc,
} from "@/lib/bookingStatus";
import { EmptyState } from "@/components/EmptyState";
import { useBookingsRealtime } from "@/hooks/useBookingsRealtime";
import {
  MENTOR_PENDING_CONFIRMATION_HINT,
  MentorPendingActions,
  NotRealizedDialog,
  invalidateMentorBookingQueries,
  translateBookingError,
  useMentorBookingActions,
} from "@/components/mentor/MentorBookingActions";

type TabKey = "upcoming" | "to_confirm" | "pending" | "completed" | "not_realized" | "cancelled" | "all";

const TAB_KEYS: TabKey[] = ["upcoming", "to_confirm", "pending", "completed", "not_realized", "cancelled", "all"];

const MentorSessoesPage = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { demoEnabled } = useDemoData();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [notRealizedTarget, setNotRealizedTarget] = useState<string | null>(null);
  // Recusar / desmarcar pedem motivo em um BottomSheet (substitui window.prompt/confirm)
  const [reasonTarget, setReasonTarget] = useState<{ kind: "reject" | "cancel"; bookingId: string; availabilityId: string | null } | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const { actingId: closingId, markCompleted, markNotRealized } = useMentorBookingActions();

  // A aba vem direto da URL (sem estado duplicado)
  const tabParam = searchParams.get("tab") as TabKey | null;
  const activeTab: TabKey = tabParam && TAB_KEYS.includes(tabParam) ? tabParam : "upcoming";

  // Se o admin aprovar/recusar primeiro, a lista do mentor atualiza sozinha
  useBookingsRealtime(["mentor-bookings", "mentor-action-banner", "notifications-bell"], "mentor-sessoes");

  const handleTabChange = (key: TabKey) => {
    const next = new URLSearchParams(searchParams);
    if (key === "upcoming") next.delete("tab"); else next.set("tab", key);
    setSearchParams(next, { replace: true });
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = addMonths(monthStart, 1);
  const monthStartStr = format(monthStart, "yyyy-MM-dd");
  const monthEndStr = format(monthEnd, "yyyy-MM-dd");

  const { data: _bookings = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["mentor-bookings", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      // Carrega TODAS as sessões do mentor (passadas e futuras). O filtro de mês é feito em memória;
      // a aba "Pendências" ignora o mês para o mentor não perder sessões antigas sem fechamento.
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("mentor_id", profile.id)
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const demoBks = useMemo(() => {
    if (!demoEnabled || !profile?.id) return [];
    return demoBookingsForMentor(profile.id);
  }, [demoEnabled, profile?.id]);

  // Mantemos canceladas e pendentes para exibir nas próprias abas.
  const bookings = useMemo(() => (demoEnabled ? [..._bookings, ...demoBks] : _bookings), [demoEnabled, _bookings, demoBks]);
  type BookingRow = (typeof bookings)[number];
  const availabilityOf = (b: BookingRow): string | null => ("availability_id" in b ? b.availability_id : null);

  const libertyIds = [...new Set(bookings.map((b) => b.liberty_id).filter((x): x is string => !!x))];

  const { data: _libertyProfiles = [] } = useQuery({
    queryKey: ["liberty-profiles", libertyIds],
    queryFn: async () => {
      if (libertyIds.length === 0) return [];
      const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", libertyIds);
      if (error) throw error;
      return data || [];
    },
    enabled: libertyIds.length > 0,
  });
  const libertyProfiles = demoEnabled ? [..._libertyProfiles, ...demoLibertyProfiles] : _libertyProfiles;

  const { data: _sessions = [] } = useQuery({
    queryKey: ["sessions-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions").select("id, name, order, cover_image_url").order("order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
  const sessions = demoEnabled ? mergeDemoSessions(_sessions as any[]) : _sessions;

  const realBookingIds = _bookings.map((b) => b.id);
  // Relatórios buscados pelo mentor (via join): evita corrida com a lista de sessões e limite de URL do .in().
  const { data: _reports = [] } = useQuery({
    queryKey: ["booking-reports-check-by-mentor", profile?.id],
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
  const demoReps = useMemo(() => demoReportsForBookings(demoBks), [demoBks]);
  const reports = useMemo(() => (demoEnabled ? [..._reports, ...demoReps] : _reports), [demoEnabled, _reports, demoReps]);
  const bookingIds = bookings.map((b) => b.id);

  const { data: _allTasks = [] } = useQuery({
    queryKey: ["mentor-sessoes-tasks", realBookingIds],
    queryFn: async () => {
      if (!realBookingIds.length) return [];
      const { data, error } = await supabase
        .from("session_tasks")
        .select("*")
        .in("booking_id", realBookingIds)
        .order("created_at");
      if (error) throw error;
      return data || [];
    },
    enabled: realBookingIds.length > 0,
  });
  const demoTks = useMemo(
    () => (demoEnabled ? demoTasksForBookings(demoBks) : []),
    [demoEnabled, demoBks]
  );
  const allTasks = demoEnabled ? [..._allTasks, ...demoTks] : _allTasks;

  const reportBookingIds = useMemo(() => new Set(reports.map((r) => r.booking_id)), [reports]);
  const libertyMap = Object.fromEntries(libertyProfiles.map((p) => [p.id, p.full_name]));
  const sessionMap = Object.fromEntries(sessions.map((s) => [s.id, s.name]));
  const sessionCoverMap = Object.fromEntries(sessions.map((s) => [s.id, s.cover_image_url]));

  // Sessões do mês selecionado (usadas pelas abas por status, para a navegação de mês funcionar)
  const monthBookings = useMemo(
    () => bookings.filter((b) => b.scheduled_date >= monthStartStr && b.scheduled_date < monthEndStr),
    [bookings, monthStartStr, monthEndStr],
  );

  // Pendências do mentor (todos os meses): sessões que passaram e ainda não foram fechadas,
  // ou já marcadas como realizadas mas sem relatório.
  const pendingActions = useMemo(
    () => sortByScheduledDateDesc(bookings.filter((b) => getMentorPendingAction(b, reportBookingIds.has(b.id)) !== null)),
    [bookings, reportBookingIds],
  );

  const filtered = useMemo(() => {
    if (activeTab === "upcoming") return monthBookings.filter(isFutureScheduledBooking);
    if (activeTab === "to_confirm") return pendingActions;
    if (activeTab === "pending") return monthBookings.filter((b) => getEffectiveBookingStatus(b) === "pending_approval");
    if (activeTab === "completed") return sortByScheduledDateDesc(monthBookings.filter(isRealizedSessionBooking));
    if (activeTab === "not_realized") return monthBookings.filter((b) => getEffectiveBookingStatus(b) === "not_realized");
    if (activeTab === "cancelled") return monthBookings.filter((b) => getEffectiveBookingStatus(b) === "cancelled");
    return monthBookings;
  }, [monthBookings, activeTab, pendingActions]);

  const completedCount = monthBookings.filter(isRealizedSessionBooking).length;
  const scheduledCount = monthBookings.filter(isFutureScheduledBooking).length;
  const pendingConfirmationCount = monthBookings.filter((b) => getEffectiveBookingStatus(b) === "pending_confirmation").length;
  const pendingCount = monthBookings.filter((b) => getEffectiveBookingStatus(b) === "pending_approval").length;
  const notRealizedCount = monthBookings.filter((b) => getEffectiveBookingStatus(b) === "not_realized").length;
  const cancelledCount = monthBookings.filter((b) => getEffectiveBookingStatus(b) === "cancelled").length;

  const tabs: { key: TabKey; label: string; count: number; highlight?: boolean }[] = [
    { key: "to_confirm", label: "Pendências", count: pendingActions.length, highlight: pendingActions.length > 0 },
    { key: "upcoming", label: "Próximas", count: scheduledCount },
    { key: "completed", label: bookingStatusConfig.completed.label + "s", count: completedCount },
    { key: "all", label: "Todas", count: monthBookings.length },
    { key: "pending", label: bookingStatusConfig.pending_approval.label, count: pendingCount },
    { key: "not_realized", label: bookingStatusConfig.not_realized.label + "s", count: notRealizedCount },
    { key: "cancelled", label: bookingStatusConfig.cancelled.label + "s", count: cancelledCount },
  ];

  const releaseAvailability = async (availabilityId?: string | null) => {
    if (!availabilityId) return;
    const { error } = await supabase.from("mentor_availability").update({ is_booked: false }).eq("id", availabilityId);
    if (error) {
      console.error("Falha ao liberar horário na disponibilidade", error);
      toast.warning("A sessão foi atualizada, mas o horário não pôde ser liberado na disponibilidade.");
    }
  };

  const approveBooking = async (bookingId: string) => {
    setActingId(bookingId);
    const { error } = await supabase
      .from("bookings")
      .update({ status: "scheduled", approval_required: false })
      .eq("id", bookingId);
    setActingId(null);
    if (error) { toast.error(translateBookingError(error, "Erro ao confirmar.")); return; }
    toast.success("Sessão confirmada! O membro foi notificado.");
    supabase.functions
      .invoke("google-calendar-sync", { body: { booking_id: bookingId } })
      .catch((e) => console.error("Falha ao sincronizar com o Google Agenda", e));
    await invalidateMentorBookingQueries(queryClient);
  };

  const rejectBooking = async (bookingId: string, availabilityId: string | null | undefined, reason: string) => {
    setActingId(bookingId);
    const { error } = await supabase
      .from("bookings")
      .update({ status: "cancelled", cancellation_reason: reason || "Horário indisponível" })
      .eq("id", bookingId);
    setActingId(null);
    if (error) { toast.error(translateBookingError(error, "Erro ao recusar.")); return; }
    await releaseAvailability(availabilityId);
    toast.success("Solicitação recusada. O membro foi avisado para escolher outro horário.");
    await invalidateMentorBookingQueries(queryClient);
  };

  const cancelBooking = async (bookingId: string, availabilityId: string | null | undefined, reason: string) => {
    setActingId(bookingId);
    const { error } = await supabase
      .from("bookings")
      .update({ status: "cancelled", cancellation_reason: reason || "Sessão desmarcada pelo mentor" })
      .eq("id", bookingId);
    setActingId(null);
    if (error) { toast.error(translateBookingError(error, "Erro ao desmarcar.")); return; }
    await releaseAvailability(availabilityId);
    toast.success("Sessão desmarcada. O membro foi avisado.");
    await invalidateMentorBookingQueries(queryClient);
  };

  const emptyCopy = activeTab === "to_confirm"
    ? { title: "Nenhuma pendência", description: "Todas as suas sessões passadas estão confirmadas e com relatório." }
    : { title: "Nenhuma sessão neste período", description: "Tente avançar para o próximo mês ou trocar o filtro acima." };

  const detailBooking = detailBookingId ? bookings.find((b) => b.id === detailBookingId) ?? null : null;
  const memberNameOf = (b: BookingRow) => shortName((b.liberty_id ? libertyMap[b.liberty_id] : b.guest_name) || "Membro");
  const timeRange = (b: BookingRow) => `${b.start_time?.slice(0, 5) ?? "--:--"} – ${b.end_time?.slice(0, 5) ?? "--:--"}`;
  const openReport = (id: string) => navigate(`/mentor/sessoes/${id}/relatorio`);

  const submitReason = async () => {
    if (!reasonTarget) return;
    const target = reasonTarget;
    setReasonTarget(null);
    if (target.kind === "reject") await rejectBooking(target.bookingId, target.availabilityId, reasonText);
    else await cancelBooking(target.bookingId, target.availabilityId, reasonText);
    setReasonText("");
  };

  return (
    <AppLayout role="mentor">
      <PageContainer>
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
        <motion.div variants={fadeUpItem}>
          <PageHeader
            title="Minha agenda"
            description="Acompanhe e feche suas sessões de mentoria"
            actions={
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
            }
          />
        </motion.div>

        {/* Filtros */}
        <motion.div variants={fadeUpItem} className="flex gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-hide" role="tablist" aria-label="Filtrar sessões">
          {tabs.map((tab) => (
            <Chip
              key={tab.key}
              active={activeTab === tab.key}
              onClick={() => handleTabChange(tab.key)}
              count={tab.count}
              className={tab.highlight && activeTab !== tab.key ? "border-status-yellow/40 text-foreground" : undefined}
            >
              {tab.label}
            </Chip>
          ))}
        </motion.div>

        {activeTab === "to_confirm" && (
          <motion.div variants={fadeUpItem}>
            <Callout tone="warning" icon={AlertCircle} title="Pendências de todos os meses">
              {MENTOR_PENDING_CONFIRMATION_HINT}
            </Callout>
          </motion.div>
        )}

        {/* Lista de sessões */}
        <motion.div variants={fadeUpItem}>
          {isError ? (
            <ErrorState title="Não foi possível carregar suas sessões" onRetry={() => refetch()} />
          ) : isLoading ? (
            <LoadingState variant="list" rows={4} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={Calendar} title={emptyCopy.title} description={emptyCopy.description} />
          ) : (
            <SectionCard padding="none">
              {filtered.map((booking, idx) => {
                const hasReport = reportBookingIds.has(booking.id);
                const effectiveStatus = getEffectiveBookingStatus(booking, { hasReport });
                const pendingAction = getMentorPendingAction(booking, hasReport);
                const busy = actingId === booking.id || closingId === booking.id;
                const isLast = idx === filtered.length - 1;

                return (
                  <div key={booking.id} className={isLast ? undefined : "border-b border-border"}>
                    <ListRow
                      last
                      leading={<DateBlock date={booking.scheduled_date} />}
                      title={sessionMap[booking.session_id] || "Sessão"}
                      subtitle={`${memberNameOf(booking)} · ${timeRange(booking)}`}
                      trailing={<StatusPill status={effectiveStatus} />}
                      onPress={() => setDetailBookingId(booking.id)}
                      aria-label={`Detalhes da sessão ${sessionMap[booking.session_id] || ""} com ${memberNameOf(booking)}`}
                    />

                    {/* Solicitação do membro: confirmar ou recusar */}
                    {effectiveStatus === "pending_approval" && (
                      <div className="px-4 pb-4 -mt-1 sm:pl-[68px] flex items-center gap-2 flex-wrap">
                        <Button size="sm" disabled={busy} onClick={() => approveBooking(booking.id)}>
                          <CheckCircle2 /> Confirmar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => { setReasonText(""); setReasonTarget({ kind: "reject", bookingId: booking.id, availabilityId: availabilityOf(booking) }); }}
                        >
                          Recusar
                        </Button>
                      </div>
                    )}

                    {/* Relatório já enviado: atalho direto */}
                    {hasReport && !pendingAction && (
                      <div className="px-4 pb-3 -mt-1 sm:pl-[68px]">
                        <Button size="sm" variant="ghost" onClick={() => openReport(booking.id)}>
                          <FileText /> Ver relatório
                        </Button>
                      </div>
                    )}

                    {/* Fechamento pendente (D1): confirmar realizada / relatório / não realizada */}
                    {pendingAction && (
                      <div className="px-4 pb-4 -mt-1 sm:pl-[68px]">
                        <MentorPendingActions
                          booking={booking}
                          hasReport={hasReport}
                          busy={busy}
                          withHint={activeTab === "to_confirm"}
                          onFillReport={() => openReport(booking.id)}
                          onMarkCompleted={() => markCompleted(booking.id)}
                          onMarkNotRealized={() => setNotRealizedTarget(booking.id)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </SectionCard>
          )}
        </motion.div>
      </motion.div>
      </PageContainer>

      {/* Detalhe da sessão */}
      <BottomSheet
        open={!!detailBooking}
        onOpenChange={(open) => { if (!open) setDetailBookingId(null); }}
        title={detailBooking ? sessionMap[detailBooking.session_id] || "Sessão" : "Sessão"}
        description={detailBooking ? `${memberNameOf(detailBooking)} · ${format(parseISO(detailBooking.scheduled_date), "EEEE, dd 'de' MMMM", { locale: ptBR })} · ${timeRange(detailBooking)}` : undefined}
        footer={
          detailBooking ? (
            <>
              {detailBooking.liberty_id && (
                <Button variant="outline" onClick={() => navigate(`/mentor/alunos/${detailBooking.liberty_id}`)}>
                  Ver aluno
                </Button>
              )}
              {(reportBookingIds.has(detailBooking.id) || getMentorPendingAction(detailBooking, reportBookingIds.has(detailBooking.id)) === "report") && (
                <Button onClick={() => openReport(detailBooking.id)}>
                  <FileText /> {reportBookingIds.has(detailBooking.id) ? "Ver relatório" : "Preencher relatório"}
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        {detailBooking && (() => {
          const hasReport = reportBookingIds.has(detailBooking.id);
          const effectiveStatus = getEffectiveBookingStatus(detailBooking, { hasReport });
          const pendingAction = getMentorPendingAction(detailBooking, hasReport);
          const canCancel = effectiveStatus === "scheduled";
          const bTasks = allTasks.filter((t) => t.booking_id === detailBooking.id);
          const busy = actingId === detailBooking.id || closingId === detailBooking.id;
          const cover = sessionCoverMap[detailBooking.session_id];
          return (
            <div className="space-y-5">
              {cover && (
                <img src={cover} alt="" className="w-full aspect-[3/1] object-cover rounded-[var(--ds-radius-md)]" />
              )}
              <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
                <StatusPill status={effectiveStatus} size="md" />
                <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden /> {timeRange(detailBooking)}</span>
              </div>

              {pendingAction && (
                <MentorPendingActions
                  booking={detailBooking}
                  hasReport={hasReport}
                  busy={busy}
                  withHint
                  onFillReport={() => openReport(detailBooking.id)}
                  onMarkCompleted={() => markCompleted(detailBooking.id)}
                  onMarkNotRealized={() => setNotRealizedTarget(detailBooking.id)}
                />
              )}

              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Target className="h-4 w-4 text-muted-foreground" aria-hidden /> Tarefas
                </p>
                <TaskChecklist
                  tasks={bTasks}
                  bookingId={detailBooking.id}
                  role="mentor"
                  invalidateKeys={[["mentor-sessoes-tasks", bookingIds]]}
                />
              </div>

              {canCancel && (
                <div className="pt-4 border-t border-border space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => { setReasonText(""); setReasonTarget({ kind: "cancel", bookingId: detailBooking.id, availabilityId: availabilityOf(detailBooking) }); }}
                  >
                    <XCircle /> Desmarcar sessão
                  </Button>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Remove a sessão da agenda e do histórico do aluno. Remover só o horário na disponibilidade não desmarca a sessão.
                  </p>
                </div>
              )}
            </div>
          );
        })()}
      </BottomSheet>

      {/* Motivo para recusar / desmarcar */}
      <BottomSheet
        open={!!reasonTarget}
        onOpenChange={(open) => { if (!open) setReasonTarget(null); }}
        title={reasonTarget?.kind === "reject" ? "Recusar solicitação" : "Desmarcar sessão"}
        description={
          reasonTarget?.kind === "reject"
            ? "O membro verá esta mensagem e poderá escolher outro horário."
            : "A sessão sai da agenda e do histórico do aluno. O membro e o administrador verão o motivo."
        }
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setReasonTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={submitReason}>
              {reasonTarget?.kind === "reject" ? "Recusar sessão" : "Desmarcar sessão"}
            </Button>
          </>
        }
      >
        <TextAreaField
          label={reasonTarget?.kind === "reject" ? "Motivo da recusa" : "Motivo do cancelamento"}
          hint={reasonTarget?.kind === "reject" ? "Se deixar em branco, o membro verá “Horário indisponível”." : "Se deixar em branco, fica registrado “Sessão desmarcada pelo mentor”."}
          value={reasonText}
          onChange={(e) => setReasonText(e.target.value)}
          placeholder="Escreva em poucas palavras..."
          className="min-h-[96px] resize-y"
        />
      </BottomSheet>

      <NotRealizedDialog
        open={!!notRealizedTarget}
        onOpenChange={(open) => { if (!open) setNotRealizedTarget(null); }}
        busy={!!notRealizedTarget && closingId === notRealizedTarget}
        onConfirm={async (reason) => (notRealizedTarget ? markNotRealized(notRealizedTarget, reason) : false)}
      />
    </AppLayout>
  );
};

export default MentorSessoesPage;
