import { useState } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus, Edit, Trash2, Save, X, CalendarDays, MapPin, Clock, Eye, EyeOff, Globe, Video, Users
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { EventAttendanceList } from "@/components/EventAttendanceList";

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

const AdminEventosPage = () => {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [attendanceOpen, setAttendanceOpen] = useState<string | null>(null);

  const { data: events, isLoading } = useQuery({
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
    if (!confirm("Excluir este evento?")) return;
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir evento"); return; }
    queryClient.invalidateQueries({ queryKey: ["admin-events"] });
    toast.success("Evento excluído");
  };

  return (
    <AppLayout role="admin">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
        <motion.div variants={fadeUpItem} className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Eventos</h1>
            <p className="text-muted-foreground text-sm mt-1">{events?.length ?? 0} eventos</p>
          </div>
          <button onClick={openAdd} className="btn-silver text-xs px-4 py-2.5 flex items-center gap-1.5 h-10 rounded-lg">
            <Plus className="h-3.5 w-3.5" /> Novo evento
          </button>
        </motion.div>

        {showForm && (
          <motion.div variants={fadeUpItem} className="glass-card p-5 border-primary/30">
            <h3 className="text-sm font-semibold text-foreground mb-4">{editingId ? "Editar" : "Novo"} evento</h3>
            <div className="space-y-3">
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="input-begin text-sm h-10 w-full" placeholder="Título" />
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-begin text-sm w-full h-20 resize-none" placeholder="Descrição" />
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Data</label>
                  <input type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} className="input-begin text-sm h-10 w-full" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Horário</label>
                  <input value={form.event_time} onChange={e => setForm(f => ({ ...f, event_time: e.target.value }))} className="input-begin text-sm h-10 w-full" placeholder="09:00 - 12:00" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1 flex items-center gap-1">
                    <input type="checkbox" checked={form.is_online} onChange={e => setForm(f => ({ ...f, is_online: e.target.checked }))} className="rounded border-border" />
                    Online
                  </label>
                </div>
              </div>
              <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className="input-begin text-sm h-10 w-full" placeholder={form.is_online ? "Link da reunião" : "Local"} />
              {!form.is_online && (
                <input value={form.location_url} onChange={e => setForm(f => ({ ...f, location_url: e.target.value }))} className="input-begin text-sm h-10 w-full" placeholder="URL do Maps (opcional)" />
              )}
              <input value={form.cover_image_url} onChange={e => setForm(f => ({ ...f, cover_image_url: e.target.value }))} className="input-begin text-sm h-10 w-full" placeholder="URL da imagem de capa (opcional)" />
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={form.is_visible} onChange={e => setForm(f => ({ ...f, is_visible: e.target.checked }))} className="rounded border-border" />
                Visível para membros
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={form.rsvp_enabled} onChange={e => setForm(f => ({ ...f, rsvp_enabled: e.target.checked }))} className="rounded border-border" />
                Permitir confirmação de presença
              </label>
              {form.rsvp_enabled && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Prazo para confirmar</label>
                    <input type="date" value={form.rsvp_deadline} onChange={e => setForm(f => ({ ...f, rsvp_deadline: e.target.value }))} className="input-begin text-sm h-10 w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase block mb-1">Vagas (opcional)</label>
                    <input type="number" min="1" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} className="input-begin text-sm h-10 w-full" placeholder="Ilimitado" />
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={save} className="btn-silver text-xs px-4 py-2.5 flex items-center gap-1.5 h-10 rounded-lg"><Save className="h-3.5 w-3.5" /> Salvar</button>
                <button onClick={() => setShowForm(false)} className="text-xs px-4 py-2.5 border border-border rounded-lg text-muted-foreground hover:text-foreground h-10 flex items-center gap-1.5"><X className="h-3.5 w-3.5" /> Cancelar</button>
              </div>
            </div>
          </motion.div>
        )}

        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="glass-card p-5 animate-pulse h-28" />)}</div>
        ) : !events || events.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Nenhum evento cadastrado"
            description="Crie o primeiro evento da comunidade."
            action={
              <button onClick={openAdd} className="btn-silver text-sm px-4 py-2 inline-flex items-center gap-2">
                <Plus className="h-4 w-4" /> Criar evento
              </button>
            }
          />
        ) : (
          <motion.div variants={fadeUpItem} className="space-y-3">
            {events.map((event: any) => (
              <div key={event.id} className={`glass-card p-5 ${!event.is_visible ? "opacity-60" : ""}`}>
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <h3 className="text-sm font-semibold text-foreground">{event.title}</h3>
                      {event.is_online ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-blue/10 text-status-blue border border-border flex items-center gap-1"><Video className="h-3 w-3" /> Online</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-status-green/10 text-status-green border border-border flex items-center gap-1"><MapPin className="h-3 w-3" /> Presencial</span>
                      )}
                      {!event.is_visible && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border flex items-center gap-1"><EyeOff className="h-3 w-3" /> Oculto</span>
                      )}
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 shrink-0" /> {new Date(event.event_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</div>
                      {event.event_time && <div className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 shrink-0" /> {event.event_time}</div>}
                      {event.location && <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 shrink-0" /> {event.location}</div>}
                    </div>
                    {event.description && <p className="text-xs text-muted-foreground mt-2">{event.description}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setAttendanceOpen(attendanceOpen === event.id ? null : event.id)}
                      className={`p-2 rounded-lg transition-colors ${attendanceOpen === event.id ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}
                      title="Lista de presença"
                    >
                      <Users className="h-4 w-4" />
                    </button>
                    <button onClick={() => toggleVisible(event.id, event.is_visible)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                      {event.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    <button onClick={() => openEdit(event)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                      <Edit className="h-4 w-4" />
                    </button>
                    <button onClick={() => deleteEvent(event.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {attendanceOpen === event.id && (
                  <EventAttendanceList eventId={event.id} eventTitle={event.title} />
                )}
              </div>
            ))}
          </motion.div>
        )}
      </motion.div>
    </AppLayout>
  );
};

export default AdminEventosPage;
