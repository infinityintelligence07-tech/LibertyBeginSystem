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
      aria-label="Ver ranking completo"
      className="glass-card is-interactive block p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" aria-hidden />
          <span className="text-sm font-semibold text-foreground">Libertys Begin em destaque</span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      <div className="flex items-center gap-3">
        {top3.map((m, i) => (
          <div key={m.id} className="flex-1 min-w-0 flex items-center gap-2">
            <div className="relative shrink-0">
              {m.photo_url ? (
                <img src={m.photo_url} alt={m.full_name} className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                  {initials(m.full_name)}
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 h-[18px] w-[18px] rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center border border-card tabular-nums">
                {i + 1}
              </span>
            </div>
            <div className="min-w-0 hidden sm:block">
              <p className="text-xs font-medium text-foreground truncate">{shortName(m.full_name).split(" ")[0]}</p>
              <p className="text-[11px] text-primary font-semibold tabular-nums">{m.points} pts</p>
            </div>
          </div>
        ))}
      </div>
    </Link>
  );
};
