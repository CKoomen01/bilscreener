import { useEffect, useRef, useState } from "react";
import { ChevronDown, Crosshair, LocateFixed, MapPin, Search, X } from "lucide-react";
import { originOf, useApp } from "../lib/data.js";
import { CITIES } from "../lib/analysis.js";
import { Spinner } from "./ui.jsx";

const RADII = [0, 10, 25, 50, 100, 150, 200, 300, 500];

/** Tolker «58.97, 5.73» som koordinater. */
function parseCoords(q) {
  const m = q.trim().match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1].replace(",", ".")), lon = parseFloat(m[2].replace(",", "."));
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

/** Søk etter sted/adresse i Norge (OpenStreetMap Nominatim, kun når du søker). */
async function geocode(q) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=no&accept-language=nb&q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error("Stedssøket svarte ikke");
  const js = await r.json();
  return js.map(x => ({ lat: +x.lat, lon: +x.lon, label: x.display_name.split(",").slice(0, 2).join(",").trim() }));
}

export function useLocation() {
  const { filters: f, setFilters } = useApp();
  const setLoc = patch => setFilters(s => ({ ...s, ...patch }));
  return { origin: originOf(f), f, setLoc };
}

export function requestGps(setLoc, onError) {
  if (!navigator.geolocation) { onError?.("Nettleseren støtter ikke posisjon."); return; }
  navigator.geolocation.getCurrentPosition(
    p => setLoc({ distFrom: "gps", distLat: +p.coords.latitude.toFixed(5), distLon: +p.coords.longitude.toFixed(5), distLabel: "Min posisjon (GPS)" }),
    e => onError?.(e.code === 1 ? "Du må tillate posisjon i nettleseren." : "Fant ikke posisjonen din. Prøv igjen eller skriv inn sted."),
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
  );
}

export default function LocationPicker() {
  const { origin, f, setLoc } = useLocation();
  const { setView } = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const choose = patch => { setLoc({ distMax: f.distMax || 100, ...patch }); setHits([]); setQ(""); setErr(null); };

  async function search(e) {
    e?.preventDefault();
    const c = parseCoords(q);
    if (c) return choose({ distFrom: "custom", distLat: c.lat, distLon: c.lon, distLabel: `${c.lat.toFixed(3)}, ${c.lon.toFixed(3)}` });
    if (q.trim().length < 2) return;
    setBusy(true); setErr(null);
    try {
      const r = await geocode(q.trim());
      setHits(r);
      if (!r.length) setErr("Fant ikke stedet. Prøv et annet navn eller koordinater.");
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button type="button" className={`input flex w-auto items-center gap-1.5 ${origin ? "border-accent text-ink" : "text-muted"}`} onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <MapPin className={`h-3.5 w-3.5 ${origin ? "text-accent" : ""}`} aria-hidden />
        <span className="max-w-[180px] truncate">{origin ? `${origin.label}${f.distMax ? ` · ${f.distMax} km` : ""}` : "Område / GPS"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 z-[950] mt-1 w-80 max-w-[90vw] space-y-3 rounded-lg border border-line bg-surface p-3 shadow-xl">
          <button type="button" className="btn-primary w-full justify-center" onClick={() => { setErr(null); requestGps(p => choose(p), setErr); }}>
            <LocateFixed className="h-4 w-4" /> Bruk min posisjon (GPS)
          </button>
          <form onSubmit={search}>
            <div className="h-sub mb-1">Eller skriv sted, adresse eller koordinater</div>
            <div className="flex gap-1.5">
              <input className="input" placeholder="F.eks. Sandnes, Stord, «58.97, 5.73»" value={q} onChange={e => setQ(e.target.value)} />
              <button className="btn-outline px-2" disabled={busy} aria-label="Søk sted">{busy ? <Spinner /> : <Search className="h-4 w-4" />}</button>
            </div>
          </form>
          {hits.length > 0 && (
            <div className="divide-y divide-line rounded-md border border-line">
              {hits.map((h, i) => (
                <button key={i} type="button" className="block w-full truncate px-2 py-1.5 text-left text-sm hover:bg-ink/5"
                  onClick={() => choose({ distFrom: "custom", distLat: h.lat, distLon: h.lon, distLabel: h.label })}>{h.label}</button>
              ))}
            </div>
          )}
          <div>
            <div className="h-sub mb-1">Snarveier</div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(CITIES).map(([id, c]) => (
                <button key={id} type="button" onClick={() => choose({ distFrom: id })}
                  className={`rounded-full border px-2 py-0.5 text-xs ${f.distFrom === id ? "border-accent bg-accent text-white" : "border-line text-ink2 hover:border-ink/30"}`}>{c.name}</button>
              ))}
            </div>
          </div>
          <button type="button" className="btn-ghost w-full justify-center text-xs" onClick={() => { setView("kart"); setOpen(false); window.__pickLocation = true; window.dispatchEvent(new Event("pick-location")); }}>
            <Crosshair className="h-3.5 w-3.5" /> Velg punkt i kartet
          </button>
          {origin && (
            <div className="space-y-1.5 border-t border-line pt-2">
              <div className="h-sub">Radius rundt {origin.label}</div>
              <div className="flex flex-wrap gap-1">
                {RADII.map(r => (
                  <button key={r} type="button" onClick={() => setLoc({ distMax: r })}
                    className={`rounded-full border px-2 py-0.5 text-xs ${f.distMax === r ? "border-accent bg-accent text-white" : "border-line text-ink2 hover:border-ink/30"}`}>{r ? `${r} km` : "Ingen grense"}</button>
                ))}
              </div>
              <div className="flex gap-1.5">
                <button type="button" className="btn-ghost flex-1 justify-center text-xs" onClick={() => setLoc({ sort: "naer" })}>Sorter nærmest først</button>
                <button type="button" className="btn-ghost flex-1 justify-center text-xs text-down" onClick={() => setLoc({ distFrom: "", distLat: null, distLon: null, distLabel: "", distMax: 0, sort: f.sort === "naer" ? "pris" : f.sort })}>
                  <X className="h-3.5 w-3.5" /> Fjern posisjon
                </button>
              </div>
            </div>
          )}
          {err && <p className="text-xs text-down">{err}</p>}
          <p className="text-[10px] text-muted">Posisjonen lagres bare i nettleseren din. Stedssøk bruker OpenStreetMap.</p>
        </div>
      )}
    </div>
  );
}
