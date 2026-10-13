"""Henter bilannonser (Finn, Blocket, KVD), energipriser og valuta, beregner markedsverdi og
skriver datafilene nettsiden leser.

Bruk:
    python scripts/fetch_data.py --out public/data --cache cache
    python scripts/fetch_data.py --out public/data --cache cache --offline   # bare beregn på nytt
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import kvd  # noqa: E402
import prices  # noqa: E402
import valuation  # noqa: E402
import vend  # noqa: E402

FINN_BASE = {"registration_class": 1, "sales_form": [1, 2, 7]}       # bruktbil, nybil, auksjon (ikke leasing)
BLOCKET_BASE = {"sales_form": 1, "fuel": 4, "year_from": 2016}        # brukte elbiler fra 2016 og nyere
HOME_FYLKER = {"Rogaland", "Vestland"}                                # prioriteres ved henting av detaljsider

FUEL_CODE = {
    "bensin": "B", "diesel": "D", "el": "E", "hybrid bensin": "HB", "hybrid diesel": "HD",
    "plug-in bensin": "PB", "plug-in diesel": "PD", "hydrogen": "H2", "vätgas": "H2",
    "gass+bensin": "B", "etanol (ffv, e85)": "B", "gass (cng)": "B", "fordonsgas (cng)": "B", "hybrid gas": "HB",
}
BODY_CODE = {"SUV/Offroad": "S", "Stasjonsvogn": "V", "Kombi 5-dørs": "K5", "Kombi 3-dørs": "K3", "Sedan": "Se",
             "Flerbruksbil": "F", "Coupe": "C", "Cabriolet": "Ca", "Pickup": "P", "Kasse": "Ka", "Annet": "A"}
SEG_CODE = {"Privat": "P", "Merkeforhandler": "M", "Annet bilutsalg": "A", "Företag": "F", "KVD": "K"}
WD_CODE = {"1": "R", "2": "4", "3": "F", "1729": "F"}
BODY_SV = {"Coupé": "Coupe", "Familjebuss": "Flerbruksbil", "Halvkombi 3-dörrar": "Kombi 3-dørs",
           "Halvkombi 5-dörrar": "Kombi 5-dørs", "Kombi": "Stasjonsvogn", "Skåpbil": "Kasse", "SUV": "SUV/Offroad",
           "Annat": "Annet"}
EQUIP_KEYS = {
    "henger": ("hengerfeste",), "motorvarmer": ("motorvarmer",), "kupevarmer": ("kupévarmer", "kupevarmer", "parkeringsvarmer"),
    "varmepumpe": ("varmepumpe",), "acc": ("adaptiv cruise", "adaptiv fartsholder", "adaptive cruise"),
    "skinn": ("skinn",), "navi": ("navigasjon",), "carplay": ("carplay", "android auto"), "hud": ("head-up", "head up"),
    "glasstak": ("panorama", "glasstak", "soltak"), "setevarme": ("setevarme", "oppvarmede seter", "varme i seter"),
    "rattvarme": ("rattvarme", "oppvarmet ratt"), "ryggekamera": ("ryggekamera", "360"),
}


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def log(*a):
    print(*a, flush=True)


def today() -> str:
    return dt.date.today().isoformat()


def load_json(p: Path, default):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def save_json(p: Path, obj, compact=True):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":") if compact else None), encoding="utf-8")


# ---------------- Normalisering ----------------

def fylke_map(first: dict | None) -> dict[str, str]:
    """Kommune/sted -> fylke fra Finns filtertre."""
    out = {}
    for f in (first or {}).get("filters") or []:
        if f.get("name") != "location":
            continue
        for fy in f.get("filter_items") or []:
            for k in fy.get("filter_items") or []:
                out[k["display_name"].lower()] = fy["display_name"]
                for k2 in k.get("filter_items") or []:
                    out[k2["display_name"].lower()] = fy["display_name"]
    return out


def norm_vend(d: dict, site: str, names: dict, sek: float) -> dict | None:
    pr = (d.get("price") or {}).get("amount") or 0
    cur0 = (d.get("price") or {}).get("currency_code") or "NOK"
    # «1 kr», månedspriser og plassholdere er ikke ekte priser
    if not pr or pr < (15000 if cur0 == "SEK" else 5000):
        return None
    tags = d.get("_tags") or {}
    km = d.get("mileage")
    if km is not None and d.get("mileage_unit") == "SCANDINAVIAN_MILE":
        km *= 10
    body = names.get("body_type", {}).get(tags.get("body_type", ""), "Annet")
    body = BODY_SV.get(body, body)
    fuel = d.get("fuel") or ""
    cur = (d.get("price") or {}).get("currency_code") or "NOK"
    img = (d.get("image") or {}).get("path")
    l = {
        "id": ("b" if site == "blocket" else "") + str(d["id"]),
        "src": site,
        "make": (d.get("make") or "").strip(),
        "model": (d.get("model") or "").strip(),
        "spec": (d.get("model_specification") or "")[:70],
        "year": d.get("year"),
        "km": km,
        "price": int(round(pr * sek)) if cur == "SEK" else int(pr),
        "priceSek": int(pr) if cur == "SEK" else None,
        "fuel": fuel,
        "gear": d.get("transmission") or "",
        "wd": WD_CODE.get(tags.get("wheel_drive", ""), ""),
        "awd": tags.get("wheel_drive") == "2",
        "body": body,
        "loc": d.get("location") or "",
        "lat": (d.get("coordinates") or {}).get("lat"),
        "lon": (d.get("coordinates") or {}).get("lon"),
        "seg": d.get("dealer_segment") or "",
        "org": d.get("organisation_name") or "",
        "orgId": d.get("org_id") or "",
        "wty": d.get("warranty_duration"),
        "range": d.get("driving_range"),
        "img": img,
        "pub": dt.datetime.fromtimestamp(d["timestamp"] / 1000).date().isoformat() if d.get("timestamp") else None,
        "svc": bool(d.get("service_documents")),
        "smooth": "smooth_trade" in (d.get("flags") or []),
        "auction": d.get("sales_form") == 7,
        "newCar": d.get("sales_form") == 2,
        "regno": (d.get("regno") or "").upper().replace(" ", "") or None,
        "url": d.get("canonical_url"),
    }
    if not l["make"] or not l["year"]:
        return None
    return l


def norm_kvd(a: dict, sek: float) -> dict | None:
    x = kvd.normalize(a)
    if not x or not x.get("year") or not x.get("make"):
        return None
    x["price"] = int(round(x["priceSek"] * sek))
    if x.get("valSek"):
        x["kvdVal"] = int(round(x["valSek"] * sek))
    x["wd"] = "4" if x.get("awd") else ""
    x["regno"] = (x.get("regno") or "").upper() or None
    return x


def assign_fylke(listings: list[dict], fmap: dict[str, str]) -> None:
    grid: dict[tuple, Counter] = defaultdict(Counter)
    for l in listings:
        if l["src"] != "finn":
            continue
        fy = fmap.get((l.get("loc") or "").lower())
        if fy:
            l["fylke"] = fy
            if l.get("lat") and l.get("lon"):
                grid[(round(l["lat"] * 5), round(l["lon"] * 5))][fy] += 1
    for l in listings:
        if l["src"] != "finn" or l.get("fylke") or not l.get("lat"):
            continue
        cx, cy = round(l["lat"] * 5), round(l["lon"] * 5)
        best = None
        for r in range(0, 4):
            c = Counter()
            for dx in range(-r, r + 1):
                for dy in range(-r, r + 1):
                    c.update(grid.get((cx + dx, cy + dy), {}))
            if c:
                best = c.most_common(1)[0][0]
                break
        if best:
            l["fylke"] = best


def dedupe(listings: list[dict]) -> list[dict]:
    """Samme bil (regnr) flere steder: behold billigste, noter de andre."""
    by_reg: dict[str, list[dict]] = defaultdict(list)
    out = []
    for l in listings:
        if l.get("regno") and len(l["regno"]) >= 5:
            by_reg[l["regno"]].append(l)
        else:
            out.append(l)
    dup = 0
    for reg, ls in by_reg.items():
        ls.sort(key=lambda x: (x["src"] != "finn", x["price"]))
        keep = ls[0]
        if len(ls) > 1:
            dup += len(ls) - 1
            keep["also"] = [{"src": x["src"], "id": x["id"], "price": x["price"], "url": x.get("url"), "org": x.get("org")} for x in ls[1:4]]
        out.append(keep)
    log(f"  fjernet {dup} duplikater (samme registreringsnummer)")
    return out


# ---------------- Detaljsider ----------------

def pick_details(listings: list[dict], cache: dict, max_n: int) -> list[dict]:
    def prio(l):
        est = l.get("est")
        disc = (est - l["price"]) / est if est else 0
        home = 0.25 if l.get("fylke") in HOME_FYLKER else 0
        reasonable = 0 if 20_000 <= l["price"] <= 1_500_000 else -1
        return disc + home + reasonable
    cand = [l for l in listings if l["src"] == "finn" and l["id"] not in cache]
    cand.sort(key=prio, reverse=True)
    return cand[:max_n]


def equip_keys(equip: list[str]) -> list[str]:
    low = " | ".join(equip).lower()
    return [k for k, words in EQUIP_KEYS.items() if any(w in low for w in words)]


# ---------------- Utdata ----------------

def compact(l: dict, det: dict | None, hist: dict) -> dict:
    """Korte nøkler for å holde listings.json liten."""
    o = {
        "id": l["id"], "s": l["src"][0], "mk": l["make"], "md": l["model"], "y": l["year"],
        "km": l.get("km"), "p": l["price"], "fu": FUEL_CODE.get((l.get("fuel") or "").lower(), "A"),
        "g": "A" if l.get("gear", "").startswith("Auto") else "M", "bo": BODY_CODE.get(l.get("body") or "Annet", "A"),
    }
    img = l.get("img") or None
    raw_id = l["id"].lstrip("b")
    if img and img.startswith(f"item/{raw_id}/"):
        img = img[len(f"item/{raw_id}/"):]   # nettsiden setter sammen stien igjen
    org = l.get("org") or None
    if org and (l.get("seg") == "Privat" or len(org) > 60):
        org = None if l.get("seg") == "Privat" else org[:60]
    opt = {
        "sp": (l.get("spec") or "")[:48] or None, "wd": l.get("wd") or None, "loc": l.get("loc") or None, "fy": l.get("fylke"),
        "la": round(l["lat"], 4) if l.get("lat") else None, "lo": round(l["lon"], 4) if l.get("lon") else None,
        "sg": SEG_CODE.get(l.get("seg"), None), "org": org,
        "w": l.get("wty") or None, "r": l.get("range") or None, "img": img,
        "pub": l.get("pub"), "f": hist.get("f") if hist.get("f") != l.get("pub") else None, "svc": 1 if l.get("svc") else None, "st": 1 if l.get("smooth") else None,
        "auc": 1 if l.get("auction") else None, "new": 1 if l.get("newCar") else None,
        "ps": l.get("priceSek"), "est": l.get("est"), "eno": l.get("estNo"), "sd": l.get("sd"), "n": l.get("n"),
        "dA": l.get("dA"), "dK": l.get("dK"), "also": l.get("also"),
        "url": l.get("url") if l["src"] != "finn" else None,
        "kv": l.get("kvdVal"), "bid": l.get("bidSek"), "end": l.get("ends"),
        "hk": l.get("hk"), "own": l.get("owners"), "cons": l.get("cons"), "co2": l.get("co2"), "col": l.get("color"),
    }
    if len(hist.get("p") or []) > 1:
        opt["ph"] = hist["p"][-6:]
    if det:
        for src_k, dst_k in (("hk", "hk"), ("kg", "kg"), ("color", "col"), ("seats", "se"), ("trailer", "tr"),
                             ("boot", "bt"), ("kwh", "kwh"), ("eu", "eu"), ("reg1", "r1"), ("owners", "own"), ("wltp", "r")):
            if det.get(src_k) is not None and opt.get(dst_k) is None:
                opt[dst_k] = det[src_k]
        if det.get("equip"):
            opt["eq"] = equip_keys(det["equip"])
        opt["det"] = 1
        if det.get("country") and det["country"] != "Norge":
            opt["abroad"] = det["country"]
    o.update({k: v for k, v in opt.items() if v not in (None, "", [], False)})
    return o


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public/data")
    ap.add_argument("--cache", default="cache")
    ap.add_argument("--offline", action="store_true", help="Ikke hent nye annonser, bare beregn på nytt fra cache")
    ap.add_argument("--max-details", type=int, default=600)
    ap.add_argument("--delay", type=float, default=0.7)
    ap.add_argument("--time-budget", type=float, default=95, help="Minutter totalt for innhenting")
    ap.add_argument("--no-blocket", action="store_true")
    ap.add_argument("--no-kvd", action="store_true")
    args = ap.parse_args()
    out, cache = Path(args.out), Path(args.cache)
    out.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    deadline = t0 + args.time_budget * 60
    meta: dict = {"updated": dt.datetime.now(dt.UTC).replace(tzinfo=None).isoformat(timespec="minutes"), "sources": {}}

    log("== Energipriser og valuta")
    pr = prices.all_prices(cache)
    sek = pr["fx"].get("SEK", 1.0)
    log(f"  SEK/NOK {sek}, bensin {pr['fuel'].get('bensin', [[0, 0]])[-1]}, diesel {pr['fuel'].get('diesel', [[0, 0]])[-1]}")

    raw_file = cache / "raw_listings.json"
    prev = load_json(raw_file, {"listings": [], "fmap": {}})
    listings: list[dict] = []
    fmap = prev.get("fmap") or {}

    if args.offline:
        listings = prev["listings"]
        meta["sources"] = load_json(out / "meta.json", {}).get("sources", {})
    else:
        log("== Finn.no")
        c = vend.Crawler("finn", FINN_BASE, delay=args.delay, log=log, deadline=deadline - 25 * 60)
        try:
            docs = c.run()
        except vend.Blocked as e:
            log("  ! Finn blokkerte:", e)
            docs = {}
        if c.first:
            fmap = fylke_map(c.first) or fmap
        finn = [x for x in (norm_vend(d, "finn", c.names, 1.0) for d in docs.values()) if x]
        prev_finn = [l for l in prev["listings"] if l["src"] == "finn"]
        if len(finn) < 0.6 * len(prev_finn) or c.truncated:
            log(f"  ! Finn ga bare {len(finn)} biler (forrige: {len(prev_finn)}) – fyller på med forrige datasett")
            seen = {l["id"] for l in finn}
            finn += [l for l in prev_finn if l["id"] not in seen]
            meta["stale"] = True
        meta["sources"]["finn"] = {"n": len(finn), "requests": c.requests}
        listings += finn

        if not args.no_blocket:
            log("== Blocket.se (elbiler for import)")
            cb = vend.Crawler("blocket", BLOCKET_BASE, delay=args.delay, log=log, deadline=deadline - 15 * 60)
            try:
                bdocs = cb.run()
            except vend.Blocked as e:
                log("  ! Blocket blokkerte:", e)
                bdocs = {}
            bl = [x for x in (norm_vend(d, "blocket", cb.names, sek) for d in bdocs.values()) if x]
            if not bl:
                bl = [l for l in prev["listings"] if l["src"] == "blocket"]
            meta["sources"]["blocket"] = {"n": len(bl), "requests": cb.requests}
            listings += bl

        if not args.no_kvd:
            log("== KVD (Sverige)")
            ks = [x for x in (norm_kvd(a, sek) for a in kvd.fetch_all(log=log)) if x]
            if not ks:
                ks = [l for l in prev["listings"] if l["src"] == "kvd"]
            meta["sources"]["kvd"] = {"n": len(ks)}
            listings += ks
        save_json(raw_file, {"listings": listings, "fmap": fmap})

    # Fjern åpenbart feilprisede annonser (også fra eldre cache)
    listings = [l for l in listings if l["price"] >= 5000 and not (l.get("priceSek") and l["priceSek"] < 15000)]
    log(f"== Beregning ({len(listings)} biler)")
    assign_fylke(listings, fmap)
    listings = dedupe(listings)
    vm = valuation.run(listings, log=log)

    # Detaljsider
    det_file = cache / "details.json"
    details: dict = load_json(det_file, {})
    live_ids = {l["id"] for l in listings}
    details = {k: v for k, v in details.items() if k in live_ids}
    if not args.offline and args.max_details > 0:
        todo = pick_details(listings, details, args.max_details)
        log(f"== Detaljsider: {len(todo)} nye (har {len(details)})")
        got = 0
        for l in todo:
            if time.time() > deadline:
                log("  tidsbudsjett brukt opp")
                break
            try:
                d = vend.ad_details(l["id"])
            except vend.Blocked as e:
                log("  ! blokkert:", e)
                break
            if d:
                d["_d"] = today()
                details[l["id"]] = d
                got += 1
            vend.polite_sleep(args.delay)
        log(f"  hentet {got}")
        save_json(det_file, details)

    # Prishistorikk og første gang sett
    st_file = cache / "state.json"
    state: dict = load_json(st_file, {})
    td = today()
    for l in listings:
        s = state.setdefault(l["id"], {"f": l.get("pub") or td, "p": []})
        if not s["p"] or s["p"][-1][1] != l["price"]:
            s["p"].append([td, l["price"]])
        s["l"] = td
    cutoff = (dt.date.today() - dt.timedelta(days=60)).isoformat()
    state = {k: v for k, v in state.items() if k in live_ids or v.get("l", td) >= cutoff}
    save_json(st_file, state)

    rows = [compact(l, details.get(l["id"]), state.get(l["id"], {})) for l in listings]
    rows.sort(key=lambda r: r["p"])
    save_json(out / "listings.json", rows)
    # Beskrivelse/utstyr lastes først når en bil åpnes
    det_out = {k: {"desc": v.get("desc"), "equip": v.get("equip")} for k, v in details.items() if v.get("desc") or v.get("equip")}
    save_json(out / "details.json", det_out)

    fy_counts = Counter(l.get("fylke") for l in listings if l.get("fylke"))
    market = {
        "prices": pr,
        "valuation": vm,
        "fylker": sorted(fy_counts),
        "counts": {"fylke": dict(fy_counts), "src": dict(Counter(l["src"] for l in listings))},
    }
    save_json(out / "market.json", market)
    meta.update({
        "count": len(rows),
        "withDetails": sum(1 for r in rows if r.get("det")),
        "withEstimate": sum(1 for r in rows if r.get("est") or r.get("eno")),
        "seconds": int(time.time() - t0),
    })
    save_json(out / "meta.json", meta, compact=False)
    log(f"✔ Ferdig: {len(rows)} biler, {meta['withDetails']} med detaljer, {int(time.time() - t0)} s")


if __name__ == "__main__":
    main()
