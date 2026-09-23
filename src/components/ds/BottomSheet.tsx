import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { IconButton } from "@/components/ds/IconButton";

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Rodapé fixo com botões. */
  footer?: ReactNode;
  /** Largura no desktop. */
  size?: "sm" | "md" | "lg";
  /** Bloqueia fechar clicando fora / Esc (enquanto salva). */
  locked?: boolean;
  className?: string;
}

const widths = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl" };

/**
 * Única camada sobreposta permitida: Drawer (de baixo) no mobile, Dialog centrado no desktop.
 * Sempre com título (acessibilidade), botão fechar 36×36 no canto e foco preso.
 */
export const BottomSheet = ({ open, onOpenChange, title, description, children, footer, size = "md", locked, className }: BottomSheetProps) => {
  const isMobile = useIsMobile();
  const handleChange = (next: boolean) => {
    if (locked && !next) return;
    onOpenChange(next);
  };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleChange} dismissible={!locked}>
        <DrawerContent className={cn("max-h-[92vh]", className)}>
          <DrawerHeader className="text-left pb-2">
            <DrawerTitle className="text-[17px] font-semibold tracking-[var(--ds-tracking-title-sm)]">{title}</DrawerTitle>
            {description ? <DrawerDescription className="text-sm">{description}</DrawerDescription> : <DrawerDescription className="sr-only">{title}</DrawerDescription>}
          </DrawerHeader>
          <div className="px-4 pb-4 overflow-y-auto flex-1">{children}</div>
          {footer && <div className="px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 border-t border-border flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">{footer}</div>}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleChange}>
      <DialogContent
        className={cn("p-0 gap-0 overflow-hidden max-h-[88vh] flex flex-col [&>button]:hidden", widths[size], className)}
        onEscapeKeyDown={(e) => locked && e.preventDefault()}
        onPointerDownOutside={(e) => locked && e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-5 pb-3 text-left flex-row items-start justify-between space-y-0 gap-4">
          <div className="min-w-0">
            <DialogTitle className="text-[17px] font-semibold tracking-[var(--ds-tracking-title-sm)]">{title}</DialogTitle>
            {description ? <DialogDescription className="text-sm mt-1">{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
          </div>
          <IconButton aria-label="Fechar" size="sm" onClick={() => handleChange(false)} disabled={locked} className="-mr-2 -mt-1 rounded-[9px] h-9 w-9">
            <X className="h-4 w-4" />
          </IconButton>
        </DialogHeader>
        <div className="px-6 pb-5 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-border flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
};

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Ação destrutiva pinta o botão de vermelho. */
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}

/** Confirmação centrada (substitui `window.confirm`). */
export const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive,
  loading,
  onConfirm,
}: ConfirmDialogProps) => (
  <AlertDialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
    <AlertDialogContent className="max-w-sm">
      <AlertDialogHeader>
        <AlertDialogTitle className="text-[17px]">{title}</AlertDialogTitle>
        {description && <AlertDialogDescription className="text-sm leading-relaxed">{description}</AlertDialogDescription>}
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
        <AlertDialogAction
          disabled={loading}
          onClick={(e) => {
            e.preventDefault();
            void onConfirm();
          }}
          className={cn(destructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
        >
          {loading ? "Aguarde..." : confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
