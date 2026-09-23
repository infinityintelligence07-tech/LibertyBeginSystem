import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useSessionCatalog } from "@/hooks/useAdminData";
import { ClipboardList, Edit, Plus, Trash2, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SessionCoverUpload } from "@/components/SessionCoverUpload";
import {
  PageContainer,
  PageHeader,
  SectionCard,
  ListRow,
  StatusPill,
  Chip,
  IconButton,
  BottomSheet,
  ConfirmDialog,
  TextField,
  TextAreaField,
  SelectField,
  LoadingState,
  EmptyState,
  ErrorState,
} from "@/components/ds";

const pillars = ["Negócios", "Emocional", "Mentalidade", "Espiritual"];

const AdminSessoesPage = () => {
  const { data: sessions, isLoading, isError, refetch } = useSessionCatalog();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [addOpen, setAddOpen] = useState(false);
  const [newSession, setNewSession] = useState({ name: "", description: "", duration_minutes: 90, pillar: "", order: 0 });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await supabase.from("mentor_sessions").delete().eq("session_id", id);
      const { error } = await supabase.from("sessions").delete().eq("id", id);
      if (error) throw error;
      toast.success("Sessão excluída");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["session-catalog"] });
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setDeleting(false);
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

  const editingSession = (sessions || []).find((s: any) => s.id === editingId) as any | undefined;
  const refreshCover = () => queryClient.invalidateQueries({ queryKey: ["session-catalog"] });

  const total = sessions?.length ?? 0;

  return (
    <AppLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Sessões da jornada"
          description={isLoading ? "Carregando catálogo" : `${total} ${total === 1 ? "sessão" : "sessões"} · 12 sessões = jornada completa`}
          actions={
            <Button onClick={() => setAddOpen(true)}>
              <Plus aria-hidden /> Nova sessão
            </Button>
          }
        />

        {isLoading ? (
          <LoadingState variant="list" rows={6} />
        ) : isError ? (
          <ErrorState title="Não foi possível carregar as sessões" onRetry={() => refetch()} />
        ) : !sessions || sessions.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Nenhuma sessão cadastrada"
            description="Crie a primeira sessão para começar a estruturar a jornada."
            action={
              <Button onClick={() => setAddOpen(true)}>
                <Plus aria-hidden /> Criar sessão
              </Button>
            }
          />
        ) : (
          <SectionCard padding="none">
            {sessions.map((session: any, index: number) => {
              const sessionMentors = getMentorsForSession(session.id);
              const isKickoff = !!session.is_kickoff;
              const meta = [
                `${session.duration_minutes} min`,
                sessionMentors.length > 0
                  ? `${sessionMentors.length} ${sessionMentors.length === 1 ? "mentor" : "mentores"}`
                  : "Sem mentor vinculado",
                session.description,
              ].filter(Boolean).join(" · ");

              return (
                <ListRow
                  key={session.id}
                  last={index === sessions.length - 1}
                  className={!session.is_active ? "opacity-70" : undefined}
                  leading={
                    <div
                      className="h-10 w-10 flex items-center justify-center shrink-0 text-muted-foreground"
                      aria-label={isKickoff ? "Sessão de abertura (Mapeamento)" : `Ordem ${session.order}`}
                    >
                      {isKickoff ? <Star className="h-4 w-4" aria-hidden /> : <span className="text-[15px] font-semibold tabular-nums text-foreground">{session.order}</span>}
                    </div>
                  }
                  title={
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{session.name}</span>
                      {isKickoff && <StatusPill tone="neutral" withDot={false}>Abertura</StatusPill>}
                    </span>
                  }
                  subtitle={meta}
                  trailing={
                    <>
                      {session.pillar && (
                        <span className="hidden md:inline-flex items-center text-[11px] font-medium text-muted-foreground">
                          {session.pillar}
                        </span>
                      )}
                      {session.is_active ? (
                        <StatusPill tone="success">Ativa</StatusPill>
                      ) : (
                        <StatusPill tone="neutral">Inativa</StatusPill>
                      )}
                      <IconButton aria-label={`Editar ${session.name}`} size="sm" onClick={() => startEdit(session)}>
                        <Edit className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        aria-label={`Excluir ${session.name}`}
                        size="sm"
                        className="hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteTarget({ id: session.id, name: session.name })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </>
                  }
                />
              );
            })}
          </SectionCard>
        )}
      </PageContainer>

      <BottomSheet
        open={editingId !== null}
        onOpenChange={(open) => !open && cancelEdit()}
        title="Editar sessão"
        description={editingSession?.name}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={cancelEdit}>Cancelar</Button>
            <Button onClick={() => editingId && saveEdit(editingId)}>Salvar</Button>
          </>
        }
      >
        {editingSession && (
          <div className="space-y-5">
            <SessionCoverUpload
              sessionId={editingSession.id}
              sessionName={editingSession.name}
              coverUrl={editingSession.cover_image_url || null}
              onChange={refreshCover}
            />
            <TextField
              label="Nome da sessão"
              required
              value={editData.name ?? ""}
              onChange={e => setEditData((p: any) => ({ ...p, name: e.target.value }))}
              placeholder="Nome da sessão"
            />
            <TextAreaField
              label="Descrição"
              value={editData.description ?? ""}
              onChange={e => setEditData((p: any) => ({ ...p, description: e.target.value }))}
              className="h-20 resize-none"
              placeholder="Descrição"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField
                label="Duração (min)"
                type="number"
                inputMode="numeric"
                value={editData.duration_minutes ?? ""}
                onChange={e => setEditData((p: any) => ({ ...p, duration_minutes: parseInt(e.target.value) || 90 }))}
              />
              <SelectField
                label="Pilar"
                value={editData.pillar ?? ""}
                onChange={e => setEditData((p: any) => ({ ...p, pillar: e.target.value }))}
              >
                <option value="">Selecione</option>
                {pillars.map(p => <option key={p} value={p}>{p}</option>)}
              </SelectField>
              <SelectField
                label="Status"
                value={editData.is_active ? "true" : "false"}
                onChange={e => setEditData((p: any) => ({ ...p, is_active: e.target.value === "true" }))}
              >
                <option value="true">Ativa</option>
                <option value="false">Inativa</option>
              </SelectField>
              <SelectField
                label="Sessão de abertura"
                hint="Obrigatória e destacada na jornada"
                value={editData.is_kickoff ? "true" : "false"}
                onChange={e => setEditData((p: any) => ({ ...p, is_kickoff: e.target.value === "true" }))}
              >
                <option value="false">Não</option>
                <option value="true">Sim</option>
              </SelectField>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Mentores vinculados</p>
              {(allMentors || []).length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum mentor ativo cadastrado.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(allMentors || []).map((m: any) => (
                    <Chip key={m.id} active={editData.mentor_ids?.includes(m.id)} onClick={() => toggleMentor(m.id)}>
                      {m.full_name}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Nova sessão"
        description="A ordem na jornada é definida automaticamente."
        locked={saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? "Salvando..." : "Criar sessão"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Nome"
            required
            value={newSession.name}
            onChange={e => setNewSession(s => ({ ...s, name: e.target.value }))}
            placeholder="Nome da sessão"
          />
          <TextAreaField
            label="Descrição"
            value={newSession.description}
            onChange={e => setNewSession(s => ({ ...s, description: e.target.value }))}
            className="h-20 resize-none"
            placeholder="Descrição"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField
              label="Duração (min)"
              type="number"
              inputMode="numeric"
              value={newSession.duration_minutes}
              onChange={e => setNewSession(s => ({ ...s, duration_minutes: parseInt(e.target.value) || 90 }))}
            />
            <SelectField
              label="Pilar"
              value={newSession.pillar}
              onChange={e => setNewSession(s => ({ ...s, pillar: e.target.value }))}
            >
              <option value="">Selecione</option>
              {pillars.map(p => <option key={p} value={p}>{p}</option>)}
            </SelectField>
          </div>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir sessão?"
        description={deleteTarget ? `"${deleteTarget.name}" será removida do catálogo. Isso pode afetar agendamentos existentes.` : undefined}
        confirmLabel="Excluir"
        destructive
        loading={deleting}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
      />
    </AppLayout>
  );
};

export default AdminSessoesPage;
