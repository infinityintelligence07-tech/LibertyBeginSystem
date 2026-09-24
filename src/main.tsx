import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerPushServiceWorker, initForegroundPush } from "@/lib/pushRegistration";
import { toast } from "sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { tolerateBrowserTranslation } from "@/lib/tolerateBrowserTranslation";

tolerateBrowserTranslation();

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
}

// Register FCM service worker in production only (guarded inside the helper).
// This also makes the app installable via the native browser "Install app" prompt.
if (typeof window !== "undefined") {
  registerPushServiceWorker().catch(() => {});
  initForegroundPush(({ title, body, link }) => {
    toast(title, {
      description: body,
      action: link
        ? { label: "Abrir", onClick: () => (window.location.href = link) }
        : undefined,
    });
  }).catch(() => {});
}
