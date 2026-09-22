import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  CalendarCheck,
  CalendarClock,
  Star,
  Info,
  Filter,
} from "lucide-react";
import {
  addDays,
  endOfMonth,
  format,
  getDay,
  isAfter,
  isBefore,
  isSameDay,
  isToday,
  parseISO,
  startOfMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { useDemoData } from "@/contexts/DemoDataContext";
import { getEffectiveBookingStatus, isVisibleSessionBooking } from "@/lib/bookingStatus";
import { StatusBadge } from "@/components/StatusBadge";
import { buildSessionProgress, type SessionProgressStatus } from "@/lib/sessionProgress";
import { shortName } from "@/lib/formatName";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const pillarLabels: Record<string, string> = {
  negocios: "Negócios",
  emocional: "Emocional",
  mentalidade: "Mentalidade",
  espiritual: "Espiritual",
};

type SessionRow = {
  id: string;
  name: string;
  pillar: string | null;
  duration_minutes: number;
  cover_image_url: string | null;
  order: number;
};

type Slot = {
  date: Date;
  dateStr: string;
  startTime: string;
  endTime: string;
  sessionId: string;
  sessionName: string;
  pillar: string | null;
  cover: string | null;
};

type BookingRow = {
  id: string;
  session_id: string;
  mentor_id?: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: string;
  zoom_join_url?: string | null;
  approval_required?: boolean;
};

type MentorProfileRow = {
  id: string;
  full_name: string;
};

type AvailabilityRow = {
  id: string;
  mentor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  specific_date: string | null;
  is_recurring: boolean;
  is_booked: boolean;
};

const AgendaOverviewPage = () => {
  const { profile, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const { demoEnabled } = useDemoData();
  const previewMode = demoEnabled && isAdmin;
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [groupBy, setGroupBy] = useState<"session" | "day" | "time">("session");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const { data: sessions = [] } = useQuery<SessionRow[]>({
    queryKey: ["overview-sessions"],
    queryFn: async () => {
      // NOTE: PostgREST conflicts when filtering AND ordering by a column literally named "order".
      // We fetch all active sessions and filter (order > 0) client-side to avoid that collision.
      const { data } = await supabase
        .from("sessions")
        .select("id, name, pillar, duration_minutes, cover_image_url, \"order\"")
        .eq("is_active", true)
        .order("order");
      return ((data || []) as SessionRow[]).filter((s) => (s.order ?? 0) > 0);
    },
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["overview-bookings", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("bookings")
        .select("id, session_id, mentor_id, scheduled_date, start_time, end_time, status, zoom_join_url")
        .eq("liberty_id", profile.id);
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const mentorIds = useMemo(
    () => Array.from(new Set((bookings as BookingRow[]).map((b) => b.mentor_id).filter(Boolean) as string[])),
    [bookings]
  );

  const { data: mentorProfiles = [] } = useQuery<MentorProfileRow[]>({
    queryKey: ["overview-booking-mentors", mentorIds.join("|")],
    queryFn: async () => {
      if (!mentorIds.length) return [];
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", mentorIds);
      return data || [];
    },
    enabled: mentorIds.length > 0,
  });

  const { data: mentorSessions = [] } = useQuery({
    queryKey: ["overview-mentor-sessions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mentor_sessions")
        .select("mentor_id, session_id")
        .eq("is_active", true);
      return data || [];
    },
  });

  // Demo: simulate a full picture of the member experience — completed past sessions,
  // confirmed upcoming, same-day pending approval, plus a couple varied mentors.
  const DEMO_MENTORS: MentorProfileRow[] = useMemo(
    () => [
      { id: "demo-mentor-1", full_name: "Ricardo Almeida" },
      { id: "demo-mentor-2", full_name: "Patrícia Souza" },
    ],
    []
  );

  const demoBookings = useMemo(() => {
    if (!previewMode || !isAdmin) return [];
    const journey = sessions.filter((s) => (s.order ?? 0) > 0);
    if (journey.length === 0) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const out: BookingRow[] = [];

    // Cobre todas as possibilidades para o admin avaliar a UI:
    // — 4 concluídas no passado
    // — 1 aguardando confirmação HOJE (mesmo dia)
    // — 1 confirmada amanhã
    // — 2 confirmadas futuras (em 4 e 12 dias)
    const plan: Array<{
      idx: number;
      daysOffset: number;
      start: string;
      end: string;
      status: "completed" | "pending_approval" | "scheduled";
      mentor: 0 | 1;
    }> = [
      { idx: 0, daysOffset: -38, start: "10:00:00", end: "11:30:00", status: "completed", mentor: 0 },
      { idx: 1, daysOffset: -27, start: "14:00:00", end: "15:30:00", status: "completed", mentor: 1 },
      { idx: 2, daysOffset: -17, start: "09:00:00", end: "10:30:00", status: "completed", mentor: 0 },
      { idx: 3, daysOffset: -8,  start: "16:00:00", end: "17:30:00", status: "completed", mentor: 1 },
      { idx: 4, daysOffset: 0,   start: "19:00:00", end: "20:30:00", status: "pending_approval", mentor: 0 },
      { idx: 5, daysOffset: 1,   start: "11:00:00", end: "12:30:00", status: "scheduled", mentor: 1 },
      { idx: 6, daysOffset: 4,   start: "14:00:00", end: "15:30:00", status: "scheduled", mentor: 0 },
      { idx: 7, daysOffset: 12,  start: "09:00:00", end: "10:30:00", status: "scheduled", mentor: 1 },
    ];

    plan.forEach((p) => {
      const s = journey[p.idx];
      if (!s) return;
      out.push({
        id: `demo-bk-${p.idx}`,
        session_id: s.id,
        mentor_id: DEMO_MENTORS[p.mentor].id,
        scheduled_date: format(addDays(today, p.daysOffset), "yyyy-MM-dd"),
        start_time: p.start,
        end_time: p.end,
        status: p.status,
        approval_required: p.status === "pending_approval",
      });
    });

    return out;
  }, [previewMode, isAdmin, sessions, DEMO_MENTORS]);

  // When demo is ON we REPLACE real data so the admin sees a clean fictitious picture
  // (no clash between real and synthetic bookings).
  const effectiveBookings = useMemo(
    () => (previewMode ? demoBookings : bookings),
    [previewMode, bookings, demoBookings]
  );

  const progress = useMemo(
    () => buildSessionProgress(sessions, effectiveBookings),
    [sessions, effectiveBookings]
  );
  const { journeySessions, statusMap: sessionStatusMap, scheduledCount, availableCount } = progress;
  const sessionMap = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);
  const mentorMap = useMemo(() => {
    const m = new Map(mentorProfiles.map((p) => [p.id, p.full_name]));
    if (previewMode) DEMO_MENTORS.forEach((p) => m.set(p.id, p.full_name));
    return m;
  }, [mentorProfiles, previewMode, DEMO_MENTORS]);

  const upcomingBookings = useMemo(() => {
    const now = new Date();
    return effectiveBookings
      .filter(isVisibleSessionBooking)
      .filter((b: BookingRow) => {
        const status = getEffectiveBookingStatus(b);
        if (status !== "scheduled" && status !== "pending_approval") return false;
        const endAt = new Date(`${b.scheduled_date}T${(b.end_time || b.start_time || "23:59:59").slice(0, 8)}`);
        return Number.isNaN(endAt.getTime()) ? true : endAt >= now;
      })
      .sort((a: BookingRow, b: BookingRow) => {
        const aAt = new Date(`${a.scheduled_date}T${(a.start_time || "00:00:00").slice(0, 8)}`).getTime();
        const bAt = new Date(`${b.scheduled_date}T${(b.start_time || "00:00:00").slice(0, 8)}`).getTime();
        return aAt - bAt;
      });
  }, [effectiveBookings]);


  const getStatus = useCallback(
    (id: string): SessionProgressStatus => sessionStatusMap.get(id)?.status ?? "available",
    [sessionStatusMap]
  );

  const availableSessions = useMemo(
    () => journeySessions.filter((s) => getStatus(s.id) === "available"),
    [journeySessions, getStatus]
  );

  // Sessions the user already completed but can repeat
  const completedSessionIds = useMemo(
    () => new Set(journeySessions.filter((s) => getStatus(s.id) === "completed").map((s) => s.id)),
    [journeySessions, getStatus]
  );

  // Sessions surfaced in the slot list = available + completed (completed can be repeated)
  const bookableSessions = useMemo(
    () => [...availableSessions, ...journeySessions.filter((s) => completedSessionIds.has(s.id))],
    [availableSessions, journeySessions, completedSessionIds]
  );

  // Mentors that serve at least one currently-available session
  const relevantMentorIds = useMemo(() => {
    const avSet = new Set(availableSessions.map((s) => s.id));
    return Array.from(
      new Set(mentorSessions.filter((m) => avSet.has(m.session_id)).map((m) => m.mentor_id))
    );
  }, [mentorSessions, availableSessions]);

  // Real availability across all mentors that serve the user's available sessions
  const { data: realAvailability = [] } = useQuery<AvailabilityRow[]>({
    queryKey: ["overview-availability-all", relevantMentorIds.sort().join("|")],
    queryFn: async () => {
      if (relevantMentorIds.length === 0) return [];
      const { data } = await supabase
        .from("mentor_availability")
        .select("id, mentor_id, day_of_week, start_time, end_time, specific_date, is_recurring, is_booked")
        .eq("is_booked", false)
        .in("mentor_id", relevantMentorIds);
      return data || [];
    },
    enabled: relevantMentorIds.length > 0,
  });

  // Admin-only preview: synthesizes realistic, sparse availability in memory.
  // Each bookable session gets ~3 slots over the next ~2 weeks at varied times.
  // No Sunday restriction here — demo should let admin test all flows on any weekday.
  const availability = useMemo(() => {
    if (!previewMode || !isAdmin) return realAvailability;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const timeOptions: Array<[string, string]> = [
      ["09:00", "10:30"],
      ["11:00", "12:30"],
      ["14:00", "15:30"],
      ["16:30", "18:00"],
    ];
    const dayOffsets = [2, 4, 6, 7, 9, 11, 13, 14, 16, 18];
    const out: AvailabilityRow[] = [];
    bookableSessions.forEach((sess, sIdx) => {
      const slotCount = (sIdx % 2 === 0) ? 3 : 2;
      for (let k = 0; k < slotCount; k++) {
        const offset = dayOffsets[(sIdx * 3 + k * 2) % dayOffsets.length];
        const d = addDays(today, offset);
        const [st, et] = timeOptions[(sIdx + k) % timeOptions.length];
        out.push({
          id: `preview-${sess.id}-${k}`,
          mentor_id: `preview-mentor-${sess.id}`,
          day_of_week: getDay(d),
          start_time: st,
          end_time: et,
          specific_date: format(d, "yyyy-MM-dd"),
          is_recurring: false,
          is_booked: false,
        });
      }
    });
    // Same-day slots across the first 3 bookable sessions so admin can test
    // the "book for today / approval required" flow — works on any weekday.
    const sameDaySlots: Array<[string, string]> = [
      ["15:00", "16:30"],
      ["17:00", "18:30"],
      ["19:00", "20:30"],
    ];
    bookableSessions.slice(0, 3).forEach((sess, idx) => {
      const [st, et] = sameDaySlots[idx];
      out.push({
        id: `preview-today-${sess.id}-${idx}`,
        mentor_id: `preview-mentor-${sess.id}`,
        day_of_week: getDay(today),
        start_time: st,
        end_time: et,
        specific_date: format(today, "yyyy-MM-dd"),
        is_recurring: false,
        is_booked: false,
      });
    });
    return out;
  }, [previewMode, isAdmin, realAvailability, bookableSessions]);


  const mentorToSessions = useMemo(() => {
    const m = new Map<string, Set<string>>();
    if (previewMode && isAdmin) {
      bookableSessions.forEach((s) => m.set(`preview-mentor-${s.id}`, new Set([s.id])));
      return m;
    }
    mentorSessions.forEach((ms) => {
      if (!m.has(ms.mentor_id)) m.set(ms.mentor_id, new Set());
      m.get(ms.mentor_id)!.add(ms.session_id);
    });
    return m;
  }, [mentorSessions, previewMode, isAdmin, bookableSessions]);

  // Build one slot per real availability (date+time), assigning the student's NEXT pending session.
  // No session-multiplication: each real availability shows up once with the journey's next session.
  const allSlots = useMemo<Slot[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizonEnd = addDays(today, 60);
    if (bookableSessions.length === 0) return [];

    const grouped = new Map<string, Slot>();

    const pushSlot = (d: Date, st: string, et: string, sess: typeof bookableSessions[0]) => {
      const ds = format(d, "yyyy-MM-dd");
      const key = `${ds}|${st}|${sess.id}`;
      if (grouped.has(key)) return;
      grouped.set(key, {
        date: d,
        dateStr: ds,
        startTime: st,
        endTime: et,
        sessionId: sess.id,
        sessionName: sess.name,
        pillar: sess.pillar,
        cover: sess.cover_image_url,
      });
    };

    // Preview mode: each synthesized availability row maps 1:1 to a bookable session
    // via the convention `preview-mentor-${sessionId}`. Render slots for ALL bookable
    // sessions so the admin sees varied session names — not only the first one.
    if (previewMode && isAdmin) {
      const sessionById = new Map(bookableSessions.map((s) => [s.id, s]));
      availability.forEach((av) => {
        const sessId = av.mentor_id.replace(/^preview-mentor-/, "");
        const sess = sessionById.get(sessId);
        if (!sess) return;
        const st = av.start_time.slice(0, 5);
        const et = av.end_time.slice(0, 5);
        if (av.specific_date) {
          const d = new Date(av.specific_date + "T00:00:00");
          if (isBefore(d, today)) return;
          pushSlot(d, st, et, sess);
        }
      });
      return Array.from(grouped.values()).sort((a, b) =>
        a.dateStr === b.dateStr ? a.startTime.localeCompare(b.startTime) : a.dateStr.localeCompare(b.dateStr)
      );
    }

    // Real flow: each availability surfaces ALL sessions the mentor delivers
    // that are currently bookable by this member (available + repeatable).
    // The mentor's identity is intentionally hidden from the member.
    const bookableSet = new Set(bookableSessions.map((s) => s.id));
    if (bookableSet.size === 0) return [];

    availability.forEach((av) => {
      const mentorSess = mentorToSessions.get(av.mentor_id);
      if (!mentorSess) return;
      const matching = bookableSessions.filter((s) => mentorSess.has(s.id));
      if (matching.length === 0) return;
      const st = av.start_time.slice(0, 5);
      const et = av.end_time.slice(0, 5);

      if (av.specific_date) {
        const d = new Date(av.specific_date + "T00:00:00");
        if (isBefore(d, today)) return;
        matching.forEach((sess) => pushSlot(d, st, et, sess));
      } else if (av.is_recurring) {
        for (let i = 0; i < 60; i++) {
          const d = addDays(today, i);
          if (isAfter(d, horizonEnd)) break;
          if (getDay(d) === av.day_of_week && getDay(d) !== 0) {
            matching.forEach((sess) => pushSlot(d, st, et, sess));
          }
        }
      }
    });

    return Array.from(grouped.values()).sort((a, b) =>
      a.dateStr === b.dateStr ? a.startTime.localeCompare(b.startTime) : a.dateStr.localeCompare(b.dateStr)
    );
  }, [availability, mentorToSessions, bookableSessions, previewMode, isAdmin]);

  // Counts per day for calendar heat / dot
  const slotsByDate = useMemo(() => {
    const m: Record<string, Slot[]> = {};
    allSlots.forEach((s) => {
      m[s.dateStr] = m[s.dateStr] || [];
      m[s.dateStr].push(s);
    });
    return m;
  }, [allSlots]);

  // Filtered list shown on the side panel: a specific day or "all upcoming"
  const visibleSlots = useMemo(() => {
    if (!selectedDate) return allSlots;
    const ds = format(selectedDate, "yyyy-MM-dd");
    return allSlots.filter((s) => s.dateStr === ds);
  }, [allSlots, selectedDate]);

  // Calendar grid — always 42 cells for fixed height
  const calendarDays = useMemo(() => {
    const start = startOfMonth(calendarMonth);
    const end = endOfMonth(calendarMonth);
    const days: (Date | null)[] = [];
    const startDow = getDay(start);
    for (let i = 0; i < startDow; i++) days.push(null);
    let d = start;
    while (!isAfter(d, end)) {
      days.push(new Date(d));
      d = addDays(d, 1);
    }
    while (days.length < 42) days.push(null);
    return days;
  }, [calendarMonth]);

  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  // User's future scheduled days for calendar markers
  const bookedDateMap = useMemo(() => {
    const m: Record<string, "scheduled"> = {};
    effectiveBookings.filter(isVisibleSessionBooking).forEach((b) => {
      if (getEffectiveBookingStatus(b) === "scheduled") m[b.scheduled_date] = "scheduled";
    });
    return m;
  }, [effectiveBookings]);


  const totalUpcoming = allSlots.length;
  const daysWithSlots = Object.keys(slotsByDate).length;

  if (profile && profile.is_active === false) {
    return (
      <AppLayout role="liberty">
        <div className="max-w-xl mx-auto mt-16">
          <div className="glass-card p-8 text-center space-y-3">
            <h1 className="text-xl font-semibold text-foreground">Programa encerrado</h1>
            <p className="text-sm text-muted-foreground">
              Seu programa foi finalizado, então novas sessões não podem mais ser agendadas.
              Você continua com acesso aos seus materiais, relatórios e histórico da jornada.
            </p>
            <p className="text-xs text-muted-foreground">Quer voltar a agendar? Fale com nosso suporte.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout role="liberty">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-5">
        {/* Header */}
        <motion.div variants={fadeUpItem} className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Sua agenda</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Escolha um horário disponível e agende em um clique
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarCheck className="h-3.5 w-3.5 text-status-blue" />
              {scheduledCount} agendada{scheduledCount !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 text-primary" />
              {availableCount} sessão{availableCount !== 1 ? "s" : ""} a agendar
            </span>
          </div>
        </motion.div>

        {/* Admin preview hint — driven by the global "Dados fictícios" toggle in the sidebar */}
        {isAdmin && previewMode && (
          <motion.div
            variants={fadeUpItem}
            className="flex items-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-4 py-2.5 text-xs text-muted-foreground"
          >
            <Info className="h-3.5 w-3.5 text-primary" />
            <span>
              <strong className="text-foreground">Preview de dados fictícios ativo</strong>. Horários
              simulados em todas as sessões disponíveis. Desative em "Dados fictícios" na barra lateral.
            </span>
          </motion.div>
        )}

        {upcomingBookings.length > 0 && (
          <motion.div variants={fadeUpItem} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Sessões já agendadas</h2>
                <p className="text-xs text-muted-foreground">Próximos compromissos confirmados ou aguardando confirmação</p>
              </div>
              <span className="text-xs text-muted-foreground">{upcomingBookings.length} futura{upcomingBookings.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {upcomingBookings.map((booking) => {
                const session = sessionMap.get(booking.session_id);
                const status = getEffectiveBookingStatus(booking);
                const isPending = status === "pending_approval";
                return (
                  <div
                    key={booking.id}
                    className={`relative overflow-hidden rounded-lg border bg-card text-foreground shadow-sm ${
                      isPending ? "border-status-yellow/40" : "border-status-blue/40"
                    }`}
                  >
                    <div className={`absolute left-0 top-0 h-full w-1 z-10 ${isPending ? "bg-status-yellow" : "bg-status-blue"}`} />
                    {session?.cover_image_url ? (
                      <div className="relative h-20 w-full overflow-hidden bg-muted/30">
                        <img
                          src={session.cover_image_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
                        <div className="absolute top-2 right-2">
                          <StatusBadge status={status} />
                        </div>
                      </div>
                    ) : null}
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center shrink-0 ${isPending ? "bg-status-yellow/12" : "bg-status-blue/12"}`}>
                          <span className="text-[10px] uppercase leading-none text-muted-foreground">
                            {format(parseISO(booking.scheduled_date), "MMM", { locale: ptBR })}
                          </span>
                          <span className="text-lg font-semibold leading-tight text-foreground">
                            {format(parseISO(booking.scheduled_date), "dd")}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate text-foreground">{session?.name || "Sessão"}</p>
                          <p className="text-xs mt-1 truncate text-muted-foreground">
                            {booking.start_time.slice(0, 5)} – {booking.end_time.slice(0, 5)} · {shortName((mentorMap.get(booking.mentor_id) as string) || "Mentor")}
                          </p>
                          {!session?.cover_image_url && (
                            <div className="mt-2">
                              <StatusBadge status={status} />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Hero: Calendar + Available slots list */}
        <motion.div
          variants={fadeUpItem}
          className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] gap-5 items-start"
        >
          {/* Calendar */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() =>
                  setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))
                }
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground capitalize">
                  {format(calendarMonth, "MMMM yyyy", { locale: ptBR })}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {totalUpcoming} horário{totalUpcoming !== 1 ? "s" : ""} em {daysWithSlots} dia
                  {daysWithSlots !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={() =>
                  setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))
                }
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                aria-label="Próximo mês"
              >
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1.5 mb-1">
              {WEEKDAY_LABELS.map((w) => (
                <div key={w} className="text-[10px] text-muted-foreground text-center font-medium py-1">
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map((day, i) => {
                if (!day) return <div key={`e-${i}`} className="aspect-square" />;
                const ds = format(day, "yyyy-MM-dd");
                const count = slotsByDate[ds]?.length || 0;
                const isPast = isBefore(day, todayDate) && !isToday(day);
                const hasSlots = count > 0 && !isPast;
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const userBooking = bookedDateMap[ds];
                const intensity =
                  count >= 6
                    ? "bg-primary/30 hover:bg-primary/40 border-primary/40 text-foreground"
                    : count >= 3
                    ? "bg-primary/20 hover:bg-primary/30 border-primary/30 text-foreground"
                    : count > 0
                    ? "bg-primary/10 hover:bg-primary/20 border-primary/25 text-foreground"
                    : "";

                return (
                  <button
                    key={day.toISOString()}
                    disabled={!hasSlots}
                    onClick={() => setSelectedDate(isSelected ? null : day)}
                    className={`aspect-square rounded-lg text-xs font-medium relative flex flex-col items-center justify-center transition-all border ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary ring-2 ring-primary/40"
                        : userBooking === "scheduled"
                        ? "bg-status-blue/15 text-status-blue border-status-blue/25 cursor-default"
                        : hasSlots
                        ? `${intensity} cursor-pointer`
                        : "text-muted-foreground/35 border-transparent cursor-not-allowed"
                    }`}
                  >
                    <span>{day.getDate()}</span>
                    {hasSlots && !isSelected && (
                      <span className="text-[9px] mt-0.5 tabular-nums opacity-80">{count}</span>
                    )}
                    {userBooking && !isSelected && !hasSlots && (
                      <CalendarClock className="h-2.5 w-2.5 mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-primary/30 border border-primary/40" /> Muitos
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-primary/10 border border-primary/25" /> Poucos
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarClock className="h-3 w-3 text-status-blue" /> Já agendada
              </span>
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate(null)}
                  className="ml-auto text-[11px] text-primary hover:underline"
                >
                  Ver todos os dias
                </button>
              )}
            </div>
          </div>

          {/* Available slots list */}
          <div className="glass-card p-5 flex flex-col lg:max-h-[640px]">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-border">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-primary" />
                  {selectedDate ? "Horários do dia" : "Próximos horários"}
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">
                  {selectedDate
                    ? format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })
                    : `${visibleSlots.length} disponíve${visibleSlots.length !== 1 ? "is" : "l"}`}
                </p>
              </div>
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate(null)}
                  className="text-[11px] text-primary flex items-center gap-1 hover:underline"
                >
                  <Filter className="h-3 w-3" /> Limpar
                </button>
              )}
            </div>

            {availableSessions.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
                <CalendarCheck className="h-8 w-8 text-status-green/60 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">Tudo agendado!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Você não tem sessões pendentes da jornada.
                </p>
              </div>
            ) : visibleSlots.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
                <CalendarClock className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">
                  {selectedDate ? "Sem horários neste dia" : "Sem horários disponíveis"}
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
                  {selectedDate
                    ? "Escolha outro dia destacado no calendário."
                    : "Os mentores ainda não publicaram horários. Tente novamente em breve."}
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Toggle: agrupar por sessão / dia / horário */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {[
                    { key: "session", label: "Por sessão" },
                    // Oculta "Por dia" quando o usuário já filtrou por um dia específico no calendário
                    ...(selectedDate ? [] : [{ key: "day", label: "Por dia" }]),
                    { key: "time", label: "Por horário" },
                  ].map((g) => (
                    <button
                      key={g.key}
                      onClick={() => { setGroupBy(g.key as any); setExpandedGroup(null); }}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                        groupBy === g.key ? "bg-primary/10 text-primary border-primary/30" : "bg-card text-muted-foreground border-border hover:border-primary/25"
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto -mr-2 pr-2 space-y-1.5">
                  {(() => {
                    // Agrupa conforme seleção
                    const grouped = new Map<string, { label: string; sublabel: string; cover: string | null; pillar: string | null; slots: Slot[]; sortKey: string }>();
                    visibleSlots.forEach((s) => {
                      let key: string;
                      let label: string;
                      let sublabel: string;
                      let sortKey: string;
                      if (groupBy === "session") {
                        key = s.sessionId;
                        label = s.sessionName;
                        sublabel = s.pillar ? (pillarLabels[s.pillar] || s.pillar) : "";
                        sortKey = s.sessionName.toLowerCase();
                      } else if (groupBy === "day") {
                        key = s.dateStr;
                        label = isToday(s.date)
                          ? "Hoje"
                          : isSameDay(s.date, addDays(todayDate, 1))
                          ? "Amanhã"
                          : format(s.date, "EEEE, dd 'de' MMM", { locale: ptBR });
                        sublabel = "";
                        sortKey = s.dateStr;
                      } else {
                        key = s.startTime;
                        label = `${s.startTime}`;
                        sublabel = "";
                        sortKey = s.startTime;
                      }
                      if (!grouped.has(key)) {
                        grouped.set(key, { label, sublabel, cover: s.cover, pillar: s.pillar, slots: [], sortKey });
                      }
                      grouped.get(key)!.slots.push(s);
                    });

                    const entries = Array.from(grouped.entries()).sort((a, b) => a[1].sortKey.localeCompare(b[1].sortKey));

                    return entries.map(([key, group]) => {
                      const isOpen = expandedGroup === key;
                      const hasToday = group.slots.some((s) => isToday(s.date));
                      return (
                        <div key={key} className="rounded-md border border-border bg-card overflow-hidden">
                          <button
                            onClick={() => setExpandedGroup(isOpen ? null : key)}
                            className="w-full flex items-center gap-2.5 px-2 py-1.5 hover:bg-muted/40 transition-colors text-left"
                          >
                            {groupBy === "session" ? (
                              group.cover ? (
                                <img src={group.cover} alt="" className="w-8 h-8 object-contain rounded bg-muted/30 flex-shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded bg-primary/10 flex-shrink-0 flex items-center justify-center">
                                  <CalendarCheck className="h-3.5 w-3.5 text-primary/60" />
                                </div>
                              )
                            ) : (
                              <div className="w-8 h-8 rounded flex-shrink-0 flex items-center justify-center bg-primary/10">
                                <CalendarClock className="h-3.5 w-3.5 text-primary/70" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate leading-tight capitalize">{group.label}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {group.slots.length} {group.slots.length === 1 ? "horário" : "horários"}
                                {group.sublabel && <span> · {group.sublabel}</span>}
                              </p>
                            </div>
                            <ChevronDown
                              className={`h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 ${isOpen ? "rotate-180" : ""}`}
                            />
                          </button>

                          {isOpen && (
                            <div className="border-t border-border p-1.5 space-y-1 bg-background/40">
                              {group.slots
                                .slice()
                                .sort((a, b) =>
                                  groupBy === "time"
                                    ? a.dateStr.localeCompare(b.dateStr)
                                    : a.dateStr === b.dateStr
                                    ? a.startTime.localeCompare(b.startTime)
                                    : a.dateStr.localeCompare(b.dateStr)
                                )
                                .map((s, idx) => {
                                  const today = isToday(s.date);
                                  const dayLabel = today
                                    ? "Hoje"
                                    : isSameDay(s.date, addDays(todayDate, 1))
                                    ? "Amanhã"
                                    : format(s.date, "EEE, dd MMM", { locale: ptBR });
                                  return (
                                    <Link
                                      key={`${s.dateStr}-${s.startTime}-${s.sessionId}-${idx}`}
                                      to={`/agenda/agendar?sessionId=${s.sessionId}&date=${s.dateStr}&time=${s.startTime}`}
                                      className="group flex items-center gap-2 rounded border bg-card transition-all pl-2 pr-2 py-1.5 border-border hover:border-primary/50 hover:bg-primary/5"
                                    >
                                      <div className="flex-1 min-w-0">
                                        {groupBy !== "session" && (
                                          <p className="text-xs font-medium text-foreground truncate leading-tight">
                                            {s.sessionName}
                                          </p>
                                        )}
                                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                                          {groupBy !== "day" && (
                                            <span className={`font-semibold uppercase tracking-wider ${today ? "text-muted-foreground" : "text-primary"}`}>
                                              {dayLabel}
                                            </span>
                                          )}
                                          {groupBy === "day" && (
                                            <span className={`font-semibold uppercase tracking-wider text-primary`}>
                                              {s.startTime}
                                            </span>
                                          )}
                                          {today && (
                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground border border-border">
                                              requer aprovação
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex flex-col items-end flex-shrink-0">
                                        <span className="text-xs font-bold text-foreground tabular-nums leading-tight">
                                          {s.startTime}
                                        </span>
                                        <span className="text-[9px] text-muted-foreground tabular-nums">até {s.endTime}</span>
                                      </div>
                                    </Link>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

          </div>
        </motion.div>
      </motion.div>
    </AppLayout>
  );
};

export default AgendaOverviewPage;
