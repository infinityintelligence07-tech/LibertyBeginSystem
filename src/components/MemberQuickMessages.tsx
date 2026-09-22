import { useState } from "react";
import { Copy, Check, MessageSquareText, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { shortName } from "@/lib/formatName";

interface Props {
  memberName?: string | null;
  phone?: string | null;
}

const buildTemplates = (first: string) => [
  {
    key: "agendar",
    label: "Agendar sessão",
    text: `Oi, ${first}! Tudo bem? Vi aqui que você ainda não tem sessão agendada na plataforma. Bora marcar? É só entrar no app do Liberty Begin, ir em "Agenda" > "Agendar sessão" e escolher o melhor horário pra você. 🚀`,
  },
  {
    key: "ferramenta",
    label: "Ferramenta disponível",
    text: `Oi, ${first}! Sua ferramenta já está disponível na área de Ferramentas dentro da plataforma. Dá uma olhada e me conta o que achou. 😉`,
  },
  {
    key: "nps",
    label: "Lembrete de NPS",
    text: `Oi, ${first}! Passando pra lembrar de responder a pesquisa de satisfação (NPS) da sua última sessão. Leva menos de 2 minutos e a notificação está aí na plataforma. Sua opinião ajuda muito! 🙏`,
  },
  {
    key: "tarefas",
    label: "Tarefas pendentes",
    text: `Oi, ${first}! Você tem tarefas pendentes da última sessão na plataforma. Consegue avançar nelas até nosso próximo encontro? Qualquer dúvida, me chama por aqui.`,
  },
  {
    key: "lembrete",
    label: "Lembrete da sessão",
    text: `Oi, ${first}! Passando pra confirmar nossa sessão. O link de acesso está na sua agenda dentro da plataforma. Nos vemos lá! 👊`,
  },
  {
    key: "retomada",
    label: "Retomar contato",
    text: `Oi, ${first}! Senti sua falta por aqui. Vamos retomar sua jornada? Me diz um horário que funcione pra você que eu te ajudo a agendar a próxima sessão.`,
  },
];

export const MemberQuickMessages = ({ memberName, phone }: Props) => {
  const [open, setOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const first = (shortName(memberName || "") || "tudo bem").split(" ")[0];
  const templates = buildTemplates(first);
  const digits = phone ? phone.replace(/\D/g, "") : "";

  const copy = async (key: string, text: string) => {
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
    setCopiedKey(key);
    toast.success("Mensagem copiada! Cole no WhatsApp.");
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Mensagens rápidas para copiar"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card border border-border text-foreground text-[11px] font-semibold hover:border-primary/40 transition-colors"
      >
        <MessageSquareText className="h-3 w-3 text-primary" /> Mensagens
        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 z-50 w-[320px] max-w-[90vw] rounded-xl border border-border bg-card shadow-xl p-2 space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-1">
              Copiar e colar no WhatsApp
            </p>
            {templates.map((t) => (
              <div key={t.key} className="rounded-lg border border-border/70 bg-background/40 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{t.label}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => copy(t.key, t.text)}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                      title="Copiar mensagem"
                    >
                      {copiedKey === t.key ? <Check className="h-3.5 w-3.5 text-status-green" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    {digits && (
                      <a
                        href={`https://wa.me/${digits}?text=${encodeURIComponent(t.text)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-semibold text-status-green hover:underline px-1"
                        title="Abrir no WhatsApp já preenchido"
                      >
                        Enviar
                      </a>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug mt-1 line-clamp-2">{t.text}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
