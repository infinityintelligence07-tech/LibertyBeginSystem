import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Wrench, Upload, FileText, Image as ImageIcon, Loader2, Trash2, Download, Pencil,
  Plus, Link as LinkIcon, ExternalLink,
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  BottomSheet, Chip, ConfirmDialog, EmptyState, IconButton, ListRow, LoadingState,
  SectionCard, SectionHeader, SelectField, TextAreaField, TextField,
} from "@/components/ds";

type Tool = {
  id: string;
  liberty_id: string;
  booking_id: string | null;
  uploaded_by: string | null;
  title: string;
  description: string | null;
  file_name: string | null;
  file_path: string | null;
  file_type: "image" | "pdf" | "link" | "document";
  file_size: number | null;
  external_url: string | null;
  created_at: string;
};

interface StudentToolsProps {
  libertyId: string;
  bookingId?: string;
  variant?: "card" | "bare";
  title?: string;
}

const MAX_BYTES = 15 * 1024 * 1024;

type Mode = "file" | "link";

export const StudentTools = ({
  libertyId,
  bookingId,
  variant = "card",
  title,
}: StudentToolsProps) => {
  const queryClient = useQueryClient();
  const { profile, hasRole } = useAuth();
  const canManage = hasRole("mentor") || hasRole("admin");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<Mode>("file");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [draftUrl, setDraftUrl] = useState("");
  const [draftBookingId, setDraftBookingId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [editTool, setEditTool] = useState<Tool | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deleteTool, setDeleteTool] = useState<Tool | null>(null);

  const { data: tools = [], isLoading } = useQuery({
    queryKey: ["student-tools", libertyId, bookingId ?? null],
    queryFn: async () => {
      let q = supabase
        .from("student_tools")
        .select("*")
        .eq("liberty_id", libertyId)
        .order("created_at", { ascending: false });
      if (bookingId) q = q.eq("booking_id", bookingId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Tool[];
    },
  });

  const { data: studentBookings = [] } = useQuery({
    queryKey: ["student-tools-bookings", libertyId],
    enabled: !bookingId && canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, scheduled_date, start_time, status, session_id, mentor_id, sessions(name), mentor:profiles!bookings_mentor_id_fkey(full_name)")
        .eq("liberty_id", libertyId)
        .order("scheduled_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const bookingMap = new Map<string, any>();
  for (const b of studentBookings) bookingMap.set(b.id, b);

  const deleteMutation = useMutation({
    mutationFn: async (tool: Tool) => {
      if (tool.file_path) {
        await supabase.storage.from("student-tools").remove([tool.file_path]);
      }
      const { error } = await supabase.from("student_tools").delete().eq("id", tool.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-tools", libertyId] });
      setDeleteTool(null);
      toast.success("Ferramenta removida");
    },
    onError: () => toast.error("Erro ao remover"),
  });

  const openEdit = (tool: Tool) => {
    setEditTool(tool);
    setEditTitle(tool.title);
    setEditDescription(tool.description || "");
    setEditUrl(tool.external_url || "");
  };

  const saveEdit = async () => {
    if (!editTool) return;
    let newUrl: string | null = editTool.external_url;
    if (editTool.file_type === "link") newUrl = normalizeUrl(editUrl);
    setEditSaving(true);
    const { error } = await supabase
      .from("student_tools")
      .update({
        title: editTitle.trim() || editTool.title,
        description: editDescription.trim() || null,
        external_url: newUrl,
      })
      .eq("id", editTool.id);
    setEditSaving(false);
    if (error) toast.error("Erro ao editar");
    else {
      toast.success("Ferramenta atualizada");
      queryClient.invalidateQueries({ queryKey: ["student-tools", libertyId] });
      setEditTool(null);
    }
  };

  const reset = () => {
    setDraftTitle("");
    setDraftDescription("");
    setDraftFile(null);
    setDraftUrl("");
    setDraftBookingId("");
    setMode("file");
    setAdding(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const traduzirErro = (e: any, fallback: string) => {
    const raw = (e?.message || e?.error_description || "").toString();
    const m = raw.toLowerCase();
    if (!raw) return fallback;
    if (m.includes("student_tools_file_type_check"))
      return "Tipo de ferramenta não permitido. Use imagem, PDF ou link.";
    if (m.includes("violates check constraint"))
      return "Alguns dados não atendem às regras do sistema. Revise os campos e tente novamente.";
    if (m.includes("row-level security") || m.includes("permission denied"))
      return "Você não tem permissão para realizar esta ação.";
    if (m.includes("duplicate key") || m.includes("already exists"))
      return "Este item já foi cadastrado.";
    if (m.includes("foreign key"))
      return "Referência inválida. Atualize a página e tente novamente.";
    if (m.includes("network") || m.includes("failed to fetch"))
      return "Falha de conexão. Verifique sua internet e tente novamente.";
    if (m.includes("payload too large") || m.includes("exceeded"))
      return "Arquivo muito grande. Reduza o tamanho e tente novamente.";
    if (m.includes("invalid input") || m.includes("invalid url"))
      return "Formato inválido. Confira o preenchimento.";
    return fallback;
  };

  const normalizeUrl = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const handleSave = async () => {
    if (!draftTitle.trim()) {
      toast.error("Dê um título à ferramenta");
      return;
    }
    const effectiveBookingId = bookingId ?? (draftBookingId || null);

    if (mode === "link") {
      const url = normalizeUrl(draftUrl);
      if (!url) {
        toast.error("Informe o link da ferramenta");
        return;
      }
      try {
        // eslint-disable-next-line no-new
        new URL(url);
      } catch {
        toast.error("Link inválido");
        return;
      }
      setUploading(true);
      try {
        const { error: insErr } = await supabase.from("student_tools").insert({
          liberty_id: libertyId,
          booking_id: effectiveBookingId,
          uploaded_by: profile?.id ?? null,
          title: draftTitle.trim(),
          description: draftDescription.trim() || null,
          file_name: null,
          file_path: null,
          file_type: "link",
          file_size: null,
          external_url: url,
        } as any);
        if (insErr) throw insErr;
        await queryClient.invalidateQueries({ queryKey: ["student-tools", libertyId] });
        reset();
        toast.success("Link adicionado");
      } catch (e: any) {
        toast.error(traduzirErro(e, "Não foi possível salvar o link. Tente novamente."));
      } finally {
        setUploading(false);
      }
      return;
    }

    // file mode
    if (!draftFile) {
      toast.error("Selecione um arquivo");
      return;
    }
    if (draftFile.size > MAX_BYTES) {
      toast.error("Arquivo muito grande (máx. 15 MB)");
      return;
    }
    const mime = draftFile.type || "";
    const name = draftFile.name.toLowerCase();
    const isPdf = mime === "application/pdf" || name.endsWith(".pdf");
    const isImg = mime.startsWith("image/");
    const docExts = [
      ".xlsx", ".xls", ".xlsm", ".xlsb", ".csv", ".tsv",
      ".doc", ".docx", ".odt", ".rtf", ".txt",
      ".ppt", ".pptx", ".odp",
      ".numbers", ".pages", ".key",
      ".zip", ".json",
    ];
    const isDoc = !isPdf && !isImg && (
      mime.includes("spreadsheet") ||
      mime.includes("excel") ||
      mime.includes("word") ||
      mime.includes("presentation") ||
      mime.includes("powerpoint") ||
      mime === "text/csv" ||
      mime === "text/plain" ||
      mime === "application/json" ||
      mime === "application/zip" ||
      docExts.some((ext) => name.endsWith(ext))
    );
    if (!isPdf && !isImg && !isDoc) {
      toast.error("Formato não suportado. Use imagem, PDF, planilha ou documento.");
      return;
    }
    const fileType: "image" | "pdf" | "document" = isPdf ? "pdf" : isImg ? "image" : "document";
    setUploading(true);
    try {
      const safeName = draftFile.name.replace(/[^\w.\-]+/g, "_");
      const path = `${libertyId}/${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("student-tools")
        .upload(path, draftFile, { contentType: draftFile.type || "application/octet-stream", upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("student_tools").insert({
        liberty_id: libertyId,
        booking_id: effectiveBookingId,
        uploaded_by: profile?.id ?? null,
        title: draftTitle.trim(),
        description: draftDescription.trim() || null,
        file_name: draftFile.name,
        file_path: path,
        file_type: fileType,
        file_size: draftFile.size,
        external_url: null,
      } as any);
      if (insErr) throw insErr;
      await queryClient.invalidateQueries({ queryKey: ["student-tools", libertyId] });
      reset();
      toast.success("Ferramenta anexada");
    } catch (e: any) {
      toast.error(traduzirErro(e, "Não foi possível enviar o arquivo. Tente novamente."));
    } finally {
      setUploading(false);
    }
  };

  const openTool = async (tool: Tool) => {
    if (tool.file_type === "link" && tool.external_url) {
      window.open(tool.external_url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!tool.file_path) {
      toast.error("Arquivo indisponível");
      return;
    }
    const { data, error } = await supabase.storage
      .from("student-tools")
      .createSignedUrl(tool.file_path, 60 * 10);
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível abrir o arquivo");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const Wrapper = variant === "card" ? SectionCard : "div";

  const iconForTool = (t: Tool, className = "h-4 w-4") => {
    if (t.file_type === "link") return <LinkIcon className={className} aria-hidden />;
    if (t.file_type === "image") return <ImageIcon className={className} aria-hidden />;
    return <FileText className={className} aria-hidden />;
  };

  const heading = title || (bookingId ? "Ferramentas desta sessão" : "Ferramentas do aluno");

  return (
    <Wrapper className="space-y-3">
      <SectionHeader
        as="h3"
        title={
          <span className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" aria-hidden />
            {heading}
          </span>
        }
        actions={
          canManage && !adding ? (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" /> Adicionar ferramenta
            </Button>
          ) : undefined
        }
      />

      {canManage && adding && (
        <SectionCard tone="brand" padding="compact" className="space-y-3">
          <div className="flex gap-2" role="group" aria-label="Tipo de ferramenta">
            <Chip active={mode === "file"} onClick={() => setMode("file")}>
              <Upload className="h-3.5 w-3.5" aria-hidden /> Arquivo
            </Chip>
            <Chip active={mode === "link"} onClick={() => setMode("link")}>
              <LinkIcon className="h-3.5 w-3.5" aria-hidden /> Link
            </Chip>
          </div>

          <TextField
            label="Título"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="Ex: Planilha de DRE"
          />
          <TextAreaField
            label="Descrição"
            hint="Opcional"
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            rows={2}
            className="resize-none"
          />

          {mode === "link" && (
            <TextField
              label="Link"
              type="url"
              inputMode="url"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="https://... (Notion, Drive, Figma, etc.)"
            />
          )}

          {!bookingId && (
            <SelectField
              label="Vincular à sessão"
              hint="Opcional"
              value={draftBookingId}
              onChange={(e) => setDraftBookingId(e.target.value)}
            >
              <option value="">Sem sessão vinculada</option>
              {studentBookings.map((b: any) => {
                const dateStr = format(parseISO(b.scheduled_date), "dd/MM/yyyy", { locale: ptBR });
                const time = (b.start_time || "").slice(0, 5);
                const sessName = b.sessions?.name || "Sessão";
                const mentorName = b.mentor?.full_name || "Mentor";
                return (
                  <option key={b.id} value={b.id}>
                    {dateStr} {time} · {sessName} · {mentorName}
                  </option>
                );
              })}
            </SelectField>
          )}

          {mode === "file" && (
            <div className="space-y-1.5">
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="max-w-full">
                <Upload className="h-3.5 w-3.5" />
                <span className="truncate">{draftFile ? draftFile.name : "Escolher arquivo"}</span>
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,.xlsx,.xls,.xlsm,.xlsb,.csv,.tsv,.doc,.docx,.odt,.rtf,.txt,.ppt,.pptx,.odp,.numbers,.pages,.key,.zip,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
                onChange={(e) => setDraftFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <p className="text-xs text-muted-foreground">Imagem, PDF, Excel, Word, PPT, CSV... até 15 MB</p>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
            <Button variant="outline" onClick={reset} disabled={uploading}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                uploading ||
                !draftTitle.trim() ||
                (mode === "file" ? !draftFile : !draftUrl.trim())
              }
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === "link" ? (
                <LinkIcon className="h-4 w-4" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Salvar
            </Button>
          </div>
        </SectionCard>
      )}

      {isLoading ? (
        <LoadingState variant="list" rows={2} />
      ) : tools.length === 0 ? (
        <EmptyState
          compact
          icon={Wrench}
          title="Nenhuma ferramenta ainda"
          description={
            canManage
              ? "Use Adicionar ferramenta para enviar um arquivo ou link."
              : "Seu mentor ainda não compartilhou ferramentas."
          }
        />
      ) : !canManage ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tools.map((t) => (
            <SectionCard
              key={t.id}
              as="button"
              interactive
              padding="compact"
              onClick={() => openTool(t)}
              className="flex flex-col gap-3 min-h-[120px]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="w-10 h-10 rounded-ds bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  {iconForTool(t)}
                </div>
                <span className="text-muted-foreground">
                  {t.file_type === "link" ? (
                    <ExternalLink className="h-4 w-4" aria-hidden />
                  ) : (
                    <Download className="h-4 w-4" aria-hidden />
                  )}
                </span>
              </div>
              <p className="text-[15px] font-semibold text-foreground leading-snug line-clamp-2">
                {t.title}
              </p>
            </SectionCard>
          ))}
        </div>
      ) : (
        <SectionCard padding="none">
          <TooltipProvider delayDuration={200}>
            {tools.map((t, index) => {
              const booking: any = !bookingId && t.booking_id ? bookingMap.get(t.booking_id) : null;
              const bookingLine = booking
                ? `Sessão: ${booking.sessions?.name || "Sem dados"} · ${format(parseISO(booking.scheduled_date), "dd/MM/yyyy", { locale: ptBR })} · Mentor: ${booking.mentor?.full_name || "Sem dados"}`
                : null;
              const metaLine =
                t.file_type === "link"
                  ? t.external_url
                  : `${t.file_name || ""} · ${format(parseISO(t.created_at), "dd MMM yyyy", { locale: ptBR })}`;
              return (
                <ListRow
                  key={t.id}
                  last={index === tools.length - 1}
                  leading={
                    <div className="w-10 h-10 rounded-ds bg-primary/10 text-primary flex items-center justify-center">
                      {iconForTool(t)}
                    </div>
                  }
                  title={t.title}
                  subtitle={
                    <span className="block space-y-0.5">
                      {t.description && <span className="block text-foreground/80 whitespace-normal line-clamp-2">{t.description}</span>}
                      {bookingLine && <span className="block truncate text-primary">{bookingLine}</span>}
                      <span className="block truncate">{metaLine}</span>
                    </span>
                  }
                  trailing={
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <IconButton aria-label={t.file_type === "link" ? "Abrir link" : "Abrir ou baixar"} size="sm" onClick={() => openTool(t)}>
                            {t.file_type === "link" ? <ExternalLink className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                          </IconButton>
                        </TooltipTrigger>
                        <TooltipContent>{t.file_type === "link" ? "Abrir link" : "Abrir / baixar"}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <IconButton aria-label="Editar ferramenta" size="sm" onClick={() => openEdit(t)}>
                            <Pencil className="h-4 w-4" />
                          </IconButton>
                        </TooltipTrigger>
                        <TooltipContent>Editar</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <IconButton aria-label="Remover ferramenta" size="sm" onClick={() => setDeleteTool(t)} className="hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </TooltipTrigger>
                        <TooltipContent>Remover ferramenta</TooltipContent>
                      </Tooltip>
                    </div>
                  }
                />
              );
            })}
          </TooltipProvider>
        </SectionCard>
      )}

      <BottomSheet
        open={!!editTool}
        onOpenChange={(o) => !o && !editSaving && setEditTool(null)}
        title="Editar ferramenta"
        size="sm"
        locked={editSaving}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditTool(null)} disabled={editSaving}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={editSaving || !editTitle.trim()}>
              {editSaving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <TextField label="Título" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
          <TextAreaField label="Descrição" hint="Opcional" rows={2} className="resize-none" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
          {editTool?.file_type === "link" && (
            <TextField label="Link" type="url" inputMode="url" value={editUrl} onChange={(e) => setEditUrl(e.target.value)} />
          )}
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={!!deleteTool}
        onOpenChange={(o) => !o && setDeleteTool(null)}
        title={deleteTool ? `Remover "${deleteTool.title}"?` : "Remover ferramenta?"}
        description="O arquivo ou link deixará de aparecer para o aluno."
        confirmLabel="Remover"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTool && deleteMutation.mutate(deleteTool)}
      />
    </Wrapper>
  );
};
