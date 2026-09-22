import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { forceAppReload } from "@/components/PullToRefresh";

/** Floating refresh bubble — clears cached assets and reloads the app. Mobile only. */
export const RefreshBubble = () => {
  const [spinning, setSpinning] = useState(false);
  const handle = async () => {
    setSpinning(true);
    await forceAppReload();
  };
  return (
    <button
      onClick={handle}
      aria-label="Atualizar app"
      title="Atualizar app"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
      className="lg:hidden fixed right-[11rem] z-40 h-10 w-10 rounded-full bg-card border border-border shadow-md flex items-center justify-center text-foreground hover:bg-muted hover:border-primary/40 transition-all"
    >
      <RefreshCw className={`h-[18px] w-[18px] ${spinning ? "animate-spin" : ""}`} />
    </button>
  );
};
