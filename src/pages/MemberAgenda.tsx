import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { Calendar, Clock, ChevronLeft, ChevronRight, ExternalLink, Target } from "lucide-react";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
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
import { getEffectiveBookingStatus, isVisibleSessionBooking, sortByScheduledDateAsc } from "@/lib/bookingStatus";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";

const MemberAgendaPage = () => {
  const { profile } = useAuth();
  const { demoEnabled } = useDemoData();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [expandedBooking, setExpandedBooking] = useState<string | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = addMonths(monthStart, 1);
  // Always from today forward — never show past sessions on the member agenda
  const queryStart = monthStart > today ? monthStart : today;

  const { data: _bookings = [], isLoading } = useQuery({
    queryKey: ["member-agenda", profile?.id, queryStart.toISOString()],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("bookings")
        .select("*")
        .eq("liberty_id", profile.id)
        .gte("scheduled_date", format(queryStart, "yyyy-MM-dd"))
        .lt("scheduled_date", format(monthEnd, "yyyy-MM-dd"))
        .order("scheduled_date", { ascending: true })
        .order("start_time", { ascending: true });
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const demoBks = useMemo(() => {
    if (!demoEnabled || !profile?.id) return [];
    return demoBookingsForMember(profile.id).filter((b) => {
      const d = parseISO(b.scheduled_date);
      return d >= queryStart && d < monthEnd;
    });
  }, [demoEnabled, profile?.id, queryStart.toISOString(), monthEnd.toISOString()]);
  // Mostramos confirmadas e pendentes de aprovação. Canceladas ficam fora da agenda do aluno.
  const bookings = (demoEnabled ? [..._bookings, ...demoBks] : _bookings).filter(isVisibleSessionBooking);

  const mentorIds = [...new Set(bookings.map((b) => b.mentor_id))];
  const { data: _mentorProfiles = [] } = useQuery({
    queryKey: ["member-agenda-mentors", mentorIds],
    queryFn: async () => {
      if (!mentorIds.length) return [];
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", mentorIds);
      return data || [];
    },
    enabled: mentorIds.length > 0,
  });
  const mentorProfiles = demoEnabled ? [..._mentorProfiles, ...demoMentorProfiles] : _mentorProfiles;

  const { data: _sessions = [] } = useQuery({
    queryKey: ["sessions-list-member"],
    queryFn: async () => {
      const { data } = await supabase.from("sessions").select("id, name, cover_image_url").order("order");
      return data || [];
    },
  });
  const sessions = demoEnabled ? mergeDemoSessions(_sessions as any[]) : _sessions;


  const realBookingIds = _bookings.map((b) => b.id);
  const { data: _allTasks = [] } = useQuery({
    queryKey: ["member-agenda-tasks", realBookingIds],
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
  const demoTks = useMemo(() => (demoEnabled ? demoTasksForBookings(demoBks) : []), [demoEnabled, demoBks]);
  const allTasks = demoEnabled ? [..._allTasks, ...demoTks] : _allTasks;
  const bookingIds = bookings.map((b) => b.id);

  const mentorMap = Object.fromEntries(mentorProfiles.map((p) => [p.id, p.full_name]));
  const sessionMap = Object.fromEntries(sessions.map((s) => [s.id, s.name]));
  const sessionCoverMap = Object.fromEntries(sessions.map((s) => [s.id, s.cover_image_url]));

  const scheduledBookings = sortByScheduledDateAsc(
    bookings.filter((b) => {
      const s = getEffectiveBookingStatus(b);
      return s === "scheduled" || s === "pending_approval";
    })
  );
  const pendingCount = scheduledBookings.filter((b) => getEffectiveBookingStatus(b) === "pending_approval").length;
  // Auto-evidence: the next upcoming booking opens by default
  const autoExpandedId = scheduledBookings[0]?.id ?? null;
  const effectiveExpanded = expandedBooking ?? autoExpandedId;

  return (
    <AppLayout role="liberty">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
        <motion.div variants={fadeUpItem} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Minha Agenda</h1>
            <p className="text-muted-foreground text-sm mt-1">Próximas sessões de mentoria</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/agenda/overview"
              className="btn-silver text-sm px-4 py-2 flex items-center gap-2"
            >
              <Calendar className="h-4 w-4" /> Agendar sessão
            </Link>
          </div>

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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 text-status-blue" />
              <span>{scheduledBookings.length - pendingCount} confirmada{scheduledBookings.length - pendingCount !== 1 ? "s" : ""}</span>
            </div>
            {pendingCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-status-yellow">
                <Clock className="h-3.5 w-3.5" />
                <span>{pendingCount} aguardando aprovação</span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Sessions list */}
        <motion.div variants={fadeUpItem} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isLoading ? (
            <div className="glass-card p-8 text-center">
              <p className="text-sm text-muted-foreground">Carregando...</p>
            </div>
          ) : scheduledBookings.length === 0 ? (
            <div className="md:col-span-2">
              <EmptyState
                icon={Calendar}
                title="Nenhuma sessão futura neste mês"
                description="Agende uma nova sessão para continuar avançando na jornada."
                action={
                  <Link to="/agenda/overview" className="btn-silver text-sm px-4 py-2 inline-flex items-center gap-2">
                    <Calendar className="h-4 w-4" /> Agendar sessão
                  </Link>
                }
              />
            </div>
          ) : (
            scheduledBookings.map((booking) => {
              const effectiveStatus = getEffectiveBookingStatus(booking);
              
              const bTasks = allTasks.filter((t) => t.booking_id === booking.id);
              const completedTaskCount = bTasks.filter((t) => t.is_completed).length;
              const isExpanded = effectiveExpanded === booking.id;
              const coverUrl = sessionCoverMap[booking.session_id];

              return (
                <div key={booking.id} className="dark glass-card overflow-hidden bg-card text-card-foreground">
                  {coverUrl && (
                    <div
                      className="relative h-24 w-full cursor-pointer overflow-hidden"
                      onClick={() => setExpandedBooking(isExpanded ? null : booking.id)}
                    >
                      <img src={coverUrl} alt={sessionMap[booking.session_id] || "Sessão"} className="w-full h-full object-cover" />
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
                    onClick={() => setExpandedBooking(isExpanded ? null : booking.id)}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-muted flex flex-col items-center justify-center">
                        <span className="text-xs text-muted-foreground leading-none">
                          {format(parseISO(booking.scheduled_date), "MMM", { locale: ptBR })}
                        </span>
                        <span className="text-lg font-semibold text-foreground leading-tight">
                          {format(parseISO(booking.scheduled_date), "dd")}
                        </span>
                      </div>
                      <div className="min-w-0">
                        {!coverUrl && (
                          <p className="text-sm font-medium text-foreground truncate">
                            {sessionMap[booking.session_id] || "Sessão"}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground truncate">
                          com {shortName(mentorMap[booking.mentor_id] || "Mentor")}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {booking.start_time.slice(0, 5)} – {booking.end_time.slice(0, 5)}
                          </span>
                          {!coverUrl && <StatusBadge status={effectiveStatus} />}
                          {bTasks.length > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              {completedTaskCount}/{bTasks.length} tarefas
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {effectiveStatus === "scheduled" && booking.zoom_join_url && (
                        <a
                          href={booking.zoom_join_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="btn-silver text-xs px-3 py-1.5 flex items-center gap-1.5"
                        >
                          <ExternalLink className="h-3 w-3" /> Zoom
                        </a>
                      )}
                    </div>
                  </div>

                  {isExpanded && bTasks.length > 0 && (
                    <div className="px-4 pb-4 border-t border-border pt-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2"><Target className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />Tarefas</p>
                      <TaskChecklist
                        tasks={bTasks}
                        bookingId={booking.id}
                        role="liberty"
                        invalidateKeys={[["member-agenda-tasks", bookingIds]]}
                      />
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

export default MemberAgendaPage;
