import { ReactNode, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  Home, Map, Calendar, BookOpen, Wrench, User, MessageCircle, BarChart3, GraduationCap, DollarSign,
  Settings, Clock, ClipboardList, ClipboardCheck, LogOut, CalendarDays, Users, Eye, CalendarClock, Trophy, MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { useViewAs, type ViewAs } from "@/contexts/ViewAsContext";
import { useDemoData } from "@/contexts/DemoDataContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { BottomSheet, ListRow, SectionCard } from "@/components/ds";
import { InstallAndNotify } from "@/components/InstallAndNotify";
import { InstallPromptBanner } from "@/components/InstallPromptBanner";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { PullToRefresh } from "@/components/PullToRefresh";
import { useBookingNotifications } from "@/hooks/useBookingNotifications";
import { OnboardingGateBanner } from "@/components/OnboardingGate";
import { ProfileMenu } from "@/components/ProfileBubble";
import { NotificationsBell } from "@/components/NotificationsBell";

type LayoutRole = "liberty" | "mentor" | "admin" | "gestor";

interface LayoutProps {
  children: ReactNode;
  role?: LayoutRole;
}

interface MenuItem {
  label: string;
  /** Rótulo curto para o bottom-nav (mobile). */
  short?: string;
  icon: LucideIcon;
  path: string;
}

const libertyMenu: MenuItem[] = [
  { label: "Início", icon: Home, path: "/dashboard" },
  { label: "Minha jornada", short: "Jornada", icon: Map, path: "/jornada" },
  { label: "Agenda", icon: Calendar, path: "/agenda" },
  { label: "Tarefas", icon: ClipboardCheck, path: "/tarefas" },
  { label: "Conteúdos", icon: BookOpen, path: "/conteudos" },
  { label: "Ferramentas", icon: Wrench, path: "/ferramentas" },
  { label: "Eventos", icon: CalendarDays, path: "/eventos" },
  { label: "Ranking", icon: Trophy, path: "/ranking" },
  { label: "Perfil", icon: User, path: "/perfil" },
  { label: "Suporte", icon: MessageCircle, path: "/suporte" },
];

const mentorMenu: MenuItem[] = [
  { label: "Início", icon: Home, path: "/mentor/dashboard" },
  { label: "Minha agenda", short: "Agenda", icon: Calendar, path: "/mentor/sessoes" },
  { label: "Membros", icon: Users, path: "/mentor/alunos" },
  { label: "Tarefas", icon: ClipboardCheck, path: "/mentor/tarefas" },
  { label: "Ferramentas", icon: Wrench, path: "/mentor/ferramentas" },
  { label: "Disponibilidade", icon: Clock, path: "/mentor/disponibilidade" },
  { label: "Perfil", icon: User, path: "/mentor/perfil" },
];

const adminMenu: MenuItem[] = [
  { label: "Dashboard", icon: BarChart3, path: "/admin/dashboard" },
  { label: "Membros", icon: Users, path: "/admin/membros" },
  { label: "Encerramentos", icon: CalendarClock, path: "/admin/encerramentos" },
  { label: "Mentores", icon: GraduationCap, path: "/admin/mentores" },
  { label: "Agenda geral", short: "Agenda", icon: Calendar, path: "/admin/agenda" },
  { label: "Sessões", icon: ClipboardList, path: "/admin/sessoes" },
  { label: "Ferramentas", icon: Wrench, path: "/admin/ferramentas" },
  { label: "Financeiro", icon: DollarSign, path: "/admin/financeiro" },
  { label: "Conteúdos", icon: BookOpen, path: "/admin/conteudos" },
  { label: "Eventos", icon: CalendarDays, path: "/admin/eventos" },
  { label: "NPS", icon: ClipboardCheck, path: "/admin/nps" },
  { label: "Configurações", icon: Settings, path: "/admin/configuracoes" },
];

/** Destinos que ficam na barra inferior (mobile). O restante vai para o menu "Mais". */
const mobilePrimaryPaths: Record<"liberty" | "mentor" | "admin", string[]> = {
  liberty: ["/dashboard", "/jornada", "/agenda", "/tarefas"],
  mentor: ["/mentor/dashboard", "/mentor/sessoes", "/mentor/alunos", "/mentor/tarefas"],
  admin: ["/admin/dashboard", "/admin/membros", "/admin/agenda", "/admin/financeiro"],
};

const areaTitle: Record<LayoutRole, string> = {
  liberty: "Área do membro",
  mentor: "Área do mentor",
  admin: "Administração",
  gestor: "Administração",
};

const MAX_BOTTOM_ITEMS = 5;

const isPathActive = (pathname: string, path: string) => pathname === path || pathname.startsWith(path + "/");

const sidebarLinkClass =
  "flex items-center gap-3 min-h-10 px-3 rounded-ds text-sm font-medium transition-colors duration-ds-1 ease-ds focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-sidebar";

const bottomLinkClass =
  "flex flex-col items-center justify-center gap-0.5 w-full min-h-11 px-1 py-1 rounded-ds text-[11px] font-medium leading-none transition-colors duration-ds-1 ease-ds focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Controles de contexto (super admin): visualizar como outro papel e dados fictícios. */
const ContextControls = ({ role, onSwitch }: { role: LayoutRole; onSwitch: (v: ViewAs) => void }) => {
  const { canSwitch } = useViewAs();
  const { demoEnabled, setDemoEnabled, canToggle: canToggleDemo } = useDemoData();
  if (!canSwitch && !canToggleDemo) return null;
  return (
    <div className="space-y-3">
      {canSwitch && (
        <div className="space-y-1.5">
          <p className="ds-kicker flex items-center gap-1.5">
            <Eye className="h-3 w-3" aria-hidden /> Visualizar como
          </p>
          <Select value={role === "gestor" ? "admin" : role} onValueChange={(v) => onSwitch(v as ViewAs)}>
            <SelectTrigger aria-label="Visualizar como" className="w-full h-10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Administrador</SelectItem>
              <SelectItem value="mentor">Mentor</SelectItem>
              <SelectItem value="liberty">Membro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {canToggleDemo && (
        <label className="flex items-center justify-between gap-3 min-h-10 px-1 cursor-pointer">
          <span className="ds-kicker flex items-center gap-1.5 min-w-0">
            <Eye className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">Dados fictícios</span>
          </span>
          <Switch checked={demoEnabled} onCheckedChange={setDemoEnabled} aria-label="Dados fictícios" />
        </label>
      )}
    </div>
  );
};

export const AppLayout = ({ children, role = "liberty" }: LayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const { setViewAs } = useViewAs();
  const [moreOpen, setMoreOpen] = useState(false);

  const menuKey: "liberty" | "mentor" | "admin" = role === "admin" || role === "gestor" ? "admin" : role;
  const menu = menuKey === "admin" ? adminMenu : menuKey === "mentor" ? mentorMenu : libertyMenu;

  useBookingNotifications();

  const isLiberty = role === "liberty" && profile?.member_tier === "liberty";
  const logoVariant = isLiberty ? "liberty" : "begin";

  // Bottom-nav: até 5 itens diretos; acima disso, 4 principais + "Mais".
  const needsMore = menu.length > MAX_BOTTOM_ITEMS;
  const primaryItems = needsMore
    ? mobilePrimaryPaths[menuKey].map((p) => menu.find((m) => m.path === p)).filter((m): m is MenuItem => Boolean(m))
    : menu;
  const moreItems = needsMore ? menu.filter((m) => !primaryItems.includes(m)) : [];
  const moreActive = moreItems.some((m) => isPathActive(location.pathname, m.path));

  const handleSwitchView = (v: ViewAs) => {
    setViewAs(v);
    if (v === "admin") navigate("/admin/dashboard");
    else if (v === "mentor") navigate("/mentor/dashboard");
    else navigate("/dashboard");
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const goTo = (path: string) => {
    setMoreOpen(false);
    navigate(path);
  };

  return (
    <div className={cn("flex min-h-[100dvh] w-full bg-background", isLiberty && "theme-liberty")}>
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex flex-col w-60 fixed inset-y-0 left-0 h-[100dvh] z-30 border-r border-border bg-sidebar">
        <div className="h-14 px-5 flex items-center border-b border-border shrink-0">
          <Logo size="sm" variant={logoVariant} />
        </div>
        <div className="px-3 pt-4 empty:hidden">
          <ContextControls role={role} onSwitch={handleSwitchView} />
        </div>
        <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {menu.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={sidebarLinkClass}
              activeClassName="bg-primary/15 text-foreground"
              inactiveClassName="text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border space-y-2 shrink-0">
          <InstallAndNotify />
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground" onClick={() => void handleSignOut()}>
            <LogOut aria-hidden />
            Sair
          </Button>
        </div>
      </aside>

      <main className="flex-1 lg:ml-60 min-w-0 flex flex-col">
        {/* Header fino: logo/título da área à esquerda, ações à direita */}
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 supports-[backdrop-filter]:bg-background/85 backdrop-blur pt-[env(safe-area-inset-top,0px)]">
          <div className="h-14 flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center min-w-0">
              <span className="lg:hidden inline-flex">
                <Logo size="sm" variant={logoVariant} />
              </span>
              <span className="hidden lg:inline text-sm font-medium text-muted-foreground truncate">{areaTitle[role]}</span>
            </div>
            <div className="flex items-center gap-1">
              <NotificationsBell />
              <ProfileMenu role={role} />
            </div>
          </div>
        </header>

        <InstallPromptBanner />
        <UpdatePrompt />

        <PullToRefresh>
          <div className="flex-1 py-6 lg:py-8 pb-[calc(env(safe-area-inset-bottom,0px)_+_5.5rem)] lg:pb-8">
            <OnboardingGateBanner />
            {children}
          </div>
        </PullToRefresh>
      </main>

      {/* Bottom-nav (mobile) */}
      <nav
        aria-label="Navegação principal"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-background/95 supports-[backdrop-filter]:bg-background/85 backdrop-blur pb-[env(safe-area-inset-bottom,0px)]"
      >
        <ul className="flex items-stretch justify-around px-1 py-1">
          {primaryItems.map((item) => (
            <li key={item.path} className="flex-1 min-w-0">
              <NavLink
                to={item.path}
                className={bottomLinkClass}
                activeClassName="text-primary"
                inactiveClassName="text-muted-foreground hover:text-foreground"
              >
                <item.icon className="h-5 w-5" aria-hidden />
                <span className="truncate max-w-full">{item.short ?? item.label}</span>
              </NavLink>
            </li>
          ))}
          {moreItems.length > 0 && (
            <li className="flex-1 min-w-0">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
                className={cn(bottomLinkClass, moreActive ? "text-primary" : "text-muted-foreground hover:text-foreground")}
              >
                <MoreHorizontal className="h-5 w-5" aria-hidden />
                <span>Mais</span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      <BottomSheet open={moreOpen} onOpenChange={setMoreOpen} title="Mais" size="sm">
        <div className="space-y-4">
          <SectionCard padding="none">
            {moreItems.map((item, i) => (
              <ListRow
                key={item.path}
                leading={<item.icon className="h-5 w-5 text-muted-foreground" aria-hidden />}
                title={item.label}
                onPress={() => goTo(item.path)}
                active={isPathActive(location.pathname, item.path)}
                last={i === moreItems.length - 1}
              />
            ))}
          </SectionCard>
          <ContextControls role={role} onSwitch={(v) => { setMoreOpen(false); handleSwitchView(v); }} />
          <InstallAndNotify />
        </div>
      </BottomSheet>
    </div>
  );
};
