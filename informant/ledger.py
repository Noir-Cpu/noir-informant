"""Append-only, hash-chained prediction ledger. Each record commits to the previous one, so an edit or deletion
anywhere in the file breaks every later hash. Records are published by committing to a public git repository."""

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / "predictions" / "ledger.jsonl"
SKIPPED = ROOT / "predictions" / "skipped.jsonl"
GENESIS = "0" * 64


def canonical(record: dict) -> str:
    return json.dumps(record, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def record_hash(record: dict) -> str:
    body = {k: v for k, v in record.items() if k != "hash"}
    return hashlib.sha256(canonical(body).encode("utf-8")).hexdigest()


def read(path: Path = LEDGER) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def match_key(rec: dict) -> tuple[str, str, str, str]:
    m = rec["match"]
    return (m["division"], m["date"], m["home"], m["away"])


def verify(records: list[dict]) -> None:
    """Raise ValueError at the first record that breaks the chain."""
    prev = GENESIS
    seen: set[tuple] = set()
    for i, rec in enumerate(records):
        if rec.get("seq") != i:
            raise ValueError(f"record {i}: seq is {rec.get('seq')}")
        if rec.get("prev") != prev:
            raise ValueError(f"record {i}: prev hash does not match previous record")
        if rec.get("hash") != record_hash(rec):
            raise ValueError(f"record {i}: hash does not match content")
        key = match_key(rec)
        if key in seen:
            raise ValueError(f"record {i}: duplicate prediction for {key}")
        seen.add(key)
        prev = rec["hash"]


def head(records: list[dict]) -> str:
    return records[-1]["hash"] if records else GENESIS


def append(path: Path, records: list[dict], new: dict) -> dict:
    """Seal `new` (adds seq, prev, hash) and append it as one line."""
    sealed = {**new, "seq": len(records), "prev": head(records)}
    sealed["hash"] = record_hash(sealed)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(canonical(sealed) + "\n")
    records.append(sealed)
    return sealed
