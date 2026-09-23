import { cn } from "@/lib/utils";
import { bookingStatusConfig } from "@/lib/bookingStatus";
import { taskStatusConfig, type TaskStatus } from "@/lib/taskStatus";

type BookingStatusKey = keyof typeof bookingStatusConfig;

interface StatusBadgeProps {
  status: BookingStatusKey | TaskStatus | string;
  variant?: "booking" | "task";
  size?: "sm" | "md";
  withDot?: boolean;
  className?: string;
  label?: string;
  /** Texto de apoio exibido no hover (ex.: `PENDING_CONFIRMATION_HINT`). */
  title?: string;
}

const sizeClasses = {
  sm: "text-xs gap-1.5",
  md: "text-[13px] gap-2",
};

/** Deriva a cor do ponto a partir da classe `text-*` da configuração legada. */
const dotFromClasses = (classes: string) => {
  const text = classes.split(/\s+/).find((c) => c.startsWith("text-"));
  return text ? text.replace(/^text-/, "bg-") : "bg-muted-foreground";
};

export const StatusBadge = ({
  status,
  variant = "booking",
  size = "sm",
  withDot = true,
  className,
  label,
  title,
}: StatusBadgeProps) => {
  const humanize = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const fallback = { label: humanize(String(status)), classes: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" };
  const cfg =
    variant === "task"
      ? taskStatusConfig[status as TaskStatus] ?? fallback
      : bookingStatusConfig[status] ?? fallback;

  const dotClass = "dot" in cfg && typeof cfg.dot === "string" ? cfg.dot : dotFromClasses(cfg.classes);

  // HIG: status = ponto colorido + texto neutro. Sem pílula preenchida, sem borda.
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center font-medium whitespace-nowrap text-foreground/90",
        sizeClasses[size],
        className,
      )}
    >
      {withDot && <span className={cn("h-2 w-2 rounded-full shrink-0", dotClass)} aria-hidden />}
      {label ?? cfg.label}
    </span>
  );
};
