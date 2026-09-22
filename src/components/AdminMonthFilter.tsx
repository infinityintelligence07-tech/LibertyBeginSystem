import { useAdminFilter } from "@/contexts/AdminFilterContext";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";

export const AdminMonthFilter = () => {
  const { mode, setMode, monthLabel, prevMonth, nextMonth } = useAdminFilter();

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => setMode("overview")}
        className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors font-medium ${
          mode === "overview"
            ? "bg-primary text-primary-foreground border-primary/20"
            : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
      >
        <Eye className="h-3.5 w-3.5" />
        Visão Geral
      </button>
      <div className="flex items-center gap-1">
        <button
          onClick={() => { setMode("month"); prevMonth(); }}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          onClick={() => setMode("month")}
          className={`text-sm font-medium capitalize min-w-[160px] text-center px-3 py-2 rounded-lg transition-colors ${
            mode === "month"
              ? "text-foreground bg-muted"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {monthLabel}
        </button>
        <button
          onClick={() => { setMode("month"); nextMonth(); }}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
};
