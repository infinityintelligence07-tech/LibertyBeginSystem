import { useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { bookingRuleErrorMessage } from "@/lib/bookingRules";
import {
  MENTOR_CONFIRMATION_WINDOW_HOURS,
  bookingRequiresReport,
  daysSinceBookingEnd,
  getMentorPendingAction,
  isPendingConfirmationOverdue,
} from "@/lib/bookingStatus";
import { Button } from "@/components/ui/button";
import { BottomSheet, TextAreaField } from "@/components/ds";
import { cn } from "@/lib/utils";

/**
 * Prefixos de queries react-query que dependem do status de uma sessão do mentor.
 * Como a app usa `staleTime 60s` e `refetchOnMount false`, toda mutação em `bookings`
 * precisa invalidar estes prefixos para as telas refletirem a mudança.
 */
export const MENTOR_BOOKING_QUERY_PREFIXES = [
  "mentor-bookings",
  "mentor-dash-bookings",
  "mentor-all-bookings",
  "mentor-results-bookings",
  "mentor-alunos-all-bookings",
  "mentor-alunos-reports",
  "mentor-availability-bookings",
  "booking-reports-check-by-mentor",
  "dash-reports",
  "mentor-action-banner",
  "notifications-bell",
  "booking-detail",
  "booking-report",
  "admin-members",
  "admin-bookings",
] as const;

export const invalidateMentorBookingQueries = (queryClient: QueryClient) =>
  Promise.all(
    MENTOR_BOOKING_QUERY_PREFIXES.map((prefix) => queryClient.invalidateQueries({ queryKey: [prefix] })),
  );

type BackendError = { message?: string | null; details?: string | null } | null | undefined;

/** Traduz erros do banco (triggers/constraints) para mensagens amigáveis em PT. */
export const translateBookingError = (error: BackendError, fallback = "Não foi possível atualizar a sessão.") => {
  const ruleMessage = bookingRuleErrorMessage(error);
  if (ruleMessage) return ruleMessage;
  return error?.message ? `${fallback} ${error.message}` : fallback;
};

/** Texto de apoio exibido junto das sessões "A confirmar" (visão do mentor). */
export const MENTOR_PENDING_CONFIRMATION_HINT =
  `Confirme até ${MENTOR_CONFIRMATION_WINDOW_HOURS}h após a sessão. Sem confirmação ela não conta como realizada nem entra no seu repasse.`;

export const formatDaysSince = (days: number) => {
  if (days <= 0) return "hoje";
  if (days === 1) return "há 1 dia";
  return `há ${days} dias`;
};

/**
 * Ações do mentor sobre uma sessão (marcar realizada / não realizada), com
 * invalidação de todas as queries afetadas e tradução de erros do banco.
 */
export const useMentorBookingActions = () => {
  const queryClient = useQueryClient();
  const [actingId, setActingId] = useState<string | null>(null);

  const markCompleted = async (bookingId: string) => {
    setActingId(bookingId);
    const { data, error } = await supabase
      .from("bookings")
      .update({ status: "completed" })
      .eq("id", bookingId)
      .select("id");
    setActingId(null);
    if (error) {
      toast.error(translateBookingError(error));
      return false;
    }
    if (!data || data.length === 0) {
      toast.error("Você não tem permissão para alterar esta sessão.");
      return false;
    }
    toast.success("Sessão confirmada como realizada.");
    await invalidateMentorBookingQueries(queryClient);
    return true;
  };

  const markNotRealized = async (bookingId: string, reason: string) => {
    setActingId(bookingId);
    const { data, error } = await supabase
      .from("bookings")
      .update({ status: "not_realized", cancellation_reason: reason.trim() || "Não realizada" })
      .eq("id", bookingId)
      .select("id");
    setActingId(null);
    if (error) {
      toast.error(translateBookingError(error));
      return false;
    }
    if (!data || data.length === 0) {
      toast.error("Você não tem permissão para alterar esta sessão.");
      return false;
    }
    toast.success("Sessão marcada como não realizada. O administrador foi avisado.");
    await invalidateMentorBookingQueries(queryClient);
    return true;
  };

  return { actingId, markCompleted, markNotRealized };
};

type NotRealizedDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<boolean> | boolean;
  busy?: boolean;
  title?: string;
  description?: string;
};

/** Diálogo para registrar que a sessão não aconteceu, com motivo obrigatório. */
export const NotRealizedDialog = ({
  open,
  onOpenChange,
  onConfirm,
  busy,
  title = "Marcar sessão como não realizada",
  description = "Use quando a sessão não aconteceu. Ela sai das realizadas, libera a vaga na jornada e o administrador é avisado para revisar.",
}: NotRealizedDialogProps) => {
  const [reason, setReason] = useState("");
  const canConfirm = reason.trim().length >= 3 && !busy;

  const handleOpenChange = (next: boolean) => {
    if (!next) setReason("");
    onOpenChange(next);
  };

  const confirm = async () => {
    if (!canConfirm) return;
    const ok = await onConfirm(reason.trim());
    if (ok) handleOpenChange(false);
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      description={description}
      size="sm"
      locked={busy}
      footer={
        <>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={!canConfirm}>
            {busy ? <Loader2 className="animate-spin" /> : <AlertCircle />}
            Confirmar não realizada
          </Button>
        </>
      }
    >
      <TextAreaField
        id="not-realized-reason"
        label="Motivo"
        hint="Obrigatório. O administrador verá este texto."
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Ex.: o membro não compareceu, remarcamos fora da plataforma..."
        className="min-h-[96px] resize-y"
        required
      />
    </BottomSheet>
  );
};

type PendingBooking = {
  id: string;
  status?: string | null;
  scheduled_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  is_retroactive?: boolean | null;
  report_required?: boolean | null;
};

type MentorPendingActionsProps = {
  booking: PendingBooking;
  hasReport: boolean;
  onFillReport: () => void;
  onMarkCompleted: () => void;
  onMarkNotRealized: () => void;
  busy?: boolean;
  /** Mostra o texto de apoio e o "há N dias". */
  withHint?: boolean;
  className?: string;
};

/**
 * Botões de fechamento de uma sessão pendente (D1):
 * - `confirm` → "Preencher relatório" (se exige relatório) ou "Marcar realizada", e "Não realizada"
 * - `report`  → "Preencher relatório"
 * Não renderiza nada quando não há pendência.
 */
export const MentorPendingActions = ({
  booking,
  hasReport,
  onFillReport,
  onMarkCompleted,
  onMarkNotRealized,
  busy,
  withHint = false,
  className = "",
}: MentorPendingActionsProps) => {
  const action = getMentorPendingAction(booking, hasReport);
  if (!action) return null;

  const requiresReport = bookingRequiresReport(booking);
  const days = daysSinceBookingEnd(booking);
  const overdue = isPendingConfirmationOverdue(booking);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2 flex-wrap">
        {action === "confirm" && requiresReport && (
          <Button size="sm" disabled={busy} onClick={(e) => { e.stopPropagation(); onFillReport(); }}>
            <FileText /> Preencher relatório
          </Button>
        )}
        {action === "confirm" && !requiresReport && (
          <Button size="sm" disabled={busy} onClick={(e) => { e.stopPropagation(); onMarkCompleted(); }}>
            {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Marcar realizada
          </Button>
        )}
        {action === "confirm" && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={(e) => { e.stopPropagation(); onMarkNotRealized(); }}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <AlertCircle /> Não realizada
          </Button>
        )}
        {action === "report" && (
          <Button size="sm" disabled={busy} onClick={(e) => { e.stopPropagation(); onFillReport(); }}>
            <FileText /> Preencher relatório
          </Button>
        )}
      </div>
      {withHint && action === "confirm" && (
        <p className={cn("text-xs leading-relaxed", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
          {overdue ? `Pendente ${formatDaysSince(days)}. O administrador já foi alertado. ` : `Sessão encerrada ${formatDaysSince(days)}. `}
          {MENTOR_PENDING_CONFIRMATION_HINT}
        </p>
      )}
      {withHint && action === "report" && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          Sessão confirmada como realizada {formatDaysSince(days)}. Falta enviar o relatório para o membro.
        </p>
      )}
    </div>
  );
};
