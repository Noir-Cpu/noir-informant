import unittest

from collector.validate import ValidationError, validate

HEADER = "Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR\n"


def csv(*rows: str) -> str:
    return HEADER + "\n".join(rows) + "\n"


class ValidateResults(unittest.TestCase):
    def test_accepts_valid_and_unplayed_rows(self):
        text = csv("E0,15/08/2026,Arsenal,Chelsea,2,1,H", "E0,22/08/2026,Chelsea,Arsenal,,,")
        self.assertEqual(validate(text, "E0", results=True), 2)

    def test_accepts_two_digit_years_and_bom(self):
        text = "﻿" + csv("E0,15/08/16,Arsenal,Chelsea,1,1,D")
        self.assertEqual(validate(text, "E0", results=True), 1)

    def test_rejects_missing_columns(self):
        with self.assertRaises(ValidationError):
            validate("Div,Date,HomeTeam\nE0,15/08/2026,Arsenal\n", "E0", results=True)

    def test_rejects_result_contradicting_score(self):
        with self.assertRaises(ValidationError):
            validate(csv("E0,15/08/2026,Arsenal,Chelsea,2,1,A"), "E0", results=True)

    def test_rejects_implausible_score(self):
        with self.assertRaises(ValidationError):
            validate(csv("E0,15/08/2026,Arsenal,Chelsea,99,0,H"), "E0", results=True)

    def test_rejects_duplicates(self):
        row = "E0,15/08/2026,Arsenal,Chelsea,2,1,H"
        with self.assertRaises(ValidationError):
            validate(csv(row, row), "E0", results=True)

    def test_rejects_wrong_division(self):
        with self.assertRaises(ValidationError):
            validate(csv("SP1,15/08/2026,Barcelona,Getafe,2,1,H"), "E0", results=True)

    def test_rejects_same_team_twice_and_bad_date(self):
        with self.assertRaises(ValidationError):
            validate(csv("E0,15/08/2026,Arsenal,Arsenal,1,0,H"), "E0", results=True)
        with self.assertRaises(ValidationError):
            validate(csv("E0,2026-08-15,Arsenal,Chelsea,1,0,H"), "E0", results=True)


class ValidateFixtures(unittest.TestCase):
    def test_fixtures_need_no_result_columns(self):
        text = "Div,Date,HomeTeam,AwayTeam\nE0,03/10/2026,Arsenal,Chelsea\n"
        self.assertEqual(validate(text, "E0", results=False), 1)


if __name__ == "__main__":
    unittest.main()
