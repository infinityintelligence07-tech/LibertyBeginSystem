import { useState, type ReactNode } from "react";
import { ArrowLeft, Check, Copy, Link2, Loader2, Moon, Presentation, Send, Sparkles, Sun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BottomSheet, ConfirmDialog, IconButton } from "@/components/ds";
import { Logo } from "@/components/Logo";
import { useTheme } from "@/hooks/useTheme";
import { copyText } from "@/lib/meetingWhatsApp";
import { BOARD_ORDER, buildBrandPrompt, filledCount, type BrandBookData } from "@/lib/brandBook";
import { BoardCanvas } from "./BoardCanvas";
import { BrandBookBoard } from "./BrandBookBoard";
import { BrandIntro } from "./BrandIntro";

export type BrandBookMode = "edit" | "member" | "public";

interface Props {
  mode: BrandBookMode;
  data: BrandBookData;
  onPatch?: (fn: (d: BrandBookData) => BrandBookData) => void;
  subtitle?: string;
  ownerLabel?: string;
  onExit?: () => void;
  saving?: boolean;
  savedAt?: Date | null;
  shareUrl?: string;
  completed?: boolean;
  completing?: boolean;
  onComplete?: () => Promise<void> | void;
  /** Conteúdo extra no topo (ex.: CTA de login no modo público). */
  banner?: ReactNode;
}

const TOP = 72;

export const BrandBookWorkspace = ({
  mode,
  data,
  onPatch,
  subtitle,
  ownerLabel,
  onExit,
  saving,
  savedAt,
  shareUrl,
  completed,
  completing,
  onComplete,
  banner,
}: Props) => {
  const { theme, toggleTheme } = useTheme();
  const [promptOpen, setPromptOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const readOnly = mode !== "edit";
  const prompt = buildBrandPrompt(data, data.nome);
  const filled = filledCount(data);

  const copyPrompt = async () => {
    await copyText(prompt);
    setPromptCopied(true);
    toast.success("Prompt copiado", { description: "Cole no ChatGPT, Claude ou Gemini para alimentar a IA com a marca." });
    setTimeout(() => setPromptCopied(false), 1800);
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    await copyText(shareUrl);
    toast.success("Link copiado", {
      description: "O aluno logado abre o quadro completo. Quem não é o aluno vê só a leitura, sem plano de ação.",
    });
  };

  const status = mode === "edit" ? (saving ? "Salvando" : savedAt ? "Salvo" : "") : "";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header
        className="absolute inset-x-0 top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-4">
          {onExit ? (
            <IconButton variant="outline" onClick={onExit} aria-label="Voltar">
              <ArrowLeft className="h-4 w-4" />
            </IconButton>
          ) : (
            <Logo size="sm" iconOnly className="h-9 w-9" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">Brand Book{data.nome ? ` · ${data.nome}` : ""}</p>
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              {saving && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
              {[subtitle, `${filled} de ${BOARD_ORDER.length} etapas`, status].filter(Boolean).join(" · ")}
            </p>
          </div>

          <IconButton
            variant="outline"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
            className="hidden sm:inline-flex"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </IconButton>

          <Button variant="outline" onClick={() => setIntroOpen(true)} className="h-11 gap-2 sm:h-10" aria-label="Apresentar o que é branding">
            <Presentation className="h-4 w-4" />
            <span className="hidden lg:inline">O que é branding</span>
          </Button>

          {shareUrl && (
            <Button variant="outline" onClick={copyLink} className="h-11 gap-2 sm:h-10" aria-label="Copiar link do Brand Book">
              <Link2 className="h-4 w-4" />
              <span className="hidden md:inline">Copiar link</span>
            </Button>
          )}

          {mode !== "public" && (
            <Button variant={mode === "edit" ? "outline" : "default"} onClick={() => setPromptOpen(true)} className="h-11 gap-2 sm:h-10">
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Gerar prompt para IA</span>
              <span className="sm:hidden">Prompt</span>
            </Button>
          )}

          {mode === "edit" && onComplete && (
            <Button onClick={() => (completed ? onComplete() : setConfirmOpen(true))} disabled={completing} className="h-11 gap-2 sm:h-10">
              {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : completed ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              <span className="hidden sm:inline">{completed ? "Salvar e sair" : "Concluir e enviar"}</span>
            </Button>
          )}
        </div>
        {banner}
      </header>

      <BoardCanvas topInset={TOP + (banner ? 48 : 0)}>
        <BrandBookBoard data={data} readOnly={readOnly} onPatch={onPatch} showPlan={mode !== "public"} ownerLabel={ownerLabel} onPresent={() => setIntroOpen(true)} />
      </BoardCanvas>

      <BrandIntro open={introOpen} onClose={() => setIntroOpen(false)} />

      <BottomSheet
        open={promptOpen}
        onOpenChange={setPromptOpen}
        size="lg"
        title="Prompt para a sua IA"
        description="Copie e cole no início de uma conversa com o ChatGPT, Claude ou Gemini. A IA passa a escrever com a identidade da marca."
        footer={
          <>
            <Button variant="outline" onClick={() => setPromptOpen(false)} className="h-11">
              Fechar
            </Button>
            <Button onClick={copyPrompt} className="h-11 gap-2">
              {promptCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {promptCopied ? "Copiado" : "Copiar prompt"}
            </Button>
          </>
        }
      >
        <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-ds-lg border border-border bg-muted/40 p-4 font-sans text-sm leading-relaxed text-foreground">
          {prompt}
        </pre>
      </BottomSheet>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Concluir e enviar ao aluno?"
        description="O Brand Book aparece na área de ferramentas do aluno e ele recebe uma notificação. Você ainda pode editar depois."
        confirmLabel="Concluir e enviar"
        loading={completing}
        onConfirm={async () => {
          await onComplete?.();
          setConfirmOpen(false);
        }}
      />
    </div>
  );
};
