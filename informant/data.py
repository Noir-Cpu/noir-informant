"""Load played matches from the committed season files."""

import csv
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from collector.validate import parse_date

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "data" / "results"
OUTCOMES = ("H", "D", "A")


@dataclass(frozen=True)
class Match:
    division: str
    season: str  # "1617"
    date: date
    time: str | None
    home: str
    away: str
    result: str  # H, D or A
    hg: int
    ag: int
    book: tuple[float, float, float] | None  # bookmaker H/D/A probabilities, margin removed

    @property
    def key(self) -> tuple[str, str, str, str]:
        return (self.division, self.date.isoformat(), self.home, self.away)


def remove_margin(h: str, d: str, a: str) -> tuple[float, float, float] | None:
    """Proportional margin removal from decimal odds. Returns None when odds are missing."""
    try:
        odds = [float(h), float(d), float(a)]
    except (TypeError, ValueError):
        return None
    if any(o <= 1.0 for o in odds):
        return None
    inv = [1.0 / o for o in odds]
    total = sum(inv)
    return (inv[0] / total, inv[1] / total, inv[2] / total)


def load_matches(root: Path = RESULTS) -> list[Match]:
    matches: list[Match] = []
    for path in sorted(root.glob("*/*.csv")):
        season = path.stem
        with path.open(encoding="utf-8", newline="") as f:
            for r in csv.DictReader(f):
                if not (r.get("FTR") or "").strip():
                    continue  # not yet played
                matches.append(
                    Match(
                        division=r["Div"],
                        season=season,
                        date=parse_date(r["Date"].strip()).date(),
                        time=(r.get("Time") or "").strip() or None,
                        home=r["HomeTeam"].strip(),
                        away=r["AwayTeam"].strip(),
                        result=r["FTR"].strip(),
                        hg=int(r["FTHG"]),
                        ag=int(r["FTAG"]),
                        book=remove_margin(r.get("B365H", ""), r.get("B365D", ""), r.get("B365A", "")),
                    )
                )
    matches.sort(key=lambda m: (m.date, m.time or "", m.division, m.home))
    return matches
