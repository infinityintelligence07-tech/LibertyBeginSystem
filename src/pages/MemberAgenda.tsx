import { useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Calendar, Clock, ChevronLeft, ChevronRight, ExternalLink, Target, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BottomSheet,
  DateBlock,
  EmptyState as DsEmptyState,
  ErrorState,
  IconButton,
  ListRow,
  LoadingState,
  PageContainer,
  PageHeader,
  SectionCard,
  StatusPill,
} from "@/components/ds";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, addMonths, subMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { shortName } from "@/lib/formatName";
import { Link } from "react-router-dom";
import { TaskChecklist } from "@/components/TaskChecklist";
import { useDemoData } from "@/contexts/DemoDataContext";
import {
  demoBookingsForMember, demoTasksForBookings,
  demoMentorProfiles, mergeDemoSessions,
} from "@/lib/demoForUser";
import {
  bookingStatusConfig,
  getEffectiveBookingStatus,
  isVisibleSessionBooking,
  PENDING_CONFIRMATION_HINT,
  sortByScheduledDateAsc,
  todayPlatformDate,
} from "@/lib/bookingStatus";
import { fetchMentorNames } from "@/lib/mentorNames";

/** Status que aparecem na agenda do membro: futuras, aguardando aprovação e as de hoje ainda "A confirmar". */
const AGENDA_STATUSES = new Set(["scheduled", "pending_approval", "pending_confirmation"]);

const MemberAgendaPage = () => {
  const { profile } = useAuth();
  const { demoEnabled } = useDemoData();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [expandedBooking, setExpandedBooking] = useState<string | null>(null);

  // "Hoje" no fuso da plataforma (São Paulo), comparado como texto YYYY-MM-DD.
  // parseISO + format deslocava o dia conforme o fuso do celular e podia esconder a sessão de hoje.
  const todayStr = todayPlatformDate();
  const { queryStartStr, monthEndStr } = useMemo(() => {
    const monthStartStr = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const endStr = format(addMonths(startOfMonth(currentMonth), 1), "yyyy-MM-dd");
    return {
      queryStartStr: monthStartStr > todayStr ? monthStartStr : todayStr,
      monthEndStr: endStr,
    };
  }, [currentMonth, todayStr]);

  const { data: _bookings = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["member-agenda", profile?.id, queryStartStr, monthEndStr],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("liberty_id", profile.id)
        .gte("scheduled_date", queryStartStr)
        .lt("scheduled_date", monthEndStr)
        .order("scheduled_date", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const demoBks = useMemo(() => {
    if (!demoEnabled || !profile?.id) return [];
    return demoBookingsForMember(profile.id).filter(
      (b) => b.scheduled_date >= queryStartStr && b.scheduled_date < monthEndStr,
    );
  }, [demoEnabled, profile?.id, queryStartStr, monthEndStr]);
  // Mostramos confirmadas e pendentes de aprovação. Canceladas ficam fora da agenda do aluno.
  const bookings = (demoEnabled ? [..._bookings, ...demoBks] : _bookings).filter(isVisibleSessionBooking);

  const mentorIds = [...new Set(bookings.map((b) => b.mentor_id).filter((id) => !id.startsWith("demo-")))];
  const { data: _mentorProfiles = [] } = useQuery({
    queryKey: ["member-agenda-mentors", mentorIds],
    queryFn: async () => {
      return fetchMentorNames(mentorIds);
    },
    enabled: mentorIds.length > 0,
  });
  const mentorProfiles = demoEnabled ? [..._mentorProfiles, ...demoMentorProfiles] : _mentorProfiles;

  const { data: _sessions = [] } = useQuery({
    queryKey: ["sessions-list-member"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions").select("id, name, cover_image_url").order("order");
      if (error) throw error;
      return data || [];
    },
  });
  const sessions = demoEnabled ? mergeDemoSessions(_sessions) : _sessions;


  const realBookingIds = _bookings.map((b) => b.id);
  const { data: _allTasks = [] } = useQuery({
    queryKey: ["member-agenda-tasks", realBookingIds],
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
  const demoTks = useMemo(() => (demoEnabled ? demoTasksForBookings(demoBks) : []), [demoEnabled, demoBks]);
  const allTasks = demoEnabled ? [..._allTasks, ...demoTks] : _allTasks;

  const mentorMap = Object.fromEntries(mentorProfiles.map((p) => [p.id, p.full_name]));
  const sessionMap = Object.fromEntries(sessions.map((s) => [s.id, s.name]));
  const sessionCoverMap = Object.fromEntries(sessions.map((s) => [s.id, s.cover_image_url]));

  const scheduledBookings = sortByScheduledDateAsc(
    bookings.filter((b) => AGENDA_STATUSES.has(getEffectiveBookingStatus(b)))
  );
  const confirmedCount = scheduledBookings.filter((b) => getEffectiveBookingStatus(b) === "scheduled").length;
  const pendingCount = scheduledBookings.filter((b) => getEffectiveBookingStatus(b) === "pending_approval").length;
  const pendingConfirmationCount = scheduledBookings.filter(
    (b) => getEffectiveBookingStatus(b) === "pending_confirmation",
  ).length;
  // A próxima sessão é destacada na lista.
  const nextBookingId = scheduledBookings[0]?.id ?? null;
  const selectedBooking = expandedBooking ? scheduledBookings.find((b) => b.id === expandedBooking) ?? null : null;
  const selectedStatus = selectedBooking ? getEffectiveBookingStatus(selectedBooking) : null;
  const selectedTasks = selectedBooking ? allTasks.filter((t) => t.booking_id === selectedBooking.id) : [];
  const selectedCover = selectedBooking ? sessionCoverMap[selectedBooking.session_id] : null;
  const monthLabel = format(currentMonth, "MMMM yyyy", { locale: ptBR });

  return (
    <AppLayout role="liberty">
      <PageContainer>
      <div className="space-y-6">
        <div>
          <PageHeader
            title="Minha agenda"
            description="Próximas sessões de mentoria."
            actions={
              <Button asChild>
                <Link to="/agenda/overview">
                  <Calendar className="h-4 w-4" aria-hidden /> Agendar sessão
                </Link>
              </Button>
            }
          />
        </div>

        {/* Navegação por mês + resumo */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <IconButton
              aria-label="Mês anterior"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              disabled={format(startOfMonth(currentMonth), "yyyy-MM-dd") <= `${todayStr.slice(0, 7)}-01`}
            >
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
            <span className="text-sm font-semibold text-foreground first-letter:uppercase min-w-[140px] text-center" aria-live="polite">
              {monthLabel}
            </span>
            <IconButton aria-label="Próximo mês" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </IconButton>
          </div>
          <div className="flex items-center gap-2 flex-wrap" aria-label="Resumo do mês">
            <StatusPill tone="info">
              {confirmedCount} {confirmedCount !== 1 ? bookingStatusConfig.scheduled.label.toLowerCase() + "s" : bookingStatusConfig.scheduled.label.toLowerCase()}
            </StatusPill>
            {pendingCount > 0 && (
              <StatusPill tone="warning">
                {pendingCount} {bookingStatusConfig.pending_approval.label.toLowerCase()}
              </StatusPill>
            )}
            {pendingConfirmationCount > 0 && (
              <span title={PENDING_CONFIRMATION_HINT} className="inline-flex">
                <StatusPill tone="pending">
                  {pendingConfirmationCount} {bookingStatusConfig.pending_confirmation.label.toLowerCase()}
                </StatusPill>
              </span>
            )}
          </div>
        </div>

        {/* Lista de sessões */}
        <div>
          {isError ? (
            <ErrorState
              compact
              title="Não foi possível carregar sua agenda"
              description="Verifique sua conexão e tente novamente."
              onRetry={() => void refetch()}
            />
          ) : isLoading ? (
            <LoadingState variant="list" rows={3} />
          ) : scheduledBookings.length === 0 ? (
            <DsEmptyState
              icon={Calendar}
              title="Nenhuma sessão futura neste mês"
              description="Agende uma nova sessão para continuar avançando na jornada."
              action={
                <Button asChild>
                  <Link to="/agenda/overview">
                    <Calendar className="h-4 w-4" aria-hidden /> Agendar sessão
                  </Link>
                </Button>
              }
            />
          ) : (
            <SectionCard padding="none">
              {scheduledBookings.map((booking, i) => {
                const effectiveStatus = getEffectiveBookingStatus(booking);
                const statusHint = effectiveStatus === "pending_confirmation" ? PENDING_CONFIRMATION_HINT : undefined;
                const bTasks = allTasks.filter((t) => t.booking_id === booking.id);
                const completedTaskCount = bTasks.filter((t) => t.is_completed).length;
                const sessionName = sessionMap[booking.session_id] || "Sessão";

                return (
                  <ListRow
                    key={booking.id}
                    active={booking.id === nextBookingId}
                    last={i === scheduledBookings.length - 1}
                    onPress={() => setExpandedBooking(booking.id)}
                    leading={<DateBlock date={booking.scheduled_date} />}
                    title={sessionName}
                    subtitle={
                      <span className="inline-flex items-center gap-x-2 gap-y-1 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden />
                          {booking.start_time.slice(0, 5)} · {booking.end_time.slice(0, 5)}
                        </span>
                        <span>com {shortName(mentorMap[booking.mentor_id] || "Mentor")}</span>
                        {bTasks.length > 0 && <span>{completedTaskCount}/{bTasks.length} tarefas</span>}
                      </span>
                    }
                    trailing={
                      <span title={statusHint} className="inline-flex">
                        <StatusPill status={effectiveStatus} size="sm" />
                      </span>
                    }
                  />
                );
              })}
            </SectionCard>
          )}
        </div>
      </div>
      </PageContainer>

      {/* Detalhes da sessão */}
      <BottomSheet
        open={Boolean(selectedBooking)}
        onOpenChange={(open) => { if (!open) setExpandedBooking(null); }}
        title={selectedBooking ? sessionMap[selectedBooking.session_id] || "Sessão" : "Sessão"}
        description={
          selectedBooking
            ? `${format(parseISO(selectedBooking.scheduled_date), "EEEE, dd 'de' MMMM", { locale: ptBR })} · ${selectedBooking.start_time.slice(0, 5)} às ${selectedBooking.end_time.slice(0, 5)}`
            : undefined
        }
        footer={
          selectedBooking && selectedStatus === "scheduled" && selectedBooking.zoom_join_url ? (
            <Button asChild size="lg" className="w-full">
              <a href={selectedBooking.zoom_join_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden /> Acessar Zoom
              </a>
            </Button>
          ) : undefined
        }
      >
        {selectedBooking && selectedStatus && (
          <div className="space-y-4">
            {selectedCover && (
              <img src={selectedCover} alt="" className="w-full aspect-video object-cover rounded-ds-lg" />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span title={selectedStatus === "pending_confirmation" ? PENDING_CONFIRMATION_HINT : undefined} className="inline-flex">
                <StatusPill status={selectedStatus} size="md" />
              </span>
              <StatusPill tone="neutral" size="md" withDot={false}>
                <User className="h-3 w-3" aria-hidden /> {shortName(mentorMap[selectedBooking.mentor_id] || "Mentor")}
              </StatusPill>
            </div>
            {selectedStatus === "pending_confirmation" && (
              <p className="text-sm text-muted-foreground">{PENDING_CONFIRMATION_HINT}</p>
            )}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 inline-flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5" aria-hidden />Tarefas
              </p>
              {selectedTasks.length > 0 ? (
                <TaskChecklist
                  tasks={selectedTasks}
                  bookingId={selectedBooking.id}
                  role="liberty"
                  invalidateKeys={[["member-agenda-tasks"]]}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma tarefa atribuída para esta sessão.</p>
              )}
            </div>
          </div>
        )}
      </BottomSheet>
    </AppLayout>
  );
};

export default MemberAgendaPage;
