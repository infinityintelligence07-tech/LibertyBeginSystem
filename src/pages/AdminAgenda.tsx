import { useState, useMemo, useEffect, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  AlertTriangle,
  Check,
  Search,
  RefreshCw,
  Ban,
  Video,
  Copy,
  Link as LinkIcon,
  Clock,
  Pencil,
  Trash2,
  CalendarDays,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import { shortName, matchesSearch } from "@/lib/formatName";
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO, getDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBookingsRealtime } from "@/hooks/useBookingsRealtime";
import { useSessionCatalog, ADMIN_BOOKING_QUERY_KEYS } from "@/hooks/useAdminData";
import { toast } from "sonner";
import { useDemoData } from "@/contexts/DemoDataContext";
import { demoBookingsForAdmin, demoLibertyProfiles, demoMentorProfiles, demoSessionsCatalog } from "@/lib/demoForUser";
import {
  getEffectiveBookingStatus,
  isVisibleSessionBooking,
  isPendingConfirmationOverdue,
  daysSinceBookingEnd,
  bookingStatusConfig,
  todayPlatformDate,
  PENDING_CONFIRMATION_HINT,
} from "@/lib/bookingStatus";
import { bookingRuleErrorMessage } from "@/lib/bookingRules";
import { whatsappHref, copyText, invokeProvisionMeeting } from "@/lib/meetingWhatsApp";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import {
  BottomSheet,
  Callout,
  Chip,
  ConfirmDialog,
  DateBlock,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  LoadingState,
  PageContainer,
  PageHeader,
  SectionCard,
  SectionHeader,
  SelectField,
  StatusPill,
  TextAreaField,
  TextField,
} from "@/components/ds";

/* ───── Types ───── */
/** Status bruto gravado no banco (enum `booking_status`). */
type RawBookingStatus = "scheduled" | "completed" | "rescheduled" | "cancelled" | "pending_approval" | "not_realized";
/** Status efetivo exibido na agenda (regra única de `bookingStatus.ts`). */
type SessionStatus = RawBookingStatus | "awaiting_report" | "pending_confirmation";
type ViewMode = "day" | "week" | "month";

const STATUS_FILTER_OPTIONS: SessionStatus[] = [
  "scheduled",
  "pending_confirmation",
  "pending_approval",
  "completed",
  "not_realized",
  "cancelled",
];

const isSessionStatus = (value: string | null): value is SessionStatus =>
  !!value && (STATUS_FILTER_OPTIONS as string[]).includes(value);

/** Converte o status efetivo no status bruto persistível (o banco não conhece awaiting_report/pending_confirmation). */
const toRawStatus = (status: SessionStatus): RawBookingStatus => {
  switch (status) {
    case "awaiting_report":
      return "completed";
    case "pending_confirmation":
    case "rescheduled":
      return "scheduled";
    case "scheduled":
    case "completed":
    case "cancelled":
    case "pending_approval":
    case "not_realized":
      return status;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
};

type BackendError = { message?: string | null; details?: string | null; code?: string | null } | null | undefined;

/** Traduz as exceções do banco (triggers) para mensagens amigáveis. */
const translateBookingError = (error: BackendError, fallback: string) => bookingRuleErrorMessage(error) ?? fallback;

/** Calcula o horário de término a partir da duração da sessão (Mapeamento = 3h; padrão 1h30). */
const computeEndTime = (startTime: string, durationMinutes?: number | null) => {
  const [h, m] = startTime.split(":").map(Number);
  const total = Math.min(h * 60 + m + (durationMinutes && durationMinutes > 0 ? durationMinutes : 90), 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const formatDuration = (durationMinutes?: number | null) => {
  const total = durationMinutes && durationMinutes > 0 ? durationMinutes : 90;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
};

interface MentorInfo {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  phone?: string | null;
}

interface BookingRow {
  id: string;
  mentor_id: string;
  liberty_id: string | null;
  guest_name: string | null;
  session_id: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  /** Status BRUTO do banco. Para exibir use `displayStatus(b)`. */
  status: RawBookingStatus;
  is_retroactive?: boolean | null;
  report_required?: boolean | null;
  zoom_join_url: string | null;
  zoom_link: string | null;
  meeting_wa_member_text?: string | null;
  meeting_wa_mentor_text?: string | null;
  meeting_provision_error?: string | null;
  meeting_provisioned_at?: string | null;
  meeting_provider?: string | null;
  observations: string | null;
  cancellation_reason: string | null;
  availability_id: string | null;
  liberty: {
    full_name: string;
    avatar_url?: string | null;
    member_tier?: "begin" | "liberty" | null;
    phone?: string | null;
  } | null;
  mentor?: { full_name: string; phone?: string | null } | null;
  sessions: { name: string; duration_minutes?: number | null; is_kickoff?: boolean | null } | null;
}

const BOOKING_SELECT =
  "*, liberty:profiles!bookings_liberty_id_fkey(full_name, avatar_url, member_tier, phone), mentor:profiles!bookings_mentor_id_fkey(full_name, phone), sessions(name, duration_minutes, is_kickoff)";

/** Fallback de mensagem WA quando meeting_wa_* ainda não foi gravado. */
const buildMeetingWaFallback = (
  booking: BookingRow,
  role: "member" | "mentor",
  mentorName: string,
): string => {
  const meetUrl = booking.zoom_join_url || booking.zoom_link || "";
  const memberName = booking.liberty?.full_name || booking.guest_name || "aluno";
  const sessionName = booking.sessions?.name || "Sessão";
  const when = `${format(new Date(booking.scheduled_date + "T12:00:00"), "dd/MM/yyyy")} · ${booking.start_time.substring(0, 5)}–${booking.end_time.substring(0, 5)}`;
  if (role === "member") {
    return [
      `Oi, ${memberName.split(" ")[0] || "tudo bem"}!`,
      ``,
      `Sua sessão *${sessionName}* com ${mentorName} está confirmada.`,
      `📅 ${when}`,
      ``,
      meetUrl ? `Link da reunião:\n${meetUrl}` : "O link da reunião será enviado em breve.",
      ``,
      `Qualquer imprevisto, avise a equipe Liberty.`,
    ].join("\n");
  }
  return [
    `Oi, ${mentorName.split(" ")[0] || "mentor"}!`,
    ``,
    `Sessão *${sessionName}* com ${memberName}.`,
    `📅 ${when}`,
    ``,
    meetUrl ? `Link da reunião:\n${meetUrl}` : "O link da reunião será enviado em breve.",
  ].join("\n");
};

const meetingOpenLabel = (url: string | null | undefined): string =>
  url?.includes("meet.google.com") ? "Abrir Meet" : "Abrir reunião";

/* ───── Constants ───── */
// 9 distinct hues, one per mentor (cycles only if >9 mentors)
// Superfície neutra; a identidade do mentor fica só no ponto e na borda esquerda do bloco.
const MENTOR_HEADER = "bg-card border-b border-border";
const mentorColors = [
  { header: MENTOR_HEADER, dot: "bg-status-blue", text: "text-muted-foreground", bg: "bg-card border-border border-l-2 border-l-status-blue" },
  { header: MENTOR_HEADER, dot: "bg-status-green", text: "text-muted-foreground", bg: "bg-card border-border border-l-2 border-l-status-green" },
  { header: MENTOR_HEADER, dot: "bg-status-yellow", text: "text-muted-foreground", bg: "bg-card border-border border-l-2 border-l-status-yellow" },
  { header: MENTOR_HEADER, dot: "bg-destructive", text: "text-muted-foreground", bg: "bg-card border-border border-l-2 border-l-destructive" },
  { header: MENTOR_HEADER, dot: "bg-primary", text: "text-muted-foreground", bg: "bg-card border-border border-l-2 border-l-primary" },
  { header: MENTOR_HEADER, dot: "bg-status-orange", text: "text-muted-foreground", bg: "bg-card border-border border-l-2 border-l-status-orange" },
  { header: MENTOR_HEADER, dot: "bg-silver-light", text: "text-muted-foreground", bg: "bg-card border-border border-l-2 border-l-silver-light" },
  { header: MENTOR_HEADER, dot: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-card border-border border-l-2 border-l-muted-foreground" },
  { header: MENTOR_HEADER, dot: "bg-accent-foreground", text: "text-muted-foreground", bg: "bg-card border-border border-l-2 border-l-accent-foreground" },
];

/** Rótulo único de status (mesmo texto/cor das outras telas). */
const statusLabel = (s: SessionStatus) => bookingStatusConfig[s]?.label ?? s;


const hours = Array.from({ length: 34 }, (_, i) => {
  const h = 7 + Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

/* ───── Component ───── */
const AdminAgendaPage = () => {
  const queryClient = useQueryClient();
  // Se o mentor aprovar/recusar primeiro, a pendência sai da tela do admin sozinha
  useBookingsRealtime(
    ["agenda-pending-approvals", "agenda-bookings", "agenda-not-realized", "agenda-pending-confirmation", "notifications-bell"],
    "admin-agenda",
  );
  const { demoEnabled } = useDemoData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedBooking, setSelectedBooking] = useState<BookingRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showMentorSwap, setShowMentorSwap] = useState(false);
  const [showDateChange, setShowDateChange] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showNotRealizedModal, setShowNotRealizedModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [notRealizedReason, setNotRealizedReason] = useState("");
  const [mentorFilter, setMentorFilter] = useState<string | null>(null);
  // Filtro inicial pode vir da URL (ex.: /admin/agenda?status=pending_confirmation, a partir do painel)
  const [statusFilter, setStatusFilter] = useState<SessionStatus | null>(() => {
    const fromUrl = searchParams.get("status");
    return isSessionStatus(fromUrl) ? fromUrl : null;
  });
  const [studentSearch, setStudentSearch] = useState("");
  const [editStatus, setEditStatus] = useState<RawBookingStatus>("scheduled");
  const [savingStatus, setSavingStatus] = useState(false);
  // Recusa de pedido de horário (substitui o prompt nativo)
  const [rejectTarget, setRejectTarget] = useState<BookingRow | null>(null);
  const [rejectReason, setRejectReason] = useState("Mentor indisponível");
  const [provisioningMeet, setProvisioningMeet] = useState(false);
  const [showReminders, setShowReminders] = useState(false);

  /** Invalida todas as leituras de bookings (agenda + painéis admin) após uma mutação. */
  const invalidateBookings = () => {
    ADMIN_BOOKING_QUERY_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    queryClient.invalidateQueries({ queryKey: ["notifications-bell"] });
  };

  // Manual booking form
  const [manualLiberty, setManualLiberty] = useState("");
  const [manualGuestName, setManualGuestName] = useState("");
  const [manualIsGuest, setManualIsGuest] = useState(false);
  const [manualSession, setManualSession] = useState("");
  const [manualMentor, setManualMentor] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [manualTime, setManualTime] = useState("09:00");
  const [manualNotes, setManualNotes] = useState("");
  const [libertySearch, setLibertySearch] = useState("");
  const [submittingBook, setSubmittingBook] = useState(false);
  const [manualStatus, setManualStatus] = useState<"scheduled" | "completed">("scheduled");
  const [manualConflict, setManualConflict] = useState<string | null>(null);

  // Date change form
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("09:00");

  // Inline availability editing (directly on the calendar)
  type SlotRef = { id: string; mentor_id: string; date: string; start_time: string; end_time: string; is_recurring: boolean };
  const [slotEdit, setSlotEdit] = useState<SlotRef | null>(null);
  const [slotEditDate, setSlotEditDate] = useState("");
  const [slotEditStart, setSlotEditStart] = useState("07:00");
  const [slotEditEnd, setSlotEditEnd] = useState("09:00");
  const [slotDelete, setSlotDelete] = useState<SlotRef | null>(null);
  const [draggingSlot, setDraggingSlot] = useState<SlotRef | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [slotAddDate, setSlotAddDate] = useState<string | null>(null);
  const [slotAddMentor, setSlotAddMentor] = useState("");
  const [slotAddStart, setSlotAddStart] = useState("07:00");


  const dateStr = format(currentDate, "yyyy-MM-dd");

  // Date range based on view mode
  const dateRange = useMemo(() => {
    if (viewMode === "day") return { start: dateStr, end: dateStr };
    if (viewMode === "week") {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
      const we = endOfWeek(currentDate, { weekStartsOn: 1 });
      return { start: format(ws, "yyyy-MM-dd"), end: format(we, "yyyy-MM-dd") };
    }
    // O grid mensal exibe dias do mês anterior/seguinte, então buscamos o intervalo completo do calendário.
    const calStart = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const calEnd = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    return { start: format(calStart, "yyyy-MM-dd"), end: format(calEnd, "yyyy-MM-dd") };
  }, [currentDate, viewMode, dateStr]);

  const navigatePrev = () => {
    if (viewMode === "day") setCurrentDate(addDays(currentDate, -1));
    else if (viewMode === "week") setCurrentDate(addDays(currentDate, -7));
    else setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const navigateNext = () => {
    if (viewMode === "day") setCurrentDate(addDays(currentDate, 1));
    else if (viewMode === "week") setCurrentDate(addDays(currentDate, 7));
    else setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  // Fetch all mentors (via user_roles, NOT by email domain)
  const { data: _allMentors = [] } = useQuery({
    queryKey: ["agenda-mentors"],
    queryFn: async () => {
      const { data: roleRows, error: roleErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "mentor");
      if (roleErr) throw roleErr;
      const mentorUserIds = (roleRows ?? []).map((r) => r.user_id).filter(Boolean);
      if (mentorUserIds.length === 0) return [] as MentorInfo[];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, phone")
        .in("user_id", mentorUserIds)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as MentorInfo[];
    },
  });
  const allMentors = useMemo(
    () => (demoEnabled ? [..._allMentors, ...demoMentorProfiles] : _allMentors),
    [_allMentors, demoEnabled]
  );

  // Fetch bookings for date range
  const {
    data: _bookings = [],
    isLoading: bookingsLoading,
    isError: bookingsError,
    refetch: refetchBookings,
  } = useQuery({
    queryKey: ["agenda-bookings", dateRange.start, dateRange.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(BOOKING_SELECT)
        .gte("scheduled_date", dateRange.start)
        .lte("scheduled_date", dateRange.end)
        .order("scheduled_date", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as BookingRow[];
    },
  });

  // Pending-approval bookings (any date) — admin must approve or reject
  const { data: pendingBookings = [] } = useQuery({
    queryKey: ["agenda-pending-approvals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(BOOKING_SELECT)
        .eq("status", "pending_approval")
        .order("scheduled_date", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as BookingRow[];
    },
  });

  // Todas as pendências são de sessões com menos de 48h — admin aprova ou recusa.
  // Pedidos com 48h+ já entram como "scheduled" direto no agendamento.

  // Sessions marked by mentors as not realized — admin must review and decide what to do.
  const { data: notRealizedBookings = [] } = useQuery({
    queryKey: ["agenda-not-realized"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(BOOKING_SELECT)
        .eq("status", "not_realized")
        .order("scheduled_date", { ascending: false })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as BookingRow[];
    },
  });

  // Sessões "A confirmar": passaram do horário e o mentor não fechou (qualquer data).
  const { data: pendingConfirmationBookings = [] } = useQuery({
    queryKey: ["agenda-pending-confirmation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(BOOKING_SELECT)
        .in("status", ["scheduled", "rescheduled"])
        .lte("scheduled_date", todayPlatformDate())
        .order("scheduled_date", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return ((data || []) as unknown as BookingRow[]).filter(
        (b) => getEffectiveBookingStatus(b) === "pending_confirmation",
      );
    },
  });

  // Relatórios salvos para os bookings visíveis: distingue "Realizada" de "Realizada · sem relatório".
  const visibleBookingIds = useMemo(() => {
    const ids = new Set<string>();
    [..._bookings, ...pendingBookings, ...notRealizedBookings, ...pendingConfirmationBookings].forEach((b) => ids.add(b.id));
    if (selectedBooking) ids.add(selectedBooking.id);
    return Array.from(ids).sort();
  }, [_bookings, pendingBookings, notRealizedBookings, pendingConfirmationBookings, selectedBooking]);

  const { data: reportedIdList = [] } = useQuery({
    queryKey: ["agenda-booking-reports", visibleBookingIds.join("|")],
    queryFn: async () => {
      const out: string[] = [];
      for (let i = 0; i < visibleBookingIds.length; i += 100) {
        const chunk = visibleBookingIds.slice(i, i + 100);
        const { data, error } = await supabase.from("booking_reports").select("booking_id").in("booking_id", chunk);
        if (error) throw error;
        (data || []).forEach((r) => out.push(r.booking_id));
      }
      return out;
    },
    enabled: visibleBookingIds.length > 0,
  });
  const reportedIds = useMemo(() => new Set(reportedIdList), [reportedIdList]);

  /** Status efetivo (regra única), considerando se há relatório salvo. */
  const displayStatus = (booking: BookingRow): SessionStatus =>
    getEffectiveBookingStatus(booking, { hasReport: reportedIds.has(booking.id) }) as SessionStatus;

  const approvePending = async (bk: BookingRow) => {
    // `sync_availability_booked` (trigger) já marca a disponibilidade como ocupada.
    const { error } = await supabase.from("bookings").update({ status: "scheduled", approval_required: false }).eq("id", bk.id);
    if (error) { toast.error(translateBookingError(error, "Erro ao aprovar")); return; }
    void invokeProvisionMeeting(bk.id).then((r) => {
      if (r && !r.ok) {
        toast.warning(r.error || r.message || "Sala Meet não criada — tente provisionar de novo.");
      }
    });
    supabase.functions.invoke("google-calendar-sync", { body: { booking_id: bk.id } }).catch((e) => console.warn("google-calendar-sync", e));
    invalidateBookings();
    toast.success("Sessão aprovada. Aluno e mentor foram notificados");
  };

  const rejectPending = async (bk: BookingRow, reason: string) => {
    const { error } = await supabase.from("bookings").update({
      status: "cancelled",
      cancellation_reason: reason || "Mentor indisponível neste horário",
    }).eq("id", bk.id);
    if (error) { toast.error(translateBookingError(error, "Erro ao recusar")); return; }
    invalidateBookings();
    toast.success("Horário recusado. Aluno foi notificado");
  };

  const reopenNotRealized = async (bk: BookingRow) => {
    const { error } = await supabase
      .from("bookings")
      .update({ status: "scheduled", cancellation_reason: null })
      .eq("id", bk.id);
    if (error) { toast.error(translateBookingError(error, "Erro ao reabrir sessão")); return; }
    invalidateBookings();
    toast.success("Sessão reaberta na agenda");
  };

  /** Fecha uma sessão "A confirmar": realizada (mantém exigência de relatório) ou não realizada. */
  const closePendingConfirmation = async (bk: BookingRow, outcome: "completed" | "not_realized", reason?: string) => {
    setSavingStatus(true);
    const patch =
      outcome === "completed"
        ? { status: "completed" as const }
        : { status: "not_realized" as const, cancellation_reason: reason?.trim() || "Marcada como não realizada pelo administrador" };
    const { error } = await supabase.from("bookings").update(patch).eq("id", bk.id);
    setSavingStatus(false);
    if (error) { toast.error(translateBookingError(error, "Erro ao atualizar a sessão")); return false; }
    if (selectedBooking?.id === bk.id) {
      setSelectedBooking({ ...selectedBooking, ...patch });
      setEditStatus(outcome);
    }
    invalidateBookings();
    toast.success(outcome === "completed" ? "Sessão confirmada como realizada" : "Sessão marcada como não realizada");
    return true;
  };
  const demoAdminBks = useMemo(() => {
    if (!demoEnabled) return [];
    const realMentorIds = _allMentors.map((m) => m.id);
    const all = demoBookingsForAdmin(realMentorIds);
    return all
      .filter((b) => b.scheduled_date >= dateRange.start && b.scheduled_date <= dateRange.end)
      .map((b) => {
        const lib = demoLibertyProfiles.find((p) => p.id === b.liberty_id);
        const sess = demoSessionsCatalog.find((s) => s.id === b.session_id);
        return {
          ...b,
          availability_id: null,
          observations: null,
          cancellation_reason: null,
          zoom_link: null,
          liberty: lib ? { full_name: lib.full_name } : null,
          sessions: sess ? { name: sess.name } : null,
        } as unknown as BookingRow;
      });
  }, [demoEnabled, _allMentors, dateRange.start, dateRange.end]);
  const bookings = useMemo(
    () => (demoEnabled ? [..._bookings, ...demoAdminBks] : _bookings),
    [_bookings, demoAdminBks, demoEnabled]
  );

  // Fetch ALL availability and expand within current range
  const { data: allAvailability = [] } = useQuery({
    queryKey: ["agenda-all-availability"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mentor_availability")
        .select("*")
        .eq("is_booked", false);
      if (error) throw error;
      return data || [];
    },
  });

  // Expand availability for visible date range
  const expandedAvailability = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return [];
    const start = parseISO(dateRange.start);
    const end = parseISO(dateRange.end);
    const result: SlotRef[] = [];
    allAvailability.forEach((av) => {
      if (av.specific_date) {
        const d = parseISO(av.specific_date);
        if (d >= start && d <= end) {
          result.push({ id: av.id, mentor_id: av.mentor_id, date: av.specific_date, start_time: av.start_time, end_time: av.end_time, is_recurring: false });
        }
      } else if (av.is_recurring) {
        let d = new Date(start);
        while (d <= end) {
          if (getDay(d) === av.day_of_week) {
            result.push({ id: av.id, mentor_id: av.mentor_id, date: format(d, "yyyy-MM-dd"), start_time: av.start_time, end_time: av.end_time, is_recurring: true });
          }
          d = addDays(d, 1);
        }
      }
    });
    return result;
  }, [allAvailability, dateRange.start, dateRange.end]);

  const refreshAvailability = () => queryClient.invalidateQueries({ queryKey: ["agenda-all-availability"] });

  const addHours = (time: string, hrs: number) => {
    const [h, m] = time.split(":").map(Number);
    const total = Math.min(h * 60 + m + hrs * 60, 23 * 60 + 59);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };

  // Delete a slot directly on the calendar
  const deleteSlot = async (slot: SlotRef) => {
    const { error } = await supabase.from("mentor_availability").delete().eq("id", slot.id);
    if (error) { toast.error("Erro ao excluir", { description: error.message }); return; }
    toast.success("Disponibilidade excluída");
    setSlotDelete(null);
    refreshAvailability();
  };

  // Save an edited slot (date/time) — recurring slots become a specific date
  const saveSlot = async (slot: SlotRef, date: string, start: string, end: string) => {
    if (end <= start) { toast.error("O horário final deve ser após o inicial"); return; }
    const { error } = await supabase
      .from("mentor_availability")
      .update({
        specific_date: date,
        day_of_week: getDay(parseISO(date)),
        is_recurring: false,
        start_time: start,
        end_time: end,
      })
      .eq("id", slot.id);
    if (error) { toast.error("Erro ao salvar", { description: error.message }); return; }
    toast.success("Disponibilidade atualizada");
    setSlotEdit(null);
    refreshAvailability();
  };

  // Drag & drop a slot into another day
  const moveSlotToDate = async (slot: SlotRef, date: string) => {
    if (slot.date === date) return;
    await saveSlot(slot, date, slot.start_time, slot.end_time);
  };

  const openSlotEdit = (slot: SlotRef) => {
    setSlotEdit(slot);
    setSlotEditDate(slot.date);
    setSlotEditStart(slot.start_time.substring(0, 5));
    setSlotEditEnd(slot.end_time.substring(0, 5));
  };

  const createSlot = async () => {
    if (!slotAddDate || !slotAddMentor) { toast.error("Selecione o mentor"); return; }
    const end = addHours(slotAddStart, 2);
    const { error } = await supabase.from("mentor_availability").insert({
      mentor_id: slotAddMentor,
      specific_date: slotAddDate,
      day_of_week: getDay(parseISO(slotAddDate)),
      is_recurring: false,
      is_booked: false,
      start_time: slotAddStart,
      end_time: end,
    });
    if (error) { toast.error("Erro ao criar", { description: error.message }); return; }
    toast.success("Disponibilidade adicionada");
    setSlotAddDate(null);
    refreshAvailability();
  };

  // Day-view availability (legacy var name for minimal diff)
  const availability = useMemo(
    () => expandedAvailability.filter((a) => a.date === dateStr),
    [expandedAvailability, dateStr]
  );


  // Fetch members for manual booking — all Liberty/Begin profiles (independente de já terem login criado)
  const { data: members = [] } = useQuery({
    queryKey: ["agenda-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("member_tier", ["liberty", "begin"])
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch session catalog
  const { data: sessionsCatalog = [] } = useSessionCatalog();

  // Fetch mentor_sessions assignments
  const { data: mentorSessionAssignments = [] } = useQuery({
    queryKey: ["mentor-session-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("mentor_sessions").select("mentor_id, session_id").eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
  });

  // Build mentor index map for colors
  const mentorIndexMap = useMemo(() => {
    const map: Record<string, number> = {};
    allMentors.forEach((m, i) => (map[m.id] = i));
    return map;
  }, [allMentors]);

  const filteredMentorIds = mentorFilter ? [mentorFilter] : allMentors.map((m) => m.id);

  
  const matchesFilters = (b: BookingRow) => {
    const st = displayStatus(b);
    // Canceladas/não realizadas só aparecem quando o chip correspondente está ativo.
    const wantsHidden = statusFilter === "cancelled" || statusFilter === "not_realized";
    if (!wantsHidden && !isVisibleSessionBooking(b)) return false;
    if (mentorFilter && b.mentor_id !== mentorFilter) return false;
    if (statusFilter) {
      // "Realizada" agrupa realizadas com e sem relatório.
      const matches = statusFilter === "completed" ? st === "completed" || st === "awaiting_report" : st === statusFilter;
      if (!matches) return false;
    }
    if (studentSearch.trim()) {
      const name = b.liberty?.full_name || b.guest_name || "";
      if (!matchesSearch(name, studentSearch)) return false;
    }
    return true;
  };

  // Filter bookings for day view
  const dayBookings = useMemo(
    () =>
      bookings
        .filter((b) => b.scheduled_date === dateStr && matchesFilters(b))
        .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || "")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, dateStr, mentorFilter, statusFilter, studentSearch, reportedIds]
  );

  const totalInRange = bookings.filter(matchesFilters).length;
  const hasActiveFilters = mentorFilter !== null || statusFilter !== null || studentSearch.trim() !== "";

  const timeToRow = (time: string) => {
    const t = time.substring(0, 5); // handle "HH:MM:SS"
    const [h, m] = t.split(":").map(Number);
    return (h - 7) * 2 + (m >= 30 ? 1 : 0);
  };

  const getSessionSpan = (start: string, end: string) => timeToRow(end) - timeToRow(start);

  const formatTime = (t: string) => t.substring(0, 5);

  const getMentorName = (id: string) => {
    const m = allMentors.find((m) => m.id === id);
    return m ? shortName(m.full_name) : "Sem dados";
  };

  // Color per mentor (overrides status colors for visual identification)
  const mentorColorFor = (mentorId: string) => {
    const idx = mentorIndexMap[mentorId] ?? 0;
    return mentorColors[idx % mentorColors.length];
  };
  const bookingBg = (b: BookingRow) => {
    const c = mentorColorFor(b.mentor_id);
    const st = displayStatus(b);
    if (st === "cancelled" || st === "not_realized") return "bg-muted/40 border-border opacity-60";
    // Aguardando aprovação nunca deve parecer confirmada na agenda.
    if (st === "pending_approval")
      return "bg-card border-dashed border-status-yellow/60";
    // Passou do horário sem confirmação do mentor.
    if (st === "pending_confirmation")
      return "bg-card border-dashed border-status-orange/60";
    return c.bg;
  };
  const bookingText = (b: BookingRow) => {
    const st = displayStatus(b);
    if (st === "pending_approval") return "text-status-yellow";
    if (st === "pending_confirmation") return "text-status-orange";
    return mentorColorFor(b.mentor_id).text;
  };

  // Edit actions (now hitting DB). O select do drawer edita o status BRUTO.
  const handleStatusChange = async (newStatus: RawBookingStatus) => {
    if (!selectedBooking || savingStatus) return;
    if (newStatus === selectedBooking.status) return;
    if (newStatus === "cancelled") {
      // Cancelamento exige motivo: roteia para o modal.
      setShowCancelModal(true);
      return;
    }
    if (newStatus === "not_realized") {
      setShowNotRealizedModal(true);
      return;
    }
    setSavingStatus(true);
    const { error } = await supabase.from("bookings").update({ status: newStatus }).eq("id", selectedBooking.id);
    setSavingStatus(false);
    if (error) { toast.error(translateBookingError(error, "Erro ao atualizar status")); return; }
    setSelectedBooking({ ...selectedBooking, status: newStatus });
    setEditStatus(newStatus);
    invalidateBookings();
    toast.success("Status atualizado");
  };

  const handleMentorSwap = async (newMentorId: string) => {
    if (!selectedBooking) return;
    const { error } = await supabase.from("bookings").update({ mentor_id: newMentorId }).eq("id", selectedBooking.id);
    if (error) { toast.error(translateBookingError(error, "Erro ao trocar mentor")); return; }
    if (!selectedBooking.is_retroactive) {
      supabase.functions.invoke("google-calendar-sync", { body: { booking_id: selectedBooking.id } }).catch((e) => console.warn("google-calendar-sync", e));
    }
    setSelectedBooking({ ...selectedBooking, mentor_id: newMentorId });
    setShowMentorSwap(false);
    invalidateBookings();
    toast.success("Mentor atualizado");
  };

  const handleDateTimeChange = async () => {
    if (!selectedBooking || !newTime) return;
    const endTime = computeEndTime(newTime, selectedBooking.sessions?.duration_minutes);
    // Se o admin só mudou o horário, mantém a data da própria sessão (não o dia exibido no calendário).
    const targetDate = newDate || selectedBooking.scheduled_date;

    // Sessão já realizada mantém o status; as demais voltam para "agendada".
    // `availability_id: null` libera o slot antigo (trigger só libera quando o vínculo muda).
    const keepStatus = selectedBooking.status === "completed";
    const { error } = await supabase.from("bookings").update({
      start_time: newTime,
      end_time: endTime,
      scheduled_date: targetDate,
      availability_id: null,
      ...(keepStatus ? {} : { status: "scheduled" as const }),
    }).eq("id", selectedBooking.id);

    if (error) { toast.error(translateBookingError(error, "Erro ao remarcar")); return; }
    if (!selectedBooking.is_retroactive) {
      void invokeProvisionMeeting(selectedBooking.id, { force: true }).then((r) => {
        if (r && !r.ok) {
          toast.warning(r.error || r.message || "Sala Meet não recriada — tente provisionar de novo.");
        }
      });
      supabase.functions.invoke("google-calendar-sync", { body: { booking_id: selectedBooking.id } }).catch((e) => console.warn("google-calendar-sync", e));
    }
    setShowDateChange(false);
    invalidateBookings();
    toast.success("Sessão remarcada");
    setDrawerOpen(false);
  };

  const handleCancel = async () => {
    if (!selectedBooking || !cancelReason) return;
    const { error } = await supabase.from("bookings").update({
      status: "cancelled",
      cancellation_reason: cancelReason,
    }).eq("id", selectedBooking.id);

    if (error) { toast.error(translateBookingError(error, "Erro ao cancelar")); return; }
    if (!selectedBooking.is_retroactive) {
      supabase.functions.invoke("google-calendar-sync", { body: { booking_id: selectedBooking.id } }).catch((e) => console.warn("google-calendar-sync", e));
    }
    setShowCancelModal(false);
    setCancelReason("");
    invalidateBookings();
    toast.success("Sessão cancelada");
    setDrawerOpen(false);
  };

  const handleNotRealized = async () => {
    if (!selectedBooking) return;
    const ok = await closePendingConfirmation(selectedBooking, "not_realized", notRealizedReason);
    if (!ok) return;
    setShowNotRealizedModal(false);
    setNotRealizedReason("");
  };

  const manualSessionInfo = sessionsCatalog.find((s) => s.id === manualSession) ?? null;
  const manualEndTime = manualTime ? computeEndTime(manualTime, manualSessionInfo?.duration_minutes) : "";

  const handleManualBook = async () => {
    if (submittingBook) return;
    const hasParticipant = manualIsGuest ? manualGuestName.trim().length > 0 : !!manualLiberty;
    if (!hasParticipant || !manualSession || !manualMentor || !manualTime || !manualDate) return;
    const endTime = computeEndTime(manualTime, manualSessionInfo?.duration_minutes);
    const isRetroactive = manualStatus === "completed";

    // Conflict check: same mentor on the same day with overlapping slot
    setSubmittingBook(true);
    const { data: sameDay, error: sameDayErr } = await supabase
      .from("bookings")
      .select("id, start_time, end_time, status, liberty_id, guest_name")
      .eq("mentor_id", manualMentor)
      .eq("scheduled_date", manualDate)
      .not("status", "in", "(cancelled,not_realized)");
    if (sameDayErr) console.warn("Conflito: não foi possível checar a agenda do mentor", sameDayErr);

    const newStart = manualTime;
    const newEnd = endTime;
    const overlap = (sameDay || []).find((b) => {
      const bs = (b.start_time || "").slice(0, 5);
      const be = (b.end_time || "").slice(0, 5);
      return bs < newEnd && newStart < be;
    });
    if (overlap && !manualConflict) {
      setSubmittingBook(false);
      setManualConflict(
        `Este mentor já tem uma sessão das ${(overlap.start_time || "").slice(0, 5)} às ${(overlap.end_time || "").slice(0, 5)} neste dia. Clique novamente em "Forçar mesmo assim" para agendar.`
      );
      return;
    }

    const { data: createdBk, error } = await supabase.from("bookings").insert({
      liberty_id: manualIsGuest ? null : manualLiberty,
      guest_name: manualIsGuest ? manualGuestName.trim() : null,
      mentor_id: manualMentor,
      session_id: manualSession,
      scheduled_date: manualDate,
      start_time: manualTime,
      end_time: endTime,
      observations: manualNotes || null,
      status: manualStatus,
      // Registro histórico: conta como realizada sem exigir relatório e sem cobrar o mentor.
      is_retroactive: isRetroactive,
      approval_required: false,
    }).select("id").single();

    if (error) {
      setSubmittingBook(false);
      toast.error(translateBookingError(error, "Erro ao agendar: " + (error.message || "verifique permissões")));
      console.error("Booking insert error:", error);
      return;
    }
    // Registro histórico não gera evento no Google Calendar nem Meet.
    if (createdBk?.id && !isRetroactive) {
      void invokeProvisionMeeting(createdBk.id).then((r) => {
        if (r && !r.ok) {
          toast.warning(r.error || r.message || "Sala Meet não criada — tente provisionar de novo.");
        }
      });
      supabase.functions.invoke("google-calendar-sync", { body: { booking_id: createdBk.id } }).catch((e) => console.warn("google-calendar-sync", e));
    }

    setShowManualModal(false);
    setManualLiberty(""); setManualGuestName(""); setManualIsGuest(false);
    setManualSession(""); setManualMentor("");
    setManualTime("09:00"); setManualNotes(""); setLibertySearch(""); setManualDate("");
    setManualStatus("scheduled"); setManualConflict(null);
    invalidateBookings();
    toast.success(isRetroactive ? "Sessão registrada como realizada (histórico)" : "Sessão agendada com sucesso");
    setSubmittingBook(false);
  };

  const openDrawer = (booking: BookingRow) => {
    // Mantém o status BRUTO no booking selecionado; o efetivo é derivado na hora de exibir.
    setSelectedBooking(booking);
    setEditStatus(toRawStatus(booking.status));
    setNewDate(booking.scheduled_date);
    setNewTime((booking.start_time || "09:00").substring(0, 5));
    setShowMentorSwap(false);
    setShowDateChange(false);
    setShowCancelModal(false);
    setShowNotRealizedModal(false);
    setDrawerOpen(true);
  };

  // Auto-open drawer when navigated with ?booking=<id> (e.g. from notifications bell)
  useEffect(() => {
    const bookingId = searchParams.get("booking");
    if (!bookingId || drawerOpen) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("bookings")
        .select(BOOKING_SELECT)
        .eq("id", bookingId)
        .maybeSingle();
      if (cancelled || !data) return;
      openDrawer(data as unknown as BookingRow);
      const next = new URLSearchParams(searchParams);
      next.delete("booking");
      setSearchParams(next, { replace: true });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);


  const normalize = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const filteredMembers = libertySearch
    ? members.filter((m) => {
        const needle = normalize(libertySearch);
        if (!needle) return true;
        const hay = normalize(m.full_name);
        // match by full string OR by any individual token (first name, middle, surname)
        if (hay.includes(needle)) return true;
        return hay.split(/\s+/).some((tok) => tok.startsWith(needle));
      })
    : members;

  const mentorsForSession = manualSession
    ? allMentors.filter((m) => mentorSessionAssignments.some((ms) => ms.mentor_id === m.id && ms.session_id === manualSession))
    : allMentors;

  // Helper data for week/month views
  const weekDays = useMemo(() => {
    const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: ws, end: addDays(ws, 6) });
  }, [currentDate]);

  const monthDays = useMemo(() => {
    const ms = startOfMonth(currentDate);
    const me = endOfMonth(currentDate);
    const calStart = startOfWeek(ms, { weekStartsOn: 1 });
    const calEnd = endOfWeek(me, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentDate]);

  const bookingsForDate = (d: Date) => {
    const ds = format(d, "yyyy-MM-dd");
    return bookings.filter((b) => b.scheduled_date === ds && matchesFilters(b));
  };

  const availabilityForDate = (d: Date) => {
    const ds = format(d, "yyyy-MM-dd");
    return expandedAvailability.filter((a) => a.date === ds && filteredMentorIds.includes(a.mentor_id));
  };

  // Open booking modal pre-filled from an availability slot
  const openBookingFromSlot = (mentorId: string, date: string, startTime: string) => {
    setManualMentor(mentorId);
    setManualDate(date);
    setManualTime(startTime.substring(0, 5));
    setShowManualModal(true);
  };

  const reminderLink = `${window.location.origin}/mentor/disponibilidade`;

  const copyReminderLink = (mentorName?: string) => {
    const message = mentorName
      ? `Olá ${shortName(mentorName)}! Lembre-se de cadastrar sua disponibilidade na plataforma Liberty Begin: ${reminderLink}`
      : reminderLink;
    navigator.clipboard.writeText(message);
    toast.success("Link copiado", { description: mentorName ? "Mensagem pronta para enviar." : undefined });
  };

  // Mentors without any availability in current range
  const mentorsWithoutAvailability = useMemo(() => {
    const withSlots = new Set(expandedAvailability.map((s) => s.mentor_id));
    return allMentors.filter((m) => !withSlots.has(m.id));
  }, [allMentors, expandedAvailability]);

  const headerLabel = useMemo(() => {
    if (viewMode === "day") return format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR });
    if (viewMode === "week") {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
      const we = addDays(ws, 6);
      return `${format(ws, "dd MMM", { locale: ptBR })} – ${format(we, "dd MMM yyyy", { locale: ptBR })}`;
    }
    return format(currentDate, "MMMM 'de' yyyy", { locale: ptBR });
  }, [currentDate, viewMode]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    setShowMentorSwap(false);
    setShowDateChange(false);
    setShowCancelModal(false);
    setShowNotRealizedModal(false);
    setProvisioningMeet(false);
  };

  const refreshSelectedBooking = async (bookingId: string) => {
    const { data, error } = await supabase
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("id", bookingId)
      .maybeSingle();
    if (error || !data) return;
    setSelectedBooking(data as unknown as BookingRow);
  };

  const handleProvisionMeet = async () => {
    if (!selectedBooking || provisioningMeet) return;
    setProvisioningMeet(true);
    try {
      const result = await invokeProvisionMeeting(selectedBooking.id, { force: true });
      await refreshSelectedBooking(selectedBooking.id);
      invalidateBookings();
      if (result?.ok === false || result?.error) {
        toast.error(result.error || result.message || "Não foi possível criar a sala Meet");
      } else {
        toast.success("Sala Meet criada");
      }
    } finally {
      setProvisioningMeet(false);
    }
  };

  const mentorPhoneFor = (b: BookingRow) =>
    b.mentor?.phone ?? allMentors.find((m) => m.id === b.mentor_id)?.phone ?? null;

  const sendMeetingWhatsApp = async (role: "member" | "mentor") => {
    if (!selectedBooking) return;
    const mentorName =
      selectedBooking.mentor?.full_name || getMentorName(selectedBooking.mentor_id);
    const text =
      role === "member"
        ? selectedBooking.meeting_wa_member_text ||
          buildMeetingWaFallback(selectedBooking, "member", mentorName)
        : selectedBooking.meeting_wa_mentor_text ||
          buildMeetingWaFallback(selectedBooking, "mentor", mentorName);
    const phone =
      role === "member" ? selectedBooking.liberty?.phone ?? null : mentorPhoneFor(selectedBooking);
    const href = whatsappHref(phone, text);
    if (href) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    await copyText(text);
    toast.success(
      role === "member"
        ? "Mensagem copiada — telefone do aluno indisponível"
        : "Mensagem copiada — telefone do mentor indisponível",
    );
  };

  const participantName = (b: BookingRow) => (b.liberty ? shortName(b.liberty.full_name) : (b.guest_name || "Sem dados"));
  const formatDayShort = (date: string) => format(parseISO(date), "EEE, dd/MM", { locale: ptBR });

  /** Linha padrão dos painéis de pendência (aprovação / não realizadas / a confirmar). */
  const renderPendingRow = (bk: BookingRow, last: boolean, trailing: ReactNode, extra?: ReactNode) => (
    <ListRow
      key={bk.id}
      last={last}
      leading={<DateBlock date={bk.scheduled_date} tone="muted" />}
      title={
        <span className="inline-flex items-center gap-2 flex-wrap">
          <span>{bk.sessions?.name || "Sessão"}</span>
          <span className="text-muted-foreground font-normal">· {participantName(bk)}</span>
        </span>
      }
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="tabular-nums">{formatTime(bk.start_time)} às {formatTime(bk.end_time)}</span>
          <span>· Mentor: {getMentorName(bk.mentor_id)}</span>
          {extra}
        </span>
      }
      trailing={trailing}
    />
  );

  const slotActionButton = (label: string, onClick: (e: React.MouseEvent) => void, Icon: LucideIcon, danger?: boolean) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`h-5 w-5 rounded bg-card border border-border text-muted-foreground flex items-center justify-center transition-colors duration-ds-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${danger ? "hover:text-destructive" : "hover:text-foreground"}`}
    >
      <Icon className="h-3 w-3" />
    </button>
  );

  const selectedEffective = selectedBooking ? displayStatus(selectedBooking) : null;

  return (
    <AppLayout role="admin">
      <PageContainer variant="wide">
        <div className="space-y-6">
          <div>
            <PageHeader
              eyebrow="Admin"
              title="Agenda geral"
              description={
                <span className="inline-flex items-center gap-2 flex-wrap">
                  <span className="capitalize">{headerLabel}</span>
                  <span className="tabular-nums">· {totalInRange} sessões</span>
                </span>
              }
              actions={
                <>
                  <Button variant="outline" size="sm" onClick={() => setShowReminders(true)}>
                    <LinkIcon className="h-4 w-4" /> Lembretes
                  </Button>
                  <Button size="sm" onClick={() => setShowManualModal(true)}>
                    <Plus className="h-4 w-4" /> Agendar
                  </Button>
                </>
              }
            />
          </div>

          {/* Aprovações pendentes: sessões pedidas com menos de 48h */}
          {pendingBookings.length > 0 && (
            <div>
              <SectionCard padding="none">
                <div className="px-4 pt-4 pb-2">
                  <SectionHeader
                    title={
                      <span className="inline-flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden />
                        Aguardando aprovação
                        <span className="text-muted-foreground font-normal tabular-nums">({pendingBookings.length})</span>
                      </span>
                    }
                    description="Sessões pedidas com menos de 48h de antecedência. Confirme com o mentor a disponibilidade antes de aprovar."
                  />
                </div>
                {pendingBookings.map((bk, i) =>
                  renderPendingRow(
                    bk,
                    i === pendingBookings.length - 1,
                    <>
                      <Button size="sm" variant="outline" onClick={() => approvePending(bk)}>
                        <Check className="h-4 w-4" /> Aprovar
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { setRejectTarget(bk); setRejectReason("Mentor indisponível"); }}>
                        <Ban className="h-4 w-4" /> Recusar
                      </Button>
                    </>,
                  ),
                )}
              </SectionCard>
            </div>
          )}

          {/* Não realizadas, marcadas pelos mentores */}
          {notRealizedBookings.length > 0 && (
            <div>
              <SectionCard padding="none">
                <div className="px-4 pt-4 pb-2">
                  <SectionHeader
                    title={
                      <span className="inline-flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden />
                        Sessões marcadas como não realizadas
                        <span className="text-muted-foreground font-normal tabular-nums">({notRealizedBookings.length})</span>
                      </span>
                    }
                  />
                </div>
                {notRealizedBookings.map((bk, i) =>
                  renderPendingRow(
                    bk,
                    i === notRealizedBookings.length - 1,
                    <>
                      <Button size="sm" variant="outline" onClick={() => openDrawer({ ...bk, status: "not_realized" })}>Gerenciar</Button>
                      <Button size="sm" variant="ghost" onClick={() => reopenNotRealized(bk)}>Reabrir</Button>
                    </>,
                    bk.cancellation_reason ? <span className="text-muted-foreground truncate">· Motivo: {bk.cancellation_reason}</span> : undefined,
                  ),
                )}
              </SectionCard>
            </div>
          )}

          {/* Passaram do horário sem confirmação do mentor */}
          {pendingConfirmationBookings.length > 0 && (
            <div>
              <SectionCard padding="none">
                <div className="px-4 pt-4 pb-2">
                  <SectionHeader
                    title={
                      <span className="inline-flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
                        Sessões a confirmar
                        <span className="text-muted-foreground font-normal tabular-nums">({pendingConfirmationBookings.length})</span>
                      </span>
                    }
                    description={PENDING_CONFIRMATION_HINT}
                  />
                </div>
                {pendingConfirmationBookings.map((bk, i) => {
                  const overdue = isPendingConfirmationOverdue(bk);
                  const days = daysSinceBookingEnd(bk);
                  return renderPendingRow(
                    bk,
                    i === pendingConfirmationBookings.length - 1,
                    <>
                      <Button size="sm" variant="outline" onClick={() => openDrawer(bk)}>Gerenciar</Button>
                      <Button size="sm" variant="outline" disabled={savingStatus} onClick={() => closePendingConfirmation(bk, "completed")}>
                        <Check className="h-4 w-4" /> Marcar realizada
                      </Button>
                      <Button size="sm" variant="ghost" disabled={savingStatus} onClick={() => { openDrawer(bk); setShowNotRealizedModal(true); }}>
                        <Ban className="h-4 w-4" /> Não realizada
                      </Button>
                    </>,
                    <span className={overdue ? "text-destructive font-medium" : ""}>
                      · há {days} dia{days !== 1 ? "s" : ""}{overdue ? " · mentor não respondeu" : ""}
                    </span>,
                  );
                })}
              </SectionCard>
            </div>
          )}

          {/* Barra de filtros fixa: período, visão, mentor, status e busca */}
          <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-background border-b border-border space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1">
                  <IconButton aria-label={viewMode === "day" ? "Dia anterior" : viewMode === "week" ? "Semana anterior" : "Mês anterior"} size="sm" onClick={navigatePrev}>
                    <ChevronLeft className="h-4 w-4" />
                  </IconButton>
                  <Button variant="ghost" size="sm" onClick={() => setCurrentDate(new Date())}>Hoje</Button>
                  <IconButton aria-label={viewMode === "day" ? "Próximo dia" : viewMode === "week" ? "Próxima semana" : "Próximo mês"} size="sm" onClick={navigateNext}>
                    <ChevronRight className="h-4 w-4" />
                  </IconButton>
                </div>
                <span className="text-sm font-medium text-foreground capitalize min-w-[140px]">{headerLabel}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1" role="group" aria-label="Visualização">
                  {(["day", "week", "month"] as ViewMode[]).map((vm) => (
                    <Chip key={vm} active={viewMode === vm} onClick={() => setViewMode(vm)}>
                      {vm === "day" ? "Dia" : vm === "week" ? "Semana" : "Mês"}
                    </Chip>
                  ))}
                </div>
                <div className="relative flex-1 min-w-[180px] sm:max-w-[260px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
                  <TextField
                    type="search"
                    aria-label="Buscar aluno"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Buscar aluno"
                    className="pl-10 h-9"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap" role="group" aria-label="Filtrar por mentor">
              <Chip active={mentorFilter === null} onClick={() => setMentorFilter(null)} count={allMentors.length}>Todos os mentores</Chip>
              {allMentors.map((m, i) => (
                <Chip key={m.id} active={mentorFilter === m.id} onClick={() => setMentorFilter(mentorFilter === m.id ? null : m.id)}>
                  <span className={`w-2 h-2 rounded-full ${mentorColors[i % mentorColors.length].dot}`} aria-hidden />
                  {shortName(m.full_name)}
                </Chip>
              ))}
            </div>

            <div className="flex gap-2 flex-wrap items-center" role="group" aria-label="Filtrar por status">
              {STATUS_FILTER_OPTIONS.map((s) => (
                <Chip
                  key={s}
                  active={statusFilter === s}
                  onClick={() => setStatusFilter(statusFilter === s ? null : s)}
                >
                  <span className={`w-2 h-2 rounded-full ${bookingStatusConfig[s]?.dot ?? "bg-muted-foreground"}`} aria-hidden />
                  {statusLabel(s)}
                </Chip>
              ))}
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={() => { setMentorFilter(null); setStatusFilter(null); setStudentSearch(""); }}>
                  <X className="h-4 w-4" /> Limpar filtros
                </Button>
              )}
            </div>
          </div>

          {/* Estados de carregamento / erro do período */}
          {bookingsLoading ? (
            <LoadingState variant="cards" rows={4} />
          ) : bookingsError ? (
            <ErrorState title="Não foi possível carregar a agenda" onRetry={() => refetchBookings()} />
          ) : (
            <>
              {/* ═══════ DIA ═══════ */}
              {viewMode === "day" && (
                <>
                  {/* Desktop grid */}
                  <div className="hidden lg:block">
                    <SectionCard padding="none" className="overflow-auto">
                      {(() => {
                        const ROW_H = 24; // px por 30 min
                        const totalH = hours.length * ROW_H;
                        const HEADER_H = 60;
                        const TIME_COL_W = 52;
                        const MIN_COL_W = 120;
                        return (
                          <div className="relative" style={{ minWidth: TIME_COL_W + filteredMentorIds.length * MIN_COL_W }}>
                            <div className="flex">
                              {/* Coluna das horas */}
                              <div className="sticky left-0 z-20 bg-card shrink-0" style={{ width: TIME_COL_W }}>
                                <div className="bg-muted/10 sticky top-0 z-10" style={{ height: HEADER_H }} />
                                {hours.map((hour) => (
                                  <div
                                    key={hour}
                                    className="text-[11px] text-muted-foreground tabular-nums text-right pr-2 flex items-start justify-end"
                                    style={{ height: ROW_H }}
                                  >
                                    {hour.endsWith(":00") ? hour : ""}
                                  </div>
                                ))}
                              </div>

                              {/* Colunas por mentor */}
                              <div className="flex-1 flex">
                                {filteredMentorIds.map((mId) => {
                                  const idx = mentorIndexMap[mId] ?? 0;
                                  const mentor = allMentors.find((m) => m.id === mId);
                                  const color = mentorColors[idx % mentorColors.length];
                                  const colBookings = dayBookings.filter((b) => b.mentor_id === mId);
                                  const colSlots = availability.filter((a) => a.mentor_id === mId);
                                  return (
                                    <div key={mId} className="flex-1 border-l border-border/30 relative" style={{ minWidth: MIN_COL_W }}>
                                      <div className={`sticky top-0 z-10 text-center ${color.header}`} style={{ height: HEADER_H }}>
                                        <div className="h-full flex items-center justify-center gap-1.5 px-2">
                                          <span className={`w-2 h-2 rounded-full shrink-0 ${color.dot}`} aria-hidden />
                                          <span className="text-xs font-medium text-foreground leading-tight truncate">
                                            {mentor ? shortName(mentor.full_name) : "Sem dados"}
                                          </span>
                                        </div>
                                      </div>
                                      <div
                                        className="relative"
                                        style={{
                                          height: totalH,
                                          backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${ROW_H * 2 - 1}px, hsl(var(--border) / 0.2) ${ROW_H * 2 - 1}px, hsl(var(--border) / 0.2) ${ROW_H * 2}px)`,
                                        }}
                                      >
                                        {/* Disponibilidades */}
                                        {colSlots.map((slot, i) => {
                                          const top = timeToRow(slot.start_time) * ROW_H;
                                          const h = getSessionSpan(slot.start_time, slot.end_time) * ROW_H;
                                          const overlaps = colBookings.some(
                                            (b) => timeToRow(b.start_time) < timeToRow(slot.end_time) && timeToRow(b.end_time) > timeToRow(slot.start_time)
                                          );
                                          if (overlaps) return null;
                                          return (
                                            <div
                                              key={`slot-${i}`}
                                              className="absolute left-0.5 right-0.5 rounded-ds border border-dashed border-border hover:bg-accent hover:border-foreground/30 transition-colors duration-ds-1 group"
                                              style={{ top, height: h - 2 }}
                                            >
                                              <button
                                                type="button"
                                                onClick={() => openBookingFromSlot(mId, dateStr, slot.start_time)}
                                                className="absolute inset-0 flex items-center justify-center px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-ds"
                                                aria-label={`Agendar com ${mentor ? shortName(mentor.full_name) : "mentor"} das ${formatTime(slot.start_time)} às ${formatTime(slot.end_time)}`}
                                                title="Agendar neste horário"
                                              >
                                                <span className="text-[11px] text-muted-foreground tabular-nums text-center">
                                                  {formatTime(slot.start_time)} às {formatTime(slot.end_time)}
                                                </span>
                                              </button>
                                              <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-ds-1">
                                                {slotActionButton("Editar disponibilidade", (e) => { e.stopPropagation(); openSlotEdit(slot); }, Pencil)}
                                                {slotActionButton("Excluir disponibilidade", (e) => { e.stopPropagation(); setSlotDelete(slot); }, X, true)}
                                              </div>
                                            </div>
                                          );
                                        })}

                                        {/* Sessões */}
                                        {colBookings.map((b) => {
                                          const top = timeToRow(b.start_time) * ROW_H;
                                          const h = getSessionSpan(b.start_time, b.end_time) * ROW_H;
                                          const st = displayStatus(b);
                                          return (
                                            <button
                                              key={b.id}
                                              type="button"
                                              onClick={() => openDrawer(b)}
                                              aria-label={`${participantName(b)}, ${b.sessions?.name || "sessão"}, ${formatTime(b.start_time)} às ${formatTime(b.end_time)}, ${statusLabel(st)}`}
                                              className={`absolute left-0.5 right-0.5 rounded-ds border px-2 py-1 text-left transition-colors duration-ds-1 hover:bg-accent overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${bookingBg(b)}`}
                                              style={{ top, height: h - 2 }}
                                            >
                                              <p className={`text-[11px] font-medium tabular-nums leading-tight ${bookingText(b)}`}>
                                                {formatTime(b.start_time)} às {formatTime(b.end_time)}
                                              </p>
                                              <p className="text-xs font-medium text-foreground truncate leading-tight">{participantName(b)}</p>
                                              {(st === "pending_approval" || st === "pending_confirmation") && h >= 40 && (
                                                <p className={`text-[11px] truncate leading-tight ${st === "pending_approval" ? "text-status-yellow" : "text-status-orange"}`}>{statusLabel(st)}</p>
                                              )}
                                              {h >= 56 && (
                                                <p className="text-[11px] text-muted-foreground truncate leading-tight">{b.sessions?.name || "Sem dados"}</p>
                                              )}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </SectionCard>
                  </div>

                  {/* Lista mobile */}
                  <div className="lg:hidden space-y-4">
                    {dayBookings.length === 0 && availability.filter((a) => filteredMentorIds.includes(a.mentor_id)).length === 0 && (
                      <EmptyState
                        icon={CalendarDays}
                        title="Nenhuma sessão neste dia"
                        description="Nenhum horário disponível ou sessão agendada com os filtros atuais."
                        action={<Button size="sm" onClick={() => setShowManualModal(true)}><Plus className="h-4 w-4" /> Agendar</Button>}
                      />
                    )}
                    {hours.map((hour) => {
                      const hourBookings = dayBookings.filter((b) => formatTime(b.start_time) === hour && filteredMentorIds.includes(b.mentor_id));
                      const hourSlots = availability.filter((a) => formatTime(a.start_time) === hour && filteredMentorIds.includes(a.mentor_id));
                      if (hourBookings.length === 0 && hourSlots.length === 0) return null;
                      const total = hourBookings.length + hourSlots.length;
                      return (
                        <div key={hour} className="space-y-2">
                          <p className="text-xs text-muted-foreground font-medium tabular-nums">{hour}</p>
                          <SectionCard padding="none">
                            {hourBookings.map((b, i) => (
                              <ListRow
                                key={b.id}
                                last={i === total - 1}
                                onPress={() => openDrawer(b)}
                                leading={
                                  <span className="flex h-10 w-10 items-center justify-center" aria-hidden>
                                    <span className={`h-2.5 w-2.5 rounded-full ${mentorColorFor(b.mentor_id).dot}`} />
                                  </span>
                                }
                                title={participantName(b)}
                                subtitle={`${b.sessions?.name || "Sem dados"} · ${formatTime(b.start_time)} às ${formatTime(b.end_time)} · ${getMentorName(b.mentor_id)}`}
                                trailing={<StatusPill status={displayStatus(b)} size="sm" />}
                                chevron
                              />
                            ))}
                            {hourSlots.map((sl, i) => (
                              <ListRow
                                key={`slot-${i}`}
                                last={hourBookings.length + i === total - 1}
                                onPress={() => openBookingFromSlot(sl.mentor_id, dateStr, sl.start_time)}
                                leading={<Plus className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />}
                                title={`Disponível · ${getMentorName(sl.mentor_id)}`}
                                subtitle={`${formatTime(sl.start_time)} às ${formatTime(sl.end_time)} · Toque para agendar`}
                                trailing={
                                  <span className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                                    <IconButton aria-label="Editar disponibilidade" size="sm" onClick={() => openSlotEdit(sl)}><Pencil className="h-4 w-4" /></IconButton>
                                    <IconButton aria-label="Excluir disponibilidade" size="sm" className="hover:text-destructive" onClick={() => setSlotDelete(sl)}><Trash2 className="h-4 w-4" /></IconButton>
                                  </span>
                                }
                              />
                            ))}
                          </SectionCard>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* ═══════ SEMANA ═══════ */}
              {viewMode === "week" && (
                <div>
                  <SectionCard padding="none" className="overflow-auto">
                    <div className="grid grid-cols-7 min-w-[760px]">
                      {weekDays.map((day) => (
                        <div key={day.toISOString()} className={`p-3 border-b border-r border-border text-center ${isToday(day) ? "bg-muted/40" : ""}`}>
                          <p className="text-xs text-muted-foreground capitalize">{format(day, "EEE", { locale: ptBR })}</p>
                          <p className="text-lg font-semibold tabular-nums text-foreground">{format(day, "dd")}</p>
                        </div>
                      ))}
                      {weekDays.map((day) => {
                        const dayBks = bookingsForDate(day);
                        const dayAvail = availabilityForDate(day);
                        const ds = format(day, "yyyy-MM-dd");
                        const isDropTarget = draggingSlot && dragOverDay === ds && draggingSlot.date !== ds;
                        return (
                          <div
                            key={`cell-${day.toISOString()}`}
                            onDragOver={(e) => { if (draggingSlot) { e.preventDefault(); setDragOverDay(ds); } }}
                            onDragLeave={() => setDragOverDay((d) => (d === ds ? null : d))}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (draggingSlot) moveSlotToDate(draggingSlot, ds);
                              setDraggingSlot(null);
                              setDragOverDay(null);
                            }}
                            className={`relative border-r border-b border-border p-2 min-h-[220px] transition-colors duration-ds-1 ${isToday(day) ? "bg-muted/20" : ""} ${isDropTarget ? "bg-accent ring-1 ring-inset ring-foreground/30" : ""}`}
                          >
                            <div className="space-y-1.5">
                              {dayBks.length === 0 && dayAvail.length === 0 && (
                                <p className="text-[11px] text-muted-foreground text-center py-6">Sem sessões</p>
                              )}
                              {dayBks.map((b) => {
                                const st = displayStatus(b);
                                return (
                                  <button
                                    key={b.id}
                                    type="button"
                                    onClick={() => openDrawer(b)}
                                    aria-label={`${participantName(b)}, ${formatTime(b.start_time)}, ${statusLabel(st)}`}
                                    className={`w-full rounded-ds border p-2 text-left transition-colors duration-ds-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${bookingBg(b)}`}
                                  >
                                    <p className={`text-[11px] font-medium tabular-nums flex items-center gap-1.5 ${bookingText(b)}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${bookingStatusConfig[st]?.dot ?? "bg-muted-foreground"}`} aria-hidden />
                                      {formatTime(b.start_time)} às {formatTime(b.end_time)}
                                    </p>
                                    <p className="text-xs font-medium text-foreground truncate">{participantName(b)}</p>
                                    <p className="text-[11px] text-muted-foreground truncate">{getMentorName(b.mentor_id)} · {b.sessions?.name || "Sem dados"}</p>
                                  </button>
                                );
                              })}
                              {dayAvail.map((sl, i) => (
                                <div
                                  key={`av-${i}`}
                                  draggable
                                  onDragStart={() => setDraggingSlot(sl)}
                                  onDragEnd={() => { setDraggingSlot(null); setDragOverDay(null); }}
                                  className={`group/slot relative w-full rounded-ds border border-dashed border-border p-1.5 hover:bg-accent transition-colors duration-ds-1 cursor-grab active:cursor-grabbing ${draggingSlot?.id === sl.id && draggingSlot?.date === sl.date ? "opacity-40" : ""}`}
                                  title="Arraste para outro dia para mover"
                                >
                                  <button
                                    type="button"
                                    onClick={() => openBookingFromSlot(sl.mentor_id, sl.date, sl.start_time)}
                                    className="w-full text-left pr-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-ds"
                                    aria-label={`Agendar com ${getMentorName(sl.mentor_id)} às ${formatTime(sl.start_time)}`}
                                  >
                                    <p className="text-[11px] tabular-nums text-foreground">{formatTime(sl.start_time)} às {formatTime(sl.end_time)}</p>
                                    <p className="text-[11px] text-muted-foreground truncate">{getMentorName(sl.mentor_id)}</p>
                                  </button>
                                  <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover/slot:opacity-100 group-focus-within/slot:opacity-100 transition-opacity duration-ds-1">
                                    {slotActionButton("Editar disponibilidade", (e) => { e.stopPropagation(); openSlotEdit(sl); }, Pencil)}
                                    {slotActionButton("Excluir disponibilidade", (e) => { e.stopPropagation(); setSlotDelete(sl); }, X, true)}
                                  </div>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => { setSlotAddDate(ds); setSlotAddMentor(mentorFilter || allMentors[0]?.id || ""); setSlotAddStart("07:00"); }}
                                className="w-full rounded-ds border border-dashed border-border min-h-[32px] text-[11px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors duration-ds-1 flex items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <Plus className="h-3 w-3" aria-hidden /> Disponibilidade
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </SectionCard>
                </div>
              )}

              {/* ═══════ MÊS ═══════ */}
              {viewMode === "month" && (
                <div className="space-y-3">
                  <SectionCard padding="none" className="overflow-auto">
                    <div className="grid grid-cols-7 min-w-[640px]">
                      {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
                        <div key={d} className="h-10 flex items-center justify-center border-b border-border text-xs font-medium text-muted-foreground bg-muted/20">{d}</div>
                      ))}
                      {monthDays.map((day) => {
                        const dayBks = bookingsForDate(day);
                        const dayAvail = availabilityForDate(day);
                        const inMonth = isSameMonth(day, currentDate);
                        const ds = format(day, "yyyy-MM-dd");
                        const isDropTarget = draggingSlot && dragOverDay === ds && draggingSlot.date !== ds;
                        return (
                          <button
                            key={day.toISOString()}
                            type="button"
                            onClick={() => { setCurrentDate(day); setViewMode("day"); }}
                            onDragOver={(e) => { if (draggingSlot) { e.preventDefault(); setDragOverDay(ds); } }}
                            onDragLeave={() => setDragOverDay((d) => (d === ds ? null : d))}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (draggingSlot) moveSlotToDate(draggingSlot, ds);
                              setDraggingSlot(null);
                              setDragOverDay(null);
                            }}
                            aria-label={`${format(day, "d 'de' MMMM", { locale: ptBR })}, ${dayBks.length} sessões`}
                            className={`border-r border-b border-border p-2 min-h-[96px] text-left transition-colors duration-ds-1 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                              !inMonth ? "opacity-40" : ""
                            } ${isToday(day) ? "bg-muted/20" : ""} ${isDropTarget ? "bg-accent ring-1 ring-inset ring-foreground/30" : ""}`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className={`inline-flex h-6 min-w-6 px-1 items-center justify-center rounded-full text-xs font-medium tabular-nums ${isToday(day) ? "bg-foreground text-background" : "text-foreground"}`}>
                                {format(day, "d")}
                              </span>
                              {dayAvail.length > 0 && (
                                <span className="text-[11px] text-muted-foreground tabular-nums" title={`${dayAvail.length} horário(s) disponível(is)`}>
                                  {dayAvail.length} disp.
                                </span>
                              )}
                            </div>
                            {dayBks.length > 0 && (
                              <div className="space-y-0.5">
                                {dayBks.slice(0, 3).map((b) => {
                                  const st = displayStatus(b);
                                  return (
                                    <div key={b.id} className="flex items-center gap-1.5 text-[11px] truncate">
                                      <span className={`w-2 h-2 rounded-full shrink-0 ${bookingStatusConfig[st]?.dot ?? "bg-muted-foreground"}`} aria-hidden />
                                      <span className="tabular-nums text-muted-foreground">{formatTime(b.start_time)}</span>
                                      <span className="text-foreground truncate">{participantName(b).split(" ")[0]}</span>
                                    </div>
                                  );
                                })}
                                {dayBks.length > 3 && (
                                  <p className="text-[11px] text-muted-foreground">+{dayBks.length - 3} mais</p>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </SectionCard>

                  {/* Legenda */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground px-1">
                    {STATUS_FILTER_OPTIONS.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${bookingStatusConfig[s]?.dot ?? "bg-muted-foreground"}`} aria-hidden /> {statusLabel(s)}
                      </span>
                    ))}
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full border border-dashed border-muted-foreground" aria-hidden /> Disponibilidade
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </PageContainer>

      {/* ═══════ LEMBRETES ═══════ */}
      <BottomSheet
        open={showReminders}
        onOpenChange={setShowReminders}
        title="Lembretes de disponibilidade"
        description="Copie o link e envie para o mentor lembrar de cadastrar a disponibilidade."
        footer={
          <Button variant="outline" onClick={() => copyReminderLink()}>
            <Copy className="h-4 w-4" /> Copiar link genérico
          </Button>
        }
      >
        <div className="space-y-4">
          {mentorsWithoutAvailability.length > 0 && (
            <SectionCard padding="none">
              <div className="px-4 pt-3 pb-1">
                <SectionHeader
                  as="h3"
                  title={`${mentorsWithoutAvailability.length} mentor${mentorsWithoutAvailability.length !== 1 ? "es" : ""} sem disponibilidade no período`}
                />
              </div>
              {mentorsWithoutAvailability.map((m, i) => (
                <ListRow
                  key={m.id}
                  last={i === mentorsWithoutAvailability.length - 1}
                  title={shortName(m.full_name)}
                  trailing={
                    <Button size="sm" variant="outline" onClick={() => copyReminderLink(m.full_name)}>
                      <Copy className="h-4 w-4" /> Copiar
                    </Button>
                  }
                />
              ))}
            </SectionCard>
          )}
          <SectionCard padding="none">
            <div className="px-4 pt-3 pb-1">
              <SectionHeader as="h3" title="Todos os mentores" />
            </div>
            {allMentors.map((m, i) => (
              <ListRow
                key={m.id}
                last={i === allMentors.length - 1}
                title={shortName(m.full_name)}
                trailing={
                  <IconButton aria-label={`Copiar lembrete para ${shortName(m.full_name)}`} size="sm" onClick={() => copyReminderLink(m.full_name)}>
                    <Copy className="h-4 w-4" />
                  </IconButton>
                }
              />
            ))}
          </SectionCard>
        </div>
      </BottomSheet>

      {/* ═══════ GERENCIAR SESSÃO ═══════ */}
      <BottomSheet
        open={drawerOpen && !!selectedBooking}
        onOpenChange={(o) => !o && closeDrawer()}
        title="Gerenciar sessão"
        description={selectedBooking ? `${selectedBooking.sessions?.name || "Sessão"} · ${format(new Date(selectedBooking.scheduled_date + "T12:00:00"), "dd/MM/yyyy")}` : undefined}
        locked={savingStatus}
      >
        {selectedBooking && selectedEffective && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <UserAvatar name={selectedBooking.liberty?.full_name || selectedBooking.guest_name || "?"} avatarUrl={selectedBooking.liberty?.avatar_url} size={40} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{participantName(selectedBooking)}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedBooking.liberty
                    ? (selectedBooking.liberty.member_tier === "liberty" ? "Liberty" : "Liberty Begin")
                    : "Convidado"}
                </p>
              </div>
              <StatusPill status={selectedEffective} className="ml-auto" />
            </div>

            <SectionCard padding="none">
              <ListRow title={<span className="text-muted-foreground font-normal">Sessão</span>} trailing={<span className="text-sm font-medium text-foreground text-right">{selectedBooking.sessions?.name || "Sem dados"}</span>} />
              <ListRow
                title={<span className="text-muted-foreground font-normal">Mentor</span>}
                trailing={
                  <>
                    <span className="text-sm font-medium text-foreground">{getMentorName(selectedBooking.mentor_id)}</span>
                    <Button variant="ghost" size="sm" onClick={() => setShowMentorSwap((v) => !v)} aria-expanded={showMentorSwap}>Trocar</Button>
                  </>
                }
              />
              <ListRow
                title={<span className="text-muted-foreground font-normal">Data e horário</span>}
                trailing={
                  <>
                    <span className="text-sm font-medium text-foreground tabular-nums text-right">
                      {format(new Date(selectedBooking.scheduled_date + "T12:00:00"), "dd/MM/yyyy")} · {formatTime(selectedBooking.start_time)} às {formatTime(selectedBooking.end_time)}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setShowDateChange((v) => !v)} aria-expanded={showDateChange}>Alterar</Button>
                  </>
                }
              />
              <ListRow
                last
                title={<span className="text-muted-foreground font-normal">Status</span>}
                trailing={
                  <SelectField
                    aria-label="Alterar status da sessão"
                    value={editStatus}
                    disabled={savingStatus}
                    onChange={(e) => handleStatusChange(e.target.value as RawBookingStatus)}
                    containerClassName="w-44"
                    className="h-9"
                  >
                    <option value="scheduled">Agendada</option>
                    <option value="completed">Realizada</option>
                    <option value="not_realized">Não realizada</option>
                    <option value="cancelled">Cancelada</option>
                    {editStatus === "pending_approval" && <option value="pending_approval">Aguardando aprovação</option>}
                  </SelectField>
                }
              />
            </SectionCard>

            {selectedEffective === "pending_confirmation" && (
              <Callout tone="warning" icon={Clock} title="O mentor ainda não fechou esta sessão">
                <p className="mb-3">{PENDING_CONFIRMATION_HINT}</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button variant="outline" size="sm" className="flex-1" disabled={savingStatus} onClick={() => closePendingConfirmation(selectedBooking, "completed")}>
                    <Check className="h-4 w-4" /> Marcar realizada
                  </Button>
                  <Button variant="ghost" size="sm" className="flex-1" disabled={savingStatus} onClick={() => setShowNotRealizedModal(true)}>
                    <Ban className="h-4 w-4" /> Não realizada
                  </Button>
                </div>
              </Callout>
            )}
            {selectedEffective === "awaiting_report" && (
              <p className="text-xs text-muted-foreground">Marcada como realizada pelo mentor. O relatório ainda não foi salvo.</p>
            )}
            {selectedBooking.is_retroactive && (
              <p className="text-xs text-muted-foreground">Registro histórico lançado pelo administrador (não exige relatório).</p>
            )}

            {selectedBooking.observations && (
              <SectionCard padding="compact">
                <p className="ds-kicker mb-1">Observações</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{selectedBooking.observations}</p>
              </SectionCard>
            )}

            {selectedBooking.cancellation_reason && (
              <Callout tone="danger" title="Motivo">{selectedBooking.cancellation_reason}</Callout>
            )}

            {/* Trocar mentor */}
            {showMentorSwap && (
              <SectionCard padding="none">
                <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                  <SectionHeader as="h3" title="Trocar mentor" />
                  <IconButton aria-label="Fechar troca de mentor" size="sm" onClick={() => setShowMentorSwap(false)}><X className="h-4 w-4" /></IconButton>
                </div>
                {allMentors.map((m, i) => {
                  const isCurrent = m.id === selectedBooking.mentor_id;
                  return (
                    <ListRow
                      key={m.id}
                      last={i === allMentors.length - 1}
                      onPress={isCurrent ? undefined : () => handleMentorSwap(m.id)}
                      active={isCurrent}
                      leading={<UserAvatar name={m.full_name} avatarUrl={(m as { avatar_url?: string | null }).avatar_url ?? null} size={32} />}
                      title={shortName(m.full_name)}
                      trailing={isCurrent ? <StatusPill tone="neutral" size="sm" withDot={false}>Atual</StatusPill> : undefined}
                      chevron={!isCurrent}
                    />
                  );
                })}
              </SectionCard>
            )}

            {/* Alterar data/horário */}
            {showDateChange && (
              <SectionCard padding="compact" className="space-y-3">
                <div className="flex items-center justify-between">
                  <SectionHeader as="h3" title="Alterar data e horário" />
                  <IconButton aria-label="Fechar alteração de data" size="sm" onClick={() => setShowDateChange(false)}><X className="h-4 w-4" /></IconButton>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Nova data" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                  <TextField
                    label="Novo horário (início)"
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    hint={`Duração: ${formatDuration(selectedBooking.sessions?.duration_minutes)}${newTime ? ` · fim às ${computeEndTime(newTime, selectedBooking.sessions?.duration_minutes)}` : ""}`}
                  />
                </div>
                <Button className="w-full" onClick={handleDateTimeChange}>
                  <RefreshCw className="h-4 w-4" /> Confirmar alteração
                </Button>
              </SectionCard>
            )}

            <div className="flex flex-col gap-2">
              {selectedBooking.status !== "completed" && selectedBooking.status !== "cancelled" && !showDateChange && (
                <Button variant="outline" className="w-full" onClick={() => setShowDateChange(true)}>
                  <RefreshCw className="h-4 w-4" /> Remarcar
                </Button>
              )}
              {selectedBooking.status !== "cancelled" && selectedBooking.status !== "completed" && (
                <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={() => setShowCancelModal(true)}>
                  <Ban className="h-4 w-4" /> Cancelar sessão
                </Button>
              )}
              {(selectedBooking.zoom_join_url || selectedBooking.zoom_link) && (
                <Button variant="outline" className="w-full" asChild>
                  <a href={selectedBooking.zoom_join_url || selectedBooking.zoom_link || "#"} target="_blank" rel="noopener noreferrer">
                    <Video className="h-4 w-4" />{" "}
                    {meetingOpenLabel(selectedBooking.zoom_join_url || selectedBooking.zoom_link)}
                  </a>
                </Button>
              )}
              {!selectedBooking.zoom_join_url && !selectedBooking.zoom_link && selectedBooking.status === "scheduled" && (
                <div className="space-y-2">
                  {selectedBooking.meeting_provision_error && (
                    <Callout tone="danger" title="Falha ao criar Meet">
                      {selectedBooking.meeting_provision_error}
                    </Callout>
                  )}
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={provisioningMeet}
                    onClick={handleProvisionMeet}
                  >
                    <Video className="h-4 w-4" /> {provisioningMeet ? "Criando…" : "Criar sala Meet"}
                  </Button>
                </div>
              )}
            </div>

            <SectionCard padding="compact" className="space-y-2">
              <SectionHeader as="h3" title="Lembretes WhatsApp" />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => sendMeetingWhatsApp("member")}
              >
                {selectedBooking.liberty?.phone ? (
                  <MessageCircle className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                Enviar sessão ao aluno
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => sendMeetingWhatsApp("mentor")}
              >
                {mentorPhoneFor(selectedBooking) ? (
                  <MessageCircle className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                Enviar sessão ao mentor
              </Button>
              {(!selectedBooking.liberty?.phone || !mentorPhoneFor(selectedBooking)) && (
                <p className="text-xs text-muted-foreground">
                  Sem telefone cadastrado: o botão copia a mensagem para colar no WhatsApp.
                </p>
              )}
            </SectionCard>
          </div>
        )}
      </BottomSheet>

      {/* ═══════ NÃO REALIZADA (motivo opcional) ═══════ */}
      <BottomSheet
        open={showNotRealizedModal && !!selectedBooking}
        onOpenChange={(o) => { if (!o) { setShowNotRealizedModal(false); setNotRealizedReason(""); } }}
        title="Marcar como não realizada"
        description="A sessão sai das realizadas e libera a vaga na jornada. Membro e mentor são notificados."
        size="sm"
        locked={savingStatus}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowNotRealizedModal(false); setNotRealizedReason(""); }} disabled={savingStatus}>Voltar</Button>
            <Button variant="destructive" onClick={handleNotRealized} disabled={savingStatus}>
              <Ban className="h-4 w-4" /> Confirmar
            </Button>
          </>
        }
      >
        <TextAreaField
          label="Motivo (opcional)"
          value={notRealizedReason}
          onChange={(e) => setNotRealizedReason(e.target.value)}
          placeholder="Ex.: membro não compareceu"
          rows={3}
        />
      </BottomSheet>

      {/* ═══════ CANCELAR SESSÃO (motivo obrigatório) ═══════ */}
      <BottomSheet
        open={showCancelModal && !!selectedBooking}
        onOpenChange={(o) => { if (!o) setShowCancelModal(false); }}
        title="Cancelar sessão"
        description="Esta ação cancela a sessão. Aluno e mentor são notificados com o motivo."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCancelModal(false)}>Voltar</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={!cancelReason}>
              <AlertTriangle className="h-4 w-4" /> Confirmar cancelamento
            </Button>
          </>
        }
      >
        <TextAreaField
          label="Motivo *"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="Informe o motivo"
          rows={3}
          required
        />
      </BottomSheet>

      {/* ═══════ RECUSAR PEDIDO (motivo opcional) ═══════ */}
      <BottomSheet
        open={!!rejectTarget}
        onOpenChange={(o) => { if (!o) setRejectTarget(null); }}
        title="Recusar horário"
        description={rejectTarget ? `${rejectTarget.sessions?.name || "Sessão"} · ${participantName(rejectTarget)} · ${formatDayShort(rejectTarget.scheduled_date)} ${formatTime(rejectTarget.start_time)}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>Voltar</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!rejectTarget) return;
                const target = rejectTarget;
                setRejectTarget(null);
                await rejectPending(target, rejectReason);
              }}
            >
              <Ban className="h-4 w-4" /> Recusar
            </Button>
          </>
        }
      >
        <TextAreaField
          label="Motivo da recusa (opcional)"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Mentor indisponível"
          rows={3}
        />
      </BottomSheet>

      {/* ═══════ AGENDAR MANUALMENTE ═══════ */}
      <BottomSheet
        open={showManualModal}
        onOpenChange={setShowManualModal}
        title="Agendar manualmente"
        description="Crie uma sessão para um membro ou convidado. O término é calculado pela duração da sessão."
        locked={submittingBook}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowManualModal(false)} disabled={submittingBook}>Cancelar</Button>
            <Button
              onClick={handleManualBook}
              variant={manualConflict ? "destructive" : "default"}
              disabled={submittingBook || (manualIsGuest ? !manualGuestName.trim() : !manualLiberty) || !manualSession || !manualMentor || !manualTime || !manualDate}
            >
              {submittingBook ? "Agendando" : manualConflict ? "Forçar mesmo assim" : "Criar agendamento"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Participante</p>
            <div className="flex gap-2" role="group" aria-label="Tipo de participante">
              <Chip active={!manualIsGuest} onClick={() => { setManualIsGuest(false); setManualGuestName(""); }}>Membro da plataforma</Chip>
              <Chip active={manualIsGuest} onClick={() => { setManualIsGuest(true); setManualLiberty(""); setLibertySearch(""); }}>Convidado externo</Chip>
            </div>
            {!manualIsGuest ? (
              <div className="relative">
                <Search className="absolute left-3 top-[38px] -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
                <TextField
                  label="Membro"
                  value={libertySearch}
                  onChange={(e) => { setLibertySearch(e.target.value); setManualLiberty(""); }}
                  placeholder="Buscar membro por nome"
                  className="pl-10"
                  hint={manualLiberty ? "Membro selecionado" : undefined}
                  autoComplete="off"
                />
                {libertySearch && !manualLiberty && (
                  <SectionCard padding="none" className="mt-1 max-h-44 overflow-y-auto" role="listbox" aria-label="Resultados">
                    {filteredMembers.map((m, i) => (
                      <ListRow
                        key={m.id}
                        last={i === filteredMembers.length - 1}
                        onPress={() => { setManualLiberty(m.id); setLibertySearch(shortName(m.full_name)); }}
                        leading={<UserAvatar name={m.full_name} avatarUrl={m.avatar_url} size={28} />}
                        title={shortName(m.full_name)}
                        className="min-h-[44px]"
                      />
                    ))}
                    {filteredMembers.length === 0 && <p className="px-4 py-3 text-xs text-muted-foreground">Nenhum membro encontrado</p>}
                  </SectionCard>
                )}
              </div>
            ) : (
              <TextField
                label="Convidado"
                value={manualGuestName}
                onChange={(e) => setManualGuestName(e.target.value)}
                placeholder="Nome completo do convidado"
                maxLength={120}
              />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField label="Sessão" value={manualSession} onChange={(e) => { setManualSession(e.target.value); setManualMentor(""); setManualConflict(null); }}>
              <option value="">Selecione</option>
              {sessionsCatalog.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </SelectField>
            <SelectField label="Mentor" value={manualMentor} onChange={(e) => { setManualMentor(e.target.value); setManualConflict(null); }}>
              <option value="">Selecione</option>
              {mentorsForSession.map((m) => (
                <option key={m.id} value={m.id}>{shortName(m.full_name)}</option>
              ))}
            </SelectField>
            <TextField label="Data" type="date" value={manualDate} onChange={(e) => { setManualDate(e.target.value); setManualConflict(null); }} />
            <TextField
              label="Horário (início)"
              type="time"
              value={manualTime}
              onChange={(e) => { setManualTime(e.target.value); setManualConflict(null); }}
              hint={`Duração: ${formatDuration(manualSessionInfo?.duration_minutes)}${manualEndTime ? ` · fim às ${manualEndTime}` : ""}`}
            />
            <SelectField
              containerClassName="sm:col-span-2"
              label="Status inicial"
              value={manualStatus}
              onChange={(e) => setManualStatus(e.target.value as "scheduled" | "completed")}
              hint={manualStatus === "completed" ? "Conta como realizada na jornada, não exige relatório e não vai para o Google Calendar." : undefined}
            >
              <option value="scheduled">Agendada</option>
              <option value="completed">Realizada (registro histórico)</option>
            </SelectField>
            <TextAreaField
              containerClassName="sm:col-span-2"
              label="Observações"
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              placeholder="Opcional"
              rows={3}
            />
          </div>

          {manualConflict && (
            <Callout tone="warning" icon={AlertTriangle} title="Conflito de horário">{manualConflict}</Callout>
          )}
        </div>
      </BottomSheet>

      {/* ═══════ EDITAR DISPONIBILIDADE ═══════ */}
      <BottomSheet
        open={!!slotEdit}
        onOpenChange={(o) => { if (!o) setSlotEdit(null); }}
        title="Editar disponibilidade"
        description={slotEdit ? getMentorName(slotEdit.mentor_id) : undefined}
        size="sm"
        footer={
          slotEdit ? (
            <>
              <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => { setSlotDelete(slotEdit); setSlotEdit(null); }}>
                <Trash2 className="h-4 w-4" /> Excluir
              </Button>
              <Button onClick={() => saveSlot(slotEdit, slotEditDate, slotEditStart, slotEditEnd)}>Salvar</Button>
            </>
          ) : undefined
        }
      >
        {slotEdit && (
          <div className="space-y-4">
            {slotEdit.is_recurring && (
              <Callout tone="warning" icon={AlertTriangle}>
                Este horário é recorrente semanal. Ao salvar, ele passa a valer apenas para a data escolhida.
              </Callout>
            )}
            <TextField label="Data" type="date" value={slotEditDate} onChange={(e) => setSlotEditDate(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Início" type="time" value={slotEditStart} onChange={(e) => { setSlotEditStart(e.target.value); setSlotEditEnd(addHours(e.target.value, 2)); }} />
              <TextField label="Fim" type="time" value={slotEditEnd} onChange={(e) => setSlotEditEnd(e.target.value)} />
            </div>
          </div>
        )}
      </BottomSheet>

      {/* ═══════ EXCLUIR DISPONIBILIDADE ═══════ */}
      <ConfirmDialog
        open={!!slotDelete}
        onOpenChange={(o) => { if (!o) setSlotDelete(null); }}
        title="Excluir disponibilidade?"
        description={
          slotDelete
            ? `${getMentorName(slotDelete.mentor_id)} · ${format(parseISO(slotDelete.date), "dd/MM/yyyy")} · ${formatTime(slotDelete.start_time)} às ${formatTime(slotDelete.end_time)}${slotDelete.is_recurring ? ". Este é um horário recorrente: excluir remove todas as semanas." : ""}`
            : undefined
        }
        confirmLabel="Excluir"
        destructive
        onConfirm={() => { if (slotDelete) deleteSlot(slotDelete); }}
      />

      {/* ═══════ NOVA DISPONIBILIDADE ═══════ */}
      <BottomSheet
        open={!!slotAddDate}
        onOpenChange={(o) => { if (!o) setSlotAddDate(null); }}
        title="Nova disponibilidade"
        description={slotAddDate ? format(parseISO(slotAddDate), "EEEE, dd/MM/yyyy", { locale: ptBR }) : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSlotAddDate(null)}>Cancelar</Button>
            <Button onClick={createSlot}><Plus className="h-4 w-4" /> Adicionar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectField label="Mentor" value={slotAddMentor} onChange={(e) => setSlotAddMentor(e.target.value)}>
            <option value="">Selecione</option>
            {allMentors.map((m) => <option key={m.id} value={m.id}>{shortName(m.full_name)}</option>)}
          </SelectField>
          <TextField
            label="Início (blocos de 2h)"
            type="time"
            value={slotAddStart}
            onChange={(e) => setSlotAddStart(e.target.value)}
            hint={`Término automático: ${addHours(slotAddStart, 2)}`}
          />
        </div>
      </BottomSheet>
    </AppLayout>
  );
};

export default AdminAgendaPage;
