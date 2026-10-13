import { useMemo, useState } from "react";
import { ChevronDown, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { BODIES, SORTS, useApp } from "../lib/data.js";
import { FUELS, SELLER, SOURCE, WD } from "../lib/analysis.js";
import { DEFAULT_FILTERS } from "../lib/store.js";
import { num } from "../lib/format.js";
import { Chip, MultiSelect, NumInput, Toggle } from "./ui.jsx";
import LocationPicker from "./LocationPicker.jsx";

const PRICE_MAX = [0, 50e3, 75e3, 100e3, 150e3, 200e3, 250e3, 300e3, 400e3, 500e3, 600e3, 800e3, 1e6, 1.5e6];
const KM_MAX = [0, 30e3, 50e3, 80e3, 100e3, 130e3, 160e3, 200e3, 250e3];
const FUEL_CHIPS = [["E", "El"], ["B", "Bensin"], ["D", "Diesel"], ["HB", "Hybrid"], ["PB", "Ladbar hybrid"]];
const YEARS = (() => { const y = new Date().getFullYear(); return Array.from({ length: 30 }, (_, i) => y + 1 - i); })();

function count(list, fn) {
  const m = new Map();
  for (const l of list) { const k = fn(l); if (k) m.set(k, (m.get(k) || 0) + 1); }
  return m;
}

export default function FilterBar({ count: n }) {
  const { filters: f, setFilters, listings } = useApp();
  const [more, setMore] = useState(false);
  const set = patch => setFilters(s => ({ ...s, ...patch }));
  const toggleIn = (key, v) => set({ [key]: f[key].includes(v) ? f[key].filter(x => x !== v) : [...f[key], v] });

  const makeOpts = useMemo(() => [...count(listings, l => l.mk)].sort((a, b) => a[0].localeCompare(b[0], "nb")).map(([v, c]) => ({ value: v, label: v, count: c })), [listings]);
  const modelOpts = useMemo(() => {
    if (!f.makes.length) return [];
    const ms = new Set(f.makes);
    return [...count(listings.filter(l => ms.has(l.mk)), l => `${l.mk}|${l.md}`)]
      .sort((a, b) => a[0].localeCompare(b[0], "nb"))
      .map(([v, c]) => ({ value: v, label: f.makes.length > 1 ? v.replace("|", " ") : v.split("|")[1] || "(ukjent)", count: c }));
  }, [listings, f.makes]);
  const fylkeOpts = useMemo(() => [...count(listings, l => l.fy)].sort((a, b) => a[0].localeCompare(b[0], "nb")).map(([v, c]) => ({ value: v, label: v, count: c })), [listings]);

  const nMore = ["wd", "sources", "sellers", "fylker"].reduce((s, k) => s + (f[k].length ? 1 : 0), 0)
    + ["kmMin", "rangeMin", "hkMin", "seatsMin", "priceMin", "driftMax", "minScore", "yearMax"].reduce((s, k) => s + (f[k] ? 1 : 0), 0)
    + (f.gear ? 1 : 0) + (f.sale !== "alle") + (f.verdict !== "alle")
    + ["onlyWarranty", "onlyService", "onlyDrop", "onlyNew", "onlyTow", "onlyEstimate", "hideAbroad"].reduce((s, k) => s + (f[k] ? 1 : 0), 0);

  return (
    <section className="card card-pad space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-[2]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input pl-8" placeholder="Søk: «tesla model y», «xc60 2019», sted, forhandler eller Finn-kode" value={f.q} onChange={e => set({ q: e.target.value })} />
        </div>
        <MultiSelect className="min-w-[150px] flex-1" label="Merke" placeholder="Alle merker" options={makeOpts} value={f.makes} onChange={v => set({ makes: v, models: f.models.filter(m => v.includes(m.split("|")[0])) })} />
        <MultiSelect className={`min-w-[150px] flex-1 ${f.makes.length ? "" : "pointer-events-none opacity-50"}`} label="Modell" placeholder={f.makes.length ? "Alle modeller" : "Velg merke først"} options={modelOpts} value={f.models} onChange={v => set({ models: v })} />
        <select className="input w-auto" value={f.sort} onChange={e => set({ sort: e.target.value })} aria-label="Sortering">
          {SORTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={f.priceMax} onChange={e => set({ priceMax: Number(e.target.value) })} aria-label="Makspris">
          {PRICE_MAX.map(p => <option key={p} value={p}>{p ? `Maks ${num(p)} kr` : "Alle priser"}</option>)}
        </select>
        <select className="input w-auto" value={f.yearMin} onChange={e => set({ yearMin: Number(e.target.value) })} aria-label="Årsmodell fra">
          <option value={0}>Alle årsmodeller</option>
          {YEARS.map(y => <option key={y} value={y}>Fra {y}</option>)}
        </select>
        <select className="input w-auto" value={f.kmMax} onChange={e => set({ kmMax: Number(e.target.value) })} aria-label="Maks km">
          {KM_MAX.map(k => <option key={k} value={k}>{k ? `Maks ${num(k)} km` : "Alle km"}</option>)}
        </select>
        <LocationPicker />
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
        {FUEL_CHIPS.map(([id, label]) => <Chip key={id} on={f.fuels.includes(id)} onClick={() => toggleIn("fuels", id)}>{label}</Chip>)}
        <span className="mx-1 hidden h-5 w-px bg-line lg:block" />
        {["SUV/Offroad", "Stasjonsvogn", "Kombi 5-dørs", "Sedan"].map(b => <Chip key={b} on={f.bodies.includes(b)} onClick={() => toggleIn("bodies", b)}>{b.replace("/Offroad", "")}</Chip>)}
        <Chip on={f.wd.includes("4")} onClick={() => toggleIn("wd", "4")}>4×4</Chip>
        <button className="btn-ghost ml-auto text-xs" onClick={() => setMore(m => !m)} aria-expanded={more}>
          <SlidersHorizontal className="h-3.5 w-3.5" /> Flere filtre{nMore ? <span className="num rounded-full bg-accent px-1.5 text-[10px] text-white">{nMore}</span> : null}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${more ? "rotate-180" : ""}`} />
        </button>
      </div>

      {more && (
        <div className="space-y-4 border-t border-line pt-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <label><span className="h-sub">Min. pris</span><NumInput value={f.priceMin} onChange={v => set({ priceMin: v })} placeholder="0" suffix="kr" /></label>
            <label><span className="h-sub">Egen makspris</span><NumInput value={f.priceMax} onChange={v => set({ priceMax: v })} placeholder="ingen" suffix="kr" /></label>
            <label><span className="h-sub">Årsmodell til</span>
              <select className="input" value={f.yearMax} onChange={e => set({ yearMax: Number(e.target.value) })}>
                <option value={0}>Alle</option>{YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label><span className="h-sub">Min. km</span><NumInput value={f.kmMin} onChange={v => set({ kmMin: v })} placeholder="0" suffix="km" /></label>
            <label><span className="h-sub">Egen maks km</span><NumInput value={f.kmMax} onChange={v => set({ kmMax: v })} placeholder="ingen" suffix="km" /></label>
            <label><span className="h-sub">Girkasse</span>
              <select className="input" value={f.gear} onChange={e => set({ gear: e.target.value })}>
                <option value="">Alle</option><option value="A">Automat</option><option value="M">Manuell</option>
              </select>
            </label>
            <label><span className="h-sub">Min. rekkevidde (elbil)</span><NumInput value={f.rangeMin} onChange={v => set({ rangeMin: v })} placeholder="0" suffix="km" /></label>
            <label title="Bare biler der effekt er kjent (detaljside hentet)"><span className="h-sub">Min. effekt</span><NumInput value={f.hkMin} onChange={v => set({ hkMin: v })} placeholder="0" suffix="hk" /></label>
            <label title="Bare biler der antall seter er kjent"><span className="h-sub">Min. seter</span>
              <select className="input" value={f.seatsMin} onChange={e => set({ seatsMin: Number(e.target.value) })}>
                {[0, 4, 5, 6, 7, 8, 9].map(s => <option key={s} value={s}>{s ? `${s}+` : "Alle"}</option>)}
              </select>
            </label>
            <label><span className="h-sub">Maks brukskostnad</span><NumInput value={f.driftMax} onChange={v => set({ driftMax: v })} placeholder="ingen" suffix="kr/mnd" /></label>
            <label><span className="h-sub">Min. score</span><NumInput value={f.minScore} onChange={v => set({ minScore: v })} placeholder="0" suffix="/100" /></label>
            <label><span className="h-sub">Vurdering</span>
              <select className="input" value={f.verdict} onChange={e => set({ verdict: e.target.value })}>
                <option value="alle">Alle</option><option value="godt">Godt kjøp eller bedre</option><option value="topp">Bare toppkjøp</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div><div className="h-sub mb-1">Fylke</div><MultiSelect label="Fylke" placeholder="Hele landet" options={fylkeOpts} value={f.fylker} onChange={v => set({ fylker: v })} /></div>
            <div>
              <div className="h-sub mb-1">Salgsform</div>
              <select className="input" value={f.sale} onChange={e => set({ sale: e.target.value })}>
                <option value="alle">Alle</option><option value="brukt">Vanlig salg (ikke auksjon/nybil)</option><option value="auksjon">Bare auksjoner</option>
              </select>
            </div>
            <div>
              <div className="h-sub mb-1">Karosseri</div>
              <MultiSelect label="Karosseri" placeholder="Alle" options={BODIES.map(b => ({ value: b, label: b }))} value={f.bodies} onChange={v => set({ bodies: v })} />
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <div>
              <div className="h-sub mb-1">Drivstoff</div>
              <div className="flex flex-wrap gap-1.5">{Object.entries(FUELS).filter(([k]) => k !== "A").map(([k, v]) => <Chip key={k} on={f.fuels.includes(k)} onClick={() => toggleIn("fuels", k)}>{v.short}</Chip>)}</div>
            </div>
            <div>
              <div className="h-sub mb-1">Hjuldrift</div>
              <div className="flex flex-wrap gap-1.5">{Object.entries(WD).map(([k, v]) => <Chip key={k} on={f.wd.includes(k)} onClick={() => toggleIn("wd", k)}>{v}</Chip>)}</div>
            </div>
            <div>
              <div className="h-sub mb-1">Kilde</div>
              <div className="flex flex-wrap gap-1.5">{Object.entries(SOURCE).map(([k, v]) => <Chip key={k} on={f.sources.includes(k)} onClick={() => toggleIn("sources", k)}>{v}</Chip>)}</div>
            </div>
            <div>
              <div className="h-sub mb-1">Selger</div>
              <div className="flex flex-wrap gap-1.5">{["P", "M", "A"].map(k => <Chip key={k} on={f.sellers.includes(k)} onClick={() => toggleIn("sellers", k)}>{SELLER[k]}</Chip>)}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Toggle on={f.onlyWarranty} onChange={v => set({ onlyWarranty: v })}>Med garanti</Toggle>
            <Toggle on={f.onlyService} onChange={v => set({ onlyService: v })}>Har servicehefte / tilstandsrapport</Toggle>
            <Toggle on={f.onlyTow} onChange={v => set({ onlyTow: v })}>Hengerfeste</Toggle>
            <Toggle on={f.onlyDrop} onChange={v => set({ onlyDrop: v })}>Prisnedsatt</Toggle>
            <Toggle on={f.onlyNew} onChange={v => set({ onlyNew: v })}>Nye siste 7 dager</Toggle>
            <Toggle on={f.onlyEstimate} onChange={v => set({ onlyEstimate: v })}>Bare med markedsestimat</Toggle>
            <Toggle on={f.hideAbroad} onChange={v => set({ hideAbroad: v })}>Skjul biler i utlandet / import</Toggle>
            <Toggle on={f.hideSuspect} onChange={v => set({ hideSuspect: v })}>Skjul mistenkelig lave priser (&gt;45 % under marked)</Toggle>
          </div>
          <button className="btn-ghost text-xs" onClick={() => setFilters({ ...DEFAULT_FILTERS })}><RotateCcw className="h-3.5 w-3.5" /> Nullstill alle filtre</button>
        </div>
      )}
      <div className="text-xs text-muted"><b className="num text-ink">{num(n)}</b> biler matcher · sortert: {SORTS.find(s => s[0] === f.sort)?.[1].toLowerCase()}</div>
    </section>
  );
}
