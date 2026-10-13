"""Bilauksjoner fra KVD (kvd.se, Sverige) via det åpne søke-API-et nettsiden bruker.

KVD driver ikke lenger bilauksjoner i Norge, men den svenske siden selger ~1 000+ personbiler
med forbruk, CO2, antall eiere og KVDs egen markedsvurdering – nyttig for import.
"""
from __future__ import annotations

import time

import requests

API = "https://api.kvd.se/v1/auction/search"
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept": "application/json",
}
FUEL = {"Bensin": "Bensin", "Diesel": "Diesel", "El": "El", "Electric": "El", "Elhybrid": "Hybrid bensin",
        "Laddhybrid": "Plug-in Bensin", "Miljöbränsle/Hybrid": "Hybrid bensin", "Etanol": "Bensin", "Gas": "Bensin"}
BODY = {"Wagon": "Stasjonsvogn", "Sedan": "Sedan", "SUV": "SUV/Offroad", "Hatchback": "Kombi 5-dørs", "Coupe": "Coupe",
        "Convertible": "Cabriolet", "MPV": "Flerbruksbil", "Minibus": "Flerbruksbil", "Pickup": "Pickup", "Van": "Kasse"}


def fetch_all(log=print, delay: float = 0.6) -> list[dict]:
    out, offset, total = [], 0, None
    s = requests.Session()
    s.headers.update(UA)
    while total is None or offset < total:
        try:
            r = s.get(API, params={"limit": 50, "offset": offset}, timeout=40)
            r.raise_for_status()
            js = r.json()
        except (requests.RequestException, ValueError) as e:
            log(f"  ! KVD: {e}")
            break
        total = int(js.get("total") or 0)
        batch = js.get("auctions") or []
        if not batch:
            break
        out += batch
        offset += len(batch)
        time.sleep(delay)
    log(f"  kvd: {len(out)} auksjoner (alle kjøretøy)")
    return out


def normalize(a: dict) -> dict | None:
    po = a.get("processObject") or {}
    if (po.get("vehicleType") or po.get("objectType")) != "CAR":
        return None
    p = po.get("properties") or {}
    base = po.get("baseObject") or {}
    fuels = p.get("fuels") or []
    f0 = fuels[0] if fuels else {}
    fuel_code = f0.get("fuelCode") or ""
    if len(fuels) > 1:
        codes = {x.get("fuelCode") for x in fuels}
        fuel = "Plug-in Bensin" if "El" in codes or "Electric" in codes else "Hybrid bensin"
    else:
        fuel = FUEL.get(fuel_code, fuel_code or "Bensin")
    if a.get("state") not in (None, "OPEN", "PREPARING", "PUBLISHED"):
        return None
    # Pris: høyeste av ledende bud og KVDs forventede sluttpris, ellers kjøp-nå-pris
    hb = ((a.get("activeAuction") or {}).get("highestBid") or {}).get("amount")
    exp = a.get("preliminaryPrice")
    price = max(hb or 0, exp or 0) or a.get("buyNowAmount") or po.get("buyNowAmount")
    val = (po.get("statisticalValuation") or {}).get("marketPrice")
    if not price:
        price = val
    if not price:
        return None
    km = p.get("odometerReading") or base.get("odometerReading")
    if (p.get("odometerUnit") or "km") in ("mil", "SCANDINAVIAN_MILE") and km:
        km *= 10
    return {
        "id": f"k{a['id']}",
        "src": "kvd",
        "make": p.get("brand") or po.get("brand"),
        "model": (p.get("familyName") or po.get("familyName") or "").strip(),
        "spec": (p.get("heading2") or p.get("modelName") or "")[:70],
        "year": int(p.get("modelYear") or base.get("year") or 0) or None,
        "km": km,
        "priceSek": int(price),
        "valSek": int(val) if val else None,
        "fuel": fuel,
        "gear": "Automat" if (p.get("gearbox") or "").lower().startswith("auto") else "Manuell",
        "body": BODY.get(p.get("body") or "", "Annet"),
        "hk": f0.get("enginePower") or None,
        "cons": f0.get("consumption") or None,     # l/100 km eller kWh/100 km (WLTP/NEDC)
        "co2": f0.get("co2") or None,
        "owners": p.get("numberOfPreviousOwners"),
        "color": p.get("exteriorColor"),
        "regno": p.get("registrationPlate"),
        "url": a.get("auctionUrl"),
        "auction": a.get("auctionType") != "BUY_NOW" and not po.get("isFixedPrice"),
        "bidSek": hb,
        "buyNow": a.get("buyNowAmount") if a.get("buyNowAvailable") else None,
        "ends": (a.get("activeAuction") or {}).get("preliminaryCloseAt") or a.get("countdownStartAt"),
        "state": a.get("state"),
        "pub": a.get("publishedAt"),
        "img": (a.get("previewImage") or {}).get("uri") if isinstance(a.get("previewImage"), dict) else a.get("previewImage"),
        "loc": "Sverige",
        "lat": 59.33, "lon": 18.06,
        "seg": "KVD",
        "awd": "4motion" in (p.get("modelName") or "").lower() or "awd" in (p.get("modelName") or "").lower()
               or "quattro" in (p.get("modelName") or "").lower() or "xdrive" in (p.get("modelName") or "").lower(),
    }
