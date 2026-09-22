import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { Calendar, Clock, CheckCircle2, ChevronLeft, ChevronRight, FileText, AlertCircle, ChevronDown, Target } from "lucide-react";
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
import { getEffectiveBookingStatus, isVisibleSessionBooking, isAwaitingReport, bookingRequiresReport } from "@/lib/bookingStatus";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { useBookingsRealtime } from "@/hooks/useBookingsRealtime";

type TabKey = "upcoming" | "pending" | "completed" | "not_realized" | "cancelled" | "all";

const MentorSessoesPage = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { demoEnabled } = useDemoData();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const initialTab = (searchParams.get("tab") as TabKey) || "upcoming";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [expandedBooking, setExpandedBooking] = useState<string | null>(null);

  // Se o admin aprovar/recusar primeiro, a lista do mentor atualiza sozinha
  useBookingsRealtime(["mentor-bookings", "mentor-action-banner", "notifications-bell"], "mentor-sessoes");

  useEffect(() => {
    const t = searchParams.get("tab") as TabKey | null;
    if (t && t !== activeTab) setActiveTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTabChange = (key: TabKey) => {
    setActiveTab(key);
    const next = new URLSearchParams(searchParams);
    if (key === "upcoming") next.delete("tab"); else next.set("tab", key);
    setSearchParams(next, { replace: true });
  };

  const monthStart = startOfMonth(currentMonth);

  const { data: _bookings = [], isLoading } = useQuery({
    queryKey: ["mentor-bookings", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      // Carrega TODAS as sessões do mentor — futuras (qualquer mês) e passadas — para
      // que a aba "Próximas" mostre tudo que foi agendado, inclusive em meses seguintes.
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

  // Filter bookings to current month for demo too
  const monthEnd = addMonths(monthStart, 1);
  const demoBks = useMemo(() => {
    if (!demoEnabled || !profile?.id) return [];
    const all = demoBookingsForMentor(profile.id);
    return all.filter((b) => {
      const d = parseISO(b.scheduled_date);
      return d >= monthStart && d < monthEnd;
    });
  }, [demoEnabled, profile?.id, monthStart.toISOString()]);

  // Mantemos canceladas e pendentes para exibir nas próprias abas.
  const bookings = (demoEnabled ? [..._bookings, ...demoBks] : _bookings);

  const libertyIds = [...new Set(bookings.map((b) => b.liberty_id).filter((x): x is string => !!x))];

  const { data: _libertyProfiles = [] } = useQuery({
    queryKey: ["liberty-profiles", libertyIds],
    queryFn: async () => {
      if (libertyIds.length === 0) return [];
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", libertyIds);
      return data || [];
    },
    enabled: libertyIds.length > 0,
  });
  const libertyProfiles = demoEnabled ? [..._libertyProfiles, ...demoLibertyProfiles] : _libertyProfiles;

  const { data: _sessions = [] } = useQuery({
    queryKey: ["sessions-list"],
    queryFn: async () => {
      const { data } = await supabase.from("sessions").select("id, name, order, cover_image_url").order("order", { ascending: true });
      return data || [];
    },
  });
  const sessions = demoEnabled ? mergeDemoSessions(_sessions as any[]) : _sessions;


  const realBookingIds = _bookings.map((b) => b.id);
  // Fetch reports directly by mentor (via join) — avoids race with the bookings
  // list and any URL-length limits on .in(). Any report authored for one of this
  // mentor's bookings will be returned.
  const { data: _reports = [] } = useQuery({
    queryKey: ["booking-reports-check-by-mentor", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("booking_reports")
        .select("booking_id, bookings!inner(mentor_id)")
        .eq("bookings.mentor_id", profile.id);
      if (error) throw error;
      return (data || []).map((r: any) => ({ booking_id: r.booking_id }));
    },
    enabled: !!profile?.id,
  });
  const demoReps = useMemo(() => demoReportsForBookings(demoBks), [demoBks]);
  const reports = demoEnabled ? [..._reports, ...demoReps] : _reports;
  const bookingIds = bookings.map((b) => b.id);

  // Fetch tasks for all bookings
  const { data: _allTasks = [] } = useQuery({
    queryKey: ["mentor-sessoes-tasks", realBookingIds],
    queryFn: async () => {
      if (!realBookingIds.length) return [];
      const { data } = await supabase
        .from("session_tasks")
        .select("*")
        .in("booking_id", realBookingIds)
        .order("created_at");
      return data || [];
    },
    enabled: realBookingIds.length > 0,
  });
  const demoTks = useMemo(
    () => (demoEnabled ? demoTasksForBookings(demoBks) : []),
    [demoEnabled, demoBks]
  );
  const allTasks = demoEnabled ? [..._allTasks, ...demoTks] : _allTasks;

  const reportBookingIds = new Set(reports.map((r) => r.booking_id));
  const libertyMap = Object.fromEntries(libertyProfiles.map((p) => [p.id, p.full_name]));
  const sessionMap = Object.fromEntries(sessions.map((s) => [s.id, s.name]));
  const sessionCoverMap = Object.fromEntries(sessions.map((s) => [s.id, s.cover_image_url]));

  // Bookings of the currently selected month (used by all tabs so the month nav works)
  const monthBookings = useMemo(() => {
    return bookings.filter((b) => {
      const d = parseISO(b.scheduled_date);
      return d >= monthStart && d < monthEnd;
    });
  }, [bookings, monthStart.toISOString(), monthEnd.toISOString()]);

  const filtered = useMemo(() => {
    if (activeTab === "upcoming") return monthBookings.filter((b) => getEffectiveBookingStatus(b) === "scheduled");
    if (activeTab === "pending") return monthBookings.filter((b) => getEffectiveBookingStatus(b) === "pending_approval");
    if (activeTab === "completed") {
      // Inclui sessões já realizadas E sessões passadas ainda sem relatório
      // (mesmo que o status continue "scheduled/rescheduled"), para o mentor conseguir preencher.
      return monthBookings.filter((b) => {
        const s = getEffectiveBookingStatus(b);
        if (s === "completed") return true;
        return isAwaitingReport(b, reportBookingIds.has(b.id));
      });
    }
    if (activeTab === "not_realized") return monthBookings.filter((b) => getEffectiveBookingStatus(b) === "not_realized");
    if (activeTab === "cancelled") return monthBookings.filter((b) => getEffectiveBookingStatus(b) === "cancelled");
    return monthBookings;
  }, [monthBookings, activeTab, reportBookingIds]);

  const completedCount = monthBookings.filter((b) => getEffectiveBookingStatus(b) === "completed").length;
  const scheduledCount = monthBookings.filter((b) => getEffectiveBookingStatus(b) === "scheduled").length;
  const pendingCount = monthBookings.filter((b) => getEffectiveBookingStatus(b) === "pending_approval").length;
  const notRealizedCount = monthBookings.filter((b) => getEffectiveBookingStatus(b) === "not_realized").length;
  const cancelledCount = monthBookings.filter((b) => getEffectiveBookingStatus(b) === "cancelled").length;
  // Considera relatório pendente qualquer sessão passada sem relatório (independente do mês exibido),
  // para o mentor não perder sessões antigas que ficaram só "agendadas".
  const pendingReports = bookings.filter((b) => isAwaitingReport(b, reportBookingIds.has(b.id))).length;

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "upcoming", label: "Confirmadas", count: scheduledCount },
    { key: "pending", label: "Aguardando aprovação", count: pendingCount },
    { key: "completed", label: "Realizadas", count: completedCount },
    { key: "not_realized", label: "Não realizadas", count: notRealizedCount },
    { key: "cancelled", label: "Canceladas", count: cancelledCount },
    { key: "all", label: "Todas", count: monthBookings.length },
  ];

  const markNotRealized = async (bookingId: string) => {
    const reason = window.prompt(
      "Descreva brevemente o motivo (será enviado ao administrador):",
      ""
    );
    if (reason === null) return;
    const { error } = await supabase
      .from("bookings")
      .update({ status: "not_realized" as any, cancellation_reason: reason || "Não realizada" })
      .eq("id", bookingId);
    if (error) { toast.error("Erro ao atualizar: " + error.message); return; }
    toast.success("Marcada como não realizada. Administrador foi notificado");
    queryClient.invalidateQueries({ queryKey: ["mentor-bookings", profile?.id] });
  };

  const [actingId, setActingId] = useState<string | null>(null);

  const approveBooking = async (bookingId: string) => {
    setActingId(bookingId);
    const { error } = await supabase
      .from("bookings")
      .update({ status: "scheduled" as any, approval_required: false })
      .eq("id", bookingId);
    setActingId(null);
    if (error) { toast.error("Erro ao confirmar: " + error.message); return; }
    toast.success("Sessão confirmada! O membro foi notificado.");
    supabase.functions.invoke("google-calendar-sync", { body: { booking_id: bookingId } }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["mentor-bookings", profile?.id] });
  };

  const rejectBooking = async (bookingId: string, availabilityId?: string | null) => {
    const reason = window.prompt("Motivo da recusa (o membro verá esta mensagem):", "");
    if (reason === null) return;
    setActingId(bookingId);
    const { error } = await supabase
      .from("bookings")
      .update({ status: "cancelled" as any, cancellation_reason: reason || "Horário indisponível" })
      .eq("id", bookingId);
    setActingId(null);
    if (error) { toast.error("Erro ao recusar: " + error.message); return; }
    if (availabilityId) {
      await supabase.from("mentor_availability").update({ is_booked: false }).eq("id", availabilityId);
    }
    toast.success("Solicitação recusada. O membro foi avisado para escolher outro horário.");
    queryClient.invalidateQueries({ queryKey: ["mentor-bookings", profile?.id] });
  };

  const cancelBooking = async (bookingId: string, availabilityId?: string | null) => {
    if (!window.confirm("Desmarcar esta sessão? Ela sai da agenda e do histórico do aluno.")) return;
    const reason = window.prompt("Motivo do cancelamento (o membro e o admin verão):", "");
    if (reason === null) return;
    setActingId(bookingId);
    const { error } = await supabase
      .from("bookings")
      .update({ status: "cancelled" as any, cancellation_reason: reason || "Sessão desmarcada pelo mentor" })
      .eq("id", bookingId);
    setActingId(null);
    if (error) { toast.error("Erro ao desmarcar: " + error.message); return; }
    if (availabilityId) {
      await supabase.from("mentor_availability").update({ is_booked: false }).eq("id", availabilityId);
    }
    toast.success("Sessão desmarcada. O membro foi avisado.");
    queryClient.invalidateQueries({ queryKey: ["mentor-bookings", profile?.id] });
  };

  return (
    <AppLayout role="mentor">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
        <motion.div variants={fadeUpItem}>
          <h1 className="text-2xl font-semibold text-foreground">Minha Agenda</h1>
          <p className="text-muted-foreground text-sm mt-1">Acompanhe suas sessões de mentoria</p>
        </motion.div>

        {/* Month nav + stats */}
        <motion.div variants={fadeUpItem} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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

          <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide max-w-full" style={{ scrollbarWidth: "none" }}>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5 text-status-green" />
              <span>{completedCount} realizadas</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap shrink-0">
              <Calendar className="h-3.5 w-3.5 text-status-blue" />
              <span>{scheduledCount} agendadas</span>
            </div>
            {pendingReports > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-status-yellow whitespace-nowrap shrink-0">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{pendingReports} relatório{pendingReports !== 1 ? "s" : ""} pendente{pendingReports !== 1 ? "s" : ""}</span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Tabs — horizontally scrollable on mobile with fade indicator */}
        <motion.div variants={fadeUpItem} className="relative -mx-1">
          <div
            className="flex gap-1 p-1 bg-muted/50 rounded-lg overflow-x-auto scrollbar-hide"
            style={{ scrollbarWidth: "none", WebkitMaskImage: "linear-gradient(to right, black calc(100% - 24px), transparent)" }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
                  activeTab === tab.key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        </motion.div>

        {/* Sessions list */}
        <motion.div variants={fadeUpItem} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isLoading ? (
            <div className="glass-card p-8 text-center">
              <p className="text-sm text-muted-foreground">Carregando sessões...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="md:col-span-2">
              <EmptyState
                icon={Calendar}
                title="Nenhuma sessão neste período"
                description="Tente avançar para o próximo mês ou trocar o filtro acima."
              />
            </div>
          ) : (
            filtered.map((booking) => {
              const effectiveStatus = getEffectiveBookingStatus(booking);
              const rawStatus = booking.status || "scheduled";
              const canMarkNotRealized = !["completed", "cancelled", "not_realized"].includes(rawStatus);
              
              const hasReport = reportBookingIds.has(booking.id);
              // Mapeamento do Negócio (3h) e registros retroativos não exigem relatório
              const needsReport =
                !hasReport &&
                bookingRequiresReport(booking) &&
                (effectiveStatus === "completed" || effectiveStatus === "awaiting_report");
              const bTasks = allTasks.filter((t) => t.booking_id === booking.id);
              const completedTaskCount = bTasks.filter((t) => t.is_completed).length;
              const isExpanded = expandedBooking === booking.id;
              // Sessão que já aconteceu e ainda não tem relatório: clicar leva direto ao formulário.
              const openCard = () =>
                needsReport
                  ? navigate(`/mentor/sessoes/${booking.id}/relatorio`)
                  : setExpandedBooking(isExpanded ? null : booking.id);

              return (
                <div key={booking.id} className="dark glass-card overflow-hidden bg-card text-card-foreground">
                  {sessionCoverMap[booking.session_id] && (
                    <div
                      className="relative aspect-[5/1] sm:aspect-[6/1] w-full cursor-pointer overflow-hidden"
                      onClick={openCard}
                    >
                      <img src={sessionCoverMap[booking.session_id]!} alt={sessionMap[booking.session_id] || "Sessão"} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                      <div className="absolute bottom-2 left-4 right-4 flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground drop-shadow-sm">
                          {sessionMap[booking.session_id] || "Sessão"}
                        </span>
                        <StatusBadge status={effectiveStatus} />
                      </div>
                    </div>
                  )}
                  <div
                    className="p-4 flex items-center justify-between gap-4 hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={openCard}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Date badge */}
                      <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-muted flex flex-col items-center justify-center">
                        <span className="text-xs text-muted-foreground leading-none">
                          {format(parseISO(booking.scheduled_date), "MMM", { locale: ptBR })}
                        </span>
                        <span className="text-lg font-semibold text-foreground leading-tight">
                          {format(parseISO(booking.scheduled_date), "dd")}
                        </span>
                      </div>

                      <div className="min-w-0">
                        {!sessionCoverMap[booking.session_id] && (
                          <p className="text-sm font-medium text-foreground truncate">
                            {sessionMap[booking.session_id] || "Sessão"}
                          </p>
                        )}
                        {booking.liberty_id ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/mentor/alunos/${booking.liberty_id}`); }}
                            className="text-xs text-muted-foreground truncate hover:text-primary hover:underline transition-colors text-left"
                          >
                            {shortName(libertyMap[booking.liberty_id] || "Membro")}
                          </button>
                        ) : (
                          <p className="text-xs text-muted-foreground truncate">
                            {shortName(booking.guest_name || "Membro")}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {booking.start_time.slice(0, 5)} – {booking.end_time.slice(0, 5)}
                          </span>
                          <StatusBadge status={effectiveStatus} />
                          {bTasks.length > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              {completedTaskCount}/{bTasks.length} tarefas
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {effectiveStatus === "pending_approval" && (
                        <>
                          <button
                            disabled={actingId === booking.id}
                            onClick={(e) => { e.stopPropagation(); approveBooking(booking.id); }}
                            className="btn-silver text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3 w-3" /> Confirmar
                          </button>
                          <button
                            disabled={actingId === booking.id}
                            onClick={(e) => { e.stopPropagation(); rejectBooking(booking.id, (booking as any).availability_id); }}
                            className="text-xs px-3 py-1.5 rounded-lg border border-status-red/30 text-status-red hover:bg-status-red/10 transition-colors disabled:opacity-50"
                          >
                            Recusar
                          </button>
                        </>
                      )}
                      {needsReport && (
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/mentor/sessoes/${booking.id}/relatorio`); }}
                          className="btn-silver text-xs px-3 py-1.5 flex items-center gap-1.5"
                        >
                          <FileText className="h-3 w-3" /> Preencher relatório
                        </button>
                      )}
                      {hasReport && (
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/mentor/sessoes/${booking.id}/relatorio`); }}
                          className="text-xs px-3 py-1.5 border border-border/50 rounded-lg text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                        >
                          <FileText className="h-3 w-3" /> Ver relatório
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={isExpanded ? "Recolher detalhes" : "Ver tarefas e opções"}
                        onClick={(e) => { e.stopPropagation(); setExpandedBooking(isExpanded ? null : booking.id); }}
                        className="p-1 rounded-md hover:bg-muted/40 transition-colors"
                      >
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded task checklist */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-border/30 pt-3 space-y-4">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2"><Target className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />Tarefas</p>
                        <TaskChecklist
                          tasks={bTasks}
                          bookingId={booking.id}
                          role="mentor"
                          invalidateKeys={[["mentor-sessoes-tasks", bookingIds]]}
                        />
                      </div>
                      {canMarkNotRealized && (
                        <div className="pt-2 border-t border-border/20 space-y-3">
                          <div>
                            <button
                              onClick={(e) => { e.stopPropagation(); markNotRealized(booking.id); }}
                              className="text-xs px-3 py-1.5 rounded-lg border border-status-red/30 text-status-red hover:bg-status-red/10 transition-colors flex items-center gap-1.5"
                            >
                              <AlertCircle className="h-3 w-3" /> Marcar como não realizada
                            </button>
                            <p className="text-[10px] text-muted-foreground mt-1.5">Use quando a sessão não aconteceu; o admin será avisado para revisar.</p>
                          </div>
                          <div>
                            <button
                              disabled={actingId === booking.id}
                              onClick={(e) => { e.stopPropagation(); cancelBooking(booking.id, (booking as any).availability_id); }}
                              className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <AlertCircle className="h-3 w-3" /> Desmarcar sessão
                            </button>
                            <p className="text-[10px] text-muted-foreground mt-1.5">
                              Remove a sessão da agenda e do histórico do aluno. Remover só o horário na disponibilidade não desmarca a sessão.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </motion.div>
      </motion.div>
    </AppLayout>
  );
};

export default MentorSessoesPage;
