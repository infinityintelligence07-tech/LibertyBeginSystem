import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import {
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
  Star,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { canScheduleKickoff, isJourneySession, KICKOFF_NOT_ALLOWED_MESSAGE } from "@/lib/sessionProgress";
import { isMonthlyBookingLimitError, isJourneyBookingLimitError } from "@/lib/bookingRules";
import { parsePlatformDateTime, PENDING_CONFIRMATION_HINT } from "@/lib/bookingStatus";
import { invalidateMemberBookingQueries, useJourneyProgress, type JourneySession } from "@/hooks/useJourneyProgress";
import { invokeProvisionMeeting } from "@/lib/meetingWhatsApp";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Callout,
  Chip,
  ConfirmDialog,
  EmptyState,
  IconButton,
  LoadingState,
  PageContainer,
  PageHeader,
  ProgressBar,
  SectionCard,
  StatusPill,
  TextAreaField,
} from "@/components/ds";
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

/** Duração padrão quando a sessão não informa `duration_minutes`. */
const DEFAULT_SESSION_MINUTES = 120;
/** Slots de 3h (180min) são exclusivos do Mapeamento do Negócio. */
const KICKOFF_SLOT_MINUTES = 180;
/** Teto de agendamentos da jornada aceito pelo banco (12 + sessão bônus), contando só sessões com order > 0. */
const JOURNEY_BOOKING_CAP = 13;

const toMinutes = (time: string) => {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};

const sessionMinutes = (session?: Pick<JourneySession, "duration_minutes"> | null) =>
  session?.duration_minutes || DEFAULT_SESSION_MINUTES;

/** Fim da sessão a partir do início: sempre pela duração da sessão (Mapeamento = 3h), nunca pelo tamanho do slot. */
const endTimeFor = (startTime: string, minutes: number) => {
  const total = toMinutes(startTime) + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/** Um slot serve a sessão se tiver tamanho compatível: >= 3h só para o Mapeamento; < 3h para as demais. */
const slotFitsSession = (
  slot: { start_time: string; end_time: string },
  session: Pick<JourneySession, "duration_minutes" | "is_kickoff"> | null | undefined,
) => {
  const slotMinutes = toMinutes(slot.end_time) - toMinutes(slot.start_time);
  if (session?.is_kickoff) return slotMinutes >= KICKOFF_SLOT_MINUTES;
  return slotMinutes < KICKOFF_SLOT_MINUTES && slotMinutes >= sessionMinutes(session);
};

const formatDuration = (min?: number | null) => {
  const m = min ?? DEFAULT_SESSION_MINUTES;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}min`;
  return r === 0 ? `${h}h` : `${h}h ${r}min`;
};

/** Erro do índice único (liberty_id, session_id): o membro já tem essa sessão agendada ou realizada. */
const isDuplicateSessionError = (error: { code?: string; message?: string | null; details?: string | null }) =>
  `${error.message ?? ""} ${error.details ?? ""}`.includes("bookings_unique_liberty_session_active");

const isKickoffNotAllowedError = (error: { message?: string | null; details?: string | null }) =>
  `${error.message ?? ""} ${error.details ?? ""}`.includes("KICKOFF_NOT_ALLOWED");

const pillarLabels: Record<string, string> = {
  negocios: "Negócios",
  emocional: "Emocional",
  mentalidade: "Mentalidade",
  espiritual: "Espiritual",
};
const confirmStepsScheduled = [
  { label: "Confirmando agendamento...", icon: CalendarIcon, duration: 1000 },
  { label: "Criando sala Meet...", icon: Video, duration: 1600 },
  { label: "Confirmado", icon: CheckCircle2, duration: 800 },
];
const confirmStepsPending = [
  { label: "Confirmando agendamento...", icon: CalendarIcon, duration: 1400 },
  { label: "Confirmado", icon: CheckCircle2, duration: 800 },
];

/* ───── Component ───── */

const AgendarSessaoPage = () => {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ startTime: string; endTime: string } | null>(null);
  const [notes, setNotes] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmStep, setConfirmStep] = useState(0);
  const [confirmSteps, setConfirmSteps] = useState(confirmStepsScheduled);
  const [confirmed, setConfirmed] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showJourneyLimitModal, setShowJourneyLimitModal] = useState(false);
  const [monthlyOverride, setMonthlyOverride] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // ── Sessões + agendamentos do membro (fonte única, com is_retroactive/report_required) ──
  const {
    sessions: allSessions,
    activeSessions,
    bookings,
    progress: progressData,
    kickoffSession,
    kickoffAllowed,
    isLoading: isJourneyLoading,
  } = useJourneyProgress();

  /** Sessões agendáveis: ativas e da jornada (order > 0). Onboarding fica de fora. */
  const sessions = useMemo(() => activeSessions.filter(isJourneySession), [activeSessions]);
  const bookingStatusBySession = progressData.statusMap;

  // Mapeamento do Negócio (kickoff): sugerido para o início, nunca obrigatório.
  // D2: só pode ser agendado enquanto o membro tiver até 3 sessões realizadas (mesma regra do banco).
  const kickoffStatus = kickoffSession ? bookingStatusBySession.get(kickoffSession.id)?.status : undefined;
  const kickoffPending = Boolean(kickoffSession) && !kickoffStatus;
  const hideKickoff = !kickoffAllowed;

  const visibleSessions = useMemo(() => {
    const pending = sessions.filter((session) => bookingStatusBySession.get(session.id)?.status !== "completed");
    return hideKickoff ? pending.filter((session) => !session.is_kickoff) : pending;
  }, [sessions, hideKickoff, bookingStatusBySession]);


  const { data: mentorSessions = [] } = useQuery({
    queryKey: ["agendar-mentor-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mentor_sessions")
        .select("mentor_id, session_id")
        .eq("is_active", true);
      if (error) throw error;
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
      const { data, error } = await supabase
        .from("mentor_availability")
        .select("*")
        .eq("is_booked", false);
      if (error) throw error;
      return data || [];
    },
  });

  // Generate available dates from mentor availability for the next 30 days
  const availabilityForSession = useMemo(() => {
    if (!selectedSessionId) return [];
    if (selectedSessionMentorIds.size === 0) return [];

    // Um slot só serve esta sessão se tiver tamanho compatível (2h vs 3h do Mapeamento).
    const selectedSession = sessions.find((s) => s.id === selectedSessionId);

    const slots: { date: Date; startTime: string; endTime: string }[] = [];
    const now = new Date();
    // Horários de hoje que já passaram não podem ser oferecidos (comparação no fuso da plataforma).
    const isStillAhead = (date: Date, startTime: string) => {
      const start = parsePlatformDateTime(format(date, "yyyy-MM-dd"), startTime);
      return start ? start.getTime() > now.getTime() : false;
    };

    allAvailability.forEach((av) => {
      if (!selectedSessionMentorIds.has(av.mentor_id)) return;
      if (!slotFitsSession(av, selectedSession)) return;
      const startTime = av.start_time.slice(0, 5);
      const endTime = av.end_time.slice(0, 5);

      if (av.specific_date) {
        const d = new Date(av.specific_date + "T00:00:00");
        if ((!isBefore(d, now) || isToday(d)) && isStillAhead(d, startTime)) {
          slots.push({ date: d, startTime, endTime });
        }
      } else if (av.is_recurring) {
        // Generate next 5 weeks of recurring slots
        for (let w = 0; w < 5; w++) {
          const baseDate = addDays(now, w * 7);
          for (let d = 0; d < 7; d++) {
            const candidate = addDays(baseDate, d);
            const dow = getDay(candidate); // 0=Sun, 1=Mon...
            if (dow === av.day_of_week && (!isBefore(candidate, now) || isToday(candidate)) && isStillAhead(candidate, startTime)) {
              slots.push({ date: candidate, startTime, endTime });
            }
          }
        }
      }
    });

    return slots;
  }, [selectedSessionId, allAvailability, selectedSessionMentorIds, sessions]);

  // Auto-select session from URL param (sessionId=uuid), and optionally date/time (skip to step 4).
  // Roda uma única vez, depois que sessões e agendamentos carregaram (senão a regra do
  // Mapeamento seria avaliada com a lista de agendamentos ainda vazia).
  const preselectHandledRef = useRef(false);
  useEffect(() => {
    if (preselectHandledRef.current || isJourneyLoading) return;
    const sessionId = searchParams.get("sessionId");
    if (!sessionId || selectedSessionId || sessions.length === 0) return;
    preselectHandledRef.current = true;

    const dateParam = searchParams.get("date"); // yyyy-MM-dd
    const timeParam = searchParams.get("time"); // HH:mm
    const match = sessions.find((s) => s.id === sessionId);
    if (!match) return;

    // D2: o link direto (?sessionId=) não pode contornar a regra do Mapeamento.
    if (match.is_kickoff && !kickoffAllowed) {
      toast.error(KICKOFF_NOT_ALLOWED_MESSAGE);
      setStep(1);
      return;
    }
    // Sessão já realizada, agendada ou "a confirmar": o banco não aceita um 2º agendamento.
    const status = bookingStatusBySession.get(match.id)?.status;
    if (status) {
      toast.error(
        status === "completed"
          ? "Você já realizou esta sessão. Escolha outra sessão da jornada."
          : "Esta sessão já está agendada. Escolha outra sessão da jornada.",
      );
      setStep(1);
      return;
    }

    setSelectedSessionId(match.id);
    if (dateParam && timeParam) {
      const d = new Date(dateParam + "T00:00:00");
      if (!isNaN(d.getTime())) {
        setSelectedDate(d);
        setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
        setSelectedSlot({ startTime: timeParam, endTime: endTimeFor(timeParam, sessionMinutes(match)) });
        setStep(4);
        return;
      }
    }
    setStep(2);
  }, [searchParams, sessions, bookingStatusBySession, kickoffAllowed, isJourneyLoading, selectedSessionId]);


  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  // End time always follows the session duration, not the size of the mentor's slot
  const endForSession = (startTime: string) => endTimeFor(startTime, sessionMinutes(selectedSession));
  const durationLabel = formatDuration(selectedSession?.duration_minutes);


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
    // Horário da plataforma (São Paulo), independente do fuso do navegador.
    const start = parsePlatformDateTime(format(selectedDate, "yyyy-MM-dd"), `${selectedSlot.startTime}:00`);
    if (!start) return false;
    const hours = (start.getTime() - Date.now()) / 3_600_000;
    return hours < 48;
  }, [selectedDate, selectedSlot]);

  // Confirm flow — now persists to database
  const handleConfirm = async (skipMonthlyWarning = false) => {
    if (isConfirming) return; // evita duplicidade em cliques repetidos
    if (!profile?.id || !selectedSessionId || !selectedDate || !selectedSlot) return;
    const sessionToBook = sessions.find((s) => s.id === selectedSessionId);
    if (!sessionToBook) return;

    // D2: revalida a regra do Mapeamento com os dados mais recentes antes de gravar.
    if (sessionToBook.is_kickoff && !canScheduleKickoff(allSessions, bookings)) {
      toast.error(KICKOFF_NOT_ALLOWED_MESSAGE);
      setSelectedSessionId(null);
      setSelectedDate(null);
      setSelectedSlot(null);
      setStep(1);
      return;
    }
    // O banco não aceita um 2º agendamento ativo da mesma sessão.
    if (bookingStatusBySession.get(sessionToBook.id)) {
      toast.error("Você já tem essa sessão agendada ou realizada. Escolha outra sessão da jornada.");
      setStep(1);
      return;
    }

    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const selectedMonth = dateStr.slice(0, 7);

    // Limite real (mesmo critério do banco): agendamentos ativos em sessões da jornada (order > 0).
    // `bookings` já exclui cancelados e não realizados.
    const journeySessionIds = new Set(allSessions.filter(isJourneySession).map((s) => s.id));
    const journeyBookings = bookings.filter((booking) => journeySessionIds.has(booking.session_id));
    if (journeyBookings.length >= JOURNEY_BOOKING_CAP) {
      setShowJourneyLimitModal(true);
      return;
    }

    // 2 por mês é apenas o ritmo recomendado — avisa uma vez, sem bloquear.
    const monthlyCount = journeyBookings.filter((booking) => booking.scheduled_date.startsWith(selectedMonth)).length;
    if (monthlyCount >= 2 && !skipMonthlyWarning && !monthlyOverride) {
      setShowLimitModal(true);
      return;
    }

    setIsConfirming(true);
    setConfirmStep(0);
    setConfirmSteps(isSameDayBooking ? confirmStepsPending : confirmStepsScheduled);

    // Disponibilidade correspondente: mesmo mentor da sessão, mesmo horário e tamanho compatível com a sessão.
    const matchingAvail = allAvailability.find((av) => {
      if (!selectedSessionMentorIds.has(av.mentor_id)) return false;
      if (!slotFitsSession(av, sessionToBook)) return false;
      if (av.start_time.slice(0, 5) !== selectedSlot.startTime) return false;
      if (av.specific_date === dateStr) return true;
      return Boolean(av.is_recurring) && getDay(selectedDate) === av.day_of_week;
    });

    const mentorId = matchingAvail?.mentor_id;
    if (!mentorId) {
      setIsConfirming(false);
      toast.error("Esse horário não está mais disponível para esta sessão.");
      return;
    }

    // Menos de 48h: precisa de aprovação do administrador.
    // 48h ou mais: confirmada automaticamente na agenda.
    const needsApproval = isSameDayBooking;
    const bookingStatus: "pending_approval" | "scheduled" = needsApproval ? "pending_approval" : "scheduled";
    // Fim sempre pela duração da sessão escolhida (Mapeamento = 3h), nunca pelo tamanho do slot.
    const endTime = endTimeFor(selectedSlot.startTime, sessionMinutes(sessionToBook));

    const { data: created, error } = await supabase.from("bookings").insert({
      liberty_id: profile.id,
      mentor_id: mentorId,
      session_id: selectedSessionId,
      scheduled_date: dateStr,
      start_time: selectedSlot.startTime + ":00",
      end_time: endTime + ":00",
      status: bookingStatus,
      approval_required: needsApproval,
      observations: notes || null,
      availability_id: matchingAvail?.id || null,
      created_by: user?.id ?? null,
    }).select("id").single();

    if (error) {
      console.error("Booking error:", error);
      setIsConfirming(false);
      if (isJourneyBookingLimitError(error)) {
        setShowJourneyLimitModal(true);
      } else if (isMonthlyBookingLimitError(error)) {
        setShowLimitModal(true);
      } else if (isKickoffNotAllowedError(error)) {
        toast.error(KICKOFF_NOT_ALLOWED_MESSAGE);
        setStep(1);
      } else if (isDuplicateSessionError(error)) {
        toast.error("Você já tem essa sessão agendada ou realizada. Escolha outra sessão da jornada.");
        setStep(1);
      } else if (error.code === "23505") {
        // Índice único de horário do mentor: alguém reservou esse horário primeiro.
        toast.error("Esse horário acabou de ser reservado. Escolha outro horário.");
        setSelectedSlot(null);
        setStep(3);
      } else {
        toast.error("Erro ao agendar sessão. Tente novamente.");
      }
      // Recarrega agendamentos e disponibilidade para a tela refletir o estado real.
      void invalidateMemberBookingQueries(queryClient);
      return;
    }

    // Mark the slot as booked so it disappears from every other session/member
    // (mentor can only do one session at that time, even if pending approval).
    if (matchingAvail) {
      const { error: availError } = await supabase
        .from("mentor_availability")
        .update({ is_booked: true })
        .eq("id", matchingAvail.id);
      if (availError) console.error("Availability update error:", availError);
    }

    // Confirmada automaticamente → provisiona Meet + sincroniza Google Agenda.
    // Pendente de aprovação → provisiona só depois do OK (AdminAgenda / MentorSessoes).
    if (!needsApproval && created?.id) {
      const provision = await invokeProvisionMeeting(created.id);
      if (!provision?.ok) {
        toast.warning(
          provision?.error ||
            provision?.message ||
            "Sala Meet não criada. O agendamento está confirmado — a equipe pode tentar de novo.",
        );
      }
      // Backup: provision-meeting já tenta o calendário; mantém sync explícito.
      supabase.functions
        .invoke("google-calendar-sync", { body: { booking_id: created.id } })
        .catch(() => {});
    }

    // Dashboard, Jornada, Agenda e visão geral precisam refletir o novo agendamento na hora.
    void invalidateMemberBookingQueries(queryClient);
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
  }, [isConfirming, confirmStep, confirmSteps]);

  // Google Calendar link
  const googleCalendarUrl = useMemo(() => {
    if (!selectedSession || !selectedDate || !selectedSlot) return "#";
    const dateStr = format(selectedDate, "yyyyMMdd");
    const startStr = selectedSlot.startTime.replace(":", "") + "00";
    const endStr = selectedSlot.endTime.replace(":", "") + "00";
    const title = encodeURIComponent(`Sessão: ${selectedSession.name} · Liberty Begin`);
    const details = encodeURIComponent("Sessão de mentoria Liberty Begin. O link do Google Meet será enviado por e-mail.");
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
        <PageContainer variant="narrow">
          <PageHeader title="Programa encerrado" back="/jornada" />
          <Callout tone="info" icon={Info} className="mt-6">
            <p>
              Seu programa foi finalizado, então novas sessões não podem mais ser agendadas.
              Você continua com acesso aos seus materiais, relatórios e histórico.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Quer voltar a agendar? Fale com nosso suporte.</p>
          </Callout>
        </PageContainer>
      </AppLayout>
    );
  }

  const goBack = () => {
    if (step === 2 && hasPreselection) {
      // Volta para a jornada em vez do passo 1
      window.history.back();
      return;
    }
    if (step === 3) { setSelectedDate(null); setSelectedSlot(null); }
    if (step === 4) setSelectedSlot(null);
    setStep(step - 1);
  };

  const stepTitle =
    step === 1 ? "Qual sessão você quer fazer?"
    : step === 2 ? "Escolha uma data"
    : step === 3 ? "Escolha um horário"
    : "Confirmar agendamento";

  return (
    <AppLayout role="liberty">
      <PageContainer variant="narrow" className={step === 4 && !confirmed && !isConfirming ? "pb-28 sm:pb-0" : undefined}>
      <div className="space-y-6">
        {/* Cabeçalho */}
        {!confirmed && !isConfirming && (
          <div className="space-y-4">
            <PageHeader
              eyebrow={`Passo ${displayStep} de ${totalSteps}`}
              title={stepTitle}
              description={selectedSession && step >= 2 ? selectedSession.name : "Agende sua próxima sessão de mentoria."}
              back={step > 1 ? goBack : undefined}
            />
            <ProgressBar value={displayStep} max={totalSteps} label={`Passo ${displayStep} de ${totalSteps}`} />
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* ═══════ CONFIRMANDO ═══════ */}
          {isConfirming && (
            <motion.div
              key="confirming"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <SectionCard aria-live="polite" aria-busy="true">
                <ol className="space-y-5 list-none m-0 p-0">
                  {confirmSteps.map((cs, i) => {
                    const StepIcon = cs.icon;
                    const isDone = confirmStep > i;
                    const isActive = confirmStep === i;
                    return (
                      <li
                        key={i}
                        className={cn(
                          "flex items-center gap-4 transition-opacity duration-ds-2 ease-ds",
                          i > confirmStep && "opacity-40",
                        )}
                      >
                        <span className={cn("shrink-0 inline-flex items-center justify-center", isDone || isActive ? "text-foreground" : "text-muted-foreground")}>
                          {isDone ? <Check className="h-5 w-5" aria-hidden /> : isActive ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <StepIcon className="h-5 w-5" aria-hidden />}
                        </span>
                        <span className={cn("text-sm font-medium", isDone || isActive ? "text-foreground" : "text-muted-foreground")}>
                          {cs.label}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </SectionCard>
            </motion.div>
          )}

          {/* ═══════ SUCCESS SCREEN ═══════ */}
          {confirmed && (
            <motion.div key="confirmed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="space-y-6">
              <div className="text-center space-y-4">
                <Check className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
                <PageHeader
                  title={isSameDayBooking ? "Solicitação enviada" : "Sessão agendada"}
                  description={
                    isSameDayBooking
                      ? "Como o horário começa em menos de 48 horas, a sessão aguarda a aprovação da equipe. Você será avisado assim que for confirmada."
                      : "Seu horário está confirmado na agenda do mentor. O link do Google Meet chega por e-mail e fica disponível na sua agenda."
                  }
                  className="justify-center text-center"
                />
              </div>

              <SectionCard>
                <p className="ds-kicker mb-4">Resumo da sessão</p>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Sessão</dt>
                    <dd className="text-foreground font-medium text-right">{selectedSession?.name}</dd>
                  </div>
                  <div className="border-t border-border" />
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Data</dt>
                    <dd className="text-foreground font-medium text-right first-letter:uppercase">{selectedDate && format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}</dd>
                  </div>
                  <div className="border-t border-border" />
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Horário</dt>
                    <dd className="text-foreground font-medium tabular-nums">{selectedSlot?.startTime} às {selectedSlot?.endTime}</dd>
                  </div>
                  <div className="border-t border-border" />
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Duração</dt>
                    <dd className="text-foreground font-medium">{durationLabel}</dd>
                  </div>
                  <div className="border-t border-border" />
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Formato</dt>
                    <dd className="text-foreground font-medium">Online via Google Meet</dd>
                  </div>
                </dl>
              </SectionCard>

              <div className="flex flex-col gap-3">
                <Button asChild size="lg" className="w-full">
                  <Link to="/jornada">
                    Ver minha jornada <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="w-full">
                  <a href={googleCalendarUrl} target="_blank" rel="noopener noreferrer">
                    <CalendarIcon className="h-4 w-4" aria-hidden /> Adicionar ao Google Agenda
                  </a>
                </Button>
              </div>
            </motion.div>
          )}

          {/* ═══════ STEP 1 — Choose Session ═══════ */}
          {!isConfirming && !confirmed && step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-4">
              {kickoffPending && kickoffSession && kickoffAllowed && (
                <Callout tone="brand" icon={Star} title="Mapeamento do Negócio: recomendado para o início da jornada">
                  Sessão de 3h que mapeia todos os setores da sua empresa. Pode ser agendada até a 3ª sessão realizada.
                  Você também pode escolher qualquer outra sessão.
                </Callout>
              )}

              {isJourneyLoading && visibleSessions.length === 0 && (
                <LoadingState variant="cards" rows={4} />
              )}

              {!isJourneyLoading && visibleSessions.length === 0 && (
                <EmptyState
                  icon={CalendarIcon}
                  title="Nenhuma sessão disponível para agendar"
                  description="Todas as sessões da sua jornada já foram agendadas ou realizadas."
                  action={
                    <Button asChild variant="outline">
                      <Link to="/jornada">Ver minha jornada</Link>
                    </Button>
                  }
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="list">
                {visibleSessions.map((session) => {
                  const status = bookingStatusBySession.get(session.id)?.status;
                  const isCompleted = status === "completed";
                  // Agendada ou "A confirmar": ocupa a vaga, o banco não aceita um 2º agendamento.
                  const isScheduled = status === "scheduled" || status === "pending_confirmation";
                  const isKickoff = Boolean(session.is_kickoff);

                  const isDisabled = isCompleted || isScheduled;

                  return (
                    <SectionCard
                      key={session.id}
                      as="button"
                      interactive={!isDisabled}
                      padding="none"
                      role="listitem"
                      aria-disabled={isDisabled}
                      tabIndex={isDisabled ? -1 : undefined}
                      onClick={() => {
                        if (isDisabled) return;
                        setSelectedSessionId(session.id);
                        setSelectedDate(null);
                        setSelectedSlot(null);
                        setStep(2);
                      }}
                      className={cn(
                        "text-left overflow-hidden",
                        isKickoff && "sm:col-span-2",
                        isDisabled && "opacity-60 cursor-not-allowed",
                      )}
                    >
                      {session.cover_image_url && (
                        <div className="relative h-24 w-full overflow-hidden">
                          <img src={session.cover_image_url} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="p-4 sm:p-5">
                        <div className="flex items-start justify-between mb-2 gap-2 flex-wrap">
                          {status ? (
                            <span title={status === "pending_confirmation" ? PENDING_CONFIRMATION_HINT : undefined} className="inline-flex">
                              <StatusPill status={status} size="sm" />
                            </span>
                          ) : (
                            <StatusPill tone="success" size="sm">Disponível</StatusPill>
                          )}
                          {isKickoff && (
                            <StatusPill tone="neutral" size="sm" withDot={false}>
                              <Star className="h-3.5 w-3.5 text-muted-foreground" aria-label="Mapeamento" /> Mapeamento · recomendado
                            </StatusPill>
                          )}
                        </div>

                        <h3 className="text-[17px] font-semibold text-foreground leading-tight mb-1">{session.name}</h3>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {session.pillar && (
                            <StatusPill tone="neutral" size="sm" withDot={false}>
                              {pillarLabels[session.pillar] || session.pillar}
                            </StatusPill>
                          )}
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden /> {formatDuration(session.duration_minutes)}
                          </span>
                        </div>
                        {session.description && (
                          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                            {session.description}
                          </p>
                        )}
                      </div>
                    </SectionCard>
                  );
                })}
              </div>

            </motion.div>
          )}

          {/* ═══════ STEP 2 — Choose Date ═══════ */}
          {!isConfirming && !confirmed && step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-4">
              {selectedSession?.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {selectedSession.description}
                </p>
              )}

              <SectionCard padding="compact">
                <div className="flex items-center justify-between mb-3">
                  <IconButton
                    aria-label="Mês anterior"
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </IconButton>
                  <span className="text-sm font-semibold text-foreground first-letter:uppercase" aria-live="polite">
                    {format(calendarMonth, "MMMM yyyy", { locale: ptBR })}
                  </span>
                  <IconButton
                    aria-label="Próximo mês"
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </IconButton>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-1" aria-hidden>
                  {WEEKDAY_LABELS.map((w) => (
                    <div key={w} className="text-xs text-muted-foreground text-center font-medium py-1">{w}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Dias do mês">
                  {calendarDays.map((day, i) => {
                    if (!day) return <div key={`e-${i}`} className="aspect-square" />;

                    const hasAvail = availableDates.has(day.toDateString());
                    const isPast = isBefore(day, new Date()) && !isToday(day);
                    const isClickable = hasAvail && !isPast;
                    const isSelected = Boolean(selectedDate && isSameDay(day, selectedDate));

                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        disabled={!isClickable}
                        aria-pressed={isSelected}
                        aria-label={`${format(day, "EEEE, dd 'de' MMMM", { locale: ptBR })}${isClickable ? ", com horários" : ", indisponível"}`}
                        onClick={() => {
                          setSelectedDate(day);
                          setSelectedSlot(null);
                          setStep(3);
                        }}
                        className={cn(
                          "aspect-square min-h-[44px] rounded-ds text-sm font-medium relative flex items-center justify-center transition-colors duration-ds-1 ease-ds",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
                          isSelected ? "bg-primary text-primary-foreground"
                            : isClickable ? "bg-muted text-foreground hover:bg-accent"
                            : "text-muted-foreground/40 cursor-not-allowed",
                        )}
                      >
                        {day.getDate()}
                        {hasAvail && !isSelected && (
                          <span aria-hidden className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5"><span aria-hidden className="w-2 h-2 rounded-full bg-primary" /> Com horários</div>
                  <div className="flex items-center gap-1.5"><span aria-hidden className="w-2 h-2 rounded-full bg-muted-foreground/40" /> Indisponível</div>
                </div>
              </SectionCard>
            </motion.div>
          )}

          {/* ═══════ PASSO 3: horário ═══════ */}
          {!isConfirming && !confirmed && step === 3 && selectedDate && (
            <motion.div key="step3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-4">
              <p className="text-sm text-muted-foreground first-letter:uppercase">
                {format(selectedDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })} · {durationLabel} · Meet
              </p>

              {slotsForDate.length > 0 ? (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Horários disponíveis">
                  {slotsForDate.map((slot, i) => {
                    const isSelected = selectedSlot?.startTime === slot.startTime;
                    return (
                      <Chip
                        key={i}
                        active={isSelected}
                        className="h-11 px-4 text-sm tabular-nums"
                        onClick={() => {
                          setSelectedSlot({ startTime: slot.startTime, endTime: endForSession(slot.startTime) });
                          setStep(4);
                        }}
                      >
                        {slot.startTime} às {endForSession(slot.startTime)}
                      </Chip>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  compact
                  icon={Clock}
                  title="Nenhum horário disponível neste dia"
                  description="Escolha outra data no calendário."
                  action={
                    <Button variant="outline" size="sm" onClick={goBack}>Escolher outra data</Button>
                  }
                />
              )}
            </motion.div>
          )}

          {/* ═══════ STEP 4 — Confirm ═══════ */}
          {!isConfirming && !confirmed && step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-5">
              {isSameDayBooking ? (
                <Callout tone="warning" icon={AlertTriangle} title="Requer aprovação da equipe">
                  Este horário começa em menos de 48 horas. Ele fica reservado no seu nome e a sessão passa para{" "}
                  <strong className="text-foreground">confirmada</strong> assim que a equipe aprovar.
                </Callout>
              ) : (
                <Callout tone="info" icon={Info} title="Confirmação automática">
                  Com 48 horas ou mais de antecedência, a sessão entra confirmada na sua agenda e na do mentor.
                  O link do Google Meet chega por e-mail.
                </Callout>
              )}

              <SectionCard>
                <p className="ds-kicker mb-4">Resumo da sessão</p>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Sessão</dt>
                    <dd className="text-foreground font-medium text-right">{selectedSession?.name}</dd>
                  </div>
                  <div className="border-t border-border" />
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Data</dt>
                    <dd className="text-foreground font-medium text-right first-letter:uppercase">{selectedDate && format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}</dd>
                  </div>
                  <div className="border-t border-border" />
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Horário</dt>
                    <dd className="text-foreground font-medium tabular-nums">{selectedSlot?.startTime} às {selectedSlot?.endTime}</dd>
                  </div>
                  <div className="border-t border-border" />
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Duração</dt>
                    <dd className="text-foreground font-medium">{durationLabel}</dd>
                  </div>
                  <div className="border-t border-border" />
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Formato</dt>
                    <dd className="text-foreground font-medium">Online via Google Meet</dd>
                  </div>
                </dl>
              </SectionCard>

              <TextAreaField
                label="Observação para o mentor (opcional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 300))}
                placeholder="Escreva aqui suas dúvidas ou pontos que gostaria de abordar..."
                rows={4}
                className="resize-none"
                hint={<span className="tabular-nums">{notes.length}/300</span>}
              />

              <p className="text-xs text-muted-foreground text-center">
                {isSameDayBooking
                  ? "Após enviar, a equipe aprova a sessão e você recebe o link do Google Meet por e-mail."
                  : "Após confirmar, a sessão entra na sua agenda e você recebe o link do Google Meet por e-mail."}
              </p>

              {/* Ações: fixas na base no mobile, inline no desktop */}
              <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] sm:static sm:border-0 sm:bg-transparent sm:p-0">
                <div className="mx-auto w-full max-w-2xl flex flex-col gap-2 sm:flex-row-reverse">
                  <Button size="lg" className="w-full sm:w-auto" onClick={() => handleConfirm()}>
                    {isSameDayBooking ? "Enviar para aprovação" : "Confirmar agendamento"}
                  </Button>
                  <Button variant="outline" size="lg" className="w-full sm:w-auto" onClick={() => setStep(3)}>
                    Voltar
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══════ AVISO DE RITMO (2 por mês): não bloqueia ═══════ */}
        <ConfirmDialog
          open={showLimitModal}
          onOpenChange={setShowLimitModal}
          title="Você já tem 2 sessões neste mês"
          description="O ritmo recomendado é de 2 sessões por mês, mas você ainda tem sessões disponíveis na sua jornada. Pode seguir com este agendamento se preferir."
          confirmLabel="Agendar mesmo assim"
          cancelLabel="Escolher outra data"
          onConfirm={() => {
            setShowLimitModal(false);
            setMonthlyOverride(true);
            handleConfirm(true);
          }}
        />

        {/* ═══════ JORNADA COMPLETA ═══════ */}
        <ConfirmDialog
          open={showJourneyLimitModal}
          onOpenChange={setShowJourneyLimitModal}
          title="Jornada completa"
          description="Todas as sessões da sua jornada já foram utilizadas. Fale com nosso suporte para liberar sessões extras."
          confirmLabel="Entendi"
          cancelLabel="Fechar"
          onConfirm={() => setShowJourneyLimitModal(false)}
        />
      </div>
      </PageContainer>
    </AppLayout>
  );
};

export default AgendarSessaoPage;
