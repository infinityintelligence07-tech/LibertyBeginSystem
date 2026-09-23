import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type PageContainerVariant = "default" | "narrow" | "wide";

interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  /** `default` 1120px (dashboards e listas) · `narrow` 672px (formulários e leitura) · `wide` 1400px (agenda/admin denso) */
  variant?: PageContainerVariant;
}

const widths: Record<PageContainerVariant, string> = {
  default: "max-w-[1120px]",
  narrow: "max-w-2xl",
  wide: "max-w-[1400px]",
};

/** Largura e respiro únicos para toda página. Evita que a largura de leitura mude ao navegar entre telas. */
export const PageContainer = forwardRef<HTMLDivElement, PageContainerProps>(
  ({ variant = "default", className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("w-full mx-auto px-4 sm:px-6 lg:px-8 space-y-6 lg:space-y-8", widths[variant], className)}
      {...props}
    />
  ),
);
PageContainer.displayName = "PageContainer";
