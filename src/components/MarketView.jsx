import { useMemo, useState } from "react";
import { useApp } from "../lib/data.js";
import { SERIES, useDark } from "../lib/colors.js";
import { kr, num, pct } from "../lib/format.js";
import LineChart from "./LineChart.jsx";
import { Seg, Stat } from "./ui.jsx";

const MONTHS = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
const mFmt = x => { const [y, m] = x.split("-"); return `${MONTHS[+m - 1]} ${y.slice(2)}`; };
const median = xs => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

function ModelTable({ items }) {
  const { A, setFilters, setView } = useApp();
  const [sort, setSort] = useState("n");
  const rows = useMemo(() => {
    const g = new Map();
    for (const l of items) {
      const k = `${l.mk}|${l.md}`;
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(l);
    }
    return [...g.entries()].filter(([, ls]) => ls.length >= 5).map(([k, ls]) => {
      const as = ls.map(l => A[l.id]);
      return {
        k, mk: ls[0].mk, md: ls[0].md, n: ls.length,
        price: median(as.map(a => a.effPrice)), year: median(ls.map(l => l.y)), km: median(ls.map(l => l.km ?? 0)),
        drift: median(as.map(a => a.rc.perMonth)), dep: median(as.map(a => a.rc.dep / a.effPrice)),
        score: median(as.map(a => a.score)), topp: as.filter(a => a.verdict === "topp").length,
      };
    });
  }, [items, A]);
  const key = { n: r => -r.n, score: r => -r.score, drift: r => r.drift, dep: r => r.dep, topp: r => -r.topp, price: r => r.price }[sort];
  const shown = [...rows].sort((a, b) => key(a) - key(b)).slice(0, 40);
  return (
    <section className="card card-pad">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="h-title">Modeller i utvalget <span className="font-normal text-muted">(minst 5 biler)</span></h2>
        <Seg label="Sorter" value={sort} onChange={setSort} options={[["n", "Flest"], ["score", "Score"], ["topp", "Toppkjøp"], ["drift", "Billig drift"], ["dep", "Lavt verditap"], ["price", "Pris"]]} />
      </div>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className="th">Modell</th><th className="th text-right">Antall</th><th className="th text-right">Medianpris</th>
              <th className="th text-right">Årsmodell</th><th className="th text-right">Km</th><th className="th text-right">Drift/mnd</th>
              <th className="th text-right">Verditap/år</th><th className="th text-right">Score</th><th className="th text-right">Toppkjøp</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.k} className="cursor-pointer border-b border-line/60 hover:bg-ink/[.03]" title="Vis disse bilene"
                onClick={() => { setFilters(f => ({ ...f, makes: [r.mk], models: [r.k] })); setView("liste"); }}>
                <td className="td font-medium">{r.mk} {r.md}</td>
                <td className="td num text-right">{num(r.n)}</td>
                <td className="td num text-right">{kr(r.price)}</td>
                <td className="td num text-right">{r.year}</td>
                <td className="td num text-right">{num(r.km)}</td>
                <td className="td num text-right">{kr(r.drift)}</td>
                <td className="td num text-right">{pct(r.dep, 1)}</td>
                <td className="td num text-right">{r.score}</td>
                <td className="td num text-right">{r.topp || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function MarketView({ items }) {
  const { market, E, profile: P, meta } = useApp();
  const dark = useDark();
  const S = SERIES[dark ? "dark" : "light"];
  const fuel = market?.prices?.fuel || {};
  const power = market?.prices?.power || {};
  const fx = market?.prices?.fx || {};
  const zones = ["NO2", "NO5", "NO1", "NO3", "NO4"].filter(z => power[z]?.monthly?.length);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Stat label="Bensin 95 (SSB)" value={`${num(E.bensin, 1)} kr/l`} sub={fuel.bensin?.at(-1)?.[0] ? mFmt(fuel.bensin.at(-1)[0]) : null} />
        <Stat label="Diesel (SSB)" value={`${num(E.diesel, 1)} kr/l`} sub={fuel.diesel?.at(-1)?.[0] ? mFmt(fuel.diesel.at(-1)[0]) : null} />
        <Stat label={`Spot ${P.zone}, 30 dager`} value={`${num(E.spot, 1)} kr/kWh`} sub="eks. mva og nettleie" />
        <Stat label="Lading hjemme" value={`${num(E.home, 1)} kr/kWh`} sub={P.tariff === "norgespris" ? "Norgespris + nett" : `etter strømstøtte ${num(E.stotte, 2)}`} />
        <Stat label="SEK → NOK" value={fx.SEK ? fx.SEK.toFixed(4) : "–"} sub={fx.EUR ? `EUR ${fx.EUR.toFixed(2)}` : null} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card card-pad">
          <h2 className="h-title mb-2">Pumpepris per måned (kr/l, SSB)</h2>
          <LineChart series={[
            { label: "Bensin 95", color: S[0], data: fuel.bensin || [] },
            { label: "Diesel", color: S[1], data: fuel.diesel || [] },
          ].filter(s => s.data.length)} fmt={v => v.toFixed(1)} xFmt={mFmt} />
        </section>
        <section className="card card-pad">
          <h2 className="h-title mb-2">Spotpris strøm per måned (kr/kWh eks. mva)</h2>
          {zones.length ? (
            <LineChart series={zones.map((z, i) => ({ label: power[z].name, color: S[i], data: power[z].monthly }))} fmt={v => v.toFixed(2)} xFmt={mFmt} />
          ) : <p className="text-sm text-muted">Ingen strømdata.</p>}
          <p className="mt-2 text-[11px] text-muted">Kilde: hvakosterstrommen.no (Nord Pool). Historikken bygges opp for hver dag siden henter data.</p>
        </section>
      </div>

      <ModelTable items={items} />

      <section className="card card-pad text-xs text-ink2">
        <h2 className="h-title mb-1">Om dataene</h2>
        <p>Sist oppdatert {meta.updated ? new Date(meta.updated + "Z").toLocaleString("nb-NO") : "ukjent"}. {num(meta.count)} biler totalt
          {meta.sources ? ` (${Object.entries(meta.sources).map(([k, v]) => `${k}: ${num(v.n)}`).join(", ")})` : ""}.
          Finn og Blocket hentes fra sidenes egne søke-API-er, KVD fra det åpne auksjons-API-et. Duplikater (samme registreringsnummer) er slått sammen.
          Norske forhandlere (Møller, Bilia, Bertel O. Steen, Hedin m.fl.) legger alle bruktbiler ut på Finn, så de er med der – du kan søke på forhandlernavn i søkefeltet.</p>
      </section>
    </div>
  );
}
