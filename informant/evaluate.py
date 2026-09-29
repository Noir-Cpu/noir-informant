"""Score the live ledger against results and build the JSON the results page reads."""

import json
from datetime import datetime, timezone
from pathlib import Path

from informant import ledger
from informant.data import ROOT, load_matches
from informant.metrics import brier, log_loss, reliability, rps

OUT = ROOT / "apps" / "web" / "public" / "data"
BACKTEST = Path(__file__).resolve().parent / "out" / "backtest.json"


def mean(xs: list[float]) -> float | None:
    return round(sum(xs) / len(xs), 5) if xs else None


def live_record(records: list[dict], results: dict) -> dict:
    scored, model_f, book_f = [], [], []
    for r in records:
        m = r["match"]
        res = results.get((m["division"], m["date"], m["home"], m["away"]))
        if not res:
            continue
        p = tuple(r["probs"])
        scored.append({"rps": rps(p, res.result), "ll": log_loss(p, res.result), "brier": brier(p, res.result)})
        model_f.append((p, res.result))
        if r.get("book"):
            b = tuple(r["book"])
            book_f.append((b, res.result, rps(b, res.result), rps(p, res.result)))
    table, ece = reliability(model_f) if model_f else ([], None)
    return {
        "scored": len(scored),
        "rps": mean([s["rps"] for s in scored]),
        "log_loss": mean([s["ll"] for s in scored]),
        "brier": mean([s["brier"] for s in scored]),
        "ece": round(ece, 5) if ece is not None else None,
        "bookmaker_rps_same_matches": mean([b[2] for b in book_f]),
        "model_rps_same_matches": mean([b[3] for b in book_f]),
        "reliability": table,
    }


def build(now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    records = ledger.read()
    ledger.verify(records)
    skipped = ledger.read(ledger.SKIPPED)
    matches = load_matches()
    results = {m.key: m for m in matches}
    upcoming = [
        {
            "division": r["match"]["division"], "date": r["match"]["date"], "kickoff_utc": r["match"]["kickoff_utc"],
            "home": r["match"]["home"], "away": r["match"]["away"], "probs": r["probs"], "book": r.get("book"),
            "published_at": r["published_at"], "hash": r["hash"], "seq": r["seq"],
        }
        for r in records
        if ledger.match_key(r) not in results
    ]
    upcoming.sort(key=lambda x: x["kickoff_utc"])
    live = live_record(records, results)
    live.update({"predicted": len(records), "skipped_late": len(skipped), "chain_head": ledger.head(records)})
    meta = {
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "model": "elo-v1",
        "results_through": max((m.date for m in matches)).isoformat(),
        "matches_in_history": len(matches),
        "params": json.loads((Path(__file__).resolve().parent / "params.json").read_text()),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    (OUT / "upcoming.json").write_text(json.dumps(upcoming, indent=2) + "\n")
    (OUT / "live.json").write_text(json.dumps(live, indent=2) + "\n")
    if BACKTEST.exists():
        (OUT / "backtest.json").write_text(BACKTEST.read_text())
    return {"upcoming": len(upcoming), "scored": live["scored"], "predicted": len(records)}


if __name__ == "__main__":
    print(json.dumps(build()))
