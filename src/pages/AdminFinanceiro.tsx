import { useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { AdminMonthFilter } from "@/components/AdminMonthFilter";
import { useAdminFilter } from "@/contexts/AdminFilterContext";
import { useMentors, useAdminStats, DEFAULT_SESSION_VALUE, type MentorWithStats, type MentorSessionDetail } from "@/hooks/useAdminData";
import { shortName } from "@/lib/formatName";
import { UserAvatar } from "@/components/UserAvatar";
import { DollarSign, TrendingUp, FileDown, Loader2, Calendar, Clock, Info } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { downloadMentorReportPdf, formatBRL, payoutCategoryOf, type MentorReportSession } from "@/lib/mentorReportPdf";
import { toast } from "sonner";
import { KICKOFF_FEE_MULTIPLIER } from "@/lib/mentorFees";
import { PENDING_CONFIRMATION_HINT } from "@/lib/bookingStatus";
import {
  PageContainer,
  PageHeader,
  SectionHeader,
  SectionCard,
  Callout,
  ListRow,
  DateBlock,
  StatusPill,
  Stat,
  BottomSheet,
  LoadingState,
  EmptyState,
  ErrorState,
} from "@/components/ds";

const PENDING_CONFIRMATION_FOOTNOTE =
  "Sessões que passaram sem confirmação do mentor não entram no repasse até serem confirmadas.";

const AdminFinanceiroPage = () => {
  const { data: mentors, isLoading, isError, refetch } = useMentors();
  const { data: stats } = useAdminStats();
  const { mode, monthKey } = useAdminFilter();

  const defaultRate = stats?.sessionValue ?? DEFAULT_SESSION_VALUE;
  const filterKey = mode === "month" ? monthKey : null;

  const [detailMentorId, setDetailMentorId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Mentores inativados saem de todos os controles financeiros.
  const activeMentors = useMemo(
    () => (mentors || []).filter((m) => m.is_active !== false),
    [mentors]
  );

  // Fonte única (linha, detalhe e PDF): as sessões já classificadas pelo hook, com o valor calculado aqui.
  const getMentorSessions = (mentor: MentorWithStats, periodKey: string | null): MentorReportSession[] => {
    const rate = mentor.session_rate ?? defaultRate;
    return mentor.sessions
      .filter((s: MentorSessionDetail) => !periodKey || s.date.startsWith(periodKey))
      .filter((s) => payoutCategoryOf(s.status) !== "excluded")
      .map((s) => ({
        date: s.date,
        session_name: s.session_name,
        member_name: s.member_name,
        value: rate * s.fee_multiplier,
        status: s.status,
        is_retroactive: s.is_retroactive,
      }));
  };

  const handleDownload = async (mentor: MentorWithStats, periodKey: string | null) => {
    setDownloadingId(`${mentor.id}-${periodKey || "all"}`);
    try {
      const sessions = getMentorSessions(mentor, periodKey);
      if (sessions.length === 0) {
        toast.error("Nenhuma sessão encontrada para este período");
        return;
      }
      const rate = mentor.session_rate ?? defaultRate;
      let periodLabel = "Histórico completo";
      if (periodKey) {
        const [y, m] = periodKey.split("-");
        periodLabel = new Date(parseInt(y), parseInt(m) - 1)
          .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
        periodLabel = periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1);
      }
      await downloadMentorReportPdf({
        mentor_name: mentor.full_name,
        period_label: periodLabel,
        sessions,
        rate,
      });
      toast.success("PDF gerado");
    } catch (e) {
      toast.error("Erro ao gerar PDF: " + (e instanceof Error ? e.message : ""));
    } finally {
      setDownloadingId(null);
    }
  };

  const mentorRows = useMemo(() => {
    const pick = (total: number, monthly: Record<string, number>) =>
      filterKey ? ((monthly || {})[filterKey] || 0) : total;
    return activeMentors.map((m) => {
      // Realizadas = completed + awaiting_report (base do "A pagar")
      const completed = pick(m.total_completed, m.monthly_completed);
      const awaiting = pick(m.total_awaiting_report, m.monthly_awaiting_report);
      const scheduled = pick(m.total_scheduled, m.monthly_scheduled);
      const pendingConfirmation = pick(m.total_pending_confirmation, m.monthly_pending_confirmation);
      const rate = m.session_rate ?? defaultRate;
      const total = completed + scheduled + pendingConfirmation;
      // Mapeamento do Negócio (3h) = dobro do valor
      const kCompleted = pick(m.total_kickoff_completed, m.monthly_kickoff_completed);
      const kScheduled = pick(m.total_kickoff_scheduled, m.monthly_kickoff_scheduled);
      const kPending = pick(m.total_kickoff_pending_confirmation, m.monthly_kickoff_pending_confirmation);
      const kTotal = kCompleted + kScheduled + kPending;
      const extra = KICKOFF_FEE_MULTIPLIER - 1;
      return {
        mentor: m,
        id: m.id,
        name: m.full_name,
        avatar_url: m.avatar_url,
        completed,
        awaiting,
        scheduled,
        pendingConfirmation,
        total,
        rate,
        usesDefaultRate: m.session_rate == null,
        kickoffCount: kTotal,
        revenueDone: (completed + kCompleted * extra) * rate,
        // Projeção = a pagar + agendadas + a confirmar
        revenueProjected: (total + kTotal * extra) * rate,
      };
    }).sort((a, b) => b.total - a.total);
  }, [activeMentors, filterKey, defaultRate]);

  const totalCompleted = mentorRows.reduce((s, r) => s + r.completed, 0);
  const totalAwaiting = mentorRows.reduce((s, r) => s + r.awaiting, 0);
  const totalScheduled = mentorRows.reduce((s, r) => s + r.scheduled, 0);
  const totalPendingConfirmation = mentorRows.reduce((s, r) => s + r.pendingConfirmation, 0);
  const totalDone = mentorRows.reduce((s, r) => s + r.revenueDone, 0);
  const totalProjected = mentorRows.reduce((s, r) => s + r.revenueProjected, 0);
  const periodSuffix = filterKey ? " no mês" : "";

  // Sessões "A confirmar" de todos os mentores ativos no período (leitura à parte: não entram no repasse).
  const pendingConfirmationSessions = useMemo(
    () =>
      activeMentors
        .flatMap((m) =>
          m.sessions
            .filter((s) => s.status === "pending_confirmation" && (!filterKey || s.date.startsWith(filterKey)))
            .map((s) => ({ ...s, mentor_name: m.full_name })),
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [activeMentors, filterKey],
  );

  const detailRow = mentorRows.find((r) => r.id === detailMentorId) ?? null;
  const detailSessions = detailRow ? getMentorSessions(detailRow.mentor, filterKey) : [];
  const detailDownloading = detailRow ? downloadingId === `${detailRow.id}-${filterKey || "all"}` : false;

  const rateCell = (row: typeof mentorRows[number]) => (
    <div className="text-right">
      <span className="text-sm text-muted-foreground tabular-nums">{formatBRL(row.rate)}</span>
      {row.usesDefaultRate && <span className="block text-[11px] text-muted-foreground">valor padrão</span>}
      {row.kickoffCount > 0 && (
        <span className="block text-[11px] text-muted-foreground tabular-nums">
          {row.kickoffCount}× Mapeamento · {formatBRL(row.rate * KICKOFF_FEE_MULTIPLIER)}
        </span>
      )}
    </div>
  );

  return (
    <AppLayout role="admin">
      <PageContainer variant="wide">
        <PageHeader
          title="Financeiro"
          description={`Valor padrão por sessão: ${formatBRL(defaultRate)} · A pagar = realizadas · Projeção = realizadas + agendadas + a confirmar`}
          actions={<AdminMonthFilter />}
        />

        {isLoading ? (
          <>
            <LoadingState variant="stats" rows={5} className="lg:grid-cols-5" />
            <LoadingState variant="list" rows={5} />
          </>
        ) : isError ? (
          <ErrorState title="Não foi possível carregar o financeiro" onRetry={() => refetch()} />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <SectionCard padding="compact">
                <Stat
                  icon={TrendingUp}
                  label={`Realizadas${periodSuffix}`}
                  value={totalCompleted}
                  hint={totalAwaiting > 0 ? `${totalAwaiting} sem relatório` : undefined}
                />
              </SectionCard>
              <SectionCard padding="compact">
                <Stat icon={Calendar} label={`Agendadas${periodSuffix}`} value={totalScheduled} />
              </SectionCard>
              <SectionCard padding="compact" title={PENDING_CONFIRMATION_HINT}>
                <Stat
                  icon={Clock}
                  label={`A confirmar${periodSuffix}`}
                  value={totalPendingConfirmation}
                  hint="não entra no repasse"
                  tone={totalPendingConfirmation > 0 ? "pending" : "default"}
                />
              </SectionCard>
              <SectionCard padding="compact">
                <Stat icon={DollarSign} label={`A pagar${periodSuffix}`} value={formatBRL(totalDone)} hint="realizadas" />
              </SectionCard>
              <SectionCard padding="compact" className="col-span-2 lg:col-span-1">
                <Stat icon={DollarSign} label={`Projeção${periodSuffix}`} value={formatBRL(totalProjected)} hint="a pagar + agendadas + a confirmar" />
              </SectionCard>
            </div>

            <section className="space-y-3">
              <SectionHeader
                title="Repasse por mentor"
                description="Toque em um mentor para ver as sessões do período e gerar o relatório em PDF."
              />
              {mentorRows.length === 0 ? (
                <EmptyState
                  icon={DollarSign}
                  title={filterKey ? "Nenhuma sessão neste mês" : "Nenhuma sessão registrada"}
                  description={filterKey ? "Tente outro período no filtro acima." : "Os repasses aparecem aqui assim que as sessões forem realizadas."}
                />
              ) : (
                <>
                  <SectionCard padding="none" className="hidden lg:block">
                    <Table className="[&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground [&_th]:h-11">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Mentor</TableHead>
                          <TableHead className="text-right">Realizadas</TableHead>
                          <TableHead className="text-right">Agendadas</TableHead>
                          <TableHead className="text-right" title={PENDING_CONFIRMATION_HINT}>A confirmar</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead className="text-right">A pagar</TableHead>
                          <TableHead className="text-right">Projeção</TableHead>
                          <TableHead className="text-right">Relatório</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mentorRows.map((row) => {
                          const isDownloading = downloadingId === `${row.id}-${filterKey || "all"}`;
                          return (
                            <TableRow
                              key={row.id}
                              className="cursor-pointer"
                              onClick={() => setDetailMentorId(row.id)}
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailMentorId(row.id); } }}
                            >
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <UserAvatar name={row.name} avatarUrl={row.avatar_url} size={32} />
                                  <span className="text-sm font-medium text-foreground">{shortName(row.name)}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span className={`text-sm font-medium ${row.completed > 0 ? "text-foreground" : "text-muted-foreground"}`}>{row.completed}</span>
                                {row.awaiting > 0 && <span className="block text-[11px] text-muted-foreground">{row.awaiting} sem relatório</span>}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span className={`text-sm font-medium ${row.scheduled > 0 ? "text-foreground" : "text-muted-foreground"}`}>{row.scheduled}</span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span className={`text-sm font-medium ${row.pendingConfirmation > 0 ? "text-status-orange" : "text-muted-foreground"}`} title={PENDING_CONFIRMATION_HINT}>
                                  {row.pendingConfirmation}
                                </span>
                              </TableCell>
                              <TableCell>{rateCell(row)}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span className="text-sm font-medium text-foreground">{formatBRL(row.revenueDone)}</span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span className="text-sm font-medium text-foreground">{formatBRL(row.revenueProjected)}</span>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isDownloading || row.total === 0}
                                  onClick={(e) => { e.stopPropagation(); handleDownload(row.mentor, filterKey); }}
                                >
                                  {isDownloading ? <Loader2 className="animate-spin" aria-hidden /> : <FileDown aria-hidden />}
                                  PDF
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        <TableRow className="bg-muted/30 hover:bg-muted/30 border-t border-border">
                          <TableCell><span className="text-sm font-semibold text-foreground">Total</span></TableCell>
                          <TableCell className="text-right tabular-nums"><span className="text-sm font-semibold text-foreground">{totalCompleted}</span></TableCell>
                          <TableCell className="text-right tabular-nums"><span className="text-sm font-semibold text-foreground">{totalScheduled}</span></TableCell>
                          <TableCell className="text-right tabular-nums"><span className="text-sm font-semibold text-status-orange">{totalPendingConfirmation}</span></TableCell>
                          <TableCell />
                          <TableCell className="text-right tabular-nums"><span className="text-sm font-semibold text-foreground">{formatBRL(totalDone)}</span></TableCell>
                          <TableCell className="text-right tabular-nums"><span className="text-sm font-semibold text-foreground">{formatBRL(totalProjected)}</span></TableCell>
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </SectionCard>

                  <SectionCard padding="none" className="lg:hidden">
                    {mentorRows.map((row, index) => (
                      <ListRow
                        key={row.id}
                        last={index === mentorRows.length - 1}
                        onPress={() => setDetailMentorId(row.id)}
                        leading={<UserAvatar name={row.name} avatarUrl={row.avatar_url} size={40} />}
                        title={shortName(row.name)}
                        subtitle={`${row.completed} realizadas · ${row.scheduled} agendadas${row.pendingConfirmation > 0 ? ` · ${row.pendingConfirmation} a confirmar` : ""}`}
                        trailing={
                          <span className="flex flex-col items-end tabular-nums">
                            <span className="text-sm font-semibold text-foreground">{formatBRL(row.revenueDone)}</span>
                            <span className="text-[11px] text-muted-foreground">proj. {formatBRL(row.revenueProjected)}</span>
                          </span>
                        }
                      />
                    ))}
                    <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-3 bg-muted/30 tabular-nums">
                      <span className="text-sm font-semibold text-foreground">Total a pagar</span>
                      <span className="text-sm font-semibold text-foreground">{formatBRL(totalDone)}</span>
                    </div>
                  </SectionCard>
                </>
              )}
            </section>

            {pendingConfirmationSessions.length > 0 && (
              <section className="space-y-3">
                <SectionHeader
                  title={`Sessões a confirmar (${pendingConfirmationSessions.length})`}
                  description="Não entram no pagamento até a confirmação do mentor."
                />
                <SectionCard padding="none">
                  {pendingConfirmationSessions.map((s, index) => (
                    <ListRow
                      key={s.booking_id}
                      last={index === pendingConfirmationSessions.length - 1}
                      leading={<DateBlock date={s.date} tone="muted" />}
                      title={`${s.session_name} · ${shortName(s.member_name)}`}
                      subtitle={`Mentor: ${shortName(s.mentor_name)}`}
                      trailing={<StatusPill status="pending_confirmation" />}
                    />
                  ))}
                </SectionCard>
              </section>
            )}

            <Callout tone="info" icon={Info}>
              {PENDING_CONFIRMATION_FOOTNOTE} Realizadas incluem sessões marcadas como realizadas mesmo sem relatório salvo. Onboarding não é remunerado.
            </Callout>
          </>
        )}
      </PageContainer>

      <BottomSheet
        open={detailRow !== null}
        onOpenChange={(open) => !open && setDetailMentorId(null)}
        title={detailRow ? shortName(detailRow.name) : "Mentor"}
        description={filterKey ? `Sessões do mês selecionado` : "Histórico completo"}
        size="lg"
        footer={
          detailRow ? (
            <Button
              variant="outline"
              disabled={detailDownloading || detailRow.total === 0}
              onClick={() => handleDownload(detailRow.mentor, filterKey)}
            >
              {detailDownloading ? <Loader2 className="animate-spin" aria-hidden /> : <FileDown aria-hidden />}
              Exportar PDF
            </Button>
          ) : undefined
        }
      >
        {detailRow && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SectionCard padding="compact">
                <Stat size="sm" label="Realizadas" value={detailRow.completed} hint={detailRow.awaiting > 0 ? `${detailRow.awaiting} sem rel.` : undefined} />
              </SectionCard>
              <SectionCard padding="compact">
                <Stat size="sm" label="Agendadas" value={detailRow.scheduled} />
              </SectionCard>
              <SectionCard padding="compact">
                <Stat size="sm" label="A confirmar" value={detailRow.pendingConfirmation} tone={detailRow.pendingConfirmation > 0 ? "pending" : "default"} />
              </SectionCard>
              <SectionCard padding="compact">
                <Stat size="sm" label="A pagar" value={formatBRL(detailRow.revenueDone)} />
              </SectionCard>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <span className="tabular-nums">
                Valor por sessão: <span className="text-foreground font-medium">{formatBRL(detailRow.rate)}</span>
                {detailRow.usesDefaultRate && " (padrão)"}
              </span>
              {detailRow.kickoffCount > 0 && (
                <span className="tabular-nums">{detailRow.kickoffCount}× Mapeamento · {formatBRL(detailRow.rate * KICKOFF_FEE_MULTIPLIER)}</span>
              )}
            </div>

            {detailSessions.length === 0 ? (
              <EmptyState compact icon={Calendar} title="Nenhuma sessão neste período" />
            ) : (
              <SectionCard padding="none">
                {detailSessions.map((s, i) => {
                  const category = payoutCategoryOf(s.status);
                  const pending = category === "pending_confirmation";
                  return (
                    <ListRow
                      key={`${s.date}-${i}`}
                      last={i === detailSessions.length - 1}
                      leading={<DateBlock date={s.date} tone={pending ? "muted" : "default"} />}
                      title={s.session_name}
                      subtitle={`${shortName(s.member_name)}${s.is_retroactive ? " · registro histórico" : ""}`}
                      trailing={
                        <>
                          <StatusPill status={s.status || "scheduled"} className="hidden sm:inline-flex" />
                          <span
                            className={`text-sm font-medium tabular-nums ${pending ? "text-status-orange" : "text-foreground"}`}
                            title={pending ? PENDING_CONFIRMATION_HINT : undefined}
                          >
                            {formatBRL(s.value)}{pending ? " *" : ""}
                          </span>
                        </>
                      }
                    />
                  );
                })}
              </SectionCard>
            )}
            <p className="text-xs text-muted-foreground">* {PENDING_CONFIRMATION_FOOTNOTE}</p>
          </div>
        )}
      </BottomSheet>
    </AppLayout>
  );
};

export default AdminFinanceiroPage;
