import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Callout, PageContainer } from "@/components/ds";

/**
 * Aviso para membros liberty que ainda não concluíram o formulário de entrada.
 * Renderizado pelo AppLayout acima do conteúdo da página; vive em um PageContainer
 * próprio para alinhar com a largura padrão das páginas.
 */
export const OnboardingGateBanner = () => {
  const { profile, roles } = useAuth();
  const isLiberty =
    roles.includes("liberty") &&
    !roles.includes("admin") &&
    !roles.includes("super_admin") &&
    !roles.includes("mentor");
  if (!isLiberty) return null;
  if (!profile || profile.onboarding_completed !== false) return null;

  return (
    <PageContainer className="mb-6">
      <Callout
        tone="warning"
        icon={Lock}
        title="Complete seu formulário para desbloquear a plataforma"
        action={
          <Button size="sm" asChild>
            <Link to="/onboarding">Preencher formulário</Link>
          </Button>
        }
      >
        Você ainda não consegue agendar sessões. Leva menos de 5 minutos.
      </Callout>
    </PageContainer>
  );
};

/**
 * Hook returning whether the current liberty user is locked out of write actions.
 */
export const useOnboardingLocked = (): boolean => {
  const { profile, roles } = useAuth();
  const isLiberty =
    roles.includes("liberty") &&
    !roles.includes("admin") &&
    !roles.includes("super_admin") &&
    !roles.includes("mentor");
  if (!isLiberty) return false;
  return !!profile && profile.onboarding_completed === false;
};
