import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { AdminMonthFilter } from "@/components/AdminMonthFilter";
import { useAdminFilter } from "@/contexts/AdminFilterContext";
import { useMentors, useAdminStats, useSessionCatalog } from "@/hooks/useAdminData";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { toTitleCase } from "@/lib/formatName";
import { UserAvatar } from "@/components/UserAvatar";
import { GraduationCap, Users, CheckCircle2, Calendar, DollarSign, Plus, Pencil, Trash2, Send, Loader2, Power } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AvatarUpload } from "@/components/AvatarUpload";
import { AccessCredentialsDialog, AccessCredentialsData } from "@/components/AccessCredentialsDialog";
import {
  BottomSheet,
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  PageContainer,
  PageHeader,
  SectionCard,
  Stat,
  StatusPill,
  TextField,
} from "@/components/ds";

interface ConfirmRequest {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

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
  const { data: mentors, isLoading, isError, refetch } = useMentors();
  const [confirmState, setConfirmState] = useState<ConfirmRequest | null>(null);
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
            role: "mentor",
            profile_updates: {
              full_name: form.full_name.trim(),
              phone: form.phone.trim() || null,
              session_rate: form.session_rate ? parseFloat(form.session_rate) : null,
            },
          },
        });
        if (error || (data as any)?.error) {
          let msg = error?.message || (data as any)?.error || "Falha ao atualizar mentor";
          try {
            const ctx = (error as { context?: Response } | null)?.context;
            if (ctx && typeof ctx.json === "function") {
              const body = await ctx.clone().json();
              if (body?.error) msg = body.error;
            }
          } catch { /* ignore */ }
          throw new Error(msg);
        }
        // Mentor sem conta que acabou de receber e-mail: a function criou o acesso e devolveu a senha
        if ((data as any)?.account_created && (data as any)?.password) {
          setCredentialsDialog({
            full_name: form.full_name.trim(),
            email: (data as any).email || email,
            password: (data as any).password,
            role: "mentor",
          });
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

  const handleDelete = (id: string, name: string) => {
    setConfirmState({
      title: `Excluir o mentor "${name}"?`,
      description: "O cadastro e as sessões atribuídas são removidos permanentemente.",
      confirmLabel: "Excluir",
      destructive: true,
      onConfirm: () => performDelete(id),
    });
  };

  const performDelete = async (id: string) => {
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

  const handleToggleActive = (mentor: any) => {
    const nextActive = !mentor.is_active;
    const verb = nextActive ? "reativar" : "inativar";
    setConfirmState({
      title: `Deseja ${verb} o mentor "${mentor.full_name}"?`,
      description: !nextActive ? "Sessões futuras agendadas serão canceladas automaticamente." : undefined,
      confirmLabel: nextActive ? "Reativar" : "Inativar",
      destructive: !nextActive,
      onConfirm: () => performToggleActive(mentor),
    });
  };

  const performToggleActive = async (mentor: any) => {
    const nextActive = !mentor.is_active;
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

  const handleInvite = (mentor: any) => {
    if (!mentor.email) { toast.error("Mentor sem e-mail cadastrado"); return; }
    setConfirmState({
      title: `Gerar acesso para ${mentor.full_name}?`,
      description: "Isso gera uma nova senha temporária aleatória (a senha atual deixa de valer) e abre uma janela com a mensagem pronta para copiar.",
      confirmLabel: "Gerar acesso",
      onConfirm: () => performInvite(mentor),
    });
  };

  const performInvite = async (mentor: any) => {
    setInvitingId(mentor.id);
    try {
      const { data, error } = await supabase.functions.invoke("reset-and-invite", {
        body: { profile_id: mentor.id, role: "mentor" },
      });
      if (error) {
        // supabase-js engole o body em non-2xx: recupera o { error } real
        let msg = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.clone().json();
            if (body?.error) msg = body.error;
          }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
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

  const activeCount = (mentors || []).filter((m) => m.is_active !== false).length;
  const formatBRL = (value: number) => `R$ ${Math.round(value).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

  const renderMentorCard = (mentor: NonNullable<typeof mentors>[number]) => {
    const sessionsCount = filterKey ? (mentor.monthly_completed[filterKey] || 0) : mentor.total_completed;
    const revenue = sessionsCount * defaultRate;
    const inactive = mentor.is_active === false;
    const busy = invitingId === mentor.id || togglingActiveId === mentor.id;

    return (
      <SectionCard key={mentor.id} as="article" className={inactive ? "opacity-80" : undefined}>
        {/* Identidade + ações */}
        <div className="flex items-start gap-3">
          <UserAvatar name={mentor.full_name} avatarUrl={(mentor as any).avatar_url} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-foreground truncate">{toTitleCase(mentor.full_name)}</h2>
              {inactive && <StatusPill tone="danger" size="sm">Inativo</StatusPill>}
              {!mentor.email && <StatusPill tone="warning" size="sm">Sem e-mail</StatusPill>}
            </div>
            <p className="text-sm text-muted-foreground truncate">{mentor.email || "Sem e-mail cadastrado"}</p>
            <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              <div className="flex gap-1">
                <dt>Telefone:</dt>
                <dd className="text-foreground">{mentor.phone || "Sem dados"}</dd>
              </div>
              <div className="flex gap-1">
                <dt>Valor por sessão:</dt>
                <dd className="text-foreground tabular-nums">{formatBRL(mentor.session_rate ?? defaultRate)}</dd>
              </div>
            </dl>
          </div>
          <div className="flex items-center gap-0.5 shrink-0" role="group" aria-label={`Ações para ${toTitleCase(mentor.full_name)}`}>
            <IconButton
              aria-label="Gerar acesso e enviar por WhatsApp"
              title="Gerar acesso e enviar por WhatsApp (e-mail + senha temporária)"
              size="sm"
              className="hover:text-status-green"
              disabled={busy}
              onClick={() => handleInvite(mentor)}
            >
              {invitingId === mentor.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </IconButton>
            <IconButton aria-label="Editar mentor" title="Editar dados do mentor" size="sm" onClick={() => openEdit(mentor)}>
              <Pencil className="h-4 w-4" />
            </IconButton>
            <IconButton
              aria-label={inactive ? "Reativar mentor" : "Inativar mentor"}
              title={inactive ? "Reativar mentor" : "Inativar mentor (cancela sessões futuras)"}
              size="sm"
              className={inactive ? "text-destructive" : "hover:text-status-yellow"}
              disabled={busy}
              onClick={() => handleToggleActive(mentor)}
            >
              {togglingActiveId === mentor.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
            </IconButton>
            <IconButton
              aria-label="Excluir mentor"
              title="Excluir mentor permanentemente"
              size="sm"
              className="hover:text-destructive"
              onClick={() => handleDelete(mentor.id, mentor.full_name)}
            >
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        </div>

        {/* Indicadores */}
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat size="sm" icon={CheckCircle2} tone="success" label={filterKey ? "Realizadas no mês" : "Realizadas"} value={sessionsCount} />
          <Stat size="sm" icon={Calendar} tone="info" label="Agendadas" value={mentor.total_scheduled} />
          <Stat size="sm" icon={Users} tone="brand" label="Membros atendidos" value={mentor.members_served} />
          <Stat size="sm" icon={DollarSign} label={filterKey ? "Receita no mês" : "Receita total"} value={formatBRL(revenue)} />
        </div>

        {/* Sessões atribuídas */}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="ds-kicker mb-2 flex items-center gap-1.5">
            <GraduationCap className="h-3.5 w-3.5" aria-hidden /> Sessões atribuídas
          </p>
          <div className="flex flex-wrap gap-1.5">
            {mentor.assigned_sessions.map((s, i) => (
              <StatusPill key={i} tone="brand" size="sm" withDot={false}>{s}</StatusPill>
            ))}
            {mentor.assigned_sessions.length === 0 && (
              <span className="text-xs text-muted-foreground">Nenhuma sessão atribuída</span>
            )}
          </div>
        </div>

        {/* Sessões por mês (somente visão geral) */}
        {mode === "overview" && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="ds-kicker mb-2">Sessões realizadas por mês</p>
            <ul className="flex gap-2 flex-wrap" aria-label="Sessões realizadas nos últimos 6 meses">
              {monthColumns.map((mc) => {
                const c = mentor.monthly_completed[mc] || 0;
                return (
                  <li key={mc} className="text-center">
                    <div
                      className={`w-10 h-10 rounded-ds flex items-center justify-center text-sm font-semibold tabular-nums border ${
                        c >= 3 ? "bg-status-green/15 border-status-green/30 text-status-green" :
                        c >= 1 ? "bg-status-blue/15 border-status-blue/30 text-status-blue" :
                        "bg-muted/30 border-border text-muted-foreground"
                      }`}
                      aria-label={`${formatMonthShort(mc)}: ${c} sessões`}
                    >
                      {c}
                    </div>
                    <span className="text-[11px] text-muted-foreground mt-1 block">{formatMonthShort(mc)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </SectionCard>
    );
  };

  return (
    <AppLayout role="admin">
      <PageContainer>
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
          <motion.div variants={fadeUpItem}>
            <PageHeader
              eyebrow="Admin"
              title="Mentores"
              description={`${activeCount} mentor${activeCount !== 1 ? "es" : ""} ativo${activeCount !== 1 ? "s" : ""} · Valor padrão por sessão: ${formatBRL(defaultRate)}`}
              actions={
                <Button size="sm" onClick={openAdd}>
                  <Plus className="h-4 w-4" /> Novo mentor
                </Button>
              }
            />
          </motion.div>

          <motion.div variants={fadeUpItem} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <AdminMonthFilter />
            {inactiveCount > 0 && (
              <Chip active={showInactive} onClick={() => setShowInactive((v) => !v)} count={inactiveCount}>
                <Power className="h-3.5 w-3.5" aria-hidden /> Mostrar inativos
              </Chip>
            )}
          </motion.div>

          {isLoading ? (
            <LoadingState variant="cards" rows={3} />
          ) : isError ? (
            <ErrorState title="Não foi possível carregar os mentores" onRetry={() => refetch()} />
          ) : !mentors || mentors.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="Nenhum mentor cadastrado"
              description="Adicione o primeiro mentor para começar a distribuir sessões."
              action={
                <Button size="sm" onClick={openAdd}>
                  <Plus className="h-4 w-4" /> Adicionar mentor
                </Button>
              }
            />
          ) : visibleMentors.length === 0 ? (
            <EmptyState
              icon={Power}
              title="Todos os mentores estão inativos"
              description="Ative o filtro para ver os mentores inativos ou cadastre um novo."
              action={<Button size="sm" variant="outline" onClick={() => setShowInactive(true)}>Mostrar inativos</Button>}
            />
          ) : (
            <motion.div variants={fadeUpItem} className="space-y-4">
              {visibleMentors.map(renderMentorCard)}
            </motion.div>
          )}
        </motion.div>
      </PageContainer>

      {/* Novo / editar mentor */}
      <BottomSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editingId ? "Editar mentor" : "Novo mentor"}
        description={editingId ? "Altere os dados e as sessões que este mentor pode conduzir." : "O mentor recebe acesso com o e-mail e a senha temporária informados."}
        locked={saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando" : editingId ? "Salvar" : "Adicionar"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {editingId && (
            <div className="flex items-center gap-4 pb-4 border-b border-border">
              <AvatarUpload
                profileId={editingId}
                fullName={form.full_name || "Mentor"}
                avatarUrl={(mentors?.find((m) => m.id === editingId) as any)?.avatar_url ?? null}
                size={72}
              />
              <div>
                <p className="text-sm font-medium text-foreground">Foto de perfil</p>
                <p className="text-xs text-muted-foreground">Aparece para os membros na agenda e nas sessões.</p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField
              label="Nome completo *"
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              placeholder="Nome completo"
              autoComplete="off"
            />
            <TextField
              label="E-mail *"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="mentor@libertybegin.com"
              autoComplete="off"
            />
            {!editingId && (
              <TextField
                label="Senha temporária *"
                type="text"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Mínimo 6 caracteres"
                hint="O mentor poderá alterar depois."
                autoComplete="off"
              />
            )}
            <TextField
              label="Telefone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+55 11 99999-9999"
            />
            <TextField
              label="Valor por sessão (R$)"
              type="number"
              inputMode="decimal"
              value={form.session_rate}
              onChange={(e) => setForm((f) => ({ ...f, session_rate: e.target.value }))}
              placeholder={String(defaultRate)}
              hint={`Em branco usa o valor padrão (${formatBRL(defaultRate)}).`}
            />
          </div>
          {sessionCatalog && sessionCatalog.length > 0 && (
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Sessões atribuídas</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Sessões que o mentor pode conduzir">
                {sessionCatalog.map((s: any) => (
                  <Chip key={s.id} active={form.session_ids.includes(s.id)} onClick={() => toggleSession(s.id)}>
                    {s.name}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={!!confirmState}
        onOpenChange={(o) => { if (!o) setConfirmState(null); }}
        title={confirmState?.title ?? ""}
        description={confirmState?.description}
        confirmLabel={confirmState?.confirmLabel}
        destructive={confirmState?.destructive}
        onConfirm={() => { const action = confirmState?.onConfirm; setConfirmState(null); void action?.(); }}
      />

      <AccessCredentialsDialog data={credentialsDialog} onClose={() => setCredentialsDialog(null)} />
    </AppLayout>
  );
};

export default AdminMentoresPage;
