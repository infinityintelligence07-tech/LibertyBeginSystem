import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ds/SectionCard";

export { EmptyState } from "@/components/EmptyState";

interface LoadingStateProps {
  /** Quantidade de linhas/cartões fantasmas. */
  rows?: number;
  variant?: "list" | "cards" | "stats" | "page";
  className?: string;
}

/** Esqueletos padrão. Use SEMPRE em vez de renderizar zeros/cards vazios enquanto carrega. */
export const LoadingState = ({ rows = 3, variant = "list", className }: LoadingStateProps) => {
  if (variant === "stats") {
    return (
      <div className={cn("grid grid-cols-2 md:grid-cols-4 gap-3", className)} aria-busy="true" aria-live="polite">
        {Array.from({ length: rows }).map((_, i) => (
          <SectionCard key={i} padding="compact" className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-14" />
          </SectionCard>
        ))}
      </div>
    );
  }
  if (variant === "cards") {
    return (
      <div className={cn("space-y-3", className)} aria-busy="true" aria-live="polite">
        {Array.from({ length: rows }).map((_, i) => (
          <SectionCard key={i} className="space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </SectionCard>
        ))}
      </div>
    );
  }
  if (variant === "page") {
    return (
      <div className={cn("space-y-6", className)} aria-busy="true" aria-live="polite">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <LoadingState variant="stats" rows={4} />
        <LoadingState variant="cards" rows={2} />
      </div>
    );
  }
  return (
    <SectionCard padding="none" className={className} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn("flex items-center gap-3 px-4 py-3 min-h-[56px]", i < rows - 1 && "border-b border-border")}>
          <Skeleton className="h-10 w-10 rounded-[var(--ds-radius-md)]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </SectionCard>
  );
};

interface ErrorStateProps {
  title?: ReactNode;
  description?: ReactNode;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}

/** Erro de carregamento com ação de tentar de novo. Nunca deixe uma query falhar em silêncio. */
export const ErrorState = ({
  title = "Não foi possível carregar",
  description = "Verifique sua conexão e tente de novo. Se continuar, fale com a equipe Liberty.",
  onRetry,
  compact,
  className,
}: ErrorStateProps) => (
  <SectionCard tone="danger" padding={compact ? "compact" : "default"} className={cn("flex items-start gap-3", className)} role="alert">
    <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" aria-hidden />
    <div className="min-w-0 flex-1 space-y-1">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>}
      {onRetry && (
        <div className="pt-2">
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" />
            Tentar de novo
          </Button>
        </div>
      )}
    </div>
  </SectionCard>
);
