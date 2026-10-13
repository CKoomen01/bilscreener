"""Estimert markedsverdi for hver bil (prissammenligning).

Hierarkisk ridge-regresjon på log(pris):
    alle biler -> merke -> merke+modell -> merke+modell+drivstoffgruppe
Hvert nivå krympes mot nivået over, så sjeldne modeller låner styrke fra merket og markedet.
Forklaringsvariabler: alder, alder², log(km), forhandler/privat, firehjulsdrift, automat og
(for elbiler) log(rekkevidde). Estimatet for en bil er «leave-one-out», dvs. bilens egen pris
påvirker ikke sitt eget estimat. Gir også årlig verditap (alder) og verditap per 10 000 km.
"""
from __future__ import annotations

import datetime as dt
import math
import re

import numpy as np

FEATS = ["const", "age", "age2", "lkm", "dealer", "awd", "auto", "lrange", "ev"]
# Krymping (λ) per variabel og nivå: høy = holdes nær nivået over
LAMBDA = {
    "make": np.array([1, 20, 60, 20, 20, 20, 20, 20, 20], float),
    "model": np.array([1, 12, 40, 12, 30, 25, 25, 15, 15], float),
    "leaf": np.array([1, 10, 40, 10, 40, 30, 30, 15, 15], float),
}

MAKE_ALIASES = {"vw": "volkswagen", "mercedes": "mercedes-benz", "mb": "mercedes-benz", "citroën": "citroen",
                "škoda": "skoda", "land rover": "land rover", "landrover": "land rover"}


def norm_key(s: str | None) -> str:
    s = (s or "").lower().strip()
    s = MAKE_ALIASES.get(s, s)
    return re.sub(r"[^a-z0-9]", "", s.replace("ë", "e").replace("é", "e").replace("š", "s"))


def fuel_group(fuel: str) -> str:
    f = (fuel or "").lower()
    if f.startswith("el"):
        return "el"
    if "plug" in f:
        return "phev"
    if "hybrid" in f:
        return "hev"
    if "diesel" in f:
        return "diesel"
    return "bensin"


def ref_year() -> float:
    t = dt.date.today()
    return t.year + (t.timetuple().tm_yday / 365.0)


def features(l: dict, now: float, dealer: float | None = None) -> np.ndarray:
    age = max(0.0, now - (l["year"] + 0.5))
    km = max(0, l.get("km") or 0)
    ev = fuel_group(l.get("fuel")) == "el"
    rng = (l.get("range") or l.get("_rng")) if ev else None
    return np.array([
        1.0,
        age,
        age * age / 10.0,
        math.log(km + 15000) - math.log(90000),
        (1.0 if l.get("seg") in ("Merkeforhandler", "Annet bilutsalg") else 0.0) if dealer is None else dealer,
        1.0 if l.get("awd") else 0.0,
        1.0 if l.get("gear") == "Automat" else 0.0,
        math.log(rng / 350.0) if rng else 0.0,
        1.0 if ev else 0.0,
    ])


def _fit(X: np.ndarray, y: np.ndarray, prior: np.ndarray, lam: np.ndarray):
    A = X.T @ X + np.diag(lam)
    Ainv = np.linalg.inv(A)
    b = Ainv @ (X.T @ y + lam * prior)
    return b, Ainv


def usable(l: dict) -> bool:
    p = l.get("price") or 0
    y = l.get("year") or 0
    return (15_000 <= p <= 8_000_000 and 1995 <= y <= dt.date.today().year + 1
            and (l.get("km") or 0) < 700_000 and not l.get("auction") and l.get("src") == "finn"
            and l.get("make") and l.get("model"))


def run(listings: list[dict], log=print) -> dict:
    """Legger til est, sd, n, dA, dK på hver bil. Returnerer modellstatistikk."""
    now = ref_year()
    # Manglende rekkevidde for elbiler fylles inn med median for samme modell (ellers for alle elbiler)
    by_model: dict[tuple, list[float]] = {}
    for l in listings:
        if fuel_group(l.get("fuel")) == "el" and l.get("range"):
            by_model.setdefault((norm_key(l.get("make")), norm_key(l.get("model"))), []).append(l["range"])
    all_r = sorted(r for v in by_model.values() for r in v)
    glob_r = all_r[len(all_r) // 2] if all_r else 350
    for l in listings:
        if fuel_group(l.get("fuel")) == "el" and not l.get("range"):
            rs = sorted(by_model.get((norm_key(l.get("make")), norm_key(l.get("model"))), []))
            l["_rng"] = rs[len(rs) // 2] if rs else glob_r
    train = [l for l in listings if usable(l)]
    if len(train) < 200:
        log("  ! for få biler til verdimodell")
        return {}
    X = np.array([features(l, now) for l in train])
    y = np.log(np.array([l["price"] for l in train], float))
    keys = [(norm_key(l["make"]), norm_key(l["model"]), fuel_group(l["fuel"])) for l in train]

    def fit_all(mask: np.ndarray):
        Xm, ym = X[mask], y[mask]
        km = [k for k, m in zip(keys, mask) if m]
        b0, _ = _fit(Xm, ym, np.zeros(len(FEATS)), np.full(len(FEATS), 1e-3))
        res0 = ym - Xm @ b0
        sd0 = float(np.sqrt(np.mean(res0 ** 2)))
        groups: dict[str, dict] = {"make": {}, "model": {}, "leaf": {}}
        idx: dict[str, dict] = {"make": {}, "model": {}, "leaf": {}}
        for i, (mk, md, fg) in enumerate(km):
            idx["make"].setdefault(mk, []).append(i)
            idx["model"].setdefault((mk, md), []).append(i)
            idx["leaf"].setdefault((mk, md, fg), []).append(i)
        for mk, ii in idx["make"].items():
            groups["make"][mk] = _fit(Xm[ii], ym[ii], b0, LAMBDA["make"])[0]
        for (mk, md), ii in idx["model"].items():
            groups["model"][(mk, md)] = _fit(Xm[ii], ym[ii], groups["make"][mk], LAMBDA["model"])[0]
        for (mk, md, fg), ii in idx["leaf"].items():
            groups["leaf"][(mk, md, fg)] = _fit(Xm[ii], ym[ii], groups["model"][(mk, md)], LAMBDA["leaf"])
        return b0, sd0, groups, idx, Xm, ym

    # Runde 1, fjern grove avvik (feilpriser, «1 kr», skadebiler), runde 2
    mask = np.ones(len(train), bool)
    b0, sd0, groups, idx, Xm, ym = fit_all(mask)
    pred = np.empty(len(train))
    for (mk, md, fg), ii in idx["leaf"].items():
        pred[ii] = Xm[ii] @ groups["leaf"][(mk, md, fg)][0]
    res = y - pred
    mask = np.abs(res) < max(3 * sd0, 0.6)
    log(f"  verdimodell: {len(train)} biler, fjerner {int((~mask).sum())} avvik (sd={sd0:.3f})")
    b0, sd0, groups, idx, Xm, ym = fit_all(mask)

    # Leave-one-out-prediksjon og usikkerhet per gruppe
    loo: dict[int, float] = {}
    leaf_sd: dict[tuple, float] = {}
    train_idx = np.flatnonzero(mask)
    for key, ii in idx["leaf"].items():
        b, Ainv = groups["leaf"][key]
        Xi = Xm[ii]
        e = ym[ii] - Xi @ b
        h = np.einsum("ij,jk,ik->i", Xi, Ainv, Xi)
        e_loo = e / np.clip(1 - h, 0.05, None)
        k = 4.0
        leaf_sd[key] = float(math.sqrt((float(np.sum(e_loo ** 2)) + k * sd0 ** 2) / (len(ii) + k)))
        for j, i in enumerate(ii):
            loo[int(train_idx[i])] = float(ym[ii][j] - e_loo[j])
    train_pos = {id(l): i for i, l in enumerate(train)}
    n_leaf = {k: len(v) for k, v in idx["leaf"].items()}
    n_model = {k: len(v) for k, v in idx["model"].items()}

    def coef_for(mk, md, fg):
        if (mk, md, fg) in groups["leaf"]:
            return groups["leaf"][(mk, md, fg)][0], leaf_sd[(mk, md, fg)], n_leaf[(mk, md, fg)]
        if (mk, md) in groups["model"]:
            return groups["model"][(mk, md)], sd0 * 1.15, n_model[(mk, md)]
        if mk in groups["make"]:
            return groups["make"][mk], sd0 * 1.4, 0
        return None, None, 0

    done = 0
    for l in listings:
        for k in ("est", "sd", "n", "dA", "dK", "estNo"):
            l.pop(k, None)
        if not l.get("make") or not l.get("model") or not l.get("year") or l["year"] < 1995:
            continue
        mk, md, fg = norm_key(l["make"]), norm_key(l["model"]), fuel_group(l["fuel"])
        b, sd, n = coef_for(mk, md, fg)
        if b is None:
            continue
        foreign = l.get("src") != "finn"
        x = features(l, now, dealer=0.0 if foreign else None)
        pos = train_pos.get(id(l))
        lp = loo.get(pos) if pos is not None else None
        if lp is None:
            lp = float(x @ b)
        est = math.exp(lp + 0.5 * sd * sd * 0.3)  # liten korreksjon for log-skjevhet
        l["est" if not foreign else "estNo"] = int(round(est, -2))
        l["sd"] = round(sd, 3)
        l["n"] = n
        age = x[1]
        dA = b[1] + 2 * b[2] * age / 10.0
        dK = b[3] * 10000.0 / ((l.get("km") or 0) + 15000)
        l["dA"] = round(float(min(-0.02, max(-0.35, dA))), 4)
        l["dK"] = round(float(min(0.0, max(-0.12, dK))), 4)
        done += 1
    log(f"  verdimodell: estimat for {done} biler")
    return {"sdGlobal": round(sd0, 3), "nTrain": int(mask.sum()), "coefGlobal": dict(zip(FEATS, map(lambda v: round(float(v), 4), b0)))}
