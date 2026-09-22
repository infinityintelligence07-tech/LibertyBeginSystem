import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MemberSessionEditor } from "@/components/MemberSessionEditor";
import { MemberWithProgress, BookingDetail } from "@/hooks/useAdminData";
import { getEffectiveBookingStatus, isVisibleSessionBooking } from "@/lib/bookingStatus";
import { CalendarDays } from "lucide-react";

interface Props {
  libertyId: string;
  libertyName: string;
  onReportClick: (booking_id: string, session_name: string) => void;
  /** Called after add / edit / delete so the parent screen can refresh. */
  onChanged?: () => void;
}

/**
 * Compact wrapper that fetches everything MemberSessionEditor needs and
 * renders it for a single student. Works for any role with proper RLS
 * (admin always; mentor via the policies created for them).
 */
export const MemberBookingsManager = ({ libertyId, libertyName, onReportClick, onChanged }: Props) => {
  const { data: bookings = [] } = useQuery({
    queryKey: ["member-bookings-manager", libertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, session_id, mentor_id, scheduled_date, start_time, end_time, status, is_retroactive, sessions(name), mentor:profiles!bookings_mentor_id_fkey(full_name)")
        .eq("liberty_id", libertyId)
        .order("scheduled_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["member-bookings-manager-sessions"],
    queryFn: async () => {
      const { data } = await supabase.from("sessions").select("id, name, order, is_active").order("order");
      return (data || []) as { id: string; name: string; order: number; is_active: boolean }[];
    },
  });

  const { data: memberTier } = useQuery({
    queryKey: ["member-bookings-manager-tier", libertyId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("member_tier").eq("id", libertyId).maybeSingle();
      return (data?.member_tier as "begin" | "liberty" | null) || "begin";
    },
  });

  const { data: mentors = [] } = useQuery({
    queryKey: ["member-bookings-manager-mentors"],
    queryFn: async () => {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "mentor");
      const ids = (roleRows || []).map((r: any) => r.user_id);
      if (!ids.length) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("user_id", ids)
        .eq("is_active", true)
        .order("full_name");
      return (data || []) as { id: string; full_name: string }[];
    },
  });

  const toDetail = (b: any): BookingDetail => ({
    booking_id: b.id,
    session_id: b.session_id,
    session_name: b.sessions?.name || "Sessão",
    date: b.scheduled_date,
    mentor_id: b.mentor_id || null,
    mentor_name: b.mentor?.full_name || "Mentor",
    status: b.status,
  });

  const completed = bookings
    .filter((b: any) => getEffectiveBookingStatus(b) === "completed")
    .map(toDetail);
  const scheduled = bookings
    .filter((b: any) => isVisibleSessionBooking(b) && getEffectiveBookingStatus(b) === "scheduled")
    .map(toDetail);

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
    total_completed: completed.length,
    total_scheduled: scheduled.length,
    total_future_confirmed: scheduled.length,
    total_pending_approval: bookings.filter((b: any) => getEffectiveBookingStatus(b) === "pending_approval").length,
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

  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Sessões do aluno
        </h2>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Adicionar · Editar · Cancelar
        </span>
      </div>
      <MemberSessionEditor
        member={member}
        sessions={sessions}
        mentors={mentors}
        filterKey={null}
        onReportClick={onReportClick}
        onChanged={onChanged}
      />
    </div>
  );
};
