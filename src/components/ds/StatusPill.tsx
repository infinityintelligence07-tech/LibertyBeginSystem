import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { bookingStatusConfig } from "@/lib/bookingStatus";
import { StatusBadge } from "@/components/StatusBadge";

export type PillTone = "neutral" | "info" | "success" | "warning" | "danger" | "brand" | "pending";

/** HIG: a cor fica no ponto; o texto permanece neutro. Sem fundo, sem borda. */
const toneDot: Record<PillTone, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-status-blue",
  success: "bg-status-green",
  warning: "bg-status-yellow",
  pending: "bg-status-orange",
  danger: "bg-destructive",
  brand: "bg-primary",
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
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium whitespace-nowrap",
        tone === "neutral" ? "text-muted-foreground" : "text-foreground/90",
        size === "sm" ? "text-xs gap-1.5" : "text-[13px] gap-2",
        className,
      )}
    >
      {withDot && <span className={cn("h-2 w-2 rounded-full shrink-0", toneDot[tone])} aria-hidden />}
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
      "inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--ds-radius-sm)] text-[13px] font-medium whitespace-nowrap select-none",
      "transition-colors duration-ds-1 ease-ds disabled:opacity-50 disabled:pointer-events-none",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
      // Segmento (HIG): ativo = preenchimento neutro do texto, inativo = só texto secundário.
      active
        ? "bg-foreground text-background"
        : "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
      className,
    )}
  >
    {children}
    {typeof count === "number" && (
      <span className={cn("tabular-nums text-xs", active ? "opacity-70" : "text-muted-foreground")}>{count}</span>
    )}
  </button>
);
