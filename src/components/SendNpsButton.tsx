import { useState } from "react";
import { Send, Copy, Check } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BottomSheet, EmptyState, IconButton, ListRow, SectionCard, TextAreaField } from "@/components/ds";

export type NpsSessionOption = {
  bookingId: string;
  sessionName: string;
  mentorName: string;
  date: string;
};

interface Props {
  libertyProfileId: string;
  libertyName?: string;
  sessions: NpsSessionOption[];
  phone?: string | null;
}

const dayLabel = (date: string) => {
  try {
    return format(parseISO(date), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return date;
  }
};

/**
 * Envia o NPS de UMA sessão escolhida pelo admin: notificação no app e link direto
 * presos ao id do agendamento, para a avaliação nunca cair em outra sessão ou mentor.
 */
export const SendNpsButton = ({ libertyProfileId, libertyName, sessions, phone }: Props) => {
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sent, setSent] = useState<NpsSessionOption | null>(null);
  const [copied, setCopied] = useState(false);

  const first = (libertyName || "").split(" ")[0] || "tudo bem";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = sent ? `${origin}/nps/${sent.bookingId}` : "";
  const message = sent
    ? `Oi, ${first}. Pode responder a pesquisa de satisfação da sessão "${sent.sessionName}" com ${sent.mentorName} (${dayLabel(sent.date)})? Leva menos de 2 minutos:

${link}

Obrigado.`
    : "";
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

  const send = async (session: NpsSessionOption) => {
    setSendingId(session.bookingId);
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
      const { error } = await supabase.from("notifications").insert({
        user_id: p.user_id,
        type: "nps_request",
        title: "Pesquisa de satisfação (NPS)",
        message: `Como foi a sessão "${session.sessionName}" com ${session.mentorName} em ${dayLabel(session.date)}? Leva menos de 2 minutos.`,
        link: `/nps/${session.bookingId}`,
        related_booking_id: session.bookingId,
      });
      if (error) throw error;
      toast.success(`NPS enviado${libertyName ? ` para ${first}` : ""}`);
      setPickerOpen(false);
      setSent(session);
    } catch (e: unknown) {
      toast.error("Erro ao enviar NPS: " + (e instanceof Error ? e.message : "desconhecido"));
    } finally {
      setSendingId(null);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setPickerOpen(true)}
        title="Escolher a sessão e enviar a pesquisa de NPS"
      >
        <Send className="h-3.5 w-3.5" /> Enviar NPS
      </Button>

      <BottomSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Qual sessão o aluno vai avaliar?"
        description="O NPS fica ligado à sessão escolhida, com o mentor e a data dela."
      >
        {sessions.length === 0 ? (
          <EmptyState title="Nenhuma sessão realizada" description="O NPS só pode ser enviado para sessões já realizadas." />
        ) : (
          <SectionCard padding="none">
            {sessions.map((session, index) => (
              <ListRow
                key={session.bookingId}
                last={index === sessions.length - 1}
                onPress={sendingId ? undefined : () => send(session)}
                title={session.sessionName}
                subtitle={`${session.mentorName} · ${dayLabel(session.date)}`}
                trailing={sendingId === session.bookingId ? <span className="text-xs text-muted-foreground">Enviando</span> : undefined}
                chevron={!sendingId}
              />
            ))}
          </SectionCard>
        )}
      </BottomSheet>

      <BottomSheet
        open={!!sent}
        onOpenChange={(open) => { if (!open) setSent(null); }}
        title="Link da pesquisa"
        description={sent ? `${sent.sessionName} · ${sent.mentorName} · ${dayLabel(sent.date)}. A pesquisa já apareceu no app do aluno.` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => copy(message)}>
              <Copy className="h-4 w-4" /> Copiar mensagem
            </Button>
            {digits && (
              <Button asChild>
                <a href={`https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
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
