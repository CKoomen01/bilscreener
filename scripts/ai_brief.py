"""Lager «Dagens AI-oppsummering» med Gemini etter hver datainnhenting.

Bruker miljøvariabelen GEMINI_API_KEY (GitHub-secret). Hopper stille over hvis den mangler
eller Gemini feiler – nettsiden fungerer uansett.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import time
from pathlib import Path

import requests

API = "https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent"
MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-flash-latest", "gemini-3.5-flash", "gemini-2.5-flash"]
HOME = {"Rogaland", "Vestland"}


def url(x):
    return x.get("url") or f"https://www.finn.no/mobility/item/{x['id']}"


def short(x, **extra):
    return {"id": x["id"], "bil": f"{x['mk']} {x['md']} {x.get('sp', '')}".strip(), "aar": x["y"], "km": x.get("km"),
            "pris": x["p"], "sted": x.get("loc"), "lenke": url(x), **extra}


def candidates(rows: list[dict]) -> dict:
    def disc(x):
        return (x["est"] - x["p"]) / x["est"]
    ok = [x for x in rows if x["s"] == "f" and x.get("est") and (x.get("n") or 0) >= 10 and x["p"] >= 30000
          and not x.get("auc") and (x.get("km") or 0) < 250000
          and (x["est"] - x["p"]) / x["est"] < 0.45]
    home = [x for x in ok if x.get("fy") in HOME]
    out = {
        "under_markedet_rogaland_vestland": [short(x, markedsverdi=x["est"], rabatt=f"{disc(x) * 100:.0f} %") for x in sorted(home, key=disc, reverse=True)[:8]],
        "under_markedet_hele_landet": [short(x, markedsverdi=x["est"], rabatt=f"{disc(x) * 100:.0f} %") for x in sorted(ok, key=disc, reverse=True)[:6]],
        "elbiler_under_markedet": [short(x, rekkevidde=x.get("r"), rabatt=f"{disc(x) * 100:.0f} %") for x in sorted([x for x in ok if x["fu"] == "E"], key=disc, reverse=True)[:6]],
    }
    drops = [x for x in rows if len(x.get("ph") or []) > 1 and x["ph"][0][1] > x["p"]]
    dr = lambda x: (x["ph"][0][1] - x["p"]) / x["ph"][0][1]
    out["storst_prisnedsettelse"] = [short(x, ned=f"{dr(x) * 100:.0f} %") for x in sorted(drops, key=dr, reverse=True)[:5]]
    imp = [x for x in rows if x["s"] in ("b", "k") and x.get("eno") and x["fu"] == "E"]
    out["import_elbil_sverige"] = [short(x, norsk_verdi=x["eno"]) for x in sorted(imp, key=lambda x: x["p"] / x["eno"])[:5]]
    return out


def main():
    key = os.environ.get("GEMINI_API_KEY")
    out_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "public/data")
    if not key:
        print("Ingen GEMINI_API_KEY – hopper over AI-oppsummering.")
        return
    rows = json.loads((out_dir / "listings.json").read_text(encoding="utf-8"))
    market = json.loads((out_dir / "market.json").read_text(encoding="utf-8"))
    if not rows:
        return
    today = dt.date.today().isoformat()
    pr = market.get("prices", {})
    data = {
        "dato": today,
        "antall_biler": len(rows),
        "nye_i_dag": sum(1 for x in rows if x.get("f") == today),
        "bensin_kr_l": (pr.get("fuel", {}).get("bensin") or [None])[-1],
        "diesel_kr_l": (pr.get("fuel", {}).get("diesel") or [None])[-1],
        "strom_spot_30d": {z: v.get("avg30") for z, v in pr.get("power", {}).items() if z in ("NO2", "NO5")},
        "kandidater": candidates(rows),
    }
    prompt = (
        "Du skriver en kort daglig oppsummering (maks 230 ord) på norsk bokmål for en privat bilkjøper som bor i "
        "Stavanger–Bergen-området. Bruk markdown: én kort innledning (antall biler, nye i dag, drivstoff- og strømpriser), "
        "deretter punktlister: **Mest under markedet i Rogaland/Vestland** (4 biler), **Elbiler å se på** (3), "
        "**Store prisnedsettelser** (2) og eventuelt **Import fra Sverige** (1–2 hvis interessant). Hver bil som lenke "
        "[Merke Modell år](lenke) med pris og ett nøkkeltall. Merk at «under markedet» kan skyldes skade eller feil – "
        "minn kort om å sjekke. Ikke finn på tall.\n\n" + json.dumps(data, ensure_ascii=False)
    )
    body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.4, "maxOutputTokens": 2048}}
    for m in MODELS:
        try:
            r = requests.post(API.format(m=m), headers={"x-goog-api-key": key}, json=body, timeout=120)
        except requests.RequestException as e:
            print("  ", m, e)
            continue
        if r.ok:
            parts = (r.json().get("candidates") or [{}])[0].get("content", {}).get("parts", [])
            text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
            if text.strip():
                (out_dir / "ai_brief.json").write_text(json.dumps({"date": today, "model": m, "text": text}, ensure_ascii=False), encoding="utf-8")
                print(f"✔ AI-oppsummering laget med {m}")
                return
        print("  ", m, r.status_code)
        time.sleep(3)
    print("⚠ Kunne ikke lage AI-oppsummering i dag.")


if __name__ == "__main__":
    main()
