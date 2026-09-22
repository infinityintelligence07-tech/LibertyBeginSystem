import { createContext, useContext, useState, ReactNode, useMemo } from "react";

type FilterMode = "overview" | "month";

interface AdminFilterState {
  mode: FilterMode;
  selectedMonth: string; // "2026-03"
  setMode: (m: FilterMode) => void;
  setSelectedMonth: (m: string) => void;
  prevMonth: () => void;
  nextMonth: () => void;
  monthLabel: string;
  monthKey: string; // same as selectedMonth when mode=month, empty when overview
}

const AdminFilterContext = createContext<AdminFilterState | null>(null);

export const useAdminFilter = () => {
  const ctx = useContext(AdminFilterContext);
  if (!ctx) throw new Error("useAdminFilter must be used within AdminFilterProvider");
  return ctx;
};

export const AdminFilterProvider = ({ children }: { children: ReactNode }) => {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [mode, setMode] = useState<FilterMode>("month");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const prevMonth = () => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const nextMonth = () => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const monthLabel = useMemo(() => {
    const [y, m] = selectedMonth.split("-");
    const d = new Date(parseInt(y), parseInt(m) - 1);
    return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }, [selectedMonth]);

  const monthKey = mode === "month" ? selectedMonth : "";

  return (
    <AdminFilterContext.Provider value={{ mode, selectedMonth, setMode, setSelectedMonth, prevMonth, nextMonth, monthLabel, monthKey }}>
      {children}
    </AdminFilterContext.Provider>
  );
};
