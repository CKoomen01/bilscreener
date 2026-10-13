// Små tilstandslagre som lagres i nettleseren (localStorage).
// Alt du legger inn (API-nøkkel, favoritter, kjøreprofil) blir værende på denne enheten.
import { useSyncExternalStore } from "react";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function createStore(key, fallback) {
  let state = read(key, fallback);
  const isObj = v => v && typeof v === "object" && !Array.isArray(v);
  if (isObj(fallback)) state = isObj(state) ? { ...fallback, ...state } : fallback;
  else if (Array.isArray(fallback) && !Array.isArray(state)) state = fallback;
  const subs = new Set();
  return {
    get: () => state,
    set(next) {
      state = typeof next === "function" ? next(state) : next;
      try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* full eller blokkert */ }
      subs.forEach(fn => fn());
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

/** Kjøreprofilen – påvirker brukskostnad og dermed rangeringen. */
export const DEFAULT_PROFILE = {
  kmYear: 15000,         // kjørelengde per år
  highway: 50,           // % landevei/motorvei (resten by/tettsted)
  sbTrips: 6,            // turer Stavanger–Bergen tur/retur per år (to ferjer hver vei)
  homeCharge: true,      // lading hjemme
  homeShare: 85,         // % av ladingen som skjer hjemme
  zone: "NO2",           // strømsone (NO2 = Stavanger, NO5 = Bergen)
  tariff: "spot",        // spot (med strømstøtte) | norgespris
  tollMonth: 40,         // bompasseringer per måned (Nord-Jæren / Bergen)
  years: 4,              // hvor lenge du regner med å eie bilen
  withDep: false,        // ta med verditap i brukskostnaden som rangeres
};

/** Vekter for totalscoren (0–100 hver). */
export const DEFAULT_WEIGHTS = { pris: 40, km: 20, modell: 15, drift: 20, trygg: 5 };

/** Priser og forutsetninger. null = hentes automatisk fra dataene (SSB / strømbørs). */
export const DEFAULT_ASSUMPTIONS = {
  bensin: null,          // kr/l
  diesel: null,          // kr/l
  spot: null,            // kr/kWh eks. mva (null = snitt siste 30 dager i valgt sone)
  grid: 0.55,            // nettleie + elavgift, kr/kWh inkl. mva
  norgespris: 0.5,       // kr/kWh inkl. mva
  fastCharge: 4.9,       // hurtiglading kr/kWh
  chargeLoss: 10,        // % ladetap hjemme
  tripFossil: 330,       // ferje + bom per enveis Stavanger–Bergen (fossil/hybrid, AutoPASS-avtale)
  tripEl: 190,           // samme for elbil (rabatt på ferje og bom)
  tollFossil: 30,        // kr per bompassering i by (fossil)
  tollEl: 12,            // kr per bompassering i by (elbil)
  tfaFossil: 2380,       // trafikkforsikringsavgift per år (2026: 6,52 kr/dag)
  tfaEl: 3343,           // elbil (2026: 9,16 kr/dag)
  insBase: 3500,         // forsikring: grunnbeløp per år
  insPct: 1.6,           // + % av bilens verdi
  tiresKm: 0.15,         // dekkslitasje kr/km
  importTransport: 9000, // transport fra Sverige til Vestlandet
  importFees: 6000,      // EU-godkjenning, kjennemerker, vrakpant, registrering
  mvaLimitEv: 300000,    // mva-fri grense elbil 2026
  engEvKg: 12.71,        // engangsavgift elbil: kr per kg over 500 kg (2026)
};

export const settingsStore = createStore("bs.settings", {
  apiKey: "",
  model: "",
  models: [],
  theme: "system",
  ghToken: "",
  seenIntro: false,
});
export const profileStore = createStore("bs.profile", DEFAULT_PROFILE);
export const weightsStore = createStore("bs.weights", DEFAULT_WEIGHTS);
export const assumptionsStore = createStore("bs.assumptions", DEFAULT_ASSUMPTIONS);

export const DEFAULT_FILTERS = {
  q: "",
  makes: [],
  models: [],
  fuels: [],             // E, B, D, HB, HD, PB, PD
  gear: "",              // "" | A | M
  wd: [],                // 4, F, R
  bodies: [],
  priceMin: 0,
  priceMax: 0,
  yearMin: 0,
  yearMax: 0,
  kmMin: 0,
  kmMax: 0,
  rangeMin: 0,
  hkMin: 0,
  seatsMin: 0,
  sources: [],           // finn, blocket, kvd (tom = alle)
  sellers: [],           // P, M, A
  sale: "alle",          // alle | brukt | auksjon
  fylker: [],
  distFrom: "",          // by-nøkkel, "gps" eller "custom" ("" = ingen posisjon)
  distLat: null,         // posisjon for gps/custom
  distLon: null,
  distLabel: "",
  distMax: 0,            // km (0 = ingen grense, men avstand vises og kan sorteres på)
  driftMax: 0,           // maks brukskostnad kr/mnd
  minScore: 0,
  verdict: "alle",       // alle | topp | godt
  onlyWarranty: false,
  onlyService: false,
  onlyDrop: false,
  onlyNew: false,
  onlyTow: false,
  onlyEstimate: false,
  hideAbroad: false,
  hideSuspect: true,     // skjul priser langt under markedet (skade, feil, månedspris)
  sort: "pris",
};
export const filtersStore = createStore("bs.filters", DEFAULT_FILTERS);
export const favoritesStore = createStore("bs.favorites", []);
export const compareStore = createStore("bs.compare", []);
export const notesStore = createStore("bs.notes", {});   // { id: { note, bid } }
export const chatStore = createStore("bs.chat", { msgs: [], contents: [] });

export function useStore(store) {
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  return [state, store.set];
}

export function aiCacheGet(key) {
  try { return JSON.parse(localStorage.getItem(`bs.ai.${key}`)); } catch { return null; }
}
export function aiCacheSet(key, value) {
  try {
    localStorage.setItem(`bs.ai.${key}`, JSON.stringify(value));
  } catch {
    Object.keys(localStorage).filter(k => k.startsWith("bs.ai.")).forEach(k => localStorage.removeItem(k));
  }
}
