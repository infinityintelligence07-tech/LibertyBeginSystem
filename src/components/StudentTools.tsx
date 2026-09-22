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
      toast.success("Ferramenta removida");
    },
    onError: () => toast.error("Erro ao remover"),
  });

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

  const wrapper = variant === "card" ? "rounded-2xl border border-border bg-card/70 p-5" : "";

  const iconForTool = (t: Tool) => {
    if (t.file_type === "link") return <LinkIcon className="h-4 w-4" />;
    if (t.file_type === "image") return <ImageIcon className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  return (
    <div className={wrapper}>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
          <Wrench className="h-4 w-4 text-primary" />
          {title || (bookingId ? "Ferramentas desta sessão" : "Ferramentas do aluno")}
        </h2>
        {canManage && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-[10px] text-primary hover:underline flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> Adicionar ferramenta
          </button>
        )}
      </div>

      {canManage && adding && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2 mb-3">
          {/* Mode toggle */}
          <div className="flex gap-1 p-1 bg-card border border-border rounded-lg w-fit">
            <button
              onClick={() => setMode("file")}
              className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
                mode === "file" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Upload className="h-3 w-3" /> Arquivo
            </button>
            <button
              onClick={() => setMode("link")}
              className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
                mode === "link" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LinkIcon className="h-3 w-3" /> Link
            </button>
          </div>

          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="Título (ex: Planilha de DRE)"
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/30"
          />
          <textarea
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            placeholder="Descrição (opcional)"
            rows={2}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/30 resize-none"
          />

          {mode === "link" && (
            <input
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="https://... (Notion, Drive, Figma, etc.)"
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/30"
            />
          )}

          {!bookingId && (
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">
                Vincular à sessão (opcional)
              </label>
              <select
                value={draftBookingId}
                onChange={(e) => setDraftBookingId(e.target.value)}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/30"
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
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {mode === "file" && (
              <>
                <label className="text-xs text-primary cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/30 hover:bg-primary/10 transition-colors">
                  <Upload className="h-3.5 w-3.5" />
                  {draftFile ? draftFile.name : "Escolher arquivo"}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf,.xlsx,.xls,.xlsm,.xlsb,.csv,.tsv,.doc,.docx,.odt,.rtf,.txt,.ppt,.pptx,.odp,.numbers,.pages,.key,.zip,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
                    onChange={(e) => setDraftFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
                <span className="text-[10px] text-muted-foreground">Imagem, PDF, Excel, Word, PPT, CSV... até 15 MB</span>
              </>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={reset}
                disabled={uploading}
                className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={
                  uploading ||
                  !draftTitle.trim() ||
                  (mode === "file" ? !draftFile : !draftUrl.trim())
                }
                className="btn-silver text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : mode === "link" ? (
                  <LinkIcon className="h-3.5 w-3.5" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground italic">Carregando...</p>
      ) : tools.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          {canManage
            ? "Nenhuma ferramenta adicionada. Use o botão acima para enviar um arquivo ou link."
            : "Nenhuma ferramenta disponível ainda."}
        </p>
      ) : !canManage ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tools.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => openTool(t)}
              className="group text-left rounded-2xl border border-border bg-background/40 hover:bg-muted/40 hover:border-primary/30 transition-all p-5 flex flex-col gap-4 min-h-[132px]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  {iconForTool(t)}
                </div>
                <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                  {t.file_type === "link" ? (
                    <ExternalLink className="h-4 w-4" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </span>
              </div>
              <p className="text-base font-semibold text-foreground leading-snug line-clamp-2">
                {t.title}
              </p>
            </button>
          ))}
        </div>
      ) : (

        <ul className="space-y-2">
          {tools.map((t) => (
            <li
              key={t.id}
              className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-border bg-background/40 group"
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                {iconForTool(t)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground font-medium truncate">{t.title}</p>
                {t.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                )}
                {!bookingId && t.booking_id && (() => {
                  const b: any = bookingMap.get(t.booking_id);
                  if (!b) return null;
                  const dateStr = format(parseISO(b.scheduled_date), "dd/MM/yyyy", { locale: ptBR });
                  return (
                    <p className="text-[10px] text-primary/80 mt-0.5 truncate">
                      Sessão: {b.sessions?.name || "Sem dados"} · {dateStr} · Mentor: {b.mentor?.full_name || "Sem dados"}
                    </p>
                  );
                })()}
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {t.file_type === "link"
                    ? t.external_url
                    : `${t.file_name || ""} · ${format(parseISO(t.created_at), "dd MMM yyyy", { locale: ptBR })}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => openTool(t)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {t.file_type === "link" ? (
                          <ExternalLink className="h-3.5 w-3.5" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t.file_type === "link" ? "Abrir link" : "Abrir / baixar"}
                    </TooltipContent>
                  </Tooltip>
                  {canManage && (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={async () => {
                              const newTitle = prompt("Novo título:", t.title);
                              if (newTitle === null) return;
                              const newDesc = prompt("Descrição (opcional):", t.description || "");
                              if (newDesc === null) return;
                              let newUrl: string | null = t.external_url;
                              if (t.file_type === "link") {
                                const u = prompt("Link:", t.external_url || "");
                                if (u === null) return;
                                newUrl = normalizeUrl(u);
                              }
                              const { error } = await supabase
                                .from("student_tools")
                                .update({
                                  title: newTitle.trim() || t.title,
                                  description: newDesc.trim() || null,
                                  external_url: newUrl,
                                })
                                .eq("id", t.id);
                              if (error) toast.error("Erro ao editar");
                              else {
                                toast.success("Ferramenta atualizada");
                                queryClient.invalidateQueries({ queryKey: ["student-tools", libertyId] });
                              }
                            }}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Editar</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => {
                              if (confirm(`Remover "${t.title}"?`)) deleteMutation.mutate(t);
                            }}
                            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Remover ferramenta</TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </TooltipProvider>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
