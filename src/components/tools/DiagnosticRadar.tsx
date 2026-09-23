import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { DIAGNOSTICO_BEGIN_PILLARS, maturityLabel, overallScore } from "@/lib/diagnosticoBegin";

interface Props {
  scores: Record<string, number>;
  compareScores?: Record<string, number> | null;
  compareLabel?: string;
  label?: string;
  height?: number;
  showSummary?: boolean;
  showBars?: boolean;
  onPillarSelect?: (pillarId: string) => void;
}

export const DiagnosticRadar = ({
  scores,
  compareScores,
  compareLabel = "Final",
  label = "Diagnóstico inicial",
  height = 340,
  showSummary = true,
  showBars = true,
  onPillarSelect,
}: Props) => {
  const shortToId = Object.fromEntries(DIAGNOSTICO_BEGIN_PILLARS.map((p) => [p.short, p.id]));
  const selectByShort = (short?: string) => {
    if (!onPillarSelect || !short) return;
    const id = shortToId[short];
    if (id) onPillarSelect(id);
  };

  const data = DIAGNOSTICO_BEGIN_PILLARS.map((p) => ({
    pilar: p.short,
    atual: Number(scores?.[p.id] ?? 0),
    ...(compareScores ? { comparativo: Number(compareScores?.[p.id] ?? 0) } : {}),
  }));

  const total = overallScore(scores || {});
  const level = maturityLabel(total);

  return (
    <div className="space-y-4">
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <RadarChart
            data={data}
            outerRadius="86%"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onClick={(state: any) => selectByShort(state?.activeLabel ?? state?.activePayload?.[0]?.payload?.pilar)}
          >
            <defs>
              <linearGradient id="radarFillMain" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.85} />
                <stop offset="100%" stopColor="hsl(var(--status-blue, 210 90% 55%))" stopOpacity={0.5} />
              </linearGradient>
              <linearGradient id="radarFillCompare" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="hsl(var(--status-green, 142 70% 45%))" stopOpacity={0.6} />
                <stop offset="100%" stopColor="hsl(var(--status-green, 142 70% 45%))" stopOpacity={0.25} />
              </linearGradient>
            </defs>
            <PolarGrid stroke="hsl(var(--foreground))" strokeOpacity={0.28} strokeWidth={1.25} />
            <PolarAngleAxis
              dataKey="pilar"
              tick={
                onPillarSelect
                  ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ((props: any) => {
                      const { x, y, textAnchor, payload } = props;
                      return (
                        <text
                          x={x}
                          y={y}
                          textAnchor={textAnchor}
                          dominantBaseline="central"
                          style={{ cursor: "pointer" }}
                          fill="hsl(var(--foreground))"
                          fontSize={11}
                          fontWeight={600}
                          onClick={() => selectByShort(payload.value)}
                        >
                          {payload.value}
                        </text>
                      );
                    }) as any
                  : { fill: "hsl(var(--foreground))", fontSize: 11, fontWeight: 600 }
              }
            />

            <PolarRadiusAxis domain={[0, 5]} tickCount={6} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={false} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 12,
                fontSize: 12,
                color: "hsl(var(--foreground))",
              }}
              formatter={(v: number) => v.toFixed(1)}
            />
            {compareScores && <Legend wrapperStyle={{ fontSize: 11 }} />}
            <Radar
              name={label}
              dataKey="atual"
              stroke="hsl(var(--primary))"
              fill="url(#radarFillMain)"
              fillOpacity={1}
              strokeWidth={3}
              isAnimationActive={false}
              dot={
                onPillarSelect
                  ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ((props: any) => {
                      const { cx, cy, payload } = props;
                      const short = payload?.name ?? payload?.payload?.pilar;
                      const value = Number(payload?.value ?? payload?.payload?.atual ?? 0);
                      const angle = Number(payload?.angle);
                      const centerX = Number(payload?.cx);
                      const centerY = Number(payload?.cy);
                      const shouldOffsetLowValue = value <= 0.1 && Number.isFinite(angle) && Number.isFinite(centerX) && Number.isFinite(centerY);
                      const dotX = shouldOffsetLowValue ? centerX + Math.cos((-Math.PI / 180) * angle) * 38 : cx;
                      const dotY = shouldOffsetLowValue ? centerY + Math.sin((-Math.PI / 180) * angle) * 38 : cy;
                      return (
                        <g
                          key={`dot-${short}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`Ver respostas de ${short}`}
                          style={{ cursor: "pointer", pointerEvents: "all" }}
                          onClick={(event) => {
                            event.stopPropagation();
                            selectByShort(short);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              selectByShort(short);
                            }
                          }}
                        >
                          <circle cx={dotX} cy={dotY} r={13} fill="hsl(var(--primary))" fillOpacity={0.01} />
                          <circle cx={dotX} cy={dotY} r={5} fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth={1.5} />
                        </g>
                      );
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    }) as any
                  : { r: 3.5, fill: "hsl(var(--primary))", stroke: "hsl(var(--background))", strokeWidth: 1.5 }
              }
              activeDot={onPillarSelect ? { r: 7, style: { cursor: "pointer" } } : undefined}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onClick={(e: any) => {
                const short = e?.payload?.payload?.pilar ?? e?.payload?.pilar ?? e?.name;
                selectByShort(short);
              }}
            />


            {compareScores && (
              <Radar
                className="pointer-events-none"
                name={compareLabel}
                dataKey="comparativo"
                stroke="hsl(var(--status-green, 142 70% 45%))"
                fill="url(#radarFillCompare)"
                fillOpacity={1}
                strokeWidth={3}
                dot={{ r: 3.5, fill: "hsl(var(--status-green, 142 70% 45%))", stroke: "hsl(var(--background))", strokeWidth: 1.5 }}
              />
            )}
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {showSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">Média geral</p>
            <p className="text-xl font-semibold text-primary tabular-nums">{total.toFixed(1)}<span className="text-xs text-muted-foreground">/5</span></p>
          </div>
          <div className="rounded-xl border border-border bg-card/60 p-3 col-span-2">
            <p className="text-xs text-muted-foreground">Nível de maturidade</p>
            <p className="text-sm font-semibold text-foreground">{level.label}</p>
            <p className="text-xs text-muted-foreground leading-snug">{level.hint}</p>
          </div>
          <div className="rounded-xl border border-border bg-card/60 p-3">
            <p className="text-xs text-muted-foreground">Pilares</p>
            <p className="text-xl font-semibold text-foreground tabular-nums">{DIAGNOSTICO_BEGIN_PILLARS.length}</p>
          </div>
        </div>
      )}

      {showBars && (
        <div className="space-y-1.5">
          {DIAGNOSTICO_BEGIN_PILLARS.map((p) => {
            const v = Number(scores?.[p.id] ?? 0);
            const Wrapper = onPillarSelect ? "button" : "div";
            return (
              <Wrapper
                key={p.id}
                type={onPillarSelect ? "button" : undefined}
                onClick={onPillarSelect ? () => onPillarSelect(p.id) : undefined}
                className={`w-full flex items-center gap-3 rounded-lg px-1 py-1 text-left ${onPillarSelect ? "hover:bg-muted/40 transition-colors" : ""}`}
              >
                <span className="text-xs text-muted-foreground w-32 shrink-0 truncate">{p.short}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(v / 5) * 100}%` }} />
                </div>
                <span className="text-xs font-semibold text-foreground tabular-nums w-8 text-right">{v.toFixed(1)}</span>
              </Wrapper>
            );
          })}
        </div>
      )}

    </div>
  );
};
