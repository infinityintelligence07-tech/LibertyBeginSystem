import { useState } from "react";
import { Send, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BottomSheet, IconButton, TextAreaField } from "@/components/ds";

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
  const message = `Oi, ${first}. Pode responder a pesquisa de satisfação${sessionName ? ` da sessão "${sessionName}"` : ""}? Leva menos de 2 minutos:

${link}

Obrigado.`;
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
    toast.success("Mensagem copiada");
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
      toast.success(`NPS enviado${libertyName ? ` para ${libertyName.split(" ")[0]}` : ""}`);
      setOpen(true);
    } catch (e: any) {
      toast.error("Erro ao enviar NPS: " + (e?.message || "desconhecido"));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={send}
        disabled={sending}
        title="Enviar pesquisa de NPS ao aluno e gerar link direto"
      >
        <Send className="h-3.5 w-3.5" /> {sending ? "Enviando..." : "Enviar NPS"}
      </Button>

      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="Link da pesquisa"
        description="A pesquisa já apareceu no app do aluno. Você também pode enviar o link direto abaixo."
        footer={
          <>
            <Button variant="outline" onClick={() => copy(message)}>
              <Copy className="h-4 w-4" /> Copiar mensagem
            </Button>
            {digits && (
              <Button asChild>
                <a href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
                  Enviar no WhatsApp
                </a>
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 pl-3 pr-1 py-1 rounded-ds bg-muted/30 border border-border min-h-[44px]">
            <span className="font-mono text-xs text-foreground truncate">{link}</span>
            <IconButton aria-label={copied ? "Link copiado" : "Copiar link"} size="sm" onClick={() => copy(link)}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </IconButton>
          </div>

          <TextAreaField
            label="Mensagem pronta"
            hint="Toque no campo para selecionar tudo."
            readOnly
            value={message}
            onFocus={(e) => e.currentTarget.select()}
            className="h-32 text-xs font-mono resize-none"
          />
        </div>
      </BottomSheet>
    </>
  );
};
