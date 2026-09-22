import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { AdminMonthFilter } from "@/components/AdminMonthFilter";
import { useAdminFilter } from "@/contexts/AdminFilterContext";
import { Link, useNavigate } from "react-router-dom";
import {
  Users, Calendar, AlertTriangle, DollarSign,
  ArrowRight, GraduationCap, Target, CheckCircle2
} from "lucide-react";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { useAdminStats, useMembers, useMentors } from "@/hooks/useAdminData";
import { shortName } from "@/lib/formatName";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ResultsRanking } from "@/components/ResultsRanking";
import logoBegin from "@/assets/logo-begin.png";
import iconLiberty from "@/assets/icon-liberty.png";

/** Section divider with brand logo + label, used to separate Begin and Liberty blocks. */
const SectionDivider = ({ logo, label }: { logo: string; label: string }) => (
  <motion.div variants={fadeUpItem} className="flex items-center gap-3 pt-2 pb-1">
    <img src={logo} alt={label} className="h-6 w-auto object-contain opacity-90" draggable={false} />
    <span className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">
      {label}
    </span>
    <div className="flex-1 h-px bg-border/60" />
  </motion.div>
);

const AdminDashboardPage = () => {
  const { data: stats, isLoading: statsLoading } = useAdminStats();
  const { data: members, isLoading: membersLoading } = useMembers();
  const { data: mentors } = useMentors();
  const { mode, monthKey, monthLabel } = useAdminFilter();
  const navigate = useNavigate();


  const isLoading = statsLoading || membersLoading;
  const filterKey = mode === "month" ? monthKey : null;

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
        const count = m.monthly_counts[filterKey] || 0;
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
      monthSessions = monthMembers.reduce((sum, m) => sum + (m.monthly_counts[filterKey] || 0), 0);
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
    if (filterKey) return beginMembers.reduce((sum, m) => sum + (m.monthly_counts[filterKey] || 0), 0);
    return beginMembers.reduce((sum, m) => sum + m.total_completed, 0);
  }, [beginMembers, filterKey]);

  // Faixa Liberty: apenas membros ativos e sessões realizadas. Sem meta.
  const libertyMembers = useMemo(
    () => (members || []).filter((m) => m.member_tier === "liberty" && m.is_active !== false),
    [members]
  );
  const libertyCompleted = useMemo(() => {
    if (filterKey) return libertyMembers.reduce((sum, m) => sum + (m.monthly_counts[filterKey] || 0), 0);
    return libertyMembers.reduce((sum, m) => sum + m.total_completed, 0);
  }, [libertyMembers, filterKey]);


  const sessionValue = stats?.sessionValue ?? 300;

  const activeMentorsCount = useMemo(
    () => (mentors || []).filter((m) => m.is_active !== false).length,
    [mentors]
  );

  const brl = (v: number) =>
    `R$ ${Math.round(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

  const handleMemberClick = (memberId: string) => {
    navigate(`/admin/membros?expand=${memberId}`);
  };

  const statCards = [
    { label: filterKey ? "Membros Begin ativos nesse mês" : "Membros Begin ativos", value: filterKey ? monthlyGoal.totalMembers : beginMembers.length, icon: Users, accent: "primary", to: "/admin/membros", hint: filterKey ? "Ativos nesse mês" : "Begin com acesso ativo", span: "lg:col-span-2" },
    { label: filterKey ? "Meta do mês" : "Sessões Begin (total)", value: filterKey ? `${monthlyGoal.monthSessions}/${monthlyGoal.goalSessions}` : completedCount, icon: Target, accent: "yellow", to: "/admin/agenda", hint: filterKey ? "2 sessões por membro ativo" : "Histórico Begin", span: "lg:col-span-2" },
    { label: filterKey ? "Realizadas no mês (Begin)" : "Realizadas total (Begin)", value: completedCount, icon: CheckCircle2, accent: "green", to: "/admin/agenda", hint: "Somente membros Begin", span: "lg:col-span-2" },
    { label: filterKey ? "Membros com 2+ sessões" : "Jornada completa (12)", value: `${membersMetaAnalysis.onTrack}/${filterKey ? monthlyGoal.totalMembers : beginMembers.length}`, icon: Users, accent: "primary", to: "/admin/membros?filter=on_track", hint: "No ritmo esperado", span: "lg:col-span-3" },
    { label: "Mentores ativos", value: activeMentorsCount, icon: GraduationCap, accent: "primary", to: "/admin/mentores", hint: "Disponíveis para agenda", span: "lg:col-span-3" },
  ];

  const libertyCards = [
    { label: "Membros Liberty ativos", value: libertyMembers.length, icon: Users, accent: "silver", to: "/admin/membros", hint: "Com acesso ativo", span: "lg:col-span-3" },
    { label: filterKey ? "Realizadas no mês (Liberty)" : "Realizadas total (Liberty)", value: libertyCompleted, icon: CheckCircle2, accent: "silver", to: "/admin/agenda", hint: "Sessões concluídas", span: "lg:col-span-3" },
  ];






  const accentBg: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    yellow: "bg-status-yellow/10 text-status-yellow",
    green: "bg-status-green/10 text-status-green",
    silver: "bg-silver/10 text-silver-light",
  };

  // Leve degradê na cor do ícone — sutil no dark, um pouco mais visível no light
  // para melhorar a separação visual entre os cards.
  const accentTint: Record<string, string> = {
    primary: "bg-gradient-to-br from-primary/[0.06] via-transparent to-transparent dark:from-primary/[0.02]",
    yellow: "bg-gradient-to-br from-status-yellow/[0.07] via-transparent to-transparent dark:from-status-yellow/[0.025]",
    green: "bg-gradient-to-br from-status-green/[0.07] via-transparent to-transparent dark:from-status-green/[0.025]",
    silver: "bg-gradient-to-br from-silver/[0.07] via-transparent to-transparent dark:from-silver/[0.025]",
  };

  return (
    <AppLayout role="admin">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-8">
        <motion.div variants={fadeUpItem} className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1">Administração</p>
            <h1 className="text-2xl font-semibold text-foreground">Painel geral</h1>
            <p className="text-muted-foreground text-sm mt-1 capitalize">
              {mode === "overview" ? "Visão geral · todos os períodos" : monthLabel}
            </p>
          </div>
          <AdminMonthFilter />
        </motion.div>

        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass-card p-5 animate-pulse h-24" />
            ))}
          </div>
        ) : (
          <>
            <SectionDivider logo={logoBegin} label="Begin" />

            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">

              {statCards.map((s) => (
                <motion.div key={s.label} variants={fadeUpItem} className={s.span}>
                  <Link
                    to={s.to}
                    className={`glass-card p-5 h-full flex flex-col justify-between gap-4 hover:border-primary/40 transition-colors group ${accentTint[s.accent]}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium leading-tight">
                        {s.label}
                      </p>
                      <span className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${accentBg[s.accent]}`}>
                        <s.icon className="h-4 w-4" />
                      </span>
                    </div>
                    <div>
                      <p className="text-3xl font-semibold text-foreground tabular-nums leading-none group-hover:text-primary transition-colors">
                        {s.value}
                      </p>
                      {s.hint && (
                        <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight">{s.hint}</p>
                      )}
                    </div>
                  </Link>

                </motion.div>
              ))}
            </div>


            {/* Infographic monthly goal */}
            {filterKey && (() => {
              const pct = monthlyGoal.pct;
              const R = 42;
              const C = 2 * Math.PI * R;
              const dash = Math.max(0, Math.min(C, (pct / 100) * C));
              return (
                <motion.div variants={fadeUpItem} className={`glass-card p-6 ${monthlyGoal.goalReached ? "border-status-green/30" : ""}`}>
                  <div className="flex items-center gap-5">
                    {/* Circular gauge */}
                    <div className="relative shrink-0">
                      <svg width="104" height="104" viewBox="0 0 104 104" className="rotate-[-90deg]">
                        <defs>
                          <linearGradient id="goalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="hsl(var(--status-yellow))" />
                            <stop offset="100%" stopColor="hsl(var(--status-green))" />
                          </linearGradient>
                        </defs>
                        <circle cx="52" cy="52" r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth="9" />
                        <circle
                          cx="52" cy="52" r={R} fill="none" stroke="url(#goalGrad)" strokeWidth="9" strokeLinecap="round"
                          strokeDasharray={`${dash} ${C}`}
                          className="transition-all duration-700"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-2xl font-semibold tabular-nums leading-none ${monthlyGoal.goalReached ? "text-status-green" : "text-foreground"}`}>
                          {pct}%
                        </span>
                        <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">da meta</span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex-1 min-w-0">
                      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                        <Target className={`h-4 w-4 ${monthlyGoal.goalReached ? "text-status-green" : "text-primary"}`} />
                        Meta mensal Begin
                      </h2>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-lg bg-status-green/8 border border-status-green/15 px-2.5 py-2">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="h-2 w-2 rounded-full bg-status-green" />
                            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Realizadas</span>
                          </div>
                          <p className="text-lg font-semibold tabular-nums text-foreground leading-none">{monthlyGoal.monthSessions}</p>
                        </div>
                        <div className="rounded-lg bg-status-yellow/8 border border-status-yellow/15 px-2.5 py-2">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="h-2 w-2 rounded-full bg-status-yellow" />
                            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Agendadas</span>
                          </div>
                          <p className="text-lg font-semibold tabular-nums text-foreground leading-none">{monthlyGoal.monthScheduled}</p>
                        </div>
                        <div className="rounded-lg bg-muted/40 border border-border/60 px-2.5 py-2">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="h-2 w-2 rounded-full bg-muted-foreground/60" />
                            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Meta</span>
                          </div>
                          <p className="text-lg font-semibold tabular-nums text-foreground leading-none">{monthlyGoal.goalSessions}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Segmented progress bar with milestones */}
                  <div className="mt-5">
                    <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-status-yellow to-status-green"
                        style={{ width: `${Math.max(pct, pct > 0 ? 5 : 0)}%` }}
                      />
                      {/* milestone ticks */}
                      {[25, 50, 75].map((m) => (
                        <div key={m} className="absolute top-0 bottom-0 w-px bg-background/60" style={{ left: `${m}%` }} />
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground tabular-nums">
                      <span>0</span>
                      <span className="text-foreground/70">meta {monthlyGoal.goalSessions}</span>
                    </div>
                  </div>

                  {monthlyGoal.goalReached && (
                    <div className="mt-4 p-3 rounded-lg bg-status-green/5 border border-status-green/20 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-status-green shrink-0" />
                      <span className="text-sm font-medium text-status-green">Meta do mês alcançada.</span>
                    </div>
                  )}
                </motion.div>
              );
            })()}

            <SectionDivider logo={iconLiberty} label="Liberty" />

            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              {libertyCards.map((s) => (
                <motion.div key={s.label} variants={fadeUpItem} className={s.span}>
                  <Link
                    to={s.to}
                    className={`glass-card p-5 h-full flex flex-col justify-between gap-4 hover:border-silver/40 transition-colors group ${accentTint[s.accent]}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium leading-tight">
                        {s.label}
                      </p>
                      <span className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${accentBg[s.accent]}`}>
                        <s.icon className="h-4 w-4" />
                      </span>
                    </div>
                    <div>
                      <p className="text-3xl font-semibold text-foreground tabular-nums leading-none">{s.value}</p>
                      {s.hint && <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight">{s.hint}</p>}
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>


            {/* Members meta tracking — only when not filtering by month (avoids redundancy with gamified goal above) */}
            {!filterKey && (
              <motion.div variants={fadeUpItem} className="glass-card p-6">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
                  <Target className="h-4 w-4 text-primary" />
                  Progresso da jornada: 12 sessões
                </h2>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="p-4 rounded-lg bg-background/40 border border-border">
                    <p className="text-2xl font-semibold text-status-green tabular-nums leading-none">{membersMetaAnalysis.onTrack}</p>
                    <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-wider">Completos</p>
                  </div>
                  <div className="p-4 rounded-lg bg-background/40 border border-border">
                    <p className="text-2xl font-semibold text-status-yellow tabular-nums leading-none">{membersMetaAnalysis.behind}</p>
                    <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-wider">Em progresso</p>
                  </div>
                  <div className="p-4 rounded-lg bg-background/40 border border-border">
                    <p className="text-2xl font-semibold text-destructive tabular-nums leading-none">{membersMetaAnalysis.zero}</p>
                    <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-wider">Sem iniciar</p>
                  </div>
                </div>
                {membersMetaAnalysis.zeroList.length > 0 && (
                  <div className="rounded-lg border border-border bg-background/30 p-3">
                    <div className="flex items-center gap-2 text-destructive text-xs font-medium mb-2">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Membros sem nenhuma sessão realizada
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {membersMetaAnalysis.zeroList.map((member) => (
                        <button
                          key={member.id}
                          onClick={() => handleMemberClick(member.id)}
                          className="text-[10px] px-2 py-1 rounded-md bg-background/60 text-foreground border border-border hover:border-destructive/40 hover:text-destructive transition-colors cursor-pointer"
                        >
                          {shortName(member.name)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Results Ranking */}
            <AdminResultsSection />

            {/* Quick links */}
            <motion.div variants={fadeUpItem} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Ver membros", path: "/admin/membros", icon: Users, color: "text-primary" },
                { label: "Ver mentores", path: "/admin/mentores", icon: GraduationCap, color: "text-status-blue" },
                { label: "Financeiro", path: "/admin/financeiro", icon: DollarSign, color: "text-status-green" },
                { label: "Agenda geral", path: "/admin/agenda", icon: Calendar, color: "text-status-yellow" },
              ].map((link) => (
                <Link key={link.path} to={link.path} className="glass-card p-4 flex items-center gap-3 group">
                  <link.icon className={`h-5 w-5 ${link.color} shrink-0`} />
                  <span className="text-sm text-foreground group-hover:text-primary transition-colors">{link.label}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground ml-auto group-hover:translate-x-1 transition-transform shrink-0" />
                </Link>
              ))}
            </motion.div>
          </>
        )}
      </motion.div>
    </AppLayout>
  );
};

// Sub-component for results ranking.
// Só entram tarefas concluídas COM resultado registrado (tipo + valor).
const AdminResultsSection = () => {
  const { data: allTasks = [] } = useQuery({
    queryKey: ["admin-result-tasks"],
    queryFn: async () => {
      const { data } = await supabase
        .from("session_tasks")
        .select("*")
        .eq("is_completed", true)
        .not("result_type", "is", null)
        .not("result_value", "is", null);
      return (data || []).filter((t: any) => String(t.result_value || "").trim().length > 0);
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
