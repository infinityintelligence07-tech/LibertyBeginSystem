import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Star, Plus, Trash2, Loader2, Lock, Globe } from "lucide-react";
import { toast } from "sonner";

export const TestimonialsCard = () => {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [headline, setHeadline] = useState("");
  const [content, setContent] = useState("");
  const [metric, setMetric] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: testimonials = [] } = useQuery({
    queryKey: ["my-testimonials", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("member_testimonials")
        .select("*")
        .eq("member_id", profile!.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const totalPoints = testimonials.length * 20;

  const save = async () => {
    if (!headline.trim() || !content.trim() || !profile?.id) return;
    setSaving(true);
    const { error } = await supabase.from("member_testimonials").insert({
      member_id: profile.id,
      headline: headline.trim(),
      content: content.trim(),
      result_metric: metric.trim() || null,
      is_public: isPublic,
    });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar depoimento");
      return;
    }
    toast.success("Depoimento salvo! +20 pontos");
    setHeadline(""); setContent(""); setMetric(""); setIsPublic(true); setOpen(false);
    qc.invalidateQueries({ queryKey: ["my-testimonials"] });
    qc.invalidateQueries({ queryKey: ["ranking-members"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este depoimento?")) return;
    const { error } = await supabase.from("member_testimonials").delete().eq("id", id);
    if (error) return toast.error("Erro ao excluir");
    toast.success("Depoimento excluído");
    qc.invalidateQueries({ queryKey: ["my-testimonials"] });
    qc.invalidateQueries({ queryKey: ["ranking-members"] });
  };

  return (
    <div className="rounded-2xl border border-border bg-card/70 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-primary text-[10px] font-semibold uppercase tracking-wider">
            <Star className="h-3.5 w-3.5" /> Meus depoimentos
          </div>
          <h3 className="text-base font-semibold text-foreground mt-1">Conte seus resultados</h3>
          <p className="text-xs text-muted-foreground">Cada depoimento vale <strong className="text-primary">+20 pts</strong> no ranking. Total: {totalPoints} pts.</p>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} className="btn-silver text-xs flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Novo
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-2.5 rounded-xl border border-border bg-background/50 p-3">
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Título (ex: Faturei R$ 50k em 3 meses)"
            className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-card"
            maxLength={120}
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Conte como foi sua transformação, o que aprendeu e como aplicou..."
            rows={4}
            className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-card resize-none"
            maxLength={800}
          />
          <input
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            placeholder="Métrica (opcional, ex: +180% em receita)"
            className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-card"
            maxLength={80}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            {isPublic ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {isPublic ? "Público (aparece no ranking)" : "Privado (apenas você e admins)"}
          </label>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setOpen(false)} className="text-xs px-3 py-1.5 rounded-lg border border-border">Cancelar</button>
            <button onClick={save} disabled={saving || !headline.trim() || !content.trim()} className="btn-silver text-xs flex items-center gap-1.5 disabled:opacity-50">
              {saving && <Loader2 className="h-3 w-3 animate-spin" />} Salvar
            </button>
          </div>
        </div>
      )}

      {testimonials.length === 0 && !open ? (
        <p className="text-xs text-muted-foreground italic text-center py-3">
          Nenhum depoimento ainda. Registre suas conquistas para subir no ranking!
        </p>
      ) : (
        <div className="space-y-2">
          {testimonials.map((t: any) => (
            <div key={t.id} className="rounded-lg border border-border bg-background/40 p-3 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{t.headline}</p>
                <button onClick={() => remove(t.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{t.content}</p>
              {t.result_metric && <p className="text-[11px] text-primary font-semibold">Resultado: {t.result_metric}</p>}
              <p className="text-[10px] text-muted-foreground">{t.is_public ? "Público" : "Privado"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
