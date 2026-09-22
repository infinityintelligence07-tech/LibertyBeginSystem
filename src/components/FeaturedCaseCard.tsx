import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp } from "lucide-react";
import { shortName } from "@/lib/formatName";

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
    <div className="glass-card p-5 border-primary/20">
      <div className="flex items-center gap-2 text-primary text-[10px] font-semibold uppercase tracking-[0.14em] mb-3">
        <TrendingUp className="h-3.5 w-3.5" /> Estudo de caso do dia
      </div>
      <h3 className="text-lg font-semibold text-foreground leading-snug">{featured.headline}</h3>
      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{featured.summary}</p>

      <div className="mt-4 flex items-center justify-between gap-3 pt-4 border-t border-border">
        <div className="flex items-center gap-2 min-w-0">
          {member?.avatar_url ? (
            <img src={member.avatar_url} className="w-8 h-8 rounded-full object-cover" alt="" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
              {(member?.full_name || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{shortName(member?.full_name || "Membro")}</p>
            {member?.company_name && <p className="text-[10px] text-muted-foreground truncate">{member.company_name}</p>}
          </div>
        </div>
        {featured.metric_value && (
          <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full bg-status-green/10 border border-status-green/20">
            <TrendingUp className="h-3 w-3 text-status-green" />
            <span className="text-xs font-semibold text-status-green tabular-nums">{featured.metric_value}</span>
          </div>
        )}
      </div>
      {featured.metric_label && (
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1 text-right">{featured.metric_label}</p>
      )}
    </div>
  );
};
