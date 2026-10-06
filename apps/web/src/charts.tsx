import { useLayoutEffect, useRef, useState } from "react";
import type { Backtest, Reliability } from "./data";

const SERIES = [
  { key: "elo", label: "Elo (ours)", short: "Elo", color: "var(--series-1)" },
  { key: "bookmaker", label: "Bookmaker", short: "Bookmaker", color: "var(--series-2)" },
  { key: "home_prior", label: "Home prior", short: "Home prior", color: "var(--series-3)" },
] as const;

const seasonLabel = (s: string) => `20${s.slice(0, 2)}/${s.slice(2)}`;

type ChartA11y = { labelledBy: string; describedBy: string };

// Measure the container so the SVG is drawn at its real pixel size. A fixed viewBox scaled down
// to a 320px phone shrinks the 15px axis text to about 7px; this keeps type at 12 to 13px.
function useWidth<T extends HTMLElement>(initial = 640) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.round(el.clientWidth) || initial);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e!.contentRect.width) || initial));
    ro.observe(el);
    return () => ro.disconnect();
  }, [initial]);
  return [ref, w] as const;
}

export function RpsBySeason({ bt, labelledBy, describedBy }: { bt: Backtest } & ChartA11y) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const narrow = W < 520;
  const H = Math.round(Math.min(340, Math.max(240, W * 0.55)));
  const M = { t: 12, r: narrow ? 92 : 124, b: 34, l: 46 };
  const seasons = bt.test_seasons;
  const vals = seasons.flatMap((s) => SERIES.map((k) => bt.by_season[s]![k.key].rps));
  const lo = Math.floor(Math.min(...vals) * 100 - 1) / 100, hi = Math.ceil(Math.max(...vals) * 100 + 1) / 100;
  const x = (i: number) => M.l + (i * (W - M.l - M.r)) / Math.max(seasons.length - 1, 1);
  const y = (v: number) => M.t + ((hi - v) / (hi - lo)) * (H - M.t - M.b);
  // Show every second season label when they would touch (about 44px per label).
  const step = (W - M.l - M.r) / Math.max(seasons.length - 1, 1) < 44 ? 2 : 1;
  // End-of-line labels: keep at least 18px apart so neighbouring series never overprint.
  const ends = SERIES.map((k) => ({ key: k.key, y: y(bt.by_season[seasons.at(-1)!]![k.key].rps) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i]!.y = Math.max(ends[i]!.y, ends[i - 1]!.y + 18);
  const labelY = Object.fromEntries(ends.map((e) => [e.key, e.y]));
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  return (
    <div ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={labelledBy} aria-describedby={describedBy} className="chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={M.l - 8} y={y(t) + 4} textAnchor="end" className="axis">{t.toFixed(2)}</text>
          </g>
        ))}
        {seasons.map((s, i) =>
          (seasons.length - 1 - i) % step === 0 ? (
            <text key={s} x={x(i)} y={H - 10} textAnchor="middle" className="axis">{seasonLabel(s).replace(/^20/, "")}</text>
          ) : null,
        )}
        {SERIES.map((k) => {
          const pts = seasons.map((s, i) => [x(i), y(bt.by_season[s]![k.key].rps)] as const);
          return (
            <g key={k.key}>
              <polyline fill="none" stroke={k.color} strokeWidth="2" strokeLinejoin="round" points={pts.map((p) => p.join(",")).join(" ")} />
              {pts.map(([px, py], i) => (
                <circle key={i} cx={px} cy={py} r="4" fill={k.color} stroke="var(--bone)" strokeWidth="2">
                  <title>{`${k.label}, ${seasonLabel(seasons[i]!)}: RPS ${bt.by_season[seasons[i]!]![k.key].rps.toFixed(4)}`}</title>
                </circle>
              ))}
              <text x={pts[pts.length - 1]![0] + 10} y={labelY[k.key]! + 4} className="direct">{narrow ? k.short : k.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function ReliabilityDiagram({ bins, labelledBy, describedBy }: { bins: Reliability } & ChartA11y) {
  const S = 300, P = 54;
  const x = (v: number) => P + v * (S - P - 12), y = (v: number) => S - P - v * (S - P - 12);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-labelledby={labelledBy} aria-describedby={describedBy} className="chart chart-square">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={P} x2={S - 12} y1={y(t)} y2={y(t)} className="grid" />
          <text x={P - 6} y={y(t) + 4} textAnchor="end" className="axis">{t}</text>
          <text x={x(t)} y={S - P + 16} textAnchor="middle" className="axis">{t}</text>
        </g>
      ))}
      <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} className="diag" />
      <polyline fill="none" stroke="var(--series-1)" strokeWidth="2" points={bins.map((b) => `${x(b.mean_p)},${y(b.freq)}`).join(" ")} />
      {bins.map((b) => (
        <circle key={b.lo} cx={x(b.mean_p)} cy={y(b.freq)} r="4" fill="var(--series-1)" stroke="var(--bone)" strokeWidth="2">
          <title>{`Forecast ${(b.mean_p * 100).toFixed(1)}% happened ${(b.freq * 100).toFixed(1)}% of the time (${b.n} forecasts)`}</title>
        </circle>
      ))}
      <text x={x(0.5)} y={S - 4} textAnchor="middle" className="axis">forecast probability</text>
      <text transform={`translate(12 ${y(0.5)}) rotate(-90)`} textAnchor="middle" className="axis">observed frequency</text>
    </svg>
  );
}
