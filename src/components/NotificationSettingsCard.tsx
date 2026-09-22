import { useState, useEffect } from "react";
import { Bell, BellOff, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { enablePushNotifications } from "@/lib/pushRegistration";
import { supabase } from "@/integrations/supabase/client";

export const NotificationSettingsCard = () => {
  const [state, setState] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof Notification !== "undefined") setState(Notification.permission);
  }, []);

  const showLocalWelcome = async () => {
    try {
      const reg =
        (await navigator.serviceWorker?.getRegistration("/firebase-messaging-sw.js")) ||
        (await navigator.serviceWorker?.ready);
      if (reg?.showNotification) {
        await reg.showNotification("🎉 Notificações ativadas!", {
          body: "Parabéns! A partir de agora você receberá alertas do Liberty Begin no seu celular.",
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: "welcome-push",
          data: { link: "/" },
        });
      }
    } catch (err) {
      console.warn("[welcome-push] local notification failed", err);
    }
  };

  const sendWelcome = async () => {
    await showLocalWelcome();
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) return;
      await (supabase.from("notifications" as any) as any).insert({
        user_id: uid,
        type: "welcome_push",
        title: "🎉 Notificações ativadas!",
        message: "Parabéns! A partir de agora você receberá alertas do Liberty Begin no seu celular.",
        link: "/",
      });
    } catch (err) {
      console.warn("[welcome-push] failed", err);
    }
  };

  const handleEnable = async () => {
    if (typeof Notification === "undefined") {
      toast.error("Notificações não suportadas neste dispositivo");
      return;
    }
    setLoading(true);
    const result = await enablePushNotifications();
    setLoading(false);
    if (result.ok === true) {
      setState("granted");
      toast.success("Notificações ativadas!");
      await sendWelcome();
      return;
    }
    const reason = (result as { ok: false; reason: string }).reason;
    switch (reason) {
      case "denied":
        setState("denied");
        toast.error("Permissão negada. Ative nas configurações do navegador.");
        break;
      case "preview-mode":
        toast.info("Push real só funciona no app publicado (não no preview).");
        break;
      case "ios-not-installed":
        toast.error(
          "No iPhone é preciso instalar o app na tela inicial primeiro (Compartilhar › Adicionar à Tela de Início) e abrir por lá.",
          { duration: 8000 },
        );
        break;
      case "unsupported":
      case "unsupported-browser":
        toast.error("Este navegador não suporta notificações push.");
        break;
      case "no-user":
        toast.error("Faça login para ativar as notificações.");
        break;
      case "sw-failed":
        toast.error("Falha ao registrar o serviço de notificações. Recarregue a página e tente novamente.");
        break;
      case "no-token":
      case "save-failed":
        toast.error("Não foi possível gerar o token de notificação. Tente novamente em instantes.");
        break;
      default:
        if (reason.includes("applicationServerKey") || reason.includes("P-256")) {
          toast.error("Configuração de notificações atualizada. Reabra o app e tente ativar novamente.");
          break;
        }
        toast.error(`Não foi possível ativar as notificações (${reason}).`);
    }
  };

  const isOn = state === "granted";
  const isDenied = state === "denied";
  const isUnsupported = state === "unsupported";

  return (
    <div className="glass-card p-6 space-y-4">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        Notificações
      </h2>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border border-border bg-background/50">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
            {isOn ? (
              <Check className="h-5 w-5 text-status-green" />
            ) : isDenied ? (
              <BellOff className="h-5 w-5 text-destructive" />
            ) : (
              <Bell className="h-5 w-5 text-primary" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Notificações push</p>
            <p className="text-xs text-muted-foreground">
              {isOn
                ? "Ativadas. Você receberá alertas no celular"
                : isDenied
                ? "Bloqueadas. Libere nas configurações do navegador"
                : isUnsupported
                ? "Não suportadas neste dispositivo"
                : "Receba lembretes de sessões e novidades no seu celular"}
            </p>
          </div>
        </div>
        <button
          onClick={handleEnable}
          disabled={loading || isOn || isDenied || isUnsupported}
          className={`text-xs px-4 py-2 rounded-lg border transition-colors shrink-0 self-start sm:self-auto flex items-center gap-2 ${
            isOn
              ? "border-status-green/40 text-status-green cursor-default"
              : isDenied || isUnsupported
              ? "border-border text-muted-foreground cursor-not-allowed opacity-60"
              : "btn-silver"
          }`}
        >
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isOn ? "Ativadas" : isDenied ? "Bloqueadas" : "Ativar"}
        </button>
      </div>

      {isOn && (
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={handleEnable}
            disabled={loading}
            className="text-xs px-4 py-2 rounded-lg border border-primary/40 text-primary hover:bg-primary/10 transition-colors w-full sm:w-auto flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Registrar este dispositivo
          </button>
          <button
            onClick={showLocalWelcome}
            className="text-xs px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors w-full sm:w-auto"
          >
            Enviar notificação de teste
          </button>
        </div>
      )}
    </div>
  );
};
