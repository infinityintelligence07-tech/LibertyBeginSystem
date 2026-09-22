import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionCatalog } from "@/hooks/useAdminData";
import { shortName } from "@/lib/formatName";
import {
  FileText, Wrench, AlertTriangle, ArrowRight, CheckCircle2, Clock, Plus, Edit, Trash2, Save, X
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ContentForm {
  title: string;
  description: string;
  content_type: string;
  url: string;
  pillar: string;
  session_id: string;
  is_public: boolean;
}

const emptyForm: ContentForm = {
  title: "", description: "", content_type: "ferramenta", url: "", pillar: "", session_id: "", is_public: false,
};

const contentTypes = [
  { value: "ferramenta", label: "Ferramenta" },
  { value: "checklist", label: "Checklist" },
  { value: "template", label: "Template" },
  { value: "video", label: "Vídeo" },
  { value: "documento", label: "Documento" },
];

const AdminConteudosPage = () => {
  const { data: sessions } = useSessionCatalog();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContentForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const { data: reports, isLoading } = useQuery({
    queryKey: ["admin-all-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_reports")
        .select("*, bookings(scheduled_date, status, sessions(name, order), mentor:profiles!bookings_mentor_id_fkey(full_name), liberty:profiles!bookings_liberty_id_fkey(full_name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: contents } = useQuery({
    queryKey: ["admin-contents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contents").select("*, sessions(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const tools = contents?.filter((c: any) => ["ferramenta", "checklist", "template"].includes(c.content_type)) || [];

  const sessionsMissingTools = useMemo(() => {
    if (!sessions || !contents) return [];
    const sessionsWithTools = new Set(contents.filter((c: any) => ["ferramenta", "checklist", "template"].includes(c.content_type)).map((c: any) => c.session_id));
    return sessions.filter(s => !sessionsWithTools.has(s.id));
  }, [sessions, contents]);

  const openAdd = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (content: any) => {
    setForm({
      title: content.title || "",
      description: content.description || "",
      content_type: content.content_type || "ferramenta",
      url: content.url || "",
      pillar: content.pillar || "",
      session_id: content.session_id || "",
      is_public: content.is_public || false,
    });
    setEditingId(content.id);
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("Título é obrigatório"); return; }
    setSaving(true);
    try {
      const payload: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        content_type: form.content_type,
        url: form.url.trim() || null,
        pillar: form.pillar || null,
        session_id: form.session_id || null,
        is_public: form.is_public,
        is_active: true,
      };
      if (editingId) {
        const { error } = await supabase.from("contents").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Conteúdo atualizado");
      } else {
        const { error } = await supabase.from("contents").insert(payload);
        if (error) throw error;
        toast.success("Conteúdo criado");
      }
      setFormOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["admin-contents"] });
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Excluir "${title}"?`)) return;
    try {
      const { error } = await supabase.from("contents").delete().eq("id", id);
      if (error) throw error;
      toast.success("Conteúdo excluído");
      queryClient.invalidateQueries({ queryKey: ["admin-contents"] });
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
  };

  return (
    <AppLayout role="admin">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
        <motion.div variants={fadeUpItem} className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Relatórios & Ferramentas</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Relatórios das sessões preenchidos pelos mentores e ferramentas do programa
            </p>
          </div>
        </motion.div>

        {/* Tool alert */}
        {sessionsMissingTools.length > 0 && (
          <motion.div variants={fadeUpItem} className="glass-card p-4 border-status-yellow/30">
            <div className="flex items-center gap-2 text-status-yellow text-sm font-medium mb-2">
              <AlertTriangle className="h-4 w-4" />
              {sessionsMissingTools.length} sessões sem ferramenta cadastrada
            </div>
            <div className="flex flex-wrap gap-2">
              {sessionsMissingTools.map(s => (
                <span key={s.id} className="text-xs px-3 py-1.5 rounded-full bg-status-yellow/10 text-status-yellow border border-status-yellow/20 flex items-center gap-1">
                  {s.name} <ArrowRight className="h-3 w-3" />
                </span>
              ))}
            </div>
          </motion.div>
        )}

        {/* Relatórios section */}
        <motion.div variants={fadeUpItem}>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
            <FileText className="h-4 w-4 text-primary" /> Relatórios das sessões
          </h2>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="glass-card p-4 animate-pulse h-16" />
              ))}
            </div>
          ) : !reports || reports.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Nenhum relatório preenchido ainda"
              description="Os relatórios aparecem aqui automaticamente quando os mentores os preenchem após as sessões."
            />
          ) : (
            <div className="space-y-2">
              {reports.map((r: any) => {
                const booking = r.bookings;
                const sessionName = booking?.sessions?.name || "Sem dados";
                const mentorName = booking?.mentor?.full_name || "Sem dados";
                const libertyName = booking?.liberty?.full_name || "Sem dados";
                const date = booking?.scheduled_date;
                const hasContent = r.summary || r.goals || r.action_plan;

                return (
                  <div key={r.id} className="glass-card p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${hasContent ? "bg-status-green/10" : "bg-muted"}`}>
                        {hasContent ? <CheckCircle2 className="h-4 w-4 text-status-green" /> : <Clock className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{sessionName}</span>
                          <span className="text-[10px] text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">{shortName(libertyName)}</span>
                          <span className="text-[10px] text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">Mentor: {shortName(mentorName)}</span>
                        </div>
                        {date && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(date + "T12:00:00").toLocaleDateString("pt-BR")}
                          </p>
                        )}
                        {r.summary && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.summary}</p>
                        )}
                      </div>
                    </div>
                    {(r.goals || r.action_plan || r.mentor_impressions) && (
                      <div className="mt-3 pt-3 border-t border-border grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
                        {r.goals && (
                          <div>
                            <span className="font-semibold text-foreground block mb-0.5">Metas</span>
                            <p className="text-muted-foreground line-clamp-3">{r.goals}</p>
                          </div>
                        )}
                        {r.action_plan && (
                          <div>
                            <span className="font-semibold text-foreground block mb-0.5">Plano de ação</span>
                            <p className="text-muted-foreground line-clamp-3">{r.action_plan}</p>
                          </div>
                        )}
                        {r.mentor_impressions && (
                          <div>
                            <span className="font-semibold text-foreground block mb-0.5">Impressões do mentor</span>
                            <p className="text-muted-foreground line-clamp-3">{r.mentor_impressions}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Ferramentas section */}
        <motion.div variants={fadeUpItem}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" /> Ferramentas do programa
            </h2>
            <button onClick={openAdd} className="btn-silver text-xs px-3 py-2 flex items-center gap-1.5 rounded-lg">
              <Plus className="h-3.5 w-3.5" /> Novo conteúdo
            </button>
          </div>

          {!contents || contents.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title="Nenhuma ferramenta cadastrada"
              description="Adicione conteúdos para que os membros os acessem nas trilhas."
              action={
                <button onClick={openAdd} className="btn-silver text-sm px-4 py-2 inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" /> Adicionar conteúdo
                </button>
              }
            />
          ) : (
            <div className="space-y-2">
              {contents.map((t: any) => (
                <div key={t.id} className="glass-card p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Wrench className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{t.title}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">{t.content_type}</span>
                    </div>
                    {(t as any).sessions?.name && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 inline-block mt-1">{(t as any).sessions.name}</span>
                    )}
                    {t.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {t.url && (
                      <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:text-silver-light px-2">
                        Abrir ↗
                      </a>
                    )}
                    <button onClick={() => openEdit(t)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDelete(t.id, t.title)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* Add/Edit Content Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">{editingId ? "Editar conteúdo" : "Novo conteúdo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Título *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="input-begin text-sm h-10 w-full" placeholder="Título" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Descrição</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-begin text-sm w-full h-16 resize-none" placeholder="Descrição" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Tipo</label>
                <select value={form.content_type} onChange={e => setForm(f => ({ ...f, content_type: e.target.value }))} className="input-begin text-sm h-10 w-full">
                  {contentTypes.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Sessão vinculada</label>
                <select value={form.session_id} onChange={e => setForm(f => ({ ...f, session_id: e.target.value }))} className="input-begin text-sm h-10 w-full">
                  <option value="">Nenhuma</option>
                  {(sessions || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">URL</label>
              <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} className="input-begin text-sm h-10 w-full" placeholder="https://..." />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={form.is_public} onChange={e => setForm(f => ({ ...f, is_public: e.target.checked }))} className="rounded border-border" />
              Conteúdo público
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : editingId ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default AdminConteudosPage;
