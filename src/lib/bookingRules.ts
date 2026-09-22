type BackendError = { message?: string | null; details?: string | null } | null | undefined;

const errorText = (error: BackendError) => `${error?.message ?? ""} ${error?.details ?? ""}`;

export const isMonthlyBookingLimitError = (error: BackendError) =>
  errorText(error).includes("MONTHLY_BOOKING_LIMIT_EXCEEDED");

export const isJourneyBookingLimitError = (error: BackendError) =>
  errorText(error).includes("JOURNEY_BOOKING_LIMIT_EXCEEDED");

export const isKickoffRequiredError = (error: BackendError) =>
  errorText(error).includes("KICKOFF_REQUIRED");

export const bookingRuleErrorMessage = (error: BackendError) => {
  if (isJourneyBookingLimitError(error))
    return "Este membro já utilizou todas as sessões da jornada.";
  if (isMonthlyBookingLimitError(error))
    return "Este membro já possui duas sessões contabilizadas neste mês.";
  if (isKickoffRequiredError(error)) return "Conclua o Mapeamento do Negócio antes de agendar outra sessão.";
  return null;
};
