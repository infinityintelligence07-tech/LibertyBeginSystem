import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { AdminMonthFilter } from "@/components/AdminMonthFilter";
import { useAdminFilter } from "@/contexts/AdminFilterContext";
import { useMentors, useAdminStats, useMembers } from "@/hooks/useAdminData";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { shortName } from "@/lib/formatName";
import { UserAvatar } from "@/components/UserAvatar";
import { DollarSign, TrendingUp, ChevronDown, FileDown, Loader2, Calendar } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { downloadMentorReportPdf, MentorReportSession } from "@/lib/mentorReportPdf";
import { toast } from "sonner";
import { sessionFee, KICKOFF_FEE_MULTIPLIER } from "@/lib/mentorFees";

const AdminFinanceiroPage = () => {
  const { data: mentors, isLoading } = useMentors();
  const { data: members } = useMembers();
  const { data: stats } = useAdminStats();
  const { mode, monthKey } = useAdminFilter();

  const defaultRate = stats?.sessionValue ?? 300;
  const filterKey = mode === "month" ? monthKey : null;

  const [expandedMentor, setExpandedMentor] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // All sessions (completed + scheduled) for a mentor in given period
  const getMentorSessions = (mentorId: string, periodKey: string | null): MentorReportSession[] => {
    if (!members) return [];
    const mentor = mentors?.find(m => m.id === mentorId);
    const rate = mentor?.session_rate ?? defaultRate;
    const list: MentorReportSession[] = [];
    members.forEach(member => {
      const all = [...member.completed_sessions, ...member.scheduled_sessions];
      all.forEach(cs => {
        if (cs.mentor_id ? cs.mentor_id !== mentorId : cs.mentor_name !== mentor?.full_name) return;
        if (periodKey && !cs.date.startsWith(periodKey)) return;
        const value = sessionFee(rate, { session_name: cs.session_name });
        if (value <= 0) return; // Onboarding não é remunerado
        list.push({
          date: cs.date,
          session_name: cs.session_name,
          member_name: member.full_name,
          value,
          status: cs.status,
        });
      });

    });
    list.sort((a, b) => a.date.localeCompare(b.date));
    return list;
  };

  const handleDownload = async (mentorId: string, mentorName: string, periodKey: string | null) => {
    setDownloadingId(`${mentorId}-${periodKey || "all"}`);
    try {
      const sessions = getMentorSessions(mentorId, periodKey);
      if (sessions.length === 0) {
        toast.error("Nenhuma sessão encontrada para este período");
        return;
      }
      const mentor = mentors?.find(m => m.id === mentorId);
      const rate = mentor?.session_rate ?? defaultRate;
      let periodLabel = "Histórico completo";
      if (periodKey) {
        const [y, m] = periodKey.split("-");
        periodLabel = new Date(parseInt(y), parseInt(m) - 1)
          .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
        periodLabel = periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1);
      }
      await downloadMentorReportPdf({
        mentor_name: mentorName,
        period_label: periodLabel,
        sessions,
        rate,
      });
      toast.success("PDF gerado");
    } catch (e: any) {
      toast.error("Erro ao gerar PDF: " + (e?.message || ""));
    } finally {
      setDownloadingId(null);
    }
  };

  // Mentores inativados saem de todos os controles financeiros.
  const activeMentors = useMemo(
    () => (mentors || []).filter((m) => m.is_active !== false),
    [mentors]
  );

  const mentorRows = useMemo(() => {
    return activeMentors.map(m => {
      const completed = filterKey ? ((m.monthly_completed || {})[filterKey] || 0) : m.total_completed;
      const scheduled = filterKey ? ((m.monthly_scheduled || {})[filterKey] || 0) : m.total_scheduled;
      const awaiting = filterKey ? ((m.monthly_awaiting_report || {})[filterKey] || 0) : m.total_awaiting_report;
      const rate = m.session_rate ?? defaultRate;
      const total = completed + scheduled + awaiting;
      // Mapeamento do Negócio (3h) = dobro do valor
      const kCompleted = filterKey ? ((m.monthly_kickoff_completed || {})[filterKey] || 0) : m.total_kickoff_completed;
      const kScheduled = filterKey ? ((m.monthly_kickoff_scheduled || {})[filterKey] || 0) : m.total_kickoff_scheduled;
      const kAwaiting = filterKey ? ((m.monthly_kickoff_awaiting_report || {})[filterKey] || 0) : m.total_kickoff_awaiting_report;
      const kTotal = kCompleted + kScheduled + kAwaiting;
      const extra = KICKOFF_FEE_MULTIPLIER - 1;
      return {
        id: m.id,
        name: m.full_name,
        avatar_url: m.avatar_url,
        completed,
        scheduled,
        awaiting,
        total,
        rate,
        kickoffCount: kTotal,
        revenueDone: (completed + kCompleted * extra) * rate,
        revenueProjected: (total + kTotal * extra) * rate,
      };
    }).sort((a, b) => b.total - a.total);
  }, [activeMentors, filterKey, defaultRate]);

  const totalCompleted = mentorRows.reduce((s, r) => s + r.completed, 0);
  const totalScheduled = mentorRows.reduce((s, r) => s + r.scheduled, 0);
  const totalAwaiting = mentorRows.reduce((s, r) => s + r.awaiting, 0);
  const totalDone = mentorRows.reduce((s, r) => s + r.revenueDone, 0);
  const totalProjected = mentorRows.reduce((s, r) => s + r.revenueProjected, 0);

  const renderMentorDetails = (mentorId: string, periodKey: string | null) => {
    const sessions = getMentorSessions(mentorId, periodKey);
    if (sessions.length === 0) {
      return <div className="px-4 py-3 text-xs text-muted-foreground">Nenhuma sessão neste período.</div>;
    }
    return (
      <div className="bg-muted/20 border-t border-border/60">
        <div className="px-4 pt-3 pb-2">
          <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80 font-semibold">
            Sessões · {sessions.length}
          </span>
        </div>
        <div className="px-4 pb-4 space-y-1.5">
          {sessions.map((s, i) => {
            const isDone = s.status === "completed";
            const sessionDate = new Date(s.date + "T23:59:59");
            const isPastNotDone = !isDone && sessionDate.getTime() < Date.now();
            const dotClass = isDone ? "bg-status-green" : isPastNotDone ? "bg-status-yellow" : "bg-status-blue";
            const tagClass = isDone
              ? "bg-status-green/10 text-status-green"
              : isPastNotDone
                ? "bg-status-yellow/10 text-status-yellow"
                : "bg-status-blue/10 text-status-blue";
            const tagLabel = isDone ? "Realizada" : isPastNotDone ? "Aguardando relatório" : "Agendada";
            return (
              <div key={i} className="flex items-center justify-between text-xs py-2 px-3 rounded-md bg-background/60 border border-border/60 hover:border-border transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
                  <span className="text-muted-foreground/80 tabular-nums shrink-0 w-20 text-[11px]">
                    {new Date(s.date + "T12:00:00").toLocaleDateString("pt-BR")}
                  </span>
                  <span className="text-foreground font-medium truncate">{s.session_name}</span>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="text-muted-foreground truncate">{shortName(s.member_name)}</span>
                  <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${tagClass}`}>
                    {tagLabel}
                  </span>
                </div>
                <span className="text-foreground tabular-nums font-medium shrink-0 ml-2">
                  R$ {s.value.toLocaleString("pt-BR")}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMentorRow = (row: typeof mentorRows[number], periodKey: string | null) => {
    const expandKey = `${row.id}-${periodKey || "all"}`;
    const isOpen = expandedMentor === expandKey;
    const isDownloading = downloadingId === expandKey;
    return (
      <>
        <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedMentor(isOpen ? null : expandKey)}>
          <TableCell>
            <div className="flex items-center gap-2.5">
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0 ${isOpen ? "rotate-180" : "-rotate-90"}`} />
              <UserAvatar name={row.name} avatarUrl={row.avatar_url} size={28} />
              <span className="text-sm font-medium text-foreground">{shortName(row.name)}</span>
            </div>
          </TableCell>
          <TableCell className="text-right tabular-nums">
            <span className={`text-sm font-semibold ${row.completed > 0 ? "text-status-green" : "text-muted-foreground"}`}>
              {row.completed}
            </span>
          </TableCell>
          <TableCell className="text-right tabular-nums">
            <span className={`text-sm font-semibold ${row.scheduled > 0 ? "text-status-blue" : "text-muted-foreground"}`}>
              {row.scheduled}
            </span>
          </TableCell>
          <TableCell className="text-right tabular-nums">
            <span className={`text-sm font-semibold ${row.awaiting > 0 ? "text-status-yellow" : "text-muted-foreground"}`}>
              {row.awaiting}
            </span>
          </TableCell>
          <TableCell className="text-right text-sm text-muted-foreground">
            R$ {row.rate}
            {row.kickoffCount > 0 && (
              <span className="block text-[10px] text-primary/80">
                {row.kickoffCount}× Mapeamento · R$ {row.rate * KICKOFF_FEE_MULTIPLIER}
              </span>
            )}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            <span className="text-sm font-medium text-foreground">R$ {row.revenueDone.toLocaleString("pt-BR")}</span>
          </TableCell>
          <TableCell className="text-right tabular-nums">
            <span className="text-sm font-semibold text-primary">R$ {row.revenueProjected.toLocaleString("pt-BR")}</span>
          </TableCell>
          <TableCell className="text-right">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1"
              disabled={isDownloading || row.total === 0}
              onClick={(e) => { e.stopPropagation(); handleDownload(row.id, row.name, periodKey); }}
            >
              {isDownloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
              PDF
            </Button>
          </TableCell>
        </TableRow>
        {isOpen && (
          <TableRow>
            <TableCell colSpan={8} className="p-0">
              {renderMentorDetails(row.id, periodKey)}
            </TableCell>
          </TableRow>
        )}
      </>
    );
  };

  return (
    <AppLayout role="admin">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
        <motion.div variants={fadeUpItem} className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Financeiro</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Valor padrão por sessão: R$ {defaultRate.toFixed(0)} · Projeção inclui sessões agendadas
            </p>
          </div>
          <AdminMonthFilter />
        </motion.div>

        <motion.div variants={fadeUpItem} className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="glass-card p-5">
            <TrendingUp className="h-5 w-5 text-status-green mb-3" />
            <p className="text-2xl font-semibold text-foreground tabular-nums">{totalCompleted}</p>
            <p className="text-xs text-muted-foreground mt-1">realizadas {filterKey ? "no mês" : ""}</p>
          </div>
          <div className="glass-card p-5">
            <Calendar className="h-5 w-5 text-status-blue mb-3" />
            <p className="text-2xl font-semibold text-foreground tabular-nums">{totalScheduled}</p>
            <p className="text-xs text-muted-foreground mt-1">agendadas {filterKey ? "no mês" : ""}</p>
          </div>
          <div className="glass-card p-5">
            <Calendar className="h-5 w-5 text-status-yellow mb-3" />
            <p className="text-2xl font-semibold text-foreground tabular-nums">{totalAwaiting}</p>
            <p className="text-xs text-muted-foreground mt-1">aguardando relatório</p>
          </div>
          <div className="glass-card p-5">
            <DollarSign className="h-5 w-5 text-status-green mb-3" />
            <p className="text-2xl font-semibold text-foreground tabular-nums">
              R$ {totalDone.toLocaleString("pt-BR")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">a pagar (realizadas)</p>
          </div>
          <div className="glass-card p-5">
            <DollarSign className="h-5 w-5 text-primary mb-3" />
            <p className="text-2xl font-semibold text-foreground tabular-nums">
              R$ {totalProjected.toLocaleString("pt-BR")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">projeção total</p>
          </div>
        </motion.div>

        <motion.div variants={fadeUpItem} className="glass-card overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm animate-pulse">Carregando...</div>
          ) : mentorRows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={DollarSign}
                compact
                title={filterKey ? "Nenhuma sessão neste mês" : "Nenhuma sessão registrada"}
                description={filterKey ? "Tente outro período no filtro acima." : "Os repasses aparecem aqui assim que as sessões forem realizadas."}
              />
            </div>
          ) : (
            <Table className="[&_tr]:border-border/60 [&_th]:text-foreground/70 [&_th]:text-[10px] [&_th]:uppercase [&_th]:tracking-[0.12em] [&_th]:font-semibold [&_th]:h-10">
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Mentor</TableHead>
                  <TableHead className="text-right">Realizadas</TableHead>
                  <TableHead className="text-right">Agendadas</TableHead>
                  <TableHead className="text-right">Aguardando</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">A pagar</TableHead>
                  <TableHead className="text-right">Projeção</TableHead>
                  <TableHead className="text-right">Relatório</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mentorRows.map((row) => <React.Fragment key={row.id}>{renderMentorRow(row, filterKey)}</React.Fragment>)}
                <TableRow className="bg-muted/20 hover:bg-muted/20 !border-t !border-border">
                  <TableCell><span className="text-sm font-bold text-foreground">Total</span></TableCell>
                  <TableCell className="text-right tabular-nums"><span className="text-sm font-bold text-status-green">{totalCompleted}</span></TableCell>
                  <TableCell className="text-right tabular-nums"><span className="text-sm font-bold text-status-blue">{totalScheduled}</span></TableCell>
                  <TableCell className="text-right tabular-nums"><span className="text-sm font-bold text-status-yellow">{totalAwaiting}</span></TableCell>
                  <TableCell />
                  <TableCell className="text-right tabular-nums"><span className="text-sm font-bold text-foreground">R$ {totalDone.toLocaleString("pt-BR")}</span></TableCell>
                  <TableCell className="text-right tabular-nums"><span className="text-sm font-bold text-primary">R$ {totalProjected.toLocaleString("pt-BR")}</span></TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </motion.div>
      </motion.div>
    </AppLayout>
  );
};

export default AdminFinanceiroPage;
