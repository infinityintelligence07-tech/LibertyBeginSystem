import { useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Users, Calendar, CheckCircle2, Target, Search, HelpCircle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { shortName } from "@/lib/formatName";
import { useNavigate } from "react-router-dom";
import {
  getEffectiveBookingStatus,
  isFutureScheduledBooking,
  isPendingConfirmationBooking,
  isRealizedSessionBooking,
  isVisibleSessionBooking,
  parsePlatformDateTime,
  sortByScheduledDateDesc,
  todayPlatformDate,
} from "@/lib/bookingStatus";
import { BEGIN_JOURNEY_SESSIONS, buildSessionProgress } from "@/lib/sessionProgress";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import {
  BottomSheet,
  Chip,
  DateBlock,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingState,
  PageContainer,
  PageHeader,
  ProgressBar,
  SectionCard,
  Stat,
  StatusPill,
  TextField,
} from "@/components/ds";

const MentorAlunosPage = () => {
  const navigate = useNavigate();
  const [showCompleted, setShowCompleted] = useState(false);
  const [search, setSearch] = useState("");
  const [tierTab, setTierTab] = useState<"begin" | "liberty">("begin");
  const [detailId, setDetailId] = useState<string | null>(null);

  // 1. ALL member profiles (Begin + Liberty) so mentor can see the full base
  const { data: allLiberties = [], isLoading: profilesLoading, isError: profilesError, refetch: refetchProfiles } = useQuery({
    queryKey: ["mentor-alunos-all-liberties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .in("member_tier", ["begin", "liberty"])
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
  });

  // 2. ALL bookings (D5: o mentor vê o histórico completo de todos os membros, inclusive com outros mentores)
  const { data: allBookings = [], isLoading: bookingsLoading, isError: bookingsError, refetch: refetchBookings } = useQuery({
    queryKey: ["mentor-alunos-all-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, liberty_id, mentor_id, session_id, scheduled_date, start_time, end_time, status, is_retroactive, report_required")
        .order("scheduled_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: mentorMarkerIds = [] } = useQuery({
    queryKey: ["mentor-alunos-mentor-marker-ids"],
    queryFn: async () => {
      const [sessionsRes, availabilityRes] = await Promise.all([
        supabase.from("mentor_sessions").select("mentor_id"),
        supabase.from("mentor_availability").select("mentor_id"),
      ]);
      if (sessionsRes.error) throw sessionsRes.error;
      if (availabilityRes.error) throw availabilityRes.error;
      return Array.from(new Set([
        ...((sessionsRes.data || []).map((r) => r.mentor_id)),
        ...((availabilityRes.data || []).map((r) => r.mentor_id)),
      ].filter(Boolean)));
    },
  });

  const excludedMentorProfileIds = useMemo(() => new Set([
    ...mentorMarkerIds,
    ...allBookings.map((b) => b.mentor_id).filter(Boolean),
  ]), [mentorMarkerIds, allBookings]);

  // Membros do programa que o mentor pode acompanhar (D5: todos).
  // Fora da lista: perfis de mentor, inativos e programa já encerrado.
  const today = todayPlatformDate();
  const memberProfiles = useMemo(
    () =>
      allLiberties.filter((p) => {
        if (excludedMentorProfileIds.has(p.id)) return false;
        if (p.is_active === false) return false;
        if (p.program_end_date && p.program_end_date < today) return false;
        return true;
      }),
    [allLiberties, excludedMentorProfileIds, today],
  );

  const allLibertyIds = useMemo(() => memberProfiles.map((p) => p.id), [memberProfiles]);

  // 3. Sessions lookup (para a jornada)
  const { data: sessions = [] } = useQuery({
    queryKey: ["mentor-alunos-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions").select("id, name, order, is_kickoff").order("order");
      if (error) throw error;
      return data || [];
    },
  });

  // 4. Tasks for all bookings
  const allBookingIds = useMemo(() => allBookings.map((b) => b.id), [allBookings]);
  const { data: allTasks = [] } = useQuery({
    queryKey: ["mentor-alunos-tasks", allBookingIds],
    queryFn: async () => {
      if (!allBookingIds.length) return [];
      const { data, error } = await supabase
        .from("session_tasks")
        .select("id, booking_id, is_completed, result_value")
        .in("booking_id", allBookingIds)
        .order("created_at");
      if (error) throw error;
      return data || [];
    },
    enabled: allBookingIds.length > 0,
  });

  const profileMap = useMemo(() => Object.fromEntries(memberProfiles.map((p) => [p.id, p])), [memberProfiles]);

  // Group bookings by liberty
  const libertySummaries = useMemo(() => {
    return allLibertyIds.map((libertyId) => {
      const libertyBookings = sortByScheduledDateDesc(allBookings.filter((b) => b.liberty_id === libertyId && isVisibleSessionBooking(b)));
      // Regra única da plataforma: realizada = fechada pelo mentor (com ou sem relatório); "A confirmar" não conta.
      const completed = libertyBookings.filter(isRealizedSessionBooking).length;
      const pendingConfirmation = libertyBookings.filter((b) => isPendingConfirmationBooking(b)).length;
      const scheduled = libertyBookings.filter(isFutureScheduledBooking).length;
      const journey = buildSessionProgress(sessions, libertyBookings);
      const libertyBookingIds = new Set(libertyBookings.map((b) => b.id));
      const libertyTasks = allTasks.filter((t) => libertyBookingIds.has(t.booking_id));
      const completedTasks = libertyTasks.filter((t) => t.is_completed).length;
      const withResults = libertyTasks.filter((t) => t.result_value).length;
      const p = profileMap[libertyId];

      return {
        libertyId,
        name: p?.full_name || "Membro",
        company: p?.company_name,
        tier: (p?.member_tier as "begin" | "liberty" | null) || "begin",
        programStartDate: p?.program_start_date || null,
        programEndDate: p?.program_end_date || null,
        avatarUrl: p?.avatar_url,
        bookings: libertyBookings,
        totalSessions: libertyBookings.length,
        completed,
        pendingConfirmation,
        scheduled,
        totalTasks: libertyTasks.length,
        completedTasks,
        withResults,
        journeyCompleted: journey.completedCount,
        // Concluído: 12 sessões distintas realizadas (mesma regra histórica da jornada)
        isGraduated: journey.completedCount >= BEGIN_JOURNEY_SESSIONS || completed >= BEGIN_JOURNEY_SESSIONS,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [allLibertyIds, allBookings, allTasks, profileMap, sessions]);

  const isLoadingPage = profilesLoading || bookingsLoading;
  const normalizedSearch = search.trim().toLowerCase();
  const filteredBySearch = normalizedSearch
    ? libertySummaries.filter((l) =>
        (l.name || "").toLowerCase().includes(normalizedSearch) ||
        (l.company || "").toLowerCase().includes(normalizedSearch)
      )
    : libertySummaries;
  const byTier = filteredBySearch.filter((l) => l.tier === tierTab);
  const activeSummaries = byTier.filter((l) => showCompleted ? l.isGraduated : !l.isGraduated);
  const activeCount = byTier.filter((l) => !l.isGraduated).length;
  const graduatedCount = byTier.filter((l) => l.isGraduated).length;
  const libertyTotal = libertySummaries.filter((l) => l.tier === "liberty").length;
  const beginTotal = libertySummaries.filter((l) => l.tier === "begin").length;
  const formatShortDate = (date?: string | null) => {
    const parsed = parsePlatformDateTime(date, "12:00:00");
    return parsed
      ? parsed.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Sao_Paulo" })
      : "Sem data";
  };

  const isErrorPage = profilesError || bookingsError;
  const retryAll = () => { refetchProfiles(); refetchBookings(); };
  const detail = detailId ? libertySummaries.find((l) => l.libertyId === detailId) ?? null : null;
  const sessionNameMap = useMemo(() => Object.fromEntries(sessions.map((s) => [s.id, s.name])), [sessions]);

  return (
    <AppLayout role="mentor">
      <PageContainer>
      <div className="space-y-6">
        <div>
          <PageHeader title="Membros" description="Visão completa de todos os membros do programa" />
        </div>

        {/* Busca e filtros */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
            <TextField
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou empresa"
              aria-label="Buscar membro"
              className="pl-10"
              containerClassName="w-full sm:max-w-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5" role="group" aria-label="Programa">
              <Chip active={tierTab === "begin"} onClick={() => setTierTab("begin")} count={beginTotal}>Begin</Chip>
              <Chip active={tierTab === "liberty"} onClick={() => setTierTab("liberty")} count={libertyTotal}>Liberty</Chip>
            </div>
            <span className="hidden sm:block h-5 w-px bg-border" aria-hidden />
            <div className="flex items-center gap-1.5" role="group" aria-label="Situação">
              <Chip active={!showCompleted} onClick={() => setShowCompleted(false)} count={activeCount}>Ativos</Chip>
              <Chip active={showCompleted} onClick={() => setShowCompleted(true)} count={graduatedCount}>Concluídos</Chip>
            </div>
          </div>
        </div>

        <div>
          {isErrorPage ? (
            <ErrorState title="Não foi possível carregar os membros" onRetry={retryAll} />
          ) : isLoadingPage ? (
            <LoadingState variant="list" rows={6} />
          ) : activeSummaries.length === 0 ? (
            <EmptyState
              icon={Users}
              title={normalizedSearch ? "Nenhum membro encontrado" : showCompleted ? "Nenhum membro concluiu a jornada ainda" : "Nenhum membro ativo no momento"}
              description={normalizedSearch ? "Tente outra busca ou limpe o filtro." : undefined}
              action={normalizedSearch ? <Button variant="outline" size="sm" onClick={() => setSearch("")}>Limpar busca</Button> : undefined}
            />
          ) : (
            <SectionCard padding="none">
              {activeSummaries.map((lib, idx) => {
                const taskPercent = lib.totalTasks > 0 ? Math.round((lib.completedTasks / lib.totalTasks) * 100) : 0;
                return (
                  <ListRow
                    key={lib.libertyId}
                    last={idx === activeSummaries.length - 1}
                    leading={<UserAvatar name={lib.name} avatarUrl={lib.avatarUrl} size={40} />}
                    title={
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{shortName(lib.name)}</span>
                        {lib.company && <span className="text-muted-foreground font-normal truncate hidden sm:inline">· {lib.company}</span>}
                      </span>
                    }
                    subtitle={
                      <span className="flex items-center gap-3">
                        <span className="w-24 sm:w-32 shrink-0">
                          <ProgressBar
                            value={lib.journeyCompleted}
                            max={BEGIN_JOURNEY_SESSIONS}
                            tone={lib.isGraduated ? "success" : "brand"}
                            label={`${lib.journeyCompleted} de ${BEGIN_JOURNEY_SESSIONS} sessões da jornada`}
                            className="h-1.5"
                          />
                        </span>
                        <span className="tabular-nums">{lib.journeyCompleted}/{BEGIN_JOURNEY_SESSIONS}</span>
                        <span className="tabular-nums">{lib.scheduled} agendada{lib.scheduled !== 1 ? "s" : ""}</span>
                        <span className="tabular-nums hidden sm:inline">{taskPercent}% tarefas</span>
                      </span>
                    }
                    trailing={
                      lib.pendingConfirmation > 0 ? (
                        <StatusPill tone="pending">{lib.pendingConfirmation} a confirmar</StatusPill>
                      ) : undefined
                    }
                    onPress={() => setDetailId(lib.libertyId)}
                  />
                );
              })}
            </SectionCard>
          )}
        </div>
      </div>
      </PageContainer>

      {/* Detalhe rápido do membro */}
      <BottomSheet
        open={!!detail}
        onOpenChange={(open) => { if (!open) setDetailId(null); }}
        title={detail ? shortName(detail.name) : "Membro"}
        description={detail ? [detail.company, `${formatShortDate(detail.programStartDate)} → ${formatShortDate(detail.programEndDate)}`].filter(Boolean).join(" · ") : undefined}
        footer={
          detail ? (
            <Button onClick={() => navigate(`/mentor/alunos/${detail.libertyId}`)}>
              <ExternalLink /> Abrir ficha completa
            </Button>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusPill tone={detail.tier === "liberty" ? "brand" : "neutral"} withDot={false}>{detail.tier === "liberty" ? "Liberty" : "Begin"}</StatusPill>
              {detail.isGraduated && <StatusPill tone="success">Jornada concluída</StatusPill>}
              {detail.pendingConfirmation > 0 && <StatusPill tone="pending">{detail.pendingConfirmation} a confirmar</StatusPill>}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Jornada</span>
                <span className="tabular-nums">{detail.journeyCompleted} de {BEGIN_JOURNEY_SESSIONS} sessões</span>
              </div>
              <ProgressBar value={detail.journeyCompleted} max={BEGIN_JOURNEY_SESSIONS} tone={detail.isGraduated ? "success" : "brand"} label="Progresso da jornada" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Stat size="sm" icon={CheckCircle2} label="Realizadas" value={detail.completed} />
              <Stat size="sm" icon={Calendar} label="Agendadas" value={detail.scheduled} />
              <Stat size="sm" icon={Target} label="Tarefas" value={`${detail.totalTasks > 0 ? Math.round((detail.completedTasks / detail.totalTasks) * 100) : 0}%`} hint={`${detail.completedTasks}/${detail.totalTasks}`} />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Sessões recentes</p>
              {detail.bookings.length === 0 ? (
                <EmptyState compact icon={HelpCircle} title="Nenhuma sessão registrada" />
              ) : (
                <SectionCard padding="none">
                  {detail.bookings.slice(0, 6).map((b, idx, arr) => (
                    <ListRow
                      key={b.id}
                      last={idx === arr.length - 1}
                      leading={<DateBlock date={b.scheduled_date} />}
                      title={sessionNameMap[b.session_id] || "Sessão"}
                      subtitle={`${b.start_time?.slice(0, 5) ?? "--:--"} – ${b.end_time?.slice(0, 5) ?? "--:--"}`}
                      trailing={<StatusPill status={getEffectiveBookingStatus(b)} />}
                    />
                  ))}
                </SectionCard>
              )}
            </div>
          </div>
        )}
      </BottomSheet>
    </AppLayout>
  );
};

export default MentorAlunosPage;
