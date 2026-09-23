import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Edit, Trash2, CalendarDays, Eye, EyeOff, Users } from "lucide-react";
import { toast } from "sonner";
import { EventAttendanceList } from "@/components/EventAttendanceList";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  PageContainer,
  PageHeader,
  SectionCard,
  ListRow,
  DateBlock,
  StatusPill,
  IconButton,
  BottomSheet,
  ConfirmDialog,
  TextField,
  TextAreaField,
  LoadingState,
  EmptyState,
  ErrorState,
} from "@/components/ds";

interface EventForm {
  title: string; description: string; event_date: string; event_time: string;
  location: string; location_url: string; cover_image_url: string;
  is_online: boolean; is_visible: boolean;
  rsvp_enabled: boolean; rsvp_deadline: string; capacity: string;
}

const emptyForm: EventForm = {
  title: "", description: "", event_date: "", event_time: "",
  location: "", location_url: "", cover_image_url: "",
  is_online: false, is_visible: true,
  rsvp_enabled: true, rsvp_deadline: "", capacity: "",
};

const SwitchRow = ({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <div className="flex items-center justify-between gap-3 min-h-[44px]">
    <label htmlFor={id} className="text-sm font-medium text-foreground cursor-pointer flex-1">{label}</label>
    <Switch id={id} checked={checked} onCheckedChange={onChange} />
  </div>
);

const AdminEventosPage = () => {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [attendanceOpen, setAttendanceOpen] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: events, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("*").order("event_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const openAdd = () => { setForm(emptyForm); setEditingId(null); setShowForm(true); };
  const openEdit = (e: any) => {
    setForm({
      title: e.title, description: e.description || "", event_date: e.event_date,
      event_time: e.event_time || "", location: e.location || "", location_url: e.location_url || "",
      cover_image_url: e.cover_image_url || "", is_online: e.is_online, is_visible: e.is_visible,
      rsvp_enabled: e.rsvp_enabled ?? true,
      rsvp_deadline: e.rsvp_deadline ? String(e.rsvp_deadline).slice(0, 10) : "",
      capacity: e.capacity != null ? String(e.capacity) : "",
    });
    setEditingId(e.id);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.title || !form.event_date) { toast.error("Título e data obrigatórios"); return; }
    const payload = {
      ...form,
      rsvp_deadline: form.rsvp_deadline ? `${form.rsvp_deadline}T23:59:59` : null,
      capacity: form.capacity ? Number(form.capacity) : null,
    };
    if (editingId) {
      const { error } = await supabase.from("events").update(payload as any).eq("id", editingId);
      if (error) { toast.error("Erro ao salvar"); return; }
      toast.success("Evento atualizado");
    } else {
      const { error } = await supabase.from("events").insert(payload as any);
      if (error) { toast.error("Erro ao criar"); return; }
      toast.success("Evento criado");
    }
    setShowForm(false); setEditingId(null);
    queryClient.invalidateQueries({ queryKey: ["admin-events"] });
  };

  const toggleVisible = async (id: string, current: boolean) => {
    const { error } = await supabase.from("events").update({ is_visible: !current } as any).eq("id", id);
    if (error) { toast.error("Erro ao atualizar visibilidade"); return; }
    queryClient.invalidateQueries({ queryKey: ["admin-events"] });
  };

  const deleteEvent = async (id: string) => {
    setDeleting(true);
    const { error } = await supabase.from("events").delete().eq("id", id);
    setDeleting(false);
    if (error) { toast.error("Erro ao excluir evento"); return; }
    setDeleteTarget(null);
    queryClient.invalidateQueries({ queryKey: ["admin-events"] });
    toast.success("Evento excluído");
  };

  const formatLongDate = (date: string) =>
    new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  const total = events?.length ?? 0;

  return (
    <AppLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Eventos"
          description={isLoading ? "Carregando eventos" : `${total} ${total === 1 ? "evento" : "eventos"}`}
          actions={
            <Button onClick={openAdd}>
              <Plus aria-hidden /> Novo evento
            </Button>
          }
        />

        {isLoading ? (
          <LoadingState variant="list" rows={4} />
        ) : isError ? (
          <ErrorState title="Não foi possível carregar os eventos" onRetry={() => refetch()} />
        ) : !events || events.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Nenhum evento cadastrado"
            description="Crie o primeiro evento da comunidade."
            action={
              <Button onClick={openAdd}>
                <Plus aria-hidden /> Criar evento
              </Button>
            }
          />
        ) : (
          <SectionCard padding="none">
            {events.map((event: any, index: number) => {
              const isLast = index === events.length - 1;
              const isAttendanceOpen = attendanceOpen === event.id;
              const subtitle = [formatLongDate(event.event_date), event.event_time, event.location, event.description]
                .filter(Boolean)
                .join(" · ");
              return (
                <div key={event.id} className={!event.is_visible ? "opacity-70" : undefined}>
                  <ListRow
                    last={isLast && !isAttendanceOpen}
                    leading={<DateBlock date={event.event_date} tone={event.is_visible ? "default" : "muted"} />}
                    title={event.title}
                    subtitle={subtitle}
                    trailing={
                      <>
                        <span className="hidden sm:flex items-center gap-1.5">
                          {event.is_online ? (
                            <StatusPill tone="info">Online</StatusPill>
                          ) : (
                            <StatusPill tone="success">Presencial</StatusPill>
                          )}
                          {!event.is_visible && <StatusPill tone="neutral">Oculto</StatusPill>}
                        </span>
                        <IconButton
                          aria-label="Lista de presença"
                          size="sm"
                          variant={isAttendanceOpen ? "primary" : "ghost"}
                          onClick={() => setAttendanceOpen(isAttendanceOpen ? null : event.id)}
                        >
                          <Users className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          aria-label={event.is_visible ? "Ocultar dos membros" : "Mostrar para membros"}
                          size="sm"
                          onClick={() => toggleVisible(event.id, event.is_visible)}
                        >
                          {event.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </IconButton>
                        <IconButton aria-label="Editar evento" size="sm" onClick={() => openEdit(event)}>
                          <Edit className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          aria-label="Excluir evento"
                          size="sm"
                          className="hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteTarget({ id: event.id, title: event.title })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </>
                    }
                  />
                  {isAttendanceOpen && (
                    <div className={`px-4 pb-4 pt-2 bg-muted/20 ${!isLast ? "border-b border-border" : ""}`}>
                      <EventAttendanceList eventId={event.id} eventTitle={event.title} />
                    </div>
                  )}
                </div>
              );
            })}
          </SectionCard>
        )}
      </PageContainer>

      <BottomSheet
        open={showForm}
        onOpenChange={setShowForm}
        title={editingId ? "Editar evento" : "Novo evento"}
        description="Título e data são obrigatórios."
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={save}>{editingId ? "Salvar" : "Criar evento"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Título"
            required
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Nome do evento"
          />
          <TextAreaField
            label="Descrição"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="h-20 resize-none"
            placeholder="O que vai acontecer"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField
              label="Data"
              required
              type="date"
              value={form.event_date}
              onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
            />
            <TextField
              label="Horário"
              value={form.event_time}
              onChange={e => setForm(f => ({ ...f, event_time: e.target.value }))}
              placeholder="09:00 - 12:00"
            />
          </div>
          <SwitchRow id="event-online" label="Evento online" checked={form.is_online} onChange={v => setForm(f => ({ ...f, is_online: v }))} />
          <TextField
            label={form.is_online ? "Link da reunião" : "Local"}
            value={form.location}
            onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
            placeholder={form.is_online ? "https://..." : "Endereço do encontro"}
          />
          {!form.is_online && (
            <TextField
              label="URL do Maps"
              hint="Opcional"
              value={form.location_url}
              onChange={e => setForm(f => ({ ...f, location_url: e.target.value }))}
              placeholder="https://maps.google.com/..."
            />
          )}
          <TextField
            label="Imagem de capa"
            hint="URL da imagem (opcional)"
            value={form.cover_image_url}
            onChange={e => setForm(f => ({ ...f, cover_image_url: e.target.value }))}
            placeholder="https://..."
          />
          <div className="divide-y divide-border border-y border-border">
            <SwitchRow id="event-visible" label="Visível para membros" checked={form.is_visible} onChange={v => setForm(f => ({ ...f, is_visible: v }))} />
            <SwitchRow id="event-rsvp" label="Permitir confirmação de presença" checked={form.rsvp_enabled} onChange={v => setForm(f => ({ ...f, rsvp_enabled: v }))} />
          </div>
          {form.rsvp_enabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField
                label="Prazo para confirmar"
                type="date"
                value={form.rsvp_deadline}
                onChange={e => setForm(f => ({ ...f, rsvp_deadline: e.target.value }))}
              />
              <TextField
                label="Vagas"
                hint="Deixe vazio para ilimitado"
                type="number"
                min="1"
                inputMode="numeric"
                value={form.capacity}
                onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
                placeholder="Ilimitado"
              />
            </div>
          )}
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir evento?"
        description={deleteTarget ? `"${deleteTarget.title}" e a lista de presença serão removidos. Essa ação não pode ser desfeita.` : undefined}
        confirmLabel="Excluir"
        destructive
        loading={deleting}
        onConfirm={() => deleteTarget && deleteEvent(deleteTarget.id)}
      />
    </AppLayout>
  );
};

export default AdminEventosPage;
