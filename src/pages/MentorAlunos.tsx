import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { Users, ChevronRight, Calendar, CheckCircle2, Target, Search } from "lucide-react";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { shortName, initials } from "@/lib/formatName";
import { useNavigate } from "react-router-dom";
import { getEffectiveBookingStatus, isVisibleSessionBooking, isScheduledSessionBooking, sortByScheduledDateDesc } from "@/lib/bookingStatus";
import { EmptyState } from "@/components/EmptyState";

const MentorAlunosPage = () => {
  useAuth();
  const navigate = useNavigate();
  const [showCompleted, setShowCompleted] = useState(false);
  const [search, setSearch] = useState("");
  const [tierTab, setTierTab] = useState<"begin" | "liberty">("begin");

  // 1. ALL member profiles (Begin + Liberty) so mentor can see the full base
  const { data: allLiberties = [] } = useQuery({
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

  // 2. ALL bookings (so the mentor sees the full history of every member, including with other mentors)
  const { data: allBookings = [] } = useQuery({
    queryKey: ["mentor-alunos-all-bookings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("*")
        .order("scheduled_date", { ascending: false });
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
      return Array.from(new Set([
        ...((sessionsRes.data || []).map((r: any) => r.mentor_id)),
        ...((availabilityRes.data || []).map((r: any) => r.mentor_id)),
      ].filter(Boolean)));
    },
  });

  const excludedMentorProfileIds = useMemo(() => new Set([
    ...mentorMarkerIds,
    ...allBookings.map((b: any) => b.mentor_id).filter(Boolean),
  ]), [mentorMarkerIds, allBookings]);

  const memberProfiles = useMemo(
    () => allLiberties.filter((p: any) => !excludedMentorProfileIds.has(p.id)),
    [allLiberties, excludedMentorProfileIds],
  );

  const allLibertyIds = useMemo(() => memberProfiles.map((p: any) => p.id), [memberProfiles]);

  // 3. Mentor profiles (liberty profiles already fetched above)
  const allMentorIds = useMemo(() => [...new Set(allBookings.map((b) => b.mentor_id))], [allBookings]);

  const { data: mentorProfiles = [] } = useQuery({
    queryKey: ["mentor-alunos-mentor-profiles", allMentorIds],
    queryFn: async () => {
      if (!allMentorIds.length) return [];
      const { data } = await supabase.from("profiles").select("id, full_name, company_name").in("id", allMentorIds);
      return data || [];
    },
    enabled: allMentorIds.length > 0,
  });

  const profiles = useMemo(() => [...memberProfiles, ...mentorProfiles], [memberProfiles, mentorProfiles]);

  // 4. Sessions lookup
  const { data: sessions = [] } = useQuery({
    queryKey: ["mentor-alunos-sessions"],
    queryFn: async () => {
      const { data } = await supabase.from("sessions").select("id, name, order, cover_image_url").order("order");
      return data || [];
    },
  });

  // 5. Reports for all bookings
  const allBookingIds = useMemo(() => allBookings.map((b) => b.id), [allBookings]);
  const { data: reports = [] } = useQuery({
    queryKey: ["mentor-alunos-reports", allBookingIds],
    queryFn: async () => {
      if (!allBookingIds.length) return [];
      const { data } = await supabase.from("booking_reports").select("booking_id, summary").in("booking_id", allBookingIds);
      return data || [];
    },
    enabled: allBookingIds.length > 0,
  });

  // 6. Tasks for all bookings
  const { data: allTasks = [] } = useQuery({
    queryKey: ["mentor-alunos-tasks", allBookingIds],
    queryFn: async () => {
      if (!allBookingIds.length) return [];
      const { data } = await supabase
        .from("session_tasks")
        .select("*")
        .in("booking_id", allBookingIds)
        .order("created_at");
      return data || [];
    },
    enabled: allBookingIds.length > 0,
  });

  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const sessionMap = Object.fromEntries(sessions.map((s) => [s.id, s.name]));
  const sessionCoverMap = Object.fromEntries(sessions.map((s) => [s.id, s.cover_image_url]));
  const reportMap = Object.fromEntries(reports.map((r) => [r.booking_id, r]));

  // Group bookings by liberty
  const libertySummaries = useMemo(() => {
    return allLibertyIds.map((libertyId) => {
      const libertyBookings = sortByScheduledDateDesc(allBookings.filter((b) => b.liberty_id === libertyId && isVisibleSessionBooking(b)));
      const completed = libertyBookings.filter((b) => getEffectiveBookingStatus(b) === "completed").length;
      const scheduled = libertyBookings.filter((b) => isScheduledSessionBooking(b)).length;
      const libertyTasks = allTasks.filter((t) => libertyBookings.some((b) => b.id === t.booking_id));
      const completedTasks = libertyTasks.filter((t) => t.is_completed).length;
      const withResults = libertyTasks.filter((t) => t.result_value).length;
      const p = profileMap[libertyId];

      return {
        libertyId,
        name: p?.full_name || "Membro",
        company: p?.company_name,
        tier: ((p as any)?.member_tier as "begin" | "liberty") || "begin",
        programStartDate: (p as any)?.program_start_date || null,
        programEndDate: (p as any)?.program_end_date || null,
        avatarUrl: (p as any)?.avatar_url,
        bookings: libertyBookings,
        totalSessions: libertyBookings.length,
        completed,
        scheduled,
        totalTasks: libertyTasks.length,
        completedTasks,
        withResults,
        isGraduated: completed >= 12,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [allLibertyIds, allBookings, allTasks, profileMap]);

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
  const formatShortDate = (date?: string | null) =>
    date ? new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "Sem data";

  return (
    <AppLayout role="mentor">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
        <motion.div variants={fadeUpItem} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Membros</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Visão completa de todos os membros do programa
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar membro"
                className="input-begin text-xs h-9 w-full pl-9"
              />
            </div>
            <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
              <button
                onClick={() => setShowCompleted(false)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${!showCompleted ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Ativos ({activeCount})
              </button>
              <button
                onClick={() => setShowCompleted(true)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${showCompleted ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Concluídos ({graduatedCount})
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div variants={fadeUpItem} className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
          <button
            onClick={() => setTierTab("begin")}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${tierTab === "begin" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Begin ({beginTotal})
          </button>
          <button
            onClick={() => setTierTab("liberty")}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${tierTab === "liberty" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Liberty ({libertyTotal})
          </button>
        </motion.div>

        {activeSummaries.length === 0 ? (
          <motion.div variants={fadeUpItem}>
            <EmptyState
              icon={Users}
              title={normalizedSearch ? "Nenhum membro encontrado" : showCompleted ? "Nenhum membro concluiu a jornada ainda" : "Nenhum membro ativo no momento"}
              description={normalizedSearch ? "Tente outra busca ou limpe o filtro." : undefined}
            />
          </motion.div>
        ) : (
          <motion.div variants={fadeUpItem} className="space-y-3">
            {activeSummaries.map((lib) => {
              const taskPercent = lib.totalTasks > 0 ? Math.round((lib.completedTasks / lib.totalTasks) * 100) : 0;

              return (
                <button
                  key={lib.libertyId}
                  onClick={() => navigate(`/mentor/alunos/${lib.libertyId}`)}
                  className="glass-card w-full p-4 flex items-center justify-between gap-3 hover:bg-muted/10 transition-colors text-left group"
                  title="Abrir detalhes do aluno"
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary overflow-hidden shrink-0">
                      {lib.avatarUrl ? (
                        <img src={lib.avatarUrl} alt={lib.name} className="w-full h-full object-cover" />
                      ) : initials(lib.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors min-w-0">{shortName(lib.name)}</p>
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/90 tabular-nums shrink-0 leading-tight">
                          <span>{formatShortDate(lib.programStartDate)}</span>
                          <span className="text-muted-foreground/50">→</span>
                          <span>{formatShortDate(lib.programEndDate)}</span>
                        </span>
                      </div>
                      {lib.company && (
                        <p className="text-xs text-muted-foreground truncate">{lib.company}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="hidden sm:flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-status-green" />
                        {lib.completed} realizadas
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-status-blue" />
                        {lib.scheduled} agendadas
                      </span>
                      <span className="flex items-center gap-1" title={`${lib.completedTasks}/${lib.totalTasks} tarefas`}>
                        <Target className="h-3 w-3 text-primary" />
                        {taskPercent}% tarefas
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </button>
              );
            })}
          </motion.div>
        )}
      </motion.div>
    </AppLayout>
  );
};

export default MentorAlunosPage;
