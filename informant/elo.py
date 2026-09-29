"""Elo ratings with an ordered-logit map from rating difference to home/draw/away probabilities."""

import math
from dataclasses import dataclass, asdict

from informant.data import Match

LN10_OVER_400 = math.log(10) / 400


@dataclass(frozen=True)
class Params:
    k: float = 20.0          # update size
    home_adv: float = 70.0   # rating points added to the home side
    draw_c: float = 0.55     # draw threshold of the ordered logit (bigger = more draws)
    regress: float = 0.25    # share of the gap to the league mean lost at each season start
    newcomer: float = 1450.0 # rating for a team never seen in this league

    def as_dict(self) -> dict:
        return asdict(self)


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def probs_from_diff(diff: float, draw_c: float) -> tuple[float, float, float]:
    """Ordered logit: diff is (home rating + home advantage) - away rating."""
    a = LN10_OVER_400 * diff
    p_home = _sigmoid(a - draw_c)
    p_away = _sigmoid(-a - draw_c)
    return (p_home, 1.0 - p_home - p_away, p_away)


def goal_multiplier(goal_diff: int) -> float:
    g = abs(goal_diff)
    if g <= 1:
        return 1.0
    if g == 2:
        return 1.5
    return (11 + g) / 8


class Elo:
    def __init__(self, params: Params):
        self.p = params
        self.ratings: dict[tuple[str, str], float] = {}  # (division, team) -> rating
        self.season: dict[str, str] = {}                 # division -> current season code

    def _rating(self, division: str, team: str) -> float:
        return self.ratings.get((division, team), self.p.newcomer)

    def predict(self, division: str, home: str, away: str) -> tuple[float, float, float]:
        diff = self._rating(division, home) + self.p.home_adv - self._rating(division, away)
        return probs_from_diff(diff, self.p.draw_c)

    def _start_season(self, division: str, season: str) -> None:
        teams = [(d, t) for (d, t) in self.ratings if d == division]
        if teams:
            mean = sum(self.ratings[k] for k in teams) / len(teams)
            for k in teams:
                self.ratings[k] += (mean - self.ratings[k]) * self.p.regress
        self.season[division] = season

    def update(self, m: Match) -> None:
        """Call after predicting m. Handles the season boundary before the first match of a new season."""
        if self.season.get(m.division) != m.season:
            self._start_season(m.division, m.season)
        ph, pd, _pa = self.predict(m.division, m.home, m.away)
        expected = ph + 0.5 * pd
        actual = {"H": 1.0, "D": 0.5, "A": 0.0}[m.result]
        delta = self.p.k * goal_multiplier(m.hg - m.ag) * (actual - expected)
        self.ratings[(m.division, m.home)] = self._rating(m.division, m.home) + delta
        self.ratings[(m.division, m.away)] = self._rating(m.division, m.away) - delta

    def enter_season(self, division: str, season: str) -> None:
        """Apply the season-start regression without a match (used before predicting a new season's first fixture)."""
        if self.season.get(division) != season:
            self._start_season(division, season)


class HomePrior:
    """Running H/D/A frequencies per division with add-one smoothing. Knows nothing about teams."""

    def __init__(self):
        self.counts: dict[str, list[int]] = {}

    def predict(self, division: str) -> tuple[float, float, float]:
        c = self.counts.get(division, [0, 0, 0])
        n = sum(c) + 3
        return ((c[0] + 1) / n, (c[1] + 1) / n, (c[2] + 1) / n)

    def update(self, m: Match) -> None:
        self.counts.setdefault(m.division, [0, 0, 0])["HDA".index(m.result)] += 1
