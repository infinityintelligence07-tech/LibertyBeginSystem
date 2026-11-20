import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Palette, Radar as RadarIcon, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { SectionCard, SectionHeader, StatusPill } from "@/components/ds";
import { APP_ORIGIN_DEFAULT } from "@/lib/meetingWhatsApp";
import { BRAND_BOOK_SLUG, DIAGNOSTIC_SLUG, normalizeBrandBook } from "@/lib/brandBook";

type Props = {
  libertyId: string;
  bookingId: string;
  toolsBasePath: string;
};

type AppRow = {
  id: string;
  status: string;
  phase: string;
  answers: unknown;
  updated_at: string;
  tool_templates: { slug: string; name: string } | null;
};

const toolUrl = (a: AppRow) =>
  a.tool_templates?.slug === BRAND_BOOK_SLUG ? `${APP_ORIGIN_DEFAULT}/ferramentas/brand-book/${a.id}` : `${APP_ORIGIN_DEFAULT}/ferramentas`;

const toolTitle = (a: AppRow) => {
  if (a.tool_templates?.slug === BRAND_BOOK_SLUG) {
    const nome = normalizeBrandBook(a.answers).nome;
    return nome ? `Brand Book · ${nome}` : "Brand Book";
  }
  return a.tool_templates?.name || "Ferramenta";
};

/** Anexa ao relatório uma ferramenta feita dentro da plataforma (Brand Book, Mapeamento), sem precisar de link ou arquivo. */
export const PlatformToolAttach = ({ libertyId, bookingId, toolsBasePath }: Props) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["platform-tools-for-report", libertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tool_applications")
        .select("id, status, phase, answers, updated_at, tool_templates(slug, name)")
        .eq("member_id", libertyId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AppRow[];
    },
  });

  const { data: attachedUrls = [] } = useQuery({
    queryKey: ["student-tools", libertyId, "platform-urls", bookingId],
    queryFn: async () => {
      const { data } = await supabase.from("student_tools").select("external_url").eq("booking_id", bookingId);
      return (data || []).map((r) => r.external_url).filter(Boolean) as string[];
    },
  });

  const attach = async (a: AppRow) => {
    setBusyId(a.id);
    try {
      const isBrand = a.tool_templates?.slug === BRAND_BOOK_SLUG;
      if (isBrand && a.status !== "completed") {
        const { error } = await supabase.rpc("complete_brand_book", { _application_id: a.id });
        if (error) throw error;
      }
      const { error } = await supabase.from("student_tools").insert({
        liberty_id: libertyId,
        booking_id: bookingId,
        uploaded_by: profile?.id ?? null,
        title: toolTitle(a),
        description: isBrand ? "Quadro de branding construído na sessão" : a.phase === "final" ? "Diagnóstico final" : "Diagnóstico inicial",
        file_name: null,
        file_path: null,
        file_type: "link",
        file_size: null,
        external_url: toolUrl(a),
      } as never);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["student-tools", libertyId] });
      await queryClient.invalidateQueries({ queryKey: ["platform-tools-for-report", libertyId] });
      toast.success(isBrand ? "Brand Book anexado e enviado ao aluno" : "Ferramenta anexada à sessão");
    } catch (e) {
      toast.error("Não foi possível anexar", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusyId(null);
    }
  };

  const visible = apps.filter((a) => a.tool_templates?.slug === BRAND_BOOK_SLUG || a.tool_templates?.slug === DIAGNOSTIC_SLUG);

  return (
    <SectionCard className="space-y-3">
      <SectionHeader
        as="h3"
        title={
          <span className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" aria-hidden />
            Ferramentas da plataforma
          </span>
        }
        description={
          isLoading
            ? "Procurando as ferramentas do aluno"
            : visible.length
              ? "Selecione a ferramenta feita na sessão para anexar a este relatório. O aluno abre direto na área dele."
              : "Este aluno ainda não tem ferramentas feitas na plataforma."
        }
      />
      {visible.length > 0 ? (
        <ul className="divide-y divide-border rounded-ds-lg border border-border">
          {visible.map((a) => {
            const isBrand = a.tool_templates?.slug === BRAND_BOOK_SLUG;
            const Icon = isBrand ? Palette : RadarIcon;
            const attached = attachedUrls.includes(toolUrl(a));
            const diagPending = !isBrand && a.status !== "completed";
            return (
              <li key={a.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{toolTitle(a)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(a.updated_at).toLocaleDateString("pt-BR")}
                      {!isBrand && ` · ${a.phase === "final" ? "Diagnóstico final" : "Diagnóstico inicial"}`}
                    </p>
                  </div>
                  {a.status === "completed" ? (
                    <StatusPill tone="success" size="sm">Enviado ao aluno</StatusPill>
                  ) : (
                    <StatusPill tone="neutral" size="sm">Em preenchimento</StatusPill>
                  )}
                </div>
                {attached ? (
                  <Button variant="outline" className="min-h-11" disabled>
                    <Check className="h-4 w-4" /> Anexada
                  </Button>
                ) : diagPending ? (
                  <Button variant="outline" className="min-h-11" onClick={() => navigate(`${toolsBasePath}/${a.id}`)}>
                    Concluir mapeamento
                  </Button>
                ) : (
                  <Button className="min-h-11" onClick={() => attach(a)} disabled={busyId !== null}>
                    {busyId === a.id && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isBrand && a.status !== "completed" ? "Anexar e enviar ao aluno" : "Anexar nesta sessão"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : !isLoading ? (
        <Button variant="outline" className="min-h-11" onClick={() => navigate(toolsBasePath)}>
          Abrir Ferramentas
        </Button>
      ) : null}
    </SectionCard>
  );
};
