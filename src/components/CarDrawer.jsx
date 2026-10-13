import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Minus, Plus, Sparkles, X } from "lucide-react";
import { daysOnMarket, distanceTo, EQUIP_LABEL, loadDetails, originOf, useApp } from "../lib/data.js";
import { ageOf, CITIES, distKm, FUELS, listingUrl, SELLER, SOURCE, summarize, WD } from "../lib/analysis.js";
import { generate } from "../lib/gemini.js";
import { aiCacheGet, aiCacheSet } from "../lib/store.js";
import { dateNo, kr, num, pct } from "../lib/format.js";
import { Drawer, KV, Markdown, NumInput, ScoreBar, Sources, Spinner, Stat, VerdictBadge } from "./ui.jsx";
import { CompareButton, FavButton, Tags, Thumb, title } from "./ListView.jsx";

function Section({ title: t, children, right }) {
  return (
    <section className="border-t border-line px-5 py-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="h-title">{t}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

const S_LABEL = { pris: "Pris mot marked", km: "Kilometerstand", modell: "Modell", drift: "Brukskostnad", trygg: "Trygghet" };

/** Prisen plassert i usikkerhetsbåndet rundt estimert markedsverdi (±1 standardavvik). */
function PriceBand({ a, l }) {
  if (!a.est) return <p className="text-sm text-muted">For få sammenlignbare biler til å estimere markedsverdi for denne modellen.</p>;
  const sd = l.sd || 0.25;
  const lo = a.est * Math.exp(-sd), hi = a.est * Math.exp(sd);
  const min = Math.min(lo, a.effPrice) * 0.92, max = Math.max(hi, a.effPrice) * 1.08;
  const x = v => `${((v - min) / (max - min)) * 100}%`;
  return (
    <div>
      <div className="relative mt-7 h-2 rounded-full bg-line">
        <div className="absolute inset-y-0 rounded-full bg-accent/30" style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />
        <div className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-ink2" style={{ left: x(a.est) }} />
        <div className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent shadow" style={{ left: x(a.effPrice) }} />
        <div className="num absolute -top-6 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-accent" style={{ left: x(a.effPrice) }}>Denne: {kr(a.effPrice)}</div>
      </div>
      <div className="num mt-2 flex justify-between text-[11px] text-muted">
        <span>Lav: {kr(lo)}</span><span>Estimat: {kr(a.est)}</span><span>Høy: {kr(hi)}</span>
      </div>
      <p className="mt-2 text-xs text-ink2">
        Estimert ut fra {l.n ? `${num(l.n)} biler av samme modell og drivstoff` : "merket/modellen"} på Finn, justert for alder, km{l.r ? ", rekkevidde" : ""}, hjuldrift, girkasse og selgertype.
        Båndet viser typisk prisspredning for like biler. Annonsepriser, ikke salgspriser.
      </p>
    </div>
  );
}

function Similar({ l }) {
  const { listings, A, openListing } = useApp();
  const sims = useMemo(() => {
    const out = [];
    for (const x of listings) {
      if (x.id === l.id || x.mk !== l.mk || x.md !== l.md || x.fu !== l.fu) continue;
      const d = Math.abs(x.y - l.y) * 1 + Math.abs((x.km ?? 0) - (l.km ?? 0)) / 25000;
      out.push([d, x]);
    }
    return out.sort((p, q) => p[0] - q[0]).slice(0, 8).map(p => p[1]).sort((p, q) => A[p.id].effPrice - A[q.id].effPrice);
  }, [listings, l, A]);
  if (!sims.length) return null;
  return (
    <div className="mt-3">
      <div className="h-sub mb-1">Mest like biler til salgs nå</div>
      <div className="divide-y divide-line rounded-lg border border-line">
        {sims.map(x => (
          <button key={x.id} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-ink/[.03]" onClick={() => openListing(x.id)}>
            <span className="w-10 num">{x.y}</span>
            <span className="num w-24 text-ink2">{num(x.km)} km</span>
            <span className="min-w-0 flex-1 truncate text-ink2">{x.sp || ""} · {x.loc}</span>
            <span className="num font-semibold">{kr(A[x.id].effPrice)}</span>
            <span className={`num w-8 text-right ${A[x.id].score >= 60 ? "text-up" : "text-ink2"}`}>{A[x.id].score}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AiAssessment({ l, a, det }) {
  const { profile: P } = useApp();
  const key = `${l.id}:${l.p}`;
  const [res, setRes] = useState(() => aiCacheGet(key));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function run() {
    setBusy(true); setErr(null);
    try {
      const facts = summarize(l, a);
      const r = await generate({
        system: "Du er en erfaren, ærlig norsk bruktbilrådgiver (som en NAF-tester). Vurder bilen for en privat kjøper. Søk etter kjente svakheter, tilbakekallinger og typiske reparasjoner for akkurat denne modellen og årsmodellen (og batterihelse for elbil). Svar på norsk i markdown med overskriftene: **Kort konklusjon** (1–2 setninger), **Styrker**, **Kjente svakheter for modellen**, **Sjekk før kjøp** (konkrete punkter: servicehistorikk, EU-kontroll, batteritest/SOH, rust, heftelser i Brønnøysund, tilstandsrapport osv.), **Prisforhandling** (et fornuftig budintervall ut fra markedsverdien). Bruk tallene du får; ikke finn på fakta om bilen. Maks 300 ord.",
        messages: [{ role: "user", text: `Kjøpers profil: ${P.kmYear} km/år, mye kjøring Stavanger–Bergen (${P.sbTrips} turer/år), ${P.homeCharge ? "kan lade hjemme" : "kan ikke lade hjemme"}.\n\nBil:\n${JSON.stringify(facts, null, 1)}\n\nModellens begrunnelser:\n${a.reasons.map(r => (r.good ? "+ " : r.good === false ? "- " : "• ") + r.text).join("\n")}\n\nUtstyr: ${(det?.equip || []).slice(0, 40).join(", ") || "ukjent"}\n\nAnnonsetekst (utdrag):\n${(det?.desc || "").slice(0, 1400)}` }],
        search: true,
      });
      setRes(r);
      aiCacheSet(key, r);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {!res && <button className="btn-primary" onClick={run} disabled={busy}>{busy ? <Spinner /> : <Sparkles className="h-4 w-4" />} {busy ? "AI-en undersøker modellen …" : "Få AI-vurdering av bilen"}</button>}
      {err && <p className="mt-2 text-sm text-down">{err}</p>}
      {res && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
          <Markdown text={res.text} />
          <Sources sources={res.sources} />
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
            <span>{res.model}</span>
            <button className="hover:text-accent" onClick={run} disabled={busy}>{busy ? "…" : "Lag ny vurdering"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CostTable({ l, a }) {
  const { profile: P, E } = useApp();
  const rc = a.rc;
  const c = rc.cons;
  const consText = l.fu === "E" ? `${num(c.kwh, 1)} kWh/100 km`
    : FUELS[l.fu]?.phev ? `${num(c.l, 1)} l + ${num(c.kwh, 1)} kWh/100 km (${Math.round((c.elShare || 0) * 100)} % elektrisk)`
      : `${num(c.l, 1)} l/100 km`;
  const fuelPrice = ["D", "HD", "PD"].includes(l.fu) ? E.diesel : E.bensin;
  const rows = [
    ["Energi", rc.energi, `${consText} (${c.src}) × ${l.fu === "E" ? `${num(E.kwh, 2)} kr/kWh` : `${num(fuelPrice, 2)} kr/l`}`],
    ["Ferje/bom Stavanger–Bergen", rc.trips, `${P.sbTrips} turer tur/retur`],
    ["Bompenger i by", rc.bom, `${P.tollMonth} passeringer/mnd`],
    ["Forsikring (anslag)", rc.ins, "Grunnbeløp + andel av bilens verdi"],
    ["Trafikkforsikringsavgift", rc.tfa, l.fu === "E" ? "9,16 kr/dag (elbil)" : "6,52 kr/dag"],
    ["Service", rc.service, ""],
    ["Reparasjoner (risiko)", rc.repairs, "Avhenger av alder, km og modellens pålitelighet"],
    ["EU-kontroll", rc.eu, ""],
    ["Dekk", rc.tires, ""],
  ];
  const keep = Math.max(0, 1 - rc.dep / a.effPrice);           // andel av verdien som beholdes per år
  const depTotal = a.effPrice * (1 - keep ** P.years);
  const yearsTotal = rc.drift * P.years + depTotal;
  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat label="Drift per måned" value={kr(rc.perMonth)} sub={`${num(rc.perKm, 2)} kr/km`} />
        <Stat label="Verditap neste år" value={kr(rc.dep)} sub={l.dA ? `fra markedsmodellen` : "anslag"} />
        <Stat label={`Totalt over ${P.years} år`} value={kr(yearsTotal)} sub={`drift + verditap ${kr(depTotal)}`} hint="Eierperioden endres under Innstillinger" />
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.filter(r => r[1] > 0).map(([k, v, h]) => (
            <tr key={k} className="border-b border-line/60">
              <td className="py-1 text-ink2">{k}{h && <div className="text-[11px] text-muted">{h}</div>}</td>
              <td className="num py-1 text-right">{kr(v)}/år</td>
              <td className="num w-24 py-1 text-right text-muted">{kr(v / 12)}/mnd</td>
            </tr>
          ))}
          <tr><td className="pt-1.5 font-semibold">Sum drift</td><td className="num pt-1.5 text-right font-semibold">{kr(rc.drift)}/år</td><td className="num pt-1.5 text-right font-semibold">{kr(rc.perMonth)}</td></tr>
          <tr><td className="text-ink2">+ verditap</td><td className="num text-right">{kr(rc.dep)}/år</td><td className="num text-right text-muted">{kr(rc.dep / 12)}</td></tr>
          <tr><td className="font-semibold">Eierkostnad</td><td className="num text-right font-semibold">{kr(rc.total)}/år</td><td className="num text-right font-semibold">{kr(rc.totalMonth)}</td></tr>
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted">Med din kjøreprofil ({num(P.kmYear)} km/år, {P.highway} % landevei). {a.costPct != null && `Billigere i drift enn ${Math.round((1 - a.costPct) * 100)} % av alle biler.`} Forbruk er reelt helårsforbruk (estimat), ikke WLTP.</p>
    </div>
  );
}

function ImportBox({ l, a }) {
  const imp = a.imp;
  if (!imp) return null;
  return (
    <div>
      <KV k={`Pris i Sverige${l.ps ? ` (${num(l.ps)} SEK)` : ""}`} v={kr(l.p)} />
      <KV k="+ Merverdiavgift (mva)" v={kr(imp.mva)} hint={l.fu === "E" ? "Elbil: 25 % mva bare på den delen av prisen som er over 300 000 kr (2026)" : "25 % mva"} />
      <KV k={`+ Engangsavgift (bruksfradrag ${pct(imp.fradrag, 0)})`} v={kr(imp.eng)} hint={l.fu === "E" ? "Vektkomponent 12,71 kr/kg over 500 kg, redusert etter alder" : "Grovt anslag – CO₂-komponenten avhenger av nøyaktig utslipp"} />
      <KV k="+ Transport, EU-godkjenning, registrering" v={kr(imp.fees)} />
      <KV k="= Pris levert i Norge" v={kr(a.effPrice)} strong />
      {a.est && <KV k="Norsk markedsverdi (privat)" v={kr(a.est)} />}
      {l.kv && <KV k="KVDs egen markedsvurdering (Sverige)" v={kr(l.kv)} />}
      {l.bid && <KV k="Ledende bud nå" v={`${num(l.bid)} SEK`} />}
      {l.end && <KV k="Auksjonen avsluttes" v={dateNo(l.end, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} />}
      <p className={`mt-2 text-xs ${imp.sure ? "text-ink2" : "text-down"}`}>
        {imp.sure ? "Anslag – sjekk alltid nøyaktig avgift i" : "Engangsavgift for fossilbiler kan bli svært høy. Sjekk eksakt beløp i"}{" "}
        <a className="text-accent underline" href="https://www.skatteetaten.no/person/avgifter/bil/importere/" target="_blank" rel="noopener noreferrer">Skatteetatens importsider (med kalkulator)</a>.
      </p>
    </div>
  );
}

export default function CarDrawer({ l, onClose }) {
  const { A, notes, setNotes, openChat, filters } = useApp();
  const origin = originOf(filters);
  const dOrigin = distanceTo(origin, l);
  const a = A[l.id];
  const [det, setDet] = useState(null);
  useEffect(() => { let on = true; loadDetails().then(d => on && setDet(d[l.id] || null)); return () => { on = false; }; }, [l.id]);
  const note = notes[l.id] || {};
  const setNote = patch => setNotes(n => ({ ...n, [l.id]: { ...n[l.id], ...patch } }));
  if (!a) return null;
  const age = ageOf(l);
  const dom = daysOnMarket(l);
  const dSvg = distKm(CITIES.stavanger, { lat: l.la, lon: l.lo });
  const dBgo = distKm(CITIES.bergen, { lat: l.la, lon: l.lo });
  const bidDisc = note.bid && a.est ? (a.est - (note.bid + (a.imp?.total || 0))) / a.est : null;

  return (
    <Drawer onClose={onClose} label={title(l)}>
      <div className="relative">
        <Thumb l={l} w={960} className="aspect-[16/8]" />
        <div className="absolute right-3 top-3 flex gap-2">
          <CompareButton id={l.id} />
          <FavButton id={l.id} />
          <button className="grid h-8 w-8 place-items-center rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/60" onClick={onClose} aria-label="Lukk"><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-snug">{title(l)} <span className="font-normal text-ink2">{l.sp}</span></h2>
            <p className="text-sm text-ink2">{l.y} · {num(l.km)} km · {FUELS[l.fu]?.label} · {l.g === "A" ? "Automat" : "Manuell"}{l.wd ? ` · ${WD[l.wd]}` : ""} · {l.bo}</p>
          </div>
          <a className="btn-outline" href={listingUrl(l)} target="_blank" rel="noopener noreferrer">Se på {SOURCE[l.s].split(" ")[0]} <ExternalLink className="h-3.5 w-3.5" /></a>
        </div>
        <Tags l={l} a={a} />
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-raised p-3">
          <VerdictBadge verdict={a.verdict} score={a.score} />
          <span className="num text-xl font-semibold">{kr(a.effPrice)}</span>
          {a.disc != null && <span className={`text-sm font-medium ${a.disc > 0.03 ? "text-up" : a.disc < -0.05 ? "text-down" : "text-ink2"}`}>{pct(Math.abs(a.disc), 0)} {a.disc > 0 ? "under" : "over"} markedsverdi</span>}
          <div className="w-full space-y-1.5">
            {Object.entries(a.s).map(([k, v]) => <ScoreBar key={k} label={S_LABEL[k]} value={v} />)}
          </div>
        </div>
      </div>

      <Section title="Hvorfor?">
        <ul className="space-y-1.5">
          {a.reasons.map((r, i) => (
            <li key={i} className="flex gap-2 text-sm">
              {r.good ? <Plus className="mt-0.5 h-4 w-4 shrink-0 text-up" aria-label="Positivt" /> : r.good === false ? <Minus className="mt-0.5 h-4 w-4 shrink-0 text-down" aria-label="Negativt" /> : <span className="mt-0.5 h-4 w-4 shrink-0 text-center text-muted">•</span>}
              <span className="text-ink2">{r.text}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="AI-vurdering" right={<button className="btn-ghost text-xs" onClick={() => { onClose(); openChat(); setTimeout(() => window.dispatchEvent(new CustomEvent("agent-ask", { detail: `Fortell meg mer om bilen med id ${l.id} (${title(l)} ${l.y}). Er den et godt kjøp for meg, og hva bør jeg sjekke?` })), 100); }}>Spør agenten om denne</button>}>
        <AiAssessment l={l} a={a} det={det} />
      </Section>

      <Section title="Pris mot markedet">
        <PriceBand a={a} l={l} />
        {l.ph?.length > 1 && <div className="mt-2 text-xs text-ink2">Prishistorikk: {l.ph.map(([d, p]) => `${dateNo(d)}: ${kr(p)}`).join(" → ")}</div>}
        {l.also?.length > 0 && (
          <div className="mt-2 text-xs text-ink2">Også annonsert: {l.also.map((x, i) => <a key={i} className="mr-2 text-accent underline" href={x.url || `https://www.finn.no/mobility/item/${x.id}`} target="_blank" rel="noopener noreferrer">{x.org || x.src} {kr(x.price)}</a>)}</div>
        )}
        <Similar l={l} />
      </Section>

      {a.imp && <Section title="Import fra Sverige"><ImportBox l={l} a={a} /></Section>}

      <Section title="Brukskostnad">
        <CostTable l={l} a={a} />
      </Section>

      <Section title="Nøkkeltall">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Årsmodell" value={l.y} sub={l.r1 ? `1. reg. ${dateNo(l.r1, { month: "short", year: "numeric" })}` : null} />
          <Stat label="Kilometer" value={num(l.km)} sub={age >= 1 ? `${num(a.perYear)} km/år` : null} />
          <Stat label="Effekt" value={l.hk ? `${l.hk} hk` : "–"} sub={l.kg ? `${num(l.kg)} kg` : null} />
          <Stat label={l.fu === "E" ? "Rekkevidde (WLTP)" : "Drivstoff"} value={l.fu === "E" ? (l.r ? `${l.r} km` : "–") : FUELS[l.fu]?.short} sub={l.kwh ? `${l.kwh} kWh batteri` : null} />
        </div>
        <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
          <KV k="Selger" v={<span className="text-xs">{l.org || SELLER[l.sg] || "–"}</span>} />
          <KV k="Sted" v={<span className="text-xs">{[l.loc, l.fy].filter(Boolean).join(", ") || "–"}</span>} />
          {dOrigin != null && <KV k={`Avstand fra ${origin.label}`} v={`${num(dOrigin)} km (luftlinje)`} />}
          {dSvg != null && l.s === "f" && <KV k="Avstand Stavanger / Bergen" v={`${num(dSvg)} / ${num(dBgo)} km`} />}
          <KV k="Garanti" v={l.w ? `${l.w} mnd` : "–"} />
          {l.eu && <KV k="Neste EU-kontroll" v={dateNo(l.eu, { day: "numeric", month: "short", year: "numeric" })} />}
          {l.own && <KV k="Tidligere eiere" v={l.own} />}
          {l.col && <KV k="Farge" v={l.col} />}
          {l.se && <KV k="Seter" v={l.se} />}
          {l.tr != null && <KV k="Maks hengervekt" v={l.tr ? `${num(l.tr)} kg` : "Ingen"} />}
          {l.bt && <KV k="Bagasjerom" v={`${l.bt} l`} />}
          <KV k="Lagt ut / sett første gang" v={`${dateNo(l.pub || l.f)}${dom != null ? ` (${dom} dager)` : ""}`} />
          <KV k="Pålitelighet (merke/modell)" v={`${a.rel}/100`} />
        </div>
        {l.eq?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{l.eq.map(k => <span key={k} className="chip">{EQUIP_LABEL[k] || k}</span>)}</div>}
        {!l.det && l.s === "f" && <p className="mt-2 text-[11px] text-muted">Tekniske detaljer (effekt, vekt, EU-kontroll) hentes gradvis for de mest interessante bilene ved hver oppdatering.</p>}
      </Section>

      <Section title="Dine tall">
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="h-sub">Regn på et bud</span>
            <NumInput value={note.bid} onChange={v => setNote({ bid: v })} placeholder={String(l.p)} suffix="kr" /></label>
          {bidDisc != null && <div className="self-end text-sm text-ink2">Ved {kr(note.bid)} er bilen <b className={bidDisc > 0 ? "text-up" : "text-down"}>{pct(Math.abs(bidDisc), 0)} {bidDisc > 0 ? "under" : "over"}</b> markedsverdi.</div>}
          <label className="sm:col-span-2"><span className="h-sub">Notater (lagres i nettleseren)</span>
            <textarea className="input min-h-[70px]" value={note.note || ""} onChange={e => setNote({ note: e.target.value })} placeholder="F.eks. inntrykk fra prøvekjøring, spørsmål til selger …" /></label>
        </div>
      </Section>

      {(det?.desc || det?.equip?.length > 0) && (
        <Section title="Fra annonsen">
          {det.desc && <p className="whitespace-pre-line text-sm leading-relaxed text-ink2">{det.desc.slice(0, 1200)}{det.desc.length >= 1200 ? " …" : ""}</p>}
          {det.equip?.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{det.equip.map(e => <span key={e} className="chip">{e}</span>)}</div>}
        </Section>
      )}
      <div className="h-6" />
    </Drawer>
  );
}
