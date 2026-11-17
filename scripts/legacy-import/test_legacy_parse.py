"""python -I -m unittest discover -s scripts/legacy-import -p "test_*.py"

Cases come from the real Excel. Set LEGACY_XLSX=<path of the file> to also check that every
generated order respects the database constraints (the file itself never goes into git).
"""
import datetime as dt
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_import as bi  # noqa: E402
import legacy_parse as lp  # noqa: E402


class Prescription(unittest.TestCase):
    def test_usual_and_odd_writings(self):
        self.assertEqual(lp.parse_rx("-1.75(-2  a 69)", "OD")[:3], (-1.75, -2.0, 69))
        self.assertEqual(lp.parse_rx("('-0.5 a 55)", "OD")[:3], (0.0, -0.5, 55))
        self.assertEqual(lp.parse_rx("+2.OO", "OG")[:3], (2.0, None, None))
        self.assertEqual(lp.parse_rx("-6/75 (-0.75 A 160", "OD")[:3], (-6.75, -0.75, 160))
        self.assertEqual(lp.parse_rx("-9,5(-1,5 a 35", "OD")[:3], (-9.5, -1.5, 35))
        self.assertEqual(lp.parse_rx("+.50 (-O.50 A 165", "OD")[:3], (0.5, -0.5, 165))
        for plano in ("plan", "PL", "PC", "VN", "VERRE NEUTRE"):
            self.assertEqual(lp.parse_rx(plano, "OG")[:3], (0.0, None, None))

    def test_sphere_written_after_the_cylinder_is_flagged(self):
        sph, cyl, axis, probs = lp.parse_rx("(-1.5 A 10)-2.00", "OD")
        self.assertEqual((sph, cyl, axis), (-2.0, -1.5, 10))
        self.assertTrue(any("après le cylindre" in p for p in probs))

    def test_unreadable_values_stay_out_of_the_database(self):
        self.assertEqual(lp.parse_rx("'-0.50(-2.(2.50 A 170", "OG")[:3], (None, None, None))
        # cylinder without axis / axis 450 / 2.57: the table refuses them -> null (raw kept in legacy)
        self.assertEqual(lp.db_safe_eye(*lp.parse_rx("-4.00(-1.75)", "OG")[:3]), (-4.0, None, None))
        self.assertEqual(lp.db_safe_eye(-1.0, -0.5, 450), (-1.0, None, None))
        self.assertEqual(lp.db_safe_eye(2.57, None, None), (None, None, None))

    def test_add(self):
        self.assertEqual(lp.parse_add("+2.00")[:2], (2.0, 2.0))
        self.assertEqual(lp.parse_add("+225")[:2], (2.25, 2.25))
        self.assertEqual(lp.parse_add("+2.25 , 2.5")[:2], (2.25, 2.5))
        self.assertEqual(lp.parse_add("?")[:2], (None, None))


class MoneyPhoneTreatment(unittest.TestCase):
    def test_money(self):
        self.assertEqual(lp.money("150+80")[0], 230)
        self.assertEqual(lp.money("350   300")[0], 650)
        self.assertEqual(lp.money("6O0")[0], 600)
        self.assertEqual(lp.money("POYE")[0], "PAID")
        self.assertEqual(lp.money("P0YE")[0], "PAID")
        self.assertEqual(lp.money("-")[0], 0)
        self.assertIsNone(lp.money("CW")[0])

    def test_phone(self):
        self.assertEqual(lp.clean_phone(624249207)[0], "+212624249207")
        self.assertEqual(lp.clean_phone("67220 24 30")[0], "+212672202430")
        self.assertIsNone(lp.clean_phone("O6673543363")[0])  # 11 digits
        self.assertIsNone(lp.clean_phone(66454316)[0])  # 8 digits
        self.assertIsNone(lp.clean_phone("PRES")[0])

    def test_treatments(self):
        self.assertEqual(lp.parse_treatment("BLEU CAT")[:2], (None, ["blue_light"]))
        self.assertEqual(lp.parse_treatment("prog ar")[:2], ("progressive", ["anti_reflective"]))
        self.assertEqual(lp.parse_treatment("D F BL")[:2], ("bifocal", ["clear"]))
        self.assertEqual(lp.parse_treatment("PHOX")[1], ["photochromic"])
        self.assertEqual(lp.parse_treatment("les lentilles 3mois")[2], ["Lentilles 3 mois"])
        self.assertEqual(lp.parse_treatment("+2.25")[4], 2.25)


class SamePerson(unittest.TestCase):
    def test_tolerant_on_one_phone(self):
        self.assertTrue(lp.same_person("Maryam Fakrach", "Fagrach Maryam"))
        self.assertTrue(lp.same_person("Hataim", "Azdouz Haitam"))
        self.assertTrue(lp.same_person("Mohamed", "Mohamed Abouban"))
        self.assertFalse(lp.same_person("Rachida Baskar", "Malika Baskal"))
        self.assertFalse(lp.same_person("Saadia Saadi", "Ahmad El Fardi"))

    def test_grouping_rules(self):
        def o(row, name, phone, slip):
            return {"row": row, "name": name, "phone": phone, "slip": slip, "booklet": "",
                    "raw": {"tel": phone or ""}}
        orders = [
            o(1, "Maryam Fakrach", "+212678499442", 10),
            o(2, "Fagrach Maryam", "+212678499442", 11),
            o(3, "Ali Ait Baka", "+212678499442", 12),     # same phone, other person
            o(4, "Fatima", None, 13), o(5, "Fatima", None, 14),  # first name only: never merged
            o(6, "Karim Hanin", None, 15), o(7, "karim  hanin", None, 16),  # full name: merged
            o(8, "", "+212600000001", 17), o(9, "Laila Ziani", "+212600000001", 18),  # unnamed slip first
        ]
        for x in orders:
            x["name"] = lp.clean_name(x["name"])
        clients = bi.group_clients(orders)
        by_row = {x["row"]: x["client"]["key"] for x in orders}
        self.assertEqual(by_row[1], by_row[2])
        self.assertNotEqual(by_row[1], by_row[3])
        self.assertNotEqual(by_row[4], by_row[5])
        self.assertEqual(by_row[6], by_row[7])
        self.assertEqual(by_row[8], by_row[9])
        self.assertEqual(len(clients), 6)
        shared = [c for c in clients if c["shared_phone"]]
        self.assertEqual(len(shared), 2)


class Dates(unittest.TestCase):
    def test_interpolated_between_known_dates_and_bounds(self):
        points = [(0, 100), (0, 200), (0, 300), (0, 400), (1, 10)]
        anchors = {1: dt.date(2022, 1, 1), 3: dt.date(2022, 3, 1)}
        out = lp.estimate_dates(points, anchors, first_day=dt.date(2021, 1, 1), last_day=dt.date(2023, 12, 31))
        self.assertEqual(out[0], (dt.date(2021, 1, 1), False))
        self.assertEqual(out[1], (dt.date(2022, 1, 1), True))
        self.assertEqual(out[2][0], dt.date(2022, 1, 31))  # halfway: 1 Jan + 30 of 59 days
        self.assertEqual(out[4], (dt.date(2023, 12, 31), False))
        self.assertEqual([d for d, _ in out], sorted(d for d, _ in out))


DIOPTER = ("re_sph", "re_cyl", "re_add", "le_sph", "le_cyl", "le_add")


@unittest.skipUnless(os.environ.get("LEGACY_XLSX"), "LEGACY_XLSX not set")
class RealFile(unittest.TestCase):
    def test_every_order_fits_the_tables(self):
        orders, clients, _ = bi.build(os.environ["LEGACY_XLSX"], "prod")
        keys = set()
        for o in orders:
            p = bi.order_payload(o)
            for f in DIOPTER:
                self.assertTrue(lp.valid_diopter(p[f]), (o["row"], f, p[f]))
            for eye in ("re", "le"):
                self.assertEqual(p[f"{eye}_cyl"] in (None, 0), p[f"{eye}_axis"] is None, (o["row"], eye))
            self.assertRegex(p["booklet"], r"^([A-Z]{1,2})?$")
            self.assertGreater(p["slip"], 0)
            self.assertTrue(0 <= p["deposit"] <= p["total"])
            self.assertAlmostEqual(p["deposit"] + p["balance"], p["total"], places=2)
            self.assertTrue(dt.date(2021, 1, 1) <= o["date"] <= dt.date(2023, 12, 31), o["row"])
            k = (p["booklet"], p["slip"])
            self.assertNotIn(k, keys)
            keys.add(k)
        pairs = {(c["phone"], lp.name_key(c["full_name"])) for c in clients if c["phone"]}
        self.assertEqual(len(pairs), sum(1 for c in clients if c["phone"]))
        for c in clients:
            self.assertTrue(c["full_name"].strip())
            if c["phone"]:
                self.assertRegex(c["phone"], r"^\+212[5-7]\d{8}$")


if __name__ == "__main__":
    unittest.main()
