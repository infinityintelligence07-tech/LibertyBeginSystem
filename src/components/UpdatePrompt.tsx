import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ds";
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

  useEffect(() => {
    if (!isCheckableHost()) return;

    let cancelled = false;
    let timer: number | undefined;

    const check = async () => {
      const hash = await fetchCurrentAssetHash();
      if (cancelled || !hash) return;
      if (initialHash.current === null) {
        initialHash.current = hash;
        return;
      }
      if (hash !== initialHash.current) {
        const reloaded = await reloadAppSafely({ bustCache: true, force: true });
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
      if (document.visibilityState === "visible") check();
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
    await reloadAppSafely({ bustCache: true, force: true });
  };

  if (!outdated) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 z-40 px-4 pointer-events-none bottom-[calc(env(safe-area-inset-bottom,0px)_+_4.5rem)] lg:bottom-6 lg:left-60"
    >
      <SectionCard padding="compact" className="max-w-md mx-auto pointer-events-auto shadow-ds-2 flex items-center gap-3">
        <RefreshCw className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight">Nova versão disponível</p>
          <p className="text-xs text-muted-foreground leading-tight mt-0.5">A tela precisa recarregar para sair da versão anterior.</p>
        </div>
        <Button size="sm" onClick={handleReload} className="shrink-0">
          Atualizar
        </Button>
      </SectionCard>
    </div>
  );
};
