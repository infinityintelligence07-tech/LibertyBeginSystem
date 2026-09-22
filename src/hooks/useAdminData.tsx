import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { demoMembers, demoMentors, demoBookings } from "@/lib/demoData";
import { sessionFeeMultiplier } from "@/lib/mentorFees";
import { getEffectiveBookingStatus, isVisibleSessionBooking, isScheduledSessionBooking, isFutureScheduledBooking, isAwaitingReportSessionBooking, isRealizedSessionBooking } from "@/lib/bookingStatus";

const isDemoOn = () => typeof window !== "undefined" && localStorage.getItem("lb_demo_data") === "1";

const chunkArray = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export interface BookingDetail {
  session_name: string;
  session_id: string;
  booking_id: string;
  date: string;
  mentor_id: string | null;
  mentor_name: string;
  status: string;
}

export interface MemberWithProgress {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  company_name: string | null;
  member_tier: "begin" | "liberty";
  program_start_date: string | null;
  program_end_date: string | null;
  total_completed: number;
  total_scheduled: number;
  /** Sessões futuras já confirmadas pelo mentor. */
  total_future_confirmed: number;
  /** Sessões futuras aguardando confirmação do mentor. */
  total_pending_approval: number;
  /** Tem próxima sessão (confirmada OU aguardando aprovação). */
  has_next_session: boolean;
  completed_sessions: BookingDetail[];
  scheduled_sessions: BookingDetail[];
  monthly_counts: Record<string, number>; // "2026-01" -> 2
  monthly_scheduled_counts: Record<string, number>;
  admin_note: string | null;
  is_active: boolean;
  pending_tasks_count: number;
  last_session_date: string | null;
}

export interface MentorWithStats {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  total_completed: number;
  total_scheduled: number;
  total_awaiting_report: number;
  assigned_sessions: string[];
  members_served: number;
  monthly_completed: Record<string, number>;
  monthly_scheduled: Record<string, number>;
  monthly_awaiting_report: Record<string, number>;
  /** Sessões de Mapeamento do Negócio (3h) — valor dobrado. */
  total_kickoff_completed: number;
  total_kickoff_scheduled: number;
  total_kickoff_awaiting_report: number;
  monthly_kickoff_completed: Record<string, number>;
  monthly_kickoff_scheduled: Record<string, number>;
  monthly_kickoff_awaiting_report: Record<string, number>;
  session_rate: number | null;
  is_active: boolean;
}

export const useMembers = () => {
  const demo = isDemoOn();
  return useQuery({
    queryKey: ["admin-members", demo],
    queryFn: async () => {
      // Members = all profiles tagged as Begin or Liberty (mentors/admins excluded).
      const { data: profilesRaw, error: pErr } = await supabase
        .from("profiles")
        .select("*")
        .in("member_tier", ["begin", "liberty"])
        .order("full_name");

      if (pErr) throw pErr;

      // Exclude anyone who is a mentor / admin / super_admin — they are NOT members.
      // Some privileged-role rows may be hidden by policies depending on who is viewing,
      // so also exclude profiles that have mentor assignments, availability, or mentor bookings.
      const candidateUserIds = (profilesRaw || [])
        .map((p: any) => p.user_id)
        .filter(Boolean);
      const candidateProfileIds = (profilesRaw || []).map((p: any) => p.id).filter(Boolean);
      let excludeUserIds = new Set<string>();
      let excludeProfileIds = new Set<string>();
      if (candidateUserIds.length > 0) {
        const { data: staffRoles } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", candidateUserIds)
          .in("role", ["mentor", "admin", "super_admin"]);
        excludeUserIds = new Set((staffRoles || []).map((r: any) => r.user_id));
      }
      if (candidateProfileIds.length > 0) {
        const [mentorSessionsRes, availabilityRes, mentorBookingsRes] = await Promise.all([
          supabase.from("mentor_sessions").select("mentor_id").in("mentor_id", candidateProfileIds),
          supabase.from("mentor_availability").select("mentor_id").in("mentor_id", candidateProfileIds),
          supabase.from("bookings").select("mentor_id").in("mentor_id", candidateProfileIds),
        ]);
        excludeProfileIds = new Set([
          ...((mentorSessionsRes.data || []).map((r: any) => r.mentor_id)),
          ...((availabilityRes.data || []).map((r: any) => r.mentor_id)),
          ...((mentorBookingsRes.data || []).map((r: any) => r.mentor_id)),
        ].filter(Boolean));
      }
      const profiles = (profilesRaw || []).filter(
        (p: any) => (!p.user_id || !excludeUserIds.has(p.user_id)) && !excludeProfileIds.has(p.id),
      );

      // Get all bookings with session and mentor info
      const { data: bookings, error: bErr } = await supabase
        .from("bookings")
        .select("*, sessions(name, \"order\"), mentor:profiles!bookings_mentor_id_fkey(full_name)");

      if (bErr) throw bErr;

      // Pending tasks per member (status not 'completed')
      const memberProfileIds = (profiles || []).map((p: any) => p.id);
      const pendingTasksByMember: Record<string, number> = {};
      if (memberProfileIds.length > 0) {
        const bookingToMember = new Map(
          (bookings || [])
            .filter((b: any) => b.liberty_id && memberProfileIds.includes(b.liberty_id))
            .map((b: any) => [b.id, b.liberty_id])
        );
        const bookingIds = Array.from(bookingToMember.keys());
        const taskRows: any[] = [];
        for (const ids of chunkArray(bookingIds, 40)) {
          const { data, error } = await (supabase as any)
            .from("session_tasks")
            .select("booking_id, is_completed")
            .in("booking_id", ids);
          if (error) throw error;
          taskRows.push(...(data || []));
        }
        (taskRows || []).forEach((t: any) => {
          const libertyId = bookingToMember.get(t.booking_id);
          if (libertyId && !t.is_completed) {
            pendingTasksByMember[libertyId] = (pendingTasksByMember[libertyId] || 0) + 1;
          }
        });
      }

      // Onboarding sessions (order=0) are tracked separately and don't count toward the 12.
      const isJourneyBooking = (b: any) => ((b.sessions?.order ?? 1) > 0);

      const members: MemberWithProgress[] = (profiles || []).map((p) => {
        const memberBookings = (bookings || []).filter((b) => b.liberty_id === p.id && isVisibleSessionBooking(b));
        // Regra única: "realizada" = concluída ou já ocorrida aguardando relatório.
        const completed = memberBookings.filter((b) => isRealizedSessionBooking(b) && isJourneyBooking(b));
        // "Agendada" = somente futuras, para não contar a mesma sessão duas vezes.
        const scheduled = memberBookings.filter((b) => isFutureScheduledBooking(b) && isJourneyBooking(b));
        // "Sem sessão" = sem nenhuma sessão futura confirmada nem aguardando confirmação do mentor.
        const futureConfirmed = memberBookings.filter((b) => isFutureScheduledBooking(b));
        const pendingApproval = memberBookings.filter(
          (b) => getEffectiveBookingStatus(b) === "pending_approval",
        );

        const monthly_counts: Record<string, number> = {};
        completed.forEach((b) => {
          const key = b.scheduled_date.substring(0, 7);
          monthly_counts[key] = (monthly_counts[key] || 0) + 1;
        });

        const monthly_scheduled_counts: Record<string, number> = {};
        scheduled.forEach((b) => {
          const key = b.scheduled_date.substring(0, 7);
          monthly_scheduled_counts[key] = (monthly_scheduled_counts[key] || 0) + 1;
        });

        const mapBooking = (b: any): BookingDetail => ({
          session_name: b.sessions?.name || "Sem dados",
          session_id: b.session_id,
          booking_id: b.id,
          date: b.scheduled_date,
          mentor_id: b.mentor_id || null,
          mentor_name: b.mentor?.full_name || "Sem dados",
          status: getEffectiveBookingStatus(b),
        });

        const lastSession = completed
          .map((b) => b.scheduled_date)
          .sort()
          .pop() || null;

        return {
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          phone: p.phone,
          avatar_url: (p as any).avatar_url ?? null,
          company_name: p.company_name,
          member_tier: ((p as any).member_tier === "liberty" ? "liberty" : "begin"),
          program_start_date: p.program_start_date,
          program_end_date: p.program_end_date,
          total_completed: completed.length,
          total_scheduled: scheduled.length,
          total_future_confirmed: futureConfirmed.length,
          total_pending_approval: pendingApproval.length,
          has_next_session: futureConfirmed.length + pendingApproval.length > 0,
          completed_sessions: completed.map(mapBooking),
          scheduled_sessions: scheduled.map(mapBooking),
          monthly_counts,
          monthly_scheduled_counts,
          admin_note: (p as any).admin_note ?? null,
          is_active: (p as any).is_active !== false,
          pending_tasks_count: pendingTasksByMember[p.id] || 0,
          last_session_date: lastSession,
        };
      });

      if (demo) {
        const fakeMembers: MemberWithProgress[] = demoMembers.map((dm) => {
          const myBookings = demoBookings.filter((b) => b.liberty_id === dm.id && isVisibleSessionBooking(b));
          const completed = myBookings.filter((b) => getEffectiveBookingStatus(b) === "completed");
          const scheduled = myBookings.filter((b) => isScheduledSessionBooking(b));
          const map = (b: any): BookingDetail => ({
            session_name: b.session?.name || "Sem dados",
            session_id: b.session_id,
            booking_id: b.id,
            date: b.scheduled_date,
            mentor_id: b.mentor_id || null,
            mentor_name: b.mentor?.full_name || "Sem dados",
            status: getEffectiveBookingStatus(b),
          });
          return {
            id: dm.id,
            full_name: `${dm.full_name} (demo)`,
            email: dm.email,
            phone: dm.phone,
            avatar_url: null,
            company_name: dm.company_name,
            member_tier: dm.member_tier,
            program_start_date: dm.program_start_date,
            program_end_date: null,
            total_completed: completed.length,
            total_scheduled: scheduled.length,
            total_future_confirmed: scheduled.filter((b: any) => isFutureScheduledBooking(b)).length,
            total_pending_approval: 0,
            has_next_session: scheduled.length > 0,
            completed_sessions: completed.map(map),
            scheduled_sessions: scheduled.map(map),
            monthly_counts: {},
            monthly_scheduled_counts: {},
            admin_note: null,
            is_active: true,
            pending_tasks_count: 0,
            last_session_date: null,
          };
        });
        return [...members, ...fakeMembers];
      }

      return members;
    },
  });
};

export const useMentors = () => {
  const demo = isDemoOn();
  return useQuery({
    queryKey: ["admin-mentors", demo],
    queryFn: async () => {
      // Get mentor profiles by role so mentor e-mails can be changed freely
      const { data: roleRows, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "mentor");
      if (rErr) throw rErr;
      const mentorUserIds = (roleRows || []).map((r: any) => r.user_id);

      const { data: mentorProfiles, error: mpErr } = await supabase
        .from("profiles")
        .select("*")
        .in("user_id", mentorUserIds.length > 0 ? mentorUserIds : ["00000000-0000-0000-0000-000000000000"])
        .order("full_name");

      if (mpErr) throw mpErr;

      // Get mentor_sessions assignments
      const { data: mentorSessions, error: msErr } = await supabase
        .from("mentor_sessions")
        .select("*, sessions(name)");

      if (msErr) throw msErr;

      // Sessões de 3h (Mapeamento do Negócio) — repasse dobrado ao mentor
      const { data: allSessions } = await supabase
        .from("sessions")
        .select("id, name, is_kickoff, duration_minutes");
      const kickoffSessionIds = new Set(
        (allSessions || [])
          .filter((s: any) => sessionFeeMultiplier({ session_name: s.name, is_kickoff: s.is_kickoff, duration_minutes: s.duration_minutes }) > 1)
          .map((s: any) => s.id),
      );
      // Sessões não remuneradas (Onboarding) — fora dos controles financeiros
      const unpaidSessionIds = new Set(
        (allSessions || [])
          .filter((s: any) => sessionFeeMultiplier({ session_name: s.name, is_kickoff: s.is_kickoff, duration_minutes: s.duration_minutes }) === 0)
          .map((s: any) => s.id),
      );

      // Get all bookings
      const { data: bookings, error: bErr } = await supabase
        .from("bookings")
        .select("*");

      if (bErr) throw bErr;

      const mentors: MentorWithStats[] = (mentorProfiles || []).map((m) => {
        const mBookings = (bookings || []).filter(
          (b) => b.mentor_id === m.id && isVisibleSessionBooking(b) && !unpaidSessionIds.has(b.session_id),
        );

        const completed = mBookings.filter((b) => getEffectiveBookingStatus(b) === "completed");
        const scheduled = mBookings.filter((b) => isFutureScheduledBooking(b));
        const awaiting = mBookings.filter((b) => isAwaitingReportSessionBooking(b));
        const assignedSessions = (mentorSessions || [])
          .filter((ms) => ms.mentor_id === m.id)
          .map((ms) => (ms as any).sessions?.name || "Sem dados");

        const uniqueMembers = new Set(mBookings.map((b) => b.liberty_id));

        const monthly_completed: Record<string, number> = {};
        completed.forEach((b) => {
          const key = b.scheduled_date.substring(0, 7);
          monthly_completed[key] = (monthly_completed[key] || 0) + 1;
        });
        const monthly_scheduled: Record<string, number> = {};
        scheduled.forEach((b) => {
          const key = b.scheduled_date.substring(0, 7);
          monthly_scheduled[key] = (monthly_scheduled[key] || 0) + 1;
        });
        const monthly_awaiting_report: Record<string, number> = {};
        awaiting.forEach((b) => {
          const key = b.scheduled_date.substring(0, 7);
          monthly_awaiting_report[key] = (monthly_awaiting_report[key] || 0) + 1;
        });

        // Sessões de Mapeamento do Negócio (3h) — repasse dobrado
        const isKick = (b: any) => kickoffSessionIds.has(b.session_id);
        const countByMonth = (list: any[]) => {
          const acc: Record<string, number> = {};
          list.filter(isKick).forEach((b) => {
            const key = b.scheduled_date.substring(0, 7);
            acc[key] = (acc[key] || 0) + 1;
          });
          return acc;
        };
        const monthly_kickoff_completed = countByMonth(completed);
        const monthly_kickoff_scheduled = countByMonth(scheduled);
        const monthly_kickoff_awaiting_report = countByMonth(awaiting);

        return {
          id: m.id,
          user_id: m.user_id,
          full_name: m.full_name,
          email: m.email,
          phone: m.phone,
          avatar_url: (m as any).avatar_url ?? null,
          total_completed: completed.length,
          total_scheduled: scheduled.length,
          total_awaiting_report: awaiting.length,
          assigned_sessions: assignedSessions,
          members_served: uniqueMembers.size,
          monthly_completed,
          monthly_scheduled,
          monthly_awaiting_report,
          total_kickoff_completed: completed.filter(isKick).length,
          total_kickoff_scheduled: scheduled.filter(isKick).length,
          total_kickoff_awaiting_report: awaiting.filter(isKick).length,
          monthly_kickoff_completed,
          monthly_kickoff_scheduled,
          monthly_kickoff_awaiting_report,
          session_rate: (m as any).session_rate ?? null,
          is_active: (m as any).is_active !== false,
        };
      });

      if (demo) {
        const fakeMentors: MentorWithStats[] = demoMentors.map((dm) => {
          const myBookings = demoBookings.filter((b) => b.mentor_id === dm.id && isVisibleSessionBooking(b));
          const completed = myBookings.filter((b) => getEffectiveBookingStatus(b) === "completed");
          const scheduled = myBookings.filter((b) => isScheduledSessionBooking(b));
          return {
            id: dm.id,
            user_id: dm.id,
            full_name: `${dm.full_name} (demo)`,
            email: dm.email,
            phone: null,
            avatar_url: null,
            total_completed: completed.length,
            total_scheduled: scheduled.length,
            total_awaiting_report: 0,
            assigned_sessions: ["Diagnóstico", "Posicionamento"],
            members_served: new Set(myBookings.map((b) => b.liberty_id)).size,
            monthly_completed: {},
            monthly_scheduled: {},
            monthly_awaiting_report: {},
            total_kickoff_completed: 0,
            total_kickoff_scheduled: 0,
            total_kickoff_awaiting_report: 0,
            monthly_kickoff_completed: {},
            monthly_kickoff_scheduled: {},
            monthly_kickoff_awaiting_report: {},
            session_rate: dm.session_rate,
            is_active: true,
          };
        });
        return [...mentors, ...fakeMentors];
      }
      return mentors;
    },
  });
};

export const useAdminStats = () => {
  const demo = isDemoOn();
  return useQuery({
    queryKey: ["admin-stats", demo],
    queryFn: async () => {
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const monthStart = `${monthKey}-01`;
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const monthEnd = nextMonth.toISOString().split("T")[0];

      // Members count — aligned with Members page (users with liberty role)
      const { data: libertyRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "liberty");
      const libertyUserIds = (libertyRoles || []).map((r: any) => r.user_id);
      let totalMembers = 0;
      if (libertyUserIds.length > 0) {
        const { count } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .in("user_id", libertyUserIds);
        totalMembers = count || 0;
      }

      // Active mentors — role-based, not tied to the email domain
      const { count: totalMentors } = await supabase
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "mentor");

      // This month's bookings
      const { data: monthBookings } = await supabase
        .from("bookings")
        .select("*")
        .gte("scheduled_date", monthStart)
        .lt("scheduled_date", monthEnd);

      const visibleMonthBookings = (monthBookings || []).filter(isVisibleSessionBooking);
      const completedThisMonth = visibleMonthBookings.filter((b) => getEffectiveBookingStatus(b) === "completed").length;
      const scheduledThisMonth = visibleMonthBookings.filter((b) => isScheduledSessionBooking(b)).length;

      // Total completed ever — past sessions (regardless of stored status, except cancelled/rescheduled)
      const { data: allBookings } = await supabase
        .from("bookings")
        .select("scheduled_date,end_time,status");
      const totalCompleted = (allBookings || []).filter((b) => isVisibleSessionBooking(b) && getEffectiveBookingStatus(b) === "completed").length;

      // Session value
      const { data: configData } = await supabase
        .from("system_config")
        .select("value")
        .eq("key", "session_value")
        .single();

      const sessionValue = parseFloat(configData?.value || "900");

      const demoCompleted = demo ? demoBookings.filter((b) => isVisibleSessionBooking(b) && getEffectiveBookingStatus(b) === "completed").length : 0;
      const demoScheduled = demo ? demoBookings.filter((b) => isVisibleSessionBooking(b) && isScheduledSessionBooking(b)).length : 0;
      const demoMembersN = demo ? demoMembers.length : 0;
      const demoMentorsN = demo ? demoMentors.length : 0;

      const _completedThisMonth = completedThisMonth + demoCompleted;
      const _scheduledThisMonth = scheduledThisMonth + demoScheduled;
      const _totalCompleted = totalCompleted + demoCompleted;

      return {
        totalMembers: totalMembers + demoMembersN,
        totalMentors: (totalMentors || 0) + demoMentorsN,
        completedThisMonth: _completedThisMonth,
        scheduledThisMonth: _scheduledThisMonth,
        totalCompleted: _totalCompleted,
        sessionValue,
        estimatedMonthRevenue: _completedThisMonth * sessionValue,
        totalEstimated: _totalCompleted * sessionValue,
      };
    },
  });
};

export const useSessionCatalog = () => {
  return useQuery({
    queryKey: ["session-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("*")
        .order("order");
      if (error) throw error;
      return data || [];
    },
  });
};
