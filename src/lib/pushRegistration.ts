import { getToken, onMessage } from "firebase/messaging";
import { supabase } from "@/integrations/supabase/client";
import { getMessagingSafe, VAPID_KEY } from "@/lib/firebase";

const SW_URL = "/firebase-messaging-sw.js";

function isValidP256PublicKey(key: string): boolean {
  if (!key) return false;
  try {
    const normalized = key.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const raw = atob(padded);
    return raw.length === 65 && raw.charCodeAt(0) === 4;
  } catch {
    return false;
  }
}

/** Refuse SW registration in Lovable preview/dev, iframes, and ?sw=off. */
function shouldSkipRegistration(): boolean {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  const params = new URLSearchParams(window.location.search);
  if (params.get("sw") === "off") return true;
  return false;
}

async function unregisterExisting() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs
      .filter((r) => r.active?.scriptURL?.endsWith(SW_URL))
      .map((r) => r.unregister().catch(() => {})),
  );
}

/** Register the FCM service worker (safe in production only). Returns null in preview/dev. */
export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  if (shouldSkipRegistration()) {
    await unregisterExisting();
    return null;
  }
  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  } catch (err) {
    console.warn("[push] SW registration failed", err);
    return null;
  }
}

/** Ask browser permission + get FCM token + save to backend. */
export async function enablePushNotifications(): Promise<
  { ok: true; token: string } | { ok: false; reason: string }
> {
  if (typeof Notification === "undefined") return { ok: false, reason: "unsupported" };
  if (shouldSkipRegistration())
    return { ok: false, reason: "preview-mode" };

  // iOS Safari only supports Web Push when the site is installed to the Home
  // Screen (standalone PWA) on iOS 16.4+. In a regular Safari tab getToken
  // fails with a cryptic error — detect it up front and tell the user.
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // @ts-ignore — iOS Safari legacy flag
    window.navigator.standalone === true;
  if (isIOS && !isStandalone) return { ok: false, reason: "ios-not-installed" };

  const perm = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "denied" };

  const messaging = await getMessagingSafe();
  if (!messaging) return { ok: false, reason: "unsupported-browser" };

  const registration = await registerPushServiceWorker();
  if (!registration) return { ok: false, reason: "sw-failed" };

  try {
    const tokenOptions = isValidP256PublicKey(VAPID_KEY)
      ? { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration }
      : { serviceWorkerRegistration: registration };
    const token = await getToken(messaging, tokenOptions);
    if (!token) return { ok: false, reason: "no-token" };

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return { ok: false, reason: "no-user" };

    const { error } = await (supabase.from("push_subscriptions" as any) as any).upsert(
      {
        user_id: userData.user.id,
        token,
        user_agent: navigator.userAgent.slice(0, 300),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "token" },
    );
    if (error) {
      console.warn("[push] failed to save token", error);
      return { ok: false, reason: "save-failed" };
    }
    return { ok: true, token };
  } catch (err: any) {
    console.warn("[push] getToken failed", err);
    return { ok: false, reason: err?.message || "token-error" };
  }
}

/** Foreground push handler — show a toast/browser notification while app is open. */
export async function initForegroundPush(onNotify: (n: { title: string; body: string; link?: string }) => void) {
  const messaging = await getMessagingSafe();
  if (!messaging) return;
  onMessage(messaging, (payload) => {
    onNotify({
      title: payload?.notification?.title || payload?.data?.title || "Notificação",
      body: payload?.notification?.body || payload?.data?.body || "",
      link: (payload?.data?.link as string) || undefined,
    });
  });
}
