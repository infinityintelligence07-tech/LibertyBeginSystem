import { useEffect, useState } from "react";
import { Download, X, Smartphone } from "lucide-react";
import { toast } from "sonner";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "install_prompt_dismissed_at";
const DISMISS_DAYS = 3;

export const InstallPromptBanner = () => {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIosSheet, setShowIosSheet] = useState(false);

  useEffect(() => {
    // Already installed?
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-ignore — iOS Safari
      window.navigator.standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }

    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
    setIsIOS(ios);

    // Respect recent dismissal
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
    if (dismissedAt && daysSince < DISMISS_DAYS) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      // Small delay so it doesn't slam in on first paint
      setTimeout(() => setVisible(true), 1500);
    };
    const onInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // iOS never fires beforeinstallprompt — show manual tip
    if (ios) {
      setTimeout(() => setVisible(true), 2000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
    setShowIosSheet(false);
  };

  const handleInstall = async () => {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") toast.success("App instalado!");
      setDeferred(null);
      setVisible(false);
      return;
    }
    if (isIOS) {
      setShowIosSheet(true);
      return;
    }
    toast.info(
      'Abra o menu do navegador e escolha "Instalar app" ou "Adicionar à tela inicial".'
    );
  };

  if (installed || !visible) return null;

  return (
    <>
      <div
        className="fixed left-0 right-0 z-40 px-4 pointer-events-none"
        style={{
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)",
        }}
      >
        <div className="max-w-md mx-auto pointer-events-auto animate-in slide-in-from-bottom-4 fade-in duration-500">
          <div className="glass-card border border-primary/30 shadow-2xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground leading-tight">
                Instalar Liberty Begin
              </p>
              <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                Acesso rápido pelo ícone, como um app real
              </p>
            </div>
            <button
              onClick={handleInstall}
              className="btn-silver text-xs px-3 py-2 flex items-center gap-1.5 shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Instalar
            </button>
            <button
              onClick={dismiss}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors shrink-0"
              aria-label="Dispensar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {showIosSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-4"
          onClick={dismiss}
        >
          <div
            className="glass-card border border-border p-5 max-w-sm w-full space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              <h3 className="text-base font-semibold text-foreground">Instalar no iPhone</h3>
            </div>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>
                Toque no ícone <span className="text-primary font-medium">Compartilhar</span> na barra do Safari
              </li>
              <li>
                Role e escolha <span className="text-foreground font-medium">"Adicionar à Tela de Início"</span>
              </li>
              <li>Toque em <span className="text-foreground font-medium">Adicionar</span></li>
            </ol>
            <button
              onClick={dismiss}
              className="w-full btn-silver text-sm py-2 mt-2"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
};
