import { Link } from "react-router-dom";
import { Lock, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Banner shown to liberty members that haven't completed their onboarding form yet.
 * They can navigate the platform but key actions stay disabled until completion.
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
    <Link
      to="/onboarding"
      className="block mb-4 rounded-xl border border-status-yellow/45 bg-status-yellow/10 px-4 py-3 hover:bg-status-yellow/15 transition-colors"
    >
      <div className="flex items-center gap-3">
        <Lock className="h-4 w-4 text-status-yellow shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">
            Complete seu formulário para desbloquear a plataforma
          </div>
          <div className="text-xs text-muted-foreground">
            Você ainda não consegue agendar sessões. Leva menos de 5 minutos.
          </div>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-status-yellow">
          Preencher <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
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
