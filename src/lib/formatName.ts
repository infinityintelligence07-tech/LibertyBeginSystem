/** Converts any-cased string to Title Case (first letter of each word capitalized).
 *  Keeps small words (de, da, do, dos, das, e) lowercase except when first. */
export const toTitleCase = (raw: string): string => {
  if (!raw) return raw;
  const small = new Set(["de", "da", "do", "dos", "das", "e", "di", "del", "la", "von", "van"]);
  return raw
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((word, i) => {
      if (i > 0 && small.has(word)) return word;
      // preserve internal apostrophes/hyphens capitalization
      return word
        .split(/([-'])/)
        .map((part) => (part.length > 1 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
        .join("");
    })
    .join(" ");
};

/** Returns only first name + last name from a full name, properly title-cased */
export const shortName = (fullName: string): string => {
  if (!fullName) return fullName;
  const cased = toTitleCase(fullName);
  const parts = cased.trim().split(/\s+/);
  if (parts.length <= 2) return cased;
  // skip trailing connectors when picking last surname
  let last = parts[parts.length - 1];
  const small = new Set(["de", "da", "do", "dos", "das", "e"]);
  let i = parts.length - 1;
  while (i > 1 && small.has(last.toLowerCase())) {
    i--;
    last = parts[i];
  }
  return `${parts[0]} ${last}`;
};

/** Returns initials (max 2 chars) from a name */
export const initials = (name: string): string => {
  if (!name) return "";
  const parts = toTitleCase(name).split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/** Normalize a string: lowercase, remove accents, collapse spaces */
export const normalizeText = (s: string): string =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Returns true when every whitespace-separated token in `query` appears in `haystack` (accent-insensitive). */
export const matchesSearch = (haystack: string | null | undefined, query: string): boolean => {
  const q = normalizeText(query);
  if (!q) return true;
  const hay = normalizeText(haystack || "");
  return q.split(" ").every((tok) => tok && hay.includes(tok));
};

