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
}

const sizeClasses = {
  sm: "text-[10px] px-2 py-0.5 gap-1.5",
  md: "text-xs px-2.5 py-1 gap-1.5",
};

export const StatusBadge = ({
  status,
  variant = "booking",
  size = "sm",
  withDot = true,
  className,
  label,
}: StatusBadgeProps) => {
  const humanize = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const fallback = { label: humanize(String(status)), classes: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" };
  const cfg =
    variant === "task"
      ? taskStatusConfig[status as TaskStatus] ?? fallback
      : bookingStatusConfig[status] ?? fallback;

  const dotClass = "dot" in cfg ? (cfg as any).dot : "bg-current";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium tracking-tight whitespace-nowrap",
        sizeClasses[size],
        cfg.classes,
        className,
      )}
    >
      {withDot && <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />}
      {label ?? cfg.label}
    </span>
  );
};
