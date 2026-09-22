import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Copy, Check, KeyRound } from "lucide-react";
import { toast } from "sonner";

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

export const AccessCredentialsDialog = ({ data, onClose }: Props) => {
  const [copied, setCopied] = useState(false);

  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "";
  const firstName = (data?.full_name || "").split(" ")[0] || "olá";
  const roleLabel = data?.role === "mentor" ? "Mentor" : "Membro";

  const message = data
    ? `Olá, ${firstName}! 👋

Seu acesso de *${roleLabel}* na plataforma *Liberty Begin* já está liberado.

🔗 Link: ${loginUrl}
📧 E-mail: ${data.email}
🔒 Senha: ${data.password}

Recomendamos alterar a senha após o primeiro login.
Qualquer dúvida, fale com nosso suporte.`
    : "";

  // Auto-copy on open
  useEffect(() => {
    if (!data) { setCopied(false); return; }
    (async () => {
      try {
        await navigator.clipboard.writeText(message);
        setCopied(true);
        toast.success("Mensagem copiada para a área de transferência");
      } catch {
        setCopied(false);
      }
    })();
  }, [data]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success("Copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione manualmente.");
    }
  };

  return (
    <Dialog open={!!data} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" /> Acesso de {roleLabel} liberado
          </DialogTitle>
        </DialogHeader>
        {data && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2 text-sm">
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/30 border border-border">
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Link</span>
                <span className="font-mono text-xs text-foreground truncate">{loginUrl}</span>
              </div>
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/30 border border-border">
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">E-mail</span>
                <span className="font-mono text-xs text-foreground truncate">{data.email}</span>
              </div>
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20">
                <span className="text-[11px] text-primary uppercase tracking-wider">Senha</span>
                <span className="font-mono text-sm text-foreground font-semibold">{data.password}</span>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Mensagem pronta para enviar
              </label>
              <textarea
                readOnly
                value={message}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full h-44 bg-card border border-border rounded-lg p-3 text-xs text-foreground font-mono focus:border-primary/20 focus:outline-none resize-none"
              />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground"
          >
            Fechar
          </button>
          <button
            onClick={handleCopy}
            className="btn-silver text-xs px-4 py-2 flex items-center gap-2"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copiado!" : "Copiar mensagem"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
