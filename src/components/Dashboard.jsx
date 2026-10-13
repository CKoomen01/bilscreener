import { useMemo, useState } from "react";
import { Award, Info, Trophy } from "lucide-react";
import { useApp } from "../lib/data.js";
import { ageOf, FUELS, VERDICT } from "../lib/analysis.js";
import { kr, num, pct } from "../lib/format.js";
import { CHROME, useDark } from "../lib/colors.js";
import { CarCard, Thumb, title } from "./ListView.jsx";
import { Stat, VerdictBadge } from "./ui.jsx";

const median = xs => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const V_COLOR = { topp: "rgb(var(--good))", godt: "rgb(var(--accent))", ok: "rgb(var(--warn))", svak: "rgb(var(--bad))" };

/** Pris (x, log) mot avvik fra markedsverdi (y). Hver prikk er en bil. */
function ValueMap({ items }) {
  const { A, openListing } = useApp();
  const dark = useDark();
  const C = CHROME[dark ? "dark" : "light"];
  const [hover, setHover] = useState(null);
  const pts = useMemo(() => {
    const withEst = items.filter(l => A[l.id]?.disc != null);
    // Maks 2500 prikker: de beste + et jevnt utvalg av resten
    const best = [...withEst].sort((a, b) => A[b.id].score - A[a.id].score).slice(0, 600);
    const rest = withEst.filter((_, i) => i % Math.max(1, Math.ceil(withEst.length / 1900)) === 0);
    const set = new Map([...rest, ...best].map(l => [l.id, l]));
    return [...set.values()];
  }, [items, A]);
  if (pts.length < 5) return null;
  const W = 760, H = 320, m = { l: 52, r: 12, t: 12, b: 34 };
  const prices = pts.map(l => A[l.id].effPrice);
  const xmin = Math.max(10000, Math.min(...prices)), xmax = Math.max(...prices);
  const lx = v => m.l + ((Math.log(Math.max(v, xmin)) - Math.log(xmin)) / (Math.log(xmax) - Math.log(xmin) || 1)) * (W - m.l - m.r);
  const ymax = 0.4;
  const ly = v => m.t + ((ymax - Math.max(-ymax, Math.min(ymax, v))) / (2 * ymax)) * (H - m.t - m.b);
  const xt = [20e3, 50e3, 100e3, 200e3, 500e3, 1e6, 2e6].filter(v => v >= xmin && v <= xmax);
  const yt = [-0.4, -0.2, 0, 0.2, 0.4];
  const h = hover ? A[hover.id] : null;
  return (
    <section className="card card-pad">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="h-title">Verdikart – pris mot markedsverdi</h2>
        <div className="flex flex-wrap gap-3 text-xs text-ink2">
          {Object.entries(VERDICT).map(([k, v]) => <span key={k} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: V_COLOR[k] }} />{v.label}</span>)}
        </div>
      </div>
      <p className="mb-2 text-xs text-muted">Over midtlinjen = billigere enn lignende biler. Farge = samlet score. Trykk på en prikk for å åpne bilen.</p>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Spredningsplott av pris mot avvik fra markedsverdi">
          {yt.map(v => (
            <g key={v}>
              <line x1={m.l} x2={W - m.r} y1={ly(v)} y2={ly(v)} stroke={v === 0 ? C.axis : C.grid} strokeWidth={v === 0 ? 1.2 : 1} />
              <text x={m.l - 6} y={ly(v) + 4} textAnchor="end" fontSize="11" fill={C.muted}>{v > 0 ? `${v * 100} % under` : v < 0 ? `${-v * 100} % over` : "marked"}</text>
            </g>
          ))}
          {xt.map(v => (
            <g key={v}>
              <line x1={lx(v)} x2={lx(v)} y1={m.t} y2={H - m.b} stroke={C.grid} />
              <text x={lx(v)} y={H - m.b + 16} textAnchor="middle" fontSize="11" fill={C.muted}>{v >= 1e6 ? `${v / 1e6} mill` : `${v / 1000}k`}</text>
            </g>
          ))}
          {pts.map(l => {
            const a = A[l.id];
            return (
              <circle key={l.id} cx={lx(a.effPrice)} cy={ly(a.disc)} r={a.verdict === "topp" ? 3.6 : 2.6}
                fill={V_COLOR[a.verdict]} fillOpacity={a.verdict === "topp" ? 0.95 : 0.55} stroke={hover?.id === l.id ? C.ink : "none"}
                className="cursor-pointer" onMouseEnter={() => setHover(l)} onMouseLeave={() => setHover(null)} onClick={() => openListing(l.id)} />
            );
          })}
        </svg>
        {hover && h && (
          <div className="pointer-events-none absolute right-2 top-2 w-64 rounded-lg border border-line bg-surface/95 p-2 text-xs shadow-lg">
            <div className="font-semibold text-ink">{title(hover)} {hover.y}</div>
            <div className="text-ink2">{num(hover.km)} km · {FUELS[hover.fu]?.short}</div>
            <div className="mt-1 flex justify-between"><span>Pris</span><b className="num">{kr(h.effPrice)}</b></div>
            <div className="flex justify-between"><span>Markedsverdi</span><b className="num">{kr(h.est)}</b></div>
            <div className="flex justify-between"><span>Score</span><b className="num">{h.score} – {VERDICT[h.verdict].label}</b></div>
          </div>
        )}
      </div>
    </section>
  );
}

const CATEGORIES = [
  ["Elbil", l => l.fu === "E"],
  ["SUV / 4×4", l => l.bo === "SUV/Offroad" || l.wd === "4"],
  ["Stasjonsvogn", l => l.bo === "Stasjonsvogn"],
  ["Hybrid / ladbar", l => ["HB", "HD", "PB", "PD"].includes(l.fu)],
  ["Under 100 000 kr", (l, a) => a.effPrice <= 100000],
  ["Nyere enn 4 år", l => ageOf(l) <= 4],
];

function CategoryBest({ items }) {
  const { A, openListing } = useApp();
  const rows = useMemo(() => CATEGORIES.map(([name, fn]) => {
    let best = null;
    for (const l of items) {
      const a = A[l.id];
      if (fn(l, a) && (!best || a.score > A[best.id].score)) best = l;
    }
    return [name, best];
  }), [items, A]);
  const cheapest = useMemo(() => {
    let best = null;
    for (const l of items) { const a = A[l.id]; if (a.score >= 55 && (!best || a.rc.drift < A[best.id].rc.drift)) best = l; }
    return best;
  }, [items, A]);
  const all = [...rows, ["Billigst i drift (score ≥ 55)", cheapest]];
  return (
    <section className="card card-pad">
      <h2 className="h-title mb-3 flex items-center gap-1.5"><Award className="h-4 w-4 text-accent" aria-hidden /> Beste i hver kategori</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-1">
        {all.map(([name, l]) => (
          <button key={name} disabled={!l} onClick={() => l && openListing(l.id)}
            className="flex items-center gap-3 rounded-lg border border-line bg-raised p-2 text-left transition hover:border-ink/30 disabled:opacity-50">
            {l ? <Thumb l={l} w={240} className="h-12 w-16 shrink-0 rounded-md" /> : <div className="h-12 w-16 shrink-0 rounded-md bg-line" />}
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{name}</div>
              {l ? (
                <>
                  <div className="truncate text-sm font-semibold">{title(l)} {l.y}</div>
                  <div className="num truncate text-xs text-ink2">{kr(A[l.id].effPrice)} · {num(l.km)} km · {kr(A[l.id].rc.perMonth)}/mnd</div>
                </>
              ) : <div className="text-xs text-muted">Ingen i utvalget</div>}
            </div>
            {l && <VerdictBadge verdict={A[l.id].verdict} score={A[l.id].score} small />}
          </button>
        ))}
      </div>
    </section>
  );
}

export default function Dashboard({ items }) {
  const { A, weights: W } = useApp();
  const stats = useMemo(() => {
    const prices = [], drift = [], disc = [];
    let topp = 0, godt = 0;
    for (const l of items) {
      const a = A[l.id];
      prices.push(a.effPrice); drift.push(a.rc.perMonth);
      if (a.disc != null) disc.push(a.disc);
      if (a.verdict === "topp") topp++; else if (a.verdict === "godt") godt++;
    }
    return { n: items.length, medPrice: median(prices), medDrift: median(drift), topp, godt, medDisc: median(disc) };
  }, [items, A]);
  const top = useMemo(() => [...items].sort((a, b) => A[b.id].score - A[a.id].score).slice(0, 8), [items, A]);
  const wsum = Object.values(W).reduce((s, v) => s + v, 0) || 1;
  const wp = k => `${Math.round((W[k] / wsum) * 100)} %`;

  if (!items.length) return <div className="card card-pad text-center text-sm text-ink2">Ingen biler matcher filtrene.</div>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Stat label="Biler i utvalget" value={num(stats.n)} />
        <Stat label={`Toppkjøp (score ≥ ${VERDICT.topp.min})`} value={num(stats.topp)} sub={`${num(stats.godt)} til er «Godt kjøp»`} />
        <Stat label="Medianpris" value={kr(stats.medPrice)} />
        <Stat label="Median brukskostnad" value={`${kr(stats.medDrift)}/mnd`} sub="med din kjøreprofil" />
        <Stat label="Typisk prisavvik" value={stats.medDisc != null ? pct(stats.medDisc, 1, true) : "–"} sub="mot estimert markedsverdi" />
      </div>

      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Trophy className="h-4 w-4 text-accent" aria-hidden /> Beste kjøp akkurat nå</h2>
          <span className="text-xs text-muted">Score = pris mot marked {wp("pris")} · km {wp("km")} · modell {wp("modell")} · drift {wp("drift")} · trygghet {wp("trygg")}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {top.map((l, i) => <CarCard key={l.id} l={l} rank={i + 1} />)}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <ValueMap items={items} />
        <CategoryBest items={items} />
      </div>

      <section className="card card-pad text-sm text-ink2">
        <h2 className="h-title mb-2 flex items-center gap-1.5"><Info className="h-4 w-4 text-accent" aria-hidden /> Slik regnes scoren</h2>
        <ul className="grid gap-x-6 gap-y-1.5 md:grid-cols-2">
          <li><b className="text-ink">Pris mot markedet:</b> Hver bil sammenlignes med en statistisk modell laget av alle ~60 000 bilene på Finn (samme merke/modell/drivstoff, justert for alder, km, rekkevidde, 4×4, girkasse og forhandler/privat). 20 % under markedet gir full score.</li>
          <li><b className="text-ink">Kilometerstand:</b> Km per år mot normalen (~13 500 km) og total kilometerstand.</li>
          <li><b className="text-ink">Modell:</b> Pålitelighet for merke og modell (skjønnsmessig, basert på TÜV/NAF/Consumer Reports), trekk for høy alder.</li>
          <li><b className="text-ink">Brukskostnad:</b> Energi (dagens bensin-/diesel-/strømpriser), ferje/bom Stavanger–Bergen, bompenger, forsikring, trafikkforsikringsavgift, service, reparasjonsrisiko og dekk – med din kjøreprofil. Rangeres mot alle biler.</li>
          <li><b className="text-ink">Trygghet:</b> Garanti, servicehefte, forhandler, antall eiere og EU-kontroll.</li>
          <li><b className="text-ink">Import (Blocket/KVD):</b> Prisen inkluderer anslått mva, engangsavgift, transport og registrering. Sammenlignes med norsk markedsverdi.</li>
        </ul>
      </section>
    </div>
  );
}
