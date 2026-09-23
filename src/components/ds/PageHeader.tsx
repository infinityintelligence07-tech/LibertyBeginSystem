import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ds/IconButton";

interface PageHeaderProps {
  /** Rótulo pequeno acima do título (Primeira maiúscula, sem caixa alta). Ex.: "Etapa 2 de 6" */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** `true` volta uma página; string navega para a rota; função customiza. */
  back?: boolean | string | (() => void);
  /** Ações à direita (Button, StatusPill...). */
  actions?: ReactNode;
  /** `display` = título de página (28px). `large` = saudação/hero (34px, com gradiente). */
  size?: "display" | "large";
  className?: string;
}

/** Único lugar onde existe `h1` em uma página. */
export const PageHeader = ({ eyebrow, title, description, back, actions, size = "display", className }: PageHeaderProps) => {
  const navigate = useNavigate();
  const handleBack = () => {
    if (typeof back === "function") return back();
    if (typeof back === "string") return navigate(back);
    navigate(-1);
  };

  return (
    <header className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex items-start gap-2 min-w-0">
        {back !== undefined && back !== false && (
          <IconButton aria-label="Voltar" onClick={handleBack} className="-ml-2 mt-0.5 shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="ds-kicker mb-1">{eyebrow}</p>}
          <h1
            className={cn(
              "text-foreground",
              size === "large"
                ? "text-[28px] md:text-[34px] font-bold leading-[1.15] tracking-[var(--ds-tracking-large-title)] silver-gradient-text"
                : "text-[24px] md:text-[28px] font-semibold leading-[1.2] tracking-[var(--ds-tracking-display)]",
            )}
          >
            {title}
          </h1>
          {description && <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 pt-0.5">{actions}</div>}
    </header>
  );
};

interface SectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Nível semântico do título (padrão h2). */
  as?: "h2" | "h3";
}

/** Título de seção dentro da página (22px) ou de card (17px). */
export const SectionHeader = ({ title, description, actions, className, as = "h2" }: SectionHeaderProps) => {
  const Tag = as;
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <Tag
          className={cn(
            "text-foreground",
            as === "h2"
              ? "text-[19px] md:text-[22px] font-bold leading-tight tracking-[var(--ds-tracking-title)]"
              : "text-[17px] font-semibold leading-tight tracking-[var(--ds-tracking-title-sm)]",
          )}
        >
          {title}
        </Tag>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
};
