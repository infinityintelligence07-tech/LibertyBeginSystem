import { useState, useEffect } from "react";
import { Bell, BellOff, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { enablePushNotifications } from "@/lib/pushRegistration";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SectionCard, SectionHeader, StatusPill } from "@/components/ds";

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
    <SectionCard className="space-y-4">
      <SectionHeader as="h3" title="Notificações" />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-ds bg-muted flex items-center justify-center shrink-0">
            {isOn ? (
              <Check className="h-5 w-5 text-status-green" aria-hidden />
            ) : isDenied ? (
              <BellOff className="h-5 w-5 text-destructive" aria-hidden />
            ) : (
              <Bell className="h-5 w-5 text-primary" aria-hidden />
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
        {isOn ? (
          <StatusPill tone="success" size="md" className="self-start sm:self-auto">Ativadas</StatusPill>
        ) : isDenied ? (
          <StatusPill tone="danger" size="md" className="self-start sm:self-auto">Bloqueadas</StatusPill>
        ) : isUnsupported ? (
          <StatusPill tone="neutral" size="md" className="self-start sm:self-auto">Indisponível</StatusPill>
        ) : (
          <Button onClick={handleEnable} disabled={loading} className="shrink-0 self-start sm:self-auto">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Ativar
          </Button>
        )}
      </div>

      {isOn && (
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <Button variant="outline" onClick={handleEnable} disabled={loading} className="w-full sm:w-auto">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Registrar este dispositivo
          </Button>
          <Button variant="ghost" onClick={showLocalWelcome} className="w-full sm:w-auto">
            Enviar notificação de teste
          </Button>
        </div>
      )}
    </SectionCard>
  );
};
