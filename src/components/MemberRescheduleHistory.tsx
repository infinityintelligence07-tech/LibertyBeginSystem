import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout, ConfirmDialog, SectionCard, SectionHeader } from "@/components/ds";
import { toast } from "sonner";
import {
  RESCHEDULE_COURTESY_LIMIT,
  fetchRescheduleState,
  registerStudentUnavailability,
  rescheduleResultMessage,
  settleRescheduleCharge,
  type RescheduleEvent,
} from "@/lib/rescheduleCredits";

function dayLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, "dd/MM/yyyy", { locale: ptBR });
}

function stamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

function eventLine(event: RescheduleEvent) {
  const when = [dayLabel(event.previous_date), dayLabel(event.new_date)].filter(Boolean).join(" para ");
  const session = event.session_name || "Sessão";
  if (event.kind === "charge") {
    const paid = event.charge_settled_at ? "Cobrança registrada" : "Cobrar R$ 1.000";
    return `${session}${when ? ` · ${when}` : ""}. ${paid}.`;
  }
  return `${session}${when ? ` · ${when}` : ""}. Crédito de reagendamento.`;
}

export function MemberRescheduleHistory({
  memberId,
  canWrite,
}: {
  memberId: string;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [confirmRegister, setConfirmRegister] = useState(false);
  const [confirmSettle, setConfirmSettle] = useState(false);
  const query = useQuery({
    queryKey: ["member-reschedule", memberId],
    queryFn: () => fetchRescheduleState(memberId),
  });
  const events = query.data?.events ?? [];
  const courtesyUsed = events.filter((event) => event.kind === "courtesy").length;
  const locked = query.data?.locked === true;
  const pendingCharge = events.some((event) => event.kind === "charge" && !event.charge_settled_at);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["member-reschedule", memberId] });

  const register = async () => {
    if (!canWrite || busy) return;
    setBusy(true);
    try {
      const result = await registerStudentUnavailability({ profileId: memberId });
      toast.success(rescheduleResultMessage(result));
      refresh();
    } catch {
      toast.error("Não foi possível registrar o reagendamento");
    } finally {
      setBusy(false);
    }
  };

  const settle = async () => {
    if (!canWrite || busy) return;
    setBusy(true);
    try {
      await settleRescheduleCharge(memberId);
      toast.success(pendingCharge ? "Cobrança registrada. O aluno pode agendar de novo." : "Agendamento liberado.");
      refresh();
    } catch {
      toast.error("Não foi possível liberar o agendamento");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard className="space-y-3">
      <SectionHeader
        as="h2"
        title="Reagendamentos"
        description={`${Math.min(courtesyUsed, RESCHEDULE_COURTESY_LIMIT)} de ${RESCHEDULE_COURTESY_LIMIT} créditos usados por indisponibilidade do aluno.`}
      />
      {locked ? (
        <Callout tone="warning" icon={Lock} title="Agendamentos travados">
          {pendingCharge
            ? "Há uma cobrança de R$ 1.000 em aberto. Depois de cobrar, libere o agendamento do aluno."
            : "Os 3 créditos acabaram. O próximo reagendamento por indisponibilidade do aluno custa R$ 1.000."}
          {canWrite ? (
            <div className="pt-2">
              <Button type="button" className="min-h-11" onClick={() => setConfirmSettle(true)} disabled={busy}>
                {pendingCharge ? "Cobrança feita, liberar" : "Liberar agendamento"}
              </Button>
            </div>
          ) : null}
        </Callout>
      ) : null}
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando histórico</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum reagendamento por indisponibilidade do aluno.</p>
      ) : (
        <ul className="max-h-48 space-y-2 overflow-y-auto">
          {events.map((event) => (
            <li key={event.id} className="min-w-0">
              <p className="text-xs tabular-nums text-muted-foreground">
                {stamp(event.created_at)}
                {event.created_by_name ? ` · ${event.created_by_name}` : ""}
              </p>
              <p className="break-words text-sm text-foreground">{eventLine(event)}</p>
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setConfirmRegister(true)} disabled={busy}>
          Registrar indisponibilidade do aluno
        </Button>
      ) : null}
      <ConfirmDialog
        open={confirmRegister}
        onOpenChange={setConfirmRegister}
        title="Registrar indisponibilidade do aluno?"
        description="Isso consome um dos 3 créditos. No quarto reagendamento, a cobrança é de R$ 1.000 e o aluno deixa de agendar até a liberação."
        confirmLabel="Registrar"
        loading={busy}
        onConfirm={async () => {
          await register();
          setConfirmRegister(false);
        }}
      />
      <ConfirmDialog
        open={confirmSettle}
        onOpenChange={setConfirmSettle}
        title={pendingCharge ? "Registrar a cobrança de R$ 1.000?" : "Liberar o agendamento?"}
        description="O aluno volta a poder agendar. O histórico deste reagendamento permanece."
        confirmLabel={pendingCharge ? "Cobrança feita" : "Liberar"}
        loading={busy}
        onConfirm={async () => {
          await settle();
          setConfirmSettle(false);
        }}
      />
    </SectionCard>
  );
}
