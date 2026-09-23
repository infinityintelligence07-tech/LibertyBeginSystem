import { useEffect, useState } from "react";
import { motion } from "framer-motion";
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
const GREEN = "#16a34a";
const GOLD = "#d4af37";

/** Trilha das 12 sessões da jornada, com barra verde que se enche até o presente dourado da 13ª. */
export const NextStepsTrail = ({ onBack, onNext, accentFor }: Props) => {
  const stops = TOTAL_SESSIONS + 1;
  const [fill, setFill] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setFill(1), 250);
    return () => clearTimeout(t);
  }, []);

  const stepDelay = (i: number) => 0.25 + (i / (stops - 1)) * 1.9;

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

      <div className="rounded-2xl border border-border bg-card/40 p-4 sm:p-6 overflow-x-auto">
        <div className="relative min-w-[900px] pt-2 pb-1">
          {/* Linha base (cinza) */}
          <div className="absolute left-8 right-8 top-[22px] h-2 rounded-full bg-muted overflow-hidden">
            {/* Linha verde que se enche */}
            <motion.div
              className="h-full rounded-full"
              style={{
                background: `linear-gradient(90deg, ${GREEN}, ${GREEN})`,
                transformOrigin: "left",
              }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: fill }}
              transition={{ duration: 2.1, ease: "easeInOut" }}
            />
          </div>

          <div
            className="relative grid gap-2"
            style={{ gridTemplateColumns: `repeat(${stops}, minmax(0,1fr))` }}
          >
            {Array.from({ length: TOTAL_SESSIONS }, (_, i) => {
              return (
                <div key={i} className="flex flex-col items-center text-center">
                  <motion.span
                    className="h-8 w-8 rounded-full border-[3px] border-background flex items-center justify-center shadow-lg"
                    style={{ background: GREEN }}
                    initial={{ scale: 0.4, opacity: 0.35 }}
                    animate={{ scale: [0.4, 1.25, 1], opacity: 1 }}
                    transition={{ delay: stepDelay(i), duration: 0.45, ease: "easeOut" }}
                  >
                    <Check className="h-3.5 w-3.5 text-background" />
                  </motion.span>
                  <motion.div
                    className="mt-3 w-full rounded-xl border border-border bg-card px-1.5 py-2.5"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: stepDelay(i) + 0.05, duration: 0.35 }}
                  >
                    <p className="text-xs font-semibold text-foreground leading-tight">Sessão</p>
                    <p className="text-base font-semibold tabular-nums leading-none mt-0.5 text-foreground">
                      {i + 1}
                    </p>
                  </motion.div>
                </div>
              );
            })}

            {/* Presente dourado e glamuroso */}
            <div className="flex flex-col items-center text-center">
              <motion.span
                className="h-8 w-8 rounded-full border-[3px] border-background flex items-center justify-center shadow-lg relative"
                style={{
                  background: `radial-gradient(circle at 30% 30%, #f4d77a, ${GOLD})`,
                }}
                initial={{ scale: 0.4, opacity: 0.3 }}
                animate={{
                  scale: [0.4, 1.4, 1],
                  opacity: 1,
                  boxShadow: [
                    "0 0 0 0 rgba(212,175,55,0)",
                    "0 0 20px 3px rgba(212,175,55,0.55)",
                    "0 0 0 0 rgba(212,175,55,0)",
                  ],
                }}
                transition={{ delay: stepDelay(stops - 1), duration: 0.9, ease: "easeOut" }}
              >
                <Gift className="h-4 w-4 text-[#5a4500]" />
              </motion.span>
              <motion.div
                className="mt-3 w-full rounded-xl px-1.5 py-2.5 relative overflow-hidden"
                style={{
                  border: `1.5px solid ${GOLD}`,
                  background: "linear-gradient(135deg, rgba(212,175,55,0.18), rgba(212,175,55,0.06))",
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  boxShadow: [
                    "0 0 0 0 rgba(212,175,55,0)",
                    "0 0 24px 0 rgba(212,175,55,0.4)",
                    "0 0 0 0 rgba(212,175,55,0)",
                  ],
                }}
                transition={{ delay: stepDelay(stops - 1), duration: 1.4 }}
              >
                <p className="text-xs font-semibold leading-tight" style={{ color: GOLD }}>
                  Presente
                </p>
                <p className="text-base font-semibold tabular-nums leading-none mt-0.5" style={{ color: GOLD }}>
                  13
                </p>
              </motion.div>
            </div>
          </div>
        </div>
      </div>

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
