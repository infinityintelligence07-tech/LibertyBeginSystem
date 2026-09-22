import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  sessionName: string;
  coverUrl: string | null;
  onChange: () => void;
}

const MAX_BYTES = 2 * 1024 * 1024; // 2MB

export const SessionCoverUpload = ({ sessionId, sessionName, coverUrl, onChange }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const extractPath = (url: string): string | null => {
    const marker = "/session-covers/";
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return url.slice(idx + marker.length).split("?")[0];
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Envie um arquivo de imagem");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Imagem deve ter no máximo 2 MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${sessionId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("session-covers")
        .upload(path, file, { cacheControl: "3600", upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("session-covers").getPublicUrl(path);
      const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;
      const { error: updErr } = await supabase
        .from("sessions")
        .update({ cover_image_url: publicUrl })
        .eq("id", sessionId);
      if (updErr) throw updErr;

      // Try to remove the previous file
      if (coverUrl) {
        const prev = extractPath(coverUrl);
        if (prev) await supabase.storage.from("session-covers").remove([prev]);
      }
      toast.success("Capa atualizada");
      onChange();
    } catch (e: any) {
      toast.error("Erro ao enviar capa: " + (e.message || "tente novamente"));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (!coverUrl) return;
    if (!confirm("Remover a capa desta sessão?")) return;
    setUploading(true);
    try {
      const prev = extractPath(coverUrl);
      if (prev) await supabase.storage.from("session-covers").remove([prev]);
      const { error } = await supabase.from("sessions").update({ cover_image_url: null }).eq("id", sessionId);
      if (error) throw error;
      toast.success("Capa removida");
      onChange();
    } catch (e: any) {
      toast.error("Erro: " + (e.message || ""));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative w-full max-w-md aspect-[4/1] rounded-lg overflow-hidden border border-border/40 bg-muted/30">
        {coverUrl ? (
          <img src={coverUrl} alt={sessionName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground/60">
            <ImagePlus className="h-5 w-5" />
            <span className="text-[10px] uppercase tracking-wider">Sem capa</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground/80">
          Recomendado: <span className="text-foreground/80">1200×400 px</span> · 3:1 · PNG ou JPG · até 2 MB
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="text-[10px] px-3 py-1.5 border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <ImagePlus className="h-3 w-3" />
            {coverUrl ? "Trocar" : "Enviar capa"}
          </button>
          {coverUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              className="text-[10px] px-2 py-1.5 border border-border rounded-lg text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
              title="Remover capa"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
