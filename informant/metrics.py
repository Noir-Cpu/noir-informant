"""Scoring rules for three-way (H, D, A) probability forecasts. Lower is better for all but the reliability table."""

import math
import random

OUTCOME_INDEX = {"H": 0, "D": 1, "A": 2}


def onehot(result: str) -> tuple[int, int, int]:
    i = OUTCOME_INDEX[result]
    return tuple(1 if j == i else 0 for j in range(3))  # type: ignore[return-value]


def rps(p: tuple[float, float, float], result: str) -> float:
    """Ranked probability score over the ordered outcomes H, D, A."""
    o = onehot(result)
    c1 = p[0] - o[0]
    c2 = (p[0] + p[1]) - (o[0] + o[1])
    return 0.5 * (c1 * c1 + c2 * c2)


def log_loss(p: tuple[float, float, float], result: str) -> float:
    return -math.log(max(p[OUTCOME_INDEX[result]], 1e-12))


def brier(p: tuple[float, float, float], result: str) -> float:
    o = onehot(result)
    return sum((p[i] - o[i]) ** 2 for i in range(3))


def reliability(forecasts: list[tuple[tuple[float, float, float], str]], bins: int = 10) -> tuple[list[dict], float]:
    """Pool all three class probabilities into bins. Returns (table, expected calibration error)."""
    edges = [i / bins for i in range(bins + 1)]
    acc = [{"n": 0, "p": 0.0, "hit": 0} for _ in range(bins)]
    for p, result in forecasts:
        o = onehot(result)
        for k in range(3):
            b = min(int(p[k] * bins), bins - 1)
            acc[b]["n"] += 1
            acc[b]["p"] += p[k]
            acc[b]["hit"] += o[k]
    total = sum(a["n"] for a in acc)
    table, ece = [], 0.0
    for i, a in enumerate(acc):
        if a["n"] == 0:
            continue
        mean_p, freq = a["p"] / a["n"], a["hit"] / a["n"]
        ece += abs(mean_p - freq) * a["n"] / total
        table.append({"lo": edges[i], "hi": edges[i + 1], "n": a["n"], "mean_p": round(mean_p, 4), "freq": round(freq, 4)})
    return table, ece


def paired_bootstrap(diffs: list[float], resamples: int = 2000, seed: int = 7) -> tuple[float, float, float]:
    """Mean of paired differences with a 95% percentile bootstrap interval."""
    rng = random.Random(seed)
    n = len(diffs)
    mean = sum(diffs) / n
    means = sorted(sum(diffs[rng.randrange(n)] for _ in range(n)) / n for _ in range(resamples))
    return mean, means[int(0.025 * resamples)], means[int(0.975 * resamples) - 1]
