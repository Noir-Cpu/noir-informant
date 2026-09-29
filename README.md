# CASE 003 / INFORMANT

Calibrated match forecasting for the Premier League and La Liga, with a public track record: every prediction is committed before kickoff, so it can't be edited afterwards.

**Status: live, collecting.** Live site: https://noir-informant.noir-cpu.workers.dev. The model is an Elo baseline; it does not beat the bookmakers (numbers below). The collector and predictor have run since 2026-09-29. The live track record starts at zero and grows only from matches predicted before kickoff.

## The brief

Prediction sites sell certainty and never show a verifiable track record. This project publishes win/draw/loss probabilities before each match and reports how good they were, whether or not they beat the bookmakers.

Constraints: free tier only, solo, part-time. Non-goals: betting advice, tips, live in-play prediction.

## The evidence

**Backtest** (walk-forward, 2019/20 to 2026/27 in progress, 5,439 matches with bookmaker odds, both leagues; parameters for each season chosen using only earlier seasons; reproduce with `python -m informant.backtest`):

| Forecaster | RPS (lower is better) | Log loss | Brier |
| --- | --- | --- | --- |
| Home-advantage prior | 0.22936 | 1.07023 | 0.64738 |
| Elo (this project) | 0.20165 | 0.99041 | 0.59017 |
| Bookmaker (Bet365, margin removed) | 0.19567 | 0.97088 | 0.57667 |

Elo minus bookmaker: +0.00599 RPS, 95% paired-bootstrap interval [0.00453, 0.00735]. The bookmaker is better and the gap is not noise. Elo's expected calibration error is 0.00824 (bookmaker 0.0072). Caveat: the source does not say when its odds were captured, so the bookmaker baseline may contain late information.

**Live record:** 0 scored matches so far. See the site for the current count.

**Integrity checks:**

- 11 seasons of results for each league (2016/17 to now), validated on every run: schema, score ranges, result consistent with score, no duplicate matches, files never shrink.
- Data refreshes every 6 hours by GitHub Actions. Every change is a commit, so the git history is a timestamped record of what was known when.
- `data/manifest.json` holds a SHA-256, row count and fetch time for each file.

## The method

```
football-data.co.uk  ->  collector/run.py  ->  data/*.csv + manifest.json  ->  git commit
                            (validate first;
                             a bad download never
                             replaces good data)
```

- `data/results/<division>/<season>.csv`: verbatim season files (`E0` Premier League, `SP1` La Liga). Past seasons are fetched once; the current one is refreshed.
- `data/fixtures/<division>.csv`: upcoming matches with bookmaker odds, when the source lists them. The source only shows the next few days, which is why the collector runs four times a day.

- `informant/`: Elo model, metrics, walk-forward backtest, the prediction ledger (`predictions/ledger.jsonl`), evaluator.
- Ledger: each record holds the hash of the previous one. Predictions are written only if there are at least 2 hours to kickoff (later ones are logged in `predictions/skipped.jsonl` and counted on the site), and a match is never predicted twice. CI fails if the chain is broken (`python -m informant.verify`) or if a commit edits or removes earlier records (`python -m informant.append_only`).
- Site: static React page reading JSON that the Python jobs write to `apps/web/public/data`, deployed as Cloudflare Workers static assets.

Run locally: `python -m collector.run`, `python -m informant.predict`, `python -m informant.evaluate`, `npm run dev`. Tests: `python -m unittest discover -s collector/tests -t .` and `-s informant/tests`, then `npm run e2e`.

## The verdict

Elo is a sound baseline and a weak product: it is well calibrated and clearly better than guessing the home rate, but it is about 0.006 RPS behind the market. Whether it ever beats the bookmakers is an open question the live record will answer slowly. Nothing here is betting advice.

## Open leads

1. More rungs on the ladder, each benchmarked the same way: Dixon-Coles goals model, gradient boosting, ensemble (home prior and Elo are done).
2. Matchweek-by-matchweek RPS and calibration reporting once live matches exist.
3. La Liga transfer test and drift monitoring.
4. Closing-odds timing check against a source that records capture time.

Data: [football-data.co.uk](https://www.football-data.co.uk). Part of the NOIR portfolio. Built from `noir-template`.
