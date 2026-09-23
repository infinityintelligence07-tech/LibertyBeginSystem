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
  sm: "text-[11px] px-2 h-[22px] gap-1.5",
  md: "text-xs px-2.5 h-6 gap-1.5",
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

  const dotClass = "dot" in cfg && typeof cfg.dot === "string" ? cfg.dot : "bg-current";

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-full border font-medium tracking-tight whitespace-nowrap",
        sizeClasses[size],
        cfg.classes,
        className,
      )}
    >
      {withDot && <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotClass)} aria-hidden />}
      {label ?? cfg.label}
    </span>
  );
};
