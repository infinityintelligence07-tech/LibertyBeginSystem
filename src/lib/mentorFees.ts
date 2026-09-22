/**
 * Regras de repasse financeiro ao mentor.
 *
 * Sessão de Mapeamento do Negócio (kickoff, 3h) = dobro do valor padrão.
 * Ex.: taxa padrão R$ 300 → Mapeamento R$ 600.
 */
export const KICKOFF_FEE_MULTIPLIER = 2;

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

/** Multiplicador do valor da sessão. */
export const sessionFeeMultiplier = (input: {
  session_name?: string | null;
  is_kickoff?: boolean | null;
  duration_minutes?: number | null;
}): number => {
  if (isUnpaidSessionName(input.session_name)) return 0;
  if (input.is_kickoff) return KICKOFF_FEE_MULTIPLIER;
  if ((input.duration_minutes ?? 0) >= 180) return KICKOFF_FEE_MULTIPLIER;
  if (isKickoffSessionName(input.session_name)) return KICKOFF_FEE_MULTIPLIER;
  return 1;
};


/** Valor a ser repassado por uma sessão. */
export const sessionFee = (
  baseRate: number,
  input: { session_name?: string | null; is_kickoff?: boolean | null; duration_minutes?: number | null },
): number => baseRate * sessionFeeMultiplier(input);
