import { useState } from "react";
import { Copy, Check, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { shortName } from "@/lib/formatName";
import { Button } from "@/components/ui/button";
import { BottomSheet, IconButton, ListRow, SectionCard } from "@/components/ds";

interface Props {
  memberName?: string | null;
  phone?: string | null;
}

const buildTemplates = (first: string) => [
  {
    key: "agendar",
    label: "Agendar sessão",
    text: `Oi, ${first}, tudo bem? Vi aqui que você ainda não tem sessão agendada na plataforma. Vamos marcar? É só entrar no app do Liberty Begin, ir em "Agenda" > "Agendar sessão" e escolher o melhor horário pra você.`,
  },
  {
    key: "ferramenta",
    label: "Ferramenta disponível",
    text: `Oi, ${first}. Sua ferramenta já está disponível na área de Ferramentas dentro da plataforma. Dá uma olhada e me conta o que achou.`,
  },
  {
    key: "nps",
    label: "Lembrete de NPS",
    text: `Oi, ${first}. Passando pra lembrar de responder a pesquisa de satisfação (NPS) da sua última sessão. Leva menos de 2 minutos e a notificação está aí na plataforma. Sua opinião ajuda muito.`,
  },
  {
    key: "tarefas",
    label: "Tarefas pendentes",
    text: `Oi, ${first}. Você tem tarefas pendentes da última sessão na plataforma. Consegue avançar nelas até nosso próximo encontro? Qualquer dúvida, me chama por aqui.`,
  },
  {
    key: "lembrete",
    label: "Lembrete da sessão",
    text: `Oi, ${first}. Passando pra confirmar nossa sessão. O link de acesso está na sua agenda dentro da plataforma. Nos vemos lá.`,
  },
  {
    key: "retomada",
    label: "Retomar contato",
    text: `Oi, ${first}. Senti sua falta por aqui. Vamos retomar sua jornada? Me diz um horário que funcione pra você que eu te ajudo a agendar a próxima sessão.`,
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
    toast.success("Mensagem copiada");
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <MessageSquareText className="h-4 w-4" aria-hidden /> Mensagens
      </Button>

      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="Mensagens rápidas"
        description="Copie e cole no WhatsApp. O nome do membro já está preenchido."
        size="sm"
      >
        <SectionCard padding="none">
          {templates.map((t, i) => (
            <ListRow
              key={t.key}
              last={i === templates.length - 1}
              title={t.label}
              subtitle={<span className="line-clamp-2 whitespace-normal">{t.text}</span>}
              trailing={
                <>
                  {digits && (
                    <a
                      href={`https://wa.me/${digits}?text=${encodeURIComponent(t.text)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost btn-sm"
                    >
                      Enviar
                    </a>
                  )}
                  <IconButton aria-label={`Copiar mensagem: ${t.label}`} size="sm" onClick={() => copy(t.key, t.text)}>
                    {copiedKey === t.key ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </IconButton>
                </>
              }
            />
          ))}
        </SectionCard>
      </BottomSheet>
    </>
  );
};
