import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { AdminMonthFilter } from "@/components/AdminMonthFilter";
import { useAdminFilter } from "@/contexts/AdminFilterContext";
import { useMentors, useAdminStats, useSessionCatalog } from "@/hooks/useAdminData";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { initials, toTitleCase } from "@/lib/formatName";
import { UserAvatar } from "@/components/UserAvatar";
import { GraduationCap, Users, CheckCircle2, Calendar, DollarSign, Plus, Edit, Trash2, Save, X, Send, Loader2, Power } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AvatarUpload } from "@/components/AvatarUpload";
import { AccessCredentialsDialog, AccessCredentialsData } from "@/components/AccessCredentialsDialog";

interface MentorForm {
  full_name: string;
  email: string;
  phone: string;
  session_rate: string;
  session_ids: string[];
  password: string;
}

const emptyForm: MentorForm = {
  full_name: "",
  email: "",
  phone: "",
  session_rate: "",
  session_ids: [],
  password: "",
};

const AdminMentoresPage = () => {
  const { data: mentors, isLoading } = useMentors();
  const { data: stats } = useAdminStats();
  const { data: sessionCatalog } = useSessionCatalog();
  const { mode, monthKey } = useAdminFilter();
  const queryClient = useQueryClient();
  const defaultRate = stats?.sessionValue ?? 300;
  const filterKey = mode === "month" ? monthKey : null;

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MentorForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // Mentores inativos ficam ocultos por padrão (mesma regra dos membros)
  const visibleMentors = useMemo(
    () => (mentors || []).filter((m) => showInactive || m.is_active !== false),
    [mentors, showInactive]
  );
  const inactiveCount = (mentors || []).filter((m) => m.is_active === false).length;

  // Get mentor_sessions for editing
  const { data: mentorSessions } = useQuery({
    queryKey: ["mentor-sessions-all-mentores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("mentor_sessions").select("*").eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
  });

  const openAdd = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (mentor: any) => {
    const assignedIds = (mentorSessions || [])
      .filter((ms: any) => ms.mentor_id === mentor.id)
      .map((ms: any) => ms.session_id);
    setForm({
      full_name: mentor.full_name || "",
      email: mentor.email || "",
      phone: mentor.phone || "",
      session_rate: mentor.session_rate?.toString() || "",
      session_ids: assignedIds,
      password: "",
    });
    setEditingId(mentor.id);
    setFormOpen(true);
  };

  const toggleSession = (sessionId: string) => {
    setForm(f => ({
      ...f,
      session_ids: f.session_ids.includes(sessionId)
        ? f.session_ids.filter(id => id !== sessionId)
        : [...f.session_ids, sessionId],
    }));
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    setSaving(true);
    try {
      let mentorId = editingId;

      if (editingId) {
        const email = form.email.trim().toLowerCase();
        if (!email) {
          toast.error("Email é obrigatório para o acesso do mentor");
          setSaving(false);
          return;
        }

        const { data, error } = await supabase.functions.invoke("admin-update-user", {
          body: {
            profile_id: editingId,
            email,
            profile_updates: {
              full_name: form.full_name.trim(),
              phone: form.phone.trim() || null,
              session_rate: form.session_rate ? parseFloat(form.session_rate) : null,
            },
          },
        });
        if (error || (data as any)?.error) {
          throw new Error(error?.message || (data as any)?.error || "Falha ao atualizar mentor");
        }
      } else {
        // Create new mentor with auth via edge function
        if (!form.email.trim()) {
          toast.error("Email é obrigatório para criar conta");
          setSaving(false);
          return;
        }
        if (!form.password.trim() || form.password.trim().length < 6) {
          toast.error("Senha deve ter pelo menos 6 caracteres");
          setSaving(false);
          return;
        }
        const { data, error } = await supabase.functions.invoke("create-user", {
          body: {
            email: form.email.trim(),
            password: form.password.trim(),
            full_name: form.full_name.trim(),
            role: "mentor",
            phone: form.phone.trim() || undefined,
            session_rate: form.session_rate ? parseFloat(form.session_rate) : undefined,
          },
        });
        if (error) {
          // Try to extract real error message from the response body
          let msg = error.message;
          try {
            const ctx: any = (error as any).context;
            if (ctx?.json) {
              const body = await ctx.json();
              if (body?.error) msg = body.error;
            } else if (ctx?.text) {
              const txt = await ctx.text();
              try { const j = JSON.parse(txt); if (j?.error) msg = j.error; } catch { msg = txt || msg; }
            }
          } catch {}
          if (/already.*registered|already been registered|duplicate|exists/i.test(msg)) {
            msg = "Este e-mail já está cadastrado no sistema. Use outro e-mail.";
          }
          throw new Error(msg);
        }
        if (data?.error) throw new Error(data.error);
        mentorId = data.profile_id;
      }

      // Update session assignments
      if (mentorId) {
        await supabase.from("mentor_sessions").delete().eq("mentor_id", mentorId);
        if (form.session_ids.length > 0) {
          const inserts = form.session_ids.map(sid => ({ mentor_id: mentorId!, session_id: sid }));
          await supabase.from("mentor_sessions").insert(inserts);
        }
      }

      toast.success(editingId ? "Mentor atualizado" : "Mentor criado com sucesso!");
      setFormOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["admin-mentors"] });
      queryClient.invalidateQueries({ queryKey: ["mentor-sessions-all-mentores"] });
      queryClient.invalidateQueries({ queryKey: ["mentor-session-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["agendar-mentor-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["member-editor-mentor-sessions"] });
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Excluir o mentor "${name}"?`)) return;
    try {
      await supabase.from("mentor_sessions").delete().eq("mentor_id", id);
      const { error } = await supabase.from("profiles").delete().eq("id", id);
      if (error) throw error;
      toast.success("Mentor removido");
      queryClient.invalidateQueries({ queryKey: ["admin-mentors"] });
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
  };

  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [togglingActiveId, setTogglingActiveId] = useState<string | null>(null);
  const [credentialsDialog, setCredentialsDialog] = useState<AccessCredentialsData | null>(null);

  const handleToggleActive = async (mentor: any) => {
    const nextActive = !mentor.is_active;
    const verb = nextActive ? "reativar" : "inativar";
    const extra = !nextActive ? "\n\nSessões futuras agendadas serão canceladas automaticamente." : "";
    if (!confirm(`Deseja ${verb} o mentor "${mentor.full_name}"?${extra}`)) return;
    setTogglingActiveId(mentor.id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-set-user-active", {
        body: { profile_id: mentor.id, active: nextActive },
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      const cancelled = (data as any)?.cancelledBookings || 0;
      toast.success(
        nextActive
          ? "Mentor reativado"
          : `Mentor inativado${cancelled ? ` · ${cancelled} sessão(ões) cancelada(s)` : ""}`
      );
      queryClient.invalidateQueries({ queryKey: ["admin-mentors"] });
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setTogglingActiveId(null);
    }
  };

  const handleInvite = async (mentor: any) => {
    if (!mentor.email) { toast.error("Mentor sem e-mail cadastrado"); return; }
    const ok = confirm(`Gerar acesso para ${mentor.full_name}?\n\nIsso vai redefinir a senha para a padrão e abrir uma janela com a mensagem pronta para copiar.`);
    if (!ok) return;
    setInvitingId(mentor.id);
    try {
      const { data, error } = await supabase.functions.invoke("reset-and-invite", {
        body: { profile_id: mentor.id, role: "mentor" },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setCredentialsDialog({
        full_name: data.full_name || mentor.full_name,
        email: data.email,
        password: data.password,
        role: "mentor",
      });
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setInvitingId(null);
    }
  };

  const monthColumns = useMemo(() => {
    const now = new Date();
    const cols: string[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      cols.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return cols;
  }, []);

  const formatMonthShort = (key: string) => {
    const [y, m] = key.split("-");
    return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase();
  };

  return (
    <AppLayout role="admin">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
        <motion.div variants={fadeUpItem} className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Mentores</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {(mentors || []).filter((m) => m.is_active !== false).length} mentores ativos · Valor padrão por sessão: R$ {defaultRate.toFixed(0)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={openAdd} className="btn-silver text-xs px-4 py-2.5 flex items-center gap-1.5 h-10 rounded-lg">
              <Plus className="h-3.5 w-3.5" /> Novo mentor
            </button>
            <AdminMonthFilter />
          </div>
        </motion.div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass-card p-6 animate-pulse h-32" />
            ))}
          </div>
        ) : !mentors || mentors.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="Nenhum mentor cadastrado"
            description="Adicione o primeiro mentor para começar a distribuir sessões."
            action={
              <button onClick={openAdd} className="btn-silver text-sm px-4 py-2 inline-flex items-center gap-2">
                <Plus className="h-4 w-4" /> Adicionar mentor
              </button>
            }
          />
        ) : (
          <motion.div variants={fadeUpItem} className="space-y-4">
            {inactiveCount > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={() => setShowInactive((v) => !v)}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                >
                  <Power className="h-3 w-3" />
                  {showInactive ? "Ocultar mentores inativos" : `Mostrar ${inactiveCount} mentor(es) inativo(s)`}
                </button>
              </div>
            )}
            {visibleMentors.map((mentor) => {
              const sessionsCount = filterKey
                ? (mentor.monthly_completed[filterKey] || 0)
                : mentor.total_completed;
              const revenue = sessionsCount * defaultRate;

              return (
                <div key={mentor.id} className="glass-card p-5 lg:p-6">
                  {/* Header */}
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    {/* Avatar + info */}
                    <div className="flex items-center gap-3 w-full lg:w-[360px] xl:w-[400px] shrink-0">
                      <UserAvatar name={mentor.full_name} avatarUrl={(mentor as any).avatar_url} size={56} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate leading-tight">
                          {toTitleCase(mentor.full_name)}
                          {mentor.is_active === false && (
                            <span className="ml-2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30">Inativo</span>
                          )}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">{mentor.email}</p>
                      </div>
                      <TooltipProvider delayDuration={150}>
                        <div className="flex items-center gap-1 ml-auto lg:ml-0 shrink-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => handleInvite(mentor)}
                                disabled={invitingId === mentor.id}
                                aria-label="Enviar acesso por WhatsApp"
                                className="p-1.5 rounded-lg hover:bg-status-green/10 text-muted-foreground hover:text-status-green transition-colors disabled:opacity-50"
                              >
                                {invitingId === mentor.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Enviar acesso por WhatsApp (e-mail + senha padrão)</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button onClick={() => openEdit(mentor)} aria-label="Editar mentor" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Editar dados do mentor</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => handleToggleActive(mentor)}
                                disabled={togglingActiveId === mentor.id}
                                aria-label={mentor.is_active ? "Inativar mentor" : "Reativar mentor"}
                                className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${mentor.is_active ? "hover:bg-status-yellow/10 text-muted-foreground hover:text-status-yellow" : "bg-destructive/10 text-destructive hover:bg-destructive/20"}`}
                              >
                                {togglingActiveId === mentor.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">{mentor.is_active ? "Inativar mentor (cancela sessões futuras)" : "Reativar mentor"}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button onClick={() => handleDelete(mentor.id, mentor.full_name)} aria-label="Excluir mentor" className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Excluir mentor permanentemente</TooltipContent>
                          </Tooltip>
                        </div>
                      </TooltipProvider>
                    </div>

                    {/* Stats */}
                    <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="h-4 w-4 text-status-green shrink-0" />
                        <div>
                          <p className="text-lg font-semibold text-foreground tabular-nums leading-none">{sessionsCount}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{filterKey ? "No mês" : "Total"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Calendar className="h-4 w-4 text-status-blue shrink-0" />
                        <div>
                          <p className="text-lg font-semibold text-foreground tabular-nums leading-none">{mentor.total_scheduled}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Agendadas</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Users className="h-4 w-4 text-primary shrink-0" />
                        <div>
                          <p className="text-lg font-semibold text-foreground tabular-nums leading-none">{mentor.members_served}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Membros</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <DollarSign className="h-4 w-4 text-silver-light shrink-0" />
                        <div>
                          <p className="text-lg font-semibold text-foreground tabular-nums leading-none">
                            R$ {Math.round(revenue).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{filterKey ? "Receita mês" : "Receita total"}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Full info */}
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="grid grid-cols-1 md:grid-cols-[minmax(220px,1.4fr),minmax(240px,1.6fr),minmax(130px,.8fr),minmax(120px,.7fr)] gap-3 mb-4 text-xs text-muted-foreground">
                      <div className="min-w-0">
                        <span className="font-semibold text-foreground block">Nome completo</span>
                        <span className="block whitespace-nowrap overflow-x-auto">{mentor.full_name}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold text-foreground block">Email</span>
                        <span className="block whitespace-nowrap overflow-x-auto">{mentor.email || "Sem dados"}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-foreground block">Telefone</span>
                        {mentor.phone || "Sem dados"}
                      </div>
                      <div>
                        <span className="font-semibold text-foreground block">Valor por sessão</span>
                        R$ {(mentor.session_rate ?? defaultRate).toFixed(0)}
                      </div>
                    </div>
                  </div>

                  {/* Sessions assigned */}
                  <div className="pt-4 border-t border-border">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2 flex items-center gap-1">
                      <GraduationCap className="h-3 w-3" /> Sessões atribuídas
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {mentor.assigned_sessions.map((s, i) => (
                        <span key={i} className="text-[10px] px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                          {s}
                        </span>
                      ))}
                      {mentor.assigned_sessions.length === 0 && (
                        <span className="text-[10px] text-muted-foreground">Nenhuma sessão atribuída</span>
                      )}
                    </div>
                  </div>

                  {/* Monthly heatmap - only overview */}
                  {mode === "overview" && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Sessões por mês</span>
                      <div className="flex gap-2 flex-wrap">
                        {monthColumns.map((mc) => {
                          const c = mentor.monthly_completed[mc] || 0;
                          return (
                            <div key={mc} className="text-center">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold border ${
                                c >= 3 ? "bg-status-green/15 border-border text-status-green" :
                                c >= 1 ? "bg-status-blue/15 border-border text-status-blue" :
                                "bg-muted/30 border-border text-muted-foreground"
                              }`}>{c}</div>
                              <span className="text-[9px] text-muted-foreground mt-1 block">{formatMonthShort(mc)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </motion.div>
        )}
      </motion.div>

      {/* Add/Edit Mentor Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg">{editingId ? "Editar mentor" : "Novo mentor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {editingId && (
              <div className="pb-4 border-b border-border">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Foto de perfil</label>
                <AvatarUpload
                  profileId={editingId}
                  fullName={form.full_name || "Mentor"}
                  avatarUrl={(mentors?.find(m => m.id === editingId) as any)?.avatar_url ?? null}
                  size={72}
                />
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Nome completo *</label>
                <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className="input-begin text-sm h-10 w-full" placeholder="Nome completo" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Email *</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input-begin text-sm h-10 w-full" placeholder="mentor@libertybegin.com" />
              </div>
              {!editingId && (
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Senha temporária *</label>
                  <input type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="input-begin text-sm h-10 w-full" placeholder="Mínimo 6 caracteres" />
                  <p className="text-[9px] text-muted-foreground mt-1">O mentor poderá alterar depois</p>
                </div>
              )}
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Telefone</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="input-begin text-sm h-10 w-full" placeholder="+55 11 99999-9999" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Valor por sessão (R$)</label>
                <input type="number" value={form.session_rate} onChange={e => setForm(f => ({ ...f, session_rate: e.target.value }))} className="input-begin text-sm h-10 w-full" placeholder="300" />
              </div>
            </div>
            {sessionCatalog && sessionCatalog.length > 0 && (
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Sessões atribuídas</label>
                <div className="flex flex-wrap gap-2">
                  {sessionCatalog.map((s: any) => {
                    const selected = form.session_ids.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleSession(s.id)}
                        className={`text-[10px] px-3 py-1.5 rounded-full border transition-colors ${
                          selected ? "bg-primary text-primary-foreground border-primary/20" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : editingId ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AccessCredentialsDialog data={credentialsDialog} onClose={() => setCredentialsDialog(null)} />
    </AppLayout>
  );
};

export default AdminMentoresPage;
