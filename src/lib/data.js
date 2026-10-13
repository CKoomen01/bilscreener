// Laster datafilene som GitHub Actions lager, og filtrerer/sorterer biler.
import { createContext, useContext } from "react";
import { CITIES, distKm } from "./analysis.js";

const get = async (f, fallback) => {
  try {
    const r = await fetch(`./data/${f}?v=${Math.floor(Date.now() / 6e5)}`);
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch {
    return fallback;
  }
};

const BODY = { S: "SUV/Offroad", V: "Stasjonsvogn", K5: "Kombi 5-dørs", K3: "Kombi 3-dørs", Se: "Sedan", F: "Flerbruksbil", C: "Coupe", Ca: "Cabriolet", P: "Pickup", Ka: "Kasse", A: "Annet" };

export async function loadData() {
  const [listings, market, meta, brief] = await Promise.all([
    get("listings.json", []),
    get("market.json", {}),
    get("meta.json", {}),
    get("ai_brief.json", null),
  ]);
  for (const l of listings) if (BODY[l.bo]) l.bo = BODY[l.bo];
  return { listings, market, meta, brief };
}

let detailsPromise = null;
/** Beskrivelse og utstyrsliste (lastes først når noen åpner en bil). */
export function loadDetails() {
  detailsPromise ??= get("details.json", {});
  return detailsPromise;
}

export const BODIES = ["SUV/Offroad", "Stasjonsvogn", "Kombi 5-dørs", "Sedan", "Flerbruksbil", "Coupe", "Cabriolet", "Kombi 3-dørs", "Pickup", "Kasse", "Annet"];

export const SORTS = [
  ["pris", "Billigst først"],
  ["score", "Beste kjøp (score)"],
  ["rabatt", "Mest under markedsverdi"],
  ["drift", "Billigst i drift"],
  ["total", "Lavest eierkostnad (inkl. verditap)"],
  ["km", "Lavest kilometerstand"],
  ["aar", "Nyeste årsmodell"],
  ["nyeste", "Nyeste annonser"],
  ["prisned", "Største prisnedsettelser"],
  ["naer", "Nærmest meg / valgt sted"],
  ["dyrest", "Dyrest først"],
];

export const EQUIP_LABEL = {
  henger: "Hengerfeste", motorvarmer: "Motorvarmer", kupevarmer: "Kupévarmer", varmepumpe: "Varmepumpe",
  acc: "Adaptiv cruise", skinn: "Skinn", navi: "Navigasjon", carplay: "CarPlay/Android Auto", hud: "Head-up display",
  glasstak: "Glasstak", setevarme: "Setevarme", rattvarme: "Rattvarme", ryggekamera: "Ryggekamera",
};

export function daysOnMarket(l) {
  const d = l.f || l.pub;
  return d ? Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 864e5)) : null;
}

export function priceDrop(l) {
  if (!(l.ph?.length > 1)) return 0;
  const first = l.ph[0][1];
  return first > l.p ? (first - l.p) / first : 0;
}

/** Valgt posisjon (by, GPS eller eget sted) som { lat, lon, label }, eller null. */
export function originOf(f) {
  if (!f?.distFrom) return null;
  if (f.distFrom === "gps" || f.distFrom === "custom") {
    return f.distLat != null && f.distLon != null ? { lat: f.distLat, lon: f.distLon, label: f.distLabel || (f.distFrom === "gps" ? "Min posisjon" : "Valgt sted") } : null;
  }
  const c = CITIES[f.distFrom];
  return c ? { lat: c.lat, lon: c.lon, label: c.name } : null;
}

/** Avstand i km fra valgt posisjon til bilen (null for svenske biler / ukjent sted). */
export function distanceTo(origin, l) {
  if (!origin || l.s !== "f" || l.la == null) return null;
  return distKm(origin, { lat: l.la, lon: l.lo });
}

export function applyFilters(listings, A, f, favorites = [], onlyFav = false) {
  const q = (f.q || "").trim().toLowerCase();
  const terms = q ? q.split(/\s+/) : [];
  const fav = onlyFav ? new Set(favorites) : null;
  const makes = f.makes?.length ? new Set(f.makes) : null;
  const models = f.models?.length ? new Set(f.models) : null;
  const fuels = f.fuels?.length ? new Set(f.fuels) : null;
  const bodies = f.bodies?.length ? new Set(f.bodies) : null;
  const wd = f.wd?.length ? new Set(f.wd) : null;
  const src = f.sources?.length ? new Set(f.sources) : null;
  const sellers = f.sellers?.length ? new Set(f.sellers) : null;
  const fylker = f.fylker?.length ? new Set(f.fylker) : null;
  const origin = originOf(f);
  const dist = new Map();
  const out = [];
  for (const l of listings) {
    const a = A[l.id];
    if (!a) continue;
    if (fav && !fav.has(l.id)) continue;
    if (makes && !makes.has(l.mk)) continue;
    if (models && !models.has(`${l.mk}|${l.md}`)) continue;
    if (fuels && !fuels.has(l.fu)) continue;
    if (bodies && !bodies.has(l.bo)) continue;
    if (wd && !wd.has(l.wd)) continue;
    if (src && !src.has(l.s)) continue;
    if (sellers && !sellers.has(l.sg)) continue;
    if (fylker && !fylker.has(l.fy)) continue;
    if (f.gear && l.g !== f.gear) continue;
    const price = a.effPrice;
    if (f.priceMin && price < f.priceMin) continue;
    if (f.priceMax && price > f.priceMax) continue;
    if (f.yearMin && l.y < f.yearMin) continue;
    if (f.yearMax && l.y > f.yearMax) continue;
    if (f.kmMin && (l.km ?? 0) < f.kmMin) continue;
    if (f.kmMax && (l.km ?? 0) > f.kmMax) continue;
    if (f.rangeMin && !(l.r >= f.rangeMin)) continue;
    if (f.hkMin && !(l.hk >= f.hkMin)) continue;
    if (f.seatsMin && !(l.se >= f.seatsMin)) continue;
    if (f.sale === "brukt" && (l.auc || l.new)) continue;
    if (f.sale === "auksjon" && !(l.auc || l.s === "k")) continue;
    if (f.driftMax && a.rc.perMonth > f.driftMax) continue;
    if (f.minScore && a.score < f.minScore) continue;
    if (f.verdict === "topp" && a.verdict !== "topp") continue;
    if (f.verdict === "godt" && !(a.verdict === "topp" || a.verdict === "godt")) continue;
    if (f.onlyWarranty && !l.w) continue;
    if (f.onlyService && !l.svc) continue;
    if (f.onlyDrop && !(priceDrop(l) > 0)) continue;
    if (f.onlyNew && (daysOnMarket(l) ?? 99) > 7) continue;
    if (f.onlyTow && !(l.tr > 0 || l.eq?.includes("henger"))) continue;
    if (f.onlyEstimate && !a.est) continue;
    if (f.hideAbroad && (l.s !== "f" || l.abroad)) continue;
    if (f.hideSuspect && a.suspect) continue;
    if (origin) {
      const d = distanceTo(origin, l);
      if (f.distMax && (d == null || d > f.distMax)) continue;
      dist.set(l.id, d ?? 1e6);
    }
    if (terms.length) {
      const hay = `${l.mk} ${l.md} ${l.sp || ""} ${l.loc || ""} ${l.fy || ""} ${l.org || ""} ${l.id} ${l.y}`.toLowerCase();
      if (!terms.every(t => hay.includes(t))) continue;
    }
    out.push(l);
  }
  const key = {
    pris: l => A[l.id].effPrice,
    dyrest: l => -A[l.id].effPrice,
    score: l => -A[l.id].score,
    rabatt: l => -(A[l.id].disc ?? -9),
    drift: l => A[l.id].rc.drift,
    total: l => A[l.id].rc.total,
    km: l => l.km ?? 1e9,
    aar: l => -(l.y + (l.km ? -l.km / 1e7 : 0)),
    nyeste: l => -new Date(l.f || l.pub || 0).getTime(),
    prisned: l => -priceDrop(l),
    naer: l => dist.get(l.id) ?? 1e6,
  }[f.sort] || (l => A[l.id].effPrice);
  const keyed = out.map(l => [key(l), l]);
  keyed.sort((x, y) => x[0] - y[0]);
  return keyed.map(x => x[1]);
}

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);
