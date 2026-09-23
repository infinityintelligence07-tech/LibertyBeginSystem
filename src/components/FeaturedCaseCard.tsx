import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp } from "lucide-react";
import { shortName } from "@/lib/formatName";
import { SectionCard, StatusPill } from "@/components/ds";

export const FeaturedCaseCard = () => {
  const { data: featured } = useQuery({
    queryKey: ["featured-case-today"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("featured_case_of_day")
        .select("*")
        .eq("case_date", today)
        .maybeSingle();
      if (!data) return null;
      const { data: member } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, company_name")
        .eq("id", data.member_id)
        .maybeSingle();
      return { ...data, member } as any;
    },
    staleTime: 1000 * 60 * 15,
  });

  if (!featured) return null;

  const member = (featured as any).member;

  return (
    <SectionCard tone="brand">
      <p className="ds-kicker flex items-center gap-1.5 mb-2">
        <TrendingUp className="h-3.5 w-3.5 text-primary" aria-hidden /> Estudo de caso do dia
      </p>
      <h3 className="text-[17px] font-semibold text-foreground leading-snug tracking-[var(--ds-tracking-title-sm)]">{featured.headline}</h3>
      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{featured.summary}</p>

      <div className="mt-4 flex items-center justify-between gap-3 pt-4 border-t border-border">
        <div className="flex items-center gap-2 min-w-0">
          {member?.avatar_url ? (
            <img src={member.avatar_url} className="w-8 h-8 rounded-full object-cover" alt="" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold text-muted-foreground">
              {(member?.full_name || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{shortName(member?.full_name || "Membro")}</p>
            {member?.company_name && <p className="text-[11px] text-muted-foreground truncate">{member.company_name}</p>}
          </div>
        </div>
        {featured.metric_value && (
          <StatusPill tone="success" size="md" withDot={false} className="tabular-nums">
            <TrendingUp className="h-3 w-3" aria-hidden />
            {featured.metric_value}
          </StatusPill>
        )}
      </div>
      {featured.metric_label && (
        <p className="text-[11px] text-muted-foreground mt-1 text-right">{featured.metric_label}</p>
      )}
    </SectionCard>
  );
};
