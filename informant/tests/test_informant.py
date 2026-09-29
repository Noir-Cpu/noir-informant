import json
import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path

from informant import ledger
from informant.data import Match, remove_margin
from informant.elo import Elo, HomePrior, Params, probs_from_diff
from informant.metrics import brier, log_loss, reliability, rps
from informant import predict

P = Params()


def match(home="A", away="B", result="H", hg=1, ag=0, season="2627", day=date(2026, 8, 15)):
    return Match("E0", season, day, None, home, away, result, hg, ag, None)


class Metrics(unittest.TestCase):
    def test_rps_perfect_and_worst(self):
        self.assertAlmostEqual(rps((1, 0, 0), "H"), 0.0)
        self.assertAlmostEqual(rps((0, 0, 1), "H"), 1.0)  # farthest outcome on the ordered scale

    def test_rps_penalises_far_misses_more_than_near_misses(self):
        self.assertLess(rps((0, 1, 0), "H"), rps((0, 0, 1), "H"))

    def test_log_loss_and_brier(self):
        self.assertAlmostEqual(log_loss((0.5, 0.25, 0.25), "H"), 0.6931, places=3)
        self.assertAlmostEqual(brier((1, 0, 0), "H"), 0.0)

    def test_reliability_perfectly_calibrated_has_low_ece(self):
        f = [((0.5, 0.3, 0.2), "H")] * 5 + [((0.5, 0.3, 0.2), "D")] * 3 + [((0.5, 0.3, 0.2), "A")] * 2
        _, ece = reliability(f)
        self.assertAlmostEqual(ece, 0.0, places=6)


class Model(unittest.TestCase):
    def test_probabilities_sum_to_one_and_are_valid(self):
        for diff in (-800, -100, 0, 100, 800):
            p = probs_from_diff(diff, 0.6)
            self.assertAlmostEqual(sum(p), 1.0)
            self.assertTrue(all(0 <= x <= 1 for x in p))

    def test_stronger_home_side_is_favoured(self):
        self.assertGreater(probs_from_diff(200, 0.55)[0], probs_from_diff(0, 0.55)[0])

    def test_winner_gains_exactly_what_loser_loses(self):
        elo = Elo(P)
        elo.update(match())
        self.assertAlmostEqual(elo.ratings[("E0", "A")] + elo.ratings[("E0", "B")], 2 * P.newcomer)
        self.assertGreater(elo.ratings[("E0", "A")], P.newcomer)

    def test_prediction_does_not_use_the_match_being_predicted(self):
        elo = Elo(P)
        before = elo.predict("E0", "A", "B")
        elo.update(match())
        self.assertEqual(before, Elo(P).predict("E0", "A", "B"))

    def test_home_prior_is_smoothed(self):
        h = HomePrior()
        self.assertAlmostEqual(sum(h.predict("E0")), 1.0)
        h.update(match())
        self.assertGreater(h.predict("E0")[0], h.predict("SP1")[0])

    def test_margin_removal(self):
        p = remove_margin("2.0", "3.5", "4.0")
        self.assertAlmostEqual(sum(p), 1.0)
        self.assertIsNone(remove_margin("", "3", "3"))


class Ledger(unittest.TestCase):
    def make(self, n=3):
        d = Path(tempfile.mkdtemp())
        path, recs = d / "l.jsonl", []
        for i in range(n):
            ledger.append(path, recs, {"match": {"division": "E0", "date": "2026-10-0%d" % (i + 1), "home": "A", "away": "B"}, "probs": [0.4, 0.3, 0.3]})
        return path, recs

    def test_valid_chain_verifies(self):
        _, recs = self.make()
        ledger.verify(recs)

    def test_editing_a_record_is_detected(self):
        path, _ = self.make()
        lines = path.read_text().splitlines()
        rec = json.loads(lines[1])
        rec["probs"] = [0.9, 0.05, 0.05]
        lines[1] = json.dumps(rec)
        path.write_text("\n".join(lines) + "\n")
        with self.assertRaises(ValueError):
            ledger.verify(ledger.read(path))

    def test_deleting_a_record_is_detected(self):
        path, _ = self.make()
        lines = path.read_text().splitlines()
        path.write_text("\n".join([lines[0], lines[2]]) + "\n")
        with self.assertRaises(ValueError):
            ledger.verify(ledger.read(path))


class Predict(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        (self.dir / "fx").mkdir()
        self.ledger, self.skipped = self.dir / "ledger.jsonl", self.dir / "skipped.jsonl"

    def fixtures(self, rows):
        (self.dir / "fx" / "E0.csv").write_text("Div,Date,Time,HomeTeam,AwayTeam,B365H,B365D,B365A\n" + "\n".join(rows) + "\n")

    def run_at(self, now):
        return predict.run(now=now, fixtures_dir=self.dir / "fx", ledger_path=self.ledger, skipped_path=self.skipped, matches=[match()])

    def test_writes_when_at_least_two_hours_before_kickoff(self):
        self.fixtures(["E0,03/10/2026,15:00,A,B,2.0,3.5,4.0"])
        c = self.run_at(datetime(2026, 10, 3, 10, 0, tzinfo=timezone.utc))
        self.assertEqual(c["written"], 1)
        rec = ledger.read(self.ledger)[0]
        self.assertAlmostEqual(sum(rec["probs"]), 1.0, places=5)
        self.assertEqual(rec["match"]["kickoff_utc"], "2026-10-03T14:00:00Z")  # 15:00 BST

    def test_never_writes_inside_the_two_hour_window(self):
        self.fixtures(["E0,03/10/2026,15:00,A,B,2.0,3.5,4.0"])
        c = self.run_at(datetime(2026, 10, 3, 12, 30, tzinfo=timezone.utc))  # 90 minutes before
        self.assertEqual((c["written"], c["skipped_late"]), (0, 1))
        self.assertFalse(self.ledger.exists())
        self.assertEqual(len(ledger.read(self.skipped)), 1)

    def test_is_idempotent_and_never_rewrites(self):
        self.fixtures(["E0,03/10/2026,15:00,A,B,2.0,3.5,4.0"])
        self.run_at(datetime(2026, 10, 3, 8, 0, tzinfo=timezone.utc))
        first = self.ledger.read_text()
        c = self.run_at(datetime(2026, 10, 3, 9, 0, tzinfo=timezone.utc))
        self.assertEqual(c["written"], 0)
        self.assertEqual(self.ledger.read_text(), first)

    def test_skips_matches_already_played(self):
        self.fixtures(["E0,15/08/2026,15:00,A,B,2.0,3.5,4.0"])  # same key as the played match
        c = self.run_at(datetime(2026, 8, 14, 8, 0, tzinfo=timezone.utc))
        self.assertEqual(c["written"], 0)


if __name__ == "__main__":
    unittest.main()


class AppendOnly(unittest.TestCase):
    def test_detects_edit_and_shrink_but_allows_growth(self):
        from informant.append_only import check
        self.assertIsNone(check(["a", "b"], ["a", "b", "c"]))
        self.assertIsNotNone(check(["a", "b"], ["a", "x", "c"]))
        self.assertIsNotNone(check(["a", "b"], ["a"]))
