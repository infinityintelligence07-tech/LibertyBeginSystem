import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
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

} from "lucide-react";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { shortName, initials as getInitials, matchesSearch } from "@/lib/formatName";
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, isToday, parseISO, getDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBookingsRealtime } from "@/hooks/useBookingsRealtime";
import { useSessionCatalog } from "@/hooks/useAdminData";
import { toast } from "sonner";
import { useDemoData } from "@/contexts/DemoDataContext";
import { demoBookingsForAdmin, demoLibertyProfiles, demoMentorProfiles, demoSessionsCatalog } from "@/lib/demoForUser";
import { getEffectiveBookingStatus, isVisibleSessionBooking } from "@/lib/bookingStatus";
import { bookingRuleErrorMessage } from "@/lib/bookingRules";

/* ───── Types ───── */
type SessionStatus = "scheduled" | "completed" | "rescheduled" | "cancelled" | "pending_approval" | "not_realized";
type ViewMode = "day" | "week" | "month";

interface MentorInfo {
  id: string;
  full_name: string;
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
  status: SessionStatus;
  zoom_join_url: string | null;
  zoom_link: string | null;
  observations: string | null;
  cancellation_reason: string | null;
  availability_id: string | null;
  liberty: { full_name: string; member_tier?: "begin" | "liberty" | null } | null;
  sessions: { name: string } | null;
}

/* ───── Constants ───── */
// 9 distinct hues, one per mentor (cycles only if >9 mentors)
const mentorColors = [
  { header: "bg-status-blue/15 border-b-2 border-status-blue", dot: "bg-status-blue", text: "text-status-blue", bg: "bg-status-blue/15 border-status-blue/50" },
  { header: "bg-status-green/15 border-b-2 border-status-green", dot: "bg-status-green", text: "text-status-green", bg: "bg-status-green/15 border-status-green/50" },
  { header: "bg-status-yellow/15 border-b-2 border-status-yellow", dot: "bg-status-yellow", text: "text-status-yellow", bg: "bg-status-yellow/15 border-status-yellow/50" },
  { header: "bg-destructive/15 border-b-2 border-destructive", dot: "bg-destructive", text: "text-destructive", bg: "bg-destructive/15 border-destructive/50" },
  { header: "bg-primary/15 border-b-2 border-primary/20", dot: "bg-primary", text: "text-primary", bg: "bg-primary/15 border-primary/50" },
  { header: "bg-[#a855f7]/15 border-b-2 border-[#a855f7]", dot: "bg-[#a855f7]", text: "text-[#a855f7]", bg: "bg-[#a855f7]/15 border-[#a855f7]/50" },
  { header: "bg-[#ec4899]/15 border-b-2 border-[#ec4899]", dot: "bg-[#ec4899]", text: "text-[#ec4899]", bg: "bg-[#ec4899]/15 border-[#ec4899]/50" },
  { header: "bg-[#06b6d4]/15 border-b-2 border-[#06b6d4]", dot: "bg-[#06b6d4]", text: "text-[#06b6d4]", bg: "bg-[#06b6d4]/15 border-[#06b6d4]/50" },
  { header: "bg-[#f97316]/15 border-b-2 border-[#f97316]", dot: "bg-[#f97316]", text: "text-[#f97316]", bg: "bg-[#f97316]/15 border-[#f97316]/50" },
];

const statusBg: Record<SessionStatus, string> = {
  scheduled: "bg-status-blue/10 border-status-blue/25",
  completed: "bg-status-green/10 border-status-green/25",
  rescheduled: "bg-status-yellow/10 border-status-yellow/30",
  cancelled: "bg-muted/40 border-border",
  pending_approval: "bg-status-yellow/10 border-status-yellow/30",
  not_realized: "bg-status-yellow/10 border-status-yellow/30",
};

const statusText: Record<SessionStatus, string> = {
  scheduled: "text-status-blue",
  completed: "text-status-green",
  rescheduled: "text-status-yellow",
  cancelled: "text-muted-foreground",
  pending_approval: "text-status-yellow",
  not_realized: "text-status-yellow",
};

const statusLabel: Record<SessionStatus, string> = {
  scheduled: "Agendada",
  completed: "Realizada",
  rescheduled: "Remarcada",
  cancelled: "Cancelada",
  pending_approval: "Aguardando aprovação",
  not_realized: "Não realizada",
};


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
    ["agenda-pending-approvals", "agenda-bookings", "agenda-not-realized", "notifications-bell"],
    "admin-agenda",
  );
  const { demoEnabled } = useDemoData();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedBooking, setSelectedBooking] = useState<BookingRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showMentorSwap, setShowMentorSwap] = useState(false);
  const [showDateChange, setShowDateChange] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [mentorFilter, setMentorFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SessionStatus | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [editStatus, setEditStatus] = useState<SessionStatus>("scheduled");

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
    const ms = startOfMonth(currentDate);
    const me = endOfMonth(currentDate);
    return { start: format(ms, "yyyy-MM-dd"), end: format(me, "yyyy-MM-dd") };
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
      const mentorUserIds = (roleRows ?? []).map((r: any) => r.user_id).filter(Boolean);
      if (mentorUserIds.length === 0) return [] as MentorInfo[];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
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
  const { data: _bookings = [] } = useQuery({
    queryKey: ["agenda-bookings", dateRange.start, dateRange.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, liberty:profiles!bookings_liberty_id_fkey(full_name, member_tier), sessions(name)")
        .gte("scheduled_date", dateRange.start)
        .lte("scheduled_date", dateRange.end)
        .order("scheduled_date", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data || []) as BookingRow[];
    },
  });

  // Pending-approval bookings (any date) — admin must approve or reject
  const { data: pendingBookings = [] } = useQuery({
    queryKey: ["agenda-pending-approvals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, liberty:profiles!bookings_liberty_id_fkey(full_name, member_tier), sessions(name)")
        .eq("status", "pending_approval" as any)
        .order("scheduled_date", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data || []) as BookingRow[];
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
        .select("*, liberty:profiles!bookings_liberty_id_fkey(full_name, member_tier), sessions(name)")
        .eq("status", "not_realized" as any)
        .order("scheduled_date", { ascending: false })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data || []) as BookingRow[];
    },
  });

  const approvePending = async (bk: BookingRow) => {
    const { error } = await supabase.from("bookings").update({ status: "scheduled" as any, approval_required: false }).eq("id", bk.id);
    if (error) { toast.error(bookingRuleErrorMessage(error) || "Erro ao aprovar"); return; }
    if (bk.availability_id) {
      await supabase.from("mentor_availability").update({ is_booked: true }).eq("id", bk.availability_id);
    }
    supabase.functions.invoke("google-calendar-sync", { body: { booking_id: bk.id } }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["agenda-pending-approvals"] });
    queryClient.invalidateQueries({ queryKey: ["agenda-bookings"] });
    queryClient.invalidateQueries({ queryKey: ["notifications-bell"] });
    toast.success("Sessão aprovada. Aluno e mentor foram notificados");
  };

  const rejectPending = async (bk: BookingRow, reason: string) => {
    const { error } = await supabase.from("bookings").update({
      status: "cancelled" as any,
      cancellation_reason: reason || "Mentor indisponível neste horário",
    }).eq("id", bk.id);
    if (error) { toast.error("Erro ao recusar"); return; }
    queryClient.invalidateQueries({ queryKey: ["agenda-pending-approvals"] });
    queryClient.invalidateQueries({ queryKey: ["agenda-bookings"] });
    queryClient.invalidateQueries({ queryKey: ["notifications-bell"] });
    toast.success("Horário recusado. Aluno foi notificado");
  };

  const reopenNotRealized = async (bk: BookingRow) => {
    const { error } = await supabase
      .from("bookings")
      .update({ status: "scheduled" as any, cancellation_reason: null })
      .eq("id", bk.id);
    if (error) { toast.error(bookingRuleErrorMessage(error) || "Erro ao reabrir sessão"); return; }
    queryClient.invalidateQueries({ queryKey: ["agenda-not-realized"] });
    queryClient.invalidateQueries({ queryKey: ["agenda-bookings"] });
    toast.success("Sessão reaberta na agenda");
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
    allAvailability.forEach((av: any) => {
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
        .select("id, full_name")
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
    if (!isVisibleSessionBooking(b)) return false;
    if (mentorFilter && b.mentor_id !== mentorFilter) return false;
    if (statusFilter && displayStatus(b) !== statusFilter) return false;
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
    [bookings, dateStr, mentorFilter, statusFilter, studentSearch]
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

  const displayStatus = (booking: BookingRow) => getEffectiveBookingStatus(booking) as SessionStatus;

  // Color per mentor (overrides status colors for visual identification)
  const mentorColorFor = (mentorId: string) => {
    const idx = mentorIndexMap[mentorId] ?? 0;
    return mentorColors[idx % mentorColors.length];
  };
  const bookingBg = (b: BookingRow) => {
    const c = mentorColorFor(b.mentor_id);
    const st = displayStatus(b);
    if (st === "cancelled") return "bg-muted/40 border-border opacity-60";
    // Aguardando aprovação nunca deve parecer confirmada na agenda.
    if (st === "pending_approval")
      return "bg-status-yellow/10 border-dashed border-status-yellow/60 opacity-90";
    return c.bg;
  };
  const bookingText = (b: BookingRow) =>
    displayStatus(b) === "pending_approval" ? "text-status-yellow" : mentorColorFor(b.mentor_id).text;

  // Edit actions (now hitting DB)
  const handleStatusChange = async (newStatus: SessionStatus) => {
    if (!selectedBooking) return;
    const { error } = await supabase.from("bookings").update({ status: newStatus }).eq("id", selectedBooking.id);
    if (error) { toast.error(bookingRuleErrorMessage(error) || "Erro ao atualizar status"); return; }
    setSelectedBooking({ ...selectedBooking, status: newStatus });
    setEditStatus(newStatus);
    queryClient.invalidateQueries({ queryKey: ["agenda-not-realized"] });
    queryClient.invalidateQueries({ queryKey: ["agenda-bookings"] });
  };

  const handleMentorSwap = async (newMentorId: string) => {
    if (!selectedBooking) return;
    const { error } = await supabase.from("bookings").update({ mentor_id: newMentorId }).eq("id", selectedBooking.id);
    if (error) { toast.error("Erro ao trocar mentor"); return; }
    setSelectedBooking({ ...selectedBooking, mentor_id: newMentorId });
    setShowMentorSwap(false);
    queryClient.invalidateQueries({ queryKey: ["agenda-not-realized"] });
    queryClient.invalidateQueries({ queryKey: ["agenda-bookings"] });
    toast.success("Mentor atualizado");
  };

  const handleDateTimeChange = async () => {
    if (!selectedBooking || !newTime) return;
    const [h, m] = newTime.split(":").map(Number);
    const totalMin = h * 60 + m + 90;
    const endH = Math.floor(totalMin / 60);
    const endM = totalMin % 60;
    const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
    const targetDate = newDate || dateStr;

    // Move the booking in-place — keep it as scheduled (don't mark as rescheduled/cancelled)
    const { error } = await supabase.from("bookings").update({
      start_time: newTime,
      end_time: endTime,
      scheduled_date: targetDate,
      status: "scheduled" as any,
    }).eq("id", selectedBooking.id);

    if (error) { toast.error(bookingRuleErrorMessage(error) || "Erro ao remarcar"); return; }
    supabase.functions.invoke("google-calendar-sync", { body: { booking_id: selectedBooking.id } }).catch(() => {});
    setShowDateChange(false);
    queryClient.invalidateQueries({ queryKey: ["agenda-not-realized"] });
    queryClient.invalidateQueries({ queryKey: ["agenda-bookings"] });
    toast.success("Sessão remarcada");
    setDrawerOpen(false);
  };

  const handleCancel = async () => {
    if (!selectedBooking || !cancelReason) return;
    const { error } = await supabase.from("bookings").update({
      status: "cancelled" as any,
      cancellation_reason: cancelReason,
    }).eq("id", selectedBooking.id);

    if (error) { toast.error("Erro ao cancelar"); return; }
    supabase.functions.invoke("google-calendar-sync", { body: { booking_id: selectedBooking.id } }).catch(() => {});
    setShowCancelModal(false);
    setCancelReason("");
    queryClient.invalidateQueries({ queryKey: ["agenda-not-realized"] });
    queryClient.invalidateQueries({ queryKey: ["agenda-bookings"] });
    toast.success("Sessão cancelada");
    setDrawerOpen(false);
  };


  const handleManualBook = async () => {
    if (submittingBook) return;
    const hasParticipant = manualIsGuest ? manualGuestName.trim().length > 0 : !!manualLiberty;
    if (!hasParticipant || !manualSession || !manualMentor || !manualTime || !manualDate) return;
    const [h, m] = manualTime.split(":").map(Number);
    const endM = m + 30;
    const endTime = `${String(endM >= 60 ? h + 2 : h + 1).padStart(2, "0")}:${String(endM % 60).padStart(2, "0")}`;

    // Conflict check: same mentor on the same day with overlapping slot
    setSubmittingBook(true);
    setManualConflict(null);
    const { data: sameDay } = await supabase
      .from("bookings")
      .select("id, start_time, end_time, status, liberty_id, guest_name")
      .eq("mentor_id", manualMentor)
      .eq("scheduled_date", manualDate)
      .neq("status", "cancelled");

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
        `Este mentor já tem uma sessão das ${(overlap.start_time || "").slice(0, 5)} às ${(overlap.end_time || "").slice(0, 5)} neste dia. Clique novamente em "Agendar" para forçar mesmo assim.`
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
      status: manualStatus as any,
    }).select("id").single();

    if (error) { setSubmittingBook(false); toast.error(bookingRuleErrorMessage(error) || "Erro ao agendar: " + (error.message || "verifique permissões")); console.error("Booking insert error:", error); return; }
    if (createdBk?.id) {
      supabase.functions.invoke("google-calendar-sync", { body: { booking_id: createdBk.id } }).catch(() => {});
    }

    setShowManualModal(false);
    setManualLiberty(""); setManualGuestName(""); setManualIsGuest(false);
    setManualSession(""); setManualMentor("");
    setManualTime("09:00"); setManualNotes(""); setLibertySearch(""); setManualDate("");
    setManualStatus("scheduled"); setManualConflict(null);
    queryClient.invalidateQueries({ queryKey: ["agenda-bookings"] });
    toast.success(manualStatus === "completed" ? "Sessão registrada como realizada" : "Sessão agendada com sucesso");
    setSubmittingBook(false);
  };

  const openDrawer = (booking: BookingRow) => {
    const effectiveStatus = displayStatus(booking);
    setSelectedBooking({ ...booking, status: effectiveStatus });
    setEditStatus(effectiveStatus);
    setDrawerOpen(true);
  };

  // Auto-open drawer when navigated with ?booking=<id> (e.g. from notifications bell)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const bookingId = searchParams.get("booking");
    if (!bookingId || drawerOpen) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("bookings")
        .select("*, liberty:profiles!bookings_liberty_id_fkey(full_name, member_tier), sessions(name)")
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

  // Reminder link panel state
  const [showReminders, setShowReminders] = useState(false);
  const reminderLink = `${window.location.origin}/mentor/disponibilidade`;

  const copyReminderLink = (mentorName?: string) => {
    const message = mentorName
      ? `Olá ${shortName(mentorName)}! Lembre-se de cadastrar sua disponibilidade na plataforma Liberty Begin: ${reminderLink}`
      : reminderLink;
    navigator.clipboard.writeText(message);
    toast.success("Link copiado!", { description: mentorName ? "Mensagem pronta para enviar." : undefined });
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

  return (
    <AppLayout role="admin">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
        {/* Header */}
        <motion.div variants={fadeUpItem} className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Agenda Geral</h1>
            <p className="text-muted-foreground text-sm mt-1 flex items-center gap-3 flex-wrap">
              <span className="capitalize">{headerLabel}</span>
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-status-blue/10 text-status-blue border border-border font-medium">
                {totalInRange} sessões
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View mode toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(["day", "week", "month"] as ViewMode[]).map((vm) => (
                <button
                  key={vm}
                  onClick={() => setViewMode(vm)}
                  className={`text-[11px] px-3 py-1.5 font-medium transition-colors ${
                    viewMode === vm ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {vm === "day" ? "Hoje" : vm === "week" ? "Semana" : "Mês"}
                </button>
              ))}
            </div>
            <button onClick={() => setShowReminders((v) => !v)} className="text-xs px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors flex items-center gap-1.5">
              <LinkIcon className="h-3.5 w-3.5" /> Lembretes
            </button>
            <button onClick={() => setShowManualModal(true)} className="btn-silver text-xs px-4 py-2 flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Agendar
            </button>
            <div className="flex items-center gap-1">
              <button onClick={navigatePrev} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5 rounded-lg transition-colors">
                Hoje
              </button>
              <button onClick={navigateNext} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Aprovações pendentes: sessões pedidas com menos de 48h */}
        {pendingBookings.length > 0 && (
          <motion.div variants={fadeUpItem} className="glass-card p-4 border border-status-yellow/30" style={{ transform: "none" }}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-status-yellow" />
              <h2 className="text-sm font-semibold text-foreground">
                Aguardando aprovação <span className="text-muted-foreground font-normal">({pendingBookings.length})</span>
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Sessões pedidas com menos de 48h de antecedência. Confirme com o mentor a disponibilidade antes de aprovar.
            </p>
            <div className="space-y-2">
              {pendingBookings.map((bk) => (
                <div key={bk.id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-border bg-card p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {bk.sessions?.name || "Sessão"} <span className="text-muted-foreground font-normal">· {bk.liberty?.full_name || bk.guest_name || "Aluno"}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {format(parseISO(bk.scheduled_date), "EEE, dd/MM", { locale: ptBR })} · {formatTime(bk.start_time)}–{formatTime(bk.end_time)} · Mentor: {getMentorName(bk.mentor_id)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => approvePending(bk)}
                      className="px-3 py-1.5 rounded-md text-xs font-medium bg-status-green/15 text-status-green border border-status-green/30 hover:bg-status-green/25 transition-colors flex items-center gap-1.5"
                    >
                      <Check className="h-3.5 w-3.5" /> Aprovar
                    </button>
                    <button
                      onClick={() => {
                        const reason = window.prompt("Motivo da recusa (opcional):", "Mentor indisponível");
                        if (reason !== null) rejectPending(bk, reason);
                      }}
                      className="px-3 py-1.5 rounded-md text-xs font-medium bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20 transition-colors flex items-center gap-1.5"
                    >
                      <Ban className="h-3.5 w-3.5" /> Recusar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}


        {/* Not realized sessions reported by mentors */}
        {notRealizedBookings.length > 0 && (
          <motion.div variants={fadeUpItem} className="glass-card p-4 border border-status-yellow/30" style={{ transform: "none" }}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-status-yellow" />
              <h2 className="text-sm font-semibold text-foreground">
                Sessões marcadas como não realizadas <span className="text-muted-foreground font-normal">({notRealizedBookings.length})</span>
              </h2>
            </div>
            <div className="space-y-2">
              {notRealizedBookings.map((bk) => (
                <div key={bk.id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-status-yellow/20 bg-status-yellow/5 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {bk.sessions?.name || "Sessão"} <span className="text-muted-foreground font-normal">· {bk.liberty?.full_name || bk.guest_name || "Aluno"}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {format(parseISO(bk.scheduled_date), "EEE, dd/MM", { locale: ptBR })} · {formatTime(bk.start_time)}–{formatTime(bk.end_time)} · Mentor: {getMentorName(bk.mentor_id)}
                    </p>
                    {bk.cancellation_reason && (
                      <p className="text-[11px] text-status-yellow mt-1 truncate">Motivo: {bk.cancellation_reason}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openDrawer({ ...bk, status: "not_realized" })}
                      className="px-3 py-1.5 rounded-md text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                    >
                      Gerenciar
                    </button>
                    <button
                      onClick={() => reopenNotRealized(bk)}
                      className="px-3 py-1.5 rounded-md text-xs font-medium bg-status-blue/15 text-status-blue border border-status-blue/30 hover:bg-status-blue/25 transition-colors"
                    >
                      Reabrir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Filters row: mentor + status + student search */}
        <motion.div variants={fadeUpItem} className="space-y-2">
          {/* Mentor chips */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setMentorFilter(null)}
              className={`text-[10px] px-3 py-1.5 rounded-full border transition-colors font-medium ${
                mentorFilter === null ? "bg-primary text-primary-foreground border-primary/20" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos os mentores ({allMentors.length})
            </button>
            {allMentors.map((m, i) => (
              <button
                key={m.id}
                onClick={() => setMentorFilter(mentorFilter === m.id ? null : m.id)}
                className={`text-[10px] px-3 py-1.5 rounded-full border transition-colors font-medium flex items-center gap-1.5 ${
                  mentorFilter === m.id ? "bg-primary text-primary-foreground border-primary/20" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${mentorColors[i % mentorColors.length].dot}`} />
                {shortName(m.full_name)}
              </button>
            ))}
          </div>

          {/* Status chips + student search + clear */}
          <div className="flex gap-2 flex-wrap items-center">
            {(["scheduled", "pending_approval", "completed", "not_realized", "cancelled"] as SessionStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? null : s)}
                className={`text-[10px] px-3 py-1.5 rounded-full border transition-colors font-medium ${
                  statusFilter === s ? "bg-primary text-primary-foreground border-primary/20" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {statusLabel[s]}
              </button>
            ))}
            <div className="relative flex-1 min-w-[180px] max-w-[260px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Buscar aluno..."
                className="w-full text-[11px] pl-8 pr-3 py-1.5 rounded-full border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
              />
            </div>
            {hasActiveFilters && (
              <button
                onClick={() => { setMentorFilter(null); setStatusFilter(null); setStudentSearch(""); }}
                className="text-[10px] px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground flex items-center gap-1.5"
              >
                <X className="h-3 w-3" /> Limpar filtros
              </button>
            )}
          </div>
        </motion.div>


        {/* Reminders panel */}
        <AnimatePresence>
          {showReminders && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="glass-card p-5 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      Lembretes de disponibilidade
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Copie o link e envie para o mentor lembrá-lo de cadastrar a disponibilidade.
                    </p>
                  </div>
                  <button
                    onClick={() => copyReminderLink()}
                    className="text-[10px] px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/5 transition-colors flex items-center gap-1.5"
                  >
                    <Copy className="h-3 w-3" />
                    Copiar link genérico
                  </button>
                </div>

                {mentorsWithoutAvailability.length > 0 && (
                  <div className="rounded-lg border border-status-yellow/20 bg-status-yellow/5 p-3">
                    <p className="text-[11px] font-semibold text-status-yellow mb-2">
                      {mentorsWithoutAvailability.length} mentor{mentorsWithoutAvailability.length !== 1 ? "es" : ""} sem disponibilidade no período
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {mentorsWithoutAvailability.map((m) => (
                        <div key={m.id} className="flex items-center justify-between p-2 rounded-lg bg-card border border-border">
                          <span className="text-xs text-foreground truncate">{shortName(m.full_name)}</span>
                          <button
                            onClick={() => copyReminderLink(m.full_name)}
                            className="text-[10px] px-2 py-1 rounded border border-primary/30 text-primary hover:bg-primary/5 flex items-center gap-1 shrink-0 ml-2"
                          >
                            <Copy className="h-2.5 w-2.5" /> Copiar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Todos os mentores</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {allMentors.map((m) => (
                      <div key={m.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border">
                        <span className="text-xs text-foreground truncate">{shortName(m.full_name)}</span>
                        <button
                          onClick={() => copyReminderLink(m.full_name)}
                          className="text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/30 flex items-center gap-1 shrink-0 ml-2"
                        >
                          <Copy className="h-2.5 w-2.5" /> Copiar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══════ DAY VIEW ═══════ */}
        {viewMode === "day" && (
          <>
            {/* Desktop grid */}
            <motion.div variants={fadeUpItem} className="hidden lg:block glass-card overflow-auto" style={{ transform: "none" }}>
              {(() => {
                const ROW_H = 22; // px per 30 min (compact)
                const totalH = hours.length * ROW_H;
                const HEADER_H = 56;
                const TIME_COL_W = 48;
                const MIN_COL_W = 110;
                return (
                  <div className="relative" style={{ minWidth: TIME_COL_W + filteredMentorIds.length * MIN_COL_W }}>
                    <div className="flex">
                      {/* Sticky time column */}
                      <div
                        className="sticky left-0 z-20 bg-card shrink-0"
                        style={{ width: TIME_COL_W }}
                      >
                        {/* Header spacer */}
                        <div
                          className="bg-muted/10 sticky top-0 z-10"
                          style={{ height: HEADER_H }}
                        />
                        {/* Hour labels */}
                        {hours.map((hour) => (
                          <div
                            key={hour}
                            className="text-[9px] text-muted-foreground/70 tabular-nums text-right pr-1.5 flex items-start justify-end"
                            style={{ height: ROW_H }}
                          >
                            {hour.endsWith(":00") ? hour : ""}
                          </div>
                        ))}
                      </div>

                      {/* Mentor columns */}
                      <div className="flex-1 flex">
                        {filteredMentorIds.map((mId) => {
                          const idx = mentorIndexMap[mId] ?? 0;
                          const mentor = allMentors.find((m) => m.id === mId);
                          const color = mentorColors[idx % mentorColors.length];
                          const colBookings = dayBookings.filter((b) => b.mentor_id === mId);
                          const colSlots = availability.filter((a) => a.mentor_id === mId);
                          return (
                            <div
                              key={mId}
                              className="flex-1 border-l border-border/30 relative"
                              style={{ minWidth: MIN_COL_W }}
                            >
                              {/* Sticky mentor header */}
                              <div
                                className={`sticky top-0 z-10 text-center ${color.header}`}
                                style={{ height: HEADER_H }}
                              >
                                <div className="pt-1.5 flex flex-col items-center">
                                  <div className={`w-6 h-6 rounded-full ${color.dot} flex items-center justify-center text-[9px] font-bold text-background`}>
                                    {mentor ? getInitials(mentor.full_name) : "?"}
                                  </div>
                                  <span className="text-[10px] font-semibold text-foreground mt-0.5 leading-tight">
                                    {mentor ? shortName(mentor.full_name) : "Sem dados"}
                                  </span>
                                </div>
                              </div>
                              {/* Time grid background — subtle hour marks only */}
                              <div
                                className="relative"
                                style={{
                                  height: totalH,
                                  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${ROW_H * 2 - 1}px, hsl(var(--border) / 0.18) ${ROW_H * 2 - 1}px, hsl(var(--border) / 0.18) ${ROW_H * 2}px)`,
                                }}
                              >
                                {/* Available slots */}
                                {colSlots.map((slot, i) => {
                                  const top = timeToRow(slot.start_time) * ROW_H;
                                  const h = getSessionSpan(slot.start_time, slot.end_time) * ROW_H;
                                  // skip if overlapped by booking
                                  const overlaps = colBookings.some(
                                    (b) => timeToRow(b.start_time) < timeToRow(slot.end_time) && timeToRow(b.end_time) > timeToRow(slot.start_time)
                                  );
                                  if (overlaps) return null;
                                  return (
                                    <div
                                      key={`slot-${i}`}
                                      className="absolute left-0.5 right-0.5 rounded-lg border border-dashed border-status-green/35 bg-status-green/5 hover:bg-status-green/10 hover:border-status-green/55 transition-colors group"
                                      style={{ top, height: h - 2 }}
                                    >
                                      <button
                                        onClick={() => openBookingFromSlot(mId, dateStr, slot.start_time)}
                                        className="absolute inset-0 flex items-center justify-center px-1"
                                        title="Clique para agendar neste horário"
                                      >
                                        <span className="text-[9px] text-status-green/70 tabular-nums group-hover:text-status-green text-center">
                                          {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                                        </span>
                                      </button>
                                      <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); openSlotEdit(slot); }}
                                          title="Editar disponibilidade"
                                          className="p-0.5 rounded bg-card border border-border text-muted-foreground hover:text-primary"
                                        >
                                          <Pencil className="h-2.5 w-2.5" />
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setSlotDelete(slot); }}
                                          title="Excluir disponibilidade"
                                          className="p-0.5 rounded bg-card border border-border text-muted-foreground hover:text-destructive"
                                        >
                                          <X className="h-2.5 w-2.5" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}

                                {/* Bookings */}
                                {colBookings.map((b) => {
                                  const top = timeToRow(b.start_time) * ROW_H;
                                  const h = getSessionSpan(b.start_time, b.end_time) * ROW_H;
                                  return (
                                    <button
                                      key={b.id}
                                      onClick={() => openDrawer(b)}
                                      className={`absolute left-0.5 right-0.5 rounded-md border px-1.5 py-1 text-left transition-all hover:brightness-125 cursor-pointer overflow-hidden ${bookingBg(b)}`}
                                      style={{ top, height: h - 2 }}
                                    >
                                      <p className={`text-[9px] font-medium tabular-nums leading-tight ${bookingText(b)}`}>
                                        {formatTime(b.start_time)}–{formatTime(b.end_time)}
                                      </p>
                                       <p className="text-[10px] font-medium text-foreground truncate leading-tight">
                                         {displayStatus(b) === "pending_approval" ? "⏳ " : ""}
                                         {(b.liberty ? shortName(b.liberty.full_name) : (b.guest_name || "Sem dados"))}
                                       </p>
                                       {displayStatus(b) === "pending_approval" && h >= 34 && (
                                         <p className="text-[9px] text-status-yellow truncate leading-tight">Aguardando confirmação</p>
                                       )}
                                      {h >= 50 && (
                                        <p className="text-[9px] text-muted-foreground truncate leading-tight">{b.sessions?.name || "Sem dados"}</p>
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
            </motion.div>

            {/* Mobile list */}
            <motion.div variants={fadeUpItem} className="lg:hidden space-y-3">
              {hours.map((hour) => {
                const hourBookings = dayBookings.filter((b) => formatTime(b.start_time) === hour && filteredMentorIds.includes(b.mentor_id));
                const hourSlots = availability.filter((a) => formatTime(a.start_time) === hour && filteredMentorIds.includes(a.mentor_id));
                if (hourBookings.length === 0 && hourSlots.length === 0) return null;
                return (
                  <div key={hour}>
                    <p className="text-xs text-muted-foreground mb-2 font-medium tabular-nums">{hour}</p>
                    <div className="space-y-2">
                      {hourBookings.map((b) => {
                        const idx = mentorIndexMap[b.mentor_id] ?? 0;
                        return (
                          <button key={b.id} onClick={() => openDrawer(b)} className={`glass-card p-4 w-full text-left border ${bookingBg(b)}`} style={{ transform: "none" }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${mentorColors[idx % mentorColors.length].header}`}>{getMentorName(b.mentor_id)}</span>
                              <span className={`text-[10px] font-medium ${statusText[displayStatus(b)]}`}>● {statusLabel[displayStatus(b)]}</span>
                            </div>
                            <p className="text-sm font-medium text-foreground">{(b.liberty ? shortName(b.liberty.full_name) : (b.guest_name || "Sem dados"))}</p>
                            <p className="text-xs text-muted-foreground">{b.sessions?.name || "Sem dados"} · {formatTime(b.start_time)}–{formatTime(b.end_time)}</p>
                          </button>
                        );
                      })}
                      {hourSlots.map((sl, i) => (
                        <div
                          key={`slot-${i}`}
                          className="glass-card p-3 w-full border border-dashed border-status-green/40 bg-status-green/10 flex items-center gap-2"
                          style={{ transform: "none" }}
                        >
                          <button onClick={() => openBookingFromSlot(sl.mentor_id, dateStr, sl.start_time)} className="flex-1 text-left">
                            <span className="text-xs text-status-green/70">{getMentorName(sl.mentor_id)} · {formatTime(sl.start_time)}–{formatTime(sl.end_time)} · Disponível · Toque p/ agendar</span>
                          </button>
                          <button onClick={() => openSlotEdit(sl)} title="Editar" className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-primary">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setSlotDelete(sl)} title="Excluir" className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}

                    </div>
                  </div>
                );
              })}
            </motion.div>
          </>
        )}

        {/* ═══════ WEEK VIEW ═══════ */}
        {viewMode === "week" && (
          <motion.div variants={fadeUpItem} className="glass-card overflow-auto" style={{ transform: "none" }}>
            <div className="grid grid-cols-7 min-w-[700px]">
              {/* Day headers */}
              {weekDays.map((day) => (
                <div key={day.toISOString()} className={`p-3 border-b border-r border-border text-center ${isToday(day) ? "bg-primary/5" : "bg-muted/20"}`}>
                  <p className="text-[10px] text-muted-foreground uppercase">{format(day, "EEE", { locale: ptBR })}</p>
                  <p className={`text-lg font-semibold ${isToday(day) ? "text-primary" : "text-foreground"}`}>{format(day, "dd")}</p>
                </div>
              ))}
              {/* Day cells */}
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
                    className={`group/cell relative border-r border-b border-border p-2 min-h-[200px] transition-colors ${isToday(day) ? "bg-primary/[0.02]" : ""} ${isDropTarget ? "bg-status-green/10 ring-2 ring-inset ring-status-green/50" : ""}`}
                  >
                    {dayBks.length === 0 && dayAvail.length === 0 && (
                      <p className="text-[10px] text-muted-foreground/40 text-center mt-8">Sem sessões</p>
                    )}
                    <div className="space-y-1.5">
                      {dayBks.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => openDrawer(b)}
                          className={`w-full rounded-lg border p-2 text-left transition-all hover:brightness-125 ${bookingBg(b)}`}
                        >
                          <p className={`text-[9px] font-medium tabular-nums ${bookingText(b)}`}>{formatTime(b.start_time)}–{formatTime(b.end_time)}</p>
                          <p className="text-[10px] font-medium text-foreground truncate">{(b.liberty ? shortName(b.liberty.full_name) : (b.guest_name || "Sem dados"))}</p>
                          <p className="text-[9px] text-muted-foreground truncate">{getMentorName(b.mentor_id)} · {b.sessions?.name || "Sem dados"}</p>
                        </button>
                      ))}
                      {dayAvail.map((sl, i) => (
                        <div
                          key={`av-${i}`}
                          draggable
                          onDragStart={() => setDraggingSlot(sl)}
                          onDragEnd={() => { setDraggingSlot(null); setDragOverDay(null); }}
                          className={`group/slot relative w-full rounded-lg border border-dashed border-status-green/40 bg-status-green/10 p-1.5 hover:bg-status-green/15 transition-colors cursor-grab active:cursor-grabbing ${draggingSlot?.id === sl.id && draggingSlot?.date === sl.date ? "opacity-40" : ""}`}
                          title="Arraste para outro dia para mover"
                        >
                          <button onClick={() => openBookingFromSlot(sl.mentor_id, sl.date, sl.start_time)} className="w-full text-left pr-9">
                            <p className="text-[9px] tabular-nums text-status-green/70">{formatTime(sl.start_time)}–{formatTime(sl.end_time)}</p>
                            <p className="text-[9px] text-muted-foreground truncate">{getMentorName(sl.mentor_id)}</p>
                          </button>
                          <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover/slot:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); openSlotEdit(sl); }}
                              title="Editar disponibilidade"
                              className="p-0.5 rounded bg-card border border-border text-muted-foreground hover:text-primary"
                            >
                              <Pencil className="h-2.5 w-2.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setSlotDelete(sl); }}
                              title="Excluir disponibilidade"
                              className="p-0.5 rounded bg-card border border-border text-muted-foreground hover:text-destructive"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={() => { setSlotAddDate(ds); setSlotAddMentor(mentorFilter || allMentors[0]?.id || ""); setSlotAddStart("07:00"); }}
                        className="w-full rounded-lg border border-dashed border-border py-1 text-[9px] text-muted-foreground hover:text-status-green hover:border-status-green/40 transition-colors opacity-0 group-hover/cell:opacity-100 flex items-center justify-center gap-1"
                      >
                        <Plus className="h-2.5 w-2.5" /> disponibilidade
                      </button>
                    </div>
                  </div>
                );
              })}

            </div>
          </motion.div>
        )}

        {/* ═══════ MONTH VIEW ═══════ */}
        {viewMode === "month" && (
          <motion.div variants={fadeUpItem} className="glass-card overflow-auto" style={{ transform: "none" }}>
            <div className="grid grid-cols-7 min-w-[600px]">
              {/* Weekday headers */}
              {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
                <div key={d} className="p-2 border-b border-border text-center text-[10px] font-semibold text-muted-foreground uppercase bg-muted/20">{d}</div>
              ))}
              {/* Calendar cells */}
              {monthDays.map((day) => {
                const dayBks = bookingsForDate(day);
                const dayAvail = availabilityForDate(day);
                const inMonth = isSameMonth(day, currentDate);
                const ds = format(day, "yyyy-MM-dd");
                const isDropTarget = draggingSlot && dragOverDay === ds && draggingSlot.date !== ds;
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => { setCurrentDate(day); setViewMode("day"); }}
                    onDragOver={(e) => { if (draggingSlot) { e.preventDefault(); setDragOverDay(ds); } }}
                    onDragLeave={() => setDragOverDay((d) => (d === ds ? null : d))}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggingSlot) moveSlotToDate(draggingSlot, ds);
                      setDraggingSlot(null);
                      setDragOverDay(null);
                    }}
                    className={`border-r border-b border-border p-2 min-h-[80px] text-left transition-colors hover:bg-muted/30 ${
                      !inMonth ? "opacity-30" : ""
                    } ${isToday(day) ? "bg-primary/5" : ""} ${isDropTarget ? "bg-status-green/10 ring-2 ring-inset ring-status-green/50" : ""}`}
                  >

                    <div className="flex items-center justify-between mb-1">
                      <p className={`text-xs font-medium ${isToday(day) ? "text-primary" : "text-foreground"}`}>{format(day, "d")}</p>
                      {dayAvail.length > 0 && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-status-green/10 text-status-green border border-border tabular-nums">
                          {dayAvail.length} disp.
                        </span>
                      )}
                    </div>
                    {dayBks.length > 0 && (
                      <div className="space-y-0.5">
                        {dayBks.slice(0, 3).map((b) => (
                          <div key={b.id} className={`text-[8px] px-1.5 py-0.5 rounded truncate ${bookingBg(b)} border`}>
                            <span className={bookingText(b)}>{formatTime(b.start_time)}</span>
                            <span className="text-foreground ml-1">{(b.liberty ? shortName(b.liberty.full_name).split(" ")[0] : (b.guest_name?.split(" ")[0] || "Sem dados"))}</span>
                          </div>
                        ))}
                        {dayBks.length > 3 && (
                          <p className="text-[8px] text-muted-foreground text-center">+{dayBks.length - 3} mais</p>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* ═══════ SESSION DRAWER ═══════ */}
      <AnimatePresence>
        {drawerOpen && selectedBooking && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40"
              onClick={() => { setDrawerOpen(false); setShowMentorSwap(false); setShowDateChange(false); setShowCancelModal(false); }}
            />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 overflow-y-auto"
            >
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-foreground">Gerenciar Sessão</h2>
                  <button onClick={() => { setDrawerOpen(false); setShowMentorSwap(false); setShowDateChange(false); setShowCancelModal(false); }} className="p-2 hover:bg-muted rounded-lg transition-colors">
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-foreground">
                      {selectedBooking.liberty ? getInitials(selectedBooking.liberty.full_name) : (selectedBooking.guest_name ? getInitials(selectedBooking.guest_name) : "?")}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{selectedBooking.liberty ? shortName(selectedBooking.liberty.full_name) : (selectedBooking.guest_name || "Sem dados")}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedBooking.liberty
                          ? (selectedBooking.liberty.member_tier === "liberty" ? "Liberty" : "Liberty Begin")
                          : "Convidado"}
                      </p>
                    </div>
                  </div>

                  <div className="glass-card p-4 space-y-3" style={{ transform: "none" }}>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Sessão</span>
                      <span className="text-foreground font-medium">{selectedBooking.sessions?.name || "Sem dados"}</span>
                    </div>
                    <div className="border-t border-border" />
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Mentor</span>
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-medium">{getMentorName(selectedBooking.mentor_id)}</span>
                        <button onClick={() => setShowMentorSwap(true)} className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                          Trocar
                        </button>
                      </div>
                    </div>
                    <div className="border-t border-border" />
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Data</span>
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-medium">{format(new Date(selectedBooking.scheduled_date + "T12:00:00"), "dd/MM/yyyy")}</span>
                        <button onClick={() => setShowDateChange(true)} className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                          Alterar
                        </button>
                      </div>
                    </div>
                    <div className="border-t border-border" />
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Horário</span>
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-medium tabular-nums">{formatTime(selectedBooking.start_time)} – {formatTime(selectedBooking.end_time)}</span>
                        <button onClick={() => setShowDateChange(true)} className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                          Alterar
                        </button>
                      </div>
                    </div>
                    <div className="border-t border-border" />
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <select
                        value={editStatus}
                        onChange={(e) => handleStatusChange(e.target.value as SessionStatus)}
                        className="bg-card border border-border rounded-lg px-2 py-1 text-xs text-foreground focus:border-primary/20 focus:outline-none"
                      >
                        <option value="scheduled">Agendada</option>
                        <option value="completed">Realizada</option>
                        <option value="rescheduled">Remarcada</option>
                        <option value="not_realized">Não realizada</option>
                        <option value="cancelled">Cancelada</option>
                      </select>
                    </div>
                  </div>

                  {selectedBooking.observations && (
                    <div className="glass-card p-3" style={{ transform: "none" }}>
                      <p className="text-[10px] text-muted-foreground mb-1">Observações</p>
                      <p className="text-xs text-foreground">{selectedBooking.observations}</p>
                    </div>
                  )}

                  {selectedBooking.cancellation_reason && (
                    <div className="border border-border rounded-lg p-3 bg-destructive/5">
                      <p className="text-[10px] text-destructive mb-1">Motivo</p>
                      <p className="text-xs text-foreground">{selectedBooking.cancellation_reason}</p>
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <button onClick={() => setShowDateChange(true)} className="w-full py-2.5 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors flex items-center justify-center gap-2">
                      <RefreshCw className="h-3.5 w-3.5" /> Remarcar
                    </button>
                    {selectedBooking.status !== "cancelled" && (
                      <button onClick={() => setShowCancelModal(true)} className="w-full py-2.5 border border-border rounded-lg text-sm text-destructive hover:bg-destructive/5 transition-colors flex items-center justify-center gap-2">
                        <Ban className="h-3.5 w-3.5" /> Cancelar sessão
                      </button>
                    )}
                    {(selectedBooking.zoom_join_url || selectedBooking.zoom_link) && (
                      <a href={selectedBooking.zoom_join_url || selectedBooking.zoom_link || "#"} target="_blank" rel="noopener noreferrer" className="w-full py-2.5 border border-border rounded-lg text-sm text-status-blue hover:bg-status-blue/5 transition-colors flex items-center justify-center gap-2">
                        <Video className="h-3.5 w-3.5" /> Abrir Zoom
                      </a>
                    )}
                  </div>
                </div>

                {/* Mentor Swap */}
                <AnimatePresence>
                  {showMentorSwap && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="border border-primary/20 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-foreground">Trocar mentor</h3>
                          <button onClick={() => setShowMentorSwap(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                        </div>
                        <div className="space-y-2">
                          {allMentors.map((m) => {
                            const isCurrent = m.id === selectedBooking.mentor_id;
                            return (
                              <button
                                key={m.id}
                                onClick={() => handleMentorSwap(m.id)}
                                disabled={isCurrent}
                                className={`w-full p-3 rounded-lg border text-left flex items-center justify-between transition-all ${
                                  isCurrent ? "border-primary/30 bg-primary/5 opacity-60 cursor-not-allowed" : "border-border hover:border-primary/30"
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-foreground">{getInitials(m.full_name)}</div>
                                  <p className="text-xs font-medium text-foreground">{shortName(m.full_name)} {isCurrent && <span className="text-primary">(atual)</span>}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Date/Time Change */}
                <AnimatePresence>
                  {showDateChange && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="border border-primary/20 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-foreground">Alterar data/horário</h3>
                          <button onClick={() => setShowDateChange(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-1">Nova data</label>
                          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary/20 focus:outline-none" />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-1">Novo horário (início)</label>
                          <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary/20 focus:outline-none" />
                          <p className="text-[10px] text-muted-foreground mt-1">Fim automático: +1h30</p>
                        </div>
                        <button onClick={handleDateTimeChange} className="btn-silver w-full text-xs">Confirmar alteração</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Cancel Modal */}
                <AnimatePresence>
                  {showCancelModal && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="border border-border rounded-lg p-4 space-y-3 bg-destructive/5">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-destructive flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" /> Cancelar sessão
                          </h3>
                          <button onClick={() => setShowCancelModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                        </div>
                        <p className="text-xs text-muted-foreground">Esta ação cancelará a sessão.</p>
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-1">Motivo <span className="text-destructive">*</span></label>
                          <textarea
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            className="w-full bg-card border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-destructive focus:outline-none resize-none h-20"
                            placeholder="Informe o motivo..."
                          />
                        </div>
                        <button onClick={handleCancel} disabled={!cancelReason} className="w-full py-2.5 bg-destructive text-destructive-foreground rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                          Confirmar cancelamento
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══════ MANUAL BOOKING MODAL ═══════ */}
      <AnimatePresence>
        {showManualModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40" onClick={() => setShowManualModal(false)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full lg:max-w-lg bg-card border border-border rounded-xl overflow-y-auto max-h-[90vh] pointer-events-auto"
            >
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-foreground">Agendar manualmente</h2>
                  <button onClick={() => setShowManualModal(false)} className="p-2 hover:bg-muted rounded-lg transition-colors">
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>

                {/* Participant type toggle */}
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Participante</label>
                  <div className="flex gap-1 p-1 bg-muted/30 rounded-lg mb-2">
                    <button
                      type="button"
                      onClick={() => { setManualIsGuest(false); setManualGuestName(""); }}
                      className={`flex-1 text-xs h-8 rounded-md transition-colors ${!manualIsGuest ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Membro da plataforma
                    </button>
                    <button
                      type="button"
                      onClick={() => { setManualIsGuest(true); setManualLiberty(""); setLibertySearch(""); }}
                      className={`flex-1 text-xs h-8 rounded-md transition-colors ${manualIsGuest ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Convidado externo
                    </button>
                  </div>

                  {!manualIsGuest ? (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        value={libertySearch}
                        onChange={(e) => { setLibertySearch(e.target.value); setManualLiberty(""); }}
                        placeholder="Buscar membro por nome..."
                        className="input-begin text-sm h-10 w-full pl-9"
                      />
                      {libertySearch && !manualLiberty && (
                        <div className="border border-border rounded-lg mt-1 max-h-40 overflow-y-auto bg-card">
                          {filteredMembers.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => { setManualLiberty(m.id); setLibertySearch(shortName(m.full_name)); }}
                              className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors"
                            >
                              {shortName(m.full_name)}
                            </button>
                          ))}
                          {filteredMembers.length === 0 && (
                            <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum membro encontrado</p>
                          )}
                        </div>
                      )}
                      {manualLiberty && (
                        <p className="text-[10px] text-status-green mt-1 flex items-center gap-1"><Check className="h-3 w-3" /> Selecionado</p>
                      )}
                    </div>
                  ) : (
                    <input
                      value={manualGuestName}
                      onChange={(e) => setManualGuestName(e.target.value)}
                      placeholder="Nome completo do convidado"
                      maxLength={120}
                      className="input-begin text-sm h-10 w-full"
                    />
                  )}
                </div>

                {/* Session */}
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Sessão</label>
                  <select
                    value={manualSession}
                    onChange={(e) => { setManualSession(e.target.value); setManualMentor(""); }}
                    className="input-begin text-sm h-10 w-full"
                  >
                    <option value="">Selecione...</option>
                    {sessionsCatalog.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Mentor */}
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Mentor</label>
                  <select
                    value={manualMentor}
                    onChange={(e) => setManualMentor(e.target.value)}
                    className="input-begin text-sm h-10 w-full"
                  >
                    <option value="">Selecione...</option>
                    {mentorsForSession.map((m) => (
                      <option key={m.id} value={m.id}>{shortName(m.full_name)}</option>
                    ))}
                  </select>
                </div>

                {/* Date */}
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Data</label>
                  <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="input-begin text-sm h-10 w-full" />
                </div>

                {/* Time */}
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Horário (início)</label>
                  <input type="time" value={manualTime} onChange={(e) => setManualTime(e.target.value)} className="input-begin text-sm h-10 w-full" />
                  <p className="text-[10px] text-muted-foreground mt-1">Duração: 1h30 (fim automático)</p>
                </div>

                {/* Status inicial */}
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Status inicial</label>
                  <select
                    value={manualStatus}
                    onChange={(e) => setManualStatus(e.target.value as "scheduled" | "completed")}
                    className="input-begin text-sm h-10 w-full"
                  >
                    <option value="scheduled">Agendada</option>
                    <option value="completed">Realizada (registro histórico)</option>
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Observações</label>
                  <textarea
                    value={manualNotes}
                    onChange={(e) => setManualNotes(e.target.value)}
                    className="input-begin text-sm w-full p-3 resize-none h-20"
                    placeholder="Opcional..."
                  />
                </div>

                {manualConflict && (
                  <div className="rounded-lg border border-status-yellow/40 bg-status-yellow/10 p-3 text-xs text-foreground">
                    ⚠ {manualConflict}
                  </div>
                )}

                <button
                  onClick={handleManualBook}
                  disabled={submittingBook || (manualIsGuest ? !manualGuestName.trim() : !manualLiberty) || !manualSession || !manualMentor || !manualTime || !manualDate}
                  className="btn-silver w-full text-sm h-11 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submittingBook ? "Agendando..." : manualConflict ? "Forçar mesmo assim" : "Criar agendamento"}
                </button>
              </div>
            </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* ═══════ EDIT AVAILABILITY SLOT ═══════ */}
      <AnimatePresence>
        {slotEdit && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50" onClick={() => setSlotEdit(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="glass-card p-5 w-full max-w-sm space-y-4 pointer-events-auto" style={{ transform: "none" }}>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-foreground">Editar disponibilidade</h2>
                  <button onClick={() => setSlotEdit(null)} className="p-1.5 hover:bg-muted rounded-lg"><X className="h-4 w-4 text-muted-foreground" /></button>
                </div>
                <p className="text-xs text-muted-foreground">{getMentorName(slotEdit.mentor_id)}</p>
                {slotEdit.is_recurring && (
                  <p className="text-[11px] text-status-yellow bg-status-yellow/10 border border-status-yellow/30 rounded-lg p-2">
                    Este horário é recorrente semanal. Ao salvar, ele passa a valer apenas para a data escolhida.
                  </p>
                )}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Data</label>
                  <input type="date" value={slotEditDate} onChange={(e) => setSlotEditDate(e.target.value)} className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary/30 focus:outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Início</label>
                    <input type="time" value={slotEditStart} onChange={(e) => { setSlotEditStart(e.target.value); setSlotEditEnd(addHours(e.target.value, 2)); }} className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary/30 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Fim</label>
                    <input type="time" value={slotEditEnd} onChange={(e) => setSlotEditEnd(e.target.value)} className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary/30 focus:outline-none" />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setSlotDelete(slotEdit); setSlotEdit(null); }} className="px-3 py-2 rounded-lg border border-border text-sm text-destructive hover:bg-destructive/5 flex items-center gap-1.5">
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </button>
                  <button onClick={() => saveSlot(slotEdit, slotEditDate, slotEditStart, slotEditEnd)} className="btn-silver flex-1 py-2 text-sm">Salvar</button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* ═══════ DELETE AVAILABILITY SLOT ═══════ */}
      <AnimatePresence>
        {slotDelete && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50" onClick={() => setSlotDelete(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="glass-card p-5 w-full max-w-sm space-y-4 pointer-events-auto" style={{ transform: "none" }}>
                <h2 className="text-base font-semibold text-foreground">Excluir disponibilidade</h2>
                <p className="text-sm text-muted-foreground">
                  {getMentorName(slotDelete.mentor_id)} · {format(parseISO(slotDelete.date), "dd/MM/yyyy")} · {formatTime(slotDelete.start_time)}–{formatTime(slotDelete.end_time)}
                </p>
                {slotDelete.is_recurring && (
                  <p className="text-[11px] text-status-yellow bg-status-yellow/10 border border-status-yellow/30 rounded-lg p-2">
                    Este é um horário recorrente — excluir remove todas as semanas.
                  </p>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setSlotDelete(null)} className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
                  <button onClick={() => deleteSlot(slotDelete)} className="flex-1 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:brightness-110">Excluir</button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* ═══════ ADD AVAILABILITY SLOT ═══════ */}
      <AnimatePresence>
        {slotAddDate && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50" onClick={() => setSlotAddDate(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="glass-card p-5 w-full max-w-sm space-y-4 pointer-events-auto" style={{ transform: "none" }}>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-foreground">Nova disponibilidade</h2>
                  <button onClick={() => setSlotAddDate(null)} className="p-1.5 hover:bg-muted rounded-lg"><X className="h-4 w-4 text-muted-foreground" /></button>
                </div>
                <p className="text-xs text-muted-foreground">{format(parseISO(slotAddDate), "dd/MM/yyyy")}</p>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Mentor</label>
                  <select value={slotAddMentor} onChange={(e) => setSlotAddMentor(e.target.value)} className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary/30 focus:outline-none">
                    <option value="">Selecione</option>
                    {allMentors.map((m) => <option key={m.id} value={m.id}>{shortName(m.full_name)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Início (blocos de 2h)</label>
                  <input type="time" value={slotAddStart} onChange={(e) => setSlotAddStart(e.target.value)} className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary/30 focus:outline-none" />
                  <p className="text-[10px] text-muted-foreground mt-1">Término automático: {addHours(slotAddStart, 2)}</p>
                </div>
                <button onClick={createSlot} className="btn-silver w-full py-2 text-sm">Adicionar</button>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

    </AppLayout>
  );
};

export default AdminAgendaPage;
