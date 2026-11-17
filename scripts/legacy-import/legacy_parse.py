"""Parsing rules for the optician's Excel history (SPEC §12 "Import historique").

Pure functions only (no file, no database): build_import.py reads the workbook and writes the
SQL batches; test_legacy_parse.py covers the odd values found in the real file.
"""
from __future__ import annotations

import datetime as dt
import difflib
import re

PAID_WORDS = {"POYE", "PYE", "POYR", "P0Y", "P0YE", "PAYE", "PAYÉ"}
NUM = r"[+-]?\d+(?:\.\d+)?"


def s(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def q25(x: float) -> bool:
    return abs(x * 4 - round(x * 4)) < 1e-9


def valid_diopter(x) -> bool:
    """Same rule as public.is_valid_diopter: −30..+30, steps of 0.25."""
    return x is None or (-30 <= x <= 30 and q25(x))


# ---------------------------------------------------------------------------- names / phones
def clean_name(v) -> str:
    t = s(v)
    if not t:
        return ""
    t = re.sub(r"^0(?=[A-Za-z])", "O", t)  # 0UMAIMA -> OUMAIMA
    t = re.sub(r"\s+", " ", t).strip(" .-'")
    return " ".join(w.upper() if re.fullmatch(r"[A-Za-z]\.?", w) else w.capitalize() for w in t.split(" "))


def name_key(name: str) -> str:
    """Same as private.name_key: lower case, single spaces."""
    return re.sub(r"\s+", " ", (name or "").strip()).lower()


def clean_phone(v):
    """-> (e164 or None, problem). 9 digits starting 5-7 -> +212…; letter O typed for 0."""
    t = s(v)
    if not t:
        return None, ""
    d = re.sub(r"\D", "", t.upper().replace("O", "0"))
    if not d:
        return None, f"téléphone illisible « {t} »"
    if len(d) == 10 and d[0] == "0" and d[1] in "567":
        d = d[1:]
    if len(d) == 9 and d[0] in "567":
        return "+212" + d, ""
    return None, f"téléphone invalide « {t} » ({len(d)} chiffres)"


STOP = {"el", "al", "ben", "ait", "abd", "bent", "ou", "id", "lalla", "f", "z"}


def tokens(name: str) -> list[str]:
    return [t for t in re.findall(r"[a-z]+", name.lower()) if t not in STOP and len(t) >= 3]


def _tok_eq(x: str, y: str) -> bool:
    return x == y or difflib.SequenceMatcher(None, x, y).ratio() >= 0.65


def same_person(a: str, b: str) -> bool:
    """Same phone: same person when every word of the shorter name is in the longer one,
    in any order, small spelling differences allowed ("Fakrach"/"Fagrach", "Hataim"/"Haitam")."""
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return True
    short, long_ = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    return all(any(_tok_eq(x, y) for y in long_) for x in short)


# ---------------------------------------------------------------------------- money
def money(v):
    """-> (value | "PAID" | None, problem). '150+80' and '350   300' are sums; O typed for 0."""
    t = s(v)
    if not t:
        return None, ""
    up = t.upper().replace(" ", "")
    if up in PAID_WORDS or up.startswith("P0Y") or up.startswith("POY"):
        return "PAID", ""
    if t == "-":
        return 0.0, ""
    t2 = re.sub(r"(?<=\d)O|O(?=\d)", "0", t.upper()).rstrip("A")
    parts = re.findall(r"\d+(?:[.,]\d+)?", t2)
    if not parts or re.search(r"[A-Z]", t2):
        return None, f"montant illisible « {t} »"
    val = sum(float(p.replace(",", ".")) for p in parts)
    return val, (f"« {t} » additionné = {val:g}" if len(parts) > 1 else "")


# ---------------------------------------------------------------------------- prescription
def parse_rx(v, eye: str):
    """'-1.75(-2 a 69)' -> (sph, cyl, axis, problems). 'plan' / 'PL' / 'PC' / 'VN' = 0."""
    probs: list[str] = []
    if v is None or s(v) == "":
        return None, None, None, probs
    if isinstance(v, (int, float)):
        return float(v), None, None, probs
    t = s(v).upper()
    t = t.replace(",", ".").replace(";", ".").replace("'", "").replace('"', "").replace("°", "0")
    t = re.sub(r"(?<=\d)/(?=\d)", ".", t)  # -6/75 -> -6.75
    t = re.sub(r"(?<=[\d.+\-( ])O+|O+(?=[\d.])", lambda m: "0" * len(m.group()), t)  # 2.OO -> 2.00
    t = re.sub(r"\.{2,}", ".", t)  # -4..00
    t = re.sub(r"(?<=[+\-])\s+(?=[\d.])", "", t)  # - 1.25
    t = re.sub(r"(?<=\d)\s+(?=\.\d)|(?<=\d\.)\s+(?=\d)", "", t)  # -0 .5 / -1. 00
    t = re.sub(r"(?<![\d])\.(?=\d)", "0.", t)  # +.50
    t = re.sub(r"\bA\s+A\b", "A", t)
    t = re.sub(r"^[^\dA-Z(+\-]+|[^\d)A-Z]+$", "", t)  # leading ';', trailing '²', '=', '('
    t = re.sub(r"\s+", " ", t).strip()
    if t in ("PLAN", "PL", "PLA", "PC", "PLANO", "0", "VN", "VERRE N", "VERRE NEUTRE", "VERRENEUTRE"):
        return 0.0, None, None, probs
    m = re.fullmatch(r"(PLAN|PL)\s*PRISME\s*(\d+)\s*D\s*(B[NTIS])", t)
    if m:
        probs.append(f"{eye}: plan + prisme {m.group(2)}Δ {m.group(3)}")
        return 0.0, None, None, probs
    t = re.sub(rf"^({NUM})\)", r"\1(", t)  # -1.00)-2.50 A 175)
    after = re.fullmatch(rf"\(\s*({NUM})\s*A\s*(\d{{1,3}})\s*\)\s*({NUM})", t)  # (CYL A AXE)SPH
    if after:
        cyl, axis, sph = after.groups()
        probs.append(f"{eye}: SPH écrit après le cylindre « {s(v)} » (lu SPH {float(sph):g})")
        t = f"{sph}({cyl} A {axis})"
    if "(" not in t and re.fullmatch(rf"{NUM}\s*A\s*\d{{1,3}}\s*\)?", t):  # '-0.50 A 90 )'
        t = "(" + t
    m = re.fullmatch(rf"(?:(PLAN|PL|PC)|({NUM}))?\s*(?:\(\s*({NUM})\s*(?:A\s*)?(\d{{1,3}})?\s*\)?)?", t)
    if not m or not any(m.groups()):
        probs.append(f"{eye}: format non reconnu « {s(v)} »")
        return None, None, None, probs
    plano, sph, cyl, axis = m.groups()
    sph = 0.0 if plano else (float(sph) if sph else (0.0 if cyl else None))
    cyl = float(cyl) if cyl else None
    axis = int(axis) if axis else None
    if cyl == 0:
        cyl, axis = None, None
    if sph is not None and not valid_diopter(sph):
        probs.append(f"{eye}: SPH {sph:g} hors pas 0.25 / plage")
    if cyl is not None and not valid_diopter(cyl):
        probs.append(f"{eye}: CYL {cyl:g} hors pas 0.25 / plage")
    if cyl is not None and axis is None:
        probs.append(f"{eye}: cylindre sans axe « {s(v)} »")
    if axis is not None and not (0 <= axis <= 180):
        probs.append(f"{eye}: axe {axis} hors 0..180")
    return sph, cyl, axis, probs


def db_safe_eye(sph, cyl, axis):
    """What the orders table accepts: invalid SPH -> null; CYL without a valid axis (or invalid
    CYL) -> CYL and axis null. The original text stays in orders.legacy."""
    if not valid_diopter(sph):
        sph = None
    if cyl is None or not valid_diopter(cyl) or axis is None or not (0 <= axis <= 180):
        cyl, axis = None, None
    return sph, cyl, axis


def parse_add(v):
    """-> (re_add, le_add, problem). '+2.25 , 2.5' = OD 2.25 / OG 2.5; '+225' = 2.25."""
    t = s(v).replace("'", "").replace('"', "")
    if not t or t == "0":
        return None, None, ""
    two = re.fullmatch(r"\+?\s*(\d+(?:[.,]\d+)?)\s*[, +]\s*\+?\s*(\d+(?:[.,]\d+)?)", t)
    if two and "." in t:
        a, b = (float(x.replace(",", ".")) for x in two.groups())
        return a, b, f"deux ADD « {s(v)} » → OD {a:g} / OG {b:g}"
    m = re.fullmatch(r"\+?\s*(\d+(?:\.\d+)?)", t.replace(",", "."))
    if not m:
        return None, None, f"ADD illisible « {s(v)} »"
    x = float(m.group(1))
    if 100 <= x <= 400 and q25(x / 100):
        return x / 100, x / 100, f"ADD « {s(v)} » lu {x / 100:g}"
    if not q25(x) or x > 6:
        return None, None, f"ADD {x:g} invalide"
    if x > 4:
        return x, x, f"ADD {x:g} inhabituelle (> 4)"
    return x, x, ""


# ---------------------------------------------------------------------------- treatments
TREAT_RULES = [
    ("blue_light", r"BL[EAU]{1,3}T?\s*C?A?T{0,2}|BLWU|BLUE|BLCAT|\bBC\b"),
    ("anti_reflective", r"\bAR\b|\bAE\b|ARBLEU|\bAR(?=\+)"),
    ("photochromic", r"PGX|\bPG\b|PHG|PH0X|PHOX|PHOTOG|PG(?=\+|$)"),
    ("clear", r"\bBL\b"),
    ("tinted", r"SOLAIRE"),
]


def parse_treatment(v):
    """-> (lens_type_code | None, treatment codes, lens details, problems, ADD typed here | None).
    AR = anti-reflet, BL = blanc, BLEU CAT = lumière bleue, PGX/PHOX = photochromique,
    PROG = progressif, DF = double foyer, LENTILLE = lentilles (détail)."""
    raw = s(v)
    t = re.sub(r"\s+", " ", " " + re.sub(r"[+_\-]", " ", raw.upper()) + " ")
    lens_type, treats, details, probs = None, [], [], []
    if re.search(r"PRO|POG", t):
        lens_type = "progressive"
    if re.search(r"\bD ?F\b|DOUBLE FOYER|DFBL", t):
        lens_type = "bifocal"
    t_bl = t.replace("DFBL", "DF BL")
    for code, rx in TREAT_RULES:
        if re.search(rx, t_bl):
            if code == "clear" and "blue_light" in treats and not re.search(
                r"\bBL\b(?!\s*(?:CAT|EU|AU|UE))", re.sub(r"BL[EAU]{1,3}T?\s*C?A?T{0,2}", "", t_bl)
            ):
                continue
            treats.append(code)
    if re.search(r"LEN", t):
        m = re.search(r"(\d)\s*MOIS", t)
        details.append("Lentilles" + (f" {m.group(1)} mois" if m else "") + (" couleur" if "COUL" in t else ""))
    elif re.search(r"\d\s*MOIS", t):
        details.append("Lentilles " + re.search(r"(\d)\s*MOIS", t).group(1) + " mois")
    if "ORGAN" in t:
        details.append("Organique")
    if "MIN" in t and "LEN" not in t:
        details.append("Minéral")
    m = re.search(r"1[.,]\d{2}", raw)
    if m:
        details.append("Indice " + m.group(0).replace(",", "."))
    if re.fullmatch(r"\s*\+?\d+(?:[.,]\d+)?\s*", raw):
        probs.append(f"traitement « {raw} » ressemble à une ADD")
        return None, [], [], probs, float(raw.replace(",", "."))
    if raw and not (lens_type or treats or details):
        probs.append(f"traitement non reconnu « {raw} »")
    return lens_type, sorted(set(treats)), details, probs, None


# ---------------------------------------------------------------------------- dates
def estimate_dates(points, anchors, first_day=None, last_day=None):
    """points: [(booklet_order, slip)] in sheet order; anchors: {index: date} for the rows that
    carry a date. Dates of the other rows are interpolated on the slip number between the two
    nearest anchors (slips follow time). Before the first / after the last anchor they are
    interpolated towards first_day (first slip) / last_day (last slip) when given, else
    extrapolated at the average pace. Returns a list of (date, exact: bool)."""
    seq = []  # running slip number across booklets so carnet B follows carnet A
    offset, last = 0, None
    for booklet_order, slip in points:
        if slip is None:
            seq.append(None)
            continue
        if last is not None and booklet_order > last[0]:
            offset = last[1] + offset
        seq.append(offset + slip)
        last = (booklet_order, slip)
    known = sorted({(seq[i], d) for i, d in anchors.items() if seq[i] is not None}, key=lambda x: x[0])
    # keep anchors that go forward in time
    clean = []
    for x, d in known:
        if not clean or (x > clean[-1][0] and d >= clean[-1][1]):
            clean.append((x, d))
    xs = [x for x in seq if x is not None]
    if clean and first_day and xs and min(xs) < clean[0][0] and first_day <= clean[0][1]:
        clean.insert(0, (min(xs), first_day))
    if clean and last_day and xs and max(xs) > clean[-1][0] and last_day >= clean[-1][1]:
        clean.append((max(xs), last_day))
    if len(clean) >= 2:
        span_days = (clean[-1][1] - clean[0][1]).days
        pace = (clean[-1][0] - clean[0][0]) / span_days if span_days else 1.0
    else:
        pace = 1.0
    out = []
    for i, x in enumerate(seq):
        if i in anchors:
            out.append((anchors[i], True))
            continue
        if x is None or not clean:
            out.append((None, False))
            continue
        if x <= clean[0][0]:
            d = clean[0][1] - dt.timedelta(days=round((clean[0][0] - x) / pace))
        elif x >= clean[-1][0]:
            d = clean[-1][1] + dt.timedelta(days=round((x - clean[-1][0]) / pace))
        else:
            for (x1, d1), (x2, d2) in zip(clean, clean[1:]):
                if x1 <= x <= x2:
                    d = d1 + dt.timedelta(days=round((x - x1) / (x2 - x1) * (d2 - d1).days))
                    break
        out.append((d, False))
    return out
