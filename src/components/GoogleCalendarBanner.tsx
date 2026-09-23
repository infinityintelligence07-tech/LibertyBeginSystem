import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ds";

export const GoogleCalendarBanner = () => {
  const { profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") {
      toast.success("Google Agenda conectado");
      refreshProfile?.();
      params.delete("google");
      const newUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
      window.history.replaceState({}, "", newUrl);
    } else if (params.get("google") === "denied") {
      toast.error("Conexão com Google Agenda cancelada.");
    }
  }, [refreshProfile]);

  if (!profile || profile.google_connected || dismissed) return null;

  const connect = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-oauth-start", {
        body: { returnTo: window.location.pathname },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (e) {
      console.error(e);
      toast.error("Erro ao iniciar conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Callout
      tone="info"
      icon={Calendar}
      title="Conecte seu Google Agenda"
      className="mb-6"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={connect} disabled={loading}>
            {loading ? "Abrindo..." : "Conectar Google Agenda"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            Agora não
          </Button>
        </div>
      }
    >
      Suas sessões entram no seu calendário automaticamente, com convite para o membro.
    </Callout>
  );
};
