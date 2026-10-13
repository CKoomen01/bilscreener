import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { Crosshair, LocateFixed } from "lucide-react";
import { originOf, useApp } from "../lib/data.js";
import { requestGps } from "./LocationPicker.jsx";
import { FUELS, VERDICT } from "../lib/analysis.js";
import { kr, num, pct } from "../lib/format.js";
import { Legend } from "./ui.jsx";

const esc = s => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const DOT = { topp: "#0ca30c", godt: "#2a78d6", ok: "#fab219", svak: "#d03b3b" };
const MAX = 5000;

export default function MapView({ items }) {
  const { A, openListing, filters, setFilters } = useApp();
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const posLayer = useRef(null);
  const [picking, setPicking] = useState(false);
  const [err, setErr] = useState(null);
  const pickRef = useRef(false);
  pickRef.current = picking;
  const origin = originOf(filters);
  const setLoc = patch => setFilters(s => ({ ...s, distMax: s.distMax || 100, ...patch }));

  useEffect(() => {
    map.current = L.map(el.current, { preferCanvas: true, zoomControl: true }).setView([59.6, 6.2], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    posLayer.current = L.layerGroup().addTo(map.current);
    window.__openCar = id => openListing(id);
    // Klikk i kartet setter eget sted når «Velg punkt» er aktiv
    map.current.on("click", e => {
      if (!pickRef.current) return;
      const { lat, lng } = e.latlng;
      setLoc({ distFrom: "custom", distLat: +lat.toFixed(5), distLon: +lng.toFixed(5), distLabel: `Valgt punkt (${lat.toFixed(2)}, ${lng.toFixed(2)})` });
      setPicking(false);
    });
    const onPick = () => { window.__pickLocation = false; setPicking(true); };
    window.addEventListener("pick-location", onPick);
    if (window.__pickLocation) onPick();
    return () => { map.current.remove(); delete window.__openCar; window.removeEventListener("pick-location", onPick); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { el.current.style.cursor = picking ? "crosshair" : ""; }, [picking]);

  // Valgt posisjon + radius
  useEffect(() => {
    const g = posLayer.current;
    g.clearLayers();
    if (!origin) return;
    L.circleMarker([origin.lat, origin.lon], { radius: 8, color: "#ffffff", weight: 3, fillColor: "#2a78d6", fillOpacity: 1 })
      .bindTooltip(origin.label).addTo(g);
    if (filters.distMax) {
      L.circle([origin.lat, origin.lon], { radius: filters.distMax * 1000, color: "#2a78d6", weight: 1.5, fillOpacity: 0.05, interactive: false }).addTo(g);
    }
  }, [origin?.lat, origin?.lon, origin?.label, filters.distMax]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const g = layer.current;
    g.clearLayers();
    const pts = [];
    const order = { svak: 0, ok: 1, godt: 2, topp: 3 };
    // Vis de beste først hvis det er for mange, tegn de beste øverst
    const list = items.filter(l => l.la && l.lo && l.s === "f")
      .sort((x, y) => A[y.id].score - A[x.id].score).slice(0, MAX)
      .sort((x, y) => order[A[x.id].verdict] - order[A[y.id].verdict]);
    for (const l of list) {
      const a = A[l.id];
      const m = L.circleMarker([l.la, l.lo], {
        radius: a.verdict === "topp" ? 7 : 5,
        color: "#ffffff", weight: 1.2, fillColor: DOT[a.verdict], fillOpacity: 0.9,
      });
      m.bindPopup(
        `<div style="min-width:200px">
          <div style="font-weight:600">${esc(l.mk)} ${esc(l.md)} ${l.y}</div>
          <div style="font-size:12px;opacity:.75">${num(l.km)} km · ${esc(FUELS[l.fu]?.short)} · ${esc(l.loc)}</div>
          <div style="margin-top:4px;font-size:13px"><b>${kr(a.effPrice)}</b>${a.disc != null ? ` (${pct(a.disc, 0, true)} mot marked)` : ""}</div>
          <div style="font-size:12px;margin-top:2px">${VERDICT[a.verdict].label} · score ${a.score} · drift ${kr(a.rc.perMonth)}/mnd</div>
          <button onclick="window.__openCar('${l.id}')" style="margin-top:6px;color:#2a78d6;font-weight:600;font-size:12px">Åpne detaljer →</button>
        </div>`,
      );
      m.addTo(g);
      pts.push([l.la, l.lo]);
    }
    if (origin && filters.distMax) map.current.fitBounds(L.latLng(origin.lat, origin.lon).toBounds(filters.distMax * 2000), { padding: [20, 20] });
    else if (pts.length) map.current.fitBounds(pts, { padding: [30, 30], maxZoom: 13 });
  }, [items, A]);

  const withPos = items.filter(l => l.la && l.lo && l.s === "f").length;
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <Legend items={Object.entries(VERDICT).map(([k, v]) => ({ label: v.label, color: DOT[k] }))} />
        <div className="flex flex-wrap items-center gap-1.5">
          <button className="btn-outline text-xs" onClick={() => { setErr(null); requestGps(setLoc, setErr); }}><LocateFixed className="h-3.5 w-3.5" /> Min posisjon</button>
          <button className={`text-xs ${picking ? "btn-primary" : "btn-outline"}`} onClick={() => setPicking(p => !p)} aria-pressed={picking}>
            <Crosshair className="h-3.5 w-3.5" /> {picking ? "Klikk i kartet …" : "Velg punkt i kartet"}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 text-xs text-muted">
        <span>{num(Math.min(withPos, MAX))} av {num(items.length)} biler i kartet{withPos > MAX ? " (de beste vises)" : ""} · svenske biler vises ikke</span>
        {origin && <span>📍 {origin.label}{filters.distMax ? ` · ${filters.distMax} km radius` : ""}</span>}
        {err && <span className="text-down">{err}</span>}
      </div>
      <div ref={el} className="h-[68vh] min-h-[420px] w-full" />
    </div>
  );
}
