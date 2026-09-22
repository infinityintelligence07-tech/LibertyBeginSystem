import { AppLayout } from "@/components/AppLayout";
import { useRankingData, DEMO_TESTIMONIALS } from "@/hooks/useRankingData";
import { useDemoData } from "@/contexts/DemoDataContext";
import { useAuth } from "@/hooks/useAuth";
import { useViewAs } from "@/contexts/ViewAsContext";
import { Trophy, Medal, Star } from "lucide-react";
import { shortName } from "@/lib/formatName";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[parts.length - 1]?.[0] || "")).toUpperCase() || "?";
};

const RankingPage = () => {
  const { profile, roles } = useAuth();
  const { viewAs, canSwitch } = useViewAs();
  const actualRole = roles.includes("admin") || roles.includes("super_admin") ? "admin" : roles.includes("mentor") ? "mentor" : "liberty";
  const role = canSwitch ? (viewAs ?? actualRole) : actualRole;
  const { data: members = [], isLoading } = useRankingData();
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
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Trophy className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Ranking Liberty</h1>
            <p className="text-sm text-muted-foreground">Destaques da comunidade e top resultados do mês.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Featured (up to 3) */}
            {featured.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-primary text-[10px] font-semibold uppercase tracking-wider">
                  <Star className="h-3.5 w-3.5" /> Destaques
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {featured.map((m, idx) => (
                    <div
                      key={m.id}
                      className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/10 to-transparent p-5 flex items-center gap-4"
                    >
                      <div className="relative">
                        {m.photo_url ? (
                          <img src={m.photo_url} alt={m.full_name} className="h-16 w-16 rounded-full object-cover" />
                        ) : (
                          <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center text-lg font-bold text-primary">
                            {initials(m.full_name)}
                          </div>
                        )}
                        <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold border-2 border-card">
                          {idx + 1}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{shortName(m.full_name)}</p>
                        {m.company_name && <p className="text-xs text-muted-foreground truncate">{m.company_name}</p>}
                        <p className="text-xs text-primary font-semibold mt-1 tabular-nums">{m.points} pts</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Top list */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">
                <Medal className="h-3.5 w-3.5" /> Top resultados
              </div>
              <div className="rounded-2xl border border-border bg-card/70 divide-y divide-border">
                {rest.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">Ainda sem resultados registrados.</p>
                ) : (
                  rest.map((m, i) => {
                    const rank = i + 1;
                    return (
                      <div key={m.id} className="flex items-center gap-3 p-3">
                        <span className="w-6 text-center text-sm font-bold tabular-nums text-muted-foreground">{rank}</span>
                        {m.photo_url ? (
                          <img src={m.photo_url} alt={m.full_name} className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                            {initials(m.full_name)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{shortName(m.full_name)}</p>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {m.role_label && (
                              <span className="text-[9px] uppercase tracking-wider font-semibold text-primary/80 bg-primary/10 rounded px-1.5 py-0.5">
                                {m.role_label}
                              </span>
                            )}
                            {m.company_name && <p className="text-xs text-muted-foreground truncate">{m.company_name}</p>}
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-primary tabular-nums">{m.points ?? 0}<span className="text-[10px] text-muted-foreground ml-1">pts</span></span>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* Recent testimonials */}
            {myTestimonials.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">
                  <Star className="h-3.5 w-3.5" /> Depoimentos recentes
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {myTestimonials.map((t: any) => {
                    const m = members.find((mm) => mm.id === t.member_id);
                    return (
                      <div key={t.id} className="rounded-2xl border border-border bg-card/70 p-4 space-y-2">
                        <p className="text-sm font-semibold text-foreground">{t.headline}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{t.content}</p>
                        {t.result_metric && (
                          <p className="text-xs text-primary font-semibold">Resultado: {t.result_metric}</p>
                        )}
                        {m && (
                          <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">{shortName(m.full_name)}{m.company_name ? ` · ${m.company_name}` : ""}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default RankingPage;
