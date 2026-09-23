import { useMemo, useState } from "react";
import { CalendarDays, Target, FileText, TrendingUp, TrendingDown, Minus, Star, Lock, LockOpen, CheckCircle2, XCircle, FileWarning } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  bookingRequiresReport,
  bookingStatusConfig,
  daysSinceBookingEnd,
  getEffectiveBookingStatus,
  isBookingPast,
  isPendingConfirmationOverdue,
  isVisibleSessionBooking,
  PENDING_CONFIRMATION_HINT,
} from "@/lib/bookingStatus";
import { translateBookingError } from "@/components/MemberSessionEditor";
import { shortName } from "@/lib/formatName";
import { Button } from "@/components/ui/button";
import { BottomSheet, Callout, ConfirmDialog, EmptyState, SectionCard, SectionHeader, StatusPill } from "@/components/ds";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

interface Booking {
  id: string;
  session_id: string;
  mentor_id?: string | null;
  scheduled_date: string;
  start_time?: string | null;
  end_time?: string | null;
  status: string;
  is_retroactive?: boolean | null;
  report_required?: boolean | null;
  /** Vem do join `sessions(is_kickoff, name, order, duration_minutes)` quando o caller o traz. */
  sessions?: { is_kickoff?: boolean | null; name?: string | null; order?: number | null; duration_minutes?: number | null } | null;
}

interface Props {
  profile: any;
  bookings: Booking[];
  sessionNames: Record<string, string>;
  mentorNames: Record<string, string>;
  reports: Record<string, any>;
  reportRoute?: (bookingId: string) => string;
  totalSessions?: number;
  hideReportButton?: boolean;
  /** Ids das sessões que compõem a jornada (order > 0). Onboarding fica de fora. */
  journeySessionIds?: Set<string> | string[];
  /** Ids das sessões de Mapeamento (kickoff), para callers cujo select não traz `sessions(is_kickoff)`. */
  kickoffSessionIds?: Set<string> | string[];
  /** Chamado após o admin/mentor fechar uma sessão "A confirmar" pelo modal. */
  onChanged?: () => void;
}

const fmtDate = (iso?: string | null) => {
  if (!iso) return "Sem dados";
  try { return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }); }
  catch { return String(iso); }
};

export const MemberTimeline = ({
  profile, bookings, sessionNames, mentorNames, reports, reportRoute,
  totalSessions = 12, hideReportButton = false, journeySessionIds, kickoffSessionIds, onChanged,
}: Props) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [openBookingId, setOpenBookingId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [pendingClose, setPendingClose] = useState<{ booking: Booking; status: "completed" | "not_realized" } | null>(null);

  const explicitStart = profile?.program_start_date ? new Date(profile.program_start_date + "T12:00:00") : null;
  const explicitEnd = profile?.program_end_date ? new Date(profile.program_end_date + "T12:00:00") : null;

  // Timeline is strictly based on the member's program dates.
  // If either is missing, we show a placeholder instead of inventing dates from bookings.
  const hasProgramDates = !!(explicitStart && explicitEnd);
  const projectedMonths = Math.ceil(totalSessions / 2);
  const startDate = explicitStart ?? new Date();
  const endDate = explicitEnd ?? new Date(startDate.getFullYear(), startDate.getMonth() + projectedMonths, startDate.getDate());

  // A jornada tem 12 sessões. O Onboarding (order 0) NUNCA entra na trilha.
  const journeyIds = useMemo(
    () => (journeySessionIds ? new Set(Array.from(journeySessionIds as Iterable<string>)) : null),
    [journeySessionIds]
  );
  const kickoffIds = useMemo(
    () => (kickoffSessionIds ? new Set(Array.from(kickoffSessionIds as Iterable<string>)) : null),
    [kickoffSessionIds]
  );

  // A estrela depende de `sessions.is_kickoff`, nunca da posição na trilha (alguns membros nunca fazem o Mapeamento).
  const isKickoffBooking = (b: Booking) => b.sessions?.is_kickoff === true || Boolean(kickoffIds?.has(b.session_id));

  // Numeração CRONOLÓGICA: a 1ª sessão que aconteceu é a bolinha 1.
  const chronological = useMemo(() => [...bookings]
    .filter(isVisibleSessionBooking)
    .filter((b) => {
      if (journeyIds) return journeyIds.has(b.session_id);
      // Fallback: sem os ids da jornada, exclui pelo nome da sessão.
      return !/^onboarding$/i.test((sessionNames[b.session_id] || b.sessions?.name || "").trim());
    })
    .sort((a, b) => `${a.scheduled_date}T${a.start_time || ""}`.localeCompare(`${b.scheduled_date}T${b.start_time || ""}`)),
  [bookings, journeyIds, sessionNames]);

  const statusFor = (booking: Booking) => getEffectiveBookingStatus(booking, { hasReport: Boolean(reports[booking.id]) });
  const isRealized = (status: string) => status === "completed" || status === "awaiting_report";
  const reachedCount = chronological.filter((b) => isRealized(statusFor(b))).length;
  const progressPct = Math.min(100, Math.round((reachedCount / totalSessions) * 100));

  // Monthly cadence: each month of the program expects 2 sessions.
  const monthCycles = useMemo(() => {
    const endTs = endDate.getTime();
    const done = chronological
      .filter((b) => isRealized(statusFor(b)))
      .map((b) => new Date(b.scheduled_date + "T12:00:00").getTime())
      .sort((a, b) => a - b);

    const cycles: { label: string; from: number; to: number; done: number; expected: number }[] = [];
    const monthsCount = Math.ceil(totalSessions / 2);
    for (let i = 0; i < monthsCount; i++) {
      const from = new Date(startDate.getFullYear(), startDate.getMonth() + i, startDate.getDate()).getTime();
      const to = i === monthsCount - 1
        ? endTs
        : new Date(startDate.getFullYear(), startDate.getMonth() + i + 1, startDate.getDate()).getTime();
      cycles.push({
        label: new Date(from).toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        from,
        to,
        done: done.filter((ts) => ts >= from && ts < to).length,
        expected: Math.min(2, totalSessions - i * 2),
      });
    }
    return cycles;
  }, [chronological, startDate, endDate, totalSessions, reports]);

  // Cumulative chart: projected 2/month vs realized
  const chartData = useMemo(() => {
    const now = Date.now();
    let cumDone = 0;
    const rows = monthCycles.map((m, i) => {
      cumDone += m.done;
      const isFuture = now < m.from;
      return {
        label: m.label,
        projetado: Math.min(totalSessions, (i + 1) * 2),
        realizado: isFuture ? null : Math.min(cumDone, totalSessions),
      };
    });
    return [{ label: "Início", projetado: 0, realizado: 0 }, ...rows];
  }, [monthCycles, totalSessions]);

  const paceInfo = useMemo(() => {
    // Sem datas do programa não há ritmo esperado; não inventar "Atrasado" com datas fictícias.
    if (!hasProgramDates) return null;
    const now = new Date();
    const start = startDate.getTime();
    if (now.getTime() < start) return { label: "Ainda não iniciou", tone: "neutral" as const, expected: 0 };
    let elapsedMonths = (now.getFullYear() - startDate.getFullYear()) * 12 + now.getMonth() - startDate.getMonth();
    if (now.getDate() < startDate.getDate()) elapsedMonths -= 1; // mês corrente ainda não fechou
    elapsedMonths = Math.max(0, elapsedMonths);
    const expected = Math.min(totalSessions, elapsedMonths * 2);
    const diff = reachedCount - expected;
    if (diff >= 1) return { label: `Adiantado (+${diff})`, tone: "green" as const, expected };
    if (diff <= -1) return { label: `Atrasado (${diff})`, tone: "red" as const, expected };
    return { label: "No ritmo", tone: "neutral" as const, expected };
  }, [hasProgramDates, startDate, reachedCount, totalSessions]);

  const openBooking = openBookingId ? chronological.find((b) => b.id === openBookingId) : null;
  const openBookingIndex = openBooking ? chronological.findIndex((b) => b.id === openBooking.id) + 1 : 0;
  const openReport = openBooking ? reports[openBooking.id] : null;
  const openStatus = openBooking ? statusFor(openBooking) : null;

  const paceIcon = paceInfo?.tone === "green" ? TrendingUp : paceInfo?.tone === "red" ? TrendingDown : Minus;
  const paceColor = paceInfo?.tone === "green" ? "text-status-green" : paceInfo?.tone === "red" ? "text-destructive" : "text-muted-foreground";

  const statusMeta = (status: string) => {
    const cfg = bookingStatusConfig[status];
    switch (status) {
      case "completed":
        return { label: cfg.label, color: "hsl(var(--status-green))", chip: "bg-status-green/15 text-status-green border-status-green/30" };
      case "awaiting_report":
        return { label: cfg.label, color: "hsl(var(--status-green))", chip: "bg-status-green/15 text-status-green border-status-green/30" };
      case "pending_confirmation":
        return { label: cfg.label, color: "hsl(var(--status-orange))", chip: "bg-status-orange/15 text-status-orange border-status-orange/30" };
      case "not_realized":
        return { label: cfg.label, color: "hsl(var(--destructive))", chip: "bg-destructive/15 text-destructive border-destructive/30" };
      case "pending_approval":
        return { label: cfg.label, color: "hsl(var(--status-yellow))", chip: "bg-status-yellow/15 text-status-yellow border-status-yellow/30" };
      default:
        return { label: "Agendada", color: "hsl(var(--status-blue))", chip: "bg-status-blue/15 text-status-blue border-status-blue/30" };
    }
  };

  // 12 fixed slots: fill with actual bookings in chronological order, remaining slots stay empty
  const slots = useMemo(() => {
    return Array.from({ length: totalSessions }, (_, i) => {
      const b = chronological[i];
      if (!b) return { index: i + 1, booking: null as Booking | null, status: "empty" as string };
      return { index: i + 1, booking: b, status: statusFor(b) };
    });
  }, [chronological, totalSessions, reports]);

  const slotCounts = useMemo(() => {
    const c = { completed: 0, pending_confirmation: 0, scheduled: 0, pending: 0, not_realized: 0, empty: 0 };
    slots.forEach((s) => {
      if (!s.booking) c.empty++;
      else if (isRealized(s.status)) c.completed++;
      else if (s.status === "pending_confirmation") c.pending_confirmation++;
      else if (s.status === "pending_approval") c.pending++;
      else if (s.status === "not_realized") c.not_realized++;
      else c.scheduled++;
    });
    return c;
  }, [slots]);

  const hasKickoffInTrack = chronological.some(isKickoffBooking);

  /** Fechamento de uma sessão "A confirmar" pelo admin/mentor: realizada (sem relatório) ou não realizada. */
  const closePending = (booking: Booking, status: "completed" | "not_realized") => {
    setPendingClose({ booking, status });
  };

  const performClosePending = async (booking: Booking, status: "completed" | "not_realized") => {
    setClosing(true);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ status, ...(status === "completed" ? { approval_required: false } : {}) })
        .eq("id", booking.id);
      if (error) throw error;
      toast.success(status === "completed" ? "Sessão marcada como realizada" : "Sessão marcada como não realizada");
      setOpenBookingId(null);
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
      queryClient.invalidateQueries({ queryKey: ["member-bookings-manager"] });
      onChanged?.();
    } catch (e) {
      const err = e as { message?: string };
      toast.error(translateBookingError(err) || "Erro ao atualizar: " + (err?.message ?? "erro desconhecido"));
    } finally {
      setClosing(false);
    }
  };

  const pendingCloseLabel = pendingClose
    ? sessionNames[pendingClose.booking.session_id] || pendingClose.booking.sessions?.name || "Sessão"
    : "";

  const canFillReport = (b: Booking) => bookingRequiresReport(b) && isBookingPast(b) && !reports[b.id];

  const PaceIcon = paceIcon;
  const paceTone: "success" | "danger" | "neutral" = paceInfo?.tone === "green" ? "success" : paceInfo?.tone === "red" ? "danger" : "neutral";

  const summaryItems = [
    { key: "completed", n: slotCounts.completed, label: "Realizadas", hint: "Confirmadas pelo mentor", dot: "bg-status-green border-status-green", text: "text-status-green" },
    { key: "pending_confirmation", n: slotCounts.pending_confirmation, label: "A confirmar", hint: "Passaram do horário, sem confirmação", dot: "border-status-orange", text: "text-status-orange" },
    { key: "scheduled", n: slotCounts.scheduled, label: "Agendadas", hint: "Data confirmada", dot: "border-status-blue", text: "text-status-blue" },
    { key: "pending", n: slotCounts.pending, label: "Pendentes", hint: "Aguardando o mentor aceitar", dot: "border-status-yellow", text: "text-status-yellow" },
    { key: "not_realized", n: slotCounts.not_realized, label: "Não realizadas", hint: "Aluno ou mentor faltou", dot: "border-destructive", text: "text-destructive" },
    { key: "empty", n: slotCounts.empty, label: "A agendar", hint: "Sessões que faltam marcar", dot: "border-dashed border-border", text: "text-muted-foreground" },
  ].filter((i) => i.n > 0);

  return (
    <>
      <SectionCard as="section" className="space-y-6">
        {/* Header */}
        <SectionHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" aria-hidden /> Linha do tempo
            </span>
          }
          description={
            profile?.program_start_date ? (
              <>
                Início {fmtDate(profile.program_start_date)}
                {profile?.program_end_date && ` · término ${fmtDate(profile.program_end_date)}`}
              </>
            ) : (
              "Datas do programa ainda não definidas"
            )
          }
          actions={
            paceInfo ? (
              <StatusPill tone={paceTone === "neutral" ? "neutral" : paceTone} withDot={false}>
                <PaceIcon className="h-3.5 w-3.5" aria-hidden /> {paceInfo.label}
              </StatusPill>
            ) : undefined
          }
        />

        {/* Projetado x Realizado: gráfico acumulado (2 sessões/mês) */}
        {hasProgramDates ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-muted-foreground">
                Projetado: <span className="text-foreground font-medium">2 sessões por mês</span> · 12 sessões em 6 meses
              </p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-status-green" aria-hidden /> Realizado</span>
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded border-t-2 border-dashed border-muted-foreground" aria-hidden /> Projetado</span>
              </div>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 12, bottom: 0, left: -20 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
                  <YAxis
                    domain={[0, totalSessions]}
                    ticks={[0, 2, 4, 6, 8, 10, 12]}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    stroke="hsl(var(--border))"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(value: any, name: any) => [`${value} sessões`, name]}
                  />
                  <Line
                    type="monotone"
                    dataKey="projetado"
                    name="Projetado"
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="realizado"
                    name="Realizado"
                    stroke="hsl(var(--status-green))"
                    strokeWidth={3}
                    dot={{ r: 4, fill: "hsl(var(--status-green))", strokeWidth: 0 }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                Acumulado: <span className="text-foreground font-medium tabular-nums">{reachedCount} de {totalSessions}</span>
              </span>
              {paceInfo && <span>Meta até hoje: <span className="text-foreground font-medium tabular-nums">{paceInfo.expected}</span></span>}
              <span>Término previsto mantendo 2/mês: <span className="text-foreground font-medium">{fmtDate(profile?.program_end_date)}</span></span>
            </div>
          </div>
        ) : (
          <EmptyState
            compact
            icon={CalendarDays}
            title="Datas do programa não definidas"
            description="Defina a data de início e término do programa deste aluno para exibir a linha do tempo."
          />
        )}

        {/* Session map: one dot per session of the journey */}
        <div className="space-y-4 pt-4 border-t border-border">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-foreground">Mapa das 12 sessões</h3>
              <p className="text-xs text-muted-foreground">
                Cada círculo é uma sessão da jornada, na ordem em que aconteceu. Toque para ver os detalhes e o relatório.
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-foreground tabular-nums leading-none">
                {reachedCount}<span className="text-sm font-medium text-muted-foreground">/{totalSessions}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">Sessões realizadas · {progressPct}%</p>
            </div>
          </div>

          {/* Track + fill + inline dots */}
          <div className="relative h-8 w-full px-3">
            <div className="absolute left-3 right-3 top-1/2 -translate-y-1/2 h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-status-green transition-[width] duration-ds-3 ease-ds"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="relative flex items-center justify-between h-full">
              {slots.map((s) => {
                if (!s.booking) {
                  return (
                    <div
                      key={s.index}
                      title={`Sessão ${s.index} · ainda não agendada`}
                      className="relative z-10 h-5 w-5 rounded-full border border-dashed border-border bg-card flex items-center justify-center text-[10px] font-medium tabular-nums text-muted-foreground"
                    >
                      {s.index}
                    </div>
                  );
                }
                const meta = statusMeta(s.status);
                const isCompleted = isRealized(s.status);
                const isKickoff = isKickoffBooking(s.booking);
                const missingReport = s.status === "awaiting_report";
                const sessionLabel = sessionNames[s.booking.session_id] || s.booking.sessions?.name || "Sessão";
                return (
                  <button
                    key={s.index}
                    type="button"
                    onClick={() => setOpenBookingId(s.booking.id)}
                    aria-label={`Sessão ${s.index}: ${sessionLabel}, ${fmtDate(s.booking.scheduled_date)}, ${meta.label}`}
                    title={`Sessão ${s.index} · ${sessionLabel} · ${fmtDate(s.booking.scheduled_date)} · ${meta.label}`}
                    className={`relative z-10 h-5 w-5 rounded-full border bg-card flex items-center justify-center text-[10px] font-medium tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background ${
                      isCompleted ? "text-primary-foreground" : "text-foreground"
                    }`}
                    style={{
                      borderColor: meta.color,
                      backgroundColor: isCompleted ? meta.color : undefined,
                    }}
                  >
                    {s.index}
                    {isKickoff && (
                      <Star className="absolute -top-2.5 -right-2.5 h-3.5 w-3.5 text-muted-foreground" aria-label="Mapeamento" />
                    )}
                    {missingReport && (
                      <span
                        className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-card border border-border flex items-center justify-center"
                        aria-hidden
                      >
                        <FileWarning className="h-2.5 w-2.5 text-muted-foreground" />
                      </span>
                    )}
                  </button>
                );
              })}
              <div
                title={reachedCount >= totalSessions ? "Presente desbloqueado" : "Presente bloqueado: conclua as 12 sessões"}
                className={`relative z-10 flex h-5 w-5 items-center justify-center rounded-full border ${
                  reachedCount >= totalSessions
                    ? "border-status-green bg-status-green text-primary-foreground"
                    : "border-dashed border-border bg-card text-muted-foreground"
                }`}
                aria-label={reachedCount >= totalSessions ? "Presente desbloqueado" : "Presente bloqueado"}
              >
                {reachedCount >= totalSessions ? <LockOpen className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                <span className="absolute top-8 whitespace-nowrap text-[11px] font-medium text-muted-foreground">Presente</span>
              </div>
            </div>
          </div>

          {/* Status summary: only what actually exists, with counts and meaning */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 pt-2">
            {summaryItems.map((i) => (
              <div key={i.key} className="flex items-start gap-2 min-w-0">
                <span className={`mt-1 w-2 h-2 shrink-0 rounded-full border ${i.dot}`} aria-hidden />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground leading-tight">
                    <span className="tabular-nums">{i.n}</span> {i.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-tight truncate">{i.hint}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            {hasKickoffInTrack && (
              <span className="flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Mapeamento do Negócio (sessão de 3h)
              </span>
            )}
            {slots.some((s) => s.status === "awaiting_report") && (
              <span className="flex items-center gap-1.5">
                <FileWarning className="h-3 w-3 text-muted-foreground" aria-hidden /> Realizada sem relatório
              </span>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Session details */}
      <BottomSheet
        open={!!openBookingId}
        onOpenChange={(o) => !o && setOpenBookingId(null)}
        title={
          openBooking
            ? `Sessão ${openBookingIndex} · ${sessionNames[openBooking.session_id] || openBooking.sessions?.name || "Detalhes"}`
            : "Sessão"
        }
        description={
          openBooking ? (
            <span className="inline-flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {fmtDate(openBooking.scheduled_date)}
                {openBooking.start_time ? ` · ${openBooking.start_time.slice(0, 5)}` : ""}
              </span>
              {openBooking.mentor_id && mentorNames[openBooking.mentor_id] && (
                <span>Mentor: <span className="text-foreground font-medium">{shortName(mentorNames[openBooking.mentor_id])}</span></span>
              )}
            </span>
          ) : undefined
        }
        size="sm"
        footer={
          openBooking && !hideReportButton && reportRoute && (openReport?.summary || canFillReport(openBooking)) ? (
            <Button
              className="w-full sm:w-auto"
              onClick={() => { const bid = openBooking.id; setOpenBookingId(null); navigate(reportRoute(bid)); }}
            >
              <FileText className="h-4 w-4" /> {openReport?.summary ? "Abrir relatório completo" : "Preencher relatório"}
            </Button>
          ) : undefined
        }
      >
        {openBooking && openStatus && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusPill status={openStatus} />
              {isPendingConfirmationOverdue(openBooking) && (
                <span className="text-xs text-muted-foreground">Há {daysSinceBookingEnd(openBooking)} dias sem confirmação</span>
              )}
              {openStatus === "awaiting_report" && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <FileWarning className="h-3.5 w-3.5" aria-hidden /> Sem relatório
                </span>
              )}
            </div>
            {openStatus === "pending_confirmation" && (
              <p className="text-xs text-muted-foreground leading-relaxed">{PENDING_CONFIRMATION_HINT}</p>
            )}

            {isKickoffBooking(openBooking) && (
              <Callout tone="warning" icon={Star} title="Mapeamento do Negócio">
                Sessão de 3h para aprofundar diagnóstico, metas e direção do programa. Não exige relatório.
              </Callout>
            )}

            {openReport?.summary && (
              <SectionCard padding="compact">
                <p className="ds-kicker mb-1">Resumo</p>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{openReport.summary}</p>
              </SectionCard>
            )}

            {/* Ações do admin/mentor sobre uma sessão que passou e ainda não foi confirmada */}
            {!hideReportButton && openStatus === "pending_confirmation" && (
              <div className="flex flex-col sm:flex-row gap-2">
                {!bookingRequiresReport(openBooking) && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={closing}
                    onClick={() => closePending(openBooking, "completed")}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Marcar realizada
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={closing}
                  onClick={() => closePending(openBooking, "not_realized")}
                >
                  <XCircle className="h-4 w-4" /> Não realizada
                </Button>
              </div>
            )}

            {hideReportButton && !openReport?.summary && openStatus === "awaiting_report" && (
              <p className="text-xs text-muted-foreground text-center">Aguardando relatório do mentor.</p>
            )}
          </div>
        )}
      </BottomSheet>

      <ConfirmDialog
        open={!!pendingClose}
        onOpenChange={(o) => !o && setPendingClose(null)}
        title={pendingClose?.status === "completed" ? "Confirmar sessão realizada?" : "Marcar como não realizada?"}
        description={
          pendingClose
            ? pendingClose.status === "completed"
              ? `A sessão "${pendingCloseLabel}" de ${fmtDate(pendingClose.booking.scheduled_date)} passa a contar como realizada.`
              : `A sessão "${pendingCloseLabel}" de ${fmtDate(pendingClose.booking.scheduled_date)} deixa de ocupar a vaga na jornada.`
            : undefined
        }
        confirmLabel={pendingClose?.status === "completed" ? "Marcar realizada" : "Marcar não realizada"}
        destructive={pendingClose?.status === "not_realized"}
        loading={closing}
        onConfirm={async () => {
          if (!pendingClose) return;
          const action = pendingClose;
          setPendingClose(null);
          await performClosePending(action.booking, action.status);
        }}
      />
    </>
  );
};
