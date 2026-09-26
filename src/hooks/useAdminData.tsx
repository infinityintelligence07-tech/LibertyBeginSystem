import { useQuery } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { sessionFeeMultiplier } from "@/lib/mentorFees";
import {
  getEffectiveBookingStatus,
  isVisibleSessionBooking,
  isFutureScheduledBooking,
  isRealizedSessionBooking,
  isPendingConfirmationBooking,
  isPendingConfirmationOverdue,
  isBookingPast,
} from "@/lib/bookingStatus";

/** Chaves react-query que precisam ser invalidadas após qualquer mutação em `bookings`. */
export const ADMIN_BOOKING_QUERY_KEYS = [
  "admin-members",
  "admin-mentors",
  "admin-bookings-all",
  "agenda-bookings",
  "agenda-today",
  "agenda-pending-confirmation",
  "agenda-pending-approvals",
  "agenda-not-realized",
] as const;

const PAGE_SIZE = 1000;

const chunkArray = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

type PageResult<T> = { data: T[] | null; error: PostgrestError | null };

/**
 * O PostgREST devolve no máximo 1000 linhas por requisição. Para tabelas que já passaram
 * desse volume (bookings), buscamos em páginas com `.range()` até esgotar.
 */
const fetchAllRows = async <T,>(
  buildPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> => {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
};

type BookingRow = Tables<"bookings">;
type SessionJoin = Pick<Tables<"sessions">, "name" | "order" | "is_kickoff" | "duration_minutes"> | null;
type NameJoin = Pick<Tables<"profiles">, "full_name"> | null;

/** Linha de booking com os joins necessários para a regra de status efetivo e para o financeiro. */
export type AdminBookingRow = BookingRow & {
  sessions: SessionJoin;
  mentor: NameJoin;
  liberty: NameJoin;
};

const ADMIN_BOOKING_SELECT =
  '*, sessions(name, "order", is_kickoff, duration_minutes), mentor:profiles!bookings_mentor_id_fkey(full_name), liberty:profiles!bookings_liberty_id_fkey(full_name)';

export const fetchAdminBookings = () =>
  fetchAllRows<AdminBookingRow>((from, to) =>
    supabase
      .from("bookings")
      .select(ADMIN_BOOKING_SELECT)
      .order("scheduled_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to) as unknown as PromiseLike<PageResult<AdminBookingRow>>,
  );

/** IDs de bookings que já têm relatório salvo (define `awaiting_report` vs `completed`). */
export const fetchReportedBookingIds = async () => {
  const rows = await fetchAllRows<{ booking_id: string }>((from, to) =>
    supabase.from("booking_reports").select("booking_id").order("booking_id").range(from, to),
  );
  return new Set(rows.map((r) => r.booking_id));
};

const monthKeyOf = (b: { scheduled_date?: string | null }) => (b.scheduled_date || "").substring(0, 7);

const countByMonth = <T extends { scheduled_date?: string | null }>(list: T[]) => {
  const acc: Record<string, number> = {};
  list.forEach((b) => {
    const key = monthKeyOf(b);
    if (!key) return;
    acc[key] = (acc[key] || 0) + 1;
  });
  return acc;
};

export interface BookingDetail {
  session_name: string;
  session_id: string;
  booking_id: string;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  mentor_id: string | null;
  mentor_name: string;
  /** Status EFETIVO (regra única): pode ser `awaiting_report` ou `pending_confirmation`, que não existem no banco. */
  status: string;
  /** Status BRUTO gravado no banco (enum `booking_status`). Use este ao editar/persistir. */
  raw_status?: string;
  is_retroactive?: boolean;
  report_required?: boolean;
  is_kickoff?: boolean;
  has_report?: boolean;
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
  /** Sessões de jornada realizadas (`completed` + `awaiting_report`). Não inclui "A confirmar". */
  total_completed: number;
  /** Sessões de jornada agendadas para o futuro. */
  total_scheduled: number;
  /** Sessões de jornada que já passaram e o mentor ainda não confirmou ("A confirmar"). Não contam como realizadas. */
  total_pending_confirmation?: number;
  /** Subconjunto de `total_pending_confirmation` há 7+ dias sem confirmação. */
  total_pending_confirmation_overdue?: number;
  /** Sessões futuras já confirmadas pelo mentor. */
  total_future_confirmed: number;
  /** Sessões futuras aguardando confirmação do mentor. */
  total_pending_approval: number;
  /** Tem próxima sessão (confirmada OU aguardando aprovação), sempre no futuro. */
  has_next_session: boolean;
  completed_sessions: BookingDetail[];
  scheduled_sessions: BookingDetail[];
  pending_confirmation_sessions?: BookingDetail[];
  monthly_counts: Record<string, number>; // "2026-01" -> 2
  monthly_scheduled_counts: Record<string, number>;
  monthly_pending_confirmation_counts?: Record<string, number>;
  admin_note: string | null;
  is_active: boolean;
  pending_tasks_count: number;
  last_session_date: string | null;
}

/** Sessão de um mentor já com status efetivo e valor calculado (fonte única para linha, detalhe e PDF do Financeiro). */
export interface MentorSessionDetail {
  booking_id: string;
  session_id: string;
  session_name: string;
  member_name: string;
  liberty_id: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  /** Status efetivo: scheduled | pending_confirmation | awaiting_report | completed | pending_approval */
  status: string;
  is_kickoff: boolean;
  is_retroactive: boolean;
  fee_multiplier: number;
}

export interface MentorWithStats {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  /** Realizadas = `completed` + `awaiting_report`. Base do "A pagar". */
  total_completed: number;
  /** Agendadas para o futuro. */
  total_scheduled: number;
  /** Subconjunto das realizadas: status bruto `completed` sem relatório salvo. */
  total_awaiting_report: number;
  /** Passaram do horário sem fechamento do mentor. NÃO entram no repasse até serem confirmadas. */
  total_pending_confirmation: number;
  assigned_sessions: string[];
  members_served: number;
  monthly_completed: Record<string, number>;
  monthly_scheduled: Record<string, number>;
  monthly_awaiting_report: Record<string, number>;
  monthly_pending_confirmation: Record<string, number>;
  /** Sessões de Mapeamento do Negócio (3h) · valor dobrado. */
  total_kickoff_completed: number;
  total_kickoff_scheduled: number;
  total_kickoff_awaiting_report: number;
  total_kickoff_pending_confirmation: number;
  monthly_kickoff_completed: Record<string, number>;
  monthly_kickoff_scheduled: Record<string, number>;
  monthly_kickoff_awaiting_report: Record<string, number>;
  monthly_kickoff_pending_confirmation: Record<string, number>;
  /** Todas as sessões remuneráveis do mentor (visíveis, fora Onboarding), já com status efetivo. */
  sessions: MentorSessionDetail[];
  session_rate: number | null;
  is_active: boolean;
}

export const useMembers = () => {
  return useQuery({
    queryKey: ["admin-members"],
    queryFn: async () => {
      // Membros = perfis marcados como Begin ou Liberty (mentores/admins são excluídos abaixo).
      const { data: profilesRaw, error: pErr } = await supabase
        .from("profiles")
        .select("*")
        .in("member_tier", ["begin", "liberty"])
        .order("full_name");

      if (pErr) throw pErr;
      const profileRows = profilesRaw || [];

      const [bookings, reportedIds] = await Promise.all([fetchAdminBookings(), fetchReportedBookingIds()]);

      // Exclui quem é mentor/admin/super_admin. Como algumas linhas de role podem estar ocultas por RLS,
      // também exclui perfis que aparecem como mentor em sessões atribuídas, disponibilidade ou bookings.
      const candidateUserIds = profileRows.map((p) => p.user_id).filter((id): id is string => !!id);
      const candidateProfileIds = profileRows.map((p) => p.id);
      const excludeUserIds = new Set<string>();
      const excludeProfileIds = new Set<string>();

      if (candidateUserIds.length > 0) {
        const roleChunks = await Promise.all(
          chunkArray(candidateUserIds, 100).map((ids) =>
            supabase
              .from("user_roles")
              .select("user_id, role")
              .in("user_id", ids)
              .in("role", ["mentor", "admin", "super_admin"]),
          ),
        );
        roleChunks.forEach(({ data, error }) => {
          if (error) throw error;
          (data || []).forEach((r) => excludeUserIds.add(r.user_id));
        });
      }
      if (candidateProfileIds.length > 0) {
        const candidateSet = new Set(candidateProfileIds);
        bookings.forEach((b) => {
          if (b.mentor_id && candidateSet.has(b.mentor_id)) excludeProfileIds.add(b.mentor_id);
        });
        const [mentorSessionChunks, availabilityChunks] = await Promise.all([
          Promise.all(
            chunkArray(candidateProfileIds, 100).map((ids) =>
              supabase.from("mentor_sessions").select("mentor_id").in("mentor_id", ids),
            ),
          ),
          Promise.all(
            chunkArray(candidateProfileIds, 100).map((ids) =>
              supabase.from("mentor_availability").select("mentor_id").in("mentor_id", ids),
            ),
          ),
        ]);
        [...mentorSessionChunks, ...availabilityChunks].forEach(({ data, error }) => {
          if (error) throw error;
          (data || []).forEach((r) => {
            if (r.mentor_id) excludeProfileIds.add(r.mentor_id);
          });
        });
      }
      const profiles = profileRows.filter(
        (p) => (!p.user_id || !excludeUserIds.has(p.user_id)) && !excludeProfileIds.has(p.id),
      );

      // Tarefas pendentes por membro
      const memberProfileIds = new Set(profiles.map((p) => p.id));
      const pendingTasksByMember: Record<string, number> = {};
      if (memberProfileIds.size > 0) {
        const bookingToMember = new Map<string, string>();
        bookings.forEach((b) => {
          if (b.liberty_id && memberProfileIds.has(b.liberty_id)) bookingToMember.set(b.id, b.liberty_id);
        });
        const bookingIds = Array.from(bookingToMember.keys());
        const taskChunks = await Promise.all(
          chunkArray(bookingIds, 100).map((ids) =>
            supabase.from("session_tasks").select("booking_id, is_completed").eq("is_completed", false).in("booking_id", ids),
          ),
        );
        taskChunks.forEach(({ data, error }) => {
          if (error) throw error;
          (data || []).forEach((t) => {
            const libertyId = bookingToMember.get(t.booking_id);
            if (libertyId) pendingTasksByMember[libertyId] = (pendingTasksByMember[libertyId] || 0) + 1;
          });
        });
      }

      // Onboarding (order = 0) é acompanhado à parte e não conta para as 12.
      const isJourneyBooking = (b: AdminBookingRow) => (b.sessions?.order ?? 1) > 0;
      const effectiveStatus = (b: AdminBookingRow) =>
        getEffectiveBookingStatus(b, { hasReport: reportedIds.has(b.id) });

      const mapBooking = (b: AdminBookingRow): BookingDetail => ({
        session_name: b.sessions?.name || "Sem dados",
        session_id: b.session_id,
        booking_id: b.id,
        date: b.scheduled_date,
        start_time: b.start_time,
        end_time: b.end_time,
        mentor_id: b.mentor_id || null,
        mentor_name: b.mentor?.full_name || "Sem dados",
        status: effectiveStatus(b),
        raw_status: b.status,
        is_retroactive: b.is_retroactive === true,
        report_required: b.report_required !== false,
        is_kickoff: b.sessions?.is_kickoff === true,
        has_report: reportedIds.has(b.id),
      });

      const members: MemberWithProgress[] = profiles.map((p) => {
        const memberBookings = bookings.filter((b) => b.liberty_id === p.id && isVisibleSessionBooking(b));
        const journeyBookings = memberBookings.filter(isJourneyBooking);
        // Regra única: "realizada" = mentor/admin fechou como realizada (com ou sem relatório).
        const completed = journeyBookings.filter((b) => isRealizedSessionBooking(b));
        // Passou do horário e ninguém fechou: ocupa vaga, mas NÃO conta como realizada.
        const pendingConfirmation = journeyBookings.filter((b) => isPendingConfirmationBooking(b));
        const pendingConfirmationOverdue = pendingConfirmation.filter((b) => isPendingConfirmationOverdue(b));
        // "Agendada" = somente futuras.
        const scheduled = journeyBookings.filter((b) => isFutureScheduledBooking(b));
        // "Próxima sessão" considera qualquer sessão (inclusive Onboarding), sempre no futuro.
        const futureConfirmed = memberBookings.filter((b) => isFutureScheduledBooking(b));
        const pendingApproval = memberBookings.filter(
          (b) => getEffectiveBookingStatus(b) === "pending_approval" && !isBookingPast(b),
        );

        const lastSession = completed.map((b) => b.scheduled_date).sort().pop() || null;

        return {
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          phone: p.phone,
          avatar_url: p.avatar_url ?? null,
          company_name: p.company_name,
          member_tier: p.member_tier === "liberty" ? "liberty" : "begin",
          program_start_date: p.program_start_date,
          program_end_date: p.program_end_date,
          total_completed: completed.length,
          total_scheduled: scheduled.length,
          total_pending_confirmation: pendingConfirmation.length,
          total_pending_confirmation_overdue: pendingConfirmationOverdue.length,
          total_future_confirmed: futureConfirmed.length,
          total_pending_approval: pendingApproval.length,
          has_next_session: futureConfirmed.length + pendingApproval.length > 0,
          completed_sessions: completed.map(mapBooking),
          scheduled_sessions: scheduled.map(mapBooking),
          pending_confirmation_sessions: pendingConfirmation.map(mapBooking),
          monthly_counts: countByMonth(completed),
          monthly_scheduled_counts: countByMonth(scheduled),
          monthly_pending_confirmation_counts: countByMonth(pendingConfirmation),
          admin_note: p.admin_note ?? null,
          is_active: p.is_active !== false,
          pending_tasks_count: pendingTasksByMember[p.id] || 0,
          last_session_date: lastSession,
        };
      });

      return members;
    },
  });
};

export const useMentors = () => {
  return useQuery({
    queryKey: ["admin-mentors"],
    queryFn: async () => {
      // Perfis de mentor pela role (o e-mail do mentor pode mudar livremente)
      const { data: roleRows, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "mentor");
      if (rErr) throw rErr;
      const mentorUserIds = (roleRows || []).map((r) => r.user_id);

      const { data: mentorProfiles, error: mpErr } = await supabase
        .from("profiles")
        .select("*")
        .in("user_id", mentorUserIds.length > 0 ? mentorUserIds : ["00000000-0000-0000-0000-000000000000"])
        .order("full_name");
      if (mpErr) throw mpErr;

      const { data: mentorSessions, error: msErr } = await supabase
        .from("mentor_sessions")
        .select("*, sessions(name)");
      if (msErr) throw msErr;

      const [bookings, reportedIds] = await Promise.all([fetchAdminBookings(), fetchReportedBookingIds()]);

      // Multiplicador por sessão a partir do catálogo que veio no join (Mapeamento = 2x, Onboarding = 0).
      const feeMultiplierOf = (b: AdminBookingRow) =>
        sessionFeeMultiplier({
          session_name: b.sessions?.name,
          is_kickoff: b.sessions?.is_kickoff,
          duration_minutes: b.sessions?.duration_minutes,
        });
      const effectiveStatus = (b: AdminBookingRow) =>
        getEffectiveBookingStatus(b, { hasReport: reportedIds.has(b.id) });

      const mentors: MentorWithStats[] = (mentorProfiles || []).map((m) => {
        // Sessões não remuneradas (Onboarding) ficam fora de todos os controles financeiros.
        const mBookings = bookings.filter(
          (b) => b.mentor_id === m.id && isVisibleSessionBooking(b) && feeMultiplierOf(b) > 0,
        );

        const withStatus = mBookings.map((b) => ({ b, status: effectiveStatus(b) }));
        // Realizadas (base do repasse) = completed + awaiting_report
        const completed = withStatus.filter((x) => x.status === "completed" || x.status === "awaiting_report").map((x) => x.b);
        const awaiting = withStatus.filter((x) => x.status === "awaiting_report").map((x) => x.b);
        // Passou sem fechamento do mentor: não paga até confirmar
        const pendingConfirmation = withStatus.filter((x) => x.status === "pending_confirmation").map((x) => x.b);
        const scheduled = withStatus.filter((x) => x.status === "scheduled").map((x) => x.b);

        const assignedSessions = (mentorSessions || [])
          .filter((ms) => ms.mentor_id === m.id)
          .map((ms) => (ms as typeof ms & { sessions: { name: string } | null }).sessions?.name || "Sem dados");

        // Membros atendidos: só perfis reais (sem convidados) e sem pedidos apenas pendentes de aprovação.
        const uniqueMembers = new Set(
          withStatus
            .filter((x) => x.b.liberty_id && x.status !== "pending_approval")
            .map((x) => x.b.liberty_id as string),
        );

        const isKick = (b: AdminBookingRow) => feeMultiplierOf(b) > 1;

        const sessions: MentorSessionDetail[] = withStatus
          .filter((x) => x.status !== "cancelled" && x.status !== "not_realized")
          .map(({ b, status }) => ({
            booking_id: b.id,
            session_id: b.session_id,
            session_name: b.sessions?.name || "Sem dados",
            member_name: b.liberty?.full_name || b.guest_name || "Sem dados",
            liberty_id: b.liberty_id ?? null,
            date: b.scheduled_date,
            start_time: b.start_time,
            end_time: b.end_time,
            status,
            is_kickoff: isKick(b),
            is_retroactive: b.is_retroactive === true,
            fee_multiplier: feeMultiplierOf(b),
          }))
          .sort((a, b) => a.date.localeCompare(b.date) || (a.start_time || "").localeCompare(b.start_time || ""));

        return {
          id: m.id,
          user_id: m.user_id,
          full_name: m.full_name,
          email: m.email,
          phone: m.phone,
          avatar_url: m.avatar_url ?? null,
          total_completed: completed.length,
          total_scheduled: scheduled.length,
          total_awaiting_report: awaiting.length,
          total_pending_confirmation: pendingConfirmation.length,
          assigned_sessions: assignedSessions,
          members_served: uniqueMembers.size,
          monthly_completed: countByMonth(completed),
          monthly_scheduled: countByMonth(scheduled),
          monthly_awaiting_report: countByMonth(awaiting),
          monthly_pending_confirmation: countByMonth(pendingConfirmation),
          total_kickoff_completed: completed.filter(isKick).length,
          total_kickoff_scheduled: scheduled.filter(isKick).length,
          total_kickoff_awaiting_report: awaiting.filter(isKick).length,
          total_kickoff_pending_confirmation: pendingConfirmation.filter(isKick).length,
          monthly_kickoff_completed: countByMonth(completed.filter(isKick)),
          monthly_kickoff_scheduled: countByMonth(scheduled.filter(isKick)),
          monthly_kickoff_awaiting_report: countByMonth(awaiting.filter(isKick)),
          monthly_kickoff_pending_confirmation: countByMonth(pendingConfirmation.filter(isKick)),
          sessions,
          session_rate: m.session_rate ?? null,
          is_active: m.is_active !== false,
        };
      });

      return mentors;
    },
  });
};

/** Valor padrão por sessão quando `system_config.session_value` não existe ou é inválido. */
export const DEFAULT_SESSION_VALUE = 300;

/**
 * Configurações globais usadas pelas telas financeiras.
 * As demais métricas que este hook calculava não eram consumidas por nenhuma tela e foram removidas
 * (membros/mentores/realizadas vêm de `useMembers`/`useMentors`, que aplicam a regra única de status).
 */
export const useAdminStats = () => {
  return useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const { data: configData, error } = await supabase
        .from("system_config")
        .select("value")
        .eq("key", "session_value")
        .maybeSingle();
      if (error) throw error;

      const parsed = parseFloat(configData?.value ?? "");
      const sessionValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_SESSION_VALUE;

      return { sessionValue };
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
