import { useEffect, useState } from "react";
import { ArrowLeftRight, Car, Gauge, Heart, LayoutGrid, MapPin, Rows3, Zap } from "lucide-react";
import { daysOnMarket, distanceTo, originOf, priceDrop, useApp } from "../lib/data.js";
import { FUELS, imageUrl, SOURCE, VERDICT } from "../lib/analysis.js";
import { kr, num, pct } from "../lib/format.js";
import { Seg, VerdictBadge } from "./ui.jsx";

export function FavButton({ id, className = "" }) {
  const { favorites, setFavorites } = useApp();
  const on = favorites.includes(id);
  return (
    <button type="button" aria-label={on ? "Fjern fra favoritter" : "Legg til i favoritter"} aria-pressed={on}
      onClick={e => { e.stopPropagation(); setFavorites(f => (on ? f.filter(x => x !== id) : [...f, id])); }}
      className={`grid h-8 w-8 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/60 ${className}`}>
      <Heart className={`h-4 w-4 ${on ? "fill-current text-[#e87ba4]" : ""}`} />
    </button>
  );
}

export function CompareButton({ id, className = "" }) {
  const { compare, setCompare } = useApp();
  const on = compare.includes(id);
  return (
    <button type="button" aria-pressed={on} title={on ? "Fjern fra sammenligning" : "Legg til i sammenligning (maks 4)"}
      onClick={e => { e.stopPropagation(); setCompare(c => (on ? c.filter(x => x !== id) : [...c, id].slice(-4))); }}
      className={`grid h-8 w-8 place-items-center rounded-full backdrop-blur transition ${on ? "bg-accent text-white" : "bg-black/45 text-white hover:bg-black/60"} ${className}`}>
      <ArrowLeftRight className="h-4 w-4" />
    </button>
  );
}

export function Thumb({ l, className = "", w = 480 }) {
  const [err, setErr] = useState(false);
  const src = imageUrl(l, w);
  return (
    <div className={`relative overflow-hidden bg-line ${className}`}>
      {src && !err ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setErr(true)} />
        : <div className="grid h-full w-full place-items-center text-muted"><Car className="h-8 w-8" aria-hidden /></div>}
    </div>
  );
}

export function Tags({ l, a }) {
  const t = [];
  const dom = daysOnMarket(l);
  const drop = priceDrop(l);
  if (l.s !== "f") t.push([SOURCE[l.s], "border-accent/40 text-accent"]);
  if (l.auc || l.s === "k") t.push(["Auksjon", "border-warn/60 text-ink"]);
  if (dom != null && dom <= 3) t.push(["Ny annonse", "border-accent/40 text-accent"]);
  if (drop > 0.02) t.push([`Ned ${pct(drop, 0)}`, "border-good/40 text-up"]);
  if (l.w) t.push([`Garanti ${l.w} mnd`, "border-line text-ink2"]);
  if (l.r && l.fu === "E") t.push([`${num(l.r)} km rekkevidde`, "border-line text-ink2"]);
  if (l.eq?.includes("henger") || l.tr > 0) t.push(["Hengerfeste", "border-line text-muted"]);
  if (a.suspect) t.unshift(["Mistenkelig lav pris", "border-bad/40 text-down"]);
  if (a.imp && !a.imp.sure) t.push(["Importavgift usikker", "border-bad/40 text-down"]);
  return (
    <div className="flex flex-wrap gap-1">
      {t.slice(0, 5).map(([txt, cls]) => <span key={txt} className={`chip ${cls}`}>{txt}</span>)}
    </div>
  );
}

export function title(l) { return `${l.mk} ${l.md}`.trim(); }

export function CarCard({ l, rank }) {
  const { A, openListing, filters } = useApp();
  const a = A[l.id];
  if (!a) return null;
  const d = distanceTo(originOf(filters), l);
  return (
    <article className="card group flex cursor-pointer flex-col overflow-hidden transition hover:border-ink/30 hover:shadow-lg"
      onClick={() => openListing(l.id)} tabIndex={0} onKeyDown={e => e.key === "Enter" && openListing(l.id)}>
      <div className="relative">
        <Thumb l={l} className="aspect-[16/10]" />
        <VerdictBadge verdict={a.verdict} score={a.score} className="absolute left-2 top-2 bg-surface/95 shadow" />
        {rank != null && <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 text-xs font-semibold text-white">#{rank}</span>}
        <div className="absolute right-2 top-2 flex gap-1"><CompareButton id={l.id} /><FavButton id={l.id} /></div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink" title={`${title(l)} ${l.sp || ""}`}>{title(l)} <span className="font-normal text-ink2">{l.sp}</span></div>
          <div className="truncate text-xs text-muted">{l.y} · {l.km != null ? `${num(l.km)} km` : "km ukjent"} · {FUELS[l.fu]?.short} · {l.g === "A" ? "Automat" : "Manuell"}{l.wd === "4" ? " · 4×4" : ""}</div>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <div className="num text-lg font-semibold leading-tight">{kr(a.effPrice)}</div>
            {a.imp && <div className="text-[10px] text-muted">inkl. ca. {kr(a.imp.total)} import</div>}
          </div>
          {a.disc != null && (
            <div className={`num text-right text-xs font-semibold ${a.disc > 0.03 ? "text-up" : a.disc < -0.05 ? "text-down" : "text-ink2"}`} title={`Estimert markedsverdi ${kr(a.est)}`}>
              {a.disc > 0 ? "▼" : "▲"} {pct(Math.abs(a.disc), 0)} {a.disc > 0 ? "under" : "over"} marked
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-md bg-ink/[.04] px-2 py-1" title="Brukskostnad per måned med din kjøreprofil (energi, bom/ferje, forsikring, avgift, service, dekk)">
            <div className="text-[10px] text-muted">Drift / mnd</div>
            <div className="num text-[13px] font-semibold">{kr(a.rc.perMonth)}</div>
          </div>
          <div className="rounded-md bg-ink/[.04] px-2 py-1" title="Estimert verditap neste år">
            <div className="text-[10px] text-muted">Verditap / år</div>
            <div className="num text-[13px] font-semibold">{kr(a.rc.dep)}</div>
          </div>
        </div>
        <Tags l={l} a={a} />
        <div className="mt-auto flex items-center gap-1 truncate text-[11px] text-muted"><MapPin className="h-3 w-3 shrink-0" aria-hidden />{d != null && <b className="num font-semibold text-ink2">{Math.round(d)} km · </b>}{[l.loc, l.fy].filter(Boolean).join(", ") || "Ukjent sted"}{l.org ? ` · ${l.org}` : l.sg === "P" ? " · Privat" : ""}</div>
      </div>
    </article>
  );
}

function Table({ items }) {
  const { A, openListing, filters } = useApp();
  const origin = originOf(filters);
  return (
    <div className="card overflow-x-auto scroll-thin">
      <table className="w-full text-sm">
        <thead className="border-b border-line">
          <tr>
            <th className="th">Bil</th><th className="th">År</th><th className="th text-right">Km</th><th className="th">Drivstoff</th>
            <th className="th text-right">Pris</th><th className="th text-right">Marked</th><th className="th text-right">Drift/mnd</th>
            <th className="th text-right">Score</th><th className="th">Sted</th>
          </tr>
        </thead>
        <tbody>
          {items.map(l => {
            const a = A[l.id];
            return (
              <tr key={l.id} className="cursor-pointer border-b border-line/60 hover:bg-ink/[.03]" onClick={() => openListing(l.id)}>
                <td className="td max-w-[280px] truncate"><b className="font-medium">{title(l)}</b> <span className="text-ink2">{l.sp}</span></td>
                <td className="td num">{l.y}</td>
                <td className="td num text-right">{num(l.km)}</td>
                <td className="td">{FUELS[l.fu]?.short}</td>
                <td className="td num text-right font-medium">{kr(a.effPrice)}</td>
                <td className={`td num text-right ${a.disc > 0.03 ? "text-up" : a.disc < -0.05 ? "text-down" : "text-ink2"}`}>{a.disc != null ? `${a.disc > 0 ? "−" : "+"}${pct(Math.abs(a.disc), 0)}` : "–"}</td>
                <td className="td num text-right">{kr(a.rc.perMonth)}</td>
                <td className="td text-right"><span className={`num rounded px-1.5 py-0.5 text-xs font-semibold ${VERDICT[a.verdict].cls}`}>{a.score}</span></td>
                <td className="td max-w-[160px] truncate text-ink2">{origin && distanceTo(origin, l) != null ? `${Math.round(distanceTo(origin, l))} km · ` : ""}{l.loc}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const PAGE = 48;

export default function ListView({ items }) {
  const [layout, setLayout] = useState(() => localStorage.getItem("bs.layout") || "grid");
  const [n, setN] = useState(PAGE);
  useEffect(() => { setN(PAGE); }, [items]);
  useEffect(() => { try { localStorage.setItem("bs.layout", layout); } catch { /* */ } }, [layout]);
  if (!items.length) {
    return <div className="card card-pad text-center text-sm text-ink2"><Gauge className="mx-auto mb-2 h-6 w-6 text-muted" />Ingen biler matcher filtrene. Prøv å fjerne noen.</div>;
  }
  const shown = items.slice(0, n);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">Viser {num(shown.length)} av {num(items.length)}</span>
        <Seg label="Visning" value={layout} onChange={setLayout} options={[["grid", <LayoutGrid key="g" className="h-3.5 w-3.5" />], ["table", <Rows3 key="t" className="h-3.5 w-3.5" />]]} />
      </div>
      {layout === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map(l => <CarCard key={l.id} l={l} />)}
        </div>
      ) : <Table items={shown} />}
      {n < items.length && (
        <div className="flex justify-center"><button className="btn-outline" onClick={() => setN(x => x + PAGE * 2)}><Zap className="h-4 w-4" /> Vis flere ({num(items.length - n)} igjen)</button></div>
      )}
    </div>
  );
}
