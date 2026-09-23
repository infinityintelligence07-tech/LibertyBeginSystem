import { forwardRef } from "react";
import { ArrowLeft, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard, StatusPill } from "@/components/ds";

interface Props {
  onBack: () => void;
}

/** Tela dedicada de recompensa ao final do diagnóstico: cartão neutro com título, texto e botão. */
export const GiftReveal = forwardRef<HTMLDivElement, Props>(({ onBack }, ref) => (
  <SectionCard ref={ref} as="section">
    <div className="mx-auto flex max-w-xl flex-col items-center px-2 py-6 text-center sm:py-10">
      <Gift className="h-6 w-6 text-muted-foreground" aria-hidden />
      <div className="mt-4">
        <StatusPill tone="neutral" withDot={false}>Recompensa</StatusPill>
      </div>

      <h2 className="mt-3 text-[24px] font-semibold leading-tight text-foreground md:text-[28px]">
        Você ganhou um presente
      </h2>
      <p className="mt-4 text-[17px] font-medium leading-relaxed text-foreground">
        O empresário de sucesso termina aquilo que começa.
      </p>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        Por isso, liberamos um presente que você recebe ao final do programa.
        Conclua cada etapa e ele estará disponível.
      </p>

      <Button variant="outline" className="mt-8" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar ao diagnóstico
      </Button>
    </div>
  </SectionCard>
));

GiftReveal.displayName = "GiftReveal";
