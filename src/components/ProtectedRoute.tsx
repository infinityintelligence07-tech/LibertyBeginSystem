import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

type AppRole = "super_admin" | "admin" | "mentor" | "liberty";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: AppRole[];
}

const isAdminLike = (roles: AppRole[]) => roles.includes("admin") || roles.includes("super_admin");

export const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, loading, roles, profile } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/20 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const hasAccess = allowedRoles.some((r) => {
      if (roles.includes(r as AppRole)) return true;
      if (r === "admin" && roles.includes("super_admin")) return true;
      if ((r === "mentor" || r === "liberty") && roles.includes("super_admin")) return true;
      return false;
    });
    if (!hasAccess && roles.length > 0) {
      if (isAdminLike(roles as AppRole[])) return <Navigate to="/admin/dashboard" replace />;
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
