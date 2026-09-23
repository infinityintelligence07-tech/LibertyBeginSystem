import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Obrigatório: ícone sem texto precisa de nome para leitores de tela. */
  "aria-label": string;
  size?: "sm" | "md";
  variant?: "ghost" | "outline" | "primary";
}

/** Botão só com ícone. Alvo de toque 44px (md) ou 32px visual com hit-area 44 (sm). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, size = "md", variant = "ghost", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "relative inline-flex items-center justify-center rounded-full shrink-0 select-none",
        "transition-colors duration-ds-1 ease-ds disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
        size === "md" ? "h-10 w-10" : "h-8 w-8 hit-44",
        variant === "ghost" && "text-muted-foreground hover:text-foreground hover:bg-accent",
        variant === "outline" && "border border-border text-foreground hover:bg-accent",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
        className,
      )}
      {...props}
    />
  ),
);
IconButton.displayName = "IconButton";
