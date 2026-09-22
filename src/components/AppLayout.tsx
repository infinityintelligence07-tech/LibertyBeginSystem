import { ReactNode } from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { useViewAs } from "@/contexts/ViewAsContext";
import { useDemoData } from "@/contexts/DemoDataContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { InstallAndNotify } from "@/components/InstallAndNotify";
import { InstallPromptBanner } from "@/components/InstallPromptBanner";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { PullToRefresh, forceAppReload } from "@/components/PullToRefresh";
import { useTheme } from "@/hooks/useTheme";
import { useBookingNotifications } from "@/hooks/useBookingNotifications";
import { OnboardingGateBanner } from "@/components/OnboardingGate";
import { ProfileBubble } from "@/components/ProfileBubble";
import { NotificationsBell } from "@/components/NotificationsBell";
import { ThemeToggleBubble } from "@/components/ThemeToggleBubble";
import { RefreshBubble } from "@/components/RefreshBubble";
import {
  Home, Map, Calendar, BookOpen, Wrench, Bell, User, MessageCircle,
  BarChart3, GraduationCap, DollarSign, Settings, Clock, ClipboardList, ClipboardCheck, LogOut, CalendarDays, Users, Upload, Eye, Sun, Moon, CalendarClock, Trophy
} from "lucide-react";

interface LayoutProps {
  children: ReactNode;
  role?: "liberty" | "mentor" | "admin" | "gestor";
}

const libertyMenu = [
  { label: "Início", icon: Home, path: "/dashboard" },
  { label: "Minha Jornada", icon: Map, path: "/jornada" },
  { label: "Agenda", icon: Calendar, path: "/agenda" },
  { label: "Tarefas", icon: ClipboardCheck, path: "/tarefas" },
  { label: "Conteúdos", icon: BookOpen, path: "/conteudos" },
  { label: "Ferramentas", icon: Wrench, path: "/ferramentas" },
  { label: "Eventos", icon: CalendarDays, path: "/eventos" },
  { label: "Ranking", icon: Trophy, path: "/ranking" },
  { label: "Perfil", icon: User, path: "/perfil" },
  { label: "Suporte", icon: MessageCircle, path: "/suporte" },
];

const mentorMenu = [
  { label: "Início", icon: Home, path: "/mentor/dashboard" },
  { label: "Minha Agenda", icon: Calendar, path: "/mentor/sessoes" },
  { label: "Membros", icon: Users, path: "/mentor/alunos" },
  { label: "Tarefas", icon: ClipboardCheck, path: "/mentor/tarefas" },
  { label: "Ferramentas", icon: Wrench, path: "/mentor/ferramentas" },
  { label: "Disponibilidade", icon: Clock, path: "/mentor/disponibilidade" },
  { label: "Perfil", icon: User, path: "/mentor/perfil" },
];

const adminMenu = [
  { label: "Dashboard", icon: BarChart3, path: "/admin/dashboard" },
  { label: "Membros", icon: Users, path: "/admin/membros" },
  { label: "Encerramentos", icon: CalendarClock, path: "/admin/encerramentos" },
  { label: "Mentores", icon: GraduationCap, path: "/admin/mentores" },
  { label: "Agenda Geral", icon: Calendar, path: "/admin/agenda" },
  { label: "Sessões", icon: ClipboardList, path: "/admin/sessoes" },
  { label: "Ferramentas", icon: Wrench, path: "/admin/ferramentas" },
  { label: "Financeiro", icon: DollarSign, path: "/admin/financeiro" },
  { label: "Conteúdos", icon: BookOpen, path: "/admin/conteudos" },
  { label: "Eventos", icon: CalendarDays, path: "/admin/eventos" },
  { label: "NPS", icon: ClipboardCheck, path: "/admin/nps" },
  { label: "Configurações", icon: Settings, path: "/admin/configuracoes" },
];

export const AppLayout = ({ children, role = "liberty" }: LayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile, roles } = useAuth();
  const { viewAs, setViewAs, canSwitch } = useViewAs();
  const { demoEnabled, setDemoEnabled, canToggle: canToggleDemo } = useDemoData();
  const { theme, toggleTheme } = useTheme();
  const menu = role === "admin" || role === "gestor" ? adminMenu : role === "mentor" ? mentorMenu : libertyMenu;

  useBookingNotifications();

  const isLiberty = role === "liberty" && profile?.member_tier === "liberty";
  const themeClass = isLiberty ? "theme-liberty" : "";
  const logoVariant = isLiberty ? "liberty" : "begin";

  // Bottom nav (mobile): apenas os 5 destinos primários — evita esmagar 10+ ícones no rodapé.
  const libertyMobile = [
    { label: "Início", icon: Home, path: "/dashboard" },
    { label: "Jornada", icon: Map, path: "/jornada" },
    { label: "Agenda", icon: Calendar, path: "/agenda" },
    { label: "Tarefas", icon: ClipboardCheck, path: "/tarefas" },
    { label: "Perfil", icon: User, path: "/perfil" },
  ];
  const mentorMobile = [
    { label: "Início", icon: Home, path: "/mentor/dashboard" },
    { label: "Agenda", icon: Calendar, path: "/mentor/sessoes" },
    { label: "Membros", icon: Users, path: "/mentor/alunos" },
    { label: "Tarefas", icon: ClipboardCheck, path: "/mentor/tarefas" },
    { label: "Perfil", icon: User, path: "/mentor/perfil" },
  ];
  const adminMobile = [
    { label: "Dashboard", icon: BarChart3, path: "/admin/dashboard" },
    { label: "Membros", icon: Users, path: "/admin/membros" },
    { label: "Agenda", icon: Calendar, path: "/admin/agenda" },
    { label: "Financeiro", icon: DollarSign, path: "/admin/financeiro" },
    { label: "Mais", icon: Settings, path: "/admin/configuracoes" },
  ];
  const mobileMenu =
    role === "admin" || role === "gestor" ? adminMobile : role === "mentor" ? mentorMobile : libertyMobile;

  const handleSwitchView = (v: "admin" | "mentor" | "liberty") => {
    setViewAs(v);
    if (v === "admin") navigate("/admin/dashboard");
    else if (v === "mentor") navigate("/mentor/dashboard");
    else navigate("/dashboard");
  };

  return (
    <div className={`flex min-h-screen w-full ${themeClass}`}>
      <aside className="hidden lg:flex flex-col w-60 border-r border-border bg-sidebar fixed h-screen z-30">
        <div className="px-6 py-5">
          <Logo size="sm" variant={logoVariant} />
        </div>
        {(canSwitch || canToggleDemo) && (
          <div className="px-4 pt-1 pb-4 space-y-3">
            {canSwitch && (
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  <Eye className="h-3 w-3" /> Visualizar como
                </div>
                <Select
                  value={role === "gestor" ? "admin" : role}
                  onValueChange={(v) => handleSwitchView(v as any)}
                >
                  <SelectTrigger className="w-full h-9 bg-transparent border-border text-xs text-foreground focus:ring-0 focus:ring-offset-0 focus:border-border hover:bg-background/40 transition-colors gap-2 [&>svg]:ml-2 [&>svg]:opacity-50">
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
              <div className="flex items-center justify-between gap-2 px-1 py-1">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider min-w-0">
                  <Eye className="h-3 w-3 shrink-0" />
                  <span className="truncate">Dados fictícios</span>
                </div>
                <Switch checked={demoEnabled} onCheckedChange={setDemoEnabled} />
              </div>
            )}
          </div>
        )}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {menu.map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors mb-0.5 ${
                  isActive
                    ? "bg-sidebar-accent text-primary border-l-2 border-primary/20 font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 space-y-3">
          <button
            onClick={toggleTheme}
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full rounded-lg hover:bg-sidebar-accent"
            aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
          >
            <span className="flex items-center gap-3">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span>{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
            </span>
          </button>
          <InstallAndNotify />
          <button onClick={async () => { await signOut(); navigate("/login"); }} className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full">
            <LogOut className="h-4 w-4" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 lg:ml-60 pb-24 lg:pb-0 min-w-0" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)" }}>
        {/* Top backdrop for mobile — prevents scrolled content from bleeding behind the floating bubbles */}
        <div
          className="lg:hidden fixed top-0 left-0 right-0 z-30 pointer-events-none bg-gradient-to-b from-background via-background/95 to-transparent"
          style={{ height: "calc(env(safe-area-inset-top, 0px) + 4rem)" }}
        />
        <ProfileBubble role={role} />
        <NotificationsBell />
        <ThemeToggleBubble />
        <RefreshBubble />
        <InstallPromptBanner />
        <UpdatePrompt />
        <PullToRefresh>
          <div
            className="w-full px-5 sm:px-8 lg:px-10 xl:px-12 py-6 lg:py-8 max-w-[1400px] mx-auto"
            style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 4.5rem)" }}
          >
            <OnboardingGateBanner />
            {children}
          </div>
        </PullToRefresh>
      </main>

      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 bg-sidebar border-t border-border z-30 flex justify-around px-1"
        style={{ paddingTop: "0.5rem", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.5rem)" }}
      >
        {mobileMenu.map((item) => {
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1 px-2 py-1 text-[10px] transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};
