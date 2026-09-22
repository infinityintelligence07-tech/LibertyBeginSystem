import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/UserAvatar";

/** Floating profile avatar (top-right) — opens the profile settings for the current role. */
export const ProfileBubble = ({ role }: { role: "liberty" | "mentor" | "admin" | "gestor" }) => {
  const { profile } = useAuth();
  if (!profile) return null;
  const to =
    role === "admin" || role === "gestor"
      ? "/admin/perfil"
      : role === "mentor"
        ? "/mentor/perfil"
        : "/perfil";

  return (
    <Link
      to={to}
      title="Meu perfil"
      aria-label="Abrir meu perfil"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
      className="fixed right-5 lg:right-8 z-40 rounded-full ring-2 ring-background hover:ring-primary/40 transition-all shadow-md"
    >
      <UserAvatar name={profile.full_name} avatarUrl={profile.avatar_url} size={40} />
    </Link>
  );
};
