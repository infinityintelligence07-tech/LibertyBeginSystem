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
      className="relative mt-2 rounded-lg border border-amber-400/40 bg-amber-200/10 dark:bg-amber-300/5 px-3 py-2 shadow-sm"
      style={{ boxShadow: "0 2px 6px hsl(45 90% 50% / 0.08)" }}
    >
      <div className="flex items-start gap-2">
        <StickyNote className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onClick={(e) => e.stopPropagation()}
          placeholder="Observação rápida sobre este membro…"
          rows={1}
          className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/60 resize-none outline-none leading-snug font-medium font-sans"
        />
        <div className="shrink-0 w-4 h-4 flex items-center justify-center">
          {saving && <Loader2 className="h-3 w-3 animate-spin text-amber-500" />}
          {savedFlash && !saving && <Check className="h-3 w-3 text-status-green" />}
        </div>
      </div>
    </div>
  );
};
