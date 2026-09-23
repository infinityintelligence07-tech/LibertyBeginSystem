import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileQuestion } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState, PageContainer } from "@/components/ds";
import { ToolWizard } from "@/components/tools/ToolWizard";
import { shortName } from "@/lib/formatName";
import { computeScores, type Answers } from "@/lib/diagnosticoBegin";

const FerramentaAplicacaoPage = ({ role = "mentor" }: { role?: "mentor" | "admin" }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Answers>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const loaded = useRef(false);
  const answersRef = useRef<Answers>({});
  answersRef.current = answers;

  const { data: application, isLoading } = useQuery({
    queryKey: ["tool-application", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tool_applications")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: member } = useQuery({
    queryKey: ["tool-application-member", application?.member_id],
    enabled: !!application?.member_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, company_name")
        .eq("id", application!.member_id)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (application && !loaded.current) {
      setAnswers((application.answers as Answers) || {});
      loaded.current = true;
    }
  }, [application]);

  const persist = async (opts?: { complete?: boolean; silent?: boolean }) => {
    if (!id) return;
    setSaving(true);
    const current = answersRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
      answers: current,
      scores: computeScores(current),
    };
    if (opts?.complete) {
      payload.status = "completed";
      payload.completed_at = new Date().toISOString();
    }
    const { error } = await supabase.from("tool_applications").update(payload).eq("id", id);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar. Tente novamente.");
      return;
    }
    setDirty(false);
    qc.invalidateQueries({ queryKey: ["tool-application", id] });
    qc.invalidateQueries({ queryKey: ["tool-applications"] });
    if (!opts?.silent) {
      toast.success(opts?.complete ? "Diagnóstico concluído e liberado para o aluno." : "Progresso salvo.");
    }
  };

  // Autosave suave a cada 8s quando há mudanças
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => persist({ silent: true }), 8000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, answers]);

  const backPath = role === "admin" ? "/admin/ferramentas" : "/mentor/ferramentas";

  if (isLoading) {
    return (
      <AppLayout role={role}>
        <PageContainer variant="narrow">
          <LoadingState variant="page" />
        </PageContainer>
      </AppLayout>
    );
  }

  if (!application) {
    return (
      <AppLayout role={role}>
        <PageContainer variant="narrow">
          <EmptyState
            icon={FileQuestion}
            title="Aplicação não encontrada"
            description="O diagnóstico pode ter sido removido ou o link está incorreto."
            action={
              <Button variant="outline" onClick={() => navigate(backPath)}>Voltar para ferramentas</Button>
            }
          />
        </PageContainer>
      </AppLayout>
    );
  }

  const isFinal = application.phase === "final";

  return (
    <ToolWizard
      title={`Mapeamento do Negócio · ${shortName(member?.full_name || "Aluno")}`}
      subtitle={`${member?.company_name || "Mapeamento do negócio"} · ${isFinal ? "diagnóstico final" : "diagnóstico inicial"}`}
      resultLabel={isFinal ? "Diagnóstico final" : "Diagnóstico inicial"}
      answers={answers}
      saving={saving}
      startAtResult={application.status === "completed"}
      startAtTrail={(location.state as { start?: boolean } | null)?.start === true}
      finishLabel="Acessar diagnóstico"
      onChange={(qid, value) => {
        setAnswers((prev) => ({ ...prev, [qid]: value }));
        setDirty(true);
      }}
      onSaveStep={() => {
        if (dirty) persist({ silent: true });
      }}
      onFinish={() => persist({ complete: true, silent: true })}
      onExit={() => navigate(backPath)}
    />
  );
};

export default FerramentaAplicacaoPage;
