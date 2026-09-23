import { useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSessionCatalog } from "@/hooks/useAdminData";
import { shortName } from "@/lib/formatName";
import { FileText, Wrench, AlertTriangle, CheckCircle2, Clock, Plus, Edit, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  PageContainer,
  PageHeader,
  SectionHeader,
  SectionCard,
  Callout,
  ListRow,
  DateBlock,
  StatusPill,
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

const contentTypeLabel = (value: string) => contentTypes.find((c) => c.value === value)?.label ?? value;

const formatDateBR = (date: string) => new Date(date + "T12:00:00").toLocaleDateString("pt-BR");

const ReportField = ({ label, value }: { label: string; value: string | null | undefined }) =>
  value ? (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{value}</p>
    </div>
  ) : null;

const AdminConteudosPage = () => {
  const { data: sessions } = useSessionCatalog();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContentForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openReportId, setOpenReportId] = useState<string | null>(null);

  const { data: reports, isLoading, isError, refetch } = useQuery({
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

  const { data: contents, isLoading: contentsLoading, isError: contentsError, refetch: refetchContents } = useQuery({
    queryKey: ["admin-contents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contents").select("*, sessions(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

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

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const { error } = await supabase.from("contents").delete().eq("id", id);
      if (error) throw error;
      toast.success("Conteúdo excluído");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["admin-contents"] });
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setDeleting(false);
    }
  };

  const openReport = (reports || []).find((r: any) => r.id === openReportId) as any | undefined;

  return (
    <AppLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Relatórios e ferramentas"
          description="Relatórios das sessões preenchidos pelos mentores e ferramentas do programa."
          actions={
            <Button onClick={openAdd}>
              <Plus aria-hidden /> Novo conteúdo
            </Button>
          }
        />

        {sessionsMissingTools.length > 0 && (
          <Callout
            tone="warning"
            icon={AlertTriangle}
            title={`${sessionsMissingTools.length} ${sessionsMissingTools.length === 1 ? "sessão sem ferramenta cadastrada" : "sessões sem ferramenta cadastrada"}`}
          >
            <div className="flex flex-wrap gap-1.5 pt-1">
              {sessionsMissingTools.map(s => (
                <StatusPill key={s.id} tone="warning" withDot={false}>{s.name}</StatusPill>
              ))}
            </div>
          </Callout>
        )}

        <section className="space-y-3">
          <SectionHeader title="Relatórios das sessões" description="Toque em um relatório para ler o conteúdo completo." />
          {isLoading ? (
            <LoadingState variant="list" rows={4} />
          ) : isError ? (
            <ErrorState title="Não foi possível carregar os relatórios" onRetry={() => refetch()} />
          ) : !reports || reports.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Nenhum relatório preenchido ainda"
              description="Os relatórios aparecem aqui automaticamente quando os mentores os preenchem após as sessões."
            />
          ) : (
            <SectionCard padding="none">
              {reports.map((r: any, index: number) => {
                const booking = r.bookings;
                const sessionName = booking?.sessions?.name || "Sem dados";
                const mentorName = booking?.mentor?.full_name || "Sem dados";
                const libertyName = booking?.liberty?.full_name || "Sem dados";
                const date = booking?.scheduled_date as string | undefined;
                const hasContent = r.summary || r.goals || r.action_plan;
                return (
                  <ListRow
                    key={r.id}
                    last={index === reports.length - 1}
                    onPress={() => setOpenReportId(r.id)}
                    leading={
                      date ? (
                        <DateBlock date={date} />
                      ) : (
                        <FileText className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />
                      )
                    }
                    title={sessionName}
                    subtitle={`${shortName(libertyName)} · Mentor: ${shortName(mentorName)}${r.summary ? ` · ${r.summary}` : ""}`}
                    trailing={
                      hasContent ? (
                        <StatusPill tone="success">Preenchido</StatusPill>
                      ) : (
                        <StatusPill tone="neutral">Sem conteúdo</StatusPill>
                      )
                    }
                  />
                );
              })}
            </SectionCard>
          )}
        </section>

        <section className="space-y-3">
          <SectionHeader title="Ferramentas do programa" description="Conteúdos que os membros acessam nas trilhas." />
          {contentsLoading ? (
            <LoadingState variant="list" rows={3} />
          ) : contentsError ? (
            <ErrorState title="Não foi possível carregar as ferramentas" onRetry={() => refetchContents()} />
          ) : !contents || contents.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title="Nenhuma ferramenta cadastrada"
              description="Adicione conteúdos para que os membros os acessem nas trilhas."
              action={
                <Button onClick={openAdd}>
                  <Plus aria-hidden /> Adicionar conteúdo
                </Button>
              }
            />
          ) : (
            <SectionCard padding="none">
              {contents.map((t: any, index: number) => (
                <ListRow
                  key={t.id}
                  last={index === contents.length - 1}
                  leading={<Wrench className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />}
                  title={t.title}
                  subtitle={[contentTypeLabel(t.content_type), t.sessions?.name, t.description].filter(Boolean).join(" · ")}
                  trailing={
                    <>
                      {t.is_public && <StatusPill tone="info" className="hidden sm:inline-flex">Público</StatusPill>}
                      {t.url && (
                        <Button asChild variant="ghost" size="sm">
                          <a href={t.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink aria-hidden /> Abrir
                          </a>
                        </Button>
                      )}
                      <IconButton aria-label={`Editar ${t.title}`} size="sm" onClick={() => openEdit(t)}>
                        <Edit className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        aria-label={`Excluir ${t.title}`}
                        size="sm"
                        className="hover:text-destructive"
                        onClick={() => setDeleteTarget({ id: t.id, title: t.title })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </>
                  }
                />
              ))}
            </SectionCard>
          )}
        </section>
      </PageContainer>

      <BottomSheet
        open={openReportId !== null}
        onOpenChange={(open) => !open && setOpenReportId(null)}
        title={openReport?.bookings?.sessions?.name || "Relatório da sessão"}
        description={
          openReport
            ? `${shortName(openReport.bookings?.liberty?.full_name || "Sem dados")} · Mentor: ${shortName(openReport.bookings?.mentor?.full_name || "Sem dados")}${
                openReport.bookings?.scheduled_date ? ` · ${formatDateBR(openReport.bookings.scheduled_date)}` : ""
              }`
            : undefined
        }
        size="lg"
      >
        {openReport && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {openReport.summary || openReport.goals || openReport.action_plan ? (
                <StatusPill tone="success">Preenchido</StatusPill>
              ) : (
                <StatusPill tone="neutral">Sem conteúdo</StatusPill>
              )}
            </div>
            <ReportField label="Resumo" value={openReport.summary} />
            <ReportField label="Metas" value={openReport.goals} />
            <ReportField label="Plano de ação" value={openReport.action_plan} />
            <ReportField label="Impressões do mentor" value={openReport.mentor_impressions} />
            {!openReport.summary && !openReport.goals && !openReport.action_plan && !openReport.mentor_impressions && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" aria-hidden /> O mentor ainda não preencheu este relatório.
              </div>
            )}
            {openReport.summary || openReport.goals || openReport.action_plan ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Relatório entregue pelo mentor.
              </div>
            ) : null}
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editingId ? "Editar conteúdo" : "Novo conteúdo"}
        locked={saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : editingId ? "Salvar" : "Criar conteúdo"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Título"
            required
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Título"
          />
          <TextAreaField
            label="Descrição"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="h-16 resize-none"
            placeholder="Descrição"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              label="Tipo"
              value={form.content_type}
              onChange={e => setForm(f => ({ ...f, content_type: e.target.value }))}
            >
              {contentTypes.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
            </SelectField>
            <SelectField
              label="Sessão vinculada"
              value={form.session_id}
              onChange={e => setForm(f => ({ ...f, session_id: e.target.value }))}
            >
              <option value="">Nenhuma</option>
              {(sessions || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </SelectField>
          </div>
          <TextField
            label="URL"
            type="url"
            inputMode="url"
            value={form.url}
            onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
            placeholder="https://..."
          />
          <div className="flex items-center justify-between gap-3 min-h-[44px]">
            <label htmlFor="content-public" className="text-sm font-medium text-foreground cursor-pointer flex-1">Conteúdo público</label>
            <Switch id="content-public" checked={form.is_public} onCheckedChange={(v) => setForm(f => ({ ...f, is_public: v }))} />
          </div>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir conteúdo?"
        description={deleteTarget ? `"${deleteTarget.title}" deixará de aparecer para os membros. Essa ação não pode ser desfeita.` : undefined}
        confirmLabel="Excluir"
        destructive
        loading={deleting}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
      />
    </AppLayout>
  );
};

export default AdminConteudosPage;
