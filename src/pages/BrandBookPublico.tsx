import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FileQuestion } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState, PageContainer } from "@/components/ds";
import { Logo } from "@/components/Logo";
import { BrandBookWorkspace } from "@/components/brandbook/BrandBookWorkspace";
import { normalizeBrandBook } from "@/lib/brandBook";

interface SharedBrandBook {
  id: string;
  answers: unknown;
  status: string;
  member_first_name: string | null;
  company_name: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Link público do Brand Book. Aluno dono (logado) e equipe vão para a versão completa;
 * qualquer outra pessoa vê só a leitura do quadro, sem plano de ação.
 */
const BrandBookPublicoPage = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, roles, rolesLoaded, loading: authLoading } = useAuth();
  const [checkingOwner, setCheckingOwner] = useState(true);

  const { data: shared, isLoading } = useQuery({
    queryKey: ["brand-book-shared", token],
    enabled: !!token && UUID_RE.test(token),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_shared_brand_book", { _token: token! });
      if (error) throw error;
      return (data as unknown as SharedBrandBook | null) ?? null;
    },
  });

  useEffect(() => {
    if (authLoading || (user && !rolesLoaded) || isLoading) return;
    if (!user || !shared) {
      setCheckingOwner(false);
      return;
    }
    if (roles.includes("admin") || roles.includes("super_admin")) {
      navigate(`/admin/ferramentas/${shared.id}`, { replace: true });
      return;
    }
    if (roles.includes("mentor")) {
      navigate(`/mentor/ferramentas/${shared.id}`, { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("tool_applications").select("id").eq("id", shared.id).maybeSingle();
      if (cancelled) return;
      if (data) navigate(`/ferramentas/brand-book/${shared.id}`, { replace: true });
      else setCheckingOwner(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, roles, rolesLoaded, isLoading, shared, navigate]);

  if (isLoading || (checkingOwner && !!shared)) {
    return (
      <PageContainer variant="narrow">
        <LoadingState variant="page" />
      </PageContainer>
    );
  }

  if (!shared) {
    return (
      <PageContainer variant="narrow">
        <div className="py-10">
          <Logo size="md" className="mx-auto mb-8" />
          <EmptyState
            icon={FileQuestion}
            title="Brand Book não encontrado"
            description="O link pode estar incompleto. Peça um novo link para quem compartilhou."
          />
        </div>
      </PageContainer>
    );
  }

  const data = normalizeBrandBook(shared.answers);
  if (!data.nome && shared.company_name) data.nome = shared.company_name;

  return (
    <BrandBookWorkspace
      mode="public"
      data={data}
      subtitle="Versão de leitura"
      ownerLabel={shared.member_first_name ? `Construído com ${shared.member_first_name} na Liberty Begin` : undefined}
      banner={
        !user ? (
          <div className="flex h-12 items-center justify-between gap-3 border-t border-border bg-muted/60 px-4 text-sm">
            <span className="truncate text-muted-foreground">É o dono desta marca? Entre para ver o quadro completo.</span>
            <Button asChild size="sm" variant="outline" className="h-9 shrink-0">
              <Link to={`/login?next=${encodeURIComponent(`/marca/${token}`)}`}>Entrar</Link>
            </Button>
          </div>
        ) : undefined
      }
    />
  );
};

export default BrandBookPublicoPage;
