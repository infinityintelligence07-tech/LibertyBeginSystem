import { forwardRef, useState } from "react";
import { ArrowLeft, Trophy } from "lucide-react";
import giftClosed from "@/assets/gift-closed.webp";
import giftOpen from "@/assets/gift-open.webp";
import { Button } from "@/components/ui/button";
import { SectionCard, StatusPill } from "@/components/ds";

interface Props {
  onBack: () => void;
}

/** Tela dedicada de recompensa ao final do diagnóstico. */
export const GiftReveal = forwardRef<HTMLDivElement, Props>(({ onBack }, ref) => {
  const [open, setOpen] = useState(false);

  return (
    <SectionCard ref={ref} as="section" tone="brand" padding="none" className="overflow-hidden">
      <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-12 text-center sm:py-16">
        <StatusPill tone="brand" withDot={false}>Recompensa</StatusPill>

        <h2 className="mt-5 text-[28px] font-bold leading-tight text-foreground md:text-[34px]">
          Agora você ganhou um presente
        </h2>
        <p className="mt-3 max-w-sm text-sm text-muted-foreground">
          {open ? "Aproveite, está garantido na sua jornada." : "Toque na caixa para descobrir."}
        </p>

        {/* caixa */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={open}
          aria-label="Abrir presente"
          className="relative mt-8 flex h-56 w-56 items-center justify-center rounded-full transition-transform duration-ds-2 ease-ds active:scale-[0.98] disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background sm:h-64 sm:w-64"
        >
          <span className="absolute h-40 w-40 rounded-full bg-primary/15 sm:h-52 sm:w-52" aria-hidden />
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
          <SectionCard className="mt-8 w-full text-center animate-fade-in">
            <div className="flex items-center justify-center gap-2 text-primary">
              <Trophy className="h-4 w-4" aria-hidden />
              <span className="ds-kicker text-primary">Presente liberado</span>
            </div>
            <p className="mt-4 text-[17px] font-bold leading-relaxed text-primary">
              O empresário de sucesso termina aquilo que começa.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Por isso, liberamos um presente que você vai ganhar ao final do programa.
              Continue, conclua cada etapa e ele estará te esperando.
            </p>
          </SectionCard>
        )}

        <Button variant="outline" className="mt-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar ao diagnóstico
        </Button>
      </div>
    </SectionCard>
  );
});

GiftReveal.displayName = "GiftReveal";
