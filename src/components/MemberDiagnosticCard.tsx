import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Target, Loader2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DiagnosticRadar } from "@/components/tools/DiagnosticRadar";
import { DiagnosticSheet } from "@/components/tools/DiagnosticSheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DIAGNOSTICO_BEGIN_PILLARS,
  diagnosticPillarsForAnswers,
  pillarScore,
  type Answers,
} from "@/lib/diagnosticoBegin";

interface Props {
  libertyId: string;
}

export const MemberDiagnosticCard = ({ libertyId }: Props) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [showSheet, setShowSheet] = useState(false);

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["member-diagnostics", libertyId],
    enabled: !!libertyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tool_applications")
        .select("*")
        .eq("member_id", libertyId)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const { data: member } = useQuery({
    queryKey: ["member-diagnostic-profile", libertyId],
    enabled: !!libertyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, company_name")
        .eq("id", libertyId)
        .maybeSingle();
      return data;
    },
  });

  const inicial = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => applications.find((a: any) => a.phase !== "final") as any,
    [applications],
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const final = useMemo(() => applications.find((a: any) => a.phase === "final") as any, [applications]);
  const base = inicial || final;

  const answers = (base?.answers as Answers) || {};
  const displayPillars = useMemo(() => diagnosticPillarsForAnswers(answers), [answers]);
  const scores = useMemo(() => {
    const stored = (base?.scores as Record<string, number>) || {};
    const out: Record<string, number> = {};
    DIAGNOSTICO_BEGIN_PILLARS.forEach((p) => {
      out[p.id] = Number(stored[p.id] ?? pillarScore(p, answers));
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card/70 p-6 flex justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!base) return null;

  const pillar = displayPillars.find((p) => p.id === selected) || null;
  const memberName = member?.full_name || undefined;
  const companyName = member?.company_name || undefined;

  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            <Target className="h-3 w-3 text-primary" /> Mapeamento do Negócio
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Toque em uma área do radar para abrir a folha daquele setor.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSheet(true)}
          className="shrink-0 flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <FileText className="h-3.5 w-3.5" />
          Folha completa
        </button>
      </div>

      <DiagnosticRadar
        scores={scores}
        compareScores={inicial && final ? ((final.scores as Record<string, number>) || {}) : null}
        compareLabel="Diagnóstico final"
        label="Diagnóstico inicial"
        onPillarSelect={(id) => setSelected(id)}
      />

      {/* Folha do setor em tela cheia */}
      <Dialog open={!!pillar} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-[97vw] w-[97vw] h-[92vh] p-3 sm:p-4 overflow-hidden flex flex-col">
          <DialogHeader className="sr-only">
            <DialogTitle>{pillar?.name}</DialogTitle>
          </DialogHeader>
          {pillar && (
            <div className="min-h-0 flex-1">
              <DiagnosticSheet
                pillar={pillar}
                answers={answers}
                score={scores[pillar.id]}
                memberName={memberName}
                companyName={companyName}
                fullHeight
              />
            </div>
          )}
        </DialogContent>
      </Dialog>


      {/* Folha completa, setor a setor */}
      <Dialog open={showSheet} onOpenChange={setShowSheet}>
        <DialogContent className="max-w-[97vw] w-[97vw] max-h-[92vh] overflow-y-auto p-3 sm:p-4">
          <DialogHeader>
            <DialogTitle className="text-base">Mapa do negócio, setor a setor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {displayPillars.map((p) => (
              <DiagnosticSheet
                key={p.id}
                pillar={p}
                answers={answers}
                score={scores[p.id]}
                memberName={memberName}
                companyName={companyName}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
