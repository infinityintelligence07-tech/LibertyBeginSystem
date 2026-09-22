import { useState } from "react";
import { Send, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  libertyProfileId: string;
  libertyName?: string;
  sessionName?: string | null;
  bookingId?: string | null;
  phone?: string | null;
}

/**
 * Sends an in-app NPS request to the student and offers a direct link
 * (copy / WhatsApp) so the student can answer without hunting the notification.
 */
export const SendNpsButton = ({ libertyProfileId, libertyName, sessionName, bookingId, phone }: Props) => {
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const link = `${typeof window !== "undefined" ? window.location.origin : ""}${bookingId ? `/nps/${bookingId}` : "/nps"}`;
  const first = (libertyName || "").split(" ")[0] || "tudo bem";
  const message = `Oi, ${first}! Pode responder a pesquisa de satisfação${sessionName ? ` da sessão "${sessionName}"` : ""}? Leva menos de 2 minutos:

${link}

Obrigado! 🙏`;
  const digits = phone ? phone.replace(/\D/g, "") : "";

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    toast.success("Copiado! Cole no WhatsApp.");
    setTimeout(() => setCopied(false), 1800);
  };

  const send = async () => {
    setSending(true);
    try {
      const { data: p, error: pe } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("id", libertyProfileId)
        .maybeSingle();
      if (pe) throw pe;
      if (!p?.user_id) {
        toast.error("Aluno ainda não possui acesso ativado. NPS não pode ser enviado.");
        return;
      }
      const msg = sessionName
        ? `Como foi a sessão "${sessionName}"? Sua opinião é essencial para melhorarmos sua experiência.`
        : "Sua opinião é essencial para melhorarmos sua experiência. Leva menos de 2 minutos.";
      const { error } = await supabase.from("notifications").insert({
        user_id: p.user_id,
        type: "nps_request",
        title: "Pesquisa de satisfação (NPS)",
        message: msg,
        link: bookingId ? `/nps/${bookingId}` : `/nps`,
      });
      if (error) throw error;
      toast.success(`NPS enviado${libertyName ? ` para ${libertyName.split(" ")[0]}` : ""}!`);
      setOpen(true);
    } catch (e: any) {
      toast.error("Erro ao enviar NPS: " + (e?.message || "desconhecido"));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={send}
        disabled={sending}
        title="Enviar pesquisa de NPS ao aluno e gerar link direto"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-[11px] font-semibold hover:bg-primary/15 transition-colors disabled:opacity-50"
      >
        <Send className="h-3 w-3" /> {sending ? "Enviando..." : "Enviar NPS"}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Link da pesquisa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              A pesquisa já apareceu no app do aluno. Você também pode enviar o link direto abaixo.
            </p>

            <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/30 border border-border">
              <span className="font-mono text-xs text-foreground truncate">{link}</span>
              <button
                onClick={() => copy(link)}
                className="shrink-0 p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                title="Copiar link"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-status-green" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Mensagem pronta
              </label>
              <textarea
                readOnly
                value={message}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full h-32 bg-card border border-border rounded-lg p-3 text-xs text-foreground font-mono focus:outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => copy(message)}
                className="btn-silver text-xs px-4 py-2 flex items-center gap-2"
              >
                <Copy className="h-3.5 w-3.5" /> Copiar mensagem
              </button>
              {digits && (
                <a
                  href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold px-4 py-2 rounded-lg bg-status-green/10 border border-status-green/20 text-status-green"
                >
                  Enviar no WhatsApp
                </a>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
