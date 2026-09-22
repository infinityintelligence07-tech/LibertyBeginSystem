import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";

export type ViewAs = "admin" | "mentor" | "liberty";

interface ViewAsContextType {
  viewAs: ViewAs;
  setViewAs: (v: ViewAs) => void;
  canSwitch: boolean;
}

const ViewAsContext = createContext<ViewAsContextType | undefined>(undefined);

const STORAGE_KEY = "lb_view_as";

export const ViewAsProvider = ({ children }: { children: ReactNode }) => {
  const { roles } = useAuth();
  const canSwitch = roles.includes("super_admin");
  const [viewAs, setViewAsState] = useState<ViewAs>(() => {
    if (typeof window === "undefined") return "admin";
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored as ViewAs) || "admin";
  });

  useEffect(() => {
    if (!canSwitch && viewAs !== "admin") {
      setViewAsState("admin");
      localStorage.setItem(STORAGE_KEY, "admin");
    }
  }, [canSwitch, viewAs]);

  const setViewAs = (v: ViewAs) => {
    setViewAsState(v);
    localStorage.setItem(STORAGE_KEY, v);
  };

  return (
    <ViewAsContext.Provider value={{ viewAs, setViewAs, canSwitch }}>
      {children}
    </ViewAsContext.Provider>
  );
};

export const useViewAs = () => {
  const ctx = useContext(ViewAsContext);
  if (!ctx) return { viewAs: "admin" as ViewAs, setViewAs: () => {}, canSwitch: false };
  return ctx;
};
