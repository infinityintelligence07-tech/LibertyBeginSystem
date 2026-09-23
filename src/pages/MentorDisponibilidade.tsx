import { useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Lock,
  Calendar,
  Clock,
  Repeat,
  CalendarDays,
  Loader2,
  CheckCircle2,
  Link2,
  Trash2,
  CalendarRange,
} from "lucide-react";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { format, addDays, startOfMonth, endOfMonth, startOfWeek, getDay, isSameDay, isBefore, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  Stat,
  StatusPill,
  TextField,
} from "@/components/ds";
import { cn } from "@/lib/utils";
import { PLATFORM_TIME_ZONE, todayPlatformDate } from "@/lib/bookingStatus";

/* ───── Helpers ───── */
const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const addMinutes = (time: string, mins: number) => {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const timeToMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** `YYYY-MM-DD` → Date local à meia-noite (só para montar o calendário; comparações de "hoje" usam o fuso da plataforma). */
const dateFromISO = (iso: string) => new Date(iso.slice(0, 10) + "T00:00:00");

/** Hoje no fuso da plataforma (São Paulo), como Date local à meia-noite. */
const platformToday = () => dateFromISO(todayPlatformDate());

/** Hora atual (HH:MM) no fuso da plataforma. */
const platformNowTime = () =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: PLATFORM_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

type ActiveBooking = {
  id: string;
  status: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  availability_id: string | null;
};

const timesOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
  timeToMinutes(aStart.slice(0, 5)) < timeToMinutes(bEnd.slice(0, 5)) &&
  timeToMinutes(aEnd.slice(0, 5)) > timeToMinutes(bStart.slice(0, 5));

const isUniqueViolation = (message?: string | null) =>
  !!message && (message.includes("duplicate key") || message.includes("23505") || message.includes("exclusion") || message.includes("23P01"));

const ALL_HALF_HOURS = Array.from({ length: 17 }, (_, i) => {
  const h = 7 + i;
  return [`${String(h).padStart(2, "0")}:00`, `${String(h).padStart(2, "0")}:30`];
}).flat();

// Start hours that still fit inside the day for a given slot duration
const startHoursFor = (duration: number) =>
  ALL_HALF_HOURS.filter((t) => timeToMinutes(t) + duration <= 23 * 60 + 30);

const DURATION_OPTIONS = [
  { value: 120, label: "2h", hint: "Sessões normais da jornada" },
  { value: 180, label: "3h", hint: "Exclusivo · Mapeamento do Negócio" },
];



/* ───── Component ───── */
const MentorDisponibilidadePage = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [isAdding, setIsAdding] = useState(false);
  const [newStartTime, setNewStartTime] = useState("09:00");
  const [newDuration, setNewDuration] = useState(120);
  const [recurrenceOn, setRecurrenceOn] = useState(false);
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [saving, setSaving] = useState(false);

  // "Por período" modal state
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [rangeTime, setRangeTime] = useState("09:00");
  const [rangeDuration, setRangeDuration] = useState(120);
  const [rangeDows, setRangeDows] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri default
  const [rangeSaving, setRangeSaving] = useState(false);

  // Fetch real availability from DB
  const { data: slots = [], isLoading, isError: slotsError, refetch: refetchSlots } = useQuery({
    queryKey: ["mentor-availability", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("mentor_availability")
        .select("*")
        .eq("mentor_id", profile.id)
        .order("start_time");
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  // Sessões ativas do mentor: definem "Agendado" por data/horário (e não só pela flag is_booked,
  // que em linhas recorrentes legadas marcaria todas as ocorrências) e protegem a exclusão de horários.
  const { data: activeBookings = [] } = useQuery({
    queryKey: ["mentor-availability-bookings", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from("bookings")
        .select("id, status, scheduled_date, start_time, end_time, availability_id")
        .eq("mentor_id", profile.id)
        .not("status", "in", '("cancelled","not_realized")');
      if (error) throw error;
      return (data || []) as ActiveBooking[];
    },
    enabled: !!profile?.id,
  });

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, ActiveBooking[]>();
    activeBookings.forEach((b) => {
      const list = map.get(b.scheduled_date) || [];
      list.push(b);
      map.set(b.scheduled_date, list);
    });
    return map;
  }, [activeBookings]);

  const bookingOnSlot = useCallback(
    (dateStr: string, startTime: string, endTime: string, availabilityId?: string) =>
      (bookingsByDate.get(dateStr) || []).find(
        (b) => (availabilityId && b.availability_id === availabilityId) || timesOverlap(b.start_time, b.end_time, startTime, endTime),
      ),
    [bookingsByDate],
  );

  // Expand recurring slots into concrete dates for the current month view
  const expandedSlots = useMemo(() => {
    const result: { id: string; date: Date; startTime: string; endTime: string; isBooked: boolean; isRecurring: boolean }[] = [];
    const mStart = startOfMonth(currentMonth);
    const mEnd = endOfMonth(currentMonth);
    const today = platformToday();

    slots.forEach((av) => {
      const startTime = av.start_time.slice(0, 5);
      const endTime = av.end_time.slice(0, 5);
      if (av.specific_date) {
        const d = dateFromISO(av.specific_date);
        if (!isBefore(d, mStart) && !isAfter(d, mEnd)) {
          const booked = av.is_booked || !!bookingOnSlot(av.specific_date, startTime, endTime, av.id);
          result.push({ id: av.id, date: d, startTime, endTime, isBooked: booked, isRecurring: false });
        }
      } else if (av.is_recurring) {
        // Recurrence only applies to future dates (from today onwards).
        const startFrom = isBefore(mStart, today) ? today : mStart;
        let d = startFrom;
        while (!isAfter(d, mEnd)) {
          if (getDay(d) === av.day_of_week) {
            // Em recorrências, "agendado" é por ocorrência (sessão real naquela data), não pela flag da linha
            const booked = !!bookingOnSlot(format(d, "yyyy-MM-dd"), startTime, endTime);
            result.push({ id: av.id, date: new Date(d), startTime, endTime, isBooked: booked, isRecurring: true });
          }
          d = addDays(d, 1);
        }
      }
    });
    return result;
  }, [slots, currentMonth, bookingOnSlot]);

  /* Calendar grid — always 6 weeks (42 cells) for consistent height */
  const calendarDays = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const days: (Date | null)[] = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i);
      days.push(d);
    }
    return days;
  }, [currentMonth]);

  const isCurrentMonth = (d: Date) => d.getMonth() === currentMonth.getMonth();

  const slotsForDate = useCallback(
    (date: Date) => expandedSlots.filter((s) => isSameDay(s.date, date)),
    [expandedSlots]
  );

  const selectedSlots = selectedDate ? slotsForDate(selectedDate) : [];

  const hasSlots = useCallback(
    (date: Date) => expandedSlots.some((s) => isSameDay(s.date, date)),
    [expandedSlots]
  );

  const hasBookedSlot = useCallback(
    (date: Date) => expandedSlots.some((s) => isSameDay(s.date, date) && s.isBooked),
    [expandedSlots]
  );

  /* Month stats */
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const monthSlots = expandedSlots.filter((s) => !isBefore(s.date, monthStart) && !isAfter(s.date, monthEnd));
  const daysWithAvail = new Set(monthSlots.map((s) => s.date.toDateString())).size;
  const totalSlots = monthSlots.length;
  const bookedSlots = monthSlots.filter((s) => s.isBooked).length;

  /* Actions */
  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  /**
   * Conflict check. Considers the real end time of existing slots (legacy 1h30 ones included)
   * and, for recurring inserts, every future occurrence of that weekday.
   */
  const hasConflict = (date: Date, start: string, duration = 120) => {
    const newStart = timeToMinutes(start);
    const newEnd = newStart + duration;
    const dow = getDay(date);
    const dateStr = format(date, "yyyy-MM-dd");
    const clash = (s: string, e: string) => newStart < timeToMinutes(e.slice(0, 5)) && newEnd > timeToMinutes(s.slice(0, 5));

    return slots.some((s) => {
      if (!clash(s.start_time, s.end_time)) return false;
      if (s.specific_date) return s.specific_date === dateStr;
      return s.is_recurring && s.day_of_week === dow;
    });
  };

  const overlaps = (date: Date, start: string, duration = 120) => hasConflict(date, start, duration);

  /** Dia/horário já passou (fuso da plataforma)? Não faz sentido cadastrar disponibilidade no passado. */
  const isPastSlot = (date: Date, start: string) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const todayStr = todayPlatformDate();
    if (dateStr < todayStr) return true;
    if (dateStr === todayStr) return timeToMinutes(start) <= timeToMinutes(platformNowTime());
    return false;
  };

  const insertSlots = async (rows: Database["public"]["Tables"]["mentor_availability"]["Insert"][]) => {
    const { error } = await supabase.from("mentor_availability").insert(rows);
    if (error) {
      if (isUniqueViolation(error.message)) {
        await queryClient.invalidateQueries({ queryKey: ["mentor-availability"] });
        return "Já existe um horário nesse intervalo (cadastrado em outra aba ou pelo administrador). A lista foi atualizada.";
      }
      return "Erro ao salvar horário: " + error.message;
    }
    return null;
  };

  type RemovableSlot = { id: string; date: Date; startTime: string; endTime: string; isRecurring: boolean };
  // Remoção em duas etapas: pede confirmação em ConfirmDialog (substitui window.confirm) e só então executa.
  const [removeTarget, setRemoveTarget] = useState<RemovableSlot | null>(null);
  const [removing, setRemoving] = useState(false);

  const handleRemoveSlot = (slot: RemovableSlot) => setRemoveTarget(slot);

  const confirmRemoveSlot = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await performRemoveSlot(removeTarget);
    } finally {
      setRemoving(false);
      setRemoveTarget(null);
    }
  };

  const performRemoveSlot = async (slot: RemovableSlot) => {
    const { id, isRecurring, startTime, endTime } = slot;
    const dateStr = format(slot.date, "yyyy-MM-dd");

    // Não permitir remover um horário que já tem sessão ativa marcada nele:
    // checa pelo vínculo (availability_id) e também por data/horário, para sessões criadas sem vínculo (admin, retroativas).
    const { data: linked, error: linkedError } = await supabase
      .from("bookings")
      .select("id, status, scheduled_date, start_time")
      .eq("availability_id", id);

    if (linkedError) {
      toast.error("Não foi possível verificar se há sessão marcada nesse horário. Tente novamente.");
      return;
    }

    const activeBooking =
      (linked || []).find((b) => b.status !== "cancelled" && b.status !== "not_realized") ||
      (!isRecurring ? bookingOnSlot(dateStr, startTime, endTime) : activeBookings.find((b) => getDay(dateFromISO(b.scheduled_date)) === getDay(slot.date) && timesOverlap(b.start_time, b.end_time, startTime, endTime) && b.scheduled_date >= todayPlatformDate()));
    if (activeBooking) {
      const when = activeBooking.scheduled_date
        ? `${activeBooking.scheduled_date.split("-").reverse().join("/")}${activeBooking.start_time ? ` às ${String(activeBooking.start_time).slice(0, 5)}` : ""}`
        : "";
      toast.error(
        `Esse horário já tem uma sessão marcada${when ? ` em ${when}` : ""}. Cancele ou reagende a sessão antes de remover o horário.`,
      );
      return;
    }

    const { error } = await supabase.from("mentor_availability").delete().eq("id", id);
    if (error) {
      toast.error(`Não foi possível remover o horário: ${error.message}`);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["mentor-availability"] });
    toast.success("Horário removido.");
  };

  const handleSaveRange = async () => {
    if (!profile?.id || !rangeStart || !rangeEnd) return;
    const start = dateFromISO(rangeStart);
    const end = dateFromISO(rangeEnd);
    if (isAfter(start, end)) { toast.error("Data inicial deve ser anterior à final."); return; }
    if (rangeDows.length === 0) { toast.error("Selecione ao menos um dia da semana."); return; }
    if (rangeEnd < todayPlatformDate()) { toast.error("O período já passou. Escolha datas a partir de hoje."); return; }
    const endTime = addMinutes(rangeTime, rangeDuration);

    setRangeSaving(true);
    try {
      const inserts: Database["public"]["Tables"]["mentor_availability"]["Insert"][] = [];
      let skippedPast = 0;
      let d = new Date(start);
      while (!isAfter(d, end)) {
        const dow = getDay(d);
        if (rangeDows.includes(dow)) {
          const dateStr = format(d, "yyyy-MM-dd");
          if (isPastSlot(d, rangeTime)) {
            skippedPast++;
          } else if (!hasConflict(d, rangeTime, rangeDuration)) {
            inserts.push({
              mentor_id: profile.id,
              day_of_week: dow,
              start_time: rangeTime + ":00",
              end_time: endTime + ":00",
              specific_date: dateStr,
              is_recurring: false,
              is_booked: false,
            });
          }
        }
        d = addDays(d, 1);
      }
      if (inserts.length === 0) {
        toast.info(skippedPast > 0 ? "Nenhum dia novo para adicionar: as datas do período já passaram ou já têm horário." : "Nenhum dia novo para adicionar nesse período.");
        return;
      }
      const errorMessage = await insertSlots(inserts);
      if (errorMessage) { toast.error(errorMessage); return; }
      await queryClient.invalidateQueries({ queryKey: ["mentor-availability"] });
      toast.success(`${inserts.length} horário${inserts.length !== 1 ? "s" : ""} adicionado${inserts.length !== 1 ? "s" : ""}!${skippedPast > 0 ? ` ${skippedPast} data${skippedPast !== 1 ? "s" : ""} no passado ${skippedPast !== 1 ? "foram ignoradas" : "foi ignorada"}.` : ""}`);
      setRangeOpen(false);
    } catch (e) {
      toast.error("Erro ao salvar período: " + ((e as Error).message || ""));
    } finally {
      setRangeSaving(false);
    }
  };

  const handleAddSlot = async () => {
    if (!selectedDate || !profile?.id) return;
    const repeating = recurrenceOn && !!recurrenceUntil;

    if (isPastSlot(selectedDate, newStartTime)) {
      toast.error("Esse horário já passou. Escolha um horário a partir de agora.");
      return;
    }

    if (repeating) {
      const until = dateFromISO(recurrenceUntil);
      if (isBefore(until, selectedDate)) {
        toast.error("A data final da repetição precisa ser igual ou posterior ao dia selecionado.");
        return;
      }
    }

    if (!repeating && hasConflict(selectedDate, newStartTime, newDuration)) {
      toast.error("Já existe um horário conflitante nesse dia.");
      return;
    }

    setSaving(true);
    try {
      const endTime = addMinutes(newStartTime, newDuration);
      const dow = getDay(selectedDate);

      if (repeating) {
        // Materialize concrete weekly dates up to (and including) the chosen limit.
        // Never store open-ended recurrences: that's what made slots leak past the end date.
        const until = dateFromISO(recurrenceUntil);
        const inserts: Database["public"]["Tables"]["mentor_availability"]["Insert"][] = [];
        const skipped: string[] = [];
        let d = new Date(selectedDate);
        while (!isAfter(d, until)) {
          const dateStr = format(d, "yyyy-MM-dd");
          if (!hasConflict(d, newStartTime, newDuration)) {
            inserts.push({
              mentor_id: profile.id,
              day_of_week: dow,
              start_time: newStartTime + ":00",
              end_time: endTime + ":00",
              specific_date: dateStr,
              is_recurring: false,
              is_booked: false,
            });
          } else {
            skipped.push(format(d, "dd/MM"));
          }
          d = addDays(d, 7);
        }
        if (inserts.length === 0) {
          toast.info("Nenhuma data nova para adicionar nesse período.");
          return;
        }
        const errorMessage = await insertSlots(inserts);
        if (errorMessage) { toast.error(errorMessage); return; }
        await queryClient.invalidateQueries({ queryKey: ["mentor-availability"] });
        toast.success(
          `${inserts.length} horário${inserts.length !== 1 ? "s" : ""} adicionado${inserts.length !== 1 ? "s" : ""} até ${format(until, "dd/MM/yyyy")}.` +
          (skipped.length ? ` Pulados por conflito: ${skipped.join(", ")}.` : ""),
        );
      } else {
        const errorMessage = await insertSlots([{
          mentor_id: profile.id,
          day_of_week: dow,
          start_time: newStartTime + ":00",
          end_time: endTime + ":00",
          specific_date: format(selectedDate, "yyyy-MM-dd"),
          is_recurring: false,
          is_booked: false,
        }]);
        if (errorMessage) { toast.error(errorMessage); return; }
        await queryClient.invalidateQueries({ queryKey: ["mentor-availability"] });
        toast.success("Horário adicionado!");
      }

      setIsAdding(false);
      setRecurrenceOn(false);
      setRecurrenceUntil("");
      setNewStartTime("09:00");
      setNewDuration(120);
    } catch (e) {
      toast.error("Erro inesperado: " + ((e as Error)?.message || ""));
    } finally {
      setSaving(false);
    }
  };



  /* Full list — expand recurring up to 6 months ahead, plus all specific dates */
  const fullList = useMemo(() => {
    const today = platformToday();
    const horizon = addDays(today, 180);
    const items: { id: string; date: Date; startTime: string; endTime: string; isBooked: boolean; isRecurring: boolean }[] = [];
    slots.forEach((av) => {
      const startTime = av.start_time.slice(0, 5);
      const endTime = av.end_time.slice(0, 5);
      if (av.specific_date) {
        const d = dateFromISO(av.specific_date);
        if (!isBefore(d, today)) {
          const booked = av.is_booked || !!bookingOnSlot(av.specific_date, startTime, endTime, av.id);
          items.push({ id: av.id, date: d, startTime, endTime, isBooked: booked, isRecurring: false });
        }
      } else if (av.is_recurring) {
        let d = new Date(today);
        while (!isAfter(d, horizon)) {
          if (getDay(d) === av.day_of_week) {
            const booked = !!bookingOnSlot(format(d, "yyyy-MM-dd"), startTime, endTime);
            items.push({ id: av.id, date: new Date(d), startTime, endTime, isBooked: booked, isRecurring: true });
          }
          d = addDays(d, 1);
        }
      }
    });
    return items.sort((a, b) => a.date.getTime() - b.date.getTime() || timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  }, [slots, bookingOnSlot]);

  // Mesmo seletor do GoogleCalendarBanner (google_connected), com fallback no e-mail para perfis antigos
  const googleConnected = !!(profile?.google_connected ?? profile?.google_calendar_email);
  const isPastDay = !!selectedDate && format(selectedDate, "yyyy-MM-dd") < todayPlatformDate();

  const openRangeSheet = () => {
    const today = todayPlatformDate();
    if (!rangeStart) setRangeStart(today);
    if (!rangeEnd) setRangeEnd(format(addDays(platformToday(), 30), "yyyy-MM-dd"));
    setRangeOpen(true);
  };

  const closeAddSheet = () => {
    setIsAdding(false);
    setRecurrenceOn(false);
    setRecurrenceUntil("");
  };

  const addOverlaps = !!selectedDate && overlaps(selectedDate, newStartTime, newDuration);
  const sortedSelectedSlots = [...selectedSlots].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  /** Seletor de duração (2h/3h) reutilizado nas duas folhas de cadastro. */
  const renderDurationPicker = (value: number, onChange: (v: number) => void) => (
    <fieldset>
      <legend className="block text-sm font-medium text-foreground mb-1.5">Duração da janela</legend>
      <div className="grid grid-cols-2 gap-2">
        {DURATION_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <Button
              key={opt.value}
              type="button"
              variant={active ? "secondary" : "outline"}
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
              className={cn("h-auto min-h-[44px] flex-col items-start gap-0 py-2 text-left", active && "ring-1 ring-primary/40")}
            >
              <span className="text-sm font-semibold">{opt.label}</span>
              <span className="text-xs font-normal text-muted-foreground">{opt.hint}</span>
            </Button>
          );
        })}
      </div>
    </fieldset>
  );

  const slotPills = (slot: { isBooked: boolean; isRecurring: boolean }) => (
    <>
      {slot.isRecurring && (
        <StatusPill tone="brand" withDot={false}>
          <Repeat className="h-3 w-3" aria-hidden /> Recorrente
        </StatusPill>
      )}
      {slot.isBooked ? <StatusPill tone="info">Agendado</StatusPill> : <StatusPill tone="success">Disponível</StatusPill>}
    </>
  );

  return (
    <AppLayout role="mentor">
      <PageContainer variant="wide">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6 lg:space-y-8">
        <motion.div variants={fadeUpItem}>
          <PageHeader
            title="Disponibilidade"
            description="Gerencie os horários em que os membros podem marcar sessões com você."
            actions={
              <>
                <Button variant="outline" onClick={openRangeSheet}>
                  <CalendarRange /> Adicionar por período
                </Button>
                <Button asChild variant={googleConnected ? "ghost" : "outline"} className={cn("max-w-full", googleConnected && "text-status-green hover:text-status-green")}>
                  <Link to="/mentor/perfil">
                    {googleConnected ? <CheckCircle2 /> : <Link2 />}
                    <span className="truncate">
                      {googleConnected ? `Google Agenda: ${profile?.google_calendar_email}` : "Sincronizar com Google Agenda"}
                    </span>
                  </Link>
                </Button>
              </>
            }
          />
        </motion.div>

        <motion.div variants={fadeUpItem} className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
          {/* Calendário */}
          <SectionCard as="section" aria-label="Calendário" className="self-start">
            <div className="flex items-center justify-between mb-3">
              <IconButton aria-label="Mês anterior" variant="outline" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </IconButton>
              <h2 className="text-sm font-semibold text-foreground capitalize">
                {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
              </h2>
              <IconButton aria-label="Próximo mês" variant="outline" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </IconButton>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1" aria-hidden>
              {WEEKDAY_LABELS.map((w) => (
                <div key={w} className="text-xs text-muted-foreground text-center font-medium py-1">{w}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, i) => {
                if (!day) return <div key={`empty-${i}`} className="min-h-[44px]" />;
                const inMonth = isCurrentMonth(day);
                const isSelected = !!selectedDate && isSameDay(day, selectedDate);
                const hasAvail = inMonth && hasSlots(day);
                const hasBooked = inMonth && hasBookedSlot(day);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => inMonth && setSelectedDate(day)}
                    disabled={!inMonth}
                    aria-pressed={isSelected}
                    aria-label={`${format(day, "d 'de' MMMM", { locale: ptBR })}${hasAvail ? ", com disponibilidade" : ""}${hasBooked ? ", com sessão agendada" : ""}`}
                    className={cn(
                      "relative min-h-[44px] rounded-[var(--ds-radius-md)] text-sm font-medium flex items-center justify-center transition-colors duration-ds-1 ease-ds",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
                      !inMonth && "text-muted-foreground opacity-30 cursor-default",
                      inMonth && !isSelected && !hasAvail && "text-muted-foreground hover:bg-muted",
                      inMonth && !isSelected && hasAvail && "bg-primary/10 text-foreground hover:bg-primary/15",
                      isSelected && "bg-primary text-primary-foreground",
                      hasBooked && !isSelected && "ring-1 ring-status-blue/40",
                    )}
                  >
                    {day.getDate()}
                    {hasAvail && !isSelected && (
                      <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" aria-hidden />
                    )}
                    {hasBooked && (
                      <Lock className="absolute top-1 right-1 h-2.5 w-2.5 text-status-blue" aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" aria-hidden /> Com horário</span>
              <span className="inline-flex items-center gap-1.5"><Lock className="h-3 w-3 text-status-blue" aria-hidden /> Sessão agendada</span>
            </div>
          </SectionCard>

          {/* Horários do dia selecionado */}
          <div className="space-y-4">
            <AnimatePresence mode="wait">
              {selectedDate ? (
                <motion.div
                  key={selectedDate.toISOString()}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  <SectionCard as="section" padding="none">
                    <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3">
                      <SectionHeader
                        as="h2"
                        title={<span className="capitalize">{format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}</span>}
                        description={`${selectedSlots.length} horário${selectedSlots.length !== 1 ? "s" : ""} cadastrado${selectedSlots.length !== 1 ? "s" : ""}`}
                        actions={
                          !isPastDay ? (
                            <Button size="sm" onClick={() => setIsAdding(true)}>
                              <Plus /> Adicionar horário
                            </Button>
                          ) : undefined
                        }
                      />
                    </div>

                    {isLoading ? (
                      <div className="px-4 sm:px-6 pb-4">
                        <LoadingState variant="list" rows={2} />
                      </div>
                    ) : sortedSelectedSlots.length === 0 ? (
                      <div className="px-4 sm:px-6 pb-6">
                        <EmptyState
                          compact
                          icon={Clock}
                          title="Nenhum horário neste dia"
                          description={isPastDay ? "Este dia já passou. Não é possível cadastrar novos horários." : "Adicione uma janela de 2h ou 3h para os membros marcarem sessões."}
                          action={!isPastDay ? <Button size="sm" variant="outline" onClick={() => setIsAdding(true)}><Plus /> Adicionar horário</Button> : undefined}
                        />
                      </div>
                    ) : (
                      <ul className="border-t border-border">
                        {sortedSelectedSlots.map((slot, idx) => (
                          <li key={slot.id + slot.date.toISOString()} className="flex items-center gap-1 pr-2">
                            <div className="min-w-0 flex-1">
                              <ListRow
                                leading={
                                  <span className="h-10 w-10 rounded-[var(--ds-radius-md)] bg-muted text-muted-foreground flex items-center justify-center">
                                    <Clock className="h-4 w-4" aria-hidden />
                                  </span>
                                }
                                title={<span className="tabular-nums">{slot.startTime} – {slot.endTime}</span>}
                                subtitle={<span className="inline-flex flex-wrap items-center gap-1.5 mt-0.5">{slotPills(slot)}</span>}
                                chevron={false}
                                last={idx === sortedSelectedSlots.length - 1}
                              />
                            </div>
                            {!slot.isBooked && (
                              <IconButton
                                aria-label={`Remover horário ${slot.startTime} – ${slot.endTime}`}
                                onClick={() => handleRemoveSlot(slot)}
                                className="shrink-0 hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </IconButton>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {isPastDay && sortedSelectedSlots.length > 0 && (
                      <p className="px-4 sm:px-6 py-3 text-xs text-muted-foreground border-t border-border">
                        Dia já passou. Não é possível cadastrar novos horários.
                      </p>
                    )}
                  </SectionCard>
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <EmptyState icon={Calendar} title="Selecione um dia" description="Toque em um dia do calendário para ver e cadastrar horários." />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Resumo do mês */}
        <motion.section variants={fadeUpItem} className="space-y-3">
          <SectionHeader title={<span>Resumo · <span className="capitalize">{format(currentMonth, "MMMM yyyy", { locale: ptBR })}</span></span>} />
          <SectionCard>
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Dias com horário" value={daysWithAvail} icon={CalendarDays} />
              <Stat label="Horários cadastrados" value={totalSlots} icon={Clock} />
              <Stat label="Sessões agendadas" value={bookedSlots} icon={Lock} tone="info" />
            </div>
          </SectionCard>
        </motion.section>

        {/* Lista completa */}
        <motion.section variants={fadeUpItem} className="space-y-3">
          <SectionHeader
            title="Todas as disponibilidades"
            description={`${fullList.length} ocorrência${fullList.length !== 1 ? "s" : ""} nos próximos 6 meses`}
          />
          {slotsError ? (
            <ErrorState
              title="Não foi possível carregar suas disponibilidades"
              description="Verifique sua conexão e tente de novo."
              onRetry={() => refetchSlots()}
            />
          ) : isLoading ? (
            <LoadingState variant="list" rows={4} />
          ) : fullList.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Você ainda não cadastrou nenhuma disponibilidade"
              description="Escolha um dia no calendário ou adicione vários dias de uma vez por período."
              action={<Button variant="outline" size="sm" onClick={openRangeSheet}><CalendarRange /> Adicionar por período</Button>}
            />
          ) : (
            <SectionCard padding="none">
              <ul className="max-h-[480px] overflow-y-auto">
                {fullList.map((s, idx) => (
                  <li key={s.id + s.date.toISOString()} className="flex items-center gap-1 pr-2">
                    <div className="min-w-0 flex-1">
                      <ListRow
                        leading={<DateBlock date={format(s.date, "yyyy-MM-dd")} tone={s.isBooked ? "brand" : "default"} />}
                        title={<span className="capitalize">{format(s.date, "EEEE", { locale: ptBR })}</span>}
                        subtitle={<span className="tabular-nums">{s.startTime} – {s.endTime}</span>}
                        trailing={<span className="hidden sm:inline-flex items-center gap-1.5">{slotPills(s)}</span>}
                        onPress={() => { setCurrentMonth(new Date(s.date.getFullYear(), s.date.getMonth(), 1)); setSelectedDate(s.date); }}
                        chevron={false}
                        last={idx === fullList.length - 1}
                      />
                    </div>
                    {!s.isBooked ? (
                      <IconButton
                        aria-label={s.isRecurring ? "Excluir recorrência (todas as ocorrências)" : `Excluir horário ${s.startTime} – ${s.endTime}`}
                        onClick={() => handleRemoveSlot(s)}
                        className="shrink-0 hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    ) : (
                      <span className="w-10 shrink-0" aria-hidden />
                    )}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </motion.section>
      </motion.div>
      </PageContainer>

      {/* Folha: adicionar horário no dia selecionado */}
      <BottomSheet
        open={isAdding && !!selectedDate}
        onOpenChange={(open) => { if (!open && !saving) closeAddSheet(); }}
        title="Adicionar horário"
        description={selectedDate ? <span className="capitalize">{format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}</span> : undefined}
        size="sm"
        locked={saving}
        footer={
          <>
            <Button variant="outline" onClick={closeAddSheet} disabled={saving}>Cancelar</Button>
            <Button
              onClick={handleAddSlot}
              disabled={!selectedDate || addOverlaps || (recurrenceOn && !recurrenceUntil) || saving}
            >
              {saving && <Loader2 className="animate-spin" />} Adicionar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {renderDurationPicker(newDuration, (v) => {
            setNewDuration(v);
            const allowed = startHoursFor(v);
            if (!allowed.includes(newStartTime)) setNewStartTime(allowed[allowed.length - 1]);
          })}

          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Início" value={newStartTime} onChange={(e) => setNewStartTime(e.target.value)}>
              {startHoursFor(newDuration).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </SelectField>
            <TextField label="Fim (automático)" value={addMinutes(newStartTime, newDuration)} readOnly className="tabular-nums text-muted-foreground" />
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 min-h-[44px] cursor-pointer">
              <span className="text-sm font-medium text-foreground">Repetir semanalmente</span>
              <Switch checked={recurrenceOn} onCheckedChange={setRecurrenceOn} aria-label="Repetir semanalmente" />
            </label>
            {recurrenceOn && (
              <TextField
                type="date"
                label="Repetir até"
                value={recurrenceUntil}
                onChange={(e) => setRecurrenceUntil(e.target.value)}
                required
                hint="Cria uma ocorrência por semana até essa data."
              />
            )}
          </div>

          {addOverlaps && (
            <Callout tone="danger" title="Este horário se sobrepõe a outro já cadastrado">
              Escolha outro início ou remova o horário existente.
            </Callout>
          )}
        </div>
      </BottomSheet>

      {/* Folha: adicionar por período */}
      <BottomSheet
        open={rangeOpen}
        onOpenChange={(open) => { if (!open && !rangeSaving) setRangeOpen(false); }}
        title="Adicionar por período"
        description="Crie a mesma janela de horário para vários dias de uma vez."
        size="md"
        locked={rangeSaving}
        footer={
          <>
            <Button variant="outline" onClick={() => setRangeOpen(false)} disabled={rangeSaving}>Cancelar</Button>
            <Button onClick={handleSaveRange} disabled={rangeSaving || !rangeStart || !rangeEnd}>
              {rangeSaving && <Loader2 className="animate-spin" />} Adicionar horários
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <TextField type="date" label="De" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} required />
            <TextField type="date" label="Até" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} required />
          </div>

          {renderDurationPicker(rangeDuration, (v) => {
            setRangeDuration(v);
            const allowed = startHoursFor(v);
            if (!allowed.includes(rangeTime)) setRangeTime(allowed[allowed.length - 1]);
          })}

          <SelectField label="Horário" value={rangeTime} onChange={(e) => setRangeTime(e.target.value)}>
            {startHoursFor(rangeDuration).map((t) => (
              <option key={t} value={t}>{t} – {addMinutes(t, rangeDuration)}</option>
            ))}
          </SelectField>

          <fieldset>
            <legend className="block text-sm font-medium text-foreground mb-2">Dias da semana</legend>
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
                <Chip
                  key={dow}
                  active={rangeDows.includes(dow)}
                  onClick={() =>
                    setRangeDows((prev) =>
                      prev.includes(dow) ? prev.filter((x) => x !== dow) : [...prev, dow].sort()
                    )
                  }
                >
                  {WEEKDAY_LABELS[dow]}
                </Chip>
              ))}
            </div>
            {rangeDows.length === 0 && <p className="mt-1.5 text-xs text-destructive">Selecione ao menos um dia da semana.</p>}
          </fieldset>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => { if (!open && !removing) setRemoveTarget(null); }}
        title={removeTarget?.isRecurring ? "Remover disponibilidade recorrente?" : "Remover este horário?"}
        description={
          removeTarget?.isRecurring
            ? "Todas as ocorrências futuras desta recorrência serão apagadas. Os membros deixam de ver essas opções."
            : removeTarget
              ? `O horário ${removeTarget.startTime} – ${removeTarget.endTime} de ${format(removeTarget.date, "dd/MM/yyyy")} deixa de aparecer para os membros.`
              : undefined
        }
        confirmLabel="Remover"
        destructive
        loading={removing}
        onConfirm={confirmRemoveSlot}
      />
    </AppLayout>
  );
};

export default MentorDisponibilidadePage;
