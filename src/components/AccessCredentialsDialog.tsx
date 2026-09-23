import { useState, useEffect } from "react";
import { Copy, Check, KeyRound, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BottomSheet, Callout, IconButton, TextAreaField } from "@/components/ds";

export interface AccessCredentialsData {
  full_name: string;
  email: string;
  password: string;
  role: "mentor" | "liberty";
}

interface Props {
  data: AccessCredentialsData | null;
  onClose: () => void;
}

const CredentialRow = ({ label, value, highlight, onCopy, copied }: {
  label: string;
  value: string;
  highlight?: boolean;
  onCopy?: () => void;
  copied?: boolean;
}) => (
  <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-ds border bg-muted/30 border-border">
    <span className="text-xs text-muted-foreground shrink-0 w-14">{label}</span>
    <span className={`font-mono truncate flex-1 text-right ${highlight ? "text-sm font-semibold text-foreground" : "text-xs text-foreground"}`}>{value}</span>
    {onCopy && (
      <IconButton aria-label={`Copiar ${label.toLowerCase()}`} size="sm" onClick={onCopy}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </IconButton>
    )}
  </div>
);

export const AccessCredentialsDialog = ({ data, onClose }: Props) => {
  const [copied, setCopied] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "";
  const firstName = (data?.full_name || "").split(" ")[0] || "olá";
  const roleLabel = data?.role === "mentor" ? "Mentor" : "Membro";

  const message = data
    ? `Olá, ${firstName}.

Seu acesso de *${roleLabel}* na plataforma *Liberty Begin* já está liberado.

Link: ${loginUrl}
E-mail: ${data.email}
Senha: ${data.password}

Recomendamos alterar a senha após o primeiro login.
Qualquer dúvida, fale com nosso suporte.`
    : "";

  // Copia a mensagem automaticamente ao abrir
  useEffect(() => {
    if (!data) { setCopied(false); setCopiedPassword(false); return; }
    (async () => {
      try {
        await navigator.clipboard.writeText(message);
        setCopied(true);
        toast.success("Mensagem copiada para a área de transferência");
      } catch {
        setCopied(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success("Mensagem copiada");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione manualmente.");
    }
  };

  const handleCopyPassword = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.password);
      setCopiedPassword(true);
      toast.success("Senha copiada");
      setTimeout(() => setCopiedPassword(false), 2000);
    } catch {
      toast.error("Não foi possível copiar a senha.");
    }
  };

  return (
    <BottomSheet
      open={!!data}
      onOpenChange={(o) => !o && onClose()}
      title={
        <span className="inline-flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden /> Acesso de {roleLabel.toLowerCase()} liberado
        </span>
      }
      description="Envie o e-mail e a senha temporária para a pessoa. Ela pode trocar a senha depois do primeiro login."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
          <Button onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copiado" : "Copiar mensagem"}
          </Button>
        </>
      }
    >
      {data && (
        <div className="space-y-4">
          <div className="space-y-2">
            <CredentialRow label="Link" value={loginUrl} />
            <CredentialRow label="E-mail" value={data.email} />
            <CredentialRow label="Senha" value={data.password} highlight onCopy={handleCopyPassword} copied={copiedPassword} />
          </div>

          <Callout tone="warning" icon={AlertTriangle}>
            Esta senha não será exibida de novo. Copie agora ou gere um novo acesso mais tarde.
          </Callout>

          <TextAreaField
            label="Mensagem pronta para enviar"
            readOnly
            value={message}
            onFocus={(e) => e.currentTarget.select()}
            className="h-44 text-xs font-mono resize-none"
          />
        </div>
      )}
    </BottomSheet>
  );
};
