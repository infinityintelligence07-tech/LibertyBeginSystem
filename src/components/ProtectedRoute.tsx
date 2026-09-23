import { ReactNode, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/Logo";
import { SUPPORT_WHATSAPP_URL } from "@/lib/authErrors";
import { Button } from "@/components/ui/button";
import { PageContainer, SectionCard } from "@/components/ds";

type AppRole = "super_admin" | "admin" | "mentor" | "liberty";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: AppRole[];
}

const isAdminLike = (roles: AppRole[]) => roles.includes("admin") || roles.includes("super_admin");

const FullScreenSpinner = () => (
  <div className="min-h-[100dvh] bg-background flex items-center justify-center" role="status" aria-live="polite">
    <div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin" aria-hidden />
    <span className="sr-only">Carregando...</span>
  </div>
);

/**
 * Tela exibida quando o usuário está autenticado mas não tem nenhum papel de acesso
 * (ou quando os papéis não puderam ser carregados). Nunca redireciona, para evitar loop.
 */
const NoAccessScreen = ({ errorMessage }: { errorMessage: string | null }) => {
  const { signOut, reloadAccess, user } = useAuth();
  const [busy, setBusy] = useState<"retry" | "logout" | null>(null);

  const handleRetry = async () => {
    setBusy("retry");
    try {
      await reloadAccess();
    } finally {
      setBusy(null);
    }
  };

  const handleSignOut = async () => {
    setBusy("logout");
    try {
      await signOut();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center py-10">
      <PageContainer variant="narrow">
        <SectionCard className="max-w-md mx-auto text-center space-y-5">
          <Logo size="md" className="mx-auto" />
          <div className="space-y-2">
            <h1 className="text-[22px] font-semibold text-foreground">
              {errorMessage ? "Não foi possível carregar seu acesso" : "Conta sem perfil de acesso"}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {errorMessage ?? "Sua conta ainda não tem um perfil de acesso. Fale com a equipe Liberty."}
            </p>
            {user?.email && (
              <p className="text-xs text-muted-foreground">
                Conectado como <span className="text-foreground font-medium">{user.email}</span>
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2.5">
            {errorMessage && (
              <Button type="button" size="lg" onClick={handleRetry} disabled={busy !== null} className="w-full">
                {busy === "retry" ? "Tentando..." : "Tentar novamente"}
              </Button>
            )}
            <Button variant="outline" size="lg" asChild className="w-full">
              <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                Falar com a equipe Liberty no WhatsApp
              </a>
            </Button>
            <Button type="button" variant="ghost" onClick={handleSignOut} disabled={busy !== null} className="w-full text-muted-foreground">
              {busy === "logout" ? "Saindo..." : "Sair"}
            </Button>
          </div>
        </SectionCard>
      </PageContainer>
    </div>
  );
};

export const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, loading, roles, profile, rolesLoaded, rolesError } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullScreenSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Aguarda perfil/papéis antes de decidir: evita flash de conteúdo errado
  // e decisões de acesso com `roles = []` ainda carregando.
  if (!rolesLoaded) {
    return <FullScreenSpinner />;
  }

  // Autenticado, mas sem nenhum papel (auto-cadastro antigo, merge de perfis, roles apagados)
  // ou falha ao carregar os papéis: tela tratada com "Sair", sem redirecionar em loop.
  if (roles.length === 0) {
    return <NoAccessScreen errorMessage={rolesError} />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const hasAccess = allowedRoles.some((r) => {
      if (roles.includes(r)) return true;
      if (r === "admin" && roles.includes("super_admin")) return true;
      if ((r === "mentor" || r === "liberty") && roles.includes("super_admin")) return true;
      return false;
    });
    if (!hasAccess) {
      if (isAdminLike(roles)) return <Navigate to="/admin/dashboard" replace />;
      if (roles.includes("mentor")) return <Navigate to="/mentor/dashboard" replace />;
      return <Navigate to="/dashboard" replace />;
    }
  }

  // Hard onboarding gate: liberty members can ONLY access /onboarding until completed.
  const isLibertyOnly =
    roles.includes("liberty") && !roles.includes("admin") && !roles.includes("super_admin") && !roles.includes("mentor");
  if (
    isLibertyOnly &&
    profile &&
    profile.onboarding_completed === false &&
    !location.pathname.startsWith("/onboarding")
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};
