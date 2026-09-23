import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Star, Plus, Trash2, Loader2, Lock, Globe } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, EmptyState, IconButton, SectionCard, StatusPill, TextAreaField, TextField } from "@/components/ds";

export const TestimonialsCard = () => {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [headline, setHeadline] = useState("");
  const [content, setContent] = useState("");
  const [metric, setMetric] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);

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
    setRemoveId(null);
    const { error } = await supabase.from("member_testimonials").delete().eq("id", id);
    if (error) return toast.error("Erro ao excluir");
    toast.success("Depoimento excluído");
    qc.invalidateQueries({ queryKey: ["my-testimonials"] });
    qc.invalidateQueries({ queryKey: ["ranking-members"] });
  };

  return (
    <SectionCard className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="ds-kicker flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Meus depoimentos
          </p>
          <h3 className="text-[17px] font-semibold text-foreground mt-1 tracking-[var(--ds-tracking-title-sm)]">Registre seus resultados</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cada depoimento vale <strong className="text-foreground font-semibold">+20 pts</strong> no ranking. Total: <span className="tabular-nums">{totalPoints}</span> pts.
          </p>
        </div>
        {!open && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Novo depoimento
          </Button>
        )}
      </div>

      {open && (
        <div className="space-y-3 border-t border-border pt-4">
          <TextField
            label="Título"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Ex: Faturei R$ 50k em 3 meses"
            maxLength={120}
          />
          <TextAreaField
            label="Depoimento"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Conte como foi sua transformação, o que aprendeu e como aplicou..."
            rows={4}
            className="resize-none"
            maxLength={800}
          />
          <TextField
            label="Métrica"
            hint="Opcional. Ex: +180% em receita"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            placeholder="Ex: +180% em receita"
            maxLength={80}
          />
          <label className="flex items-center gap-2.5 min-h-[44px] text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="h-5 w-5 rounded-[var(--ds-radius-sm)] border-border accent-primary"
            />
            {isPublic ? <Globe className="h-4 w-4 text-muted-foreground" aria-hidden /> : <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />}
            {isPublic ? "Público (aparece no ranking)" : "Privado (apenas você e admins)"}
          </label>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving || !headline.trim() || !content.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar depoimento
            </Button>
          </div>
        </div>
      )}

      {testimonials.length === 0 && !open ? (
        <EmptyState
          compact
          icon={Star}
          title="Nenhum depoimento ainda"
          description="Registre suas conquistas para subir no ranking."
        />
      ) : (
        <div className="divide-y divide-border border-t border-border">
          {testimonials.map((t: any) => (
            <div key={t.id} className="py-3 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-foreground min-w-0">{t.headline}</p>
                <IconButton
                  aria-label={`Excluir depoimento ${t.headline}`}
                  size="sm"
                  onClick={() => setRemoveId(t.id)}
                  className="-mr-1 -mt-1 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{t.content}</p>
              {t.result_metric && <p className="text-xs text-foreground font-medium">Resultado: {t.result_metric}</p>}
              <StatusPill tone={t.is_public ? "success" : "neutral"} withDot={false}>
                {t.is_public ? "Público" : "Privado"}
              </StatusPill>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!removeId}
        onOpenChange={(o) => !o && setRemoveId(null)}
        title="Excluir este depoimento?"
        description="Os 20 pontos correspondentes serão removidos do ranking."
        confirmLabel="Excluir"
        destructive
        onConfirm={async () => {
          if (removeId) await remove(removeId);
        }}
      />
    </SectionCard>
  );
};
