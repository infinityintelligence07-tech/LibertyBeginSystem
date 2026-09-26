/**
 * Regras de repasse financeiro ao mentor.
 *
 * Sessão normal → `session_value` (padrão R$ 300).
 * Mapeamento do Negócio (kickoff, 3h) → `kickoff_session_value` (padrão R$ 600).
 * Se o mentor tem taxa própria, o mapeamento escala na mesma proporção.
 */

export const DEFAULT_SESSION_VALUE = 300;
export const DEFAULT_KICKOFF_SESSION_VALUE = 600;

/** @deprecated Preferir DEFAULT_KICKOFF_SESSION_VALUE / session_value. Mantido para telas que ainda mostram "2×". */
export const KICKOFF_FEE_MULTIPLIER =
  DEFAULT_KICKOFF_SESSION_VALUE / DEFAULT_SESSION_VALUE;

export type MentorFeeRates = {
  /** Valor da sessão normal (system_config.session_value). */
  sessionValue: number;
  /** Valor do Mapeamento / kickoff 3h (system_config.kickoff_session_value). */
  kickoffValue: number;
};

export const defaultMentorFeeRates = (): MentorFeeRates => ({
  sessionValue: DEFAULT_SESSION_VALUE,
  kickoffValue: DEFAULT_KICKOFF_SESSION_VALUE,
});

/** Detecta a sessão de mapeamento/kickoff pelo nome (fallback quando não há flag). */
export const isKickoffSessionName = (name?: string | null): boolean => {
  if (!name) return false;
  const n = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return n.includes("mapeamento do negocio") || n.includes("mapa do negocio") || n.includes("kickoff");
};

/** Sessões não remuneradas (ex.: Onboarding / boas-vindas). */
export const isUnpaidSessionName = (name?: string | null): boolean => {
  if (!name) return false;
  const n = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return n === "onboarding" || n.includes("onboarding") || n.includes("boas-vindas") || n.includes("boas vindas");
};

export type SessionFeeInput = {
  session_name?: string | null;
  is_kickoff?: boolean | null;
  duration_minutes?: number | null;
};

export const isKickoffFeeSession = (input: SessionFeeInput): boolean => {
  if (isUnpaidSessionName(input.session_name)) return false;
  if (input.is_kickoff) return true;
  if ((input.duration_minutes ?? 0) >= 180) return true;
  return isKickoffSessionName(input.session_name);
};

/** Proporção mapeamento / sessão normal (ex.: 600/300 = 2). */
export const kickoffFeeRatio = (rates: MentorFeeRates = defaultMentorFeeRates()): number => {
  if (!(rates.sessionValue > 0)) return KICKOFF_FEE_MULTIPLIER;
  return rates.kickoffValue / rates.sessionValue;
};

/**
 * Multiplicador do valor da sessão.
 * 0 = não paga · 1 = normal · ratio = mapeamento (em geral 2).
 */
export const sessionFeeMultiplier = (
  input: SessionFeeInput,
  rates: MentorFeeRates = defaultMentorFeeRates(),
): number => {
  if (isUnpaidSessionName(input.session_name)) return 0;
  if (isKickoffFeeSession(input)) return kickoffFeeRatio(rates);
  return 1;
};

/** Valor do Mapeamento para um mentor com taxa `baseRate`. */
export const kickoffFeeForRate = (
  baseRate: number,
  rates: MentorFeeRates = defaultMentorFeeRates(),
): number => baseRate * kickoffFeeRatio(rates);

/** Valor a ser repassado por uma sessão. */
export const sessionFee = (
  baseRate: number,
  input: SessionFeeInput,
  rates: MentorFeeRates = defaultMentorFeeRates(),
): number => baseRate * sessionFeeMultiplier(input, rates);
