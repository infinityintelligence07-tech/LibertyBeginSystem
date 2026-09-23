import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ToolWizard } from "@/components/tools/ToolWizard";
import { DIAGNOSTICO_BEGIN_SLUG, type Answers } from "@/lib/diagnosticoBegin";
import { shortName } from "@/lib/formatName";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import {
  BottomSheet,
  Chip,
  EmptyState,
  IconButton,
  ListRow,
  LoadingState,
  PageContainer,
  PageHeader,
  TextField,
} from "@/components/ds";
import {
  ArrowLeft, ArrowRight, Loader2, Radar as RadarIcon, Search, Play,
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
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div
          className="max-w-2xl mx-auto px-4 sm:px-6 flex items-center gap-3"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)", paddingBottom: "0.5rem" }}
        >
          <IconButton aria-label="Voltar" onClick={() => navigate(base)}>
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">Mapeamento do Negócio</p>
          </div>
          <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 bg-primary/10">
            <RadarIcon className="h-4 w-4 text-primary" aria-hidden />
          </div>
        </div>
      </div>

      {/* Abertura */}
      <PageContainer variant="narrow" className="pt-10 sm:pt-16 pb-24">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
          <PageHeader
            size="large"
            eyebrow="Ferramenta Begin"
            title="Mapeamento do Negócio"
            description={
              template?.description ||
              "Uma conversa guiada, uma pergunta por vez, no ritmo da sessão. No final, um retrato claro do momento do negócio."
            }
          />

          <div className="flex flex-col sm:flex-row gap-3">
            <Button size="lg" className="w-full sm:w-auto" onClick={() => setPicker(true)}>
              Iniciar com um membro <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto" onClick={() => setDemo(true)}>
              <Play className="h-4 w-4" aria-hidden /> Conhecer a ferramenta (demonstração)
            </Button>
          </div>
        </motion.div>
      </PageContainer>

      {/* Seleção do aluno */}
      <BottomSheet
        open={picker}
        onOpenChange={setPicker}
        title="Vincular ao membro"
        description="Escolha a fase do diagnóstico e busque o membro."
        size="md"
      >
        <div className="space-y-4">
          <div className="flex gap-2" role="group" aria-label="Fase do diagnóstico">
            {(["inicial", "final"] as const).map((p) => (
              <Chip key={p} active={phase === p} onClick={() => setPhase(p)}>
                {p === "inicial" ? "Inicial" : "Final"}
              </Chip>
            ))}
          </div>

          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-[38px] sm:top-[34px] text-muted-foreground pointer-events-none" aria-hidden />
            <TextField
              label="Membro"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou empresa..."
              className="pl-9"
              autoComplete="off"
            />
          </div>

          {isLoading ? (
            <LoadingState variant="list" rows={3} />
          ) : !search.trim() ? (
            <EmptyState compact icon={Search} title="Digite para localizar" description="Busque pelo nome do membro ou da empresa." />
          ) : filtered.length === 0 ? (
            <EmptyState compact icon={Search} title="Nenhum resultado" description="Tente outro nome ou empresa." />
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-ds-lg border border-border" role="list">
              {filtered.map((m: any, i: number) => (
                <ListRow
                  key={m.id}
                  role="listitem"
                  onPress={() => { if (!assign.isPending) assign.mutate(m.id); }}
                  leading={<UserAvatar name={m.full_name} avatarUrl={m.avatar_url} size={36} />}
                  title={shortName(m.full_name)}
                  subtitle={m.company_name || "Sem empresa"}
                  trailing={assign.isPending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden /> : undefined}
                  chevron={!assign.isPending}
                  last={i === filtered.length - 1}
                  aria-disabled={assign.isPending}
                />
              ))}
            </div>
          )}
        </div>
      </BottomSheet>
    </div>
  );
};

export default FerramentaModeloPage;
