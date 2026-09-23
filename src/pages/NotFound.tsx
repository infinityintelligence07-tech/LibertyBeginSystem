import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { PageContainer, SectionCard } from "@/components/ds";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center py-10">
      <PageContainer variant="narrow">
        <SectionCard className="max-w-md mx-auto text-center space-y-5">
          <Logo size="md" className="mx-auto" />
          <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <Compass className="h-6 w-6 text-muted-foreground" aria-hidden />
          </div>
          <div className="space-y-2">
            <p className="ds-kicker">Erro 404</p>
            <h1 className="text-[24px] md:text-[28px] font-semibold leading-[1.2] tracking-[var(--ds-tracking-display)] text-foreground">
              Página não encontrada
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              O endereço que você tentou abrir não existe ou foi movido.
            </p>
          </div>
          <Button size="lg" asChild className="w-full">
            <Link to="/">Voltar ao início</Link>
          </Button>
        </SectionCard>
      </PageContainer>
    </div>
  );
};

export default NotFound;
