const RELOAD_LOCK = "liberty:reload-lock-at";
const RELOAD_COOLDOWN_MS = 15_000;

export const clearAppCaches = async () => {
  try {
    if (!("caches" in window)) return;
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => !name.includes("firebase") && !name.includes("messaging"))
        .map((name) => caches.delete(name)),
    );
  } catch {
    // Cache cleanup is best-effort; never block access because of it.
  }
};

export const reloadAppSafely = async ({ bustCache = false, force = false } = {}) => {
  if (typeof window === "undefined" || navigator.onLine === false) return false;

  const lastReload = Number(sessionStorage.getItem(RELOAD_LOCK) ?? 0);
  if (!force && Date.now() - lastReload < RELOAD_COOLDOWN_MS) return false;
  sessionStorage.setItem(RELOAD_LOCK, String(Date.now()));
  await clearAppCaches();

  if (bustCache) {
    const url = new URL(window.location.href);
    url.searchParams.set("app_refresh", String(Date.now()));
    window.location.replace(url.toString());
  } else {
    window.location.reload();
  }
  return true;
};

export const clearReloadLock = () => {
  try {
    sessionStorage.removeItem(RELOAD_LOCK);
  } catch {
    // Ignore storage restrictions in private browsing.
  }
};