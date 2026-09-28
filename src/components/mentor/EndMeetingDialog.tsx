import { ConfirmDialog } from "@/components/ds";

type EndMeetingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
};

export function EndMeetingDialog({ open, onOpenChange, onConfirm, busy }: EndMeetingDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Encerrar a sessão para todos?"
      description="A chamada do Meet termina na hora para você e para o aluno. A transcrição chega sozinha no relatório (em geral 2–5 min) e a IA monta o rascunho."
      confirmLabel="Encerrar sessão"
      cancelLabel="Continuar na sessão"
      destructive
      loading={busy}
      onConfirm={onConfirm}
    />
  );
}
