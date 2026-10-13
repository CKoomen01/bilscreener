// Analyse av hver bil: forbruk, brukskostnad, importkostnad, delscorer og samlet score.
// Alt regnes i nettleseren, så det oppdateres med en gang når du endrer kjøreprofil eller vekter.
import { knownConsumption, reliability, RELIABILITY_LABEL } from "./models.js";
import { kr, num, pct } from "./format.js";

export const FUELS = {
  E: { label: "Elbil", short: "El", ev: true },
  B: { label: "Bensin", short: "Bensin" },
  D: { label: "Diesel", short: "Diesel" },
  HB: { label: "Hybrid (bensin)", short: "Hybrid" },
  HD: { label: "Hybrid (diesel)", short: "Hybrid diesel" },
  PB: { label: "Ladbar hybrid (bensin)", short: "Ladbar hybrid", phev: true },
  PD: { label: "Ladbar hybrid (diesel)", short: "Ladbar diesel", phev: true },
  H2: { label: "Hydrogen", short: "Hydrogen" },
  A: { label: "Annet", short: "Annet" },
};
export const WD = { 4: "Firehjulsdrift", F: "Forhjulsdrift", R: "Bakhjulsdrift" };
export const SELLER = { P: "Privat", M: "Merkeforhandler", A: "Bruktbilforhandler", F: "Forhandler (SE)", K: "KVD-auksjon" };
export const SOURCE = { f: "Finn", b: "Blocket (SE)", k: "KVD (SE)" };

export const VERDICT = {
  topp: { label: "Toppkjøp", cls: "border-good/50 bg-good/10 text-up", min: 78 },
  godt: { label: "Godt kjøp", cls: "border-accent/40 bg-accent/10 text-accent", min: 66 },
  ok: { label: "OK", cls: "border-warn/60 bg-warn/10 text-ink", min: 50 },
  svak: { label: "Svakt", cls: "border-bad/40 bg-bad/10 text-down", min: 0 },
};
export const verdictOf = s => (s >= 78 ? "topp" : s >= 66 ? "godt" : s >= 50 ? "ok" : "svak");

export const CITIES = {
  stavanger: { name: "Stavanger", lat: 58.97, lon: 5.733 },
  sandnes: { name: "Sandnes", lat: 58.852, lon: 5.735 },
  haugesund: { name: "Haugesund", lat: 59.413, lon: 5.268 },
  bergen: { name: "Bergen", lat: 60.391, lon: 5.322 },
  stord: { name: "Stord (midtveis)", lat: 59.78, lon: 5.5 },
  oslo: { name: "Oslo", lat: 59.913, lon: 10.752 },
  kristiansand: { name: "Kristiansand", lat: 58.146, lon: 7.996 },
  trondheim: { name: "Trondheim", lat: 63.43, lon: 10.395 },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NOW = new Date();
const NOW_Y = NOW.getFullYear() + (NOW.getMonth() + 0.5) / 12;

export function ageOf(l) { return Math.max(0, NOW_Y - (l.y + 0.5)); }

export function distKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Aktuelle energipriser ut fra data + brukerens overstyringer. */
export function energyPrices(market, A, P) {
  const fuel = market?.prices?.fuel || {};
  const bensin = A.bensin ?? fuel.bensin?.at(-1)?.[1] ?? 22;
  const diesel = A.diesel ?? fuel.diesel?.at(-1)?.[1] ?? 21;
  const z = market?.prices?.power?.[P.zone] || {};
  const spot = A.spot ?? z.avg30 ?? 1.0;
  const vat = P.zone === "NO4" ? 1 : 1.25;
  // Strømstøtte 2026: 90 % av spotpris over 75 øre/kWh eks. mva
  const stotte = Math.max(0, spot - 0.75) * 0.9 * vat;
  const home = P.tariff === "norgespris" ? A.norgespris + A.grid : spot * vat - stotte + A.grid;
  const homeShare = P.homeCharge ? clamp(P.homeShare, 0, 100) / 100 : 0.1; // uten hjemmelading: litt destinasjonslading
  const homeCost = home * (1 + A.chargeLoss / 100);
  const kwh = homeCost * homeShare + A.fastCharge * (1 - homeShare);
  return { bensin, diesel, spot, home, homeCost, kwh, stotte, fuelMonth: fuel.bensin?.at(-1)?.[0], spotZone: P.zone };
}

function estWeight(l) {
  if (l.kg) return l.kg;
  const base = { "SUV/Offroad": 1750, Stasjonsvogn: 1550, Sedan: 1500, Flerbruksbil: 1650, Pickup: 2100, Kasse: 1700,
    "Kombi 5-dørs": 1300, "Kombi 3-dørs": 1150, Coupe: 1500, Cabriolet: 1500 }[l.bo] ?? 1500;
  const ev = l.fu === "E" ? 330 : FUELS[l.fu]?.phev ? 250 : 0;
  const awd = l.wd === "4" ? 90 : 0;
  return base + ev + awd;
}

/** Forbruk per 100 km under brukerens kjøremønster. Returnerer { l, kwh, src } */
export function consumption(l, P) {
  const kg = estWeight(l);
  const hk = l.hk || (l.fu === "E" ? 200 : l.bo === "SUV/Offroad" ? 160 : 130);
  const age = ageOf(l);
  const hw = P.highway / 100;
  const known = knownConsumption(l.mk, l.md);
  const fuelBase = () => {
    let x = 2.2 + 0.0024 * kg + 0.006 * hk;
    if (age > 15) x *= 1.1;
    if (l.wd === "4") x *= 1.05;
    return x * (1 + 0.12 * (0.5 - hw));
  };
  if (l.fu === "E") {
    let k = known && known > 10 ? known : 6.5 + 0.0068 * kg + (l.bo === "SUV/Offroad" ? 1 : 0);
    if (l.cons && l.cons > 8 && l.cons < 40) k = l.cons * 1.15;
    k *= 1 + 0.16 * (hw - 0.5); // motorvei bruker mer strøm
    return { l: 0, kwh: k, src: known ? "modell" : l.kg ? "vekt" : "estimat" };
  }
  if (FUELS[l.fu]?.phev) {
    const e = P.homeCharge ? clamp(0.75 - 0.55 * hw, 0.15, 0.7) : 0.08;
    const lit = fuelBase() * 1.05 * (l.fu === "PD" ? 0.85 : 1);
    return { l: lit * (1 - e), kwh: 21 * e, src: "estimat", elShare: e };
  }
  let lit;
  if (l.cons && l.cons > 2 && l.cons < 20) lit = l.cons * 1.2;
  else if (known && known < 10 && (l.fu === "HB" || l.fu === "HD")) lit = known * (1 + 0.1 * (0.5 - hw));
  else {
    lit = fuelBase();
    if (l.fu === "D" || l.fu === "HD") lit *= 0.84;
    if (l.fu === "HB" || l.fu === "HD") lit *= 0.74 + 0.12 * hw; // hybrid sparer mest i by
  }
  return { l: lit, kwh: 0, src: known ? "modell" : "estimat" };
}

const isEvTax = l => l.fu === "E" || l.fu === "H2";

/** Estimert engangsavgift-fradrag for bruktimport etter alder (grov tilnærming av Skatteetatens tabell). */
const FRADRAG = [[0, 0], [0.25, 0.07], [0.5, 0.11], [1, 0.2], [2, 0.32], [3, 0.42], [4, 0.5], [5, 0.57], [6, 0.63], [7, 0.68], [8, 0.72], [10, 0.8], [12, 0.86], [15, 0.93], [20, 1]];
function bruksfradrag(age) {
  for (let i = 1; i < FRADRAG.length; i++) {
    const [a1, f1] = FRADRAG[i], [a0, f0] = FRADRAG[i - 1];
    if (age <= a1) return f0 + ((age - a0) / (a1 - a0)) * (f1 - f0);
  }
  return 1;
}

/** Importkostnad for svenske biler. Fossilbiler får bare et grovt anslag. */
export function importCost(l, A) {
  if (l.s === "f") return null;
  const age = ageOf(l);
  const kg = estWeight(l);
  const fr = bruksfradrag(age);
  let mva, eng, sure = true;
  if (l.fu === "E") {
    mva = 0.25 * Math.max(0, l.p - A.mvaLimitEv);
    eng = A.engEvKg * Math.max(0, kg - 500) * (1 - fr);
  } else {
    // Fossil/hybrid: CO2- og vektavgift er høy. Grovt: ~ 25 % mva + avgift fra CO2 (anslag)
    mva = 0.25 * l.p;
    const co2 = l.co2 || (l.fu === "D" ? 140 : l.fu === "HB" ? 105 : l.fu?.startsWith("P") ? 40 : 150);
    const co2Kr = Math.max(0, co2 - 50) * 1000 + Math.max(0, co2 - 100) * 1500 + Math.max(0, co2 - 140) * 2500;
    eng = (co2Kr + 12.71 * Math.max(0, kg - 500) * 0.5) * (1 - fr);
    sure = false;
  }
  const total = mva + eng + A.importTransport + A.importFees;
  return { mva, eng, fees: A.importTransport + A.importFees, total, sure, fradrag: fr };
}

/** Årlige kostnader. value = bilens verdi (det du betaler). */
export function runningCost(l, P, A, E, rel) {
  const c = consumption(l, P);
  const km = P.kmYear;
  const fuelPrice = ["D", "HD", "PD"].includes(l.fu) ? E.diesel : E.bensin;
  const energi = (km / 100) * (c.l * fuelPrice + c.kwh * E.kwh);
  const ev = l.fu === "E";
  const trips = P.sbTrips * 2 * (ev ? A.tripEl : A.tripFossil);
  const bom = P.tollMonth * 12 * (ev ? A.tollEl : A.tollFossil);
  const tfa = isEvTax(l) ? A.tfaEl : A.tfaFossil;
  const value = l._price;
  const age = ageOf(l);
  let ins = Math.max(3000, A.insBase + (A.insPct / 100) * value);
  if (age > 15 || value < 40000) ins = Math.min(ins, 3800); // ansvar/delkasko
  const serviceBase = ev ? 2500 : FUELS[l.fu]?.phev ? 5000 : l.fu === "HB" || l.fu === "HD" ? 4000 : l.fu === "D" ? 5500 : 4500;
  const relF = 1.6 - rel / 100;             // 90 -> 0.7, 50 -> 1.1
  const kmF = 1 + (l.km || 0) / 150000;
  const service = serviceBase * Math.min(2, 1 + 0.05 * age) * (km / 15000) ** 0.5;
  const repairs = 3000 * relF * kmF * Math.min(2.5, 0.5 + age / 8) + (ev && age > 8 ? 1500 : 0);
  const eu = age >= 4 ? 600 : 0;
  const tires = A.tiresKm * km * (ev || estWeight(l) > 1900 ? 1.25 : 1);
  const drift = energi + trips + bom + tfa + ins + service + repairs + eu + tires;
  // Verditap neste år, fra verdimodellen (alder + km)
  const dA = l.dA ?? (ev ? -0.13 : -0.1);
  const dK = l.dK ?? -0.02;
  const dep = value * (1 - Math.exp(dA + dK * (km / 10000)));
  return {
    cons: c, energi, trips, bom, tfa, ins, service, repairs, eu, tires, drift, dep: Math.max(0, dep),
    total: drift + Math.max(0, dep), perKm: drift / km, perMonth: drift / 12, totalMonth: (drift + Math.max(0, dep)) / 12,
  };
}

/** Resultatet for én bil. Begrunnelsene (tekst) lages først når noen leser dem. */
class Analysis {
  constructor(o) { Object.assign(this, o); }
  get reasons() { return (this._reasons ??= buildReasons(this._l, this, this._dep)); }
}

/** Første steg: kostnader og delscorer som ikke avhenger av andre biler. */
function analyzeOne(l, P, A, E) {
  const age = ageOf(l);
  const imp = importCost(l, A);
  l._price = l.p;
  const effPrice = l.p + (imp ? imp.total : 0);
  const rel = reliability(l.mk, l.md);
  const rc = runningCost({ ...l, _price: effPrice }, P, A, E, rel);
  const est = l.s === "f" ? l.est : l.eno;

  // 1) Pris mot markedet
  let sPris = 50, disc = null, suspect = false;
  if (est) {
    disc = (est - effPrice) / est;
    // Usikkerhet: få sammenlignbare biler eller stor prisspredning gir mindre utslag
    // Nesten nye biler sammenlignes dårlig (listepriser, kampanjer) – teller halvt
    const conf = clamp((l.n || 0) / 25, 0.3, 1) * clamp(0.2 / (l.sd || 0.35), 0.4, 1) * (age < 1 ? 0.5 : 1);
    sPris = clamp(50 + conf * clamp(disc, -0.4, 0.4) * 160, 0, 100);
    if (imp && !imp.sure) sPris = 50 + (sPris - 50) * 0.4;
    // Langt under markedet: oftest skade, delebil, feil i annonsen, innbytte- eller månedspris
    if (disc > 0.45) { suspect = true; sPris = 45; }
  }

  // 2) Kilometerstand
  const expected = 13500 * Math.max(age, 0.5);
  const kmv = l.km ?? expected;
  const ratio = kmv / expected;
  const sRel = clamp(100 - (ratio - 0.4) * 60, 0, 100);
  const sAbs = clamp(100 * (1 - kmv / 320000), 0, 100);
  const sKm = l.km == null ? 50 : 0.7 * sRel + 0.3 * sAbs;
  const perYear = age >= 0.5 ? kmv / age : null;

  // 3) Modell
  let sModell = rel - Math.max(0, age - 8) * (100 - rel) * 0.03;
  if (l.fu === "E" && age > 8) sModell -= 6;
  sModell = clamp(sModell, 0, 100);

  // 5) Trygghet
  let sTrygg = 50, euSoon = false;
  if (l.w) sTrygg += 20;
  if (l.svc) sTrygg += 10;
  if (l.sg === "M") sTrygg += 10;
  if (l.sg === "P") sTrygg -= 5;
  if (l.own >= 4) sTrygg -= 10;
  if (l.eu && (new Date(l.eu) - NOW) / (30.4 * 864e5) < 4) { sTrygg -= 10; euSoon = true; }
  if (l.auc) sTrygg -= 5;
  if (l.abroad) sTrygg -= 15;
  sTrygg = clamp(sTrygg, 0, 100);

  return new Analysis({ age, imp, effPrice, est, disc, suspect, rel, rc, perYear, ratio, euSoon, s: { pris: sPris, km: sKm, modell: sModell, trygg: sTrygg } });
}

/** Begrunnelser i klartekst – lages først når noen ber om dem (formatering er treg for 70 000 biler). */
function buildReasons(l, a, withDep) {
  const R = [];
  const { disc, est, imp } = a;
  if (est) {
    const basis = l.n ? `${num(l.n)} lignende ${l.n === 1 ? "bil" : "biler"}` : "merket";
    if (a.suspect) R.push({ good: false, k: "pris", text: `Uvanlig lav pris (${pct(disc, 0)} under markedet) – kan være skade, delebil, feil i annonsen eller månedspris. Sjekk nøye!` });
    else if (disc > 0.04) R.push({ good: true, k: "pris", text: `${pct(disc, 0)} under estimert markedsverdi ${kr(est)} (basert på ${basis})` });
    else if (disc < -0.06) R.push({ good: false, k: "pris", text: `${pct(-disc, 0)} over estimert markedsverdi ${kr(est)}` });
    else R.push({ good: null, k: "pris", text: `Prisen er på linje med markedet (estimat ${kr(est)})` });
    if (l.n < 15 || l.sd > 0.3) R.push({ good: null, k: "pris", text: "Usikkert estimat (få like biler eller stor prisspredning) – teller mindre i scoren" });
  } else {
    R.push({ good: null, k: "pris", text: "For få sammenlignbare biler til å estimere markedsverdi" });
  }
  if (l.ph?.length > 1 && l.ph[0][1] > l.p) {
    const drop = (l.ph[0][1] - l.p) / l.ph[0][1];
    if (drop > 0.02) R.push({ good: true, k: "pris", text: `Satt ned ${pct(drop, 0)} siden ${l.ph[0][0]}` });
  }
  if (imp && !imp.sure) R.push({ good: false, k: "pris", text: "Fossil import: engangsavgiften er bare grovt anslått – sjekk hos Skatteetaten" });
  if (l.km != null && a.age >= 1) {
    if (a.ratio < 0.7) R.push({ good: true, k: "km", text: `Lite kjørt: ${num(a.perYear, 0)} km/år (snitt ~13 500)` });
    else if (a.ratio > 1.4) R.push({ good: false, k: "km", text: `Mye kjørt: ${num(a.perYear, 0)} km/år` });
  }
  if ((l.km ?? 0) > 250000) R.push({ good: false, k: "km", text: `Høy kilometerstand (${num(l.km)} km)` });
  R.push({ good: a.rel >= 75 ? true : a.rel < 60 ? false : null, k: "modell", text: `${l.mk}: ${RELIABILITY_LABEL(a.rel)} (${a.rel}/100)` });
  if (l.fu === "E" && a.age > 8) R.push({ good: false, k: "modell", text: "Eldre elbil – sjekk batterihelse (SOH) og reell rekkevidde" });
  const v = withDep ? a.rc.total : a.rc.drift, pr = a.costPct;
  if (pr < 0.2) R.push({ good: true, k: "drift", text: `Billig i drift: ${kr(v / 12)}/mnd – blant de ${Math.max(1, Math.round(pr * 100))} % billigste` });
  else if (pr > 0.8) R.push({ good: false, k: "drift", text: `Dyr i drift: ${kr(v / 12)}/mnd – blant de ${Math.round((1 - pr) * 100)} % dyreste` });
  else R.push({ good: null, k: "drift", text: `${withDep ? "Eierkostnad" : "Brukskostnad"} ${kr(v / 12)}/mnd (${num(a.rc.perKm, 1)} kr/km)` });
  if (l.w) R.push({ good: true, k: "trygg", text: `Garanti ${l.w} mnd` });
  if (l.own >= 4) R.push({ good: false, k: "trygg", text: `${l.own} tidligere eiere` });
  if (a.euSoon) R.push({ good: false, k: "trygg", text: `EU-kontroll snart (${l.eu})` });
  if (l.abroad) R.push({ good: false, k: "trygg", text: `Bilen står i ${l.abroad}` });
  return R;
}

/**
 * Analyserer alle biler. Driftsscoren er relativ (persentil blant alle biler), så den
 * regnes i et andre steg.
 */
export function analyzeAll(listings, P, W, A, E) {
  const out = {};
  const n = listings.length;
  const costs = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = analyzeOne(listings[i], P, A, E);
    out[listings[i].id] = a;
    costs[i] = P.withDep ? a.rc.total : a.rc.drift;
  }
  const sorted = Float64Array.from(costs).sort();
  const pctRank = v => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
    return sorted.length ? lo / sorted.length : 0.5;
  };
  const wsum = Object.values(W).reduce((s, v) => s + v, 0) || 1;
  for (let i = 0; i < n; i++) {
    const l = listings[i];
    const a = out[l.id];
    const pr = pctRank(costs[i]);
    a.s.drift = clamp(100 * (1 - pr), 0, 100);
    a.costPct = pr;
    a.score = Math.round((W.pris * a.s.pris + W.km * a.s.km + W.modell * a.s.modell + W.drift * a.s.drift + W.trygg * a.s.trygg) / wsum);
    a.verdict = verdictOf(a.score);
    a._l = l;
    a._dep = P.withDep;
  }
  return out;
}

/** Kort sammendrag til AI-agenten */
export function summarize(l, a) {
  return {
    id: l.id,
    kilde: SOURCE[l.s],
    bil: `${l.mk} ${l.md}${l.sp ? " " + l.sp : ""}`.trim(),
    aar: l.y, km: l.km, drivstoff: FUELS[l.fu]?.label, girkasse: l.g === "A" ? "Automat" : "Manuell", hjuldrift: WD[l.wd],
    karosseri: l.bo, sted: [l.loc, l.fy].filter(Boolean).join(", "),
    pris: l.p, pris_inkl_import: a.imp ? Math.round(a.effPrice) : undefined,
    markedsverdi: a.est, avvik_fra_marked: a.disc != null ? pct(a.disc, 0) : null,
    score: a.score, vurdering: VERDICT[a.verdict].label,
    delscore: Object.fromEntries(Object.entries(a.s).map(([k, v]) => [k, Math.round(v)])),
    brukskost_mnd: Math.round(a.rc.perMonth), verditap_aar: Math.round(a.rc.dep),
    rekkevidde: l.r, hk: l.hk, garanti_mnd: l.w, selger: SELLER[l.sg] || l.org,
  };
}

export const listingUrl = l => l.url || `https://www.finn.no/mobility/item/${l.id}`;
export function imageUrl(l, w = 480) {
  if (!l.img) return null;
  if (/^https?:/.test(l.img)) return l.img;
  const host = l.s === "b" ? "https://images.blocketcdn.se" : "https://images.finncdn.no";
  const path = l.img.includes("/") ? l.img : `item/${l.id.replace(/^b/, "")}/${l.img}`;
  return `${host}/dynamic/${w}w/${path}`;
}
