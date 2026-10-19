import { supabase } from "@/integrations/supabase/client";

export const RESCHEDULE_COURTESY_LIMIT = 3;
export const RESCHEDULE_CHARGE_CENTS = 100_000;

export type RescheduleEvent = {
  id: string;
  profile_id: string;
  booking_id: string | null;
  session_name: string | null;
  previous_date: string | null;
  new_date: string | null;
  kind: "courtesy" | "charge";
  charge_cents: number | null;
  charge_settled_at: string | null;
  created_by_name: string | null;
  created_at: string;
};

export type RegisterRescheduleResult = {
  kind: "courtesy" | "charge";
  courtesy_used: number;
  locked: boolean;
};

export async function fetchRescheduleState(profileId: string) {
  const [{ data: events, error: eventsError }, { data: profile, error: profileError }] = await Promise.all([
    supabase
      .from("member_reschedule_events")
      .select("id, profile_id, booking_id, session_name, previous_date, new_date, kind, charge_cents, charge_settled_at, created_by_name, created_at")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("reschedule_scheduling_locked")
      .eq("id", profileId)
      .maybeSingle(),
  ]);
  if (eventsError) throw eventsError;
  if (profileError) throw profileError;
  return {
    events: (events || []) as RescheduleEvent[],
    locked: profile?.reschedule_scheduling_locked === true,
  };
}

export async function registerStudentUnavailability(input: {
  profileId: string;
  bookingId?: string | null;
  sessionName?: string | null;
  previousDate?: string | null;
  newDate?: string | null;
}) {
  const { data, error } = await supabase.rpc("register_student_unavailability", {
    _profile_id: input.profileId,
    _booking_id: input.bookingId ?? null,
    _session_name: input.sessionName ?? null,
    _previous_date: input.previousDate ?? null,
    _new_date: input.newDate ?? null,
  });
  if (error) throw error;
  return data as RegisterRescheduleResult;
}

export async function settleRescheduleCharge(profileId: string) {
  const { error } = await supabase.rpc("settle_reschedule_charge", { _profile_id: profileId });
  if (error) throw error;
}

export function rescheduleResultMessage(result: RegisterRescheduleResult) {
  if (result.kind === "charge") {
    return "Reagendamento além dos 3 créditos. Cobrar R$ 1.000 e liberar o agendamento do aluno.";
  }
  if (result.locked) {
    return "Terceiro crédito usado. Os agendamentos do aluno estão travados. O próximo custa R$ 1.000.";
  }
  return `Crédito usado. Restam ${RESCHEDULE_COURTESY_LIMIT - result.courtesy_used} de ${RESCHEDULE_COURTESY_LIMIT}.`;
}
