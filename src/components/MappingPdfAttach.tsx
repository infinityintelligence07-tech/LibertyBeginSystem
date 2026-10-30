import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { SectionCard, SectionHeader } from "@/components/ds";
import type { Answers } from "@/lib/diagnosticoBegin";
import { diagnosticPdfFileName, downloadBlob, generateDiagnosticPdf } from "@/lib/diagnosticPdf";

type Props = {
  libertyId: string;
  bookingId: string;
  memberName: string;
  companyName?: string | null;
  mentorName?: string | null;
  sessionDate?: string | null;
  toolsBasePath: string;
};

export const MappingPdfAttach = ({
  libertyId,
  bookingId,
  memberName,
  companyName,
  mentorName,
  sessionDate,
  toolsBasePath,
}: Props) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [busy, setBusy] = useState<"attach" | "download" | null>(null);

  const { data: application, isLoading } = useQuery({
    queryKey: ["mapping-application", libertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tool_applications")
        .select("id, answers, phase, status, completed_at, updated_at")
        .eq("member_id", libertyId)
        .order("updated_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      const list = data || [];
      return list.find((a) => a.status === "completed") ?? list[0] ?? null;
    },
  });

  const answers = (application?.answers as Answers | null) || {};
  const hasAnswers = Object.values(answers).some((v) => String(v ?? "").trim());
  const phaseLabel = application?.phase === "final" ? "Diagnóstico final" : "Diagnóstico inicial";

  const buildPdf = () =>
    generateDiagnosticPdf({
      memberName,
      companyName,
      mentorName,
      date: application?.completed_at || sessionDate,
      phaseLabel,
      answers,
    });

  const download = async () => {
    setBusy("download");
    try {
      downloadBlob(await buildPdf(), diagnosticPdfFileName(memberName));
    } catch {
      toast.error("Não foi possível gerar o PDF");
    } finally {
      setBusy(null);
    }
  };

  const attach = async () => {
    setBusy("attach");
    try {
      const blob = await buildPdf();
      const fileName = diagnosticPdfFileName(memberName);
      const path = `${libertyId}/${crypto.randomUUID()}-${fileName}`;
      const { error: upErr } = await supabase.storage
        .from("student-tools")
        .upload(path, blob, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("student_tools").insert({
        liberty_id: libertyId,
        booking_id: bookingId,
        uploaded_by: profile?.id ?? null,
        title: "Mapeamento do Negócio",
        description: phaseLabel,
        file_name: fileName,
        file_path: path,
        file_type: "pdf",
        file_size: blob.size,
        external_url: null,
      } as never);
      if (insErr) throw insErr;
      await queryClient.invalidateQueries({ queryKey: ["student-tools", libertyId] });
      toast.success("PDF do Mapeamento anexado à sessão");
    } catch {
      toast.error("Não foi possível anexar o PDF. Tente novamente.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <SectionCard className="space-y-3">
      <SectionHeader
        as="h3"
        title={
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
            PDF do Mapeamento
          </span>
        }
        description={
          isLoading
            ? "Procurando o mapeamento do aluno"
            : hasAnswers
              ? "Gere o PDF com o resultado do mapeamento e anexe nesta sessão."
              : "Ainda não há mapeamento preenchido para este aluno. Faça o mapeamento em Ferramentas e volte aqui."
        }
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        {hasAnswers ? (
          <>
            <Button className="min-h-11" onClick={attach} disabled={busy !== null}>
              {busy === "attach" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Anexar PDF nesta sessão
            </Button>
            <Button variant="outline" className="min-h-11" onClick={download} disabled={busy !== null}>
              {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Baixar PDF
            </Button>
          </>
        ) : !isLoading ? (
          <Button variant="outline" className="min-h-11" onClick={() => navigate(toolsBasePath)}>
            Abrir Ferramentas
          </Button>
        ) : null}
      </div>
    </SectionCard>
  );
};
