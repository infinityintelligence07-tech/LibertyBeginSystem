import { KICKOFF_NOT_ALLOWED_MESSAGE } from "@/lib/sessionProgress";

type BackendError = { message?: string | null; details?: string | null; code?: string | null } | null | undefined;

const errorText = (error: BackendError) => `${error?.message ?? ""} ${error?.details ?? ""} ${error?.code ?? ""}`;

export const isMonthlyBookingLimitError = (error: BackendError) =>
  errorText(error).includes("MONTHLY_BOOKING_LIMIT_EXCEEDED");

export const isJourneyBookingLimitError = (error: BackendError) =>
  errorText(error).includes("JOURNEY_BOOKING_LIMIT_EXCEEDED");

/** Regra antiga (removida do banco); mantido só por compatibilidade de mensagens. */
export const isKickoffRequiredError = (error: BackendError) =>
  errorText(error).includes("KICKOFF_REQUIRED") && !errorText(error).includes("KICKOFF_NOT_ALLOWED");

export const isKickoffNotAllowedError = (error: BackendError) =>
  errorText(error).includes("KICKOFF_NOT_ALLOWED");

export const isCompletionBeforeEndError = (error: BackendError) =>
  errorText(error).includes("COMPLETION_BEFORE_SESSION_END");

export const isDuplicateBookingError = (error: BackendError) => {
  const text = errorText(error);
  return text.includes("bookings_unique_liberty_session_active") || text.includes("23505") || text.includes("duplicate key");
};

export const isProtectedColumnError = (error: BackendError) => {
  const text = errorText(error);
  return text.includes("BOOKING_COLUMN_PROTECTED") || text.includes("BOOKING_STATUS_NOT_ALLOWED") || text.includes("PROFILE_COLUMN_PROTECTED");
};

/**
 * Mensagem em português para os erros de regra de negócio lançados pelo banco
 * (triggers `enforce_member_booking_rules`, `prevent_premature_completion`, índices únicos, RLS).
 * Devolve `null` quando o erro não é de regra (o chamador decide o fallback).
 */
export const bookingRuleErrorMessage = (error: BackendError) => {
  if (isKickoffNotAllowedError(error)) return KICKOFF_NOT_ALLOWED_MESSAGE;
  if (isJourneyBookingLimitError(error)) return "Este membro já utilizou todas as sessões da jornada.";
  if (isCompletionBeforeEndError(error)) return "A sessão só pode ser marcada como realizada depois do horário de término.";
  if (isMonthlyBookingLimitError(error)) return "Este membro já possui duas sessões contabilizadas neste mês.";
  if (isKickoffRequiredError(error)) return "Conclua o Mapeamento do Negócio antes de agendar outra sessão.";
  if (isDuplicateBookingError(error)) return "Este membro já tem essa sessão agendada ou realizada.";
  if (isProtectedColumnError(error)) return "Você não tem permissão para fazer essa alteração.";
  if (errorText(error).includes("row-level security")) return "Você não tem permissão para fazer essa alteração.";
  return null;
};

/** Sempre devolve uma mensagem: regra traduzida, ou a mensagem original, ou o fallback. */
export const translateBookingError = (
  error: BackendError | Error | unknown,
  fallback = "Não foi possível concluir a operação. Tente novamente.",
) => {
  const err = (error && typeof error === "object" ? error : null) as BackendError;
  return bookingRuleErrorMessage(err) ?? (err?.message?.trim() ? err.message : fallback);
};
