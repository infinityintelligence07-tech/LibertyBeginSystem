import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { initials } from "@/lib/formatName";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface AvatarUploadProps {
  profileId: string;
  fullName: string;
  avatarUrl: string | null;
  size?: number;
  onChange?: (url: string | null) => void;
}

export const AvatarUpload = ({ profileId, fullName, avatarUrl, size = 80, onChange }: AvatarUploadProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string | null>(avatarUrl);
  const queryClient = useQueryClient();

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Máximo 5MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${profileId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = pub.publicUrl;
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", profileId);
      if (updErr) throw updErr;
      setCurrentUrl(publicUrl);
      onChange?.(publicUrl);
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
      queryClient.invalidateQueries({ queryKey: ["admin-mentors"] });
      toast.success("Foto atualizada");
    } catch (e: any) {
      toast.error("Erro ao enviar: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm("Remover foto de perfil?")) return;
    setUploading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", profileId);
      if (error) throw error;
      setCurrentUrl(null);
      onChange?.(null);
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
      queryClient.invalidateQueries({ queryKey: ["admin-mentors"] });
      toast.success("Foto removida");
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div
        className="relative rounded-full overflow-hidden bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.32 }}
      >
        {currentUrl ? (
          <img src={currentUrl} alt={fullName} className="w-full h-full object-cover" />
        ) : (
          initials(fullName)
        )}
        {uploading && (
          <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-foreground flex items-center gap-1.5 disabled:opacity-50"
        >
          <Camera className="h-3.5 w-3.5" />
          {currentUrl ? "Trocar foto" : "Adicionar foto"}
        </button>
        {currentUrl && (
          <button
            type="button"
            disabled={uploading}
            onClick={handleRemove}
            className="text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:text-destructive flex items-center gap-1.5 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remover
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
};
