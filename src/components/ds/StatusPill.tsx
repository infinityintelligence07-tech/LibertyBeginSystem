import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { bookingStatusConfig } from "@/lib/bookingStatus";
import { StatusBadge } from "@/components/StatusBadge";

export type PillTone = "neutral" | "info" | "success" | "warning" | "danger" | "brand" | "pending";

const toneClasses: Record<PillTone, { classes: string; dot: string }> = {
  neutral: { classes: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
  info: { classes: "bg-status-blue/10 text-status-blue border-status-blue/25", dot: "bg-status-blue" },
  success: { classes: "bg-status-green/10 text-status-green border-status-green/25", dot: "bg-status-green" },
  warning: { classes: "bg-status-yellow/10 text-status-yellow border-status-yellow/30", dot: "bg-status-yellow" },
  pending: { classes: "bg-status-orange/10 text-status-orange border-status-orange/30", dot: "bg-status-orange" },
  danger: { classes: "bg-destructive/10 text-destructive border-destructive/25", dot: "bg-destructive" },
  brand: { classes: "bg-primary/10 text-primary border-primary/25", dot: "bg-primary" },
};

interface StatusPillProps {
  /** Status de agendamento (usa `bookingStatusConfig`) OU um texto livre com `tone`. */
  status?: keyof typeof bookingStatusConfig | string;
  tone?: PillTone;
  children?: ReactNode;
  size?: "sm" | "md";
  withDot?: boolean;
  className?: string;
}

/**
 * Pill de status. Caixa normal, sem caps. Para status de sessão passe `status`;
 * para rótulos livres ("3 pendentes", "Liberty") passe `tone` + children.
 */
export const StatusPill = ({ status, tone = "neutral", children, size = "sm", withDot = true, className }: StatusPillProps) => {
  if (status && bookingStatusConfig[status]) {
    return <StatusBadge status={status} size={size} withDot={withDot} className={className} label={children as string | undefined} />;
  }
  const cfg = toneClasses[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium whitespace-nowrap",
        size === "sm" ? "text-[11px] px-2 h-[22px] gap-1.5" : "text-xs px-2.5 h-6 gap-1.5",
        cfg.classes,
        className,
      )}
    >
      {withDot && <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", cfg.dot)} />}
      {children ?? status}
    </span>
  );
};

interface ChipProps {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  count?: number;
  className?: string;
  disabled?: boolean;
}

/** Filtro em forma de chip (segmento). Alvo de toque 44px via `hit-44` invisível. */
export const Chip = ({ active, onClick, children, count, className, disabled }: ChipProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-pressed={active}
    className={cn(
      "inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[13px] font-medium whitespace-nowrap select-none",
      "transition-colors duration-ds-1 ease-ds disabled:opacity-50 disabled:pointer-events-none",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-transparent text-muted-foreground border-border hover:bg-accent hover:text-foreground",
      className,
    )}
  >
    {children}
    {typeof count === "number" && (
      <span className={cn("tabular-nums text-[11px]", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>
    )}
  </button>
);
