import { useState } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { useSessionCatalog } from "@/hooks/useAdminData";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { ClipboardList, Edit, Save, X, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SessionCoverUpload } from "@/components/SessionCoverUpload";

const pillars = ["Negócios", "Emocional", "Mentalidade", "Espiritual"];

const AdminSessoesPage = () => {
  const { data: sessions, isLoading } = useSessionCatalog();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [addOpen, setAddOpen] = useState(false);
  const [newSession, setNewSession] = useState({ name: "", description: "", duration_minutes: 90, pillar: "", order: 0 });
  const [saving, setSaving] = useState(false);

  const { data: mentorSessions } = useQuery({
    queryKey: ["mentor-sessions-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("mentor_sessions").select("*, profiles!mentor_sessions_mentor_id_fkey(id, full_name)").eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: allMentors } = useQuery({
    queryKey: ["all-mentor-profiles"],
    queryFn: async () => {
      const { data: roleRows, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "mentor");
      if (rErr) throw rErr;
      const ids = (roleRows || []).map((r: any) => r.user_id).filter(Boolean);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("user_id", ids)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
  });

  const getMentorsForSession = (sessionId: string) => {
    if (!mentorSessions) return [];
    return mentorSessions.filter((ms: any) => ms.session_id === sessionId).map((ms: any) => ms.profiles);
  };

  const startEdit = (session: any) => {
    setEditingId(session.id);
    setEditData({
      name: session.name,
      description: session.description || "",
      duration_minutes: session.duration_minutes,
      pillar: session.pillar || "",
      is_active: session.is_active,
      is_kickoff: !!session.is_kickoff,
      mentor_ids: getMentorsForSession(session.id).map((m: any) => m.id),
    });
  };


  const cancelEdit = () => { setEditingId(null); setEditData({}); };

  const saveEdit = async (sessionId: string) => {
    const { mentor_ids, ...sessionData } = editData;
    const { error } = await supabase.from("sessions").update(sessionData as any).eq("id", sessionId);
    if (error) { toast.error("Erro ao salvar sessão"); return; }
    const { error: delErr } = await supabase.from("mentor_sessions").delete().eq("session_id", sessionId);
    if (delErr) { toast.error("Erro ao atualizar mentores"); return; }
    if (mentor_ids && mentor_ids.length > 0) {
      const inserts = mentor_ids.map((mid: string) => ({ mentor_id: mid, session_id: sessionId }));
      const { error: insErr } = await supabase.from("mentor_sessions").insert(inserts);
      if (insErr) { toast.error("Erro ao vincular mentores"); return; }
    }
    toast.success("Sessão atualizada");
    setEditingId(null);
    queryClient.invalidateQueries({ queryKey: ["session-catalog"] });
    queryClient.invalidateQueries({ queryKey: ["mentor-sessions-all"] });
    queryClient.invalidateQueries({ queryKey: ["mentor-session-assignments"] });
    queryClient.invalidateQueries({ queryKey: ["agendar-mentor-sessions"] });
    queryClient.invalidateQueries({ queryKey: ["member-editor-mentor-sessions"] });
  };

  const handleAdd = async () => {
    if (!newSession.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      const nextOrder = sessions ? Math.max(...sessions.map((s: any) => s.order), 0) + 1 : 1;
      const { error } = await supabase.from("sessions").insert({
        name: newSession.name.trim(),
        description: newSession.description.trim() || null,
        duration_minutes: newSession.duration_minutes || 90,
        pillar: newSession.pillar || null,
        order: nextOrder,
        is_active: true,
      });
      if (error) throw error;
      toast.success("Sessão criada");
      setAddOpen(false);
      setNewSession({ name: "", description: "", duration_minutes: 90, pillar: "", order: 0 });
      queryClient.invalidateQueries({ queryKey: ["session-catalog"] });
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Excluir a sessão "${name}"? Isso pode afetar bookings existentes.`)) return;
    try {
      await supabase.from("mentor_sessions").delete().eq("session_id", id);
      const { error } = await supabase.from("sessions").delete().eq("id", id);
      if (error) throw error;
      toast.success("Sessão excluída");
      queryClient.invalidateQueries({ queryKey: ["session-catalog"] });
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
  };

  const toggleMentor = (mentorId: string) => {
    setEditData((prev: any) => ({
      ...prev,
      mentor_ids: prev.mentor_ids.includes(mentorId)
        ? prev.mentor_ids.filter((id: string) => id !== mentorId)
        : [...prev.mentor_ids, mentorId],
    }));
  };

  const pillarClass = (p: string) => {
    switch (p) {
      case "Negócios": return "pillar-negocios";
      case "Emocional": return "pillar-emocional";
      case "Mentalidade": return "pillar-mentalidade";
      case "Espiritual": return "pillar-espiritual";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <AppLayout role="admin">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
        <motion.div variants={fadeUpItem} className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Sessões da Jornada</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {sessions?.length ?? 0} sessões · 12 sessões = jornada completa
            </p>
          </div>
          <button onClick={() => setAddOpen(true)} className="btn-silver text-xs px-4 py-2.5 flex items-center gap-1.5 h-10 rounded-lg">
            <Plus className="h-3.5 w-3.5" /> Nova sessão
          </button>
        </motion.div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass-card p-5 animate-pulse h-24" />
            ))}
          </div>
        ) : !sessions || sessions.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Nenhuma sessão cadastrada"
            description="Crie a primeira sessão para começar a estruturar a jornada."
            action={
              <button onClick={() => setAddOpen(true)} className="btn-silver text-sm px-4 py-2 inline-flex items-center gap-2">
                <Plus className="h-4 w-4" /> Criar sessão
              </button>
            }
          />
        ) : (
          <motion.div variants={fadeUpItem} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sessions.map((session) => {
              const isEditing = editingId === session.id;
              const sessionMentors = getMentorsForSession(session.id);

              const refreshCover = () => queryClient.invalidateQueries({ queryKey: ["session-catalog"] });

              if (isEditing) {
                return (
                  <div key={session.id} className="glass-card p-5 border-primary/30 space-y-4">
                    <SessionCoverUpload
                      sessionId={session.id}
                      sessionName={session.name}
                      coverUrl={(session as any).cover_image_url || null}
                      onChange={refreshCover}
                    />
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        {(session as any).is_kickoff && (
                          <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0" title="Sessão de Kickoff">
                            ✦
                          </div>
                        )}
                        <input value={editData.name} onChange={e => setEditData((p: any) => ({ ...p, name: e.target.value }))} className="input-begin text-sm h-10 flex-1" placeholder="Nome da sessão" />
                      </div>

                      <textarea value={editData.description} onChange={e => setEditData((p: any) => ({ ...p, description: e.target.value }))} className="input-begin text-sm w-full h-20 resize-none" placeholder="Descrição" />
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Duração (min)</label>
                          <input type="number" value={editData.duration_minutes} onChange={e => setEditData((p: any) => ({ ...p, duration_minutes: parseInt(e.target.value) || 90 }))} className="input-begin text-sm h-10 w-full" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Pilar</label>
                          <select value={editData.pillar} onChange={e => setEditData((p: any) => ({ ...p, pillar: e.target.value }))} className="input-begin text-sm h-10 w-full">
                            <option value="">Selecione</option>
                            {pillars.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Status</label>
                          <select value={editData.is_active ? "true" : "false"} onChange={e => setEditData((p: any) => ({ ...p, is_active: e.target.value === "true" }))} className="input-begin text-sm h-10 w-full">
                            <option value="true">Ativa</option>
                            <option value="false">Inativa</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Kickoff</label>
                          <select value={editData.is_kickoff ? "true" : "false"} onChange={e => setEditData((p: any) => ({ ...p, is_kickoff: e.target.value === "true" }))} className="input-begin text-sm h-10 w-full" title="Sessão obrigatória de abertura da jornada">
                            <option value="false">Não</option>
                            <option value="true">Sim (obrigatória e destacada)</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Mentores vinculados</label>
                        <div className="flex flex-wrap gap-2">
                          {(allMentors || []).map((m: any) => {
                            const selected = editData.mentor_ids?.includes(m.id);
                            return (
                              <button key={m.id} onClick={() => toggleMentor(m.id)} className={`text-[10px] px-3 py-1.5 rounded-full border transition-colors ${selected ? "bg-primary text-primary-foreground border-primary/20" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                                {m.full_name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(session.id)} className="btn-silver text-xs px-4 py-2 flex items-center gap-1.5 h-10"><Save className="h-3.5 w-3.5" /> Salvar</button>
                        <button onClick={cancelEdit} className="text-xs px-4 py-2 border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors h-10 flex items-center gap-1.5"><X className="h-3.5 w-3.5" /> Cancelar</button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={session.id} className="glass-card p-5 space-y-4">
                  <SessionCoverUpload
                    sessionId={session.id}
                    sessionName={session.name}
                    coverUrl={(session as any).cover_image_url || null}
                    onChange={refreshCover}
                  />
                  <div className="flex items-start gap-3">
                    {(session as any).is_kickoff && (
                      <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0" title="Sessão de Kickoff">
                        ✦
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-foreground">{session.name}</h3>
                        {(session as any).is_kickoff && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 font-semibold uppercase tracking-wider">
                            Kickoff
                          </span>
                        )}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${session.is_active ? "bg-status-green/10 text-status-green border-border" : "bg-muted text-muted-foreground border-border"}`}>
                          {session.is_active ? "Ativa" : "Inativa"}
                        </span>
                        {(session as any).pillar && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${pillarClass((session as any).pillar)}`}>
                            {(session as any).pillar}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                        <span>{session.duration_minutes} min</span>
                      </div>
                      {session.description && <p className="text-xs text-muted-foreground mt-2">{session.description}</p>}
                      {sessionMentors.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {sessionMentors.map((m: any) => (
                            <span key={m.id} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                              {m.full_name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => startEdit(session)} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                        <Edit className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(session.id, session.name)} className="p-2 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </motion.div>

      {/* Add Session Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">Nova sessão</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Nome *</label>
              <input value={newSession.name} onChange={e => setNewSession(s => ({ ...s, name: e.target.value }))} className="input-begin text-sm h-10 w-full" placeholder="Nome da sessão" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Descrição</label>
              <textarea value={newSession.description} onChange={e => setNewSession(s => ({ ...s, description: e.target.value }))} className="input-begin text-sm w-full h-20 resize-none" placeholder="Descrição" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Duração (min)</label>
                <input type="number" value={newSession.duration_minutes} onChange={e => setNewSession(s => ({ ...s, duration_minutes: parseInt(e.target.value) || 90 }))} className="input-begin text-sm h-10 w-full" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Pilar</label>
                <select value={newSession.pillar} onChange={e => setNewSession(s => ({ ...s, pillar: e.target.value }))} className="input-begin text-sm h-10 w-full">
                  <option value="">Selecione</option>
                  {pillars.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleAdd} disabled={saving}>{saving ? "Salvando..." : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default AdminSessoesPage;
