import { ConfirmDialog } from "@/components/ds";
import { mentorAiReportEnabled } from "@/lib/mentorAiReport";

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
      description={
        mentorAiReportEnabled
          ? "A chamada do Meet termina na hora para você e para o aluno. A transcrição chega sozinha no relatório (em geral 2–5 min) e a IA monta o rascunho."
          : "A chamada do Meet termina na hora para você e para o aluno. O relatório você escreve na tela da sessão."
      }
      confirmLabel="Encerrar sessão"
      cancelLabel="Continuar na sessão"
      destructive
      loading={busy}
      onConfirm={onConfirm}
    />
  );
}
