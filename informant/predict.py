"""Publish pre-kickoff predictions for upcoming fixtures.

Rules (each one is tested):
- A prediction is only written at least MIN_LEAD before kickoff. Later ones go to skipped.jsonl, never to the ledger.
- A match is predicted once. Existing predictions are never modified or replaced.
- Predictions come from the frozen parameters in informant/params.json, using only results already stored.
"""

import csv
import hashlib
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from collector.validate import parse_date
from informant import ledger
from informant.data import ROOT, Match, load_matches, remove_margin
from informant.elo import Elo, Params

MIN_LEAD = timedelta(hours=2)
LONDON = ZoneInfo("Europe/London")  # football-data.co.uk lists kickoff times in UK local time
MODEL = "elo-v1"
PARAMS_PATH = Path(__file__).resolve().parent / "params.json"
FIXTURES = ROOT / "data" / "fixtures"
MANIFEST = ROOT / "data" / "manifest.json"


def load_params() -> Params:
    return Params(**json.loads(PARAMS_PATH.read_text()))


def kickoff_utc(day: date, time: str | None) -> datetime:
    """Kickoff in UTC. When the source gives no time we assume 00:00 London, which only makes the lead-time rule stricter."""
    hh, mm = (int(x) for x in time.split(":")) if time else (0, 0)
    return datetime(day.year, day.month, day.day, hh, mm, tzinfo=LONDON).astimezone(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_elo(matches: list[Match], params: Params) -> Elo:
    elo = Elo(params)
    for m in matches:
        elo.update(m)
    return elo


def season_code_for(day: date) -> str:
    start = day.year if day.month >= 7 else day.year - 1
    return f"{start % 100:02d}{(start + 1) % 100:02d}"


def read_fixtures(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def run(now: datetime | None = None, fixtures_dir: Path = FIXTURES, ledger_path: Path = ledger.LEDGER, skipped_path: Path = ledger.SKIPPED,
        matches: list[Match] | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    matches = matches if matches is not None else load_matches()
    params = load_params()
    records = ledger.read(ledger_path)
    ledger.verify(records)
    done = {ledger.match_key(r) for r in records}
    skipped = {ledger.match_key(r) for r in ledger.read(skipped_path)}
    played = {m.key for m in matches}
    elo = build_elo(matches, params)
    data_sha = hashlib.sha256(MANIFEST.read_bytes()).hexdigest() if MANIFEST.exists() else None
    params_sha = hashlib.sha256(json.dumps(params.as_dict(), sort_keys=True).encode()).hexdigest()
    counts = {"written": 0, "skipped_late": 0, "already": 0}

    for path in sorted(fixtures_dir.glob("*.csv")):
        for r in read_fixtures(path):
            day = parse_date(r["Date"].strip()).date()
            key = (r["Div"], day.isoformat(), r["HomeTeam"].strip(), r["AwayTeam"].strip())
            if key in done or key in played:
                counts["already"] += 1
                continue
            ko = kickoff_utc(day, (r.get("Time") or "").strip() or None)
            book = remove_margin(r.get("B365H", ""), r.get("B365D", ""), r.get("B365A", ""))
            body = {
                "match": {"division": key[0], "date": key[1], "home": key[2], "away": key[3], "kickoff_utc": iso(ko)},
                "model": MODEL,
                "params_sha": params_sha,
                "data_sha": data_sha,
                "published_at": iso(now),
                "book": [round(x, 6) for x in book] if book else None,
            }
            if ko - now < MIN_LEAD:
                if key not in skipped:
                    ledger.append(skipped_path, ledger.read(skipped_path), {**body, "reason": "less than 2 hours before kickoff when first seen"})
                    skipped.add(key)
                counts["skipped_late"] += 1
                continue
            elo.enter_season(key[0], season_code_for(day))
            p = elo.predict(key[0], key[2], key[3])
            ledger.append(ledger_path, records, {**body, "probs": [round(x, 6) for x in p]})
            done.add(key)
            counts["written"] += 1
    return counts


if __name__ == "__main__":
    print(json.dumps(run()))
    sys.exit(0)
