import { useEffect, useState } from "react";

export type Probs = [number, number, number];
export type Upcoming = {
  division: string; date: string; kickoff_utc: string; home: string; away: string;
  probs: Probs; book: Probs | null; published_at: string; hash: string; seq: number;
};
export type Reliability = { lo: number; hi: number; n: number; mean_p: number; freq: number }[];
export type Summary = { n: number; rps: number; log_loss: number; brier: number };
export type Backtest = {
  test_seasons: string[];
  models: Record<"home_prior" | "elo" | "bookmaker", Summary & { ece: number; reliability: Reliability; rps_minus_bookmaker?: { mean: number; ci95: [number, number] } }>;
  by_season: Record<string, Record<"home_prior" | "elo" | "bookmaker", Summary>>;
};
export type Live = {
  predicted: number; skipped_late: number; scored: number; chain_head: string;
  rps: number | null; ece: number | null; bookmaker_rps_same_matches: number | null; model_rps_same_matches: number | null;
};
export type Meta = { generated_at: string; model: string; results_through: string; matches_in_history: number; params: Record<string, number> };

export type Data = { upcoming: Upcoming[]; backtest: Backtest; live: Live; meta: Meta };

const get = <T,>(name: string) => fetch(`/data/${name}.json`).then((r) => {
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  return r.json() as Promise<T>;
});

export function useData(): { data?: Data; error?: string } {
  const [state, set] = useState<{ data?: Data; error?: string }>({});
  useEffect(() => {
    let live = true;
    Promise.all([get<Upcoming[]>("upcoming"), get<Backtest>("backtest"), get<Live>("live"), get<Meta>("meta")])
      .then(([upcoming, backtest, liveRecord, meta]) => live && set({ data: { upcoming, backtest, live: liveRecord, meta } }))
      .catch((e) => live && set({ error: String(e) }));
    return () => { live = false; };
  }, []);
  return state;
}
