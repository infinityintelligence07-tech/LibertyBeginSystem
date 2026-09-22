import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ToolWizard } from "@/components/tools/ToolWizard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DIAGNOSTICO_BEGIN_SLUG, type Answers } from "@/lib/diagnosticoBegin";
import { shortName, initials } from "@/lib/formatName";
import {
  ArrowLeft, ArrowRight, Check, Loader2, Radar as RadarIcon, Search,
} from "lucide-react";


const norm = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Abertura da ferramenta em tela cheia. O primeiro passo é atribuir a
 * ferramenta a um aluno: ao selecionar, a aplicação é criada e vinculada
 * ao membro. Também é possível apenas explorar em modo demonstração.
 */
const FerramentaModeloPage = ({ role = "mentor" }: { role?: "mentor" | "admin" }) => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const base = role === "admin" ? "/admin/ferramentas" : "/mentor/ferramentas";
  const [answers, setAnswers] = useState<Answers>({});
  const [demo, setDemo] = useState(false);
  const [search, setSearch] = useState("");
  const [phase, setPhase] = useState<"inicial" | "final">("inicial");
  const [picker, setPicker] = useState(false);

  const { data: template } = useQuery({
    queryKey: ["tool-template", DIAGNOSTICO_BEGIN_SLUG],
    queryFn: async () => {
      const { data } = await supabase
        .from("tool_templates")
        .select("id, name, description")
        .eq("slug", DIAGNOSTICO_BEGIN_SLUG)
        .maybeSingle();
      return data;
    },
  });

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["tools-members"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("list_tool_members");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const filtered = useMemo(() => {
    const q = norm(search);
    if (!q) return [];
    return members
      .filter(
        (m: any) => norm(m.full_name || "").includes(q) || norm(m.company_name || "").includes(q),
      )
      .slice(0, 12);
  }, [members, search]);



  const assign = useMutation({
    mutationFn: async (memberId: string) => {
      if (!template?.id) throw new Error("Ferramenta indisponível no momento.");
      const { data, error } = await supabase
        .from("tool_applications")
        .insert({
          template_id: template.id,
          member_id: memberId,
          applied_by: profile?.id ?? null,
          phase,
          status: "in_progress",
          answers: {},
          scores: {},
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["tool-applications"] });
      navigate(`${base}/${data.id}`, { state: { start: true } });
    },
    onError: (e: any) => toast.error(e.message || "Não foi possível atribuir a ferramenta."),
  });

  if (demo) {
    return (
      <ToolWizard
        demo
        title="Mapeamento do Negócio"
        subtitle="Modo demonstração · nada é salvo"
        resultLabel="Demonstração"
        answers={answers}
        onChange={(qid, value) => setAnswers((prev) => ({ ...prev, [qid]: value }))}
        onExit={() => navigate(base)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-background/85 border-b border-border">
        <div
          className="max-w-5xl mx-auto px-4 flex items-center gap-3"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)", paddingBottom: "0.75rem" }}
        >
          <button
            onClick={() => navigate(base)}
            className="h-9 px-3 rounded-xl border border-border flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">Mapeamento do Negócio</p>
          </div>
          <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 bg-primary/10">
            <RadarIcon className="h-4 w-4 text-primary" />
          </div>
        </div>
      </div>

      {/* Hero estilo landing page */}
      <div className="relative overflow-hidden">
        <div className="absolute -top-40 -right-24 h-[26rem] w-[26rem] rounded-full blur-3xl bg-primary/20" />
        <div className="absolute -bottom-40 -left-24 h-80 w-80 rounded-full blur-3xl bg-primary/10" />
        <div className="relative max-w-5xl mx-auto px-4 pt-14 pb-10 sm:pt-24 sm:pb-16 text-center">
          <motion.span
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.28em] font-semibold px-3 py-1.5 rounded-full bg-primary/10 text-primary"
          >
            Ferramenta Begin
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="text-4xl sm:text-6xl font-semibold text-foreground mt-5 leading-[1.02] tracking-tight"
          >
            Mapeamento do Negócio
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-base sm:text-lg text-muted-foreground mt-5 leading-relaxed max-w-2xl mx-auto"
          >
            {template?.description ||
              "Uma conversa guiada, uma pergunta por vez, no ritmo da sessão. No final, um retrato claro do momento do negócio."}
          </motion.p>
          <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            onClick={() => setPicker(true)}
            className="mt-9 inline-flex items-center gap-2 px-10 py-4 rounded-full bg-primary text-primary-foreground text-base font-semibold shadow-xl hover:opacity-90 transition-opacity"
          >
            Iniciar <ArrowRight className="h-5 w-5" />
          </motion.button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pb-24">
        <button
          onClick={() => setDemo(true)}
          className="w-full text-sm py-3 rounded-xl border border-border text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
        >
          <Check className="h-4 w-4" /> Conhecer a ferramenta (demonstração)
        </button>
      </div>


      {/* Seleção do aluno */}
      <Dialog open={picker} onOpenChange={setPicker}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Vincular ao membro</DialogTitle>
          </DialogHeader>

          <div className="flex gap-2">
            {(["inicial", "final"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPhase(p)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  phase === p
                    ? "border-primary text-primary bg-primary/10"
                    : "border-border text-muted-foreground"
                }`}
              >
                {p === "inicial" ? "Inicial" : "Final"}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou empresa..."
              className="w-full h-10 pl-9 pr-3 rounded-xl bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !search.trim() ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Digite para localizar.
            </p>
          ) : (
            <div className="grid gap-2 max-h-72 overflow-y-auto">
              {filtered.map((m: any) => (
                <button
                  key={m.id}
                  disabled={assign.isPending}
                  onClick={() => assign.mutate(m.id)}
                  className="glass-card p-3 flex items-center gap-3 text-left disabled:opacity-60"
                >
                  <span className="h-9 w-9 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0 overflow-hidden">
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt={m.full_name} className="h-full w-full object-cover" />
                    ) : (
                      initials(m.full_name)
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground truncate">
                      {shortName(m.full_name)}
                    </span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {m.company_name || "Sem empresa"}
                    </span>
                  </span>
                  {assign.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhum resultado.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FerramentaModeloPage;
