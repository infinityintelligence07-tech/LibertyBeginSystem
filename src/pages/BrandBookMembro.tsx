import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FileQuestion } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState, PageContainer } from "@/components/ds";
import { BrandBookWorkspace } from "@/components/brandbook/BrandBookWorkspace";
import { brandBookShareUrl, normalizeBrandBook } from "@/lib/brandBook";

/** Brand Book do aluno: leitura completa, cópia por campo, prompt para IA e link para compartilhar. */
const BrandBookMembroPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: application, isLoading } = useQuery({
    queryKey: ["brand-book-member", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tool_applications")
        .select("id, answers, status, share_token, completed_at")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <AppLayout role="liberty">
        <PageContainer variant="narrow">
          <LoadingState variant="page" />
        </PageContainer>
      </AppLayout>
    );
  }

  if (!application) {
    return (
      <AppLayout role="liberty">
        <PageContainer variant="narrow">
          <EmptyState
            icon={FileQuestion}
            title="Brand Book não encontrado"
            description="Ele aparece aqui quando o mentor conclui a sessão de branding."
            action={<Button variant="outline" onClick={() => navigate("/ferramentas")}>Voltar para ferramentas</Button>}
          />
        </PageContainer>
      </AppLayout>
    );
  }

  return (
    <BrandBookWorkspace
      mode="member"
      data={normalizeBrandBook(application.answers)}
      subtitle="Seu quadro de marca"
      onExit={() => navigate("/ferramentas")}
      shareUrl={brandBookShareUrl(application.share_token)}
    />
  );
};

export default BrandBookMembroPage;
