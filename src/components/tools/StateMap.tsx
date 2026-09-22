import { useState } from "react";
import { ArrowLeft, ArrowRight, Maximize2, X } from "lucide-react";
import {
  DIAGNOSTICO_BEGIN_PILLARS,
  pillarGoalKey,
  pillarCurrentKey,
  type Answers,
  type ToolPillar,
} from "@/lib/diagnosticoBegin";

interface Props {
  answers: Answers;
  onChange: (key: string, value: string) => void;
  onBack: () => void;
  onNext: () => void;
  accentFor: (i: number) => string;
}

/**
 * Mantém a ordem original dos setores. Na última linha (3-3-2),
 * os dois últimos (Processos e Pessoas) ficam maiores.
 * Array original: 0 gestao, 1 lideranca, 2 financeiro, 3 marketing,
 * 4 inovacao, 5 vendas, 6 processos, 7 pessoas.
 */
const ORDER_INDICES = [0, 1, 2, 3, 4, 5, 6, 7];

/** Só as respostas em frases limpas. Sem pergunta, sem letra da opção, sem nota. */
const sectorStatements = (p: ToolPillar, answers: Answers): string[] =>
  p.questions
    .map((q) => {
      const raw = (answers?.[q.id] ?? "").toString().trim();
      if (!raw) return "";
      if (q.type === "scale") {
        const option = q.options.find((item) => item.key === raw);
        return (option?.label ?? "").trim();
      }
      return raw;
    })
    .filter((value) => value.length > 0);

interface CardProps {
  pillar: ToolPillar;
  color: string;
  answers: Answers;
  onChange: (key: string, value: string) => void;
  expanded?: boolean;
  featured?: boolean;
  onExpand?: () => void;
  onClose?: () => void;
}

const SectorCard = ({ pillar, color, answers, onChange, expanded, featured, onExpand, onClose }: CardProps) => {
  const goal = answers[pillarGoalKey(pillar.id)] || "";
  const current = answers[pillarCurrentKey(pillar.id)] || "";
  const said = sectorStatements(pillar, answers);

  // níveis de fonte: compacto (padrão) > featured (última linha) > expanded (tela cheia)
  const szCurrent = expanded ? "text-lg" : "text-[15px]";
  const szGoal = expanded ? "text-xl" : "text-[17px]";
  const szSaid = expanded ? "text-[13px]" : "text-[12px]";
  const rowsCurrent = expanded ? 3 : 4;
  const cardHeight = expanded ? "h-full" : "h-[26rem]";

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl border bg-card ${cardHeight}`}
      style={{ borderColor: `color-mix(in srgb, ${color} 35%, transparent)` }}
    >
      <div
        className="flex items-center gap-2 border-b px-4 py-2.5"
        style={{
          background: `color-mix(in srgb, ${color} 12%, transparent)`,
          borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
        }}
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        <h3 className="min-w-0 flex-1 truncate text-[12px] font-semibold text-foreground">{pillar.name}</h3>
        <button
          onClick={expanded ? onClose : onExpand}
          className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label={expanded ? "Fechar" : "Abrir em tela cheia"}
        >
          {expanded ? <X className="h-4 w-4" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="relative grid min-h-0 flex-1 grid-cols-2">
        {/* divisória central firme */}
        <div
          className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-[3px] -translate-x-1/2 rounded-full"
          style={{ background: `color-mix(in srgb, ${color} 55%, hsl(var(--border)))` }}
        />

        {/* HOJE */}
        <div className="flex min-h-0 flex-col gap-1.5 bg-muted/25 p-2.5">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Hoje</p>

          {/* Resumo em destaque, no TOPO — sempre visível */}
          <div className="shrink-0 rounded-md border border-muted-foreground/25 bg-background px-1.5 py-1">
            <p className="mb-0.5 text-[7px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Resumo em uma frase
            </p>
            {current ? (
              <p className={`whitespace-pre-wrap ${szCurrent} font-semibold leading-snug text-foreground`}>
                {current}
              </p>
            ) : (
              <textarea
                value={current}
                onChange={(e) => onChange(pillarCurrentKey(pillar.id), e.target.value)}
                placeholder="Resuma como está hoje."
                rows={rowsCurrent}
                className={`w-full resize-none bg-transparent ${szCurrent} font-semibold leading-snug text-foreground placeholder:font-normal placeholder:text-muted-foreground/60 focus:outline-none`}
              />
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
            {said.length > 0 ? (
              <div className="space-y-1.5">
                {said.map((text, idx) => (
                  <div
                    key={idx}
                    className="rounded-md border bg-background/70 px-2.5 py-1.5"
                    style={{
                      borderColor: `color-mix(in srgb, ${color} 22%, transparent)`,
                      borderLeft: `2.5px solid color-mix(in srgb, ${color} 65%, transparent)`,
                    }}
                  >
                    <p className={`${szSaid} leading-snug text-foreground/85`}>{text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10.5px] italic text-muted-foreground/70">Sem respostas.</p>
            )}
          </div>
        </div>

        {/* DESTINO */}
        <div
          className="flex min-h-0 flex-col gap-1.5 p-2.5"
          style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}
        >
          <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color }}>
            <ArrowRight className="h-3 w-3" /> Onde quer chegar
          </p>
          <textarea
            value={goal}
            onChange={(e) => onChange(pillarGoalKey(pillar.id), e.target.value)}
            placeholder="O destino deste setor."
            className={`min-h-0 w-full flex-1 resize-none rounded-md border-2 bg-background p-2 ${szGoal} font-bold leading-snug text-foreground placeholder:font-normal placeholder:text-muted-foreground/60 focus:outline-none`}
            style={{
              borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
              boxShadow: `inset 0 0 0 9999px color-mix(in srgb, ${color} 5%, transparent)`,
            }}
          />
        </div>
      </div>

    </div>
  );
};

/** Mapa: 2 setores por fileira, hoje x destino, com bom respiro. */
export const StateMap = ({ answers, onChange, onBack, onNext, accentFor }: Props) => {
  const [full, setFull] = useState<number | null>(null);

  // reordena os pilares conforme ORDER_INDICES
  const ordered = ORDER_INDICES.map((idx) => DIAGNOSTICO_BEGIN_PILLARS[idx]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Mapa do negócio
          </span>
          <h2 className="text-lg font-semibold leading-tight text-foreground">Hoje x onde quer chegar</h2>
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <span className="rounded-md bg-muted px-2 py-1">Hoje</span>
          <ArrowRight className="h-3.5 w-3.5" />
          <span className="rounded-md bg-primary/15 px- py-1 text-primary">Destino</span>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {ordered.map((p, i) => (
          <div key={p.id}>
            <SectorCard
              pillar={p}
              color={accentFor(i)}
              answers={answers}
              onChange={onChange}
              onExpand={() => setFull(i)}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <button onClick={onNext} className="btn-primary flex flex-1 items-center justify-center gap-2 py-3 text-sm">
          Próxima etapa <ArrowRight className="h-4 w-4" />
        </button>
        <button
          onClick={onBack}
          className="btn-silver flex items-center justify-center gap-1.5 py-2.5 text-sm sm:w-52"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao radar
        </button>
      </div>

      {full !== null && (
        <div className="fixed inset-0 z-50 bg-background/95 p-4 backdrop-blur-sm sm:p-8">
          <div className="mx-auto h-full max-w-5xl">
            <SectorCard
              pillar={ordered[full]}
              color={accentFor(full)}
              answers={answers}
              onChange={onChange}
              expanded
              onClose={() => setFull(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
