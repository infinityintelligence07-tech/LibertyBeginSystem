import { useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { bookingRuleErrorMessage } from "@/lib/bookingRules";
import { KICKOFF_MAX_REALIZED_SESSIONS, KICKOFF_NOT_ALLOWED_MESSAGE } from "@/lib/sessionProgress";
import { invokeProvisionMeeting } from "@/lib/meetingWhatsApp";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookingDetail, MemberWithProgress } from "@/hooks/useAdminData";
import { shortName } from "@/lib/formatName";
import {
  CheckCircle2, Target, AlertTriangle, Pencil, Trash2, Plus, CalendarIcon, Save, X, RotateCcw, Clock,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BottomSheet, ConfirmDialog, DateBlock, EmptyState, IconButton, ListRow, SectionCard, SectionHeader,
  SelectField, StatusPill, TextField,
} from "@/components/ds";
import { cn } from "@/lib/utils";

/**
 * Detalhe de booking com os campos extras que o editor usa quando disponíveis
 * (o `BookingDetail` de `useAdminData` só traz o básico).
 */
export type EditorBookingDetail = BookingDetail & {
  start_time?: string | null;
  end_time?: string | null;
  is_retroactive?: boolean | null;
  report_required?: boolean | null;
};

type SessionOption = {
  id: string;
  name: string;
  order: number;
  is_active?: boolean;
  is_kickoff?: boolean | null;
  duration_minutes?: number | null;
};

interface Props {
  member: MemberWithProgress;
  sessions: SessionOption[];
  mentors: { id: string; full_name: string }[];
  filterKey: string | null;
  onReportClick: (booking_id: string, session_name: string) => void;
  /** Sessões que já passaram do horário e o mentor ainda não confirmou ("A confirmar"). */
  pendingConfirmationSessions?: EditorBookingDetail[];
  /** Called after any booking add/edit/delete so callers can refresh local state. */
  onChanged?: () => void;
}

type EditingBooking = {
  booking_id: string;
  session_id: string;
  session_name: string;
  mentor_id: string;
  mentor_name: string;
  date: string;
  status: string;
};

type NewBooking = {
  session_id: string;
  mentor_id: string;
  date: Date | undefined;
  status: "completed" | "scheduled";
};

/** Status que o enum `booking_status` do banco aceita. */
type PersistableStatus = "scheduled" | "completed" | "not_realized" | "cancelled" | "pending_approval";

/** Ação destrutiva/irreversível aguardando confirmação no `ConfirmDialog`. */
type PendingAction =
  | { kind: "delete"; cs: EditorBookingDetail }
  | { kind: "close"; cs: EditorBookingDetail; status: "completed" | "not_realized" }
  | null;

const STATUS_OPTIONS: { value: PersistableStatus; label: string }[] = [
  { value: "scheduled", label: "Agendada" },
  { value: "completed", label: "Realizada" },
  { value: "not_realized", label: "Não realizada" },
  { value: "cancelled", label: "Cancelada" },
];

const toInputDate = (d: Date | undefined) => (d ? format(d, "yyyy-MM-dd") : "");
const fromInputDate = (v: string) => (v ? new Date(v + "T12:00:00") : undefined);

/**
 * Converte o status EFETIVO (que pode ser `awaiting_report`, `pending_confirmation`, `rescheduled`)
 * no status bruto que o banco aceita gravar.
 */
export const toPersistableStatus = (status: string | null | undefined): PersistableStatus => {
  switch (status) {
    case "awaiting_report":
    case "completed":
      return "completed";
    case "pending_confirmation":
    case "rescheduled":
    case "scheduled":
    case undefined:
    case null:
    case "":
      return "scheduled";
    case "not_realized":
      return "not_realized";
    case "cancelled":
      return "cancelled";
    case "pending_approval":
      return "pending_approval";
    default:
      return "scheduled";
  }
};

const DEFAULT_SESSION_DURATION_MINUTES = 90;

/** Soma `durationMinutes` a um horário `HH:MM[:SS]` e devolve `HH:MM`. */
export const computeEndTime = (startTime: string, durationMinutes?: number | null) => {
  const [hh = 0, mm = 0] = startTime.slice(0, 5).split(":").map(Number);
  const total = hh * 60 + mm + (durationMinutes || DEFAULT_SESSION_DURATION_MINUTES);
  const endH = Math.floor(total / 60) % 24;
  const endM = total % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
};

type BackendError = { message?: string | null; details?: string | null; hint?: string | null } | null | undefined;

/** Mensagem amigável (PT) para os erros que o banco devolve nas regras de agendamento. */
export const translateBookingError = (error: BackendError): string | null => {
  const ruleMessage = bookingRuleErrorMessage(error);
  if (ruleMessage) return ruleMessage;
  const text = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`;
  if (text.includes("invalid input syntax for type uuid")) return "Selecione um mentor válido.";
  return null;
};

const formatDateBR = (date: string) => new Date(date + "T12:00:00").toLocaleDateString("pt-BR");

export const MemberSessionEditor = ({
  member, sessions, mentors, filterKey, onReportClick, pendingConfirmationSessions, onChanged,
}: Props) => {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<EditingBooking | null>(null);
  const [editDate, setEditDate] = useState<Date | undefined>();
  const [editMentor, setEditMentor] = useState("");
  const [editSessionId, setEditSessionId] = useState("");
  const [editStatus, setEditStatus] = useState<PersistableStatus>("scheduled");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newBooking, setNewBooking] = useState<NewBooking>({ session_id: "", mentor_id: "", date: undefined, status: "completed" });
  const [adding, setAdding] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-members"] });
    queryClient.invalidateQueries({ queryKey: ["member-bookings-manager"] });
    onChanged?.();
  };

  const pendingSessions = pendingConfirmationSessions ?? [];
  const completedInView = filterKey
    ? member.completed_sessions.filter((cs) => cs.date.startsWith(filterKey))
    : member.completed_sessions;
  const scheduledInView = filterKey
    ? member.scheduled_sessions.filter((cs) => cs.date.startsWith(filterKey))
    : member.scheduled_sessions;
  const pendingInView = filterKey
    ? pendingSessions.filter((cs) => cs.date.startsWith(filterKey))
    : pendingSessions;
  const allDoneOrScheduledIds = new Set([
    ...member.completed_sessions.map((s) => s.session_id),
    ...member.scheduled_sessions.map((s) => s.session_id),
    ...pendingSessions.map((s) => s.session_id),
  ]);
  const isLiberty = member.member_tier === "liberty";
  const isJourneySessionOption = (s: SessionOption) => {
    if (s.is_active === false) return false;      // ignora sessões inativas (ex.: "Mapa do Negócio" antiga)
    if ((s.order ?? 0) <= 0) return false;         // ignora Onboarding / não-jornada
    if (!isLiberty && (s.order ?? 0) >= 100) return false; // sessões exclusivas Liberty não contam para Begin
    return true;
  };
  const selectableSessions = sessions.filter(isJourneySessionOption);
  const remaining = selectableSessions.filter((s) => !allDoneOrScheduledIds.has(s.id));

  // Regra D2: Mapeamento só até a 3ª sessão realizada (realizadas + a confirmar). Mesmo critério do banco.
  const realizedForKickoff = member.completed_sessions.length + pendingSessions.length;
  const kickoffAllowed = realizedForKickoff <= KICKOFF_MAX_REALIZED_SESSIONS;
  const sessionById = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);

  const startEdit = (b: EditorBookingDetail) => {
    setEditing({
      booking_id: b.booking_id,
      session_id: b.session_id,
      session_name: b.session_name,
      mentor_id: b.mentor_id || "",
      mentor_name: b.mentor_name,
      date: b.date,
      status: b.status,
    });
    setEditDate(new Date(b.date + "T12:00:00"));
    // Usa o id do mentor; cai para o nome só em dados antigos sem mentor_id.
    const byName = mentors.find((mt) => mt.full_name === b.mentor_name);
    setEditMentor(b.mentor_id || byName?.id || "");
    setEditSessionId(b.session_id);
    setEditStatus(toPersistableStatus(b.status));
  };

  // Garante que o mentor atual apareça no select mesmo se estiver inativo (fora da lista).
  const mentorOptions = useMemo(() => {
    if (!editing?.mentor_id || mentors.some((m) => m.id === editing.mentor_id)) return mentors;
    return [...mentors, { id: editing.mentor_id, full_name: editing.mentor_name || "Mentor (inativo)" }];
  }, [mentors, editing]);

  const handleSave = async () => {
    if (!editing) return;
    if (!editMentor) {
      toast.error("Selecione o mentor da sessão.");
      return;
    }
    setSaving(true);
    try {
      const dateStr = editDate ? format(editDate, "yyyy-MM-dd") : editing.date;
      const nextSessionId = editSessionId || editing.session_id;
      const sessionChanged = nextSessionId !== editing.session_id;
      const nextSession = sessionById.get(nextSessionId);
      const currentDetail = [...member.completed_sessions, ...member.scheduled_sessions, ...pendingSessions]
        .find((b) => b.booking_id === editing.booking_id) as EditorBookingDetail | undefined;
      const startTime = currentDetail?.start_time || null;

      const { error } = await supabase
        .from("bookings")
        .update({
          scheduled_date: dateStr,
          mentor_id: editMentor,
          session_id: nextSessionId,
          // Grava sempre o status bruto do enum; o efetivo (awaiting_report / pending_confirmation) é derivado.
          status: editStatus,
          ...(editStatus === "completed" ? { approval_required: false } : {}),
          // Ao trocar a sessão, recalcula o término pela duração da nova sessão (Mapeamento = 3h).
          ...(sessionChanged && startTime ? { end_time: computeEndTime(startTime, nextSession?.duration_minutes) } : {}),
        })
        .eq("id", editing.booking_id);
      if (error) throw error;
      if (!currentDetail?.is_retroactive) {
        supabase.functions.invoke("google-calendar-sync", { body: { booking_id: editing.booking_id } }).catch((e) => {
          console.warn("google-calendar-sync falhou:", e);
        });
      }
      toast.success("Sessão atualizada");
      setEditing(null);
      invalidateAll();
    } catch (e) {
      const err = e as BackendError;
      toast.error(translateBookingError(err) || "Erro ao salvar: " + (err?.message ?? "erro desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  /** Abre o diálogo de confirmação; a ação em si roda em `performDelete` / `performClosePending`. */
  const handleDelete = (cs: EditorBookingDetail) => setPendingAction({ kind: "delete", cs });
  const handleClosePending = (cs: EditorBookingDetail, status: "completed" | "not_realized") =>
    setPendingAction({ kind: "close", cs, status });

  const performDelete = async (cs: BookingDetail) => {
    setDeleting(cs.booking_id);
    try {
      // booking_reports e session_tasks são apagados em cascata pelo banco.
      const { error } = await supabase.from("bookings").delete().eq("id", cs.booking_id);
      if (error) throw error;
      toast.success("Sessão removida");
      invalidateAll();
    } catch (e) {
      const err = e as BackendError;
      toast.error("Erro ao remover: " + (err?.message ?? "erro desconhecido"));
    } finally {
      setDeleting(null);
    }
  };

  /** Fechamento de uma sessão "A confirmar": realizada (sem relatório) ou não realizada. */
  const performClosePending = async (cs: EditorBookingDetail, status: "completed" | "not_realized") => {
    setClosing(cs.booking_id);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ status, ...(status === "completed" ? { approval_required: false } : {}) })
        .eq("id", cs.booking_id);
      if (error) throw error;
      toast.success(status === "completed" ? "Sessão marcada como realizada" : "Sessão marcada como não realizada");
      invalidateAll();
    } catch (e) {
      const err = e as BackendError;
      toast.error(translateBookingError(err) || "Erro ao atualizar: " + (err?.message ?? "erro desconhecido"));
    } finally {
      setClosing(null);
    }
  };

  const handleAdd = async () => {
    if (!newBooking.session_id || !newBooking.mentor_id || !newBooking.date) {
      toast.error("Preencha todos os campos");
      return;
    }
    const session = sessionById.get(newBooking.session_id);
    // Lançamento histórico: sessão que já aconteceu fora da plataforma.
    // Conta no progresso, não exige relatório e não vai para o Google Agenda.
    const isRetroactive = newBooking.status === "completed";
    if (!isRetroactive && session?.is_kickoff && !kickoffAllowed) {
      toast.error(KICKOFF_NOT_ALLOWED_MESSAGE);
      return;
    }
    setAdding(true);
    try {
      const startTime = "09:00";
      const { data: created, error } = await supabase.from("bookings").insert({
        liberty_id: member.id,
        mentor_id: newBooking.mentor_id,
        session_id: newBooking.session_id,
        scheduled_date: format(newBooking.date, "yyyy-MM-dd"),
        start_time: startTime,
        end_time: computeEndTime(startTime, session?.duration_minutes),
        status: newBooking.status,
        is_retroactive: isRetroactive,
        approval_required: false,
      }).select("id").single();
      if (error) throw error;
      if (created?.id && newBooking.status === "scheduled") {
        void invokeProvisionMeeting(created.id).then((r) => {
          if (r && !r.ok) {
            toast.warning(r.error || r.message || "Sala Meet não criada — tente provisionar de novo.");
          }
        });
        supabase.functions.invoke("google-calendar-sync", { body: { booking_id: created.id } }).catch((e) => {
          console.warn("google-calendar-sync falhou:", e);
        });
      }
      toast.success("Sessão adicionada");
      setAddOpen(false);
      setNewBooking({ session_id: "", mentor_id: "", date: undefined, status: "completed" });
      invalidateAll();
    } catch (e) {
      const err = e as BackendError;
      console.error("Erro ao adicionar sessão:", e);
      const detail = err?.message || err?.details || err?.hint || JSON.stringify(e);
      toast.error(translateBookingError(err) || "Erro ao adicionar: " + detail);
    } finally {
      setAdding(false);
    }
  };

  const requiresReport = (cs: EditorBookingDetail) => !cs.is_retroactive && cs.report_required !== false;

  const editStatusOptions = editStatus === "pending_approval"
    ? [...STATUS_OPTIONS, { value: "pending_approval" as PersistableStatus, label: "Aguardando confirmação" }]
    : STATUS_OPTIONS;

  const renderBookingRow = (
    cs: EditorBookingDetail,
    type: "completed" | "scheduled" | "pending_confirmation",
    last: boolean,
  ) => {
    const isDeleting = deleting === cs.booking_id;
    const isClosing = closing === cs.booking_id;

    return (
      <ListRow
        key={cs.booking_id}
        last={last}
        leading={<DateBlock date={cs.date} tone={type === "pending_confirmation" ? "muted" : "default"} />}
        title={cs.session_name}
        subtitle={
          <span className="inline-flex items-center gap-2 flex-wrap">
            <span>{shortName(cs.mentor_name)}</span>
            <StatusPill status={cs.status} size="sm" />
          </span>
        }
        trailing={
          <>
            {type === "completed" && (
              <Button variant="ghost" size="sm" onClick={() => onReportClick(cs.booking_id, cs.session_name)}>
                Relatório
              </Button>
            )}
            {type === "pending_confirmation" && (
              <>
                {requiresReport(cs) ? (
                  <Button variant="ghost" size="sm" onClick={() => onReportClick(cs.booking_id, cs.session_name)}>
                    Preencher relatório
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isClosing}
                    onClick={() => handleClosePending(cs, "completed")}
                  >
                    Marcar realizada
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isClosing}
                  onClick={() => handleClosePending(cs, "not_realized")}
                >
                  Não realizada
                </Button>
              </>
            )}
            <IconButton aria-label={`Editar sessão ${cs.session_name}`} size="sm" onClick={() => startEdit(cs)}>
              <Pencil className="h-4 w-4" />
            </IconButton>
            <IconButton
              aria-label={`Excluir sessão ${cs.session_name}`}
              size="sm"
              disabled={isDeleting}
              onClick={() => handleDelete(cs)}
              className="text-destructive hover:text-destructive"
            >
              {isDeleting ? <RotateCcw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </IconButton>
          </>
        }
      />
    );
  };

  const renderGroup = (
    Icon: LucideIcon,
    iconClass: string,
    title: string,
    items: EditorBookingDetail[],
    type: "completed" | "scheduled" | "pending_confirmation",
    description?: string,
  ) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <SectionHeader
          as="h3"
          title={
            <span className="inline-flex items-center gap-2">
              <Icon className={cn("h-4 w-4", iconClass)} aria-hidden />
              {title}
              <span className="text-muted-foreground font-normal tabular-nums">({items.length})</span>
            </span>
          }
          description={description}
        />
        <SectionCard padding="none">
          {items.map((cs, i) => renderBookingRow(cs, type, i === items.length - 1))}
        </SectionCard>
      </div>
    );
  };

  const confirmCopy = (() => {
    if (!pendingAction) return { title: "", description: "", confirmLabel: "Confirmar", destructive: false };
    const { cs } = pendingAction;
    const when = `"${cs.session_name}" de ${formatDateBR(cs.date)}`;
    if (pendingAction.kind === "delete") {
      return {
        title: "Excluir sessão?",
        description: `A sessão ${when} será removida. O relatório e as tarefas desta sessão também serão apagados. Esta ação não pode ser desfeita.`,
        confirmLabel: "Excluir",
        destructive: true,
      };
    }
    if (pendingAction.status === "completed") {
      return {
        title: "Confirmar sessão realizada?",
        description: `A sessão ${when} passa a contar como realizada na jornada.`,
        confirmLabel: "Marcar realizada",
        destructive: false,
      };
    }
    return {
      title: "Marcar como não realizada?",
      description: `A sessão ${when} deixa de ocupar a vaga na jornada.`,
      confirmLabel: "Marcar não realizada",
      destructive: true,
    };
  })();

  const runPendingAction = async () => {
    if (!pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);
    if (action.kind === "delete") await performDelete(action.cs);
    else await performClosePending(action.cs, action.status);
  };

  const editSessionOptions = selectableSessions.some((s) => s.id === editSessionId) ? selectableSessions : sessions;
  const addSessionOptions = selectableSessions.length > 0 ? selectableSessions : sessions;

  return (
    <div className="space-y-5">
      {renderGroup(CheckCircle2, "text-muted-foreground", filterKey ? "Realizadas neste mês" : "Sessões realizadas", completedInView, "completed")}

      {renderGroup(
        Clock,
        "text-muted-foreground",
        filterKey ? "A confirmar neste mês" : "Sessões a confirmar",
        pendingInView,
        "pending_confirmation",
        "Passaram do horário e o mentor ainda não confirmou se aconteceram. Não contam como realizadas até a confirmação.",
      )}

      {renderGroup(Target, "text-muted-foreground", filterKey ? "Agendadas neste mês" : "Sessões agendadas", scheduledInView, "scheduled")}

      {completedInView.length === 0 && pendingInView.length === 0 && scheduledInView.length === 0 && (
        <EmptyState
          compact
          icon={CalendarIcon}
          title={filterKey ? "Nenhuma sessão neste mês" : "Nenhuma sessão registrada"}
          description="Adicione uma sessão realizada (histórico) ou agende a próxima."
        />
      )}

      {/* Remaining */}
      {remaining.length > 0 && (
        <div className="space-y-2">
          <SectionHeader
            as="h3"
            title={
              <span className="inline-flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden />
                Faltam realizar
                <span className="text-muted-foreground font-normal tabular-nums">({remaining.length})</span>
              </span>
            }
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {remaining.map((s) => (
              <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-ds text-sm border border-border text-muted-foreground min-h-[40px]">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 shrink-0" aria-hidden />
                <span className="truncate">{s.name}</span>
                {s.is_kickoff && !kickoffAllowed && (
                  <StatusPill tone="neutral" size="sm" withDot={false} className="ml-auto">Bloqueado</StatusPill>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setAddOpen(true); }}>
          <Plus className="h-4 w-4" /> Adicionar sessão
        </Button>
      </div>

      {/* Editar sessão */}
      <BottomSheet
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Editar sessão"
        description={editing ? `${editing.session_name} · ${formatDateBR(editing.date)}` : undefined}
        size="sm"
        locked={saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              <X className="h-4 w-4" /> Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4" /> {saving ? "Salvando" : "Salvar"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectField label="Sessão" value={editSessionId} onChange={(e) => setEditSessionId(e.target.value)}>
            <option value="" disabled>Selecione a sessão</option>
            {editSessionOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </SelectField>
          <SelectField
            label="Status"
            value={editStatus}
            onChange={(e) => setEditStatus(e.target.value as PersistableStatus)}
            hint={editStatus === "completed" ? "Só é possível marcar como realizada depois do horário de término da sessão." : undefined}
          >
            {editStatusOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </SelectField>
          <SelectField label="Mentor" value={editMentor} onChange={(e) => setEditMentor(e.target.value)}>
            <option value="" disabled>Selecione o mentor</option>
            {mentorOptions.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </SelectField>
          <TextField
            label="Data"
            type="date"
            value={toInputDate(editDate)}
            onChange={(e) => setEditDate(fromInputDate(e.target.value))}
          />
        </div>
      </BottomSheet>

      {/* Adicionar sessão */}
      <BottomSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Adicionar sessão"
        description="Registre uma sessão já realizada ou agende uma nova."
        size="sm"
        locked={adding}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={adding}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={adding}>
              {adding ? "Salvando" : "Adicionar"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectField
            label="Status"
            value={newBooking.status}
            onChange={(e) => setNewBooking((p) => ({ ...p, status: e.target.value as "completed" | "scheduled" }))}
          >
            <option value="completed">Já realizada (histórico)</option>
            <option value="scheduled">Agendada (futura)</option>
          </SelectField>
          <SelectField
            label="Sessão"
            value={newBooking.session_id}
            onChange={(e) => setNewBooking((p) => ({ ...p, session_id: e.target.value, mentor_id: "" }))}
            hint={newBooking.status === "scheduled" && !kickoffAllowed ? KICKOFF_NOT_ALLOWED_MESSAGE : undefined}
          >
            <option value="" disabled>Selecione a sessão</option>
            {addSessionOptions.map((s) => {
              const blocked = Boolean(s.is_kickoff) && !kickoffAllowed && newBooking.status === "scheduled";
              return (
                <option key={s.id} value={s.id} disabled={blocked}>
                  {s.name}{blocked ? " · bloqueado após a 3ª sessão" : ""}
                </option>
              );
            })}
          </SelectField>
          <SelectField
            label="Mentor"
            value={newBooking.mentor_id}
            onChange={(e) => setNewBooking((p) => ({ ...p, mentor_id: e.target.value }))}
          >
            <option value="" disabled>Selecione o mentor</option>
            {mentors.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </SelectField>
          <TextField
            label="Data"
            type="date"
            value={toInputDate(newBooking.date)}
            onChange={(e) => setNewBooking((p) => ({ ...p, date: fromInputDate(e.target.value) }))}
          />
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={!!pendingAction}
        onOpenChange={(o) => !o && setPendingAction(null)}
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmLabel={confirmCopy.confirmLabel}
        destructive={confirmCopy.destructive}
        onConfirm={runPendingAction}
      />
    </div>
  );
};
