// Geração de senha temporária forte e legível, sem caracteres ambíguos.
// Formato: 3 blocos pronunciáveis (Consoante-Vogal-Consoante-Vogal) capitalizados
// separados por "-" e 2 dígitos no final. Ex.: "Kuma-Tevo-Rila27".
// Entropia ~44 bits (6400^3 * 100) usando crypto.getRandomValues.

const CONSONANTS = "bcdfghjkmnprstvz"; // sem l, q, w, x, y (ambíguos ou pouco legíveis)
const VOWELS = "aeiou";
const DIGITS = "23456789"; // sem 0 e 1 (confundem com O e l)

function randomInt(maxExclusive: number): number {
  // Rejection sampling para evitar viés de módulo.
  const limit = Math.floor(256 / maxExclusive) * maxExclusive;
  const buf = new Uint8Array(1);
  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % maxExclusive;
  }
}

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)];
}

function block(): string {
  const raw = pick(CONSONANTS) + pick(VOWELS) + pick(CONSONANTS) + pick(VOWELS);
  return raw[0].toUpperCase() + raw.slice(1);
}

/** Senha temporária legível, ex.: "Kuma-Tevo-Rila27". */
export function generateReadablePassword(): string {
  return `${block()}-${block()}-${block()}${pick(DIGITS)}${pick(DIGITS)}`;
}

export const MIN_PASSWORD_LENGTH = 6;
