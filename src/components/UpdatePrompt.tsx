import { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reloadAppSafely } from "@/lib/appReload";

/**
 * Detects a new deployed version by polling /index.html and comparing the
 * hashed main script src (Vite emits assets/index-<hash>.js). When it changes,
 * shows a floating banner asking the user to reload.
 *
 * Runs only on production hosts (not preview/dev/iframe).
 */
const POLL_MS = 30_000;

function isCheckableHost(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.self !== window.top) return false;
  } catch {
    return false;
  }
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return false;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return false;
  if (host.endsWith(".lovableproject.com") || host.endsWith(".lovableproject-dev.com")) return false;
  return true;
}

async function fetchCurrentAssetHash(): Promise<string | null> {
  try {
    const res = await fetch(`/index.html?_=${Date.now()}`, {
      cache: "no-store",
      headers: { "cache-control": "no-cache" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Match any hashed asset: /assets/index-XXXX.js  OR any script src
    const m = html.match(/\/assets\/[a-zA-Z0-9_-]+\.js/g);
    if (!m || m.length === 0) return null;
    // Combine all asset filenames — any change means new build
    return m.sort().join("|");
  } catch {
    return null;
  }
}

export const UpdatePrompt = () => {
  const [outdated, setOutdated] = useState(false);
  const initialHash = useRef<string | null>(null);
  const hiddenSince = useRef<number | null>(null);

  useEffect(() => {
    if (!isCheckableHost()) return;

    let cancelled = false;
    let timer: number | undefined;

    const autoReloadIfHiddenLongEnough = async (hash: string) => {
      // If app was in background for >30s (installed PWA relaunch, tab switch),
      // silently upgrade — mirrors WhatsApp/iFood behavior. Otherwise show banner.
      const hiddenMs = hiddenSince.current ? Date.now() - hiddenSince.current : 0;
      if (hiddenMs > 30_000) {
        return reloadAppSafely();
      }
      return false;
    };

    const check = async () => {
      const hash = await fetchCurrentAssetHash();
      if (cancelled || !hash) return;
      if (initialHash.current === null) {
        initialHash.current = hash;
        return;
      }
      if (hash !== initialHash.current) {
        const reloaded = await autoReloadIfHiddenLongEnough(hash);
        if (!reloaded) setOutdated(true);
      }
    };

    check();
    const schedule = () => {
      timer = window.setTimeout(async () => {
        await check();
        if (!cancelled && !outdated) schedule();
      }, POLL_MS);
    };
    schedule();

    const onFocus = () => check();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenSince.current = Date.now();
      } else {
        check();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReload = async () => {
    await reloadAppSafely();
  };

  if (!outdated) return null;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[60] w-[92%] max-w-md"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)" }}
    >
      <div className="glass-card p-4 flex items-center gap-3 shadow-lg border border-primary/30">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <RefreshCw className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Nova versão disponível</p>
          <p className="text-xs text-muted-foreground">Atualize para ver as novidades do app.</p>
        </div>
        <Button
          onClick={handleReload}
          size="sm"
          className="text-xs shrink-0"
        >
          Atualizar
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOutdated(false)}
          className="h-8 w-8 text-muted-foreground shrink-0"
          aria-label="Dispensar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
