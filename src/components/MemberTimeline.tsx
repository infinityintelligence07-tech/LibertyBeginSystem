import { useMemo, useState } from "react";
import { CalendarDays, Target, FileText, TrendingUp, TrendingDown, Minus, Star, Lock, LockOpen } from "lucide-react";
import { getEffectiveBookingStatus } from "@/lib/bookingStatus";
import { shortName } from "@/lib/formatName";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";



interface Booking {
  id: string;
  session_id: string;
  mentor_id?: string | null;
  scheduled_date: string;
  start_time?: string | null;
  status: string;
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
}

const fmtDate = (iso?: string | null) => {
  if (!iso) return "Sem dados";
  try { return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }); }
  catch { return String(iso); }
};

export const MemberTimeline = ({
  profile, bookings, sessionNames, mentorNames, reports, reportRoute,
  totalSessions = 12, hideReportButton = false, journeySessionIds,
}: Props) => {
  const navigate = useNavigate();
  const [openBookingId, setOpenBookingId] = useState<string | null>(null);

  const explicitStart = profile?.program_start_date ? new Date(profile.program_start_date + "T12:00:00") : null;
  const explicitEnd = profile?.program_end_date ? new Date(profile.program_end_date + "T12:00:00") : null;

  // Timeline is strictly based on the member's program dates.
  // If either is missing, we show a placeholder instead of inventing dates from bookings.
  const hasProgramDates = !!(explicitStart && explicitEnd);
  const projectedMonths = Math.ceil(totalSessions / 2);
  const startDate = explicitStart ?? new Date();
  const endDate = explicitEnd ?? new Date(startDate.getFullYear(), startDate.getMonth() + projectedMonths, startDate.getDate());

  // A jornada tem 12 sessões e começa no Mapeamento do Negócio.
  // O Onboarding (order 0) NUNCA entra na trilha nem ocupa o slot 1.
  const journeyIds = useMemo(
    () => (journeySessionIds ? new Set(Array.from(journeySessionIds as any)) : null),
    [journeySessionIds]
  );

  const chronological = useMemo(() => [...bookings]
    .filter((b) => getEffectiveBookingStatus(b) !== "cancelled")
    .filter((b) => {
      if (journeyIds) return journeyIds.has(b.session_id);
      // Fallback: sem os ids da jornada, exclui pelo nome da sessão.
      return !/^onboarding$/i.test((sessionNames[b.session_id] || "").trim());
    })
    .sort((a, b) => `${a.scheduled_date}T${a.start_time || ""}`.localeCompare(`${b.scheduled_date}T${b.start_time || ""}`)),
  [bookings, journeyIds, sessionNames]);


  const statusFor = (booking: Booking) => getEffectiveBookingStatus(booking, { hasReport: Boolean(reports[booking.id]) });
  const reachedCount = chronological.filter((b) => {
    const status = statusFor(b);
    return status === "completed" || status === "awaiting_report";
  }).length;
  const completedCount = chronological.filter((b) => statusFor(b) === "completed").length;
  const progressPct = Math.min(100, Math.round((reachedCount / totalSessions) * 100));

  // Monthly cadence: each month of the program expects 2 sessions.
  const monthCycles = useMemo(() => {
    const endTs = endDate.getTime();
    const done = chronological
      .filter((b) => {
        const status = statusFor(b);
        return status === "completed" || status === "awaiting_report";
      })
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
    if (!startDate || !endDate) return null;
    const now = Date.now();
    const start = startDate.getTime();
    const end = endDate.getTime();
    if (now < start) return { label: "Ainda não iniciou", tone: "neutral" as const, expected: 0 };
    const elapsedMonths = Math.max(0, (new Date(now).getFullYear() - startDate.getFullYear()) * 12 + new Date(now).getMonth() - startDate.getMonth());
    const expected = Math.min(totalSessions, elapsedMonths * 2);
    const diff = reachedCount - expected;
    if (diff >= 1) return { label: `Adiantado (+${diff})`, tone: "green" as const, expected };
    if (diff <= -1) return { label: `Atrasado (${diff})`, tone: "red" as const, expected };
    return { label: "No ritmo", tone: "neutral" as const, expected };
  }, [startDate, endDate, reachedCount, totalSessions]);

  const openBooking = openBookingId ? chronological.find((b) => b.id === openBookingId) : null;
  const openBookingIndex = openBooking ? chronological.findIndex((b) => b.id === openBooking.id) + 1 : 0;
  const openReport = openBooking ? reports[openBooking.id] : null;

  const paceIcon = paceInfo?.tone === "green" ? TrendingUp : paceInfo?.tone === "red" ? TrendingDown : Minus;
  const paceColor = paceInfo?.tone === "green" ? "text-status-green" : paceInfo?.tone === "red" ? "text-destructive" : "text-muted-foreground";


  const statusMeta = (status: string) => {
    switch (status) {
      case "completed": return { label: "Realizada", color: "hsl(var(--status-green))", chip: "bg-status-green/15 text-status-green border-status-green/30" };
      case "awaiting_report": return { label: "Realizada · aguardando relatório", color: "hsl(var(--status-green))", chip: "bg-status-yellow/15 text-status-yellow border-status-yellow/30" };
      case "not_realized": return { label: "Não realizada", color: "hsl(var(--destructive))", chip: "bg-destructive/15 text-destructive border-destructive/30" };
      case "pending_approval": return { label: "Pendente", color: "hsl(var(--status-yellow))", chip: "bg-status-yellow/15 text-status-yellow border-status-yellow/30" };
      default: return { label: "Agendada", color: "hsl(var(--status-blue))", chip: "bg-status-blue/15 text-status-blue border-status-blue/30" };
    }
  };

  // 12 fixed slots: fill with actual bookings in order, remaining slots stay empty
  const slots = useMemo(() => {
    return Array.from({ length: totalSessions }, (_, i) => {
      const b = chronological[i];
      if (!b) return { index: i + 1, booking: null as Booking | null, status: "empty" as string };
      return { index: i + 1, booking: b, status: statusFor(b) };
    });
  }, [chronological, totalSessions]);

  const slotCounts = useMemo(() => {
    const c = { completed: 0, scheduled: 0, pending: 0, not_realized: 0, empty: 0 };
    slots.forEach((s) => {
      if (!s.booking) c.empty++;
      else if (s.status === "completed" || s.status === "awaiting_report") c.completed++;
      else if (s.status === "pending_approval") c.pending++;
      else if (s.status === "not_realized") c.not_realized++;
      else c.scheduled++;
    });
    return c;
  }, [slots]);


  const noDataYet = !startDate && chronological.length === 0;

  return (
    <>
      <div className="rounded-2xl border border-border bg-card/70 p-5 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-primary text-[10px] font-semibold uppercase tracking-wider">
              <Target className="h-3.5 w-3.5" /> Jornada
            </div>
            <h2 className="text-lg font-semibold text-foreground leading-tight">Linha do tempo</h2>
            <p className="text-xs text-muted-foreground">
              {profile?.program_start_date ? (
                <>
                  Início {fmtDate(profile.program_start_date)}
                  {profile?.program_end_date && ` · término ${fmtDate(profile.program_end_date)}`}
                </>
              ) : (
                "Datas do programa ainda não definidas"
              )}
            </p>
          </div>
          {paceInfo && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background/40 text-xs font-semibold ${paceColor}`}>
              {(() => { const Icon = paceIcon; return <Icon className="h-3.5 w-3.5" />; })()}
              {paceInfo.label}
            </div>
          )}
        </div>

        {/* Projetado x Realizado — gráfico acumulado (2 sessões/mês) */}
        {hasProgramDates ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-muted-foreground">
                Projetado: <span className="text-foreground font-medium">2 sessões por mês</span> · 12 sessões em 6 meses
              </p>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-0.5 w-4 rounded bg-status-green" /> realizado</span>
                <span className="flex items-center gap-1"><span className="h-0.5 w-4 rounded bg-muted-foreground/60" style={{ backgroundImage: "repeating-linear-gradient(90deg,currentColor 0 3px,transparent 3px 6px)" }} /> projetado</span>
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

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>
                Acumulado: <span className="text-foreground font-medium tabular-nums">{reachedCount} de {totalSessions}</span>
              </span>
              {paceInfo && <span>Meta até hoje: <span className="text-foreground font-medium tabular-nums">{paceInfo.expected}</span></span>}
              <span>Término previsto mantendo 2/mês: <span className="text-foreground font-medium">{fmtDate(profile?.program_end_date)}</span></span>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-background/40 p-6 text-center text-xs text-muted-foreground">
            Defina a <span className="text-foreground font-medium">data de início</span> e <span className="text-foreground font-medium">término</span> do programa deste aluno para exibir a linha do tempo.
          </div>

        )}




        {/* Session map: one dot per session of the journey */}
        <div className="space-y-4 rounded-xl border border-border/70 bg-background/30 p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-foreground">Mapa das 12 sessões</h3>
              <p className="text-[11px] text-muted-foreground">
                Cada círculo é uma sessão da jornada. Clique para ver os detalhes e o relatório.
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-foreground tabular-nums leading-none">
                {reachedCount}<span className="text-sm font-medium text-muted-foreground">/{totalSessions}</span>
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">sessões alcançadas · {progressPct}%</p>
            </div>
          </div>

          {/* Track + fill + inline dots */}
          <div className="relative h-7 w-full px-3">
            <div className="absolute left-3 right-3 top-1/2 -translate-y-1/2 h-2 rounded-full bg-muted/50 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-status-green/80 to-status-green transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="relative flex items-center justify-between h-full">
              {slots.map((s) => {
                const isKickoff = s.index === 1;
                if (!s.booking) {
                  return (
                    <div
                      key={s.index}
                      title={`Sessão ${s.index} · ainda não agendada`}
                      className={`relative z-10 h-5 w-5 rounded-full border-2 border-dashed bg-card flex items-center justify-center text-[9px] font-semibold tabular-nums text-muted-foreground/70 ${
                        isKickoff ? "border-status-yellow/50" : "border-border"
                      }`}
                    >
                      {s.index}
                    </div>
                  );
                }
                const meta = statusMeta(s.status);
                const isCompleted = s.status === "completed" || s.status === "awaiting_report";
                const sessionLabel = sessionNames[s.booking.session_id] || "Sessão";
                return (
                  <button
                    key={s.index}
                    type="button"
                    onClick={() => setOpenBookingId(s.booking.id)}
                    title={`Sessão ${s.index} · ${sessionLabel} · ${fmtDate(s.booking.scheduled_date)} · ${meta.label}`}
                    className={`relative z-10 h-5 w-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold tabular-nums transition-transform hover:scale-125 focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                      isCompleted ? "text-white" : "text-foreground"
                    }`}
                    style={{
                      borderColor: meta.color,
                      backgroundColor: isCompleted ? meta.color : `color-mix(in srgb, ${meta.color} 22%, hsl(var(--card)))`,
                    }}
                  >
                    {s.index}
                    {isKickoff && (
                      <Star className="absolute -top-2 -right-2 h-2.5 w-2.5 text-status-yellow drop-shadow" />
                    )}
                  </button>
                );
              })}
              <div
                title={reachedCount >= totalSessions ? "Presente desbloqueado" : "Presente bloqueado: conclua as 12 sessões"}
                className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                  reachedCount >= totalSessions
                    ? "border-status-green bg-status-green text-primary-foreground"
                    : "border-dashed border-muted-foreground/50 bg-card text-muted-foreground"
                }`}
                aria-label={reachedCount >= totalSessions ? "Presente desbloqueado" : "Presente bloqueado"}
              >
                {reachedCount >= totalSessions ? <LockOpen className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                <span className="absolute top-7 whitespace-nowrap text-[9px] font-semibold text-muted-foreground">Presente</span>
              </div>
            </div>
          </div>

          {/* Status summary: only what actually exists, with counts and meaning */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { key: "completed", n: slotCounts.completed, label: "Realizadas", hint: "com relatório enviado", dot: "bg-status-green border-status-green", text: "text-status-green" },
              { key: "scheduled", n: slotCounts.scheduled, label: "Agendadas", hint: "data confirmada", dot: "border-status-blue", text: "text-status-blue" },
              { key: "pending", n: slotCounts.pending, label: "Pendentes", hint: "aguardando o mentor confirmar", dot: "border-status-yellow", text: "text-status-yellow" },
              { key: "not_realized", n: slotCounts.not_realized, label: "Não realizadas", hint: "aluno ou mentor faltou", dot: "border-destructive", text: "text-destructive" },
              { key: "empty", n: slotCounts.empty, label: "A agendar", hint: "sessões que faltam marcar", dot: "border-dashed border-border", text: "text-muted-foreground" },
            ]
              .filter((i) => i.n > 0)
              .map((i) => (
                <div key={i.key} className="flex items-start gap-2 rounded-lg border border-border/60 bg-card/50 px-2.5 py-2">
                  <span className={`mt-1 w-2.5 h-2.5 shrink-0 rounded-full border-2 ${i.dot}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground leading-tight">
                      <span className={`tabular-nums ${i.text}`}>{i.n}</span> {i.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-tight truncate">{i.hint}</p>
                  </div>
                </div>
              ))}
          </div>

          <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Star className="h-3 w-3 text-status-yellow" /> Sessão 1 é o Mapeamento do Negócio, obrigatória para abrir a jornada.
          </p>
        </div>

      </div>

      {/* Session details modal */}
      <Dialog open={!!openBookingId} onOpenChange={(o) => !o && setOpenBookingId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{openBooking ? `Sessão ${openBookingIndex} · ${sessionNames[openBooking.session_id] || "Detalhes"}` : "Sessão"}</DialogTitle>
          </DialogHeader>
          {openBooking && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> {fmtDate(openBooking.scheduled_date)}{openBooking.start_time ? ` · ${openBooking.start_time.slice(0,5)}` : ""}</span>
                {openBooking.mentor_id && mentorNames[openBooking.mentor_id] && (
                  <span>Mentor: <span className="text-foreground font-medium">{shortName(mentorNames[openBooking.mentor_id])}</span></span>
                )}
              </div>
              <div className="rounded-lg border border-border bg-background/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Status</p>
                <p className="text-sm text-foreground">{statusMeta(statusFor(openBooking)).label}</p>
              </div>
              {openBookingIndex === 1 && (
                <div className="rounded-lg border border-status-yellow/30 bg-status-yellow/10 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-status-yellow font-semibold mb-1">Kickoff</p>
                  <p className="text-xs text-foreground leading-relaxed">Sessão de 3h para aprofundar diagnóstico, metas e direção do programa.</p>
                </div>
              )}
              {openReport?.summary && (
                <div className="rounded-lg border border-border bg-background/50 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Resumo</p>
                  <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{openReport.summary}</p>
                </div>
              )}
              {!hideReportButton && reportRoute && (
                <button
                  onClick={() => { const bid = openBooking.id; setOpenBookingId(null); navigate(reportRoute(bid)); }}
                  className="btn-silver w-full text-xs flex items-center justify-center gap-2"
                >
                  <FileText className="h-3.5 w-3.5" /> {openReport?.summary ? "Abrir relatório completo" : "Preencher relatório"}
                </button>
              )}
              {hideReportButton && openReport?.summary === undefined && (
                <p className="text-[11px] text-muted-foreground italic text-center">Aguardando relatório.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
