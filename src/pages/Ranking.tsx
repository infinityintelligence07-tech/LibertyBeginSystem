import { AppLayout } from "@/components/AppLayout";
import { useRankingData, DEMO_TESTIMONIALS } from "@/hooks/useRankingData";
import { useDemoData } from "@/contexts/DemoDataContext";
import { useAuth } from "@/hooks/useAuth";
import { useViewAs } from "@/contexts/ViewAsContext";
import { Medal, Star } from "lucide-react";
import { shortName } from "@/lib/formatName";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { UserAvatar } from "@/components/UserAvatar";
import {
  EmptyState,
  ErrorState,
  ListRow,
  LoadingState,
  PageContainer,
  PageHeader,
  SectionCard,
  SectionHeader,
  StatusPill,
} from "@/components/ds";

const RankingPage = () => {
  const { profile, roles } = useAuth();
  const { viewAs, canSwitch } = useViewAs();
  const actualRole = roles.includes("admin") || roles.includes("super_admin") ? "admin" : roles.includes("mentor") ? "mentor" : "liberty";
  const role = canSwitch ? (viewAs ?? actualRole) : actualRole;
  const { data: members = [], isLoading, isError, refetch } = useRankingData();
  const { demoEnabled } = useDemoData();

  const { data: liveTestimonials = [] } = useQuery({
    queryKey: ["ranking-recent-testimonials"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("member_testimonials")
        .select("id, headline, content, result_metric, member_id, created_at")
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(6);
      return data || [];
    },
  });

  const myTestimonials = demoEnabled ? [...DEMO_TESTIMONIALS, ...liveTestimonials] : liveTestimonials;

  const featured = members.filter((m) => m.is_featured).slice(0, 3);
  const rest = members.filter((m) => !m.is_featured).slice(0, 20);

  return (
    <AppLayout role={role as any}>
      <PageContainer>
        <PageHeader
          eyebrow="Comunidade"
          title="Ranking Liberty"
          description="Destaques da comunidade e top resultados do mês."
        />

        {isError && <ErrorState compact onRetry={() => refetch()} />}

        {isLoading ? (
          <LoadingState variant="page" />
        ) : (
          <>
            {/* Destaques (até 3) */}
            {featured.length > 0 && (
              <section className="space-y-3">
                <SectionHeader title="Destaques" />
                <ol className="grid grid-cols-1 md:grid-cols-3 gap-3 list-none m-0 p-0">
                  {featured.map((m, idx) => (
                    <li key={m.id}>
                      <SectionCard tone="brand" padding="compact" className="flex items-center gap-4 h-full">
                        <div className="relative shrink-0">
                          <UserAvatar name={m.full_name} avatarUrl={m.photo_url ?? undefined} size={56} />
                          <span
                            className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold ring-2 ring-card"
                            aria-label={`${idx + 1}º lugar`}
                          >
                            {idx + 1}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[15px] font-semibold text-foreground truncate">{shortName(m.full_name)}</p>
                          {m.company_name && <p className="text-xs text-muted-foreground truncate">{m.company_name}</p>}
                          <p className="text-xs text-primary font-semibold mt-1 tabular-nums">{m.points} pts</p>
                        </div>
                      </SectionCard>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {/* Top resultados */}
            <section className="space-y-3">
              <SectionHeader title="Top resultados" />
              {rest.length === 0 ? (
                <EmptyState
                  icon={Medal}
                  title="Ainda sem resultados registrados"
                  description="Os resultados enviados pelos membros e validados pela equipe aparecem aqui."
                  compact
                />
              ) : (
                <SectionCard padding="none">
                  <ol className="list-none m-0 p-0">
                    {rest.map((m, i) => {
                      const rank = i + 1;
                      return (
                        <li key={m.id}>
                        <ListRow
                          last={i === rest.length - 1}
                          active={m.id === profile?.id}
                          leading={
                            <div className="flex items-center gap-2">
                              <span className="w-6 text-center text-sm font-bold tabular-nums text-muted-foreground">{rank}</span>
                              <UserAvatar name={m.full_name} avatarUrl={m.photo_url ?? undefined} size={40} />
                            </div>
                          }
                          title={shortName(m.full_name)}
                          subtitle={
                            <span className="flex items-center gap-1.5 flex-wrap">
                              {m.role_label && <StatusPill tone="brand" size="sm" withDot={false}>{m.role_label}</StatusPill>}
                              {m.company_name && <span className="truncate">{m.company_name}</span>}
                            </span>
                          }
                          trailing={
                            <span className="text-sm font-semibold text-primary tabular-nums">
                              {m.points ?? 0}<span className="text-xs text-muted-foreground ml-1">pts</span>
                            </span>
                          }
                        />
                        </li>
                      );
                    })}
                  </ol>
                </SectionCard>
              )}
            </section>

            {/* Depoimentos recentes */}
            {myTestimonials.length > 0 && (
              <section className="space-y-3">
                <SectionHeader title="Depoimentos recentes" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {myTestimonials.map((t: any) => {
                    const m = members.find((mm) => mm.id === t.member_id);
                    return (
                      <SectionCard key={t.id} as="article" padding="compact" className="space-y-2">
                        <div className="flex items-start gap-2">
                          <Star className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden />
                          <p className="text-[15px] font-semibold text-foreground">{t.headline}</p>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">{t.content}</p>
                        {t.result_metric && (
                          <p className="text-xs text-primary font-semibold">Resultado: {t.result_metric}</p>
                        )}
                        {m && (
                          <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                            {shortName(m.full_name)}{m.company_name ? ` · ${m.company_name}` : ""}
                          </p>
                        )}
                      </SectionCard>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </PageContainer>
    </AppLayout>
  );
};

export default RankingPage;
