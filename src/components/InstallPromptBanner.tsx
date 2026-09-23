import { useEffect, useState } from "react";
import { Download, X, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BottomSheet, IconButton, SectionCard } from "@/components/ds";

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
        role="region"
        aria-label="Instalar aplicativo"
        className="fixed inset-x-0 z-40 px-4 pointer-events-none bottom-[calc(env(safe-area-inset-bottom,0px)_+_4.5rem)] lg:bottom-6 lg:left-60"
      >
        <SectionCard padding="compact" className="max-w-md mx-auto pointer-events-auto shadow-ds-2 flex items-center gap-3">
          <Smartphone className="h-5 w-5 text-primary shrink-0" aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight">Instalar Liberty Begin</p>
            <p className="text-xs text-muted-foreground leading-tight mt-0.5">Acesso rápido pelo ícone, como um app.</p>
          </div>
          <Button size="sm" onClick={handleInstall} className="shrink-0">
            <Download aria-hidden />
            Instalar
          </Button>
          <IconButton aria-label="Dispensar" size="sm" onClick={dismiss} className="-mr-1">
            <X className="h-4 w-4" />
          </IconButton>
        </SectionCard>
      </div>

      <BottomSheet
        open={showIosSheet}
        onOpenChange={(next) => { if (!next) dismiss(); }}
        title="Instalar no iPhone"
        description="Leva menos de um minuto."
        size="sm"
        footer={<Button onClick={dismiss} className="w-full sm:w-auto">Entendi</Button>}
      >
        <ol className="text-sm text-muted-foreground space-y-2.5 list-decimal list-inside leading-relaxed">
          <li>
            Toque no ícone <span className="text-foreground font-medium">Compartilhar</span> na barra do Safari.
          </li>
          <li>
            Role e escolha <span className="text-foreground font-medium">"Adicionar à Tela de Início"</span>.
          </li>
          <li>
            Toque em <span className="text-foreground font-medium">Adicionar</span>.
          </li>
        </ol>
      </BottomSheet>
    </>
  );
};
