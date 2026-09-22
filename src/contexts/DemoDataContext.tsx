import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";

interface DemoDataContextType {
  demoEnabled: boolean;
  setDemoEnabled: (v: boolean) => void;
  canToggle: boolean;
}

const DemoDataContext = createContext<DemoDataContextType | undefined>(undefined);
const STORAGE_KEY = "lb_demo_data";

export const DemoDataProvider = ({ children }: { children: ReactNode }) => {
  const { roles } = useAuth();
  const canToggle = roles.includes("admin") || roles.includes("super_admin");
  const [demoEnabled, setDemoEnabledState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "1";
  });

  useEffect(() => {
    if (!canToggle && demoEnabled) {
      setDemoEnabledState(false);
      localStorage.setItem(STORAGE_KEY, "0");
    }
  }, [canToggle, demoEnabled]);

  const setDemoEnabled = (v: boolean) => {
    setDemoEnabledState(v);
    localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
  };

  return (
    <DemoDataContext.Provider value={{ demoEnabled: demoEnabled && canToggle, setDemoEnabled, canToggle }}>
      {children}
    </DemoDataContext.Provider>
  );
};

export const useDemoData = () => {
  const ctx = useContext(DemoDataContext);
  if (!ctx) return { demoEnabled: false, setDemoEnabled: () => {}, canToggle: false };
  return ctx;
};
