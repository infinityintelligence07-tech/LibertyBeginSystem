import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatProps {
  label: ReactNode;
  value: ReactNode;
  /** Base do número, ex.: "de 12" ou "9 em 35". Taxa sempre com base. */
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "pending" | "danger" | "info" | "brand";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const toneText: Record<NonNullable<StatProps["tone"]>, string> = {
  default: "text-foreground",
  success: "text-status-green",
  warning: "text-status-yellow",
  pending: "text-status-orange",
  danger: "text-destructive",
  info: "text-status-blue",
  brand: "text-primary",
};

/** KPI: rótulo em cima, número tabular embaixo, base ao lado. Um cartão = um número. */
export const Stat = ({ label, value, hint, icon: Icon, tone = "default", size = "md", className }: StatProps) => (
  <div className={cn("min-w-0", className)}>
    <div className="flex items-center gap-1.5 text-muted-foreground">
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span className="text-xs font-medium truncate">{label}</span>
    </div>
    <div className="flex items-baseline gap-1.5 mt-1">
      <span
        className={cn(
          "font-bold tabular-nums leading-none tracking-[var(--ds-tracking-title)]",
          size === "sm" ? "text-lg" : size === "lg" ? "text-[34px]" : "text-2xl",
          toneText[tone],
        )}
        data-numeric
      >
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  </div>
);

interface ProgressBarProps {
  value: number;
  max?: number;
  tone?: "brand" | "success" | "warning" | "pending" | "info";
  /** Altura 8px por padrão. */
  className?: string;
  label?: string;
}

const barTone: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  brand: "bg-primary",
  success: "bg-status-green",
  warning: "bg-status-yellow",
  pending: "bg-status-orange",
  info: "bg-status-blue",
};

/** Barra de progresso sólida (sem gradiente), 8px, acessível. */
export const ProgressBar = ({ value, max = 100, tone = "brand", className, label }: ProgressBarProps) => {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn("h-2 w-full rounded-full bg-muted overflow-hidden", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-ds-3 ease-ds-out", barTone[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};
