import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Info,
  Video,
  Calendar as CalendarIcon,
  Loader2,
  Clock,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { Link, useSearchParams } from "react-router-dom";
import { buildSessionProgress } from "@/lib/sessionProgress";
import { isKickoffRequiredError, isMonthlyBookingLimitError, isJourneyBookingLimitError } from "@/lib/bookingRules";
import {
  format,
  addDays,
  startOfMonth,
  endOfMonth,
  getDay,
  isSameDay,
  isBefore,
  isToday,
  isAfter,
} from "date-fns";
import { ptBR } from "date-fns/locale";

/* ───── Helpers ───── */

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const pillarLabels: Record<string, string> = {
  negocios: "Negócios",
  emocional: "Emocional",
  mentalidade: "Mentalidade",
  espiritual: "Espiritual",
};
const pillarClass: Record<string, string> = {
  negocios: "pillar-negocios",
  emocional: "pillar-emocional",
  mentalidade: "pillar-mentalidade",
  espiritual: "pillar-espiritual",
};

const confirmSteps = [
  { label: "Criando sala Zoom...", icon: Video, duration: 1400 },
  { label: "Adicionando ao Google Agenda...", icon: CalendarIcon, duration: 1600 },
  { label: "Confirmado", icon: CheckCircle2, duration: 800 },
];

/* ───── Component ───── */

const AgendarSessaoPage = () => {
  const { profile, user } = useAuth();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ startTime: string; endTime: string } | null>(null);
  const [notes, setNotes] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmStep, setConfirmStep] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showJourneyLimitModal, setShowJourneyLimitModal] = useState(false);
  const [monthlyOverride, setMonthlyOverride] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // ── Fetch real sessions from DB ──
  const { data: sessions = [] } = useQuery({
    queryKey: ["agendar-sessions"],
    queryFn: async () => {
      // PostgREST conflict: filtering+ordering by column "order" collides on ?order=.
      // Fetch all active and filter (order > 0) client-side.
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("is_active", true)
        .order("order");
      return (data || []).filter((s: any) => (s.order ?? 0) > 0);
    },
  });

  // ── Fetch member's real bookings ──
  const { data: bookings = [] } = useQuery({
    queryKey: ["agendar-bookings", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("bookings")
        .select("id, session_id, scheduled_date, start_time, end_time, status")
        .eq("liberty_id", profile.id);
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const progressData = useMemo(() => buildSessionProgress(sessions, bookings), [sessions, bookings]);
  const bookingStatusBySession = progressData.statusMap;

  // Kickoff (Mapeamento do Negócio): sessão de entrada — SUGERIDA, nunca bloqueante.
  // O aluno pode agendar qualquer sessão; só mostramos um aviso quando o Mapeamento
  // ainda não foi concluído (o limite de 2 sessões/mês continua valendo).
  const kickoffSession = useMemo(() => sessions.find((s: any) => s.is_kickoff), [sessions]);
  const kickoffStatus = kickoffSession ? bookingStatusBySession.get(kickoffSession.id)?.status : undefined;
  const kickoffDone = kickoffStatus === "completed";
  const kickoffScheduled = kickoffStatus === "scheduled";
  const kickoffPending = Boolean(kickoffSession) && !kickoffDone && !kickoffScheduled;
  const kickoffRequired = false;
  const hideKickoff = progressData.completedCount >= 4 || Boolean(kickoffStatus);

  const visibleSessions = useMemo(() => {
    const pending = sessions.filter((session: any) => bookingStatusBySession.get(session.id)?.status !== "completed");
    return hideKickoff ? pending.filter((session: any) => !session.is_kickoff) : pending;
  }, [sessions, hideKickoff, bookingStatusBySession]);


  const formatDuration = (min?: number | null) => {
    const m = min ?? 120;
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h === 0) return `${r}min`;
    return r === 0 ? `${h}h` : `${h}h${r}min`;
  };


  const { data: mentorSessions = [] } = useQuery({
    queryKey: ["agendar-mentor-sessions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mentor_sessions")
        .select("mentor_id, session_id")
        .eq("is_active", true);
      return data || [];
    },
  });

  const selectedSessionMentorIds = useMemo(
    () => new Set(mentorSessions.filter((item) => item.session_id === selectedSessionId).map((item) => item.mentor_id)),
    [mentorSessions, selectedSessionId]
  );

  // ── Fetch mentor availability (real data) ──
  const { data: allAvailability = [] } = useQuery({
    queryKey: ["mentor-availability-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mentor_availability")
        .select("*")
        .eq("is_booked", false);
      return data || [];
    },
  });

  // Generate available dates from mentor availability for the next 30 days
  const availabilityForSession = useMemo(() => {
    if (!selectedSessionId) return [];
    if (selectedSessionMentorIds.size === 0) return [];

    // A slot only serves this session if it is long enough to hold it (2h vs 3h diagnóstico)
    // Regra: slots de 3h (180min) são EXCLUSIVOS do Mapeamento do Negócio (diagnóstico).
    // Slots de 2h atendem apenas as demais sessões atribuídas ao mentor.
    const selectedSession = sessions.find((s) => s.id === selectedSessionId);
    const neededMinutes = selectedSession?.duration_minutes || 120;
    const selectedIsKickoff = Boolean((selectedSession as any)?.is_kickoff);
    const toMin = (t: string) => {
      const [h, m] = t.slice(0, 5).split(":").map(Number);
      return h * 60 + m;
    };
    const fits = (av: any) => {
      const slotMinutes = toMin(av.end_time) - toMin(av.start_time);
      if (selectedIsKickoff) return slotMinutes >= 180;
      return slotMinutes < 180 && slotMinutes >= neededMinutes;
    };


    const slots: { date: Date; startTime: string; endTime: string }[] = [];
    const today = new Date();
    
    allAvailability.forEach((av) => {
      if (!selectedSessionMentorIds.has(av.mentor_id)) return;
      if (!fits(av)) return;


      if (av.specific_date) {
        const d = new Date(av.specific_date + "T00:00:00");
        if (!isBefore(d, today) || isToday(d)) {
          slots.push({ date: d, startTime: av.start_time.slice(0, 5), endTime: av.end_time.slice(0, 5) });
        }
      } else if (av.is_recurring) {
        // Generate next 5 weeks of recurring slots
        for (let w = 0; w < 5; w++) {
          const baseDate = addDays(today, w * 7);
          for (let d = 0; d < 7; d++) {
            const candidate = addDays(baseDate, d);
            const dow = getDay(candidate); // 0=Sun, 1=Mon...
            if (dow === av.day_of_week && (!isBefore(candidate, today) || isToday(candidate))) {
              slots.push({
                date: candidate,
                startTime: av.start_time.slice(0, 5),
                endTime: av.end_time.slice(0, 5),
              });
            }
          }
        }
      }
    });

    return slots;
  }, [selectedSessionId, allAvailability, selectedSessionMentorIds, sessions]);

  // Auto-select session from URL param (sessionId=uuid), and optionally date/time (skip to step 4)
  useEffect(() => {
    const sessionId = searchParams.get("sessionId");
    const dateParam = searchParams.get("date"); // yyyy-MM-dd
    const timeParam = searchParams.get("time"); // HH:mm
    if (sessionId && !selectedSessionId && sessions.length > 0) {
      const match = sessions.find((s) => s.id === sessionId);
      if (match) {
        const status = bookingStatusBySession.get(match.id)?.status;
        if (status !== "completed" && status !== "scheduled") {
          setSelectedSessionId(match.id);
          if (dateParam && timeParam) {
            const d = new Date(dateParam + "T00:00:00");
            if (!isNaN(d.getTime())) {
              setSelectedDate(d);
              setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
              const dur = match.duration_minutes || 120;
              const [hh, mm] = timeParam.split(":").map(Number);
              const endMin = hh * 60 + mm + dur;
              const eh = String(Math.floor(endMin / 60) % 24).padStart(2, "0");
              const em = String(endMin % 60).padStart(2, "0");
              setSelectedSlot({ startTime: timeParam, endTime: `${eh}:${em}` });
              setStep(4);
              return;
            }
          }
          setStep(2);
        }
      }
    }
  }, [searchParams, sessions, bookingStatusBySession]);


  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  // End time always follows the session duration, not the size of the mentor's slot
  const endForSession = (startTime: string) => {
    const dur = selectedSession?.duration_minutes || 120;
    const [h, m] = startTime.slice(0, 5).split(":").map(Number);
    const total = h * 60 + m + dur;
    return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };


  // Available dates for calendar
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    availabilityForSession.forEach((a) => dates.add(a.date.toDateString()));
    return dates;
  }, [availabilityForSession]);

  // Slots for selected date
  const slotsForDate = useMemo(() => {
    if (!selectedDate) return [];
    const slots = availabilityForSession.filter((a) => isSameDay(a.date, selectedDate));
    const seen = new Set<string>();
    return slots.filter((s) => {
      if (seen.has(s.startTime)) return false;
      seen.add(s.startTime);
      return true;
    });
  }, [selectedDate, availabilityForSession]);

  // Calendar grid (7 columns, includes Sunday)
  const calendarDays = useMemo(() => {
    const start = startOfMonth(calendarMonth);
    const end = endOfMonth(calendarMonth);
    const days: (Date | null)[] = [];
    // Sunday = 0, pad from Sunday
    const startDow = getDay(start); // 0=Sun
    for (let i = 0; i < startDow; i++) days.push(null);
    let d = start;
    while (!isAfter(d, end)) {
      days.push(new Date(d));
      d = addDays(d, 1);
    }
    return days;
  }, [calendarMonth]);

  // Aprovação do administrador é necessária apenas para horários com menos de
  // 48h de antecedência. Com 48h ou mais a sessão é confirmada automaticamente.
  const isSameDayBooking = useMemo(() => {
    if (!selectedDate || !selectedSlot) return false;
    const start = new Date(`${format(selectedDate, "yyyy-MM-dd")}T${selectedSlot.startTime}:00`);
    const hours = (start.getTime() - Date.now()) / 3_600_000;
    return hours < 48;
  }, [selectedDate, selectedSlot]);


  // "Sessão repetida": existe booking concluído para a mesma sessão
  const previousCompletion = useMemo(() => {
    if (!selectedSessionId) return null;
    const past = bookings
      .filter((b) => b.session_id === selectedSessionId && b.status === "completed")
      .sort((a, b) => (a.scheduled_date < b.scheduled_date ? 1 : -1));
    return past[0] || null;
  }, [bookings, selectedSessionId]);

  // Confirm flow — now persists to database
  const handleConfirm = async (skipMonthlyWarning = false) => {
    if (isConfirming) return; // evita duplicidade em cliques repetidos
    if (!profile?.id || !selectedSessionId || !selectedDate || !selectedSlot) return;

    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const selectedMonth = dateStr.slice(0, 7);

    // Limite real: sessões da jornada já utilizadas (12 + a sessão bônus).
    const journeyUsed = bookings.filter(
      (booking) => booking.status !== "cancelled" && booking.status !== "not_realized",
    ).length;
    if (journeyUsed >= 13) {
      setShowJourneyLimitModal(true);
      return;
    }

    // 2 por mês é apenas o ritmo recomendado — avisa uma vez, sem bloquear.
    const monthlyCount = bookings.filter(
      (booking) =>
        booking.scheduled_date.startsWith(selectedMonth) &&
        booking.status !== "cancelled" &&
        booking.status !== "not_realized",
    ).length;
    if (monthlyCount >= 2 && !skipMonthlyWarning && !monthlyOverride) {
      setShowLimitModal(true);
      return;
    }

    setIsConfirming(true);
    setConfirmStep(0);

    // Find a matching availability to link
    const matchingAvail = allAvailability.find((av) => {
      if (!selectedSessionMentorIds.has(av.mentor_id)) return false;
      if (av.specific_date === dateStr && av.start_time.slice(0, 5) === selectedSlot.startTime) return true;
      if (av.is_recurring && getDay(selectedDate) === av.day_of_week && av.start_time.slice(0, 5) === selectedSlot.startTime) return true;
      return false;
    });

    const mentorId = matchingAvail?.mentor_id;
    if (!mentorId) {
      setIsConfirming(false);
      const { toast } = await import("sonner");
      toast.error("Esse horário não está mais disponível para esta sessão.");
      return;
    }

    // Menos de 48h: precisa de aprovação do administrador.
    // 48h ou mais: confirmada automaticamente na agenda.
    const needsApproval = isSameDayBooking;
    const bookingStatus = isSameDayBooking ? "pending_approval" : ("scheduled" as const);

    const { data: created, error } = await supabase.from("bookings").insert({
      liberty_id: profile.id,
      mentor_id: mentorId,
      session_id: selectedSessionId,
      scheduled_date: dateStr,
      start_time: selectedSlot.startTime + ":00",
      end_time: selectedSlot.endTime + ":00",
      status: bookingStatus as any,
      approval_required: needsApproval,

      observations: notes || null,
      availability_id: matchingAvail?.id || null,
      created_by: user?.id ?? null,
    }).select("id").single();

    if (error) {
      console.error("Booking error:", error);
      setIsConfirming(false);
      const { toast } = await import("sonner");
      // 23505 = índice único do banco: alguém reservou esse horário primeiro
      if (isJourneyBookingLimitError(error)) {
        setShowJourneyLimitModal(true);
      } else if (isMonthlyBookingLimitError(error)) {
        setShowLimitModal(true);
      } else if (isKickoffRequiredError(error)) {
        toast.error("Conclua o Mapeamento do Negócio antes de agendar outra sessão.");
      } else if (error.code === "23505") {
        toast.error("Esse horário acabou de ser reservado. Escolha outro horário.");
      } else {
        toast.error("Erro ao agendar sessão. Tente novamente.");
      }
      return;
    }

    // Mark the slot as booked so it disappears from every other session/member
    // (mentor can only do one session at that time, even if pending approval).
    if (matchingAvail) {
      await supabase.from("mentor_availability").update({ is_booked: true }).eq("id", matchingAvail.id);
    }

    // Confirmada automaticamente → já cria o evento no Google Agenda.
    // Pendente de aprovação → sincroniza só depois do OK (AdminAgenda / MentorSessoes).
    if (!needsApproval && created?.id) {
      supabase.functions
        .invoke("google-calendar-sync", { body: { booking_id: created.id } })
        .catch(() => {});
    }


  };

  useEffect(() => {
    if (!isConfirming) return;
    if (confirmStep >= confirmSteps.length) {
      setIsConfirming(false);
      setConfirmed(true);
      return;
    }
    const timer = setTimeout(
      () => setConfirmStep((s) => s + 1),
      confirmSteps[confirmStep].duration
    );
    return () => clearTimeout(timer);
  }, [isConfirming, confirmStep]);

  // Google Calendar link
  const googleCalendarUrl = useMemo(() => {
    if (!selectedSession || !selectedDate || !selectedSlot) return "#";
    const dateStr = format(selectedDate, "yyyyMMdd");
    const startStr = selectedSlot.startTime.replace(":", "") + "00";
    const endStr = selectedSlot.endTime.replace(":", "") + "00";
    const title = encodeURIComponent(`Sessão: ${selectedSession.name} · Liberty Begin`);
    const details = encodeURIComponent("Sessão de mentoria Liberty Begin. O link do Zoom será enviado por e-mail.");
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dateStr}T${startStr}/${dateStr}T${endStr}&details=${details}&ctz=America/Sao_Paulo`;
  }, [selectedSession, selectedDate, selectedSlot]);

  // Determine which step the header shows (auto-selected sessions skip step 1)
  const hasPreselection = !!searchParams.get("sessionId");
  const displayStep = hasPreselection ? step - 1 : step;
  const totalSteps = hasPreselection ? 3 : 4;

  // Block scheduling for inactive (encerrado) members — they keep read-only access.
  if (profile && profile.is_active === false) {
    return (
      <AppLayout role="liberty">
        <div className="max-w-xl mx-auto mt-16">
          <div className="glass-card p-8 text-center space-y-3">
            <h1 className="text-xl font-semibold text-foreground">Programa encerrado</h1>
            <p className="text-sm text-muted-foreground">
              Seu programa foi finalizado, então novas sessões não podem mais ser agendadas.
              Você continua com acesso aos seus materiais, relatórios e histórico.
            </p>
            <p className="text-xs text-muted-foreground">Quer voltar a agendar? Fale com nosso suporte.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout role="liberty">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="max-w-2xl mx-auto space-y-6"
      >
        {/* Header */}
        {!confirmed && !isConfirming && (
          <motion.div variants={fadeUpItem} className="flex items-center gap-3">
            {step > 1 && (
              <button
                onClick={() => {
                  if (step === 2 && hasPreselection) {
                    // Go back to journey instead of step 1
                    window.history.back();
                    return;
                  }
                  if (step === 3) { setSelectedDate(null); setSelectedSlot(null); }
                  if (step === 4) setSelectedSlot(null);
                  setStep(step - 1);
                }}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            <div>
              <h1 className="text-2xl font-semibold text-foreground">
                {selectedSession && step >= 2 ? `Agendar: ${selectedSession.name}` : "Agendar Sessão"}
              </h1>
              <p className="text-muted-foreground text-sm">Etapa {displayStep} de {totalSteps}</p>
            </div>
          </motion.div>
        )}

        {/* Progress bar */}
        {!confirmed && !isConfirming && (
          <motion.div variants={fadeUpItem} className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary"
              animate={{ width: `${(displayStep / totalSteps) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {/* ═══════ CONFIRMING ANIMATION ═══════ */}
          {isConfirming && (
            <motion.div
              key="confirming"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card p-10 text-center space-y-8"
            >
              <div className="space-y-6">
                {confirmSteps.map((cs, i) => {
                  const StepIcon = cs.icon;
                  const isDone = confirmStep > i;
                  const isActive = confirmStep === i;
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: i <= confirmStep ? 1 : 0.3, x: 0 }}
                      transition={{ delay: i * 0.15, duration: 0.3 }}
                      className={`flex items-center gap-4 ${
                        isDone ? "text-status-green" : isActive ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${
                          isDone ? "bg-status-green/15 border-status-green"
                            : isActive ? "bg-primary/10 border-primary/20"
                            : "border-border"
                        }`}
                      >
                        {isDone ? <Check className="h-4 w-4" /> : isActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <StepIcon className="h-4 w-4" />}
                      </div>
                      <span className={`text-sm font-medium ${isDone ? "text-status-green" : isActive ? "text-foreground" : ""}`}>
                        {cs.label}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ═══════ SUCCESS SCREEN ═══════ */}
          {confirmed && (
            <motion.div key="confirmed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 text-center">
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 160, damping: 14, delay: 0.1 }}
                className="relative mx-auto w-24 h-24"
              >
                <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ duration: 0.6, delay: 0.15 }} className="absolute inset-0 rounded-full bg-primary/10" />
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, delay: 0.3 }} className="absolute inset-2 rounded-full bg-status-green/15 border border-status-green/15 flex items-center justify-center">
                  <Check className="h-10 w-10 text-status-green" />
                </motion.div>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                <h2 className="text-2xl font-semibold text-foreground">Solicitação enviada ✦</h2>
                <p className="text-muted-foreground text-sm mt-2">
                  Seu horário está reservado e aguardando a confirmação do mentor. Você será notificado assim que ele responder.
                </p>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }} className="glass-card p-6 text-left max-w-sm mx-auto" style={{ transform: "none" }}>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-4 font-medium">✦ Confirmação de Sessão</p>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sessão</span>
                    <span className="text-foreground font-medium">{selectedSession?.name}</span>
                  </div>
                  <div className="border-t border-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Data</span>
                    <span className="text-foreground font-medium">{selectedDate && format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}</span>
                  </div>
                  <div className="border-t border-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Horário</span>
                    <span className="text-foreground font-medium tabular-nums">{selectedSlot?.startTime} – {selectedSlot?.endTime}</span>
                  </div>
                  <div className="border-t border-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duração</span>
                    <span className="text-foreground font-medium">{selectedSession?.duration_minutes ? `${Math.floor(selectedSession.duration_minutes / 60)}h ${selectedSession.duration_minutes % 60}min` : "1h 30min"}</span>
                  </div>
                  <div className="border-t border-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Formato</span>
                    <span className="text-foreground font-medium">Online via Zoom</span>
                  </div>
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="flex flex-col gap-3 max-w-sm mx-auto">
                <Link to="/jornada" className="btn-silver text-sm flex items-center justify-center gap-2">
                  Ver minha jornada <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <a href={googleCalendarUrl} target="_blank" rel="noopener noreferrer" className="py-3 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors flex items-center justify-center gap-2">
                  <CalendarIcon className="h-4 w-4" /> Adicionar ao Google Agenda
                </a>
              </motion.div>
            </motion.div>
          )}

          {/* ═══════ STEP 1 — Choose Session ═══════ */}
          {!isConfirming && !confirmed && step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <h2 className="text-lg font-medium text-foreground">Qual sessão você quer fazer?</h2>

              {kickoffPending && kickoffSession && !hideKickoff && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-xs text-foreground/90">
                  {kickoffRequired ? (
                    <>
                      <p className="font-semibold text-primary mb-1">
                        {kickoffScheduled ? "✦ Mapeamento do Negócio agendado" : "✦ Comece pelo Mapeamento do Negócio"}
                      </p>
                      <p className="text-muted-foreground">
                        {kickoffScheduled
                          ? "As demais sessões serão liberadas assim que o Mapeamento do Negócio for concluído."
                          : "Essa sessão de kickoff (3h) mapeia todos os setores da sua empresa e é a primeira etapa obrigatória da jornada. Ela precisa ser concluída para liberar as demais sessões."}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-primary mb-1">✦ Mapeamento do Negócio disponível</p>
                      <p className="text-muted-foreground">
                        Você já avançou na jornada, então pode agendar qualquer sessão livremente.
                      </p>
                    </>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {visibleSessions.map((session) => {
                  const status = bookingStatusBySession.get(session.id)?.status;
                  const isCompleted = status === "completed";
                  const isScheduled = status === "scheduled";
                  const isKickoff = Boolean((session as any).is_kickoff);
                  const lockedByKickoff = kickoffRequired && !isKickoff;

                  const isDisabled = isCompleted || isScheduled || lockedByKickoff;

                  return (
                    <button
                      key={session.id}
                      disabled={isDisabled}
                      onClick={() => {
                        setSelectedSessionId(session.id);
                        setSelectedDate(null);
                        setSelectedSlot(null);
                        setStep(2);
                      }}
                      className={`dark glass-card text-left relative transition-all overflow-hidden bg-card text-card-foreground ${
                        isKickoff ? "sm:col-span-2 border-primary/50 ring-1 ring-primary/30 shadow-[0_0_24px_-8px_rgba(74,122,184,0.35)]" : ""
                      } ${
                        isDisabled ? "opacity-50 cursor-not-allowed hover:transform-none hover:border-border hover:shadow-none" : "cursor-pointer"
                      }`}
                    >
                      {session.cover_image_url && (
                        <div className="relative h-20 w-full overflow-hidden">
                          <img src={session.cover_image_url} alt={session.name} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                        </div>
                      )}
                      <div className="p-5">
                        {isCompleted && <div className="absolute top-0 left-0 right-0 h-0.5 bg-status-green/50" />}
                        {isKickoff && !isCompleted && !isScheduled && (
                          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/40 via-primary to-primary/40" />
                        )}

                        <div className="flex items-start justify-between mb-3 gap-2 flex-wrap">
                          {isCompleted ? (
                            <span className="status-badge bg-status-green/15 text-status-green border border-border text-[10px]">
                              <Check className="h-3 w-3" /> Concluída
                            </span>
                          ) : isScheduled ? (
                            <span className="status-badge bg-status-blue/15 text-status-blue border border-border text-[10px]">
                              <Clock className="h-3 w-3" /> Agendada
                            </span>
                          ) : lockedByKickoff ? (
                            <span className="status-badge bg-muted text-muted-foreground border border-border text-[10px]">
                              🔒 Faça o Mapeamento primeiro
                            </span>
                          ) : (
                            <span className="status-badge bg-status-green/10 text-status-green border border-border text-[10px]">
                              Disponível
                            </span>
                          )}
                          {isKickoff && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 font-semibold uppercase tracking-wider">
                              ✦ Kickoff · Comece por aqui
                            </span>
                          )}
                        </div>

                        <h3 className={`font-medium text-foreground mb-1 ${isKickoff ? "text-base" : "text-sm"}`}>{session.name}</h3>
                        <div className="flex items-center gap-2 mb-2">
                          {session.pillar && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${pillarClass[session.pillar] || "bg-muted text-muted-foreground"}`}>
                              {pillarLabels[session.pillar] || session.pillar}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" /> {formatDuration(session.duration_minutes)}
                          </span>
                        </div>
                        {session.description && (
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                            {session.description}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

            </motion.div>
          )}

          {/* ═══════ STEP 2 — Choose Date ═══════ */}
          {!isConfirming && !confirmed && step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <div>
                <h2 className="text-lg font-medium text-foreground">Escolha uma data</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedSession?.name} · Dias com horários disponíveis estão destacados
                </p>
                {selectedSession?.description && (
                  <p className="text-xs text-muted-foreground/90 mt-2 leading-relaxed max-w-2xl">
                    {selectedSession.description}
                  </p>
                )}
              </div>

              <div className="glass-card p-5" style={{ transform: "none" }}>
                <div className="flex items-center justify-between mb-4">
                  <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <span className="text-sm font-semibold text-foreground capitalize">{format(calendarMonth, "MMMM yyyy", { locale: ptBR })}</span>
                  <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1.5 mb-1">
                  {WEEKDAY_LABELS.map((w) => (
                    <div key={w} className="text-[10px] text-muted-foreground text-center font-medium py-1">{w}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {calendarDays.map((day, i) => {
                    if (!day) return <div key={`e-${i}`} className="aspect-square" />;

                    const hasAvail = availableDates.has(day.toDateString());
                    const isPast = isBefore(day, new Date()) && !isToday(day);
                    const isClickable = hasAvail && !isPast;
                    const isSelected = selectedDate && isSameDay(day, selectedDate);

                    return (
                      <button
                        key={day.toISOString()}
                        disabled={!isClickable}
                        onClick={() => {
                          setSelectedDate(day);
                          setSelectedSlot(null);
                          setStep(3);
                        }}
                        className={`aspect-square rounded-lg text-xs font-medium relative flex items-center justify-center transition-all ${
                          isSelected ? "bg-primary text-primary-foreground ring-2 ring-primary/40"
                            : isClickable ? "bg-primary/8 text-foreground hover:bg-primary/15 cursor-pointer"
                            : "text-muted-foreground/40 cursor-not-allowed"
                        }`}
                      >
                        {day.getDate()}
                        {hasAvail && !isSelected && (
                          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-4 mt-4 text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary/30" /> Com horários</div>
                  <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-muted" /> Indisponível</div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══════ STEP 3 — Choose Time ═══════ */}
          {!isConfirming && !confirmed && step === 3 && selectedDate && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              <div>
                <h2 className="text-lg font-medium text-foreground">Escolha um horário</h2>
                <p className="text-sm text-muted-foreground capitalize">{format(selectedDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {slotsForDate.map((slot, i) => {
                  const isSelected = selectedSlot?.startTime === slot.startTime;
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setSelectedSlot({ startTime: slot.startTime, endTime: endForSession(slot.startTime) });
                        setStep(4);
                      }}
                      className={`p-4 rounded-xl border text-center transition-all ${
                        isSelected ? "bg-primary text-primary-foreground border-primary/20" : "bg-card border-border hover:border-primary/30"
                      }`}
                    >
                      <span className="text-sm font-semibold tabular-nums">{slot.startTime} – {slot.endTime}</span>
                      <p className={`text-[10px] mt-1 ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {selectedSession?.duration_minutes ? `${Math.floor(selectedSession.duration_minutes / 60)}h ${selectedSession.duration_minutes % 60}min` : "1h 30min"} · Zoom
                      </p>
                    </button>
                  );
                })}
              </div>

              {slotsForDate.length === 0 && (
                <div className="glass-card p-8 text-center" style={{ transform: "none" }}>
                  <p className="text-sm text-muted-foreground">Nenhum horário disponível neste dia</p>
                </div>
              )}
            </motion.div>
          )}

          {/* ═══════ STEP 4 — Confirm ═══════ */}
          {!isConfirming && !confirmed && step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
              <h2 className="text-lg font-medium text-foreground">Confirmar agendamento</h2>

              <div className="rounded-lg border border-status-yellow/30 bg-status-yellow/5 p-4 flex gap-3">
                <AlertTriangle className="h-5 w-5 text-status-yellow flex-shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-status-yellow">Requer confirmação do mentor</p>
                  <p className="text-muted-foreground leading-relaxed">
                    O horário fica reservado no seu nome e o mentor recebe a solicitação na hora. Assim que ele confirmar,
                    a sessão passa para <strong className="text-foreground">confirmada</strong> e entra na sua agenda.
                    {isSameDayBooking && " Como este horário começa em menos de 48 horas, ele precisa de aprovação do administrador antes de ser confirmado."}
                  </p>
                </div>
              </div>

              {previousCompletion && (
                <div className="rounded-lg border border-status-blue/30 bg-status-blue/5 p-4 flex gap-3">
                  <Info className="h-5 w-5 text-status-blue flex-shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-status-blue">Sessão repetida</p>
                    <p className="text-muted-foreground leading-relaxed">
                      Você já realizou esta sessão em{" "}
                      <strong className="text-foreground">
                        {format(new Date(previousCompletion.scheduled_date + "T00:00:00"), "dd/MM/yyyy")}
                      </strong>
                      . Você pode repeti-la. Combine com seu mentor o novo foco deste encontro.
                    </p>
                  </div>
                </div>
              )}


              <div className="glass-card p-6 relative overflow-hidden" style={{ transform: "none" }}>
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/40 via-primary to-primary/40" />
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-5 font-medium">✦ Confirmação de Sessão</p>
                <div className="space-y-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sessão</span>
                    <span className="text-foreground font-medium">{selectedSession?.name}</span>
                  </div>
                  <div className="border-t border-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Data</span>
                    <span className="text-foreground font-medium capitalize">{selectedDate && format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}</span>
                  </div>
                  <div className="border-t border-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Horário</span>
                    <span className="text-foreground font-medium tabular-nums">{selectedSlot?.startTime} – {selectedSlot?.endTime}</span>
                  </div>
                  <div className="border-t border-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duração</span>
                    <span className="text-foreground font-medium">{selectedSession?.duration_minutes ? `${Math.floor(selectedSession.duration_minutes / 60)}h ${selectedSession.duration_minutes % 60}min` : "1h 30min"}</span>
                  </div>
                  <div className="border-t border-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Formato</span>
                    <span className="text-foreground font-medium">Online via Zoom</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">
                  Deixe uma observação para o mentor <span className="text-muted-foreground/50">(opcional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.slice(0, 300))}
                  placeholder="Escreva aqui suas dúvidas ou pontos que gostaria de abordar..."
                  className="w-full bg-card border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/20 focus:outline-none resize-none h-24"
                />
                <p className="text-[10px] text-muted-foreground text-right mt-1 tabular-nums">{notes.length}/300</p>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Após enviar, o mentor confirma a sessão e você recebe o link do Zoom por e-mail.
              </p>

              <div className="flex flex-col gap-3">
                <button onClick={() => handleConfirm()} className="btn-silver w-full text-sm">
                  ENVIAR PARA CONFIRMAÇÃO
                </button>
                <button onClick={() => setStep(3)} className="py-3 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors">Voltar</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══════ AVISO DE RITMO (2 por mês) — não bloqueia ═══════ */}
        <AnimatePresence>
          {showLimitModal && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowLimitModal(false)}>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="glass-card p-6 max-w-sm w-full space-y-4" style={{ transform: "none" }}>
                <div className="flex items-center gap-3 text-status-yellow">
                  <AlertTriangle className="h-5 w-5" />
                  <h3 className="text-sm font-semibold text-foreground">Você já tem 2 sessões neste mês</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  O ritmo recomendado é de 2 sessões por mês, mas você ainda tem sessões disponíveis na sua jornada.
                  Pode seguir com este agendamento se preferir.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      setShowLimitModal(false);
                      setMonthlyOverride(true);
                      handleConfirm(true);
                    }}
                    className="btn-silver w-full text-sm"
                  >
                    Agendar mesmo assim
                  </button>
                  <button onClick={() => setShowLimitModal(false)} className="py-2.5 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Escolher outra data
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══════ JORNADA COMPLETA ═══════ */}
        <AnimatePresence>
          {showJourneyLimitModal && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowJourneyLimitModal(false)}>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="glass-card p-6 max-w-sm w-full space-y-4" style={{ transform: "none" }}>
                <div className="flex items-center gap-3 text-status-yellow">
                  <AlertTriangle className="h-5 w-5" />
                  <h3 className="text-sm font-semibold text-foreground">Jornada completa</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Todas as sessões da sua jornada já foram utilizadas. Fale com nosso suporte para liberar sessões extras.
                </p>
                <button onClick={() => setShowJourneyLimitModal(false)} className="btn-silver w-full text-sm">Entendi</button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AppLayout>
  );
};

export default AgendarSessaoPage;
