import { Link } from "react-router-dom";
import { useRankingData } from "@/hooks/useRankingData";
import { Trophy, ChevronRight } from "lucide-react";
import { shortName } from "@/lib/formatName";

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[parts.length - 1]?.[0] || "")).toUpperCase() || "?";
};

export const RankingHighlightsBlock = () => {
  const { data: members = [] } = useRankingData();
  const featured = members.filter((m) => m.is_featured).slice(0, 3);
  const top3 = featured.length >= 3 ? featured : members.slice(0, 3);

  if (top3.length === 0) return null;

  return (
    <Link
      to="/ranking"
      className="block rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card/60 to-transparent p-4 hover:border-primary/60 transition-colors"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Libertys Begin em destaque</span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex items-center gap-3">
        {top3.map((m, i) => (
          <div key={m.id} className="flex-1 min-w-0 flex items-center gap-2">
            <div className="relative shrink-0">
              {m.photo_url ? (
                <img src={m.photo_url} alt={m.full_name} className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                  {initials(m.full_name)}
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center border border-card">
                {i + 1}
              </span>
            </div>
            <div className="min-w-0 hidden sm:block">
              <p className="text-xs font-medium text-foreground truncate">{shortName(m.full_name).split(" ")[0]}</p>
              <p className="text-[10px] text-primary font-semibold tabular-nums">{m.points} pts</p>
            </div>
          </div>
        ))}
      </div>
    </Link>
  );
};
