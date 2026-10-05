"""Download results and fixtures from football-data.co.uk, validate them, and update data/ + manifest.json.

A file is only replaced if it validates and does not shrink; otherwise the run fails and the old file stays.
"""

import hashlib
import json
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from collector.validate import ValidationError, validate

BASE = "https://www.football-data.co.uk"
LEAGUES = {"E0": "Premier League", "SP1": "La Liga"}
FIRST_SEASON_START = 2016  # 2016/17
ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
MANIFEST = DATA / "manifest.json"
LAST_CHECKED = DATA / "last_checked.json"


def season_code(start_year: int) -> str:
    return f"{start_year % 100:02d}{(start_year + 1) % 100:02d}"


def current_season_start(now: datetime) -> int:
    return now.year if now.month >= 7 else now.year - 1


def fetch(url: str, attempts: int = 3) -> str:
    last: Exception | None = None
    for n in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "noir-informant/0.1 (+https://github.com/Noir-Cpu/noir-informant)"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode("utf-8-sig")
        except Exception as err:  # noqa: BLE001
            last = err
            time.sleep(2 * (n + 1))
    raise RuntimeError(f"fetch failed for {url}: {last}")


def row_count(path: Path) -> int:
    return max(0, len(path.read_text(encoding="utf-8").splitlines()) - 1) if path.exists() else 0


def update_file(dest: Path, text: str, division: str, *, results: bool, manifest: dict, now: str) -> str:
    rows = validate(text, division, results=results)
    if dest.exists() and rows < row_count(dest) and results:
        raise ValidationError(f"{dest.name}: new file has fewer rows ({rows}) than stored ({row_count(dest)})")
    text = text.replace("\r\n", "\n")
    old = dest.read_text(encoding="utf-8") if dest.exists() else None
    status = "unchanged"
    if old != text:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text, encoding="utf-8")
        status = "created" if old is None else "updated"
        manifest[str(dest.relative_to(DATA))] = {
            "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "rows": rows,
            "fetched_at": now,
        }
    return status


def main() -> int:
    now = datetime.now(timezone.utc)
    stamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    current = current_season_start(now)
    failures = 0

    for division, name in LEAGUES.items():
        for start in range(FIRST_SEASON_START, current + 1):
            code = season_code(start)
            # Past seasons never change once fetched; only refetch the current one.
            dest = DATA / "results" / division / f"{code}.csv"
            if start < current and dest.exists():
                continue
            url = f"{BASE}/mmz4281/{code}/{division}.csv"
            try:
                status = update_file(dest, fetch(url), division, results=True, manifest=manifest, now=stamp)
                print(f"{name} {code}: {status}")
            except (ValidationError, RuntimeError) as err:
                failures += 1
                print(f"::error::{name} {code}: {err}", file=sys.stderr)

    try:
        text = fetch(f"{BASE}/fixtures.csv")
        # Keep only our leagues' rows so the stored file is small and the diff is meaningful.
        lines = text.splitlines()
        header, body = lines[0], lines[1:]
        for division, name in LEAGUES.items():
            kept = [header] + [ln for ln in body if ln.startswith(f"{division},")]
            if len(kept) == 1:
                print(f"{name} fixtures: none listed")
                continue
            dest = DATA / "fixtures" / f"{division}.csv"
            status = update_file(dest, "\n".join(kept) + "\n", division, results=False, manifest=manifest, now=stamp)
            print(f"{name} fixtures: {status}")
    except (ValidationError, RuntimeError) as err:
        failures += 1
        print(f"::error::fixtures: {err}", file=sys.stderr)

    MANIFEST.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    # The manifest only records when a file last CHANGED. Freshness checks need when we last looked,
    # so a quiet stretch with no new matches is not mistaken for a dead collector. Written only on a clean run.
    if not failures:
        LAST_CHECKED.write_text(json.dumps({"checked_at": stamp}, indent=2) + "\n")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
