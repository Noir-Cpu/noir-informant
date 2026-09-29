"""Verify the prediction ledger: python -m informant.verify. Exit code 1 if the chain is broken."""

import sys

from informant import ledger

if __name__ == "__main__":
    records = ledger.read()
    try:
        ledger.verify(records)
    except ValueError as err:
        print(f"LEDGER INVALID: {err}")
        sys.exit(1)
    print(f"ledger ok: {len(records)} predictions, head {ledger.head(records)}")
