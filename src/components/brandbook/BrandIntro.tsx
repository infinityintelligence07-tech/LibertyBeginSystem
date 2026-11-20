import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Compass,
  Heart,
  Megaphone,
  MessagesSquare,
  Target,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BOARD_ORDER, SECTION_TITLES } from "@/lib/brandBook";

interface Props {
  open: boolean;
  onClose: () => void;
}

const ease = [0.22, 1, 0.36, 1] as const;

const Reveal = ({ delay = 0, children, className, y = 24 }: { delay?: number; children: ReactNode; className?: string; y?: number }) => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease }}
    >
      {children}
    </motion.div>
  );
};

const Eyebrow = ({ children }: { children: ReactNode }) => (
  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">{children}</p>
);

const SlideMarketing = () => (
  <div className="mx-auto w-full max-w-5xl space-y-6 sm:space-y-8">
    <Reveal>
      <Eyebrow>Antes de começar</Eyebrow>
    </Reveal>
    <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
      <Reveal delay={0.25} className="rounded-ds-xl border border-border bg-card p-6 sm:p-8">
        <Megaphone className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Marketing</p>
        <p className="mt-2 text-2xl font-semibold leading-snug text-foreground sm:text-4xl">
          é aquilo que a sua empresa <span className="text-primary underline decoration-primary/30 decoration-[3px] underline-offset-[6px]">fala</span> para as pessoas.
        </p>
      </Reveal>
      <Reveal delay={1.1} className="rounded-ds-xl border-2 border-primary bg-card p-6 sm:p-8">
        <MessagesSquare className="h-8 w-8 text-primary" aria-hidden />
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-primary">Branding</p>
        <p className="mt-2 text-2xl font-semibold leading-snug text-foreground sm:text-4xl">
          é aquilo que as pessoas <span className="text-primary underline decoration-primary/30 decoration-[3px] underline-offset-[6px]">falam</span> sobre a sua empresa.
        </p>
      </Reveal>
    </div>
    <Reveal delay={2} className="text-lg text-muted-foreground sm:text-xl">
      Você controla o que diz. O branding cuida do que fica na cabeça de quem ouve.
    </Reveal>
  </div>
);

const SlidePercepcao = () => (
  <div className="mx-auto w-full max-w-5xl space-y-6 sm:space-y-8">
    <Reveal>
      <Eyebrow>O que é branding</Eyebrow>
    </Reveal>
    <Reveal delay={0.2}>
      <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl">
        Branding é a ferramenta para <span className="text-primary underline decoration-primary/30 decoration-[3px] underline-offset-[6px]">moldar a percepção</span> das pessoas sobre a sua marca.
      </h2>
    </Reveal>
    <Reveal delay={0.8}>
      <p className="text-lg font-medium text-muted-foreground">Duas padarias na mesma rua. O mesmo pão francês.</p>
    </Reveal>
    <div className="grid gap-4 md:grid-cols-2">
      <Reveal delay={1.2} className="rounded-ds-xl border border-border bg-card p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Padaria A</p>
        <p className="mt-3 text-xl leading-snug text-foreground">Você pega o pão, paga e vai embora. Ninguém lembra de você.</p>
      </Reveal>
      <Reveal delay={1.7} className="rounded-ds-xl border-2 border-primary bg-card p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Padaria B</p>
        <p className="mt-3 text-xl leading-snug text-foreground">
          Te chamam pelo nome, o cheiro de pão saindo do forno chega na calçada e o embrulho vem caprichado.
        </p>
      </Reveal>
    </div>
    <Reveal delay={2.4}>
      <p className="text-xl font-semibold text-foreground sm:text-2xl">
        O pão é igual. A percepção não. <span className="text-primary underline decoration-primary/30 decoration-[3px] underline-offset-[6px]">Na B tem fila, e o pão custa mais.</span>
      </p>
    </Reveal>
  </div>
);

const IMPACTS = [
  { icon: TrendingUp, title: "Cobra mais", text: "Valor percebido maior sustenta um preço maior, sem guerra de desconto." },
  { icon: Brain, title: "É lembrada primeiro", text: "Quando a necessidade aparece, o nome que vem à cabeça é o seu." },
  { icon: Heart, title: "Fideliza e gera indicação", text: "Cliente que se identifica volta e traz outros." },
  { icon: Zap, title: "Vende com menos esforço", text: "A confiança chega antes da conversa e encurta a decisão." },
  { icon: Target, title: "Atrai o cliente certo", text: "Quem combina com a marca se aproxima. Quem não combina se afasta." },
  { icon: Compass, title: "Alinha o time", text: "Todo mundo sabe como a marca fala, age e atende." },
];

const SlideImpactos = () => (
  <div className="mx-auto w-full max-w-5xl space-y-6 sm:space-y-8">
    <Reveal>
      <Eyebrow>Por que importa</Eyebrow>
    </Reveal>
    <Reveal delay={0.15}>
      <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl">O impacto do branding</h2>
      <p className="mt-3 text-lg text-muted-foreground">Na sua marca, empresa, projeto ou serviço.</p>
    </Reveal>
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
      {IMPACTS.map((it, i) => (
        <Reveal key={it.title} delay={0.5 + i * 0.18} className="rounded-ds-xl border border-border bg-card p-5">
          <span className="grid h-11 w-11 place-items-center rounded-ds-lg bg-primary/10 text-primary">
            <it.icon className="h-5 w-5" aria-hidden />
          </span>
          <p className="mt-4 text-lg font-semibold text-foreground">{it.title}</p>
          <p className="mt-1 text-[15px] leading-snug text-muted-foreground">{it.text}</p>
        </Reveal>
      ))}
    </div>
  </div>
);

const SlideJornada = ({ onStart }: { onStart: () => void }) => (
  <div className="mx-auto w-full max-w-5xl space-y-6 sm:space-y-8">
    <Reveal>
      <Eyebrow>Hoje</Eyebrow>
    </Reveal>
    <Reveal delay={0.15}>
      <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl">Vamos construir a sua marca, passo a passo.</h2>
    </Reveal>
    <ol className="grid gap-2 sm:grid-cols-2">
      {BOARD_ORDER.map((k, i) => (
        <Reveal key={k} delay={0.45 + i * 0.09} y={12}>
          <li className="flex items-center gap-3 rounded-ds-lg border border-border bg-card px-4 py-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground tabular-nums">
              {i + 1}
            </span>
            <span className="text-base font-medium text-foreground">{SECTION_TITLES[k]}</span>
          </li>
        </Reveal>
      ))}
    </ol>
    <Reveal delay={1.5}>
      <button
        type="button"
        onClick={onStart}
        className="inline-flex h-12 items-center gap-2 rounded-ds-lg bg-primary px-6 text-base font-semibold text-primary-foreground hover:bg-primary/90"
      >
        Começar o quadro <ArrowRight className="h-4 w-4" />
      </button>
    </Reveal>
  </div>
);

export const BrandIntro = ({ open, onClose }: Props) => {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const reduce = useReducedMotion();
  const total = 4;

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= total) return;
      setDir(next > index ? 1 : -1);
      setIndex(next);
    },
    [index],
  );

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        if (index === total - 1) onClose();
        else go(index + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(index - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, go, onClose]);

  const slides = [<SlideMarketing key="m" />, <SlidePercepcao key="p" />, <SlideImpactos key="i" />, <SlideJornada key="j" onStart={onClose} />];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex flex-col bg-background"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          role="dialog"
          aria-modal="true"
          aria-label="O que é branding"
          style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-center gap-3 px-4 pt-4 sm:px-8 sm:pt-6">
            <div className="flex flex-1 gap-1.5" aria-hidden>
              {Array.from({ length: total }).map((_, i) => (
                <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <motion.span
                    className="block h-full bg-primary"
                    initial={false}
                    animate={{ width: i <= index ? "100%" : "0%" }}
                    transition={{ duration: 0.5, ease }}
                  />
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-11 w-11 place-items-center rounded-full border border-border text-foreground hover:bg-muted"
              aria-label="Fechar apresentação"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="relative flex flex-1 items-center overflow-y-auto px-5 py-8 sm:px-10">
            <AnimatePresence mode="wait" custom={dir}>
              <motion.div
                key={index}
                className="w-full"
                custom={dir}
                initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -60 }}
                transition={{ duration: 0.35, ease }}
              >
                {slides[index]}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-between gap-3 px-4 pb-5 sm:px-8 sm:pb-8">
            <button
              type="button"
              onClick={() => go(index - 1)}
              disabled={index === 0}
              className="inline-flex h-11 items-center gap-2 rounded-ds-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-30"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            <span className="text-sm tabular-nums text-muted-foreground">
              {index + 1} de {total}
            </span>
            <button
              type="button"
              onClick={() => (index === total - 1 ? onClose() : go(index + 1))}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-ds-lg px-4 text-sm font-semibold",
                "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {index === total - 1 ? "Ir para o quadro" : "Avançar"} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
