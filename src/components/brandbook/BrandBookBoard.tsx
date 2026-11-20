import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Pipette, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { copyText } from "@/lib/meetingWhatsApp";
import {
  ARCHETYPES,
  SECTION_TITLES,
  SENSES,
  hexToRgb,
  newId,
  normalizeHex,
  readableOn,
  rgbToHex,
  sectionText,
  type BrandBookData,
  type BrandColor,
  type BrandSectionKey,
} from "@/lib/brandBook";

type Patch = (fn: (d: BrandBookData) => BrandBookData) => void;

interface BoardProps {
  data: BrandBookData;
  readOnly: boolean;
  onPatch?: Patch;
  /** Mostra o quadro "Plano de ação" ao lado. */
  showPlan: boolean;
  ownerLabel?: string;
}

const useCopy = () => {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, text: string, label: string) => {
    if (!text.trim()) {
      toast.message("Nada para copiar ainda", { description: `Preencha ${label.toLowerCase()} primeiro.` });
      return;
    }
    await copyText(text);
    setCopied(key);
    toast.success(`${label} copiado`);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
  };
  return { copied, copy };
};

/* ---------- Peças básicas ---------- */

const AutoTextarea = ({
  value,
  onChange,
  placeholder,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel: string;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      rows={2}
      className={cn(
        "block w-full resize-none overflow-hidden rounded-ds-lg border border-transparent bg-muted/50 px-3 py-2.5 text-base leading-relaxed text-foreground placeholder:text-muted-foreground/70",
        "transition-colors hover:border-border focus:border-primary focus:bg-card focus:outline-none",
        className,
      )}
    />
  );
};

const ReadText = ({ value, empty = "Ainda não preenchido", className }: { value: string; empty?: string; className?: string }) =>
  value.trim() ? (
    <p className={cn("whitespace-pre-wrap text-base leading-relaxed text-foreground", className)}>{value}</p>
  ) : (
    <p className="text-sm text-muted-foreground">{empty}</p>
  );

const AddInput = ({ placeholder, onAdd, ariaLabel }: { placeholder: string; onAdd: (v: string) => void; ariaLabel: string }) => {
  const [v, setV] = useState("");
  const submit = () => {
    const t = v.trim();
    if (!t) return;
    onAdd(t);
    setV("");
  };
  return (
    <div className="flex items-center gap-2">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-11 min-w-0 flex-1 rounded-ds-lg border border-dashed border-border bg-transparent px-3 text-base text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none"
      />
      <button
        type="button"
        onClick={submit}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-ds-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        disabled={!v.trim()}
        aria-label="Adicionar"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
};

/** Lista editável: "chips" (palavras curtas) ou "notes" (frases, estilo post-it). */
const ItemList = ({
  items,
  readOnly,
  onChange,
  variant,
  placeholder,
  label,
  numbered,
}: {
  items: string[];
  readOnly: boolean;
  onChange?: (items: string[]) => void;
  variant: "chips" | "notes";
  placeholder: string;
  label: string;
  numbered?: boolean;
}) => {
  const update = (i: number, v: string) => onChange?.(items.map((x, j) => (j === i ? v : x)));
  const remove = (i: number) => onChange?.(items.filter((_, j) => j !== i));

  if (readOnly && items.length === 0) return <p className="text-sm text-muted-foreground">Ainda não preenchido</p>;

  return (
    <div className="space-y-3">
      {variant === "chips" ? (
        <div className="flex flex-wrap gap-2">
          {items.map((it, i) => (
            <span
              key={i}
              className="group inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-1.5 pl-3.5 pr-1.5 text-[15px] font-medium text-foreground"
            >
              {readOnly ? (
                <span className="pr-2">{it}</span>
              ) : (
                <input
                  value={it}
                  onChange={(e) => update(i, e.target.value)}
                  aria-label={`${label} ${i + 1}`}
                  size={Math.max(4, it.length)}
                  className="bg-transparent text-[15px] font-medium focus:outline-none"
                />
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
                  aria-label={`Remover ${it}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2 rounded-ds-lg border border-border bg-background p-2 pl-3">
              {numbered && (
                <span className="mt-2 w-5 shrink-0 text-sm font-semibold tabular-nums text-primary">{i + 1}.</span>
              )}
              {readOnly ? (
                <p className="min-w-0 flex-1 whitespace-pre-wrap py-1.5 text-base leading-relaxed text-foreground">{it}</p>
              ) : (
                <AutoTextarea
                  value={it}
                  onChange={(v) => update(i, v)}
                  ariaLabel={`${label} ${i + 1}`}
                  className="min-w-0 flex-1 bg-transparent px-1 py-1.5 hover:border-transparent focus:bg-transparent focus:border-transparent"
                />
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Remover item ${i + 1}`}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && <AddInput placeholder={placeholder} ariaLabel={`Adicionar em ${label}`} onAdd={(v) => onChange?.([...items, v])} />}
    </div>
  );
};

const BoardCard = ({
  n,
  sectionKey,
  hint,
  children,
  data,
  className,
  copy,
  copied,
}: {
  n?: number;
  sectionKey: BrandSectionKey;
  hint?: string;
  children: ReactNode;
  data: BrandBookData;
  className?: string;
  copy: (key: string, text: string, label: string) => void;
  copied: string | null;
}) => {
  const title = SECTION_TITLES[sectionKey];
  const isCopied = copied === sectionKey;
  return (
    <section className={cn("flex flex-col rounded-ds-xl border border-border bg-card p-6 shadow-sm", className)} aria-label={title}>
      <header className="mb-4 flex items-start gap-3">
        {n !== undefined && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground tabular-nums">
            {n}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-tight tracking-tight text-foreground">{title}</h2>
          {hint && <p className="mt-1 text-sm leading-snug text-muted-foreground">{hint}</p>}
        </div>
        <button
          type="button"
          onClick={() => copy(sectionKey, `${title}\n${sectionText(sectionKey, data)}`.trim(), title)}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium transition-colors",
            isCopied ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          aria-label={`Copiar ${title}`}
        >
          {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {isCopied ? "Copiado" : "Copiar"}
        </button>
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
};

/* ---------- Paleta ---------- */

const RgbInput = ({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) => (
  <label className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-border bg-background px-2">
    <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
    <input
      type="number"
      min={0}
      max={255}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="h-9 w-full min-w-0 bg-transparent text-right text-sm tabular-nums text-foreground [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      aria-label={`Canal ${label}`}
    />
  </label>
);

const HexInput = ({ hex, onCommit }: { hex: string; onCommit: (hex: string) => void }) => {
  const [draft, setDraft] = useState(hex);
  const [lastHex, setLastHex] = useState(hex);
  if (hex !== lastHex) {
    setLastHex(hex);
    setDraft(hex);
  }
  const commit = (v: string) => {
    const n = normalizeHex(v);
    if (n) onCommit(n);
    else setDraft(hex);
  };
  return (
    <input
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = normalizeHex(e.target.value);
        if (n && e.target.value.replace("#", "").length === 6) onCommit(n);
      }}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
      aria-label="Código hexadecimal"
      spellCheck={false}
      className="h-10 w-full rounded-md border border-border bg-background px-2.5 font-mono text-base uppercase tracking-wide text-foreground focus:border-primary focus:outline-none"
    />
  );
};

const ColorSwatch = ({
  color,
  readOnly,
  onChange,
  onRemove,
  copy,
  copied,
}: {
  color: BrandColor;
  readOnly: boolean;
  onChange: (c: BrandColor) => void;
  onRemove: () => void;
  copy: (key: string, text: string, label: string) => void;
  copied: string | null;
}) => {
  const rgb = hexToRgb(color.hex);
  const fg = readableOn(color.hex);
  const key = `color-${color.id}`;
  return (
    <div className="flex flex-col overflow-hidden rounded-ds-lg border border-border bg-background">
      <div className="relative h-32" style={{ backgroundColor: color.hex, color: fg }}>
        {!readOnly && (
          <>
            <input
              type="color"
              value={color.hex.toLowerCase()}
              onChange={(e) => onChange({ ...color, hex: e.target.value.toUpperCase() })}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label={`Escolher cor ${color.name || ""}`.trim()}
            />
            <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold" style={{ backgroundColor: `${fg}1F` }}>
              <Pipette className="h-3 w-3" /> Clique para escolher
            </span>
            <button
              type="button"
              onClick={onRemove}
              className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full hover:bg-black/10"
              style={{ color: fg }}
              aria-label={`Remover cor ${color.name || color.hex}`}
            >
              <X className="h-4 w-4" />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => copy(key, color.hex, color.hex)}
          className="absolute bottom-2 left-3 inline-flex h-9 items-center gap-1.5 rounded-md px-2 font-mono text-sm font-semibold"
          style={{ color: fg, backgroundColor: `${fg}14` }}
          aria-label={`Copiar ${color.hex}`}
        >
          {copied === key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {color.hex}
        </button>
      </div>
      <div className="space-y-2 p-3">
        {readOnly ? (
          <>
            <p className="text-base font-semibold text-foreground">{color.name || "Sem nome"}</p>
            {color.role && <p className="text-sm text-muted-foreground">{color.role}</p>}
            <p className="font-mono text-xs text-muted-foreground">
              RGB {rgb.r}, {rgb.g}, {rgb.b}
            </p>
          </>
        ) : (
          <>
            <input
              value={color.name}
              onChange={(e) => onChange({ ...color, name: e.target.value })}
              placeholder="Nome da cor"
              aria-label="Nome da cor"
              className="h-10 w-full rounded-md border border-transparent bg-transparent px-1 text-base font-semibold text-foreground placeholder:text-muted-foreground/70 hover:border-border focus:border-primary focus:outline-none"
            />
            <input
              value={color.role}
              onChange={(e) => onChange({ ...color, role: e.target.value })}
              placeholder="Uso: principal, apoio, destaque"
              aria-label="Uso da cor"
              className="h-9 w-full rounded-md border border-transparent bg-transparent px-1 text-sm text-muted-foreground placeholder:text-muted-foreground/60 hover:border-border focus:border-primary focus:outline-none"
            />
            <HexInput hex={color.hex} onCommit={(hex) => onChange({ ...color, hex })} />
            <div className="flex gap-1.5">
              <RgbInput label="R" value={rgb.r} onChange={(r) => onChange({ ...color, hex: rgbToHex(r, rgb.g, rgb.b) })} />
              <RgbInput label="G" value={rgb.g} onChange={(g) => onChange({ ...color, hex: rgbToHex(rgb.r, g, rgb.b) })} />
              <RgbInput label="B" value={rgb.b} onChange={(b) => onChange({ ...color, hex: rgbToHex(rgb.r, rgb.g, b) })} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/* ---------- Quadro ---------- */

export const BrandBookBoard = ({ data, readOnly, onPatch, showPlan, ownerLabel }: BoardProps) => {
  const { copied, copy } = useCopy();
  const set = <K extends keyof BrandBookData>(k: K, v: BrandBookData[K]) => onPatch?.((d) => ({ ...d, [k]: v }));
  const setExp = (k: keyof BrandBookData["experiencia"], v: string | string[]) =>
    onPatch?.((d) => ({ ...d, experiencia: { ...d.experiencia, [k]: v } }));
  const cardProps = { data, copy, copied };

  const toggleArchetype = (name: string) =>
    onPatch?.((d) => ({
      ...d,
      arquetipos: d.arquetipos.includes(name) ? d.arquetipos.filter((a) => a !== name) : [...d.arquetipos, name],
    }));

  const shownArchetypes = readOnly
    ? data.arquetipos.flatMap((n) => ARCHETYPES.filter((a) => a.name === n))
    : ARCHETYPES;
  const customArchetypes = data.arquetipos.filter((a) => !ARCHETYPES.some((x) => x.name === a));

  return (
    <div className="flex items-start gap-12 p-2">
      <div className="w-[1440px] shrink-0">
        {/* Título do quadro */}
        <div className="mb-8 flex items-end justify-between gap-6 px-1">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Brand Book</p>
            {readOnly ? (
              <h1 className="mt-1 text-5xl font-bold tracking-tight text-foreground">{data.nome || "Minha marca"}</h1>
            ) : (
              <input
                value={data.nome}
                onChange={(e) => set("nome", e.target.value)}
                placeholder="Nome da marca"
                aria-label="Nome da marca"
                className="mt-1 w-full bg-transparent text-5xl font-bold tracking-tight text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              />
            )}
            {ownerLabel && <p className="mt-2 text-base text-muted-foreground">{ownerLabel}</p>}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-6">
          <BoardCard n={1} sectionKey="transmitir" hint="Sensações e ideias que a marca precisa deixar na cabeça de quem tem contato com ela." {...cardProps}>
            <ItemList
              items={data.transmitir}
              readOnly={readOnly}
              onChange={(v) => set("transmitir", v)}
              variant="chips"
              placeholder="Ex.: confiança, leveza"
              label="O que quer transmitir"
            />
          </BoardCard>

          <BoardCard n={2} sectionKey="historia" hint="Como começou, o que move o fundador e qual virada deu origem à marca." className="col-span-2" {...cardProps}>
            {readOnly ? (
              <ReadText value={data.historia} />
            ) : (
              <AutoTextarea
                value={data.historia}
                onChange={(v) => set("historia", v)}
                placeholder="Conte a história da marca como você contaria para um cliente."
                ariaLabel="História da marca"
                className="min-h-[160px]"
              />
            )}
          </BoardCard>

          <BoardCard n={3} sectionKey="promessa" hint="O compromisso que o cliente pode cobrar da marca, sempre." {...cardProps}>
            {readOnly ? (
              <ReadText value={data.promessa} className="text-xl font-semibold leading-snug" />
            ) : (
              <AutoTextarea
                value={data.promessa}
                onChange={(v) => set("promessa", v)}
                placeholder="Ex.: você sai daqui se sentindo a melhor versão de si."
                ariaLabel="Promessa da marca"
                className="text-xl font-semibold leading-snug"
              />
            )}
          </BoardCard>

          <BoardCard n={4} sectionKey="arquetipos" hint={readOnly ? "A personalidade da marca. O número mostra o principal e o de apoio." : "Escolha o principal e, se fizer sentido, um de apoio. O número mostra a ordem."} className="col-span-2" {...cardProps}>
            <div className="space-y-3">
              {readOnly && data.arquetipos.length === 0 && <p className="text-sm text-muted-foreground">Ainda não preenchido</p>}
              <div className={cn("grid gap-2", readOnly ? "grid-cols-2" : "grid-cols-3")}>
                {shownArchetypes.map((a) => {
                  const on = data.arquetipos.includes(a.name);
                  const order = data.arquetipos.indexOf(a.name);
                  const Tag = readOnly ? "div" : "button";
                  return (
                    <Tag
                      key={a.name}
                      {...(readOnly ? {} : { type: "button" as const, onClick: () => toggleArchetype(a.name), "aria-pressed": on })}
                      className={cn(
                        "relative rounded-ds-lg border px-3 py-2.5 text-left transition-colors",
                        on ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border bg-background hover:border-primary/50",
                      )}
                    >
                      <span className="block text-sm font-semibold text-foreground">{a.name}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{a.desc}</span>
                      {on && (
                        <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                          {order + 1}
                        </span>
                      )}
                    </Tag>
                  );
                })}
              </div>
              {customArchetypes.length > 0 && (
                <ItemList
                  items={customArchetypes}
                  readOnly={readOnly}
                  onChange={(v) => onPatch?.((d) => ({ ...d, arquetipos: [...d.arquetipos.filter((a) => ARCHETYPES.some((x) => x.name === a)), ...v] }))}
                  variant="chips"
                  placeholder=""
                  label="Arquétipo personalizado"
                />
              )}
              {!readOnly && customArchetypes.length === 0 && (
                <AddInput
                  placeholder="Outro arquétipo"
                  ariaLabel="Adicionar arquétipo personalizado"
                  onAdd={(v) => onPatch?.((d) => ({ ...d, arquetipos: [...d.arquetipos, v] }))}
                />
              )}
              {readOnly ? (
                data.arquetiposNota.trim() && <ReadText value={data.arquetiposNota} className="text-sm text-muted-foreground" />
              ) : (
                <AutoTextarea
                  value={data.arquetiposNota}
                  onChange={(v) => set("arquetiposNota", v)}
                  placeholder="Como esse arquétipo aparece na marca?"
                  ariaLabel="Como o arquétipo aparece na marca"
                  className="text-[15px]"
                />
              )}
            </div>
          </BoardCard>

          <BoardCard n={5} sectionKey="paleta" hint={readOnly ? "Toque no código para copiar." : "Clique na cor para abrir o seletor, ou digite o código hexadecimal ou RGB."} className="col-span-2" {...cardProps}>
            {readOnly && data.paleta.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ainda não preenchido</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {data.paleta.map((c) => (
                  <ColorSwatch
                    key={c.id}
                    color={c}
                    readOnly={readOnly}
                    copy={copy}
                    copied={copied}
                    onChange={(next) => onPatch?.((d) => ({ ...d, paleta: d.paleta.map((x) => (x.id === c.id ? next : x)) }))}
                    onRemove={() => onPatch?.((d) => ({ ...d, paleta: d.paleta.filter((x) => x.id !== c.id) }))}
                  />
                ))}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() =>
                      onPatch?.((d) => ({
                        ...d,
                        paleta: [...d.paleta, { id: newId(), name: "", role: d.paleta.length === 0 ? "Principal" : "", hex: d.paleta.length === 0 ? "#1F2937" : "#E5E7EB" }],
                      }))
                    }
                    className="flex min-h-[260px] flex-col items-center justify-center gap-2 rounded-ds-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <Plus className="h-6 w-6" />
                    <span className="text-sm font-medium">Adicionar cor</span>
                  </button>
                )}
              </div>
            )}
          </BoardCard>

          <BoardCard n={6} sectionKey="crencas" hint="Convicções que guiam as decisões da marca. Uma frase por crença." {...cardProps}>
            <ItemList
              items={data.crencas}
              readOnly={readOnly}
              onChange={(v) => set("crencas", v)}
              variant="notes"
              placeholder="Ex.: acreditamos que…"
              label="Crença"
            />
          </BoardCard>

          <BoardCard n={7} sectionKey="simbolos" hint="Elementos que identificam a marca sem precisar do nome: forma, objeto, ícone, gesto." {...cardProps}>
            <ItemList
              items={data.simbolos}
              readOnly={readOnly}
              onChange={(v) => set("simbolos", v)}
              variant="notes"
              placeholder="Ex.: o laço da embalagem"
              label="Símbolo"
            />
          </BoardCard>

          <BoardCard n={8} sectionKey="tagline" hint="Tagline acompanha o nome e não muda. Slogan muda por campanha." className="col-span-2" {...cardProps}>
            <div className="space-y-4">
              {(["tagline", "slogan"] as const).map((k) => (
                <div key={k}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{k === "tagline" ? "Tagline" : "Slogan"}</p>
                  {readOnly ? (
                    <ReadText value={data[k]} className="text-lg font-semibold" />
                  ) : (
                    <AutoTextarea
                      value={data[k]}
                      onChange={(v) => set(k, v)}
                      placeholder={k === "tagline" ? "Frase curta fixa ao lado do nome" : "Frase de campanha"}
                      ariaLabel={k === "tagline" ? "Tagline" : "Slogan"}
                      className="text-lg font-semibold"
                    />
                  )}
                </div>
              ))}
            </div>
          </BoardCard>

          <BoardCard
            n={9}
            sectionKey="experiencia"
            hint="Como o cliente sente a marca pelos cinco sentidos, e os momentos que ele vai lembrar."
            className="col-span-2"
            {...cardProps}
          >
            <div className="grid grid-cols-3 gap-3">
              {SENSES.map((s) => (
                <div key={s.key} className="rounded-ds-lg border border-border bg-background p-3">
                  <p className="text-sm font-semibold text-foreground">{s.label}</p>
                  <p className="mb-2 text-xs text-muted-foreground">{s.hint}</p>
                  {readOnly ? (
                    <ReadText value={data.experiencia[s.key]} className="text-[15px]" empty="Sem definição" />
                  ) : (
                    <AutoTextarea
                      value={data.experiencia[s.key]}
                      onChange={(v) => setExp(s.key, v)}
                      ariaLabel={s.label}
                      placeholder="Descreva"
                      className="text-[15px]"
                    />
                  )}
                </div>
              ))}
              <div className="rounded-ds-lg border border-border bg-background p-3">
                <p className="text-sm font-semibold text-foreground">Momentos marcantes</p>
                <p className="mb-2 text-xs text-muted-foreground">Recepção, entrega, pós-venda, surpresas</p>
                <ItemList
                  items={data.experiencia.momentos}
                  readOnly={readOnly}
                  onChange={(v) => setExp("momentos", v)}
                  variant="notes"
                  placeholder="Ex.: bilhete escrito à mão"
                  label="Momento"
                />
              </div>
            </div>
          </BoardCard>

          <BoardCard n={10} sectionKey="palavras" hint="Palavras que fazem parte do vocabulário da marca e aparecem na comunicação." className="col-span-2" {...cardProps}>
            <ItemList
              items={data.palavras}
              readOnly={readOnly}
              onChange={(v) => set("palavras", v)}
              variant="chips"
              placeholder="Ex.: essência"
              label="Palavra sagrada"
            />
          </BoardCard>
        </div>
      </div>

      {showPlan && (
        <div className="w-[400px] shrink-0 pt-[118px]">
          <BoardCard sectionKey="plano" hint="Próximos passos combinados na sessão, em ordem." className="border-primary/40" {...cardProps}>
            <ItemList
              items={data.plano}
              readOnly={readOnly}
              onChange={(v) => set("plano", v)}
              variant="notes"
              numbered
              placeholder="Ex.: refazer a bio do Instagram"
              label="Ação"
            />
          </BoardCard>
        </div>
      )}
    </div>
  );
};
