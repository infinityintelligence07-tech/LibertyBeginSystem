import { ReactNode, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { reloadAppSafely } from "@/lib/appReload";

const THRESHOLD = 80; // px to trigger refresh
const MAX_PULL = 140;

/**
 * Mobile pull-to-refresh (WhatsApp/Instagram style).
 * Only active on touch devices, when the page is scrolled to top.
 * Pulling down past the threshold clears caches and reloads.
 */
export const PullToRefresh = ({ children }: { children: ReactNode }) => {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const active = useRef(false);

  useEffect(() => {
    const isTouch = "ontouchstart" in window;
    if (!isTouch) return;

    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 2) return;
      startY.current = e.touches[0].clientY;
      active.current = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!active.current || startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        setPull(0);
        return;
      }
      // Resistance curve
      const resisted = Math.min(MAX_PULL, dy * 0.5);
      setPull(resisted);
    };

    const onEnd = async () => {
      if (!active.current) return;
      active.current = false;
      startY.current = null;
      if (pull >= THRESHOLD) {
        setRefreshing(true);
        const didReload = await reloadAppSafely();
        if (!didReload) {
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);

    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [pull]);

  const progress = Math.min(1, pull / THRESHOLD);
  const show = pull > 4 || refreshing;

  return (
    <>
      {show && (
        <div
          role="status"
          aria-label={refreshing ? "Atualizando" : "Puxe para atualizar"}
          className="lg:hidden fixed left-1/2 -translate-x-1/2 z-40 pointer-events-none flex items-center justify-center h-10 w-10 rounded-full bg-card border border-border shadow-ds-2"
          style={{
            top: `calc(env(safe-area-inset-top, 0px) + ${Math.max(8, pull - 32)}px)`,
            opacity: refreshing ? 1 : 0.4 + progress * 0.6,
            transition: refreshing ? "top var(--ds-dur-2) var(--ds-ease)" : undefined,
          }}
        >
          <RefreshCw
            className={refreshing ? "h-4 w-4 text-primary animate-spin" : "h-4 w-4 text-primary"}
            aria-hidden
            style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
          />
        </div>
      )}
      {children}
    </>
  );
};
