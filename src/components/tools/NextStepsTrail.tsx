import { ArrowLeft, ArrowRight, Check, Gift } from "lucide-react";
import { type Answers } from "@/lib/diagnosticoBegin";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ds";

interface Props {
  answers: Answers;
  onBack: () => void;
  onNext: () => void;
  accentFor: (i: number) => string;
}

const TOTAL_SESSIONS = 12;

/** Trilha das 12 sessões da jornada e o presente da 13ª. Estática, sem animação. */
export const NextStepsTrail = ({ onBack, onNext }: Props) => {
  const stops = TOTAL_SESSIONS + 1;

  return (
    <div className="space-y-4">
      <SectionCard padding="compact">
        <span className="ds-kicker">Sua jornada</span>
        <h2 className="text-[22px] font-semibold text-foreground mt-1 leading-tight">As 12 sessões pela frente</h2>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-3xl">
          O mapeamento de hoje abre a jornada. A partir daqui são 12 encontros com mentores especialistas, cada um
          recebendo o estado atual e o destino que você definiu. Ao concluir, a 13ª é um presente.
        </p>
      </SectionCard>

      <SectionCard padding="compact" className="overflow-x-auto">
        <div className="relative min-w-[900px] pt-2 pb-1">
          {/* Linha base */}
          <div className="absolute left-8 right-8 top-[15px] h-px bg-border" aria-hidden />

          <div
            className="relative grid gap-2"
            style={{ gridTemplateColumns: `repeat(${stops}, minmax(0,1fr))` }}
          >
            {Array.from({ length: TOTAL_SESSIONS }, (_, i) => (
              <div key={i} className="flex flex-col items-center text-center">
                <span className="h-8 w-8 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div className="mt-3 w-full px-1.5 py-2.5">
                  <p className="text-xs font-medium text-muted-foreground leading-tight">Sessão</p>
                  <p className="text-base font-semibold tabular-nums leading-none mt-0.5 text-foreground">{i + 1}</p>
                </div>
              </div>
            ))}

            {/* Presente (13ª) */}
            <div className="flex flex-col items-center text-center">
              <span className="h-8 w-8 rounded-full border border-dashed border-border bg-card flex items-center justify-center text-muted-foreground">
                <Gift className="h-4 w-4" aria-hidden />
              </span>
              <div className="mt-3 w-full px-1.5 py-2.5">
                <p className="text-xs font-medium text-muted-foreground leading-tight">Presente</p>
                <p className="text-base font-semibold tabular-nums leading-none mt-0.5 text-foreground">13</p>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="flex flex-col sm:flex-row-reverse gap-2">
        <Button size="lg" className="flex-1" onClick={onNext}>
          Próxima etapa <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
        <Button variant="outline" size="lg" className="sm:w-52" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar ao mapa
        </Button>
      </div>
    </div>
  );
};
