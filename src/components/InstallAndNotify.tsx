import { useEffect, useState } from "react";
import { Download, Bell, BellOff, Check } from "lucide-react";
import { toast } from "sonner";
import { enablePushNotifications } from "@/lib/pushRegistration";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const InstallAndNotify = ({ compact = false }: { compact?: boolean }) => {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosTip, setIosTip] = useState(false);
  const [notifState, setNotifState] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-ignore — iOS Safari
      window.navigator.standalone === true;
    if (standalone) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") toast.success("App instalado!");
      setDeferred(null);
      return;
    }
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
    if (isIOS) {
      setIosTip(true);
      return;
    }
    toast.info(
      "Para instalar: abra o menu do navegador e escolha \"Instalar app\" ou \"Adicionar à tela inicial\"."
    );
  };

  const handleNotifications = async () => {
    if (typeof Notification === "undefined") {
      toast.error("Notificações não suportadas neste dispositivo");
      return;
    }
    const result = await enablePushNotifications();
    if (result.ok === true) {
      setNotifState("granted");
      toast.success("Notificações ativadas. Você receberá alertas no celular");
      return;
    }
    const reason: string = (result as { ok: false; reason: string }).reason;
    // Fallback / diagnostic messages
    switch (reason) {
      case "denied":
        setNotifState("denied");
        toast.error("Permissão negada nas configurações do navegador");
        break;
      case "preview-mode":
        toast.info("Push real só funciona no app publicado (não no preview)");
        break;
      case "ios-not-installed":
        setIosTip(true);
        toast.error(
          "No iPhone é preciso instalar o app na tela inicial primeiro (Compartilhar › Adicionar à Tela de Início).",
          { duration: 8000 },
        );
        break;
      case "unsupported":
      case "unsupported-browser":
        toast.error("Este navegador não suporta notificações push");
        break;
      case "no-user":
        toast.error("Faça login para ativar notificações");
        break;
      case "sw-failed":
        toast.error("Falha ao registrar o serviço de notificações. Recarregue e tente novamente.");
        break;
      case "no-token":
      case "save-failed":
        toast.error("Não foi possível gerar o token. Tente novamente em instantes.");
        break;
      default:
        if (reason.includes("applicationServerKey") || reason.includes("P-256")) {
          toast.error("Configuração de notificações atualizada. Reabra o app e tente ativar novamente.");
          break;
        }
        toast.error(`Não foi possível ativar as notificações (${reason})`);
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {!installed && (
          <button
            onClick={handleInstall}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
            title="Instalar app"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Instalar</span>
          </button>
        )}
        <button
          onClick={handleNotifications}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          title="Notificações"
        >
          {notifState === "granted" ? (
            <Check className="h-3.5 w-3.5 text-primary" />
          ) : notifState === "denied" ? (
            <BellOff className="h-3.5 w-3.5" />
          ) : (
            <Bell className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!installed && (
        <button
          onClick={handleInstall}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-sidebar-accent border border-border text-sm text-foreground hover:border-primary/50 transition-colors"
        >
          <Download className="h-4 w-4" />
          <span>Instalar app</span>
        </button>
      )}
      {notifState !== "granted" && notifState !== "unsupported" && (
        <button
          onClick={handleNotifications}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-sidebar-accent border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
        >
          <Bell className="h-4 w-4" />
          <span>Ativar notificações</span>
        </button>
      )}
      {iosTip && (
        <div className="text-xs text-muted-foreground p-3 rounded-lg bg-sidebar-accent border border-border">
          No iPhone: toque no ícone de compartilhar <span className="text-primary">⎙</span> e escolha
          <span className="text-foreground"> "Adicionar à Tela de Início"</span>.
        </div>
      )}
    </div>
  );
};
