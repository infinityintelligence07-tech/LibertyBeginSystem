import { useMemo } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDemoData } from "@/contexts/DemoDataContext";
import { demoBookingsForMember, mergeDemoSessions } from "@/lib/demoForUser";
import { isVisibleSessionBooking } from "@/lib/bookingStatus";
import { buildSessionProgress, canScheduleKickoff } from "@/lib/sessionProgress";
import type { Database } from "@/integrations/supabase/types";

export type JourneySession = Database["public"]["Tables"]["sessions"]["Row"];

/**
 * Colunas mínimas de um agendamento para que `getEffectiveBookingStatus`
 * e `buildSessionProgress` funcionem (inclui `is_retroactive`/`report_required`).
 * Compatível com o Row do banco e com os registros fictícios do modo demo.
 */
export type JourneyBooking = {
  id: string;
  session_id: string;
  mentor_id: string;
  liberty_id?: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: string;
  is_retroactive?: boolean | null;
  report_required?: boolean | null;
  zoom_join_url?: string | null;
  observations?: string | null;
  approval_required?: boolean | null;
  availability_id?: string | null;
};

const BOOKING_COLUMNS =
  "id, liberty_id, mentor_id, session_id, scheduled_date, start_time, end_time, status, is_retroactive, report_required, zoom_join_url, observations, approval_required, availability_id";

export const MEMBER_SESSIONS_QUERY_KEY = ["member-journey-sessions"] as const;
export const memberBookingsQueryKey = (profileId?: string | null) =>
  ["member-journey-bookings", profileId ?? null] as const;

/**
 * Prefixos de queries do membro que dependem dos agendamentos. Devem ser
 * invalidados após qualquer insert/update em `bookings` feito pelo membro.
 */
export const MEMBER_BOOKING_QUERY_PREFIXES = [
  "member-journey-bookings",
  "journey-bookings",
  "liberty-bookings",
  "agendar-bookings",
  "member-agenda",
  "overview-bookings",
  "overview-availability-all",
  "mentor-availability-all",
  "liberty-availability-count",
  "pending-nps",
] as const;

export const invalidateMemberBookingQueries = (queryClient: QueryClient) =>
  Promise.all(
    MEMBER_BOOKING_QUERY_PREFIXES.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
  );

/** Ids fictícios do modo demo nunca devem ir para o Supabase (`.in(...)`). */
export const isDemoId = (id: string) => id.startsWith("demo-");

const EMPTY_SESSIONS: JourneySession[] = [];
const EMPTY_BOOKINGS: JourneyBooking[] = [];

/**
 * Fonte única de sessões + agendamentos do membro logado, já com o progresso
 * da jornada calculado (`buildSessionProgress`) e a regra do Mapeamento
 * (`canScheduleKickoff`). Usado em Dashboard, Jornada e Agendar Sessão.
 */
export const useJourneyProgress = () => {
  const { profile } = useAuth();
  const { demoEnabled } = useDemoData();
  const profileId = profile?.id ?? null;

  const sessionsQuery = useQuery({
    queryKey: MEMBER_SESSIONS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions").select("*").order("order");
      if (error) throw error;
      return (data ?? []) as JourneySession[];
    },
  });

  const bookingsQuery = useQuery({
    queryKey: memberBookingsQueryKey(profileId),
    queryFn: async () => {
      if (!profileId) return [] as JourneyBooking[];
      const { data, error } = await supabase
        .from("bookings")
        .select(BOOKING_COLUMNS)
        .eq("liberty_id", profileId)
        .order("scheduled_date")
        .order("start_time");
      if (error) throw error;
      return (data ?? []) as JourneyBooking[];
    },
    enabled: !!profileId,
  });

  const realSessions = sessionsQuery.data ?? EMPTY_SESSIONS;
  const realBookings = bookingsQuery.data ?? EMPTY_BOOKINGS;

  const demoBookings = useMemo<JourneyBooking[]>(
    () => (demoEnabled && profileId ? demoBookingsForMember(profileId) : []),
    [demoEnabled, profileId],
  );

  /** Catálogo completo (inclui inativas e Onboarding). */
  const sessions = useMemo(
    () => (demoEnabled ? mergeDemoSessions(realSessions) : realSessions),
    [demoEnabled, realSessions],
  );
  /** Sessões ativas: base da jornada e do agendamento. */
  const activeSessions = useMemo(
    () => sessions.filter((session) => session.is_active !== false),
    [sessions],
  );

  /** Todos os agendamentos (inclui cancelados e não realizados). */
  const allBookings = useMemo(
    () => (demoEnabled ? [...realBookings, ...demoBookings] : realBookings),
    [demoEnabled, realBookings, demoBookings],
  );
  /** Agendamentos visíveis para o membro (sem cancelados / não realizados). */
  const bookings = useMemo(() => allBookings.filter(isVisibleSessionBooking), [allBookings]);

  const progress = useMemo(() => buildSessionProgress(activeSessions, bookings), [activeSessions, bookings]);

  const kickoffSession = useMemo(
    () => progress.journeySessions.find((session) => session.is_kickoff) ?? null,
    [progress.journeySessions],
  );

  /** Regra D2: Mapeamento só até a 3ª sessão realizada (mesmo critério do banco). */
  const kickoffAllowed = useMemo(() => canScheduleKickoff(sessions, allBookings), [sessions, allBookings]);

  const realBookingIds = useMemo(
    () => bookings.map((booking) => booking.id).filter((id) => !isDemoId(id)),
    [bookings],
  );

  const isLoading = sessionsQuery.isLoading || (!!profileId && bookingsQuery.isLoading);
  const isError = sessionsQuery.isError || bookingsQuery.isError;
  const error = sessionsQuery.error ?? bookingsQuery.error ?? null;

  const refetch = () => Promise.all([sessionsQuery.refetch(), bookingsQuery.refetch()]);

  return {
    profileId,
    demoEnabled,
    sessions,
    activeSessions,
    allBookings,
    bookings,
    realBookingIds,
    progress,
    kickoffSession,
    kickoffAllowed,
    isLoading,
    isError,
    error,
    refetch,
  };
};
