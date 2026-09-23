import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Target, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DiagnosticRadar } from "@/components/tools/DiagnosticRadar";
import { DiagnosticSheet } from "@/components/tools/DiagnosticSheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadingState, SectionCard, SectionHeader } from "@/components/ds";
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
      <SectionCard>
        <LoadingState variant="cards" rows={1} />
      </SectionCard>
    );
  }

  if (!base) return null;

  const pillar = displayPillars.find((p) => p.id === selected) || null;
  const memberName = member?.full_name || undefined;
  const companyName = member?.company_name || undefined;

  return (
    <SectionCard as="section" className="space-y-4">
      <SectionHeader
        as="h3"
        title={
          <span className="inline-flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" aria-hidden /> Mapeamento do negócio
          </span>
        }
        description="Toque em uma área do radar para abrir a folha daquele setor."
        actions={
          <Button variant="outline" size="sm" onClick={() => setShowSheet(true)}>
            <FileText className="h-4 w-4" /> Folha completa
          </Button>
        }
      />

      <DiagnosticRadar
        scores={scores}
        compareScores={inicial && final ? ((final.scores as Record<string, number>) || {}) : null}
        compareLabel="Diagnóstico final"
        label="Diagnóstico inicial"
        onPillarSelect={(id) => setSelected(id)}
      />

      {/* Folha do setor em tela cheia (Dialog nativo: a folha precisa de ~97vw, acima do limite do BottomSheet) */}
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
    </SectionCard>
  );
};
