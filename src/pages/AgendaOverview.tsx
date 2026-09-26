import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CalendarCheck,
  CalendarClock,
  Star,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Callout,
  Chip,
  DateBlock,
  EmptyState,
  IconButton,
  ListRow,
  LoadingState,
  PageContainer,
  PageHeader,
  SectionCard,
  SectionHeader,
  StatusPill,
} from "@/components/ds";
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
import { useDemoData } from "@/contexts/DemoDataContext";
import {
  bookingStatusConfig,
  getEffectiveBookingStatus,
  isVisibleSessionBooking,
  parsePlatformDateTime,
  PENDING_CONFIRMATION_HINT,
} from "@/lib/bookingStatus";
import {
  buildSessionProgress,
  canScheduleKickoff,
  KICKOFF_NOT_ALLOWED_MESSAGE,
  type SessionProgressStatus,
} from "@/lib/sessionProgress";
import { shortName } from "@/lib/formatName";
import { fetchMentorNames } from "@/lib/mentorNames";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const DEFAULT_SESSION_MINUTES = 90;

/** Fim do horário a partir da duração da sessão (Mapeamento = 3h; padrão 1h30). */
const computeEndTime = (startTime: string, durationMinutes?: number | null) => {
  const [h, m] = startTime.split(":").map(Number);
  const duration = durationMinutes && durationMinutes > 0 ? durationMinutes : DEFAULT_SESSION_MINUTES;
  const total = Math.min(h * 60 + m + duration, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

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
  is_kickoff?: boolean | null;
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
  is_retroactive?: boolean | null;
  report_required?: boolean | null;
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

  const { data: sessions = [], isLoading: sessionsLoading, isError: sessionsError, refetch: refetchSessions } = useQuery<SessionRow[]>({
    queryKey: ["overview-sessions"],
    queryFn: async () => {
      // NOTE: PostgREST conflicts when filtering AND ordering by a column literally named "order".
      // We fetch all active sessions and filter (order > 0) client-side to avoid that collision.
      const { data, error } = await supabase
        .from("sessions")
        .select("id, name, pillar, duration_minutes, cover_image_url, \"order\", is_kickoff")
        .eq("is_active", true)
        .order("order");
      if (error) throw error;
      return ((data || []) as SessionRow[]).filter((s) => (s.order ?? 0) > 0);
    },
  });

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery<BookingRow[]>({
    queryKey: ["overview-bookings", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("bookings")
        .select("id, session_id, mentor_id, scheduled_date, start_time, end_time, status, zoom_join_url, is_retroactive, report_required")
        .eq("liberty_id", profile.id);
      if (error) throw error;
      return (data || []) as BookingRow[];
    },
    enabled: !!profile?.id,
  });

  const mentorIds = useMemo(
    () => Array.from(new Set(bookings.map((b) => b.mentor_id).filter((id): id is string => !!id))),
    [bookings]
  );

  const { data: mentorProfiles = [] } = useQuery<MentorProfileRow[]>({
    queryKey: ["overview-booking-mentors", mentorIds.join("|")],
    queryFn: async () => {
      return fetchMentorNames(mentorIds);
    },
    enabled: mentorIds.length > 0,
  });

  const { data: mentorSessions = [] } = useQuery({
    queryKey: ["overview-mentor-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mentor_sessions")
        .select("mentor_id, session_id")
        .eq("is_active", true);
      if (error) throw error;
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
  const effectiveBookings = useMemo<BookingRow[]>(
    () => (previewMode ? demoBookings : bookings),
    [previewMode, bookings, demoBookings]
  );

  const progress = useMemo(
    () => buildSessionProgress(sessions, effectiveBookings),
    [sessions, effectiveBookings]
  );
  const { journeySessions, statusMap: sessionStatusMap, scheduledCount, availableCount } = progress;

  // Sessões que passaram do horário e o mentor ainda não confirmou (ocupam a vaga, não contam como realizadas).
  const pendingConfirmationCount = useMemo(
    () => effectiveBookings.filter((b) => getEffectiveBookingStatus(b) === "pending_confirmation").length,
    [effectiveBookings]
  );

  // Regra do Mapeamento do Negócio: só pode ser agendado até a 3ª sessão realizada.
  const kickoffAllowed = useMemo(() => canScheduleKickoff(sessions, effectiveBookings), [sessions, effectiveBookings]);
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
      .filter((b) => {
        const status = getEffectiveBookingStatus(b);
        if (status !== "scheduled" && status !== "pending_approval") return false;
        // Horário da plataforma (America/Sao_Paulo), independente do fuso do navegador.
        const endAt = parsePlatformDateTime(b.scheduled_date, b.end_time || b.start_time || "23:59:59");
        return endAt ? endAt >= now : true;
      })
      .sort((a, b) => {
        const aAt = parsePlatformDateTime(a.scheduled_date, a.start_time || "00:00:00")?.getTime() ?? 0;
        const bAt = parsePlatformDateTime(b.scheduled_date, b.start_time || "00:00:00")?.getTime() ?? 0;
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

  // Mapeamento do Negócio bloqueado pela regra da 3ª sessão (D2): sai da lista de agendáveis.
  const kickoffBlocked = useMemo(
    () => !kickoffAllowed && availableSessions.some((s) => s.is_kickoff),
    [kickoffAllowed, availableSessions]
  );

  // Sessions surfaced in the slot list = available + completed (completed can be repeated)
  const bookableSessions = useMemo(
    () =>
      [...availableSessions, ...journeySessions.filter((s) => completedSessionIds.has(s.id))].filter(
        (s) => kickoffAllowed || !s.is_kickoff
      ),
    [availableSessions, journeySessions, completedSessionIds, kickoffAllowed]
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

    const pushSlot = (d: Date, st: string, _et: string, sess: typeof bookableSessions[0]) => {
      const ds = format(d, "yyyy-MM-dd");
      const key = `${ds}|${st}|${sess.id}`;
      if (grouped.has(key)) return;
      grouped.set(key, {
        date: d,
        dateStr: ds,
        startTime: st,
        // O fim é dado pela duração da sessão (Mapeamento = 3h), não pelo bloco de disponibilidade.
        endTime: computeEndTime(st, sess.duration_minutes),
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
    if (!selectedDate) return allSlots.slice(0, 6);
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
    const m: Record<string, "scheduled" | "pending_confirmation"> = {};
    effectiveBookings.filter(isVisibleSessionBooking).forEach((b) => {
      const st = getEffectiveBookingStatus(b);
      if (st === "scheduled" || st === "pending_confirmation") m[b.scheduled_date] = st;
    });
    return m;
  }, [effectiveBookings]);


  const totalUpcoming = allSlots.length;
  const daysWithSlots = Object.keys(slotsByDate).length;

  const isLoading = sessionsLoading || bookingsLoading;

  if (profile && profile.is_active === false) {
    return (
      <AppLayout role="liberty">
        <PageContainer variant="narrow">
          <PageHeader title="Programa encerrado" back="/jornada" />
          <Callout tone="info" icon={Info} className="mt-6">
            <p>
              Seu programa foi finalizado, então novas sessões não podem mais ser agendadas.
              Você continua com acesso aos seus materiais, relatórios e histórico da jornada.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Quer voltar a agendar? Fale com nosso suporte.</p>
          </Callout>
        </PageContainer>
      </AppLayout>
    );
  }

  return (
    <AppLayout role="liberty">
      <PageContainer variant="wide">
      <div className="space-y-5">
        {/* Cabeçalho */}
        <div>
          <PageHeader
            title="Sua agenda"
            description="Escolha um horário disponível e agende em um clique."
            actions={
              <div className="flex flex-wrap items-center gap-2 justify-end">
                <StatusPill tone="info">
                  {scheduledCount} agendada{scheduledCount !== 1 ? "s" : ""}
                </StatusPill>
                {pendingConfirmationCount > 0 && (
                  <span title={PENDING_CONFIRMATION_HINT} className="inline-flex">
                    <StatusPill tone="pending">{pendingConfirmationCount} a confirmar</StatusPill>
                  </span>
                )}
                <StatusPill tone="neutral">
                  {availableCount} sessão{availableCount !== 1 ? "s" : ""} a agendar
                </StatusPill>
              </div>
            }
          />
        </div>

        {sessionsError && (
          <div>
            <Callout
              tone="danger"
              icon={Info}
              title="Não foi possível carregar as sessões"
              action={<Button variant="outline" size="sm" onClick={() => void refetchSessions()}>Tentar novamente</Button>}
            >
              Verifique sua conexão e tente novamente.
            </Callout>
          </div>
        )}

        {kickoffBlocked && (
          <div>
            <Callout tone="warning" icon={Info}>
              {KICKOFF_NOT_ALLOWED_MESSAGE} Ele não aparece mais entre os horários disponíveis.
            </Callout>
          </div>
        )}

        {/* Aviso de preview do admin (controlado pelo toggle global "Dados fictícios") */}
        {isAdmin && previewMode && (
          <div>
            <Callout tone="info" icon={Info} title="Preview de dados fictícios ativo">
              Horários simulados em todas as sessões disponíveis. Desative em "Dados fictícios" na barra lateral.
            </Callout>
          </div>
        )}

        {isLoading && (
          <div>
            <LoadingState variant="page" />
          </div>
        )}

        {!isLoading && upcomingBookings.length > 0 && (
          <section className="space-y-3" aria-labelledby="upcoming-title">
            <SectionHeader
              title={<span id="upcoming-title">Sessões já agendadas</span>}
              description="Próximos compromissos confirmados ou aguardando confirmação."
              actions={
                <StatusPill tone="neutral" withDot={false}>
                  {upcomingBookings.length} futura{upcomingBookings.length !== 1 ? "s" : ""}
                </StatusPill>
              }
            />
            <SectionCard padding="none">
              {upcomingBookings.map((booking, i) => {
                const session = sessionMap.get(booking.session_id);
                const status = getEffectiveBookingStatus(booking);
                return (
                  <ListRow
                    key={booking.id}
                    href="/agenda"
                    leading={<DateBlock date={booking.scheduled_date} />}
                    title={session?.name || "Sessão"}
                    subtitle={`${booking.start_time.slice(0, 5)} às ${booking.end_time.slice(0, 5)} · ${shortName(mentorMap.get(booking.mentor_id ?? "") || "Mentor")}`}
                    trailing={<StatusPill status={status} size="sm" />}
                    last={i === upcomingBookings.length - 1}
                  />
                );
              })}
            </SectionCard>
          </section>
        )}

        {/* Calendário + lista de horários */}
        {!isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] gap-5 items-start">
          {/* Calendário */}
          <SectionCard padding="compact">
            <div className="flex items-center justify-between mb-3">
              <IconButton
                aria-label="Mês anterior"
                onClick={() =>
                  setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </IconButton>
              <div className="text-center" aria-live="polite">
                <p className="text-sm font-semibold text-foreground first-letter:uppercase">
                  {format(calendarMonth, "MMMM yyyy", { locale: ptBR })}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                  {totalUpcoming} horário{totalUpcoming !== 1 ? "s" : ""} em {daysWithSlots} dia
                  {daysWithSlots !== 1 ? "s" : ""}
                </p>
              </div>
              <IconButton
                aria-label="Próximo mês"
                onClick={() =>
                  setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))
                }
              >
                <ChevronRight className="h-4 w-4" />
              </IconButton>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1" aria-hidden>
              {WEEKDAY_LABELS.map((w) => (
                <div key={w} className="text-xs text-muted-foreground text-center font-medium py-1">
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Dias do mês">
              {calendarDays.map((day, i) => {
                if (!day) return <div key={`e-${i}`} className="aspect-square" />;
                const ds = format(day, "yyyy-MM-dd");
                const count = slotsByDate[ds]?.length || 0;
                const isPast = isBefore(day, todayDate) && !isToday(day);
                const hasSlots = count > 0 && !isPast;
                const isSelected = Boolean(selectedDate && isSameDay(day, selectedDate));
                const userBooking = bookedDateMap[ds];
                const dayLabel = format(day, "EEEE, dd 'de' MMMM", { locale: ptBR });
                const ariaLabel = userBooking === "scheduled"
                  ? `${dayLabel}, sessão agendada`
                  : userBooking === "pending_confirmation"
                  ? `${dayLabel}, sessão a confirmar`
                  : hasSlots
                  ? `${dayLabel}, ${count} horário${count !== 1 ? "s" : ""}`
                  : `${dayLabel}, sem horários`;

                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    disabled={!hasSlots}
                    aria-pressed={isSelected}
                    aria-label={ariaLabel}
                    onClick={() => setSelectedDate(isSelected ? null : day)}
                    className={cn(
                      "aspect-square min-h-[44px] rounded-ds text-sm font-medium relative flex flex-col items-center justify-center transition-colors duration-ds-1 ease-ds",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : userBooking
                        ? "text-foreground cursor-default"
                        : hasSlots
                        ? "bg-muted text-foreground hover:bg-accent"
                        : "text-muted-foreground/40 cursor-not-allowed",
                    )}
                  >
                    <span>{day.getDate()}</span>
                    {hasSlots && !isSelected && (
                      <span className="text-[11px] leading-none mt-0.5 tabular-nums text-muted-foreground" aria-hidden>{count}</span>
                    )}
                    {userBooking && !isSelected && !hasSlots && (
                      <span
                        aria-hidden
                        className={cn("mt-1 h-1.5 w-1.5 rounded-full", userBooking === "scheduled" ? "bg-status-blue" : "bg-status-orange")}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="w-2.5 h-2.5 rounded-sm bg-muted" /> Com horários
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="w-2 h-2 rounded-full bg-status-blue" /> {bookingStatusConfig.scheduled.label}
              </span>
              {pendingConfirmationCount > 0 && (
                <span className="flex items-center gap-1.5" title={PENDING_CONFIRMATION_HINT}>
                  <span aria-hidden className="w-2 h-2 rounded-full bg-status-orange" /> {bookingStatusConfig.pending_confirmation.label}
                </span>
              )}
              {selectedDate && (
                <Button variant="link" size="sm" className="ml-auto h-auto p-0" onClick={() => setSelectedDate(null)}>
                  Ver os próximos
                </Button>
              )}
            </div>
          </SectionCard>

          {/* Horários disponíveis */}
          <SectionCard padding="compact" className="flex flex-col lg:max-h-[640px]">
            <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-border">
              <SectionHeader
                as="h2"
                title={
                  <span className="inline-flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden />
                    {selectedDate ? "Horários do dia" : "Próximos horários"}
                  </span>
                }
                description={
                  <span className="first-letter:uppercase inline-block">
                    {selectedDate
                      ? format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })
                      : "Toque num dia do calendário. Aqui ficam só os próximos horários."}
                  </span>
                }
                className="min-w-0"
              />
              {selectedDate && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedDate(null)}>
                  Limpar
                </Button>
              )}
            </div>

            {availableSessions.length === 0 ? (
              <EmptyState
                compact
                icon={CalendarCheck}
                title="Tudo agendado"
                description="Você não tem sessões pendentes da jornada."
              />
            ) : visibleSlots.length === 0 ? (
              <EmptyState
                compact
                icon={CalendarClock}
                title={selectedDate ? "Sem horários neste dia" : "Sem horários disponíveis"}
                description={
                  selectedDate
                    ? "Escolha outro dia destacado no calendário."
                    : "Os mentores ainda não publicaram horários. Tente novamente em breve."
                }
                action={
                  selectedDate ? (
                    <Button variant="outline" size="sm" onClick={() => setSelectedDate(null)}>Ver todos os dias</Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Agrupar por sessão / dia / horário */}
                <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Agrupar horários">
                  {([
                    { key: "session", label: "Por sessão" },
                    // Oculta "Por dia" quando o usuário já filtrou por um dia específico no calendário
                    ...(selectedDate ? [] : [{ key: "day", label: "Por dia" }]),
                    { key: "time", label: "Por horário" },
                  ] as Array<{ key: "session" | "day" | "time"; label: string }>).map((g) => (
                    <Chip
                      key={g.key}
                      active={groupBy === g.key}
                      onClick={() => { setGroupBy(g.key); setExpandedGroup(null); }}
                    >
                      {g.label}
                    </Chip>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto -mr-2 pr-2 divide-y divide-border">
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
                      const groupId = `slot-group-${groupBy}-${key.replace(/[^a-zA-Z0-9_-]/g, "")}`;
                      return (
                        <div key={key}>
                          <button
                            type="button"
                            onClick={() => setExpandedGroup(isOpen ? null : key)}
                            aria-expanded={isOpen}
                            aria-controls={groupId}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 min-h-[56px] py-2 text-left transition-colors duration-ds-1 ease-ds hover:bg-accent",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                            )}
                          >
                            {groupBy === "session" ? (
                              group.cover ? (
                                <img src={group.cover} alt="" className="w-10 h-10 object-cover rounded-ds bg-muted flex-shrink-0" />
                              ) : (
                                <CalendarCheck className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />
                              )
                            ) : (
                              <CalendarClock className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-[15px] font-medium text-foreground truncate leading-tight first-letter:uppercase">{group.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                                {group.slots.length} {group.slots.length === 1 ? "horário" : "horários"}
                                {group.sublabel && <span> · {group.sublabel}</span>}
                              </p>
                            </div>
                            <ChevronDown
                              aria-hidden
                              className={cn("h-4 w-4 text-muted-foreground transition-transform duration-ds-1 ease-ds flex-shrink-0", isOpen && "rotate-180")}
                            />
                          </button>

                          {isOpen && (
                            <div id={groupId} className="border-t border-border bg-muted/30">
                              {group.slots
                                .slice()
                                .sort((a, b) =>
                                  groupBy === "time"
                                    ? a.dateStr.localeCompare(b.dateStr)
                                    : a.dateStr === b.dateStr
                                    ? a.startTime.localeCompare(b.startTime)
                                    : a.dateStr.localeCompare(b.dateStr)
                                )
                                .map((s, idx, arr) => {
                                  const today = isToday(s.date);
                                  const dayLabel = today
                                    ? "Hoje"
                                    : isSameDay(s.date, addDays(todayDate, 1))
                                    ? "Amanhã"
                                    : format(s.date, "EEE, dd MMM", { locale: ptBR });
                                  const title = groupBy === "session"
                                    ? <span className="first-letter:uppercase inline-block">{dayLabel}</span>
                                    : s.sessionName;
                                  const subtitle = groupBy === "session"
                                    ? undefined
                                    : groupBy === "day"
                                    ? undefined
                                    : <span className="first-letter:uppercase inline-block">{dayLabel}</span>;
                                  return (
                                    <ListRow
                                      key={`${s.dateStr}-${s.startTime}-${s.sessionId}-${idx}`}
                                      href={`/agenda/agendar?sessionId=${s.sessionId}&date=${s.dateStr}&time=${s.startTime}`}
                                      title={title}
                                      subtitle={subtitle}
                                      last={idx === arr.length - 1}
                                      trailing={
                                        <span className="flex items-center gap-2">
                                          {today && (
                                            <StatusPill tone="warning" size="sm" withDot={false}>Requer aprovação</StatusPill>
                                          )}
                                          <span className="flex flex-col items-end">
                                            <span className="text-sm font-semibold text-foreground tabular-nums leading-tight">{s.startTime}</span>
                                            <span className="text-xs text-muted-foreground tabular-nums">até {s.endTime}</span>
                                          </span>
                                        </span>
                                      }
                                    />
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

          </SectionCard>
        </div>
        )}
      </div>
      </PageContainer>
    </AppLayout>
  );
};

export default AgendaOverviewPage;
