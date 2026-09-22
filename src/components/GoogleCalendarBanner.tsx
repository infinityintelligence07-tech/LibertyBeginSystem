import { useEffect, useState } from "react";
import { Calendar, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const GoogleCalendarBanner = () => {
  const { profile, refreshProfile } = useAuth() as any;
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") {
      toast.success("Google Agenda conectado com sucesso!");
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
    <div className="mb-6 rounded-xl border border-primary/40 bg-primary/5 p-4 flex items-start gap-3">
      <div className="flex-shrink-0 mt-0.5">
        <Calendar className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground text-sm">Conecte seu Google Agenda</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Suas sessões serão criadas automaticamente no seu calendário, com convite para o aluno.
        </p>
        <button
          onClick={connect}
          disabled={loading}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Abrindo..." : "Conectar Google Agenda"}
        </button>
      </div>
      <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
