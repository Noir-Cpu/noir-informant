"""Schema and range checks for football-data.co.uk CSVs. Raise ValidationError; never repair silently."""

import csv
import io
from datetime import datetime

REQUIRED = ["Div", "Date", "HomeTeam", "AwayTeam"]
RESULT_COLUMNS = ["FTHG", "FTAG", "FTR"]
MAX_GOALS = 20


class ValidationError(Exception):
    pass


def parse_date(value: str) -> datetime:
    for fmt in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            pass
    raise ValidationError(f"unparseable date {value!r}")


def read_rows(text: str) -> list[dict[str, str]]:
    # The site serves a UTF-8 BOM; utf-8-sig decoding upstream removes it, but tolerate a stray one.
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    rows = [r for r in reader if any((v or "").strip() for v in r.values())]
    if reader.fieldnames is None:
        raise ValidationError("empty file")
    return rows


def validate(text: str, division: str, *, results: bool) -> int:
    """Return the number of valid rows. `results` is True for season files, False for fixtures."""
    rows = read_rows(text)
    if not rows:
        raise ValidationError("no rows")
    cols = set(rows[0].keys())
    needed = REQUIRED + (RESULT_COLUMNS if results else [])
    missing = [c for c in needed if c not in cols]
    if missing:
        raise ValidationError(f"missing columns {missing}")

    seen: set[tuple[str, str, str]] = set()
    kept = 0
    for i, r in enumerate(rows, start=2):
        if not (r["Div"] or "").strip():
            continue  # trailing blank-ish line
        if not results and r["Div"] != division:
            continue  # fixtures.csv covers many leagues
        if r["Div"] != division:
            raise ValidationError(f"line {i}: division {r['Div']!r} != {division!r}")
        home, away = r["HomeTeam"].strip(), r["AwayTeam"].strip()
        if not home or not away or home == away:
            raise ValidationError(f"line {i}: bad teams {home!r} v {away!r}")
        date = parse_date(r["Date"].strip())
        key = (date.date().isoformat(), home, away)
        if key in seen:
            raise ValidationError(f"line {i}: duplicate match {key}")
        seen.add(key)

        if results:
            hg, ag, ftr = r["FTHG"].strip(), r["FTAG"].strip(), r["FTR"].strip()
            if hg == "" and ag == "" and ftr == "":
                pass  # scheduled, not yet played
            else:
                try:
                    h, a = int(hg), int(ag)
                except ValueError:
                    raise ValidationError(f"line {i}: non-integer score {hg!r}-{ag!r}")
                if not (0 <= h <= MAX_GOALS and 0 <= a <= MAX_GOALS):
                    raise ValidationError(f"line {i}: implausible score {h}-{a}")
                expected = "H" if h > a else "A" if a > h else "D"
                if ftr != expected:
                    raise ValidationError(f"line {i}: result {ftr!r} contradicts score {h}-{a}")
        kept += 1
    if kept == 0:
        raise ValidationError(f"no rows for division {division}")
    return kept
