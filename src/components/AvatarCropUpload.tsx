import { useCallback, useRef, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Trash2, ZoomIn, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { UserAvatar } from "@/components/UserAvatar";

interface Props {
  profileId: string;
  fullName: string;
  avatarUrl: string | null;
  size?: number;
}

async function getCroppedBlob(imageSrc: string, area: Area, rotation = 0): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = imageSrc;
  });
  const out = 512;
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d")!;
  if (rotation) {
    ctx.translate(out / 2, out / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-out / 2, -out / 2);
  }
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, out, out);
  return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.9));
}

export const AvatarCropUpload = ({ profileId, fullName, avatarUrl, size = 96 }: Props) => {
  const { refreshProfile, user } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [areaPx, setAreaPx] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const onSelect = (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Selecione uma imagem");
    if (file.size > 10 * 1024 * 1024) return toast.error("Máximo 10MB");
    const reader = new FileReader();
    reader.onload = () => {
      setSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
    };
    reader.readAsDataURL(file);
  };

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => setAreaPx(areaPixels), []);

  const handleSave = async () => {
    if (!src || !areaPx) return;
    setSaving(true);
    try {
      const blob = await getCroppedBlob(src, areaPx, rotation);
      const path = `${user?.id ?? profileId}/avatar-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, {
        upsert: true, cacheControl: "3600", contentType: "image/jpeg",
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: updErr } = await supabase.from("profiles").update({ avatar_url: pub.publicUrl }).eq("id", profileId);
      if (updErr) throw updErr;
      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
      queryClient.invalidateQueries({ queryKey: ["admin-mentors"] });
      toast.success("Foto atualizada");
      setSrc(null);
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm("Remover foto de perfil?")) return;
    setRemoving(true);
    try {
      const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", profileId);
      if (error) throw error;
      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ["admin-members"] });
      queryClient.invalidateQueries({ queryKey: ["admin-mentors"] });
      toast.success("Foto removida");
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="relative group rounded-full overflow-hidden shrink-0"
          style={{ width: size, height: size }}
          aria-label="Trocar foto de perfil"
        >
          <UserAvatar name={fullName} avatarUrl={avatarUrl} size={size} />
          <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Camera className="h-5 w-5 text-foreground" />
          </div>
        </button>
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-foreground flex items-center gap-1.5"
          >
            <Camera className="h-3.5 w-3.5" />
            {avatarUrl ? "Trocar foto" : "Adicionar foto"}
          </button>
          {avatarUrl && (
            <button
              type="button"
              disabled={removing}
              onClick={handleRemove}
              className="text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:text-destructive flex items-center gap-1.5 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remover
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onSelect(f);
            e.target.value = "";
          }}
        />
      </div>

      <Dialog open={!!src} onOpenChange={(o) => !o && !saving && setSrc(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar foto de perfil</DialogTitle>
          </DialogHeader>
          {src && (
            <div className="space-y-4">
              <div className="relative w-full h-72 bg-black rounded-lg overflow-hidden">
                <Cropper
                  image={src}
                  crop={crop}
                  zoom={zoom}
                  rotation={rotation}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Slider value={[zoom]} min={1} max={4} step={0.05} onValueChange={(v) => setZoom(v[0])} />
                </div>
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-foreground flex items-center gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Girar 90°
                </button>
              </div>
            </div>
          )}
          <DialogFooter>
            <button
              type="button"
              disabled={saving}
              onClick={() => setSrc(null)}
              className="text-sm px-4 py-2 rounded-lg border border-border hover:bg-muted text-foreground"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="btn-silver text-sm flex items-center gap-2 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
