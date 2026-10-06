import { ReliabilityDiagram, RpsBySeason } from "./charts";
import { useData, type Backtest, type Reliability, type Upcoming } from "./data";
import { Footer, Header, REPO, Shell } from "./Shell";

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const fmt = (n: number | null | undefined, d = 4) => (n == null ? "n/a" : n.toFixed(d));
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
const seasonLabel = (s: string) => `20${s.slice(0, 2)}/${s.slice(2)}`;

// Plain-language reading of each chart, computed from the data so it never drifts from the picture.
function rpsSummary(bt: Backtest) {
  const rows = bt.test_seasons.map((s) => ({ s, elo: bt.by_season[s]!.elo.rps, book: bt.by_season[s]!.bookmaker.rps }));
  const worse = rows.filter((r) => r.elo > r.book).length;
  const lo = rows.reduce((a, b) => (b.elo < a.elo ? b : a)), hi = rows.reduce((a, b) => (b.elo > a.elo ? b : a));
  return `Elo's RPS runs from ${fmt(lo.elo)} (${seasonLabel(lo.s)}) to ${fmt(hi.elo)} (${seasonLabel(hi.s)}). It is worse than the bookmaker in ${worse} of ${rows.length} seasons.`;
}
function reliabilitySummary(bins: Reliability) {
  if (bins.length === 0) return "No calibration data yet.";
  // Ignore bins with very few forecasts: one lucky outcome in a bin of four says nothing.
  const MIN = 100;
  const big = bins.filter((b) => b.n >= MIN);
  const w = (big.length ? big : bins).reduce((a, b) => (Math.abs(b.mean_p - b.freq) > Math.abs(a.mean_p - a.freq) ? b : a));
  return `Points on the dashed diagonal are perfectly calibrated. Among bins with at least ${MIN} forecasts the largest miss is ${pct(w.lo)} to ${pct(w.hi)}: forecast ${(w.mean_p * 100).toFixed(1)}%, observed ${(w.freq * 100).toFixed(1)}% (${w.n} forecasts).`;
}

function Prediction({ p }: { p: Upcoming }) {
  return (
    <tr>
      <td>
        <strong>{p.home}</strong> v <strong>{p.away}</strong>
        <div className="meta">{p.division === "E0" ? "Premier League" : "La Liga"} · {when(p.kickoff_utc)}</div>
      </td>
      <td className="num">{pct(p.probs[0])}</td>
      <td className="num">{pct(p.probs[1])}</td>
      <td className="num">{pct(p.probs[2])}</td>
      <td className="num dim">{p.book ? p.book.map(pct).join(" / ") : "n/a"}</td>
      <td className="meta">{when(p.published_at)}<br />#{p.seq} {p.hash.slice(0, 10)}</td>
    </tr>
  );
}

export function App() {
  const { data, error } = useData();
  // The loading state is exactly the prerendered shell, so hydration matches and nothing shifts when data arrives.
  if (!data && !error) return <Shell />;
  if (!data) {
    return (
      <>
        <Header />
        <main id="main"><p className="meta" role="alert">Could not load the latest data ({error}). Reload to try again; the same numbers are in <a href="/data/backtest.json">/data/backtest.json</a>.</p></main>
        <Footer />
      </>
    );
  }
  const { backtest: bt, live, meta, upcoming } = data;
  const elo = bt.models.elo, book = bt.models.bookmaker, prior = bt.models.home_prior;
  const gap = elo.rps_minus_bookmaker!;

  return (
    <>
      <Header />
      <nav aria-label="On this page" className="toc">
        <a href="#live">Live record</a>
        <a href="#backtest">Backtest evidence</a>
        <a href="#method">Method</a>
        <a href="#limits">Limits</a>
      </nav>
      <main id="main">
      <p className="meta">Results through {meta.results_through} · built {when(meta.generated_at)} · <a href={REPO}>source on GitHub</a></p>

      <section aria-labelledby="live">
        <h2 id="live">Live record</h2>
        <dl className="tiles">
          <div><dt>Predictions published</dt><dd>{live.predicted}</dd></div>
          <div><dt>Scored so far</dt><dd>{live.scored}</dd></div>
          <div><dt>Skipped (published too late)</dt><dd>{live.skipped_late}</dd></div>
          <div><dt>Chain head</dt><dd className="hash">{live.chain_head.slice(0, 12)}</dd></div>
        </dl>
        {live.scored === 0 ? (
          <p>No matches have been scored yet. Scores appear here once predicted matches have been played; until then the backtest below is the only evidence, and it is not a live result.</p>
        ) : (
          <p>
            Over {live.scored} scored matches: model RPS {fmt(live.model_rps_same_matches)} against bookmaker {fmt(live.bookmaker_rps_same_matches)} on the same matches.
          </p>
        )}

        <h3>Upcoming predictions</h3>
        {upcoming.length === 0 ? (
          <p>No upcoming predictions yet. The source lists fixtures only a few days ahead, so predictions appear as matchdays approach. Each is published at least 2 hours before kickoff, or skipped and counted above.</p>
        ) : (
          <div className="scroll" tabIndex={0} role="region" aria-label="Upcoming predictions table, scrolls sideways on narrow screens">
            <table>
              <caption className="sr">Published predictions for upcoming matches</caption>
              <thead><tr><th>Match</th><th>Home</th><th>Draw</th><th>Away</th><th>Bookmaker H / D / A</th><th>Published</th></tr></thead>
              <tbody>{upcoming.map((p) => <Prediction key={p.hash} p={p} />)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="backtest">
        <h2 id="backtest">Backtest evidence</h2>
        <p>
          Walk-forward over {bt.test_seasons.length} seasons ({seasonLabel(bt.test_seasons[0]!)} to {seasonLabel(bt.test_seasons.at(-1)!)}, the last still in progress),
          {" "}{elo.n.toLocaleString()} matches. Parameters for each season were chosen using only earlier seasons. This is a backtest, not a track record.
        </p>
        <dl className="tiles">
          <div><dt>Elo RPS</dt><dd className="signal">{fmt(elo.rps)}</dd></div>
          <div><dt>Bookmaker RPS</dt><dd>{fmt(book.rps)}</dd></div>
          <div><dt>Home prior RPS</dt><dd>{fmt(prior.rps)}</dd></div>
          <div><dt>Elo minus bookmaker</dt><dd>+{fmt(gap.mean)}</dd></div>
        </dl>
        <p>
          Lower RPS is better. Elo beats a model that only knows the home-advantage rate, and loses to the bookmaker by {fmt(gap.mean)} RPS
          (95% interval {fmt(gap.ci95[0])} to {fmt(gap.ci95[1])}, paired bootstrap over matches). The interval excludes zero, so the gap is real.
        </p>

        <figure>
          <figcaption id="cap-rps">Mean RPS by season (lower is better)</figcaption>
          <RpsBySeason bt={bt} labelledBy="cap-rps" describedBy="sum-rps" />
          <p id="sum-rps" className="chart-summary">{rpsSummary(bt)}</p>
          <details>
            <summary>Table view of this chart</summary>
            <div className="scroll" tabIndex={0} role="region" aria-label="Mean RPS by season table">
            <table>
              <thead><tr><th>Season</th><th>Matches</th><th>Elo</th><th>Bookmaker</th><th>Home prior</th></tr></thead>
              <tbody>
                {bt.test_seasons.map((s) => (
                  <tr key={s}>
                    <td>{seasonLabel(s)}</td><td className="num">{bt.by_season[s]!.elo.n}</td>
                    <td className="num">{fmt(bt.by_season[s]!.elo.rps)}</td><td className="num">{fmt(bt.by_season[s]!.bookmaker.rps)}</td><td className="num">{fmt(bt.by_season[s]!.home_prior.rps)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </details>
        </figure>

        <figure>
          <figcaption id="cap-rel">Calibration of the Elo forecasts (expected calibration error {fmt(elo.ece)})</figcaption>
          <ReliabilityDiagram bins={elo.reliability} labelledBy="cap-rel" describedBy="sum-rel" />
          <p id="sum-rel" className="chart-summary">{reliabilitySummary(elo.reliability)}</p>
          <details>
            <summary>Table view of this chart</summary>
            <div className="scroll" tabIndex={0} role="region" aria-label="Calibration table">
            <table>
              <thead><tr><th>Forecast range</th><th>Forecasts</th><th>Mean forecast</th><th>Observed</th></tr></thead>
              <tbody>
                {elo.reliability.map((b) => (
                  <tr key={b.lo}><td>{pct(b.lo)} to {pct(b.hi)}</td><td className="num">{b.n}</td><td className="num">{pct(b.mean_p)}</td><td className="num">{pct(b.freq)}</td></tr>
                ))}
              </tbody>
            </table>
            </div>
          </details>
        </figure>
      </section>

      <section aria-labelledby="method">
        <h2 id="method">Method</h2>
        <ol>
          <li>Results and fixtures are collected from football-data.co.uk every 6 hours and validated before they are stored.</li>
          <li>Elo ratings (K {meta.params.k}, home advantage {meta.params.home_adv} points) become home/draw/away probabilities with an ordered logit (draw threshold {meta.params.draw_c}). Ratings regress a quarter of the way to the league mean each season; promoted teams start at {meta.params.newcomer}.</li>
          <li>A prediction is written to <a href={`${REPO}/blob/main/predictions/ledger.jsonl`}>the ledger</a> only if there are at least 2 hours to kickoff. It is never rewritten. Each record contains the hash of the one before it.</li>
          <li>Verify the chain yourself: clone the repo and run <code>python -m informant.verify</code>.</li>
        </ol>
      </section>

      <section aria-labelledby="limits">
        <h2 id="limits">Limits</h2>
        <ul>
          <li>Bookmaker probabilities use Bet365 odds from the same source with the margin removed proportionally. The source does not say exactly when those odds were captured, so the bookmaker baseline may include late information that a real pre-kickoff forecast would not have.</li>
          <li>Kickoff times are read as UK local time, as the source lists them. Where no time is given, 00:00 is assumed, which only makes the 2-hour rule stricter.</li>
          <li>2020/21 was played mostly without crowds; home advantage in that season is unusual.</li>
          <li>Elo is the first rung of a ladder. Goal-based and machine-learning models come next and will be benchmarked the same way.</li>
          <li>Nothing here is betting advice.</li>
        </ul>
      </section>
      </main>
      <Footer />
    </>
  );
}
