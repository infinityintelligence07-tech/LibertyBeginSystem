import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MemberSessionEditor, type EditorBookingDetail } from "@/components/MemberSessionEditor";
import { MemberWithProgress } from "@/hooks/useAdminData";
import {
  getEffectiveBookingStatus,
  isFutureScheduledBooking,
  isPendingConfirmationBooking,
  isRealizedSessionBooking,
} from "@/lib/bookingStatus";
import { buildSessionProgress } from "@/lib/sessionProgress";
import { CalendarDays } from "lucide-react";
import { ErrorState, LoadingState, SectionCard, SectionHeader } from "@/components/ds";

interface Props {
  libertyId: string;
  libertyName: string;
  onReportClick: (booking_id: string, session_name: string) => void;
  /** Called after add / edit / delete so the parent screen can refresh. */
  onChanged?: () => void;
}

type ManagerBooking = {
  id: string;
  session_id: string;
  mentor_id: string | null;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  is_retroactive: boolean | null;
  report_required: boolean | null;
  sessions: { name: string; order: number | null; is_kickoff: boolean | null; duration_minutes: number | null } | null;
  mentor: { full_name: string | null } | null;
};

type ManagerSession = {
  id: string;
  name: string;
  order: number;
  is_active: boolean;
  is_kickoff: boolean | null;
  duration_minutes: number | null;
};

/**
 * Compact wrapper that fetches everything MemberSessionEditor needs and
 * renders it for a single student. Works for any role with proper RLS
 * (admin always; mentor via the policies created for them).
 */
export const MemberBookingsManager = ({ libertyId, libertyName, onReportClick, onChanged }: Props) => {
  const queryClient = useQueryClient();

  const { data: bookings = [], error: bookingsError, isLoading: isLoadingBookings, refetch: refetchBookings } = useQuery({
    queryKey: ["member-bookings-manager", libertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, session_id, mentor_id, scheduled_date, start_time, end_time, status, is_retroactive, report_required, " +
          "sessions(name, \"order\", is_kickoff, duration_minutes), mentor:profiles!bookings_mentor_id_fkey(full_name)",
        )
        .eq("liberty_id", libertyId)
        .order("scheduled_date", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ManagerBooking[];
    },
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["member-bookings-manager-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("id, name, order, is_active, is_kickoff, duration_minutes")
        .order("order");
      if (error) throw error;
      return (data || []) as ManagerSession[];
    },
  });

  const { data: memberTier } = useQuery({
    queryKey: ["member-bookings-manager-tier", libertyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("member_tier").eq("id", libertyId).maybeSingle();
      if (error) throw error;
      return (data?.member_tier as "begin" | "liberty" | null) || "begin";
    },
  });

  const { data: mentors = [] } = useQuery({
    queryKey: ["member-bookings-manager-mentors"],
    queryFn: async () => {
      const { data: roleRows, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "mentor");
      if (rErr) throw rErr;
      const ids = (roleRows || []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("user_id", ids)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return (data || []) as { id: string; full_name: string }[];
    },
  });

  // Mesma semântica de `useAdminData.mapBooking`: `status` é o status EFETIVO.
  const toDetail = (b: ManagerBooking): EditorBookingDetail => ({
    booking_id: b.id,
    session_id: b.session_id,
    session_name: b.sessions?.name || "Sessão",
    date: b.scheduled_date,
    mentor_id: b.mentor_id || null,
    mentor_name: b.mentor?.full_name || "Mentor",
    status: getEffectiveBookingStatus(b),
    start_time: b.start_time,
    end_time: b.end_time,
    is_retroactive: b.is_retroactive,
    report_required: b.report_required,
  });

  const completed = bookings.filter(isRealizedSessionBooking).map(toDetail);
  const scheduled = bookings.filter(isFutureScheduledBooking).map(toDetail);
  const pendingConfirmation = bookings.filter((b) => isPendingConfirmationBooking(b)).map(toDetail);

  // Contadores da jornada (exclui Onboarding / order 0) com a regra única da plataforma.
  const progress = buildSessionProgress(sessions, bookings);

  const member: MemberWithProgress = {
    id: libertyId,
    full_name: libertyName,
    email: null,
    phone: null,
    avatar_url: null,
    company_name: null,
    member_tier: memberTier || "begin",
    program_start_date: null,
    program_end_date: null,
    total_completed: progress.completedCount,
    total_scheduled: progress.scheduledCount,
    total_future_confirmed: scheduled.length,
    total_pending_approval: bookings.filter((b) => getEffectiveBookingStatus(b) === "pending_approval").length,
    has_next_session: scheduled.length > 0,
    completed_sessions: completed,
    scheduled_sessions: scheduled,
    monthly_counts: {},
    monthly_scheduled_counts: {},
    admin_note: null,
    is_active: true,
    pending_tasks_count: 0,
    last_session_date: null,
  };

  const handleChanged = () => {
    queryClient.invalidateQueries({ queryKey: ["member-bookings-manager", libertyId] });
    onChanged?.();
  };

  return (
    <SectionCard className="space-y-4">
      <SectionHeader
        as="h3"
        title={
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden /> Sessões do aluno
          </span>
        }
        description="Adicionar, editar ou excluir sessões deste aluno."
      />
      {bookingsError && (
        <ErrorState
          compact
          title="Não foi possível carregar as sessões deste aluno"
          description={(bookingsError as Error).message}
          onRetry={() => refetchBookings()}
        />
      )}
      {isLoadingBookings && !bookingsError && <LoadingState variant="list" rows={3} />}
      {!isLoadingBookings && !bookingsError && (
      <MemberSessionEditor
        member={member}
        sessions={sessions}
        mentors={mentors}
        filterKey={null}
        onReportClick={onReportClick}
        pendingConfirmationSessions={pendingConfirmation}
        onChanged={handleChanged}
      />
      )}
    </SectionCard>
  );
};
