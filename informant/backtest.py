"""Walk-forward backtest.

For each test season S: pick Elo parameters by replaying only seasons before S, then predict S match by match,
updating ratings after each result. Nothing from S (or later) is used to choose parameters or to predict earlier
matches of S. The first training season is burn-in and is not scored when tuning.

Usage: python -m informant.backtest  (writes data-independent JSON to informant/out/backtest.json)
"""

import itertools
import json
import sys
from pathlib import Path

from informant.data import Match, load_matches
from informant.elo import Elo, HomePrior, Params
from informant.metrics import log_loss, brier, paired_bootstrap, reliability, rps

GRID = {
    "k": [10, 15, 20, 25, 30, 40],
    "home_adv": [50, 70, 90, 110],
    "draw_c": [0.35, 0.45, 0.55, 0.65, 0.75],
}
FIRST_TEST_SEASON = "1920"  # 1617 burn-in + 1718, 1819 to tune on
OUT = Path(__file__).resolve().parent / "out"


def seasons_of(matches: list[Match]) -> list[str]:
    return sorted({m.season for m in matches})


def replay(matches: list[Match], params: Params, score_from: str | None = None) -> float:
    """Mean RPS of Elo over `matches` (chronological), scoring only seasons >= score_from."""
    elo = Elo(params)
    total, n = 0.0, 0
    for m in matches:
        p = elo.predict(m.division, m.home, m.away)
        if score_from is None or m.season >= score_from:
            total += rps(p, m.result)
            n += 1
        elo.update(m)
    return total / max(n, 1)


def tune(train: list[Match]) -> Params:
    burn_in_until = seasons_of(train)[1] if len(seasons_of(train)) > 1 else None
    best, best_score = Params(), float("inf")
    for k, h, c in itertools.product(GRID["k"], GRID["home_adv"], GRID["draw_c"]):
        params = Params(k=k, home_adv=h, draw_c=c)
        score = replay(train, params, score_from=burn_in_until)
        if score < best_score:
            best, best_score = params, score
    return best


def summarise(rows: list[dict]) -> dict:
    n = len(rows)
    return {
        "n": n,
        "rps": round(sum(r["rps"] for r in rows) / n, 5),
        "log_loss": round(sum(r["ll"] for r in rows) / n, 5),
        "brier": round(sum(r["brier"] for r in rows) / n, 5),
    }


def run() -> dict:
    matches = load_matches()
    seasons = seasons_of(matches)
    test_seasons = [s for s in seasons if s >= FIRST_TEST_SEASON]
    per_model: dict[str, list[dict]] = {"home_prior": [], "elo": [], "bookmaker": []}
    forecasts: dict[str, list] = {"home_prior": [], "elo": [], "bookmaker": []}
    chosen: dict[str, dict] = {}

    for season in test_seasons:
        train = [m for m in matches if m.season < season]
        test = [m for m in matches if m.season == season]
        params = tune(train)
        chosen[season] = params.as_dict()

        # Warm up ratings and the home prior on the training seasons, then walk through the test season.
        elo, prior = Elo(params), HomePrior()
        for m in train:
            elo.update(m)
            prior.update(m)
        for m in test:
            if m.book is None:
                elo.update(m)
                prior.update(m)
                continue  # compare all three models on the same matches
            preds = {"home_prior": prior.predict(m.division), "elo": elo.predict(m.division, m.home, m.away), "bookmaker": m.book}
            for name, p in preds.items():
                per_model[name].append(
                    {"season": season, "division": m.division, "rps": rps(p, m.result), "ll": log_loss(p, m.result), "brier": brier(p, m.result)}
                )
                forecasts[name].append((p, m.result))
            elo.update(m)
            prior.update(m)
        print(f"{season}: tuned {params.as_dict()}", file=sys.stderr)

    result: dict = {"test_seasons": test_seasons, "params_by_season": chosen, "models": {}, "by_season": {}, "by_division": {}}
    for name, rows in per_model.items():
        table, ece = reliability(forecasts[name])
        result["models"][name] = {**summarise(rows), "ece": round(ece, 5), "reliability": table}
        for season in test_seasons:
            result["by_season"].setdefault(season, {})[name] = summarise([r for r in rows if r["season"] == season])
        for div in sorted({r["division"] for r in rows}):
            result["by_division"].setdefault(div, {})[name] = summarise([r for r in rows if r["division"] == div])

    # Paired difference in per-match RPS: negative means the model beats the bookmaker.
    for name in ("elo", "home_prior"):
        diffs = [a["rps"] - b["rps"] for a, b in zip(per_model[name], per_model["bookmaker"])]
        mean, lo, hi = paired_bootstrap(diffs)
        result["models"][name]["rps_minus_bookmaker"] = {"mean": round(mean, 5), "ci95": [round(lo, 5), round(hi, 5)]}
    return result


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    res = run()
    (OUT / "backtest.json").write_text(json.dumps(res, indent=2) + "\n")
    for name, m in res["models"].items():
        print(f"{name:11s} n={m['n']} rps={m['rps']} logloss={m['log_loss']} brier={m['brier']} ece={m['ece']}")
    for name in ("elo", "home_prior"):
        print(name, "RPS minus bookmaker:", res["models"][name]["rps_minus_bookmaker"])
