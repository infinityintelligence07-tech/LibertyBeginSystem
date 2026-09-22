import { ArrowRight } from "lucide-react";
import {
  pillarCurrentKey,
  pillarGoalKey,
  pillarScore,
  type Answers,
  type ToolPillar,
} from "@/lib/diagnosticoBegin";

/** Só as respostas em frases limpas. Sem pergunta, sem letra da opção, sem nota. */
const sectorStatements = (p: ToolPillar, answers: Answers): string[] =>
  p.questions
    .map((q) => {
      const raw = (answers?.[q.id] ?? "").toString().trim();
      if (!raw) return "";
      if (q.type === "scale") {
        const opt = q.options.find((o) => o.key === raw);
        return (opt?.label ?? "").trim();
      }
      return raw;
    })
    .filter((v) => v.length > 0);

/**
 * Folha horizontal de um setor, mesmo layout da ferramenta:
 * esquerda = hoje (respostas + resumo em uma frase), direita = onde quer chegar.
 */
export const DiagnosticSheet = ({
  pillar,
  answers,
  score,
  memberName,
  companyName,
  fullHeight,
}: {
  pillar: ToolPillar;
  answers: Answers;
  score?: number;
  memberName?: string;
  companyName?: string;
  fullHeight?: boolean;
}) => {
  const goal = (answers?.[pillarGoalKey(pillar.id)] ?? "").toString().trim();
  const current = (answers?.[pillarCurrentKey(pillar.id)] ?? "").toString().trim();
  const value = typeof score === "number" ? score : pillarScore(pillar, answers);
  const said = sectorStatements(pillar, answers);

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm ${
        fullHeight ? "h-full" : ""
      }`}
    >
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-4 border-b border-border bg-muted/30 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Mapeamento do Negócio
          </p>
          <h3 className="truncate text-base font-semibold leading-tight text-foreground">{pillar.name}</h3>
          {(memberName || companyName) && (
            <p className="truncate text-[11px] text-muted-foreground">
              {[memberName, companyName].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Nota</p>
          <p className="text-xl font-semibold leading-none tabular-nums text-primary">
            {Number(value ?? 0).toFixed(1)}
            <span className="text-xs font-normal text-muted-foreground">/5</span>
          </p>
        </div>
      </div>

      {/* Corpo: hoje x destino */}
      <div className={`relative grid min-h-0 flex-1 md:grid-cols-2 ${fullHeight ? "" : "md:min-h-[18rem]"}`}>
        {/* divisória central firme */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 hidden w-[3px] -translate-x-1/2 rounded-full bg-border md:block" />

        {/* Hoje */}
        <div className="flex min-h-0 flex-col gap-2 border-b border-border bg-muted/25 p-3 md:border-b-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Hoje</p>

          {/* Resumo em destaque, no TOPO — sempre visível */}
          <div className="shrink-0 rounded-lg border border-muted-foreground/25 bg-background px-2.5 py-1.5">
            <p className="mb-0.5 text-[8px] font-bold uppercase tracking-wider text-muted-foreground">
              Resumo em uma frase
            </p>
            {current ? (
              <p className="whitespace-pre-wrap text-lg font-semibold leading-snug text-foreground">{current}</p>
            ) : (
              <p className="text-[11px] italic text-muted-foreground">Resumo ainda não preenchido.</p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {said.length > 0 ? (
              <div className="space-y-1.5">
                {said.map((text, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-muted-foreground/20 border-l-[2.5px] border-l-primary/60 bg-background/70 px-2.5 py-1.5"
                  >
                    <p className="text-[12px] leading-snug text-foreground/85">{text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs italic text-muted-foreground/70">Nenhuma resposta registrada neste setor.</p>
            )}
          </div>
        </div>

        {/* Destino */}
        <div className="flex min-h-0 flex-col gap-2 bg-status-green/10 p-3">
          <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-status-green">
            <ArrowRight className="h-3 w-3" /> Onde quer chegar
          </p>
          <div className="flex min-h-[6rem] flex-1 items-start rounded-lg border-2 border-status-green/50 bg-background p-3">
            {goal ? (
              <p className="whitespace-pre-wrap text-xl font-bold leading-snug text-foreground md:text-2xl">
                {goal}
              </p>
            ) : (
              <p className="text-xs italic text-muted-foreground">O aluno ainda não definiu o destino desta área.</p>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};
