import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact,
}: EmptyStateProps) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center rounded-ds-lg border border-dashed border-border bg-card",
        compact ? "px-4 py-8 gap-2" : "px-6 py-12 gap-3",
        className,
      )}
    >
      {Icon && <Icon className={cn("text-muted-foreground", compact ? "h-5 w-5" : "h-6 w-6")} aria-hidden />}
      <div className="space-y-1">
        <p className={cn("font-semibold text-foreground", compact ? "text-sm" : "text-[17px]")}>
          {title}
        </p>
        {description && (
          <p className={cn("text-muted-foreground max-w-sm leading-relaxed", compact ? "text-xs" : "text-sm")}>{description}</p>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
};
