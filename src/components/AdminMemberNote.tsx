import { useState, useEffect } from "react";
import { StickyNote, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  memberId: string;
  initialNote: string | null;
}

export const AdminMemberNote = ({ memberId, initialNote }: Props) => {
  const [value, setValue] = useState(initialNote || "");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    setValue(initialNote || "");
  }, [initialNote, memberId]);

  const save = async () => {
    const next = value.trim();
    if ((initialNote || "") === next) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ admin_note: next || null })
      .eq("id", memberId);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar observação");
      return;
    }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
    queryClient.invalidateQueries({ queryKey: ["admin-members"] });
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="relative rounded-ds border border-border bg-card px-3 py-2"
    >
      <div className="flex items-start gap-2">
        <StickyNote className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onClick={(e) => e.stopPropagation()}
          aria-label="Observação do administrador"
          placeholder="Observação rápida sobre este membro"
          rows={1}
          className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground resize-none outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm leading-snug font-medium"
        />
        <div className="shrink-0 w-4 h-4 flex items-center justify-center" aria-live="polite">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Salvando" />}
          {savedFlash && !saving && <Check className="h-3.5 w-3.5 text-muted-foreground" aria-label="Salvo" />}
        </div>
      </div>
    </div>
  );
};
