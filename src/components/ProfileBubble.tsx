import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Moon, RefreshCw, Sun, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { reloadAppSafely } from "@/lib/appReload";
import { UserAvatar } from "@/components/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type MenuRole = "liberty" | "mentor" | "admin" | "gestor";

const profilePathFor = (role: MenuRole) =>
  role === "admin" || role === "gestor" ? "/admin/perfil" : role === "mentor" ? "/mentor/perfil" : "/perfil";

/**
 * Avatar do header com menu da conta: perfil, tema, atualizar app e sair.
 * Substitui as antigas bolhas flutuantes de perfil, tema e refresh.
 */
export const ProfileMenu = ({ role }: { role: MenuRole }) => {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);

  if (!profile) return null;

  const handleRefresh = async () => {
    setRefreshing(true);
    const reloaded = await reloadAppSafely();
    if (!reloaded) setRefreshing(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Abrir menu da conta"
        className="hit-44 inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
      >
        <UserAvatar name={profile.full_name} avatarUrl={profile.avatar_url} size={32} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-semibold text-foreground truncate">{profile.full_name}</p>
          {profile.email && <p className="text-xs text-muted-foreground truncate">{profile.email}</p>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-10 gap-2.5" onSelect={() => navigate(profilePathFor(role))}>
          <User className="h-4 w-4 text-muted-foreground" aria-hidden />
          Meu perfil
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-10 gap-2.5" onSelect={(e) => { e.preventDefault(); toggleTheme(); }}>
          {theme === "dark" ? <Sun className="h-4 w-4 text-muted-foreground" aria-hidden /> : <Moon className="h-4 w-4 text-muted-foreground" aria-hidden />}
          {theme === "dark" ? "Modo claro" : "Modo escuro"}
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-10 gap-2.5" disabled={refreshing} onSelect={(e) => { e.preventDefault(); void handleRefresh(); }}>
          <RefreshCw className="h-4 w-4 text-muted-foreground" aria-hidden />
          {refreshing ? "Atualizando..." : "Atualizar app"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-10 gap-2.5 text-destructive focus:text-destructive" onSelect={() => void handleSignOut()}>
          <LogOut className="h-4 w-4" aria-hidden />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
