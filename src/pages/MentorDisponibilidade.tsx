import { useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Lock,
  Calendar,
  Clock,
  Repeat,
  CalendarDays,
  Loader2,
  CheckCircle2,
  Link2,
  ListIcon,
  Trash2,
  CalendarRange,
} from "lucide-react";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { format, addDays, startOfMonth, endOfMonth, startOfWeek, getDay, isSameDay, isBefore, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

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
  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["mentor-availability", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("mentor_availability")
        .select("*")
        .eq("mentor_id", profile.id)
        .order("start_time");
      return data || [];
    },
    enabled: !!profile?.id,
  });

  // Expand recurring slots into concrete dates for the current month view
  const expandedSlots = useMemo(() => {
    const result: { id: string; date: Date; startTime: string; endTime: string; isBooked: boolean; isRecurring: boolean }[] = [];
    const mStart = startOfMonth(currentMonth);
    const mEnd = endOfMonth(currentMonth);
    const today = new Date(); today.setHours(0, 0, 0, 0);

    slots.forEach((av) => {
      if (av.specific_date) {
        const d = new Date(av.specific_date + "T00:00:00");
        if (!isBefore(d, mStart) && !isAfter(d, mEnd)) {
          result.push({ id: av.id, date: d, startTime: av.start_time.slice(0, 5), endTime: av.end_time.slice(0, 5), isBooked: av.is_booked, isRecurring: false });
        }
      } else if (av.is_recurring) {
        // Recurrence only applies to future dates (from today onwards).
        const startFrom = isBefore(mStart, today) ? today : mStart;
        let d = startFrom;
        while (!isAfter(d, mEnd)) {
          if (getDay(d) === av.day_of_week) {
            result.push({ id: av.id, date: new Date(d), startTime: av.start_time.slice(0, 5), endTime: av.end_time.slice(0, 5), isBooked: av.is_booked, isRecurring: true });
          }
          d = addDays(d, 1);
        }
      }
    });
    return result;
  }, [slots, currentMonth]);

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
  const hasConflict = (date: Date, start: string, recurring = false, duration = 120) => {
    const newStart = timeToMinutes(start);
    const newEnd = newStart + duration;
    const dow = getDay(date);
    const dateStr = format(date, "yyyy-MM-dd");
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const clash = (s: string, e: string) => newStart < timeToMinutes(e.slice(0, 5)) && newEnd > timeToMinutes(s.slice(0, 5));

    return (slots as any[]).some((s) => {
      if (!clash(s.start_time, s.end_time)) return false;
      if (s.specific_date) {
        if (recurring) return s.day_of_week === dow && s.specific_date >= todayStr;
        return s.specific_date === dateStr;
      }
      return s.is_recurring && s.day_of_week === dow;
    });
  };

  const overlaps = (date: Date, start: string, duration = 120) => hasConflict(date, start, false, duration);


  const handleRemoveSlot = async (id: string, isRecurring: boolean) => {
    if (isRecurring) {
      if (!confirm("Esta é uma disponibilidade recorrente. Remover vai apagar TODAS as ocorrências futuras dela. Continuar?")) return;
    }

    // Não permitir remover um horário que já tem sessão ativa marcada nele.
    const { data: linked, error: linkedError } = await supabase
      .from("bookings")
      .select("id, status, scheduled_date, start_time")
      .eq("availability_id", id);

    if (linkedError) {
      toast.error("Não foi possível verificar se há sessão marcada nesse horário. Tente novamente.");
      return;
    }

    const activeBooking = (linked || []).find(
      (b) => b.status !== "cancelled" && b.status !== "not_realized",
    );
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
    queryClient.invalidateQueries({ queryKey: ["mentor-availability"] });
    toast.success("Horário removido.");
  };

  const handleSaveRange = async () => {
    if (!profile?.id || !rangeStart || !rangeEnd) return;
    const start = new Date(rangeStart + "T00:00:00");
    const end = new Date(rangeEnd + "T00:00:00");
    if (isAfter(start, end)) { toast.error("Data inicial deve ser anterior à final."); return; }
    if (rangeDows.length === 0) { toast.error("Selecione ao menos um dia da semana."); return; }
    const endTime = addMinutes(rangeTime, rangeDuration);

    setRangeSaving(true);
    try {
      const inserts: any[] = [];
      let d = new Date(start);
      while (!isAfter(d, end)) {
        const dow = getDay(d);
        if (rangeDows.includes(dow)) {
          const dateStr = format(d, "yyyy-MM-dd");
          // skip if a slot already overlaps
          const already = hasConflict(new Date(dateStr + "T00:00:00"), rangeTime, false, rangeDuration);
          if (!already) {
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
        toast.info("Nenhum dia novo para adicionar nesse período.");
        setRangeSaving(false);
        return;
      }
      const { error } = await supabase.from("mentor_availability").insert(inserts);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["mentor-availability"] });
      toast.success(`${inserts.length} horário${inserts.length !== 1 ? "s" : ""} adicionado${inserts.length !== 1 ? "s" : ""}!`);
      setRangeOpen(false);
    } catch (e: any) {
      toast.error("Erro: " + (e.message || "ao salvar período"));
    } finally {
      setRangeSaving(false);
    }
  };

  const handleAddSlot = async () => {
    if (!selectedDate || !profile?.id) return;
    const repeating = recurrenceOn && !!recurrenceUntil;

    if (repeating) {
      const until = new Date(recurrenceUntil + "T00:00:00");
      if (isBefore(until, selectedDate)) {
        toast.error("A data final da repetição precisa ser igual ou posterior ao dia selecionado.");
        return;
      }
    }

    if (!repeating && hasConflict(selectedDate, newStartTime, false, newDuration)) {
      toast.error("Já existe um horário conflitante nesse dia.");
      return;
    }

    setSaving(true);
    try {
      const endTime = addMinutes(newStartTime, newDuration);
      const dow = getDay(selectedDate);

      if (repeating) {
        // Materialize concrete weekly dates up to (and including) the chosen limit.
        // Never store open-ended recurrences — that's what made slots leak past the end date.
        const until = new Date(recurrenceUntil + "T00:00:00");
        const inserts: any[] = [];
        let d = new Date(selectedDate);
        while (!isAfter(d, until)) {
          const dateStr = format(d, "yyyy-MM-dd");
          if (!hasConflict(new Date(dateStr + "T00:00:00"), newStartTime, false, newDuration)) {
            inserts.push({
              mentor_id: profile.id,
              day_of_week: dow,
              start_time: newStartTime + ":00",
              end_time: endTime + ":00",
              specific_date: dateStr,
              is_recurring: false,
              is_booked: false,
            });
          }
          d = addDays(d, 7);
        }
        if (inserts.length === 0) {
          toast.info("Nenhuma data nova para adicionar nesse período.");
          return;
        }
        const { error } = await supabase.from("mentor_availability").insert(inserts);
        if (error) {
          toast.error("Erro ao salvar horários: " + error.message);
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ["mentor-availability"] });
        toast.success(`${inserts.length} horário${inserts.length !== 1 ? "s" : ""} adicionado${inserts.length !== 1 ? "s" : ""} até ${format(until, "dd/MM/yyyy")}.`);
      } else {
        const { error } = await supabase.from("mentor_availability").insert({
          mentor_id: profile.id,
          day_of_week: dow,
          start_time: newStartTime + ":00",
          end_time: endTime + ":00",
          specific_date: format(selectedDate, "yyyy-MM-dd"),
          is_recurring: false,
          is_booked: false,
        });
        if (error) {
          toast.error("Erro ao salvar horário: " + error.message);
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ["mentor-availability"] });
        toast.success("Horário adicionado!");
      }

      setIsAdding(false);
      setRecurrenceOn(false);
      setRecurrenceUntil("");
      setNewStartTime("09:00");
      setNewDuration(120);
    } catch (e: any) {
      toast.error("Erro inesperado: " + (e?.message || ""));
    } finally {
      setSaving(false);
    }
  };



  /* Full list — expand recurring up to 6 months ahead, plus all specific dates */
  const fullList = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const horizon = addDays(today, 180);
    const items: { id: string; date: Date; startTime: string; endTime: string; isBooked: boolean; isRecurring: boolean }[] = [];
    slots.forEach((av) => {
      if (av.specific_date) {
        const d = new Date(av.specific_date + "T00:00:00");
        if (!isBefore(d, today)) {
          items.push({ id: av.id, date: d, startTime: av.start_time.slice(0, 5), endTime: av.end_time.slice(0, 5), isBooked: av.is_booked, isRecurring: false });
        }
      } else if (av.is_recurring) {
        let d = new Date(today);
        while (!isAfter(d, horizon)) {
          if (getDay(d) === av.day_of_week) {
            items.push({ id: av.id, date: new Date(d), startTime: av.start_time.slice(0, 5), endTime: av.end_time.slice(0, 5), isBooked: av.is_booked, isRecurring: true });
          }
          d = addDays(d, 1);
        }
      }
    });
    return items.sort((a, b) => a.date.getTime() - b.date.getTime() || timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  }, [slots]);

  const googleConnected = !!profile?.google_calendar_email;

  return (
    <AppLayout role="mentor">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
        <motion.div variants={fadeUpItem} className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Disponibilidade</h1>
            <p className="text-muted-foreground text-sm mt-1">Gerencie seus horários disponíveis para sessões</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                const today = format(new Date(), "yyyy-MM-dd");
                if (!rangeStart) setRangeStart(today);
                if (!rangeEnd) setRangeEnd(format(addDays(new Date(), 30), "yyyy-MM-dd"));
                setRangeOpen(true);
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 text-xs font-medium transition-colors"
            >
              <CalendarRange className="h-3.5 w-3.5" /> Adicionar por período
            </button>
            <Link
              to="/mentor/perfil"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                googleConnected
                  ? "border-border bg-status-green/5 text-status-green hover:bg-status-green/10"
                  : "border-primary/20 bg-primary/5 text-primary hover:bg-primary/10"
              }`}
            >
              {googleConnected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
              {googleConnected ? `Google Agenda: ${profile?.google_calendar_email}` : "Sincronizar com Google Agenda"}
            </Link>
          </div>
        </motion.div>

        <motion.div variants={fadeUpItem} className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          {/* LEFT — Calendar */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              <span className="text-sm font-semibold text-foreground capitalize">
                {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
              </span>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAY_LABELS.map((w) => (
                <div key={w} className="text-[10px] text-muted-foreground text-center font-medium py-1">{w}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1" style={{ gridTemplateRows: "repeat(6, minmax(0, 1fr))" }}>
              {calendarDays.map((day, i) => {
                if (!day) return <div key={`empty-${i}`} className="aspect-square" />;
                const inMonth = isCurrentMonth(day);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const hasAvail = inMonth && hasSlots(day);
                const hasBooked = inMonth && hasBookedSlot(day);
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => inMonth && setSelectedDate(day)}
                    disabled={!inMonth}
                    className={`aspect-square rounded-lg text-xs font-medium relative flex items-center justify-center transition-all ${
                      !inMonth ? "text-muted-foreground/20 cursor-default" :
                      isSelected ? "bg-primary text-primary-foreground ring-2 ring-primary/40" :
                      hasAvail ? "bg-primary/8 text-foreground hover:bg-primary/15" :
                      "text-muted-foreground hover:bg-muted"
                    } ${hasBooked && !isSelected ? "ring-1 ring-status-blue/40" : ""}`}
                  >
                    {day.getDate()}
                    {hasAvail && !isSelected && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                    )}
                    {hasBooked && (
                      <Lock className="absolute top-0.5 right-0.5 h-2.5 w-2.5 text-status-blue" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT — Slots for selected day */}
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
                  <div className="glass-card p-5">
                    <h2 className="text-sm font-semibold text-foreground mb-1">
                      Horários disponíveis · {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                    </h2>
                    <p className="text-xs text-muted-foreground mb-4">
                      {selectedSlots.length} horário{selectedSlots.length !== 1 ? "s" : ""} cadastrado{selectedSlots.length !== 1 ? "s" : ""}
                    </p>

                    {isLoading ? (
                      <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                    ) : (
                      <div className="space-y-2">
                        {selectedSlots.length === 0 && !isAdding && (
                          <p className="text-xs text-muted-foreground py-4 text-center">
                            Nenhum horário cadastrado para este dia
                          </p>
                        )}

                        {selectedSlots
                          .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
                          .map((slot) => (
                            <motion.div
                              key={slot.id + slot.date.toISOString()}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                                slot.isBooked
                                  ? "bg-status-blue/5 border-border"
                                  : "bg-muted/20 border-border/40 hover:border-primary/20"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium text-foreground tabular-nums">
                                  {slot.startTime} – {slot.endTime}
                                </span>
                                {slot.isBooked ? (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-blue/15 text-status-blue border border-border font-medium">Agendado</span>
                                ) : (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-green/15 text-status-green border border-border font-medium">Disponível</span>
                                )}
                                {slot.isRecurring && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium flex items-center gap-1">
                                    <Repeat className="h-2.5 w-2.5" /> Recorrente
                                  </span>
                                )}
                              </div>
                              {!slot.isBooked && (
                                <button
                                  onClick={() => handleRemoveSlot(slot.id, slot.isRecurring)}
                                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </motion.div>
                          ))}
                      </div>
                    )}

                    {/* Add slot inline */}
                    <AnimatePresence>
                      {isAdding && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4 p-4 rounded-lg border border-primary/20 bg-primary/5 space-y-4">
                            <div>
                              <label className="text-[10px] text-muted-foreground block mb-1.5">Duração da janela</label>
                              <div className="grid grid-cols-2 gap-2">
                                {DURATION_OPTIONS.map((opt) => {
                                  const active = newDuration === opt.value;
                                  return (
                                    <button
                                      key={opt.value}
                                      onClick={() => {
                                        setNewDuration(opt.value);
                                        const allowed = startHoursFor(opt.value);
                                        if (!allowed.includes(newStartTime)) setNewStartTime(allowed[allowed.length - 1]);
                                      }}
                                      className={`px-3 py-2 rounded-lg border text-left transition-colors ${
                                        active
                                          ? "bg-primary/10 border-primary/40 text-foreground"
                                          : "bg-card border-border text-muted-foreground hover:border-primary/30"
                                      }`}
                                    >
                                      <span className="block text-sm font-semibold">{opt.label}</span>
                                      <span className="block text-[10px] opacity-80">{opt.hint}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="flex items-end gap-3">
                              <div className="flex-1">
                                <label className="text-[10px] text-muted-foreground block mb-1">Horário de início</label>
                                <select
                                  value={newStartTime}
                                  onChange={(e) => setNewStartTime(e.target.value)}
                                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary/20 focus:outline-none"
                                >
                                  {startHoursFor(newDuration).map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex-1">
                                <label className="text-[10px] text-muted-foreground block mb-1">Fim (automático)</label>
                                <div className="px-3 py-2 bg-muted rounded-lg text-sm text-muted-foreground tabular-nums">
                                  {addMinutes(newStartTime, newDuration)}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <div
                                  onClick={() => setRecurrenceOn(!recurrenceOn)}
                                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${recurrenceOn ? "bg-primary" : "bg-muted"}`}
                                >
                                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-foreground transition-transform ${recurrenceOn ? "translate-x-4" : "translate-x-0.5"}`} />
                                </div>
                                <span className="text-xs text-muted-foreground">Repetir semanalmente</span>
                              </label>

                              <AnimatePresence>
                                {recurrenceOn && (
                                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                    <div>
                                      <label className="text-[10px] text-muted-foreground block mb-1">Repetir até</label>
                                      <input
                                        type="date"
                                        value={recurrenceUntil}
                                        onChange={(e) => setRecurrenceUntil(e.target.value)}
                                        className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary/20 focus:outline-none"
                                      />
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>

                            {selectedDate && overlaps(selectedDate, newStartTime, newDuration) && (
                              <p className="text-[10px] text-destructive flex items-center gap-1">⚠ Este horário se sobrepõe a outro slot existente</p>
                            )}

                            <div className="flex gap-2">
                              <button
                                onClick={handleAddSlot}
                                disabled={!selectedDate || overlaps(selectedDate, newStartTime, newDuration) || (recurrenceOn && !recurrenceUntil) || saving}
                                className="btn-silver text-xs px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                              >
                                {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                                Adicionar
                              </button>
                              <button
                                onClick={() => { setIsAdding(false); setRecurrenceOn(false); setRecurrenceUntil(""); }}
                                className="text-xs px-4 py-2 border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {!isAdding && (
                      <button
                        onClick={() => setIsAdding(true)}
                        className="mt-4 w-full py-2.5 border border-dashed border-primary/30 rounded-lg text-sm text-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
                      >
                        <Plus className="h-4 w-4" /> Adicionar horário
                      </button>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-10 text-center">
                  <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Selecione um dia no calendário</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Footer — Month summary */}
        <motion.div variants={fadeUpItem} className="glass-card p-5">
          <h3 className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wider">
            Resumo · {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-semibold text-foreground tabular-nums">{daysWithAvail}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                <CalendarDays className="h-3 w-3" /> dias com disponibilidade
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-foreground tabular-nums">{totalSlots}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                <Clock className="h-3 w-3" /> horários cadastrados
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-status-blue tabular-nums">{bookedSlots}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                <Lock className="h-3 w-3" /> sessões agendadas
              </p>
            </div>
          </div>
        </motion.div>

        {/* Full availability list */}
        <motion.div variants={fadeUpItem} className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ListIcon className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Todas as disponibilidades</h3>
            </div>
            <span className="text-[11px] text-muted-foreground">{fullList.length} ocorrência{fullList.length !== 1 ? "s" : ""} (próximos 6 meses)</span>
          </div>
          {fullList.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Você ainda não cadastrou nenhuma disponibilidade.</p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto pr-1 space-y-0.5">
              {fullList.map((s) => (
                <div
                  key={s.id + s.date.toISOString()}
                  className="w-full flex items-center justify-between gap-3 py-2.5 px-1 hover:bg-muted/20 rounded transition-colors"
                >
                  <button
                    onClick={() => { setCurrentMonth(new Date(s.date.getFullYear(), s.date.getMonth(), 1)); setSelectedDate(s.date); }}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left"
                  >
                    <div className="w-12 text-center shrink-0">
                      <p className="text-[10px] uppercase text-muted-foreground tabular-nums">{format(s.date, "MMM", { locale: ptBR })}</p>
                      <p className="text-base font-semibold text-foreground tabular-nums leading-none">{format(s.date, "dd")}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-foreground capitalize truncate">{format(s.date, "EEEE", { locale: ptBR })}</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">{s.startTime} – {s.endTime}</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.isRecurring && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary/90 flex items-center gap-1">
                        <Repeat className="h-2.5 w-2.5" /> Recorrente
                      </span>
                    )}
                    {s.isBooked ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-blue/10 text-status-blue font-medium">Agendado</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-green/10 text-status-green font-medium">Disponível</span>
                    )}
                    {!s.isBooked && (
                      <button
                        onClick={() => handleRemoveSlot(s.id, s.isRecurring)}
                        title={s.isRecurring ? "Excluir recorrência (todas as ocorrências)" : "Excluir horário"}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* Dialog: adicionar por período */}
      <Dialog open={rangeOpen} onOpenChange={setRangeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-primary" /> Adicionar por período
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Crie a mesma janela de horário para vários dias de uma vez.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">De</label>
                <input
                  type="date"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary/20 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">Até</label>
                <input
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary/20 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1.5">Duração da janela</label>
              <div className="grid grid-cols-2 gap-2">
                {DURATION_OPTIONS.map((opt) => {
                  const active = rangeDuration === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setRangeDuration(opt.value);
                        const allowed = startHoursFor(opt.value);
                        if (!allowed.includes(rangeTime)) setRangeTime(allowed[allowed.length - 1]);
                      }}
                      className={`px-3 py-2 rounded-lg border text-left transition-colors ${
                        active
                          ? "bg-primary/10 border-primary/40 text-foreground"
                          : "bg-card border-border text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      <span className="block text-sm font-semibold">{opt.label}</span>
                      <span className="block text-[10px] opacity-80">{opt.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Horário de início</label>
              <select
                value={rangeTime}
                onChange={(e) => setRangeTime(e.target.value)}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary/20 focus:outline-none"
              >
                {startHoursFor(rangeDuration).map((t) => (
                  <option key={t} value={t}>{t} – {addMinutes(t, rangeDuration)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-2">Dias da semana</label>
              <div className="flex gap-1.5 flex-wrap">
                {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                  const active = rangeDows.includes(dow);
                  return (
                    <button
                      key={dow}
                      onClick={() =>
                        setRangeDows((prev) =>
                          prev.includes(dow) ? prev.filter((x) => x !== dow) : [...prev, dow].sort()
                        )
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground border-primary/20"
                          : "bg-transparent text-muted-foreground border-border hover:border-primary/30"
                      }`}
                    >
                      {WEEKDAY_LABELS[dow]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setRangeOpen(false)}
              className="px-4 py-2 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveRange}
              disabled={rangeSaving || !rangeStart || !rangeEnd}
              className="btn-silver text-xs px-4 py-2 flex items-center gap-2 disabled:opacity-50"
            >
              {rangeSaving && <Loader2 className="h-3 w-3 animate-spin" />} Adicionar horários
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default MentorDisponibilidadePage;
