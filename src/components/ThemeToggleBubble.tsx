import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

/** Floating theme toggle bubble — visible on mobile (hidden on lg where the sidebar has its own). */
export const ThemeToggleBubble = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
      title={isDark ? "Modo claro" : "Modo escuro"}
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
      className="lg:hidden fixed right-[8rem] z-40 h-10 w-10 rounded-full bg-card border border-border shadow-md flex items-center justify-center text-foreground hover:bg-muted hover:border-primary/40 transition-all"
    >
      {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
};
