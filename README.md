# CASE 003 / INFORMANT

Calibrated match forecasting for the Premier League and La Liga, with a public track record: every prediction is committed before kickoff, so it can't be edited afterwards.

**Status: collecting data.** No model yet. The collector has been running since 2026-09-29, because a pre-kickoff record only exists for matches predicted before they were played.

## The brief

Prediction sites sell certainty and never show a verifiable track record. This project publishes win/draw/loss probabilities before each match and reports how good they were, whether or not they beat the bookmakers.

Constraints: free tier only, solo, part-time. Non-goals: betting advice, tips, live in-play prediction.

## The evidence

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

Run it locally: `python -m collector.run`. Tests: `python -m unittest discover -s collector/tests -t .`.

## The verdict

Too early. Nothing to report until predictions exist.

## Open leads

1. Model ladder, each rung benchmarked: home-advantage prior, Elo, Dixon-Coles goals model, gradient boosting, ensemble.
2. Walk-forward backtesting only (no leakage from after kickoff).
3. Predictions committed at least 2 hours before kickoff, chained by hash (the WITNESS pattern).
4. Bookmaker baseline with the margin removed; report the ranked probability score and calibration error every matchweek.
5. Public results page on Cloudflare Workers, reading from Neon.

Data: [football-data.co.uk](https://www.football-data.co.uk). Part of the NOIR portfolio. Built from `noir-template`.
