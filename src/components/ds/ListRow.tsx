import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ListRowProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Ícone, avatar ou `DateBlock` (40×40). */
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** StatusPill, botão pequeno ou texto à direita. */
  trailing?: ReactNode;
  /** Mostra chevron e comportamento de botão. */
  onPress?: () => void;
  href?: string;
  chevron?: boolean;
  /** Linha selecionada/destacada. */
  active?: boolean;
  /** Sem borda inferior (última da lista). */
  last?: boolean;
}

/**
 * Linha de lista (56px mínimo). Substitui cards aninhados em listas: sessões da jornada,
 * itens da agenda, alunos do mentor, slots do overview. Use dentro de `SectionCard padding="none"`
 * ou de uma `<ul>` com `divide-y`.
 */
export const ListRow = forwardRef<HTMLElement, ListRowProps>(
  ({ leading, title, subtitle, trailing, onPress, href, chevron, active, last, className, ...props }, ref) => {
    const interactive = Boolean(onPress || href);
    const Tag = (href ? "a" : interactive ? "button" : "div") as "div";
    return (
      <Tag
        ref={ref as never}
        {...(href ? { href } : {})}
        {...(interactive && !href ? { type: "button", onClick: onPress } : {})}
        {...(href && onPress ? { onClick: onPress } : {})}
        className={cn(
          "w-full min-h-[56px] px-4 py-3 flex items-center gap-3 text-left",
          !last && "border-b border-border",
          interactive && "transition-colors duration-ds-1 ease-ds hover:bg-accent/60 focus-visible:outline-none focus-visible:bg-accent/60",
          active && "bg-primary/5",
          className,
        )}
        {...props}
      >
        {leading && <div className="shrink-0 flex items-center justify-center">{leading}</div>}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground leading-snug truncate">{title}</div>
          {subtitle && <div className="text-xs text-muted-foreground mt-0.5 leading-snug truncate">{subtitle}</div>}
        </div>
        {trailing && <div className="shrink-0 flex items-center gap-2">{trailing}</div>}
        {(chevron ?? interactive) && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />}
      </Tag>
    );
  },
);
ListRow.displayName = "ListRow";

interface DateBlockProps {
  /** `YYYY-MM-DD` */
  date: string;
  className?: string;
  tone?: "default" | "brand" | "muted";
}

const monthShort = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Bloco de data 40×40 (dia grande + mês) para o `leading` do `ListRow`. */
export const DateBlock = ({ date, className, tone = "default" }: DateBlockProps) => {
  const [, m, d] = date.slice(0, 10).split("-").map(Number);
  return (
    <div
      className={cn(
        "h-10 w-10 flex flex-col items-center justify-center leading-none",
        tone === "brand" ? "text-primary" : tone === "muted" ? "text-muted-foreground" : "text-foreground",
        className,
      )}
    >
      <span className="text-[17px] font-semibold tabular-nums">{String(d).padStart(2, "0")}</span>
      <span className="text-[11px] text-muted-foreground leading-none mt-0.5">{monthShort[(m || 1) - 1]}</span>
    </div>
  );
};
