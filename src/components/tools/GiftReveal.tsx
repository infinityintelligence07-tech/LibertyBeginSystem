import { forwardRef, useState } from "react";
import { ArrowLeft, Trophy } from "lucide-react";
import giftClosed from "@/assets/gift-closed.webp";
import giftOpen from "@/assets/gift-open.webp";

interface Props {
  onBack: () => void;
}

/** Tela dedicada de recompensa ao final do diagnóstico. */
export const GiftReveal = forwardRef<HTMLDivElement, Props>(({ onBack }, ref) => {
  const [open, setOpen] = useState(false);

  return (
    <div ref={ref} className="relative overflow-hidden rounded-3xl border border-border bg-background">
      {/* atmosfera (estática, sem custo de animação) */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 55% at 50% 30%, color-mix(in srgb, hsl(var(--primary)) 22%, transparent) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto flex max-w-xl flex-col items-center px-6 py-12 text-center sm:py-16">
        <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">
          Recompensa
        </span>

        <h2 className="mt-5 text-3xl font-bold leading-tight text-foreground sm:text-4xl">
          Agora você ganhou um presente
        </h2>
        <p className="mt-3 max-w-sm text-sm text-muted-foreground">
          {open ? "Aproveite, está garantido na sua jornada." : "Toque na caixa para descobrir."}
        </p>

        {/* caixa 3D */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={open}
          aria-label="Abrir presente"
          className="relative mt-8 flex h-56 w-56 items-center justify-center active:scale-[0.98] disabled:cursor-default sm:h-64 sm:w-64"
        >
          <span
            className="absolute h-40 w-40 rounded-full opacity-40 sm:h-52 sm:w-52"
            style={{
              background: "color-mix(in srgb, hsl(var(--primary)) 38%, transparent)",
            }}
          />
          <img
            src={open ? giftOpen : giftClosed}
            alt={open ? "Caixa de presente aberta" : "Caixa de presente fechada"}
            width={320}
            height={320}
            decoding="async"
            className="relative h-full w-full object-contain"
          />
          {/* pré-carrega a imagem aberta */}
          <img src={giftOpen} alt="" aria-hidden className="hidden" width={320} height={320} />
        </button>

        {open && (
          <div className="mt-8 w-full rounded-2xl border border-primary/30 bg-card/80 p-6 text-center animate-fade-in">
            <div className="flex items-center justify-center gap-2 text-primary">
              <Trophy className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Presente liberado</span>
            </div>
            <p className="mt-4 text-lg font-bold leading-relaxed text-primary">
              O empresário de sucesso termina aquilo que começa.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Por isso, liberamos um presente que você vai ganhar ao final do programa.
              Continue, conclua cada etapa e ele estará te esperando.
            </p>
          </div>
        )}

        <button
          onClick={onBack}
          className="btn-silver mt-8 inline-flex items-center justify-center gap-1.5 px-5 py-2.5 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao diagnóstico
        </button>
      </div>
    </div>
  );
});

GiftReveal.displayName = "GiftReveal";
