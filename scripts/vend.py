"""Henter bilannonser fra Finn.no og Blocket.se.

Begge sidene kjører på samme plattform (Vend/Schibsted) og har et internt JSON-søke-API som
nettsiden selv bruker. Et søk gir maks 50 sider à 50 biler, så vi deler søket opp etter
karosseri, hjuldrift, drivstoff og prisintervaller til hver bit har under 2 500 treff.
Kun til privat bruk: forespørslene går med pauser imellom og kjøres maks to ganger i døgnet.
"""
from __future__ import annotations

import html as htmllib
import random
import re
import time

import requests

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept-Language": "nb-NO,nb;q=0.9,no;q=0.8,en;q=0.5",
}
SITES = {
    "finn": "https://www.finn.no",
    "blocket": "https://www.blocket.se",
}
PAGE_SIZE = 50
MAX_PAGE = 50
CAP = PAGE_SIZE * MAX_PAGE

_session = requests.Session()
_session.headers.update(HEADERS)


class Blocked(Exception):
    pass


def polite_sleep(base: float) -> None:
    time.sleep(base + random.uniform(0, base * 0.5))


def _get(url: str, params=None, accept="application/json", retries: int = 4):
    for attempt in range(retries):
        try:
            r = _session.get(url, params=params, timeout=40, headers={"Accept": accept})
        except requests.RequestException:
            time.sleep(5 * (attempt + 1))
            continue
        if r.status_code == 200:
            r.encoding = "utf-8"
            return r
        if r.status_code in (403, 429):
            if attempt == retries - 1:
                raise Blocked(f"{r.status_code} for {url}")
            time.sleep(30 * (attempt + 1))
            continue
        if r.status_code in (404, 410):
            return None
        time.sleep(5 * (attempt + 1))
    return None


def search(site: str, params: dict) -> dict | None:
    r = _get(f"{SITES[site]}/mobility/search/api/search/SEARCH_ID_CAR_USED", params=params)
    if r is None:
        return None
    try:
        return r.json()
    except ValueError:
        return None


def _hits(res: dict) -> int:
    return int(((res.get("metadata") or {}).get("result_size") or {}).get("match_count") or 0)


def _filter_items(res: dict, name: str) -> list[tuple[str, str, int]]:
    for f in res.get("filters") or []:
        if f.get("name") == name:
            return [(i["value"], i["display_name"], i.get("hits") or 0) for i in f.get("filter_items") or []]
    return []


class Crawler:
    """Henter alle annonser for et grunnsøk ved å dele det opp rekursivt."""

    SPLITS = ["body_type", "wheel_drive", "fuel"]

    def __init__(self, site: str, base: dict, delay: float = 0.8, log=print, deadline: float | None = None):
        self.site, self.base, self.delay, self.log, self.deadline = site, base, delay, log, deadline
        self.requests = 0
        self.docs: dict[str, dict] = {}
        self.names: dict[str, dict[str, str]] = {}   # filternavn -> verdi -> visningsnavn
        self.truncated = False
        self.first: dict | None = None

    def _search(self, params: dict, page: int = 1):
        if self.deadline and time.time() > self.deadline:
            self.truncated = True
            return None
        if self.requests:
            polite_sleep(self.delay)
        self.requests += 1
        p = {**params}
        if page > 1:
            p["page"] = page
            p["include_filters"] = "false"  # filterlisten trengs bare på første side
        return search(self.site, p)

    def _collect(self, res: dict, tags: dict) -> None:
        for d in res.get("docs") or []:
            if d.get("type") != "motor" or not d.get("id"):
                continue
            d["_tags"] = tags
            self.docs[str(d["id"])] = d

    def _fetch_pages(self, params: dict, first: dict, tags: dict) -> None:
        self._collect(first, tags)
        last = int(((first.get("metadata") or {}).get("paging") or {}).get("last") or 1)
        for p in range(2, min(last, MAX_PAGE) + 1):
            res = self._search(params, p)
            if not res:
                break
            self._collect(res, tags)

    def run(self) -> dict[str, dict]:
        first = self._search(self.base)
        if not first:
            self.log(f"  ! {self.site}: fikk ikke svar på grunnsøket")
            return {}
        self.first = first
        for name in self.SPLITS:
            self.names[name] = {v: n for v, n, _ in _filter_items(first, name)}
        self.log(f"  {self.site}: {_hits(first)} treff totalt")
        self._crawl(self.base, first, 0, {})
        self.log(f"  {self.site}: hentet {len(self.docs)} annonser med {self.requests} forespørsler")
        return self.docs

    def _crawl(self, params: dict, first: dict, depth: int, tags: dict) -> None:
        n = _hits(first)
        if n == 0:
            return
        if n <= CAP:
            self._fetch_pages(params, first, tags)
            return
        if depth < len(self.SPLITS):
            name = self.SPLITS[depth]
            if name in params:  # allerede låst i grunnsøket
                self._crawl(params, first, depth + 1, {**tags, name: str(params[name])})
                return
            items = _filter_items(first, name)
            if items:
                for value, _label, hits in items:
                    if not hits:
                        continue
                    sub = {**params, name: value}
                    res = self._search(sub)
                    if res:
                        self._crawl(sub, res, depth + 1, {**tags, name: value})
                return
            self._crawl(params, first, depth + 1, tags)
            return
        # Del i prisintervaller
        lo = int(params.get("price_from") or 0)
        hi = int(params.get("price_to") or 20_000_000)
        if hi - lo < 2000:
            self.log(f"    ! kan ikke dele mer ({n} treff), tar de første {CAP}")
            self._fetch_pages(params, first, tags)
            return
        mid = (lo + hi) // 2 if hi < 20_000_000 else max(lo * 2, 400_000)
        for a, b in ((lo, mid), (mid + 1, hi)):
            sub = {**params, "price_from": a, "price_to": b}
            res = self._search(sub)
            if res:
                self._crawl(sub, res, depth, tags)


# ---------- Detaljsider (bare Finn) ----------

_DTDD = re.compile(r"<dt[^>]*>(.*?)</dt>\s*<dd[^>]*>(.*?)</dd>", re.S)
_TAG = re.compile(r"<[^>]+>")


def _txt(s: str) -> str:
    return re.sub(r"\s+", " ", htmllib.unescape(_TAG.sub(" ", s))).strip()


def _num(s: str | None):
    if not s:
        return None
    m = re.search(r"\d[\d\s  .]*", s)
    if not m:
        return None
    try:
        return int(re.sub(r"[^\d]", "", m.group(0)))
    except ValueError:
        return None


def ad_details(item_id: str) -> dict | None:
    """Tekniske data, utstyr og beskrivelse fra en Finn-annonse."""
    r = _get(f"{SITES['finn']}/mobility/item/{item_id}", accept="text/html")
    if r is None:
        return None
    h = r.text
    spec = {}
    for k, v in _DTDD.findall(h):
        k, v = _txt(k), _txt(v)
        if k and v and len(k) < 40:
            spec[k] = v
    if not spec:
        return None
    out: dict = {}
    hk = _num(spec.get("Effekt"))
    if hk:
        out["hk"] = hk
    kg = _num(spec.get("Vekt"))
    if kg:
        out["kg"] = kg
    for key, name in (("Farge", "color"), ("Bilen står i", "country"), ("Avgiftsklasse", "cls")):
        if spec.get(key):
            out[name] = spec[key]
    seats = _num(spec.get("Seter"))
    if seats:
        out["seats"] = seats
    tr = _num(spec.get("Maksimal tilhengervekt"))
    if tr is not None:
        out["trailer"] = tr
    boot = _num(spec.get("Størrelse på bagasjerom"))
    if boot:
        out["boot"] = boot
    bat = _num(spec.get("Batterikapasitet"))
    if bat:
        out["kwh"] = bat
    if spec.get("Neste frist for EU-kontroll"):
        m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", spec["Neste frist for EU-kontroll"])
        if m:
            out["eu"] = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    if spec.get("1. gang registrert"):
        m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", spec["1. gang registrert"])
        if m:
            out["reg1"] = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    omreg = _num(spec.get("Omregistrering"))
    if omreg:
        out["omreg"] = omreg
    # Rekkevidde (WLTP) står utenfor dt/dd-listen
    m = re.search(r"Rekkevidde \(WLTP\)</span>\s*<p[^>]*>([^<]+)</p>", h)
    if m:
        out["wltp"] = _num(m.group(1))
    # Utstyr
    i = h.find(">Utstyr<")
    if i > 0:
        seg = h[i:i + 20000]
        j = seg.find("</section>")
        items = [_txt(x) for x in re.findall(r"<li[^>]*>(.*?)</li>", seg[: j if j > 0 else 8000], re.S)]
        out["equip"] = [x for x in items if x and len(x) < 60][:60]
    # Beskrivelse
    m = re.search(r">Beskrivelse</h\d>", h)
    if m:
        seg = h[m.end():m.end() + 15000]
        j = seg.find(">Utstyr<")
        desc = _txt(seg[: j if j > 0 else 6000])
        out["desc"] = desc[:1500]
    # Antall eiere står ofte bare i fritekst
    m = re.search(r"(\d+|en|to|tre|fire|fem)\s+(?:tidligere\s+)?eiere?\b", (out.get("desc") or "").lower())
    if m:
        words = {"en": 1, "to": 2, "tre": 3, "fire": 4, "fem": 5}
        out["owners"] = int(m.group(1)) if m.group(1).isdigit() else words[m.group(1)]
    return out
