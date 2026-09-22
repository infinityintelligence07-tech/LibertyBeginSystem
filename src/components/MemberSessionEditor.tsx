import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { bookingRuleErrorMessage } from "@/lib/bookingRules";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookingDetail, MemberWithProgress } from "@/hooks/useAdminData";
import { shortName } from "@/lib/formatName";
import {
  CheckCircle2, Target, AlertTriangle, Pencil, Trash2, Plus, CalendarIcon, Save, X, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Props {
  member: MemberWithProgress;
  sessions: { id: string; name: string; order: number; is_active?: boolean }[];
  mentors: { id: string; full_name: string }[];
  filterKey: string | null;
  onReportClick: (booking_id: string, session_name: string) => void;
  /** Called after any booking add/edit/delete so callers can refresh local state. */
  onChanged?: () => void;
}

type EditingBooking = {
  booking_id: string;
  session_id: string;
  session_name: string;
  mentor_id: string;
  date: string;
  status: string;
};

type NewBooking = {
  session_id: string;
  mentor_id: string;
  date: Date | undefined;
  status: "completed" | "scheduled";
};

export const MemberSessionEditor = ({ member, sessions, mentors, filterKey, onReportClick, onChanged }: Props) => {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<EditingBooking | null>(null);
  const [editDate, setEditDate] = useState<Date | undefined>();
  const [editMentor, setEditMentor] = useState("");
  const [editSessionId, setEditSessionId] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newBooking, setNewBooking] = useState<NewBooking>({ session_id: "", mentor_id: "", date: undefined, status: "completed" });
  const [adding, setAdding] = useState(false);

  // Always show all mentors — admin/mentor pick freely regardless of mentor_sessions mapping.
  const mentorsForSession = (_sessionId: string) => mentors;

  const completedInView = filterKey
    ? member.completed_sessions.filter((cs) => cs.date.startsWith(filterKey))
    : member.completed_sessions;
  const scheduledInView = filterKey
    ? member.scheduled_sessions.filter((cs) => cs.date.startsWith(filterKey))
    : member.scheduled_sessions;
  const allDoneOrScheduledIds = new Set([
    ...member.completed_sessions.map((s) => s.session_id),
    ...member.scheduled_sessions.map((s) => s.session_id),
  ]);
  const isLiberty = member.member_tier === "liberty";
  const remaining = sessions.filter((s) => {
    if (allDoneOrScheduledIds.has(s.id)) return false;
    if (s.is_active === false) return false;      // ignora sessões inativas (ex.: "Mapa do Negócio" antiga)
    if ((s.order ?? 0) <= 0) return false;         // ignora Onboarding / não-jornada
    if (!isLiberty && (s.order ?? 0) >= 100) return false; // sessões exclusivas Liberty não contam para Begin
    return true;
  });

  const startEdit = (b: BookingDetail) => {
    setEditing({
      booking_id: b.booking_id,
      session_id: b.session_id,
      session_name: b.session_name,
      mentor_id: "",
      date: b.date,
      status: b.status,
    });
    setEditDate(new Date(b.date + "T12:00:00"));
    // find mentor id by name
    const m = mentors.find((mt) => mt.full_name === b.mentor_name);
    setEditMentor(m?.id || "");
    setEditSessionId(b.session_id);
    setEditStatus(b.status);
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const dateStr = editDate ? format(editDate, "yyyy-MM-dd") : editing.date;
      const { error } = await supabase
        .from("bookings")
        .update({
          scheduled_date: dateStr,
          mentor_id: editMentor,
          session_id: editSessionId || editing.session_id,
          status: editStatus as any,
          // Admin marcando manualmente como realizada = registro histórico (sem exigir relatório).
          ...(editStatus === "completed" ? { is_retroactive: true, approval_required: false } : {}),
        })
        .eq("id", editing.booking_id);
      if (error) throw error;
      supabase.functions.invoke("google-calendar-sync", { body: { booking_id: editing.booking_id } }).catch(() => {});
      toast.success("Sessão atualizada");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["admin-members"] }); onChanged?.();
    } catch (e: any) {
      toast.error(bookingRuleErrorMessage(e) || "Erro ao salvar: " + e.message);
    } finally {
      setSaving(false);
    }
  };


  const handleDelete = async (bookingId: string) => {
    setDeleting(bookingId);
    try {
      // Delete report first if exists
      await supabase.from("booking_reports").delete().eq("booking_id", bookingId);
      const { error } = await supabase.from("bookings").delete().eq("id", bookingId);
      if (error) throw error;
      toast.success("Sessão removida");
      queryClient.invalidateQueries({ queryKey: ["admin-members"] }); onChanged?.();
    } catch (e: any) {
      toast.error("Erro ao remover: " + e.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleAdd = async () => {
    if (!newBooking.session_id || !newBooking.mentor_id || !newBooking.date) {
      toast.error("Preencha todos os campos");
      return;
    }
    setAdding(true);
    try {
      // Lançamento histórico: sessão que já aconteceu fora da plataforma.
      // Conta no progresso, não exige relatório e não vai para o Google Agenda.
      const isRetroactive = newBooking.status === "completed";
      const { data: created, error } = await supabase.from("bookings").insert({
        liberty_id: member.id,
        mentor_id: newBooking.mentor_id,
        session_id: newBooking.session_id,
        scheduled_date: format(newBooking.date, "yyyy-MM-dd"),
        start_time: "09:00",
        end_time: "10:30",
        status: newBooking.status,
        is_retroactive: isRetroactive,
        approval_required: false,
      }).select("id").single();
      if (error) throw error;
      if (created?.id && !isRetroactive) {
        supabase.functions.invoke("google-calendar-sync", { body: { booking_id: created.id } }).catch(() => {});
      }
      toast.success("Sessão adicionada");
      setAddOpen(false);
      setNewBooking({ session_id: "", mentor_id: "", date: undefined, status: "completed" });
      queryClient.invalidateQueries({ queryKey: ["admin-members"] }); onChanged?.();
    } catch (e: any) {
      console.error("Erro ao adicionar sessão:", e);
      const detail = e?.message || e?.details || e?.hint || JSON.stringify(e);
      toast.error(bookingRuleErrorMessage(e) || "Erro ao adicionar: " + detail);
    } finally {
      setAdding(false);
    }
  };


  const renderBookingRow = (cs: BookingDetail, type: "completed" | "scheduled") => {
    const isEditing = editing?.booking_id === cs.booking_id;
    const isDeleting = deleting === cs.booking_id;
    const bgClass = type === "completed"
      ? "bg-status-green/5 border-border"
      : "bg-primary/5 border-primary/20";

    if (isEditing) {
      return (
        <div key={cs.booking_id} className="flex flex-col gap-2 text-xs px-3 py-3 rounded-lg border border-primary/40 bg-primary/5">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={editSessionId} onValueChange={setEditSessionId}>
              <SelectTrigger className="h-7 w-[200px] text-xs">
                <SelectValue placeholder="Sessão" />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>

                ))}
              </SelectContent>
            </Select>
            <Select value={editStatus} onValueChange={setEditStatus}>
              <SelectTrigger className="h-7 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="completed">Realizada</SelectItem>
                <SelectItem value="scheduled">Agendada</SelectItem>
              </SelectContent>
            </Select>
            <Select value={editMentor} onValueChange={setEditMentor}>
              <SelectTrigger className="h-7 w-[160px] text-xs">
                <SelectValue placeholder="Mentor" />
              </SelectTrigger>
              <SelectContent>
                {mentors.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  {editDate ? format(editDate, "dd/MM/yyyy") : "Data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={editDate}
                  onSelect={setEditDate}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(null)}>
              <X className="h-3 w-3 mr-1" /> Cancelar
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
              <Save className="h-3 w-3 mr-1" /> {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div key={cs.booking_id} className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg border ${bgClass} group`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 ${
            type === "completed" ? "bg-status-green text-background" : "bg-primary/20 text-primary"
          }`}>
            {type === "completed" ? "✓" : "⏱"}
          </span>
          <span className="text-foreground font-medium truncate">{cs.session_name}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{shortName(cs.mentor_name)}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{new Date(cs.date + "T12:00:00").toLocaleDateString("pt-BR")}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {type === "completed" && (
            <button
              onClick={(e) => { e.stopPropagation(); onReportClick(cs.booking_id, cs.session_name); }}
              className="text-primary hover:text-silver-light text-[10px] font-medium"
            >
              Relatório
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); startEdit(cs); }}
            className="p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(cs.booking_id); }}
            className="p-1 rounded hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
            disabled={isDeleting}
          >
            {isDeleting ? <RotateCcw className="h-3 w-3 animate-spin text-muted-foreground" /> : <Trash2 className="h-3 w-3 text-destructive" />}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Completed */}
      {completedInView.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-status-green" />
            {filterKey ? "Realizadas neste mês" : "Sessões realizadas"}
            <span className="text-muted-foreground font-normal">({completedInView.length})</span>
          </h4>
          <div className="space-y-1">
            {completedInView.map((cs) => renderBookingRow(cs, "completed"))}
          </div>
        </div>
      )}

      {/* Scheduled */}
      {scheduledInView.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-primary" />
            {filterKey ? "Agendadas neste mês" : "Sessões agendadas"}
            <span className="text-muted-foreground font-normal">({scheduledInView.length})</span>
          </h4>
          <div className="space-y-1">
            {scheduledInView.map((cs) => renderBookingRow(cs, "scheduled"))}
          </div>
        </div>
      )}

      {/* Remaining */}
      {remaining.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
            Faltam realizar
            <span className="text-muted-foreground font-normal">({remaining.length})</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {remaining.map((s) => (
              <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-muted/30 border border-border text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                <span className="truncate">{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add button */}
      <Button
        variant="outline"
        size="sm"
        className="text-xs gap-1.5 mt-1"
        onClick={(e) => { e.stopPropagation(); setAddOpen(true); }}
      >
        <Plus className="h-3 w-3" /> Adicionar sessão
      </Button>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="text-base">Adicionar sessão</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Status</label>
              <Select value={newBooking.status} onValueChange={(v) => setNewBooking((p) => ({ ...p, status: v as "completed" | "scheduled" }))}>
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Já realizada (histórico)</SelectItem>
                  <SelectItem value="scheduled">Agendada (futura)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Sessão</label>
              <Select value={newBooking.session_id} onValueChange={(v) => setNewBooking((p) => ({ ...p, session_id: v, mentor_id: "" }))}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Selecione a sessão" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Mentor</label>
              <Select value={newBooking.mentor_id} onValueChange={(v) => setNewBooking((p) => ({ ...p, mentor_id: v }))}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Selecione o mentor" />
                </SelectTrigger>
                <SelectContent>
                  {mentors.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Data</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-xs", !newBooking.date && "text-muted-foreground")}>
                    <CalendarIcon className="h-3 w-3 mr-2" />
                    {newBooking.date ? format(newBooking.date, "dd/MM/yyyy") : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={newBooking.date}
                    onSelect={(d) => setNewBooking((p) => ({ ...p, date: d }))}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleAdd} disabled={adding}>
              {adding ? "Salvando..." : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
