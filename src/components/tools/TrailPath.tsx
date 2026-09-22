import { motion } from "framer-motion";
import {
  Check, Compass, Users, Megaphone, Lightbulb, Wallet, Settings2, HeartHandshake, Flag,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { DIAGNOSTICO_BEGIN_PILLARS, isPillarComplete, pillarAnsweredCount, type Answers } from "@/lib/diagnosticoBegin";

const PILLARS = DIAGNOSTICO_BEGIN_PILLARS;
const accentOf = (i: number) => `hsl(var(--pillar-${(i % 7) + 1}))`;

const ICONS: Record<string, LucideIcon> = {
  gestao: Compass,
  lideranca: Users,
  marketing: Megaphone,
  inovacao: Lightbulb,
  financeiro: Wallet,
  vendas: TrendingUp,
  processos: Settings2,
  pessoas: HeartHandshake,
};


const W = 1000;
const H = 340;
const TOP = 112;
const BOTTOM = 232;

/** 8 pilares + destino final */
const STOPS = PILLARS.length + 1;
const nodes = Array.from({ length: STOPS }, (_, i) => ({
  index: i,
  isGoal: i === PILLARS.length,
  pillar: PILLARS[i],
  x: 62 + (i * (W - 124)) / (STOPS - 1),
  y: i % 2 === 0 ? TOP : BOTTOM,
}));

const segment = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = (b.x - a.x) * 0.55;
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
};

interface Props {
  answers: Answers;
  onSelect: (index: number) => void;
  activeIndex?: number;
}

/** Trilha horizontal em caminho serpenteado, sem rolagem lateral. */
export const TrailPath = ({ answers, onSelect, activeIndex }: Props) => {
  const allDone = PILLARS.every((p) => isPillarComplete(p, answers));

  return (
    <div className="glass-card p-3 sm:p-4">
      <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full">
          {nodes.slice(0, -1).map((n, i) => {
            const next = nodes[i + 1];
            const done = isPillarComplete(PILLARS[i], answers);
            return (
              <motion.path
                key={`seg-${i}`}
                d={segment(n, next)}
                fill="none"
                stroke={accentOf(i)}
                strokeWidth={7}
                strokeLinecap="round"
                strokeDasharray="1 15"
                initial={{ opacity: 0.3 }}
                animate={{ opacity: done ? 1 : 0.35 }}
                transition={{ duration: 0.5 }}
              />
            );
          })}
        </svg>

        {/* nós do caminho */}
        {nodes.map((n) => {
          const done = n.isGoal ? allDone : isPillarComplete(n.pillar, answers);
          const active = !n.isGoal && activeIndex === n.index;
          const c = n.isGoal ? accentOf(PILLARS.length - 1) : accentOf(n.index);
          const Icon = n.isGoal ? Flag : ICONS[n.pillar.id] || Compass;
          const count = n.isGoal ? 0 : pillarAnsweredCount(n.pillar, answers);
          const below = n.y === TOP;
          return (
            <motion.button
              key={n.isGoal ? "goal" : n.pillar.id}
              onClick={() => !n.isGoal && onSelect(n.index)}
              whileHover={n.isGoal ? undefined : { scale: 1.06 }}
              whileTap={n.isGoal ? undefined : { scale: 0.96 }}
              className="absolute flex flex-col items-center"
              style={{
                left: `${(n.x / W) * 100}%`,
                top: `${(n.y / H) * 100}%`,
                translateX: "-50%",
                translateY: "-50%",
              }}
            >
              <span
                className="rounded-full p-1 sm:p-1.5 shadow-lg"
                style={{
                  background: "hsl(var(--card))",
                  boxShadow: active ? `0 0 0 3px ${c}` : undefined,
                }}
              >
                <span
                  className="h-7 w-7 sm:h-11 sm:w-11 rounded-full flex items-center justify-center"
                  style={{
                    background: done ? c : `color-mix(in srgb, ${c} 18%, transparent)`,
                    color: done ? "hsl(var(--background))" : c,
                    border: n.isGoal && !done ? `2px dashed ${c}` : undefined,
                  }}
                >
                  {done && !n.isGoal ? (
                    <Check className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                  ) : (
                    <Icon className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                  )}
                </span>
              </span>
              <span
                className={`absolute w-16 sm:w-28 text-center ${below ? "top-[38px] sm:top-[62px]" : "bottom-[38px] sm:bottom-[62px]"}`}
              >
                <span className="block text-[9px] sm:text-[11px] font-semibold text-foreground leading-tight">
                  {n.isGoal ? "Mapeamento concluído" : n.pillar.short}
                </span>
                {!n.isGoal && (
                  <span className="block text-[9px] sm:text-[10px] text-muted-foreground tabular-nums">
                    {count}/{n.pillar.questions.length}
                  </span>
                )}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
