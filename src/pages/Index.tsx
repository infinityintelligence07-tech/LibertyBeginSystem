import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { PageContainer, SectionCard } from "@/components/ds";

/** Página inicial genérica (não está nas rotas atuais; `/` renderiza o Login). */
const Index = () => (
  <div className="min-h-[100dvh] bg-background flex items-center justify-center py-10">
    <PageContainer variant="narrow">
      <SectionCard className="max-w-md mx-auto text-center space-y-5">
        <Logo size="md" className="mx-auto" />
        <div className="space-y-2">
          <h1 className="text-[24px] md:text-[28px] font-semibold leading-[1.2] tracking-[var(--ds-tracking-display)] text-foreground">
            Liberty Begin
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">Desenvolvimento empresarial com propósito.</p>
        </div>
        <Button size="lg" asChild className="w-full">
          <Link to="/login">Acessar plataforma</Link>
        </Button>
      </SectionCard>
    </PageContainer>
  </div>
);

export default Index;
