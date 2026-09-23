import { useAdminFilter } from "@/contexts/AdminFilterContext";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Chip, IconButton } from "@/components/ds";
import { cn } from "@/lib/utils";

export const AdminMonthFilter = () => {
  const { mode, setMode, monthLabel, prevMonth, nextMonth } = useAdminFilter();

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Chip active={mode === "overview"} onClick={() => setMode("overview")}>
        <Eye className="h-3.5 w-3.5" aria-hidden />
        Visão geral
      </Chip>
      <div className="flex items-center gap-1">
        <IconButton aria-label="Mês anterior" size="sm" onClick={() => { setMode("month"); prevMonth(); }}>
          <ChevronLeft className="h-4 w-4" />
        </IconButton>
        <button
          type="button"
          onClick={() => setMode("month")}
          aria-pressed={mode === "month"}
          className={cn(
            "h-8 min-w-[150px] px-3 rounded-full border text-[13px] font-medium capitalize text-center transition-colors duration-ds-1 ease-ds",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
            mode === "month"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-transparent text-muted-foreground border-border hover:bg-accent hover:text-foreground",
          )}
        >
          {monthLabel}
        </button>
        <IconButton aria-label="Próximo mês" size="sm" onClick={() => { setMode("month"); nextMonth(); }}>
          <ChevronRight className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  );
};
