import { AppLayout } from "@/components/AppLayout";
import { AdminMonthFilter } from "@/components/AdminMonthFilter";
import { useAdminFilter } from "@/contexts/AdminFilterContext";
import { Link, useNavigate } from "react-router-dom";
import {
  Users, Calendar, AlertTriangle, DollarSign,
  GraduationCap, Target, CheckCircle2, Clock, CalendarClock
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMembers, useMentors } from "@/hooks/useAdminData";
import { daysSinceBookingEnd, PENDING_CONFIRMATION_ALERT_DAYS, PENDING_CONFIRMATION_HINT } from "@/lib/bookingStatus";
import { shortName } from "@/lib/formatName";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ResultsRanking } from "@/components/ResultsRanking";
import { Button } from "@/components/ui/button";
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
  ProgressBar,
  LoadingState,
  ErrorState,
  EmptyState,
} from "@/components/ds";
import logoBegin from "@/assets/logo-begin.png";
import iconLiberty from "@/assets/icon-liberty.png";

/** Divisor de seção com a marca (Begin / Liberty). */
const SectionDivider = ({ logo, label }: { logo: string; label: string }) => (
  <div className="flex items-center gap-3 pt-2">
    <img src={logo} alt="" className="h-6 w-auto object-contain" draggable={false} />
    <SectionHeader title={label} />
    <div className="flex-1 h-px bg-border" aria-hidden />
  </div>
);

type StatTone = "default" | "success" | "warning" | "pending" | "danger" | "info" | "brand";

interface StatCardItem {
  label: string;
  value: string | number;
  icon: LucideIcon;
  to: string;
  hint?: string;
  tone?: StatTone;
  span?: string;
}

/** KPI clicável: um cartão, um número. */
const StatLinkCard = ({ item }: { item: StatCardItem }) => (
  <Link
    to={item.to}
    className={`block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background rounded-ds-lg ${item.span ?? ""}`}
  >
    <SectionCard interactive padding="compact" className="h-full">
      <Stat label={item.label} value={item.value} hint={item.hint} icon={item.icon} tone={item.tone} />
    </SectionCard>
  </Link>
);

const AdminDashboardPage = () => {
  const { data: members, isLoading: membersLoading, isError: membersError, refetch: refetchMembers } = useMembers();
  const { data: mentors } = useMentors();
  const { mode, monthKey, monthLabel } = useAdminFilter();
  const navigate = useNavigate();

  const isLoading = membersLoading;
  const filterKey = mode === "month" ? monthKey : null;

  // Sessões que passaram do horário sem confirmação do mentor (todos os membros ativos, Begin e Liberty).
  // Respeita o filtro de mês pela data da sessão.
  const pendingConfirmation = useMemo(() => {
    let total = 0;
    let overdue = 0;
    (members || [])
      .filter((m) => m.is_active !== false)
      .forEach((m) => {
        (m.pending_confirmation_sessions || []).forEach((s) => {
          if (!s.date || typeof s.date !== "string") return;
          if (filterKey && !s.date.startsWith(filterKey)) return;
          total++;
          const days = daysSinceBookingEnd({ scheduled_date: s.date, start_time: s.start_time, end_time: s.end_time });
          if (days >= PENDING_CONFIRMATION_ALERT_DAYS) overdue++;
        });
      });
    return { total, overdue };
  }, [members, filterKey]);

  // Metas e contagens do administrador consideram APENAS membros Begin ATIVOS.
  // Membros Liberty e membros inativos (encerrados) não entram.
  const beginMembers = useMemo(
    () => (members || []).filter((m) => m.member_tier !== "liberty" && m.is_active !== false),
    [members]
  );

  // Base da meta = membros Begin ATIVOS hoje (mesma contagem da aba "Membros Begin"),
  // válida para qualquer mês visualizado (passado, presente ou futuro).
  const monthMembers = beginMembers;



  const membersMetaAnalysis = useMemo(() => {
    let onTrack = 0, behind = 0, zero = 0;
    const zeroList: { name: string; id: string }[] = [];

    if (filterKey) {
      monthMembers.forEach((m) => {
        // Meta mensal do membro: min(2, sessões restantes até 12). Onboarding não conta.
        const remaining = Math.max(0, 12 - m.total_completed);
        const memberTarget = Math.min(2, remaining);
        const count = m.monthly_counts?.[filterKey] || 0;
        if (memberTarget === 0 || count >= memberTarget) onTrack++;
        else if (count >= 1) behind++;
        else { zero++; zeroList.push({ name: m.full_name, id: m.id }); }
      });
    } else {
      beginMembers.forEach((m) => {
        if (m.total_completed >= 12) onTrack++;
        else if (m.total_completed > 0) behind++;
        else { zero++; zeroList.push({ name: m.full_name, id: m.id }); }
      });
    }
    return { onTrack, behind, zero, zeroList };
  }, [beginMembers, monthMembers, filterKey]);

  // Meta mensal — somente Begin ativos e somente sessões REALIZADAS:
  // previstas = ativos × 2 · meta = 90% das previstas.
  const monthlyGoal = useMemo(() => {
    const totalMembers = monthMembers.length;
    const targetSessions = totalMembers * 2;
    let monthSessions = 0;
    let monthScheduled = 0;
    if (filterKey) {
      monthSessions = monthMembers.reduce((sum, m) => sum + (m.monthly_counts?.[filterKey] || 0), 0);
      monthScheduled = monthMembers.reduce((sum, m) => sum + (m.monthly_scheduled_counts[filterKey] || 0), 0);
    }
    const goalSessions = Math.ceil(targetSessions * 0.9);
    // Percentual relativo à META (90% das previstas), não ao total 100%.
    // A barra atinge 100% quando a meta de 90% é alcançada.
    const pct = goalSessions > 0 ? Math.min(100, Math.round((monthSessions / goalSessions) * 100)) : 0;
    const goalReached = goalSessions > 0 && monthSessions >= goalSessions;
    return { totalMembers, targetSessions, goalSessions, monthSessions, monthScheduled, pct, goalReached };
  }, [monthMembers, filterKey]);





  // Realizadas: SOMENTE membros Begin (Liberty tem faixa própria abaixo).
  const completedCount = useMemo(() => {
    if (filterKey) return beginMembers.reduce((sum, m) => sum + (m.monthly_counts?.[filterKey] || 0), 0);
    return beginMembers.reduce((sum, m) => sum + m.total_completed, 0);
  }, [beginMembers, filterKey]);

  // Faixa Liberty: apenas membros ativos e sessões realizadas. Sem meta.
  const libertyMembers = useMemo(
    () => (members || []).filter((m) => m.member_tier === "liberty" && m.is_active !== false),
    [members]
  );
  const libertyCompleted = useMemo(() => {
    if (filterKey) return libertyMembers.reduce((sum, m) => sum + (m.monthly_counts?.[filterKey] || 0), 0);
    return libertyMembers.reduce((sum, m) => sum + m.total_completed, 0);
  }, [libertyMembers, filterKey]);


  const activeMentorsCount = useMemo(
    () => (mentors || []).filter((m) => m.is_active !== false).length,
    [mentors]
  );

  const handleMemberClick = (memberId: string) => {
    navigate(`/admin/membros?expand=${memberId}`);
  };

  // Próximas sessões agendadas (membros ativos, Begin e Liberty), apenas leitura.
  const upcomingSessions = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    return (members || [])
      .filter((m) => m.is_active !== false)
      .flatMap((m) =>
        (m.scheduled_sessions || [])
          .filter((s) => typeof s.date === "string" && s.date >= todayKey && (!filterKey || s.date.startsWith(filterKey)))
          .map((s) => ({ ...s, member_name: m.full_name, member_id: m.id })),
      )
      .sort((a, b) => `${a.date} ${a.start_time || ""}`.localeCompare(`${b.date} ${b.start_time || ""}`))
      .slice(0, 6);
  }, [members, filterKey]);

  // Encerramentos nos próximos 60 dias (membros Begin ativos com data de término).
  const upcomingEndings = useMemo(() => {
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const limit = new Date(today);
    limit.setDate(limit.getDate() + 60);
    const limitKey = limit.toISOString().slice(0, 10);
    return beginMembers
      .filter((m) => m.program_end_date && m.program_end_date >= todayKey && m.program_end_date <= limitKey)
      .sort((a, b) => (a.program_end_date || "").localeCompare(b.program_end_date || ""))
      .slice(0, 6)
      .map((m) => {
        const days = Math.max(0, Math.round((new Date(`${m.program_end_date}T12:00:00`).getTime() - today.getTime()) / 86400000));
        return { ...m, daysLeft: days };
      });
  }, [beginMembers]);

  const statCards: StatCardItem[] = [
    { label: "Membros Begin ativos", value: filterKey ? monthlyGoal.totalMembers : beginMembers.length, icon: Users, to: "/admin/membros", hint: "com acesso ativo", span: "lg:col-span-2" },
    { label: filterKey ? "Meta do mês" : "Sessões Begin (total)", value: filterKey ? `${monthlyGoal.monthSessions}/${monthlyGoal.goalSessions}` : completedCount, icon: Target, to: "/admin/agenda", hint: filterKey ? "2 por membro ativo" : "histórico Begin", span: "lg:col-span-2" },
    { label: filterKey ? "Realizadas no mês (Begin)" : "Realizadas total (Begin)", value: completedCount, icon: CheckCircle2, to: "/admin/agenda", hint: "somente Begin", span: "lg:col-span-2" },
    { label: filterKey ? "Membros no ritmo" : "Jornada completa (12)", value: membersMetaAnalysis.onTrack, icon: Users, to: "/admin/membros?filter=on_track", hint: `de ${filterKey ? monthlyGoal.totalMembers : beginMembers.length}`, span: "lg:col-span-3" },
    { label: "Mentores ativos", value: activeMentorsCount, icon: GraduationCap, to: "/admin/mentores", hint: "disponíveis para agenda", span: "lg:col-span-3" },
  ];

  const libertyCards: StatCardItem[] = [
    { label: "Membros Liberty ativos", value: libertyMembers.length, icon: Users, to: "/admin/membros", hint: "com acesso ativo", span: "lg:col-span-3" },
    { label: filterKey ? "Realizadas no mês (Liberty)" : "Realizadas total (Liberty)", value: libertyCompleted, icon: CheckCircle2, to: "/admin/agenda", hint: "sessões concluídas", span: "lg:col-span-3" },
  ];

  const endingTone = (days: number): "danger" | "warning" | "info" => (days <= 15 ? "danger" : days <= 30 ? "warning" : "info");






  return (
    <AppLayout role="admin">
      <PageContainer variant="wide">
        <PageHeader
          eyebrow="Administração"
          title="Painel geral"
          description={mode === "overview" ? "Visão geral · todos os períodos" : monthLabel}
          actions={<AdminMonthFilter />}
        />

        {isLoading ? (
          <>
            <LoadingState variant="stats" rows={4} />
            <LoadingState variant="list" rows={4} />
          </>
        ) : membersError ? (
          <ErrorState title="Não foi possível carregar o painel" onRetry={() => refetchMembers()} />
        ) : (
          <>
            {pendingConfirmation.total > 0 && (
              <Callout
                tone={pendingConfirmation.overdue > 0 ? "danger" : "warning"}
                icon={Clock}
                title={
                  <>
                    {pendingConfirmation.total} sess{pendingConfirmation.total === 1 ? "ão" : "ões"} a confirmar
                    {pendingConfirmation.overdue > 0 && (
                      <span className="text-destructive"> · {pendingConfirmation.overdue} há {PENDING_CONFIRMATION_ALERT_DAYS}+ dias sem resposta do mentor</span>
                    )}
                  </>
                }
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link to="/admin/agenda?status=pending_confirmation">Ver na agenda</Link>
                  </Button>
                }
              >
                {PENDING_CONFIRMATION_HINT}
              </Callout>
            )}

            <SectionDivider logo={logoBegin} label="Begin" />

            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              {statCards.map((s) => (
                <StatLinkCard key={s.label} item={s} />
              ))}
            </div>


            {/* Meta mensal Begin */}
            {filterKey && (
              <SectionCard as="section" className="space-y-4">
                <SectionHeader
                  as="h3"
                  title="Meta mensal Begin"
                  description="Previstas = membros ativos × 2 · meta = 90% das previstas · só sessões realizadas contam."
                  actions={
                    <Stat
                      size="sm"
                      label="da meta"
                      value={`${monthlyGoal.pct}%`}
                      tone={monthlyGoal.pct >= 100 ? "success" : "default"}
                    />
                  }
                />
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Realizadas" value={monthlyGoal.monthSessions} />
                  <Stat label="Agendadas" value={monthlyGoal.monthScheduled} />
                  <Stat label="Meta" value={monthlyGoal.goalSessions} hint={`de ${monthlyGoal.targetSessions}`} />
                </div>
                <ProgressBar
                  value={monthlyGoal.monthSessions}
                  max={monthlyGoal.goalSessions}
                  tone="goal"
                  label={`Meta mensal: ${monthlyGoal.monthSessions} de ${monthlyGoal.goalSessions} sessões`}
                />
                {monthlyGoal.goalReached && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                    Meta do mês alcançada.
                  </div>
                )}
              </SectionCard>
            )}

            <SectionDivider logo={iconLiberty} label="Liberty" />

            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              {libertyCards.map((s) => (
                <StatLinkCard key={s.label} item={s} />
              ))}
            </div>

            {/* Progresso da jornada: só na visão geral (no mês a meta acima já cobre) */}
            {!filterKey && (
              <SectionCard as="section" className="space-y-4">
                <SectionHeader as="h3" title="Progresso da jornada: 12 sessões" description="Membros Begin ativos por etapa." />
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Jornada completa" value={membersMetaAnalysis.onTrack} />
                  <Stat label="Em progresso" value={membersMetaAnalysis.behind} />
                  <Stat label="Sem iniciar" value={membersMetaAnalysis.zero} tone={membersMetaAnalysis.zero > 0 ? "danger" : "default"} />
                </div>
                {membersMetaAnalysis.zeroList.length > 0 && (
                  <Callout tone="danger" icon={AlertTriangle} title="Membros sem nenhuma sessão realizada">
                    <div className="flex flex-wrap gap-2 pt-1">
                      {membersMetaAnalysis.zeroList.map((member) => (
                        <Button key={member.id} size="sm" variant="outline" onClick={() => handleMemberClick(member.id)}>
                          {shortName(member.name)}
                        </Button>
                      ))}
                    </div>
                  </Callout>
                )}
              </SectionCard>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <section className="space-y-3">
                <SectionHeader
                  title="Próximas sessões"
                  description={filterKey ? "Agendadas no mês selecionado." : "Agendadas a partir de hoje."}
                  actions={
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/admin/agenda">Agenda geral</Link>
                    </Button>
                  }
                />
                {upcomingSessions.length === 0 ? (
                  <EmptyState compact icon={Calendar} title="Nenhuma sessão agendada" description="Quando os membros agendarem, as próximas sessões aparecem aqui." />
                ) : (
                  <SectionCard padding="none">
                    {upcomingSessions.map((s, index) => (
                      <ListRow
                        key={s.booking_id}
                        last={index === upcomingSessions.length - 1}
                        onPress={() => navigate(`/admin/agenda?booking=${s.booking_id}`)}
                        leading={<DateBlock date={s.date} />}
                        title={`${shortName(s.member_name)} · ${s.session_name}`}
                        subtitle={`${s.start_time ? `${String(s.start_time).slice(0, 5)} · ` : ""}Mentor: ${shortName(s.mentor_name)}`}
                        trailing={<StatusPill status={s.status} />}
                      />
                    ))}
                  </SectionCard>
                )}
              </section>

              <section className="space-y-3">
                <SectionHeader
                  title="Encerramentos próximos"
                  description="Membros Begin que concluem o programa nos próximos 60 dias."
                  actions={
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/admin/encerramentos">Ver todos</Link>
                    </Button>
                  }
                />
                {upcomingEndings.length === 0 ? (
                  <EmptyState compact icon={CalendarClock} title="Nenhum encerramento nos próximos 60 dias" />
                ) : (
                  <SectionCard padding="none">
                    {upcomingEndings.map((m, index) => (
                      <ListRow
                        key={m.id}
                        last={index === upcomingEndings.length - 1}
                        onPress={() => navigate(`/admin/membros/${m.id}/editar`)}
                        leading={<DateBlock date={m.program_end_date || ""} tone="muted" />}
                        title={shortName(m.full_name)}
                        subtitle={`${m.total_completed}/12 sessões${m.company_name ? ` · ${m.company_name}` : ""}`}
                        trailing={
                          <StatusPill tone={endingTone(m.daysLeft)}>
                            {m.daysLeft === 0 ? "Encerra hoje" : `${m.daysLeft} ${m.daysLeft === 1 ? "dia" : "dias"}`}
                          </StatusPill>
                        }
                      />
                    ))}
                  </SectionCard>
                )}
              </section>
            </div>

            {/* Ranking de resultados */}
            <AdminResultsSection />

            {/* Atalhos */}
            <section className="space-y-3">
              <SectionHeader title="Atalhos" />
              <SectionCard padding="none">
                {[
                  { label: "Ver membros", path: "/admin/membros", icon: Users },
                  { label: "Ver mentores", path: "/admin/mentores", icon: GraduationCap },
                  { label: "Financeiro", path: "/admin/financeiro", icon: DollarSign },
                  { label: "Agenda geral", path: "/admin/agenda", icon: Calendar },
                ].map((link, index, arr) => (
                  <ListRow
                    key={link.path}
                    last={index === arr.length - 1}
                    onPress={() => navigate(link.path)}
                    leading={<link.icon className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />}
                    title={link.label}
                  />
                ))}
              </SectionCard>
            </section>
          </>
        )}
      </PageContainer>
    </AppLayout>
  );
};

// Sub-component for results ranking.
// Só entram tarefas concluídas COM resultado registrado (tipo + valor).
const AdminResultsSection = () => {
  const { data: allTasks = [] } = useQuery({
    queryKey: ["admin-result-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("session_tasks")
        .select("*")
        .eq("is_completed", true)
        .not("result_type", "is", null)
        .not("result_value", "is", null);
      if (error) throw error;
      return (data || []).filter((t) => String(t.result_value || "").trim().length > 0);
    },
  });


  const bookingIds = [...new Set(allTasks.map(t => t.booking_id))];
  const { data: taskBookings = [] } = useQuery({
    queryKey: ["admin-task-bookings", bookingIds],
    queryFn: async () => {
      if (!bookingIds.length) return [];
      const { data } = await supabase.from("bookings").select("id, liberty_id").in("id", bookingIds);
      return data || [];
    },
    enabled: bookingIds.length > 0,
  });

  const libertyIds = [...new Set(taskBookings.map(b => b.liberty_id))];
  const { data: libertyProfiles = [] } = useQuery({
    queryKey: ["admin-task-profiles", libertyIds],
    queryFn: async () => {
      if (!libertyIds.length) return [];
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", libertyIds);
      return data || [];
    },
    enabled: libertyIds.length > 0,
  });

  const profileMap = useMemo(() => {
    const bookingToLiberty = Object.fromEntries(taskBookings.map(b => [b.id, b.liberty_id]));
    const libertyToName = Object.fromEntries(libertyProfiles.map(p => [p.id, p.full_name]));
    const result: Record<string, string> = {};
    allTasks.forEach(t => {
      const libertyId = bookingToLiberty[t.booking_id];
      result[t.booking_id] = libertyToName[libertyId] || "Membro";
    });
    return result;
  }, [allTasks, taskBookings, libertyProfiles]);

  if (allTasks.length === 0) return null;

  return <ResultsRanking tasks={allTasks} profileMap={profileMap} />;
};

export default AdminDashboardPage;
