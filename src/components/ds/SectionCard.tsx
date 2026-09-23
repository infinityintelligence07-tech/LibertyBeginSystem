import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type CardTone = "default" | "info" | "success" | "warning" | "danger" | "brand";

interface SectionCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Reage ao hover/foco (borda mais forte). Só para cards clicáveis. */
  interactive?: boolean;
  tone?: CardTone;
  padding?: "none" | "compact" | "default";
  /** Renderiza como `button`/`a` etc. quando o card inteiro é a ação. */
  as?: "div" | "section" | "article" | "button";
}

const toneClasses: Record<CardTone, string> = {
  default: "",
  info: "bg-status-blue/5 border-status-blue/20",
  success: "bg-status-green/5 border-status-green/20",
  warning: "bg-status-yellow/5 border-status-yellow/25",
  danger: "bg-destructive/5 border-destructive/25",
  brand: "bg-primary/5 border-primary/20",
};

const paddings = {
  none: "",
  compact: "p-3 sm:p-4",
  default: "p-4 sm:p-6",
};

/**
 * Um cartão, uma resposta. Superfície `card`, borda sutil, raio 14px, sombra 1.
 * Sem hover por padrão (não levita). Substitui `glass-card`, `<Card>` e divs `bg-card` soltas.
 */
export const SectionCard = forwardRef<HTMLDivElement, SectionCardProps>(
  ({ interactive, tone = "default", padding = "default", as = "div", className, ...props }, ref) => {
    const Tag = as as "div";
    return (
      <Tag
        ref={ref}
        className={cn(
          "glass-card text-left",
          interactive && "is-interactive cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
          as === "button" && "w-full",
          toneClasses[tone],
          paddings[padding],
          className,
        )}
        {...(as === "button" ? { type: "button" } : {})}
        {...props}
      />
    );
  },
);
SectionCard.displayName = "SectionCard";

interface CalloutProps {
  tone?: Exclude<CardTone, "default">;
  icon?: LucideIcon;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

const calloutIconColor: Record<Exclude<CardTone, "default">, string> = {
  info: "text-status-blue",
  success: "text-status-green",
  warning: "text-status-yellow",
  danger: "text-destructive",
  brand: "text-primary",
};

/** Aviso contextual dentro da página (substitui banners com glow/gradiente). */
export const Callout = ({ tone = "info", icon: Icon, title, children, action, className }: CalloutProps) => (
  <SectionCard tone={tone} padding="compact" className={cn("flex items-start gap-3", className)}>
    {Icon && <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", calloutIconColor[tone])} aria-hidden />}
    <div className="min-w-0 flex-1 space-y-1">
      {title && <p className="text-sm font-semibold text-foreground">{title}</p>}
      {children && <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  </SectionCard>
);
