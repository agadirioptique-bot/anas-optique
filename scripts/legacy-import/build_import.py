"""Build the SQL batches that import the optician's Excel history (SPEC §12 "Import historique").

    python -I scripts/legacy-import/build_import.py <file.xlsx> <out_dir> --target prod|dev

Writes, in <out_dir> (keep it out of git, e.g. _import/):
  legacy_<target>_01.sql … : `select public.import_legacy_batch(<json>)`, ~500 orders each
  legacy_<target>_99_finish.sql : `select public.finish_legacy_import()` (loyalty, history store put away)
  legacy_<target>_00_check.sql : read-only counts to run before / after
  rapport_import_<target>.xlsx : clients (merges, shared phones) and orders with anomalies

Every SQL file starts with a guard: --target prod stops on the DEV database (test stores TSA/TSB
exist), --target dev stops anywhere else. --target dev also anonymises names and phones
(patients' data never goes to DEV), keeping the same grouping.

Rules (decided with the optician, 2026-11-17):
  * one history store "Historique" (HIS); carnet A -> booklet '', carnet B -> 'B',
    a slip number seen twice in a carnet -> booklet 'D' ('E'…) for the next ones;
  * same phone + same person (case, spacing, word order, small typos ignored) = same client;
    different people on one phone = separate clients with the same phone;
  * no phone: merged only when the full name (2 words or more) is identical;
  * status delivered; RESTE not marked POYE is considered paid (original kept in legacy);
  * missing dates estimated on the slip number between the dates written in the sheet.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import os
import sys

import openpyxl

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import legacy_parse as lp  # noqa: E402

BATCH = 500
STORE = {"name": "Historique", "prefix": "HIS"}
GUARD = {
    "prod": (
        "do $$ begin if exists (select 1 from public.stores where prefix in ('TSA', 'TSB')) then "
        "raise exception 'STOP : fichier PROD, mais cette base est DEV. Rien n''a été modifié.'; end if; end $$;"
    ),
    "dev": (
        "do $$ begin if not (exists (select 1 from public.stores where prefix = 'TSA') "
        "and exists (select 1 from public.stores where prefix = 'TSB')) then "
        "raise exception 'STOP : fichier DEV (données anonymisées), mais cette base n''est pas DEV. Rien n''a été modifié.'; end if; end $$;"
    ),
}


def read_rows(path):
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    return list(ws.iter_rows(min_row=2, values_only=True))


def parse_orders(raw_rows):
    """Excel rows -> order dicts (no client grouping yet)."""
    orders, skipped = [], []
    booklet, prev_slip = "A", None
    for idx, r in enumerate(raw_rows):
        xl_row = idx + 2
        r = (list(r) + [None] * 11)[:11]
        date_v, name_v, slip_v, phone_v, od, og, add_v, tr_v, prix_v, av_v, re_v = r
        slip_txt = lp.s(slip_v)
        slip = int("".join(ch for ch in slip_txt if ch.isdigit())) if any(ch.isdigit() for ch in slip_txt) else None
        if slip is not None and prev_slip is not None and prev_slip >= 4000 and slip <= 10:
            booklet = "B"  # the sheet restarts at 1 after 4040: new carnet
        if slip is not None:
            prev_slip = slip
        values = (name_v, phone_v, od, og, add_v, tr_v, prix_v, av_v, re_v)
        if not any(lp.s(v) for v in values):
            continue
        name = lp.clean_name(name_v)
        phone, p_phone = lp.clean_phone(phone_v)
        if slip is None:
            skipped.append({"row": xl_row, "reason": "pas de N° de bon", "raw": [lp.s(v) for v in r]})
            continue
        probs = [p_phone] if p_phone else []
        if slip_txt != str(slip):
            probs.append(f"N° bon « {slip_txt} » lu {slip}")
        if not name:
            probs.append("pas de nom")
        re_sph, re_cyl, re_axis, p1 = lp.parse_rx(od, "OD")
        le_sph, le_cyl, le_axis, p2 = lp.parse_rx(og, "OG")
        probs += p1 + p2
        re_add, le_add, p3 = lp.parse_add(add_v)
        if p3:
            probs.append(p3)
        lens_type, treats, details, p4, add_from_tr = lp.parse_treatment(tr_v)
        probs += p4
        if add_from_tr is not None and re_add is None and lp.valid_diopter(add_from_tr):
            re_add = le_add = add_from_tr
        if lp.s(add_v) and re_add is None and any(c.isalpha() for c in lp.s(add_v)) and lp.s(add_v) != "?":
            _, tr2, _, _, _ = lp.parse_treatment(add_v)
            treats = sorted(set(treats) | set(tr2))
            probs = [x for x in probs if not x.startswith("ADD illisible")] + [f"« {lp.s(add_v)} » était dans la colonne ADD"]
        for x in p1 + p2:
            if "prisme" in x:
                details.append("Prisme " + x.split("prisme ", 1)[1])
        for eye_raw, label in ((od, "OD"), (og, "OG")):
            if lp.s(eye_raw).upper().startswith(("VN", "VERRE")):
                details.append(f"Verre neutre {label}")
        if lens_type is None:
            lens_type = "single_vision"
        prix, pp = lp.money(prix_v)
        av, pa = lp.money(av_v)
        rest, pr = lp.money(re_v)
        probs += [x for x in (pp, pa, pr) if x]
        if prix == "PAID":
            prix = None
        paid_word = rest == "PAID"
        if av == "PAID":
            av = prix
        total = round(prix or 0.0, 2)
        deposit = round(min(max(av or 0.0, 0.0), total), 2)
        if av is not None and av > total + 0.01:
            probs.append(f"avance {av:g} > prix {total:g}")
        if prix is None:
            probs.append("pas de prix")
        rsph, rcyl, raxis = lp.db_safe_eye(re_sph, re_cyl, re_axis)
        lsph, lcyl, laxis = lp.db_safe_eye(le_sph, le_cyl, le_axis)
        orders.append({
            "row": xl_row, "carnet": booklet, "slip": slip, "date": date_v.date() if isinstance(date_v, dt.datetime) else None,
            "name": name, "phone": phone,
            "re_sph": rsph, "re_cyl": rcyl, "re_axis": raxis,
            "le_sph": lsph, "le_cyl": lcyl, "le_axis": laxis,
            "re_add": re_add if lp.valid_diopter(re_add) else None,
            "le_add": le_add if lp.valid_diopter(le_add) else None,
            "lens_type": lens_type, "treatments": treats, "details": details,
            "total": total, "deposit": deposit, "balance": round(total - deposit, 2),
            "reste_origine": "POYE" if paid_word else (round(rest, 2) if isinstance(rest, float) else None),
            "problems": probs,
            "raw": {"nom": lp.s(name_v), "tel": lp.s(phone_v), "od": lp.s(od), "og": lp.s(og), "add": lp.s(add_v),
                    "traitement": lp.s(tr_v), "prix": lp.s(prix_v), "avance": lp.s(av_v), "reste": lp.s(re_v)},
        })
    return orders, skipped


def assign_booklets(orders):
    seen = collections.Counter()
    for o in orders:
        base = "" if o["carnet"] == "A" else "B"
        n = seen[(o["carnet"], o["slip"])]
        seen[(o["carnet"], o["slip"])] += 1
        o["booklet"] = base if n == 0 else "DEFGH"[n - 1]
        if n:
            o["problems"].append(f"N° bon {o['slip']} déjà utilisé dans le carnet {o['carnet']} → livret {o['booklet']}")


FIRST_DAY = dt.date(2021, 1, 1)   # the file covers 2021-2023 (SPEC §12)
LAST_DAY = dt.date(2023, 12, 31)


def assign_dates(orders):
    order_of = {"A": 0, "B": 1}
    anchors = {i: o["date"] for i, o in enumerate(orders) if o["date"]}
    est = lp.estimate_dates([(order_of[o["carnet"]], o["slip"]) for o in orders], anchors,
                            first_day=FIRST_DAY, last_day=LAST_DAY)
    for o, (d, exact) in zip(orders, est):
        o["date"], o["date_exact"] = d, exact


def group_clients(orders):
    """Returns clients [{key, full_name, phone, orders: [...], variants}] and sets o['client']."""
    clusters = []  # each: {"phone", "names": [], "orders": []}
    by_phone = collections.defaultdict(list)
    no_phone_named = {}
    for o in orders:
        if o["phone"]:
            groups = by_phone[o["phone"]]
            target = None
            if o["name"]:
                # a group with no name yet (unnamed slip first) is taken by the first named one
                target = next((g for g in groups if not g["names"] or any(lp.same_person(n, o["name"]) for n in g["names"])), None)
            elif len(groups) == 1:
                target = groups[0]
            if target is None:
                target = {"phone": o["phone"], "names": [], "orders": []}
                groups.append(target)
                clusters.append(target)
            if o["name"]:
                target["names"].append(o["name"])
            target["orders"].append(o)
        elif o["name"] and len(o["name"].split()) >= 2:
            k = lp.name_key(o["name"])
            if k not in no_phone_named:
                no_phone_named[k] = {"phone": None, "names": [], "orders": []}
                clusters.append(no_phone_named[k])
            no_phone_named[k]["names"].append(o["name"])
            no_phone_named[k]["orders"].append(o)
        else:
            clusters.append({"phone": None, "names": [o["name"]] if o["name"] else [], "orders": [o]})
    # Unnamed orders that joined a phone group before any name: still fine (names may come later).
    clients = []
    for i, c in enumerate(sorted(clusters, key=lambda c: c["orders"][0]["row"]), start=1):
        counts = collections.Counter(c["names"])
        best = max(counts, key=lambda n: (counts[n], len(n.split()), len(n))) if counts else ""
        first = c["orders"][0]
        full_name = best or f"Sans nom (bon {first['slip']})"
        slips = ", ".join(f"{o['booklet'] + '-' if o['booklet'] else ''}{o['slip']}" for o in c["orders"])
        variants = sorted(set(c["names"]) - {best})
        bad_phones = sorted({o["raw"]["tel"] for o in c["orders"] if o["raw"]["tel"] and not o["phone"]})
        notes = f"Importé du fichier Excel · bons {slips}"
        if variants:
            notes += " · Autres écritures : " + ", ".join(variants)
        if bad_phones:
            notes += " · Téléphone d'origine illisible : " + ", ".join(bad_phones)
        client = {"key": f"C{i:05d}", "full_name": full_name, "phone": c["phone"], "variants": variants,
                  "notes": notes[:500], "orders": c["orders"]}
        for o in c["orders"]:
            o["client"] = client
        clients.append(client)
    # shared phones: report only
    phones = collections.Counter(c["phone"] for c in clients if c["phone"])
    for c in clients:
        c["shared_phone"] = bool(c["phone"] and phones[c["phone"]] > 1)
    return clients


def anonymise(clients):
    fake = {}
    for c in clients:
        if c["phone"] and c["phone"] not in fake:
            fake[c["phone"]] = f"+2126{len(fake) + 10000000:08d}"
    for i, c in enumerate(clients, start=1):
        c["full_name"] = f"Client {i:04d}"
        c["phone"] = fake.get(c["phone"])
        c["notes"] = "Import historique (données anonymisées pour DEV)"
        c["variants"] = []
        for o in c["orders"]:
            o["raw"] = {k: v for k, v in o["raw"].items() if k not in ("nom", "tel")}


def order_payload(o):
    when = dt.datetime.combine(o["date"], dt.time(12, 0), tzinfo=dt.timezone(dt.timedelta(hours=1)))
    return {
        "key": f"R{o['row']}", "client_key": o["client"]["key"], "booklet": o["booklet"], "slip": o["slip"],
        "created_at": when.isoformat(),
        "re_sph": o["re_sph"], "re_cyl": o["re_cyl"], "re_axis": o["re_axis"], "re_add": o["re_add"],
        "le_sph": o["le_sph"], "le_cyl": o["le_cyl"], "le_axis": o["le_axis"], "le_add": o["le_add"],
        "lens_type_code": o["lens_type"], "treatment_codes": o["treatments"], "lens_details": "; ".join(o["details"]),
        "total": o["total"], "deposit": o["deposit"], "balance": o["balance"],
        "legacy": {
            "row": o["row"], "carnet": o["carnet"], "date_exact": o["date_exact"],
            "reste_origine": o["reste_origine"], "raw": o["raw"], "anomalies": o["problems"],
        },
    }


def client_payload(c):
    return {"key": c["key"], "full_name": c["full_name"], "phone": c["phone"],
            "has_whatsapp": c["phone"] is not None, "notes": c["notes"]}


def write_sql(out_dir, target, orders, clients):
    paths = []
    guard = GUARD[target]
    for b, start in enumerate(range(0, len(orders), BATCH), start=1):
        chunk = orders[start:start + BATCH]
        keys = []
        for o in chunk:
            if o["client"]["key"] not in keys:
                keys.append(o["client"]["key"])
        by_key = {c["key"]: c for c in clients}
        payload = {"store": STORE, "clients": [client_payload(by_key[k]) for k in keys],
                   "orders": [order_payload(o) for o in chunk]}
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        assert "$json$" not in body
        path = os.path.join(out_dir, f"legacy_{target}_{b:02d}.sql")
        with open(path, "w", encoding="utf-8") as f:
            f.write(f"-- Import historique {target.upper()} · lot {b} · commandes {start + 1}-{start + len(chunk)} / {len(orders)}\n")
            f.write(guard + "\n")
            f.write(f"select public.import_legacy_batch($json${body}$json$::jsonb);\n")
        paths.append(path)
    finish = os.path.join(out_dir, f"legacy_{target}_99_finish.sql")
    with open(finish, "w", encoding="utf-8") as f:
        f.write(f"-- Import historique {target.upper()} · fin (fidélité, succursale Historique désactivée)\n")
        f.write(guard + "\n")
        f.write(f"select public.finish_legacy_import('{STORE['prefix']}');\n")
    check = os.path.join(out_dir, f"legacy_{target}_00_check.sql")
    with open(check, "w", encoding="utf-8") as f:
        f.write("-- Lecture seule : à lancer avant et après l'import.\n")
        f.write(
            "select\n"
            "  (select count(*) from public.clients) as clients,\n"
            "  (select count(*) from public.clients where legacy_key is not null) as clients_importes,\n"
            "  (select count(*) from public.clients where phone_e164 is null) as clients_sans_tel,\n"
            "  (select count(*) from public.orders where source = 'legacy') as commandes_historique,\n"
            f"  {len(orders)} as commandes_attendues,\n"
            f"  {len(clients)} as clients_attendus,\n"
            "  (select coalesce(sum(total), 0) from public.orders where source = 'legacy') as total_dh,\n"
            f"  {round(sum(o['total'] for o in orders), 2)} as total_attendu_dh,\n"
            "  (select count(*) from public.clients where is_loyal) as clients_fideles,\n"
            "  (select is_active from public.stores where prefix = 'HIS') as succursale_his_active;\n"
        )
    return paths + [finish, check]


def write_report(out_dir, target, orders, clients, skipped):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Clients"
    ws.append(["Clé", "Nom", "Téléphone", "Nb commandes", "Bons", "Autres écritures", "Téléphone partagé"])
    for c in clients:
        ws.append([c["key"], c["full_name"], c["phone"], len(c["orders"]),
                   ", ".join(f"{o['booklet'] + '-' if o['booklet'] else ''}{o['slip']}" for o in c["orders"]),
                   ", ".join(c["variants"]), "OUI" if c["shared_phone"] else ""])
    ws2 = wb.create_sheet("Commandes à vérifier")
    ws2.append(["Ligne Excel", "N° (HIS-…)", "Client", "Date", "Date exacte", "Anomalies"])
    for o in orders:
        if o["problems"]:
            ws2.append([o["row"], f"{o['booklet'] + '-' if o['booklet'] else ''}{o['slip']}", o["client"]["full_name"],
                        o["date"], "oui" if o["date_exact"] else "estimée", "; ".join(o["problems"])])
    ws3 = wb.create_sheet("Lignes ignorées")
    ws3.append(["Ligne Excel", "Raison", "Valeurs"])
    for sk in skipped:
        ws3.append([sk["row"], sk["reason"], " | ".join(x for x in sk["raw"] if x)])
    path = os.path.join(out_dir, f"rapport_import_{target}.xlsx")
    wb.save(path)
    return path


def build(xlsx, target):
    orders, skipped = parse_orders(read_rows(xlsx))
    assign_booklets(orders)
    assign_dates(orders)
    clients = group_clients(orders)
    if target == "dev":
        anonymise(clients)
    return orders, clients, skipped


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    ap.add_argument("out_dir")
    ap.add_argument("--target", choices=["prod", "dev"], required=True)
    a = ap.parse_args()
    os.makedirs(a.out_dir, exist_ok=True)
    orders, clients, skipped = build(a.xlsx, a.target)
    files = write_sql(a.out_dir, a.target, orders, clients)
    report = write_report(a.out_dir, a.target, orders, clients, skipped)
    dates = [o["date"] for o in orders]
    print(f"commandes: {len(orders)} · clients: {len(clients)} "
          f"(sans téléphone: {sum(1 for c in clients if not c['phone'])}, "
          f"téléphone partagé: {sum(1 for c in clients if c['shared_phone'])}) · lignes ignorées: {len(skipped)}")
    print(f"dates: {min(dates)} → {max(dates)} · exactes: {sum(1 for o in orders if o['date_exact'])}")
    print(f"total: {round(sum(o['total'] for o in orders), 2)} DH · commandes avec anomalies: {sum(1 for o in orders if o['problems'])}")
    for f in files + [report]:
        print("  ", f)


if __name__ == "__main__":
    main()
