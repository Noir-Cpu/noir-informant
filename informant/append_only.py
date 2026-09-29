"""Fail if the ledger at HEAD is not an append-only extension of the ledger at HEAD~1.

A hash chain alone cannot catch someone rebuilding the whole chain after editing an old record;
comparing against the previous commit does. Run in CI with fetch-depth >= 2.
"""

import subprocess
import sys

from informant.ledger import LEDGER, ROOT


def previous(path: str) -> list[str] | None:
    out = subprocess.run(["git", "show", f"HEAD~1:{path}"], cwd=ROOT, capture_output=True, text=True)
    return out.stdout.splitlines() if out.returncode == 0 else None


def check(old: list[str], new: list[str]) -> str | None:
    if len(new) < len(old):
        return f"ledger shrank from {len(old)} to {len(new)} records"
    for i, line in enumerate(old):
        if new[i] != line:
            return f"record {i} was modified"
    return None


if __name__ == "__main__":
    rel = str(LEDGER.relative_to(ROOT))
    old = previous(rel)
    if old is None:
        print("no previous ledger to compare with; skipping")
        sys.exit(0)
    new = LEDGER.read_text(encoding="utf-8").splitlines()
    problem = check(old, new)
    if problem:
        print(f"LEDGER NOT APPEND-ONLY: {problem}")
        sys.exit(1)
    print(f"ledger append-only ok: {len(old)} -> {len(new)} records")
