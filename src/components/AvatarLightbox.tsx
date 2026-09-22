import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { initials } from "@/lib/formatName";
import { cn } from "@/lib/utils";

interface AvatarLightboxProps {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
  rounded?: boolean;
}

/**
 * Clickable avatar. When a photo is present, clicking opens a full-screen
 * lightbox with the enlarged image. Initials avatars are non-clickable.
 */
export const AvatarLightbox = ({
  name,
  avatarUrl,
  size = 56,
  className,
  rounded = true,
}: AvatarLightboxProps) => {
  const [open, setOpen] = useState(false);
  const dim = { width: size, height: size };
  const shape = rounded ? "rounded-full" : "rounded-lg";

  if (avatarUrl) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Ver foto ampliada"
          aria-label={`Ampliar foto de ${name}`}
          className={cn(
            "relative overflow-hidden border border-primary/20 shrink-0 bg-muted cursor-zoom-in hover:ring-2 hover:ring-primary/40 transition-all",
            shape,
            className,
          )}
          style={dim}
        >
          <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        </button>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 overflow-hidden bg-background/95 border-border gap-0 [&>button]:text-muted-foreground [&>button]:hover:text-foreground">
            <DialogTitle className="sr-only">Foto de {name}</DialogTitle>
            <div className="flex items-center justify-center p-2">
              <img
                src={avatarUrl}
                alt={name}
                className="max-w-full max-h-[85vh] object-contain rounded-lg"
              />
            </div>
            <p className="text-center text-sm text-muted-foreground pb-3 px-4">{name}</p>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div
      style={dim}
      className={cn(
        "bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary shrink-0",
        shape,
        className,
      )}
    >
      <span style={{ fontSize: Math.max(9, Math.round(size * 0.32)) }}>{initials(name)}</span>
    </div>
  );
};
