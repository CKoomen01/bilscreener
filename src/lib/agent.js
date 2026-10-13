// Verktøyene den innebygde AI-agenten (Gemini) kan bruke: søke i bilene, hente og sammenligne biler,
// endre filtre og kjøreprofil på siden, hente energipriser, søke på nettet, lese nettsider og
// starte en ny datainnhenting.
import { CITIES, FUELS, summarize, VERDICT } from "./analysis.js";
import { applyFilters, BODIES, originOf } from "./data.js";
import { generate } from "./gemini.js";
import { ACTIONS_URL, lastRun, triggerUpdate } from "./github.js";
import { DEFAULT_FILTERS } from "./store.js";

const S = (type, description, extra = {}) => ({ type, description, ...extra });
const FILTER_PROPS = {
  fritekst: S("string", "Fritekst, f.eks. «model y long range», «xc60», sted eller forhandler."),
  merker: S("array", "Bilmerker slik de står på Finn, f.eks. «Tesla», «Volkswagen», «Toyota».", { items: { type: "string" } }),
  modeller: S("array", "Modeller, f.eks. «Model Y», «ID.4», «RAV4». Krever merker.", { items: { type: "string" } }),
  drivstoff: S("array", "E=el, B=bensin, D=diesel, HB=hybrid bensin, HD=hybrid diesel, PB=ladbar hybrid bensin, PD=ladbar hybrid diesel.", { items: { type: "string", enum: ["E", "B", "D", "HB", "HD", "PB", "PD"] } }),
  karosseri: S("array", "Karosserityper.", { items: { type: "string", enum: BODIES } }),
  firehjulsdrift: S("boolean", "Bare firehjulsdrift."),
  girkasse: S("string", "A=automat, M=manuell.", { enum: ["A", "M"] }),
  min_pris: S("number", "Min pris i kr."),
  maks_pris: S("number", "Maks pris i kr (inkl. importkostnad for svenske biler)."),
  aar_fra: S("number", "Årsmodell fra."),
  aar_til: S("number", "Årsmodell til."),
  maks_km: S("number", "Maks kilometerstand."),
  min_rekkevidde: S("number", "Min. rekkevidde (WLTP) for elbil i km."),
  kilder: S("array", "f=Finn, b=Blocket (Sverige), k=KVD (Sverige). Tom = alle.", { items: { type: "string", enum: ["f", "b", "k"] } }),
  selger: S("array", "P=privat, M=merkeforhandler, A=annen bruktbilforhandler.", { items: { type: "string", enum: ["P", "M", "A"] } }),
  fylker: S("array", "Fylker, f.eks. «Rogaland», «Vestland».", { items: { type: "string" } }),
  avstand_fra: S("string", "By å måle avstand fra, eller «custom» med breddegrad/lengdegrad (f.eks. et sted brukeren nevner).", { enum: [...Object.keys(CITIES), "custom"] }),
  breddegrad: S("number", "Breddegrad for eget sted (avstand_fra=custom)."),
  lengdegrad: S("number", "Lengdegrad for eget sted (avstand_fra=custom)."),
  stedsnavn: S("string", "Navn på eget sted, vises på siden."),
  maks_avstand_km: S("number", "Maks avstand i km fra stedet (0 = ingen grense)."),
  maks_drift_mnd: S("number", "Maks brukskostnad per måned i kr."),
  min_score: S("number", "Minste score 0–100."),
  kun_garanti: S("boolean", "Bare biler med garanti."),
  kun_hengerfeste: S("boolean", "Bare biler med hengerfeste."),
  kun_prisnedsatt: S("boolean", "Bare prisnedsatte biler."),
  kun_nye: S("boolean", "Bare annonser fra siste 7 dager."),
  skjul_import: S("boolean", "Skjul svenske biler / biler i utlandet."),
  vis_mistenkelige: S("boolean", "Vis også biler med pris over 45 % under markedet (skjult som standard – ofte skade/feil)."),
  sorter: S("string", "Sortering. naer = nærmest valgt sted.", { enum: ["pris", "score", "rabatt", "drift", "total", "km", "aar", "nyeste", "prisned", "dyrest", "naer"] }),
};
const PROFILE_PROPS = {
  km_per_aar: S("number", "Kjørelengde per år."),
  andel_landevei: S("number", "Prosent landevei/motorvei (0–100)."),
  turer_stavanger_bergen: S("number", "Antall turer Stavanger–Bergen tur/retur per år."),
  lader_hjemme: S("boolean", "Kan lade hjemme."),
  andel_hjemmelading: S("number", "Prosent av ladingen hjemme."),
  stromsone: S("string", "Strømsone.", { enum: ["NO1", "NO2", "NO3", "NO4", "NO5"] }),
  stromavtale: S("string", "spot eller norgespris.", { enum: ["spot", "norgespris"] }),
  bompasseringer_mnd: S("number", "Bompasseringer i by per måned."),
  eierperiode_aar: S("number", "Hvor mange år brukeren vil eie bilen."),
  med_verditap: S("boolean", "Ta med verditap i brukskostnaden som rangeres."),
  vekt_pris: S("number", "Vekt 0–60 for pris mot marked."),
  vekt_km: S("number", "Vekt 0–60 for kilometerstand."),
  vekt_modell: S("number", "Vekt 0–60 for modell/pålitelighet."),
  vekt_drift: S("number", "Vekt 0–60 for brukskostnad."),
  vekt_trygghet: S("number", "Vekt 0–60 for garanti/historikk."),
};

export const DECLARATIONS = [
  {
    name: "sok_biler",
    description: "Søker blant alle biler i datasettet og returnerer de beste treffene med nøkkeltall, markedsverdi, brukskostnad og score. Endrer ikke siden.",
    parameters: { type: "object", properties: { ...FILTER_PROPS, antall: S("number", "Antall treff (standard 8, maks 25).") } },
  },
  {
    name: "hent_bil",
    description: "Henter alle detaljer, kostnader og begrunnelser for én bil (id fra søket, f.eks. Finn-kode).",
    parameters: { type: "object", properties: { id: S("string", "Bilens id") }, required: ["id"] },
  },
  {
    name: "sammenlign_biler",
    description: "Sammenligner 2–6 biler side om side.",
    parameters: { type: "object", properties: { ider: S("array", "Bil-id-er", { items: { type: "string" } }) }, required: ["ider"] },
  },
  {
    name: "vis_pa_siden",
    description: "Setter filtrene på nettsiden slik at brukeren ser utvalget. Bruk når brukeren ber deg vise/finne/filtrere biler.",
    parameters: { type: "object", properties: { ...FILTER_PROPS, nullstill: S("boolean", "Nullstill andre filtre først (standard true).") } },
  },
  {
    name: "apne_bil",
    description: "Åpner detaljvisningen for en bil på siden.",
    parameters: { type: "object", properties: { id: S("string", "Bilens id") }, required: ["id"] },
  },
  {
    name: "sett_kjoreprofil",
    description: "Endrer brukerens kjøreprofil og vekting av scoren (lagres). Bare felt som oppgis endres.",
    parameters: { type: "object", properties: PROFILE_PROPS },
  },
  {
    name: "favoritt",
    description: "Legger til eller fjerner en bil fra favorittene.",
    parameters: { type: "object", properties: { id: S("string", "Bilens id"), legg_til: S("boolean", "true = legg til, false = fjern") }, required: ["id"] },
  },
  {
    name: "markedsoversikt",
    description: "Energipriser (bensin, diesel, strøm per sone), valuta og statistikk per modell i nåværende utvalg (antall, medianpris, verditap, brukskostnad).",
    parameters: { type: "object", properties: { merke: S("string", "Valgfritt: bare dette merket") } },
  },
  {
    name: "datastatus",
    description: "Når dataene sist ble oppdatert og status for siste innhenting på GitHub.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "oppdater_data",
    description: "Starter en ny innhenting av annonser og priser (tar 40–90 min). Bare når brukeren ber om det.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "nettsok",
    description: "Søker på nettet (Google): kjente feil og tilbakekallinger for en modell, batterihelse, tester, priser på ferje/bom, regler for import, nyheter.",
    parameters: { type: "object", properties: { sporsmal: S("string", "Hva som skal søkes etter") }, required: ["sporsmal"] },
  },
  {
    name: "les_nettside",
    description: "Leser en nettside (f.eks. en bilannonse utenfor datasettet eller en test) og trekker ut det viktigste.",
    parameters: { type: "object", properties: { url: S("string", "Full URL"), hva: S("string", "Hva du vil finne ut") }, required: ["url"] },
  },
];

function filtersFromArgs(a, base, listings) {
  const f = { ...base };
  if (a.fritekst != null) f.q = a.fritekst;
  if (a.merker) {
    const all = [...new Set(listings.map(l => l.mk))];
    f.makes = a.merker.flatMap(m => all.filter(x => x.toLowerCase() === String(m).toLowerCase() || x.toLowerCase().startsWith(String(m).toLowerCase())));
  }
  if (a.modeller) {
    const ms = new Set(f.makes);
    const all = [...new Set(listings.filter(l => !ms.size || ms.has(l.mk)).map(l => `${l.mk}|${l.md}`))];
    f.models = a.modeller.flatMap(m => all.filter(x => x.split("|")[1].toLowerCase().replace(/\s/g, "").includes(String(m).toLowerCase().replace(/\s/g, ""))));
    if (!f.makes.length) f.makes = [...new Set(f.models.map(x => x.split("|")[0]))];
  }
  if (a.drivstoff) f.fuels = a.drivstoff;
  if (a.karosseri) f.bodies = a.karosseri;
  if (a.firehjulsdrift != null) f.wd = a.firehjulsdrift ? ["4"] : [];
  if (a.girkasse) f.gear = a.girkasse;
  if (a.min_pris != null) f.priceMin = a.min_pris;
  if (a.maks_pris != null) f.priceMax = a.maks_pris;
  if (a.aar_fra != null) f.yearMin = a.aar_fra;
  if (a.aar_til != null) f.yearMax = a.aar_til;
  if (a.maks_km != null) f.kmMax = a.maks_km;
  if (a.min_rekkevidde != null) f.rangeMin = a.min_rekkevidde;
  if (a.kilder) f.sources = a.kilder;
  if (a.selger) f.sellers = a.selger;
  if (a.fylker) f.fylker = a.fylker;
  if (a.avstand_fra) {
    f.distFrom = a.avstand_fra;
    f.distMax = a.maks_avstand_km ?? 100;
    if (a.avstand_fra === "custom") { f.distLat = a.breddegrad; f.distLon = a.lengdegrad; f.distLabel = a.stedsnavn || "Valgt sted"; }
  }
  if (a.maks_drift_mnd != null) f.driftMax = a.maks_drift_mnd;
  if (a.min_score != null) f.minScore = a.min_score;
  if (a.kun_garanti != null) f.onlyWarranty = a.kun_garanti;
  if (a.kun_hengerfeste != null) f.onlyTow = a.kun_hengerfeste;
  if (a.kun_prisnedsatt != null) f.onlyDrop = a.kun_prisnedsatt;
  if (a.kun_nye != null) f.onlyNew = a.kun_nye;
  if (a.skjul_import != null) f.hideAbroad = a.skjul_import;
  if (a.vis_mistenkelige != null) f.hideSuspect = !a.vis_mistenkelige;
  if (a.sorter) f.sort = a.sorter;
  return f;
}

const median = xs => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

/** getCtx() returnerer alltid siste tilstand fra appen. */
export function createExecutor(getCtx) {
  return async function execute(name, args) {
    const c = getCtx();
    const byId = id => c.byId.get(String(id)) || c.byId.get(String(id).replace(/\D/g, ""));

    switch (name) {
      case "sok_biler": {
        const f = filtersFromArgs(args, { ...DEFAULT_FILTERS, sort: args.sorter || "score" }, c.listings);
        const hits = applyFilters(c.listings, c.A, f);
        const n = Math.min(25, args.antall || 8);
        return { antall_treff: hits.length, sortering: f.sort, biler: hits.slice(0, n).map(l => summarize(l, c.A[l.id])) };
      }
      case "hent_bil": {
        const l = byId(args.id);
        if (!l) return { feil: "Fant ikke bilen i datasettet. Bruk les_nettside med lenken for biler utenfor datasettet." };
        const a = c.A[l.id];
        return {
          ...summarize(l, a),
          lenke: l.url || `https://www.finn.no/mobility/item/${l.id}`,
          prishistorikk: l.ph, ogsa_annonsert: l.also,
          begrunnelser: a.reasons.map(r => `${r.good ? "+" : r.good === false ? "−" : "•"} ${r.text}`),
          kostnader_per_aar: Object.fromEntries(["energi", "trips", "bom", "tfa", "ins", "service", "repairs", "eu", "tires", "drift", "dep", "total"].map(k => [k, Math.round(a.rc[k])])),
          forbruk: a.rc.cons, import: a.imp, palitelighet: a.rel,
          eu_kontroll: l.eu, eiere: l.own, vekt: l.kg, utstyr: l.eq, hengervekt: l.tr,
        };
      }
      case "sammenlign_biler": {
        return (args.ider || []).slice(0, 6).map(id => {
          const l = byId(id);
          return l ? summarize(l, c.A[l.id]) : { id, feil: "ikke funnet" };
        });
      }
      case "vis_pa_siden": {
        const base = args.nullstill === false ? c.filters : { ...DEFAULT_FILTERS };
        const f = filtersFromArgs(args, base, c.listings);
        c.setFilters(f);
        if (!["liste", "dashbord", "kart"].includes(c.view)) c.setView("liste");
        const hits = applyFilters(c.listings, c.A, f);
        return { ok: true, viser: hits.length, topp3: hits.slice(0, 3).map(l => summarize(l, c.A[l.id])) };
      }
      case "apne_bil": {
        const l = byId(args.id);
        if (!l) return { feil: "Fant ikke bilen." };
        c.openListing(l.id);
        return { ok: true };
      }
      case "sett_kjoreprofil": {
        const map = {
          km_per_aar: "kmYear", andel_landevei: "highway", turer_stavanger_bergen: "sbTrips", lader_hjemme: "homeCharge",
          andel_hjemmelading: "homeShare", stromsone: "zone", stromavtale: "tariff", bompasseringer_mnd: "tollMonth",
          eierperiode_aar: "years", med_verditap: "withDep",
        };
        const wmap = { vekt_pris: "pris", vekt_km: "km", vekt_modell: "modell", vekt_drift: "drift", vekt_trygghet: "trygg" };
        const p = {}, w = {};
        for (const [k, v] of Object.entries(args)) {
          if (v == null) continue;
          if (map[k]) p[map[k]] = v;
          if (wmap[k]) w[wmap[k]] = v;
        }
        if (Object.keys(p).length) c.setProfile(s => ({ ...s, ...p }));
        if (Object.keys(w).length) c.setWeights(s => ({ ...s, ...w }));
        return { ok: true, profil: p, vekter: w };
      }
      case "favoritt": {
        const id = String(args.id);
        const add = args.legg_til !== false;
        c.setFavorites(f => (add ? [...new Set([...f, id])] : f.filter(x => x !== id)));
        return { ok: true };
      }
      case "markedsoversikt": {
        const items = args.merke ? c.filtered.filter(l => l.mk.toLowerCase() === args.merke.toLowerCase()) : c.filtered;
        const g = new Map();
        for (const l of items) { const k = `${l.mk} ${l.md}`; if (!g.has(k)) g.set(k, []); g.get(k).push(l); }
        const models = [...g.entries()].filter(([, ls]) => ls.length >= 5).sort((a, b) => b[1].length - a[1].length).slice(0, 25).map(([k, ls]) => ({
          modell: k, antall: ls.length,
          medianpris: median(ls.map(l => c.A[l.id].effPrice)), median_aar: median(ls.map(l => l.y)),
          brukskost_mnd: Math.round(median(ls.map(l => c.A[l.id].rc.perMonth))),
          verditap_pst_aar: +(100 * median(ls.map(l => c.A[l.id].rc.dep / c.A[l.id].effPrice))).toFixed(1),
          toppkjop: ls.filter(l => c.A[l.id].verdict === "topp").length,
        }));
        return {
          energipriser: { bensin_kr_l: c.E.bensin, diesel_kr_l: c.E.diesel, strom_spot: c.E.spot, strom_hjemme: c.E.home, snitt_lading: c.E.kwh, sone: c.profile.zone },
          valuta: c.market?.prices?.fx, antall_i_utvalg: items.length, modeller: models,
        };
      }
      case "datastatus": {
        const run = await lastRun().catch(() => null);
        return { sist_oppdatert: c.meta.updated, antall_biler: c.meta.count, kilder: c.meta.sources, med_detaljer: c.meta.withDetails, siste_kjoring: run };
      }
      case "oppdater_data": {
        const r = await triggerUpdate();
        if (r.ok) return { ok: true, melding: "Innhenting startet. Nye data er på siden om ca. 40–90 minutter (last siden på nytt da).", lenke: r.url };
        if (r.needToken) return { ok: false, melding: `For å starte innhenting herfra må brukeren legge inn et GitHub-token under Innstillinger. Alternativt: åpne ${ACTIONS_URL} og trykk «Run workflow». Data oppdateres uansett automatisk to ganger i døgnet.` };
        return { ok: false, melding: r.error, lenke: r.url };
      }
      case "nettsok": {
        const r = await generate({
          system: "Du er en norsk research-assistent for bruktbilkjøp. Svar kort og faktabasert på norsk, med tall, årsmodeller og kilder der det finnes.",
          messages: [{ role: "user", text: args.sporsmal }],
          search: true,
        });
        return { svar: r.text, kilder: r.sources.slice(0, 5) };
      }
      case "les_nettside": {
        const r = await generate({
          system: "Du leser nettsider for en bilkjøper. Trekk ut fakta: merke/modell/versjon, årsmodell, km, pris, drivstoff, effekt, rekkevidde/batteri, utstyr, servicehistorikk, eiere, EU-kontroll, garanti, skader. Svar på norsk, kort. Si tydelig fra hvis siden ikke kunne leses.",
          messages: [{ role: "user", text: `Les ${args.url}. ${args.hva || ""}` }],
          urlContext: true,
        });
        return { innhold: r.text, kilder: r.sources.slice(0, 3) };
      }
      default:
        return { feil: `Ukjent verktøy ${name}` };
    }
  };
}

export function agentSystemPrompt(c) {
  const P = c.profile;
  const W = c.weights;
  return `Du er «Bilagenten», en hjelpsom norsk AI-rådgiver innebygd i Bilscreener – en nettside som samler bruktbiler fra Finn.no (hele Norge), Blocket.se (elbiler for import) og KVD (svenske auksjoner), og gir hver bil en score.

Brukeren er en privatperson (NHH-student) som leter etter det beste bilkjøpet og kommer til å kjøre mye mellom Stavanger og Bergen. Svar alltid på norsk bokmål, kort og konkret. Bruk verktøyene aktivt i stedet for å gjette. Når brukeren ber deg «finne», «vise» eller «filtrere»: bruk vis_pa_siden slik at siden oppdateres, og oppsummer de beste treffene. Når du nevner en bil: oppgi id, merke/modell/år/km/pris og lenk som markdown: [Merke Modell år](lenke) – Finn-lenke er https://www.finn.no/mobility/item/ID (svenske biler har egen lenke i hent_bil).

Slik fungerer scoren (0–100): vektet snitt av pris mot markedsverdi (statistisk modell over alle Finn-biler av samme modell/drivstoff, justert for alder, km, rekkevidde, 4×4, girkasse, selger), kilometerstand (km/år mot ~13 500), modell (pålitelighet, skjønnsmessig), brukskostnad (persentil blant alle biler: energi med dagens priser, ferje/bom Stavanger–Bergen, bompenger, forsikring, trafikkforsikringsavgift, service, reparasjonsrisiko, dekk) og trygghet (garanti, servicehefte, eiere, EU-kontroll). Toppkjøp ≥ 78, Godt kjøp ≥ 66, OK ≥ 50. For svenske biler inkluderer prisen anslått mva, engangsavgift, transport og registrering (grovt for fossilbiler). Tallene er estimater – minn om prøvekjøring, servicehistorikk, EU-kontroll, heftelsessjekk og (for elbil) batteritest når det er relevant. Du er ikke en autorisert finansiell rådgiver.

Nå: ${P.kmYear} km/år, ${P.highway} % landevei, ${P.sbTrips} turer Stavanger–Bergen/år, ${P.homeCharge ? `lader hjemme ${P.homeShare} %` : "lader ikke hjemme"}, strømsone ${P.zone} (${P.tariff}), ${P.tollMonth} bompasseringer/mnd. Vekter: pris ${W.pris}, km ${W.km}, modell ${W.modell}, drift ${W.drift}, trygghet ${W.trygg}.
Energipriser: bensin ${c.E.bensin?.toFixed(2)} kr/l, diesel ${c.E.diesel?.toFixed(2)} kr/l, strøm hjemme ${c.E.home?.toFixed(2)} kr/kWh, snitt lading ${c.E.kwh?.toFixed(2)} kr/kWh.
Brukerens valgte posisjon: ${(() => { const o = originOf(c.filters); return o ? `${o.label} (${o.lat.toFixed(4)}, ${o.lon.toFixed(4)}), radius ${c.filters.distMax || "ingen grense"} km – bruk avstand_fra=custom med disse koordinatene når brukeren sier «i nærheten», «rundt meg» o.l.` : "ingen (brukeren kan trykke «Område / GPS»)"; })()}
Data sist oppdatert: ${c.meta.updated || "ukjent"}. Biler totalt: ${c.meta.count}. I nåværende filter: ${c.filtered.length}. Drivstoffkoder: ${Object.entries(FUELS).map(([k, v]) => `${k}=${v.short}`).join(", ")}. Vurderinger: ${Object.values(VERDICT).map(v => v.label).join(", ")}. Dagens dato: ${new Date().toISOString().slice(0, 10)}.`;
}

export const STEP_LABEL = {
  sok_biler: "Søker i biler",
  hent_bil: "Henter bildetaljer",
  sammenlign_biler: "Sammenligner biler",
  vis_pa_siden: "Oppdaterer filtrene på siden",
  apne_bil: "Åpner bil",
  sett_kjoreprofil: "Endrer kjøreprofil",
  favoritt: "Oppdaterer favoritter",
  markedsoversikt: "Henter markedsoversikt",
  datastatus: "Sjekker datastatus",
  oppdater_data: "Starter datainnhenting",
  nettsok: "Søker på nettet",
  les_nettside: "Leser nettside",
};
