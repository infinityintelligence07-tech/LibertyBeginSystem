export const BRAND_BOOK_SLUG = "brand-book";
export const DIAGNOSTIC_SLUG = "diagnostico-begin";

export const brandBookShareUrl = (token: string) => `${window.location.origin}/marca/${token}`;

export interface BrandColor {
  id: string;
  name: string;
  hex: string;
  role: string;
}

export interface BrandExperience {
  visao: string;
  audicao: string;
  tato: string;
  olfato: string;
  paladar: string;
  momentos: string[];
}

export interface BrandBookData {
  nome: string;
  transmitir: string[];
  historia: string;
  promessa: string;
  arquetipos: string[];
  arquetiposNota: string;
  paleta: BrandColor[];
  crencas: string[];
  simbolos: string[];
  tagline: string;
  slogan: string;
  experiencia: BrandExperience;
  palavras: string[];
  plano: string[];
}

export const ARCHETYPES: { name: string; desc: string }[] = [
  { name: "Inocente", desc: "Otimismo, simplicidade e confiança" },
  { name: "Explorador", desc: "Liberdade, descoberta e autenticidade" },
  { name: "Sábio", desc: "Conhecimento, clareza e verdade" },
  { name: "Herói", desc: "Coragem, superação e conquista" },
  { name: "Fora da lei", desc: "Ruptura, rebeldia e mudança" },
  { name: "Mago", desc: "Transformação e realização de sonhos" },
  { name: "Cara comum", desc: "Pertencimento, empatia e proximidade" },
  { name: "Amante", desc: "Paixão, prazer e conexão" },
  { name: "Bobo da corte", desc: "Leveza, humor e diversão" },
  { name: "Cuidador", desc: "Proteção, acolhimento e serviço" },
  { name: "Criador", desc: "Inovação, imaginação e expressão" },
  { name: "Governante", desc: "Liderança, controle e excelência" },
];

export const SENSES: { key: keyof Omit<BrandExperience, "momentos">; label: string; hint: string }[] = [
  { key: "visao", label: "Visão", hint: "O que o cliente vê: ambiente, embalagem, vitrine, feed" },
  { key: "audicao", label: "Audição", hint: "Trilha, tom de voz, sons do atendimento" },
  { key: "tato", label: "Tato", hint: "Texturas, materiais, peso do produto" },
  { key: "olfato", label: "Olfato", hint: "Aroma da loja, da embalagem, da entrega" },
  { key: "paladar", label: "Paladar", hint: "Algo para provar: café, bala, brinde" },
];

export const emptyBrandBook = (): BrandBookData => ({
  nome: "",
  transmitir: [],
  historia: "",
  promessa: "",
  arquetipos: [],
  arquetiposNota: "",
  paleta: [],
  crencas: [],
  simbolos: [],
  tagline: "",
  slogan: "",
  experiencia: { visao: "", audicao: "", tato: "", olfato: "", paladar: "", momentos: [] },
  palavras: [],
  plano: [],
});

const str = (v: unknown) => (typeof v === "string" ? v : "");
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function normalizeBrandBook(raw: unknown): BrandBookData {
  const base = emptyBrandBook();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const r = raw as Record<string, unknown>;
  const exp = (r.experiencia && typeof r.experiencia === "object" ? r.experiencia : {}) as Record<string, unknown>;
  return {
    nome: str(r.nome),
    transmitir: strList(r.transmitir),
    historia: str(r.historia),
    promessa: str(r.promessa),
    arquetipos: strList(r.arquetipos),
    arquetiposNota: str(r.arquetiposNota),
    paleta: Array.isArray(r.paleta)
      ? r.paleta
          .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
          .map((c) => ({
            id: str(c.id) || newId(),
            name: str(c.name),
            hex: normalizeHex(str(c.hex)) ?? "#000000",
            role: str(c.role),
          }))
      : [],
    crencas: strList(r.crencas),
    simbolos: strList(r.simbolos),
    tagline: str(r.tagline),
    slogan: str(r.slogan),
    experiencia: {
      visao: str(exp.visao),
      audicao: str(exp.audicao),
      tato: str(exp.tato),
      olfato: str(exp.olfato),
      paladar: str(exp.paladar),
      momentos: strList(exp.momentos),
    },
    palavras: strList(r.palavras),
    plano: strList(r.plano),
  };
}

export function normalizeHex(input: string): string | null {
  const v = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(v)) return `#${v.split("").map((c) => c + c).join("")}`.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(v)) return `#${v}`.toUpperCase();
  return null;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = normalizeHex(hex) ?? "#000000";
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Texto legível sobre a cor (preto ou branco), pela luminância relativa. */
export function readableOn(hex: string): "#000000" | "#FFFFFF" {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.4 ? "#000000" : "#FFFFFF";
}

const bullets = (items: string[]) => items.filter((s) => s.trim()).map((s) => `- ${s.trim()}`).join("\n");

export type BrandSectionKey =
  | "transmitir"
  | "historia"
  | "promessa"
  | "arquetipos"
  | "paleta"
  | "crencas"
  | "simbolos"
  | "tagline"
  | "experiencia"
  | "palavras"
  | "plano";

export const SECTION_TITLES: Record<BrandSectionKey, string> = {
  transmitir: "O que a marca quer transmitir",
  historia: "História da marca",
  promessa: "Promessa da marca",
  arquetipos: "Arquétipos",
  paleta: "Paleta de cores",
  crencas: "O que a marca acredita",
  simbolos: "Símbolos da marca",
  tagline: "Tagline e slogan",
  experiencia: "Experiência do cliente",
  palavras: "Palavras sagradas",
  plano: "Plano de ação",
};

export function sectionText(key: BrandSectionKey, d: BrandBookData): string {
  switch (key) {
    case "transmitir":
      return bullets(d.transmitir);
    case "historia":
      return d.historia.trim();
    case "promessa":
      return d.promessa.trim();
    case "arquetipos": {
      const lines = d.arquetipos.map((a) => {
        const found = ARCHETYPES.find((x) => x.name === a);
        return found ? `- ${a}: ${found.desc.toLowerCase()}` : `- ${a}`;
      });
      if (d.arquetiposNota.trim()) lines.push("", d.arquetiposNota.trim());
      return lines.join("\n").trim();
    }
    case "paleta":
      return d.paleta
        .map((c) => {
          const { r, g, b } = hexToRgb(c.hex);
          const label = [c.name.trim(), c.role.trim()].filter(Boolean).join(", ");
          return `- ${label ? `${label}: ` : ""}${c.hex} (RGB ${r}, ${g}, ${b})`;
        })
        .join("\n");
    case "crencas":
      return bullets(d.crencas);
    case "simbolos":
      return bullets(d.simbolos);
    case "tagline":
      return [
        d.tagline.trim() && `Tagline: ${d.tagline.trim()}`,
        d.slogan.trim() && `Slogan: ${d.slogan.trim()}`,
      ]
        .filter(Boolean)
        .join("\n");
    case "experiencia": {
      const lines = SENSES.filter((s) => d.experiencia[s.key].trim()).map(
        (s) => `- ${s.label}: ${d.experiencia[s.key].trim()}`,
      );
      const m = bullets(d.experiencia.momentos);
      if (m) lines.push("", "Momentos marcantes da jornada:", m);
      return lines.join("\n").trim();
    }
    case "palavras":
      return d.palavras.filter((s) => s.trim()).join(", ");
    case "plano":
      return bullets(d.plano);
  }
}

export const BOARD_ORDER: BrandSectionKey[] = [
  "transmitir",
  "historia",
  "promessa",
  "arquetipos",
  "paleta",
  "crencas",
  "simbolos",
  "tagline",
  "experiencia",
  "palavras",
];

export function filledCount(d: BrandBookData): number {
  return BOARD_ORDER.filter((k) => sectionText(k, d).length > 0).length;
}

export function buildBrandPrompt(d: BrandBookData, brandName: string, includePlan = true): string {
  const name = brandName.trim() || "minha marca";
  const blocks = [...BOARD_ORDER, ...(includePlan ? (["plano"] as const) : [])]
    .map((k) => {
      const body = sectionText(k, d);
      return body ? `## ${SECTION_TITLES[k]}\n${body}` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  return `Você é o estrategista de marca de ${name}. A partir de agora, use o Brand Book abaixo como a fonte oficial da identidade da marca. Tudo o que você escrever, sugerir ou criar para ${name} (posts, legendas, roteiros, anúncios, e-mails, atendimento, nomes de produtos, campanhas) precisa respeitar estas definições.

Regras:
1. Mantenha o tom coerente com o que a marca quer transmitir, com os arquétipos e com as crenças.
2. Use as palavras sagradas com naturalidade e nunca contradiga a promessa da marca.
3. Ao sugerir peças visuais, use a paleta de cores pelos códigos indicados.
4. Quando algo não estiver definido aqui, pergunte antes de inventar.
5. Antes de entregar qualquer conteúdo, confira se ele soa como ${name}.

# Brand Book de ${name}

${blocks || "(ainda sem informações preenchidas)"}

Confirme que entendeu resumindo em 3 frases a essência de ${name} e aguarde meu primeiro pedido.`;
}
