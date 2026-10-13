"""Dagens energipriser og valutakurser (gratis, åpne kilder).

- Bensin 95 og diesel: SSB tabell 09654 (gjennomsnittlig pumpepris per måned, kr/l)
- Strøm: spotpris per prisområde fra hvakosterstrommen.no (kr/kWh eks. mva, time for time)
- Valuta: Norges Bank (SEK/NOK og EUR/NOK)
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

import requests

UA = {"User-Agent": "bilscreener (privat prosjekt)"}
ZONES = ["NO1", "NO2", "NO3", "NO4", "NO5"]
ZONE_NAMES = {"NO1": "Øst (Oslo)", "NO2": "Sør (Stavanger/Kristiansand)", "NO3": "Midt (Trondheim)", "NO4": "Nord (Tromsø)", "NO5": "Vest (Bergen)"}


def fuel_prices(months: int = 36) -> dict:
    """{'bensin': [[YYYY-MM, kr/l], ...], 'diesel': [...]}"""
    q = {
        "query": [
            {"code": "PetroleumProd", "selection": {"filter": "item", "values": ["031", "035"]}},
            {"code": "Tid", "selection": {"filter": "top", "values": [str(months)]}},
        ],
        "response": {"format": "json-stat2"},
    }
    r = requests.post("https://data.ssb.no/api/v0/no/table/09654", json=q, headers=UA, timeout=40)
    r.raise_for_status()
    js = r.json()
    times = list(js["dimension"]["Tid"]["category"]["index"].keys())
    times.sort(key=lambda t: js["dimension"]["Tid"]["category"]["index"][t])
    prods = js["dimension"]["PetroleumProd"]["category"]["index"]
    vals = js["value"]
    nt = len(times)
    out = {"bensin": [], "diesel": []}
    for code, key in (("031", "bensin"), ("035", "diesel")):
        p = prods[code]
        for i, t in enumerate(times):
            v = vals[p * nt + i]
            if v is not None:
                out[key].append([t.replace("M", "-"), round(float(v), 2)])
    return out


def power_day(zone: str, day: dt.date) -> float | None:
    url = f"https://www.hvakosterstrommen.no/api/v1/prices/{day.year}/{day:%m-%d}_{zone}.json"
    try:
        r = requests.get(url, headers=UA, timeout=20)
        if r.status_code != 200:
            return None
        xs = [x["NOK_per_kWh"] for x in r.json()]
        return round(sum(xs) / len(xs), 4) if xs else None
    except (requests.RequestException, ValueError, KeyError):
        return None


def power_prices(cache_file: Path, days: int = 400) -> dict:
    """Døgnsnitt spotpris per sone. Lagrer historikk i cache slik at hver dag bare hentes én gang."""
    hist: dict[str, dict[str, float]] = {}
    if cache_file.exists():
        try:
            hist = json.loads(cache_file.read_text(encoding="utf-8"))
        except ValueError:
            hist = {}
    today = dt.date.today()
    for z in ZONES:
        h = hist.setdefault(z, {})
        # Første gang: hent siste 45 dager. Deretter bare manglende dager (maks 60 per kjøring).
        fetched = 0
        for back in range(0, 45 if not h else days):
            d = today - dt.timedelta(days=back)
            k = d.isoformat()
            if k in h:
                if back > 2:
                    break
                continue
            v = power_day(z, d)
            if v is not None:
                h[k] = v
            fetched += 1
            if fetched >= 60:
                break
        # behold maks `days` dager
        for k in sorted(h)[:-days]:
            del h[k]
    cache_file.write_text(json.dumps(hist), encoding="utf-8")
    out = {}
    for z, h in hist.items():
        ks = sorted(h)
        last30 = [h[k] for k in ks[-30:]]
        # månedssnitt for graf
        months: dict[str, list[float]] = {}
        for k in ks:
            months.setdefault(k[:7], []).append(h[k])
        out[z] = {
            "name": ZONE_NAMES[z],
            "avg30": round(sum(last30) / len(last30), 3) if last30 else None,
            "avg7": round(sum(h[k] for k in ks[-7:]) / max(1, len(ks[-7:])), 3) if ks else None,
            "monthly": [[m, round(sum(v) / len(v), 3)] for m, v in sorted(months.items())],
        }
    return out


def fx() -> dict:
    out = {}
    for cur in ("SEK", "EUR"):
        try:
            r = requests.get(
                f"https://data.norges-bank.no/api/data/EXR/B.{cur}.NOK.SP",
                params={"format": "sdmx-json", "lastNObservations": 1},
                headers=UA, timeout=30,
            )
            js = r.json()
            ds = js["data"]["dataSets"][0]["series"]
            s = next(iter(ds.values()))
            obs = s["observations"]
            v = float(next(iter(obs.values()))[0])
            # SEK noteres per 100 SEK hos Norges Bank
            attrs = js["data"]["structure"]["attributes"]["series"]
            unit_mult = 0
            for i, a in enumerate(attrs):
                if a["id"] == "UNIT_MULT":
                    unit_mult = int(a["values"][s["attributes"][i]]["id"])
            out[cur] = round(v / (10 ** unit_mult), 5)
        except Exception as e:  # noqa: BLE001
            print("  ! valuta", cur, e)
    out.setdefault("SEK", 1.0)
    out.setdefault("EUR", 11.5)
    return out


def all_prices(cache_dir: Path) -> dict:
    out: dict = {"updated": dt.datetime.now(dt.UTC).replace(tzinfo=None).isoformat(timespec="minutes")}
    try:
        out["fuel"] = fuel_prices()
    except Exception as e:  # noqa: BLE001
        print("  ! SSB drivstoff:", e)
        out["fuel"] = {}
    try:
        out["power"] = power_prices(cache_dir / "power_hist.json")
    except Exception as e:  # noqa: BLE001
        print("  ! strøm:", e)
        out["power"] = {}
    out["fx"] = fx()
    return out


if __name__ == "__main__":
    import sys
    p = all_prices(Path(sys.argv[1] if len(sys.argv) > 1 else "."))
    print(json.dumps({**p, "power": {z: {k: v for k, v in d.items() if k != "monthly"} for z, d in p["power"].items()}}, indent=1, ensure_ascii=False)[:2000])
