import { ArrowLeftRight, X } from "lucide-react";
import { useApp } from "../lib/data.js";
import { FUELS, SOURCE, VERDICT, WD } from "../lib/analysis.js";
import { kr, num, pct } from "../lib/format.js";
import { Modal } from "./ui.jsx";
import { Thumb, title } from "./ListView.jsx";

/** Flytende linje nederst når biler er valgt for sammenligning */
export function CompareTray() {
  const { compare, setCompare, byId, openCompare } = useApp();
  const cars = compare.map(id => byId.get(id)).filter(Boolean);
  if (!cars.length) return null;
  return (
    <div className="fixed inset-x-0 bottom-3 z-[950] flex justify-center px-3">
      <div className="flex max-w-full items-center gap-2 overflow-x-auto rounded-xl border border-line bg-surface/95 p-2 shadow-2xl backdrop-blur no-scrollbar">
        {cars.map(l => (
          <span key={l.id} className="chip shrink-0 bg-raised py-1 text-xs">
            {title(l)} {l.y}
            <button className="text-muted hover:text-ink" onClick={() => setCompare(c => c.filter(x => x !== l.id))} aria-label="Fjern"><X className="h-3 w-3" /></button>
          </span>
        ))}
        <button className="btn-primary shrink-0" disabled={cars.length < 2} onClick={openCompare}><ArrowLeftRight className="h-4 w-4" /> Sammenlign {cars.length}</button>
        <button className="btn-ghost shrink-0 text-xs" onClick={() => setCompare([])}>Tøm</button>
      </div>
    </div>
  );
}

export default function CompareModal({ onClose }) {
  const { compare, byId, A, openListing } = useApp();
  const cars = compare.map(id => byId.get(id)).filter(Boolean);
  const rows = [
    ["Score", l => A[l.id].score, (a, b) => b - a, v => `${v}/100`],
    ["Vurdering", l => VERDICT[A[l.id].verdict].label, null, v => v],
    ["Pris (inkl. ev. import)", l => A[l.id].effPrice, (a, b) => a - b, kr],
    ["Markedsverdi", l => A[l.id].est, null, kr],
    ["Avvik fra marked", l => A[l.id].disc, (a, b) => b - a, v => (v == null ? "–" : `${pct(Math.abs(v), 0)} ${v > 0 ? "under" : "over"}`)],
    ["Årsmodell", l => l.y, (a, b) => b - a, v => v],
    ["Kilometer", l => l.km, (a, b) => a - b, num],
    ["Km per år", l => A[l.id].perYear, (a, b) => a - b, num],
    ["Drivstoff", l => FUELS[l.fu]?.label, null, v => v],
    ["Hjuldrift", l => WD[l.wd] || "–", null, v => v],
    ["Effekt", l => l.hk, (a, b) => b - a, v => (v ? `${v} hk` : "–")],
    ["Rekkevidde", l => (l.fu === "E" ? l.r : null), (a, b) => b - a, v => (v ? `${v} km` : "–")],
    ["Brukskostnad / mnd", l => A[l.id].rc.perMonth, (a, b) => a - b, kr],
    ["Verditap / år", l => A[l.id].rc.dep, (a, b) => a - b, kr],
    ["Eierkostnad / mnd", l => A[l.id].rc.totalMonth, (a, b) => a - b, kr],
    ["Pålitelighet", l => A[l.id].rel, (a, b) => b - a, v => `${v}/100`],
    ["Garanti", l => l.w || 0, (a, b) => b - a, v => (v ? `${v} mnd` : "–")],
    ["Kilde / sted", l => `${SOURCE[l.s]} · ${l.loc || ""}`, null, v => v],
  ];
  return (
    <Modal title="Sammenlign biler" onClose={onClose} wide>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th />
              {cars.map(l => (
                <th key={l.id} className="min-w-[150px] p-1 text-left align-top">
                  <button className="block w-full text-left" onClick={() => { onClose(); openListing(l.id); }}>
                    <Thumb l={l} w={240} className="mb-1 aspect-[16/10] rounded-md" />
                    <div className="text-xs font-semibold leading-tight">{title(l)}</div>
                    <div className="truncate text-[11px] font-normal text-muted">{l.sp}</div>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, get, better, fmt]) => {
              const vals = cars.map(get);
              const nums = vals.filter(v => typeof v === "number");
              const best = better && nums.length > 1 ? [...nums].sort(better)[0] : null;
              return (
                <tr key={label} className="border-t border-line/60">
                  <td className="whitespace-nowrap py-1.5 pr-3 text-xs text-ink2">{label}</td>
                  {vals.map((v, i) => (
                    <td key={i} className={`num py-1.5 pr-2 text-xs ${best != null && v === best ? "font-semibold text-up" : ""}`}>{v == null ? "–" : fmt(v)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-muted">Grønt = best i sammenligningen.</p>
    </Modal>
  );
}
