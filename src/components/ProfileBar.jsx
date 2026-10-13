import { useState } from "react";
import { ChevronDown, Fuel, PlugZap, RotateCcw, Route, Scale } from "lucide-react";
import { useApp } from "../lib/data.js";
import { DEFAULT_PROFILE, DEFAULT_WEIGHTS } from "../lib/store.js";
import { num } from "../lib/format.js";
import { Seg, Slider, Toggle } from "./ui.jsx";

const ZONES = [["NO2", "NO2 Stavanger"], ["NO5", "NO5 Bergen"], ["NO1", "NO1 Oslo"], ["NO3", "NO3 Midt"], ["NO4", "NO4 Nord"]];
const W_LABEL = { pris: "Pris mot markedet", km: "Kilometerstand", modell: "Modell / pålitelighet", drift: "Brukskostnad", trygg: "Garanti og historikk" };

const nok = (v, d = 2) => (v == null ? "–" : v.toLocaleString("nb-NO", { minimumFractionDigits: d, maximumFractionDigits: d }));

export default function ProfileBar() {
  const { profile: P, setProfile, weights: W, setWeights, E, market } = useApp();
  const [open, setOpen] = useState(false);
  const set = patch => setProfile(s => ({ ...s, ...patch }));
  const setW = patch => setWeights(s => ({ ...s, ...patch }));
  const fuelMonth = market?.prices?.fuel?.bensin?.at(-1)?.[0];
  const wsum = Object.values(W).reduce((s, v) => s + v, 0) || 1;

  return (
    <section className="card overflow-hidden">
      <button className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="flex items-center gap-2 text-sm font-semibold"><Route className="h-4 w-4 text-accent" aria-hidden /> Din kjøring</span>
        <span className="text-xs text-ink2">
          <b className="num text-ink">{num(P.kmYear)}</b> km/år · {P.highway} % landevei · <b className="text-ink">{P.sbTrips}</b> turer Stavanger–Bergen · {P.homeCharge ? `lader hjemme (${P.homeShare} %)` : "ingen hjemmelading"}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-3 text-xs text-ink2">
          <span className="inline-flex items-center gap-1" title={`SSB pumpepris ${fuelMonth || ""}`}><Fuel className="h-3.5 w-3.5" aria-hidden />Bensin <b className="num text-ink">{nok(E.bensin)}</b> · Diesel <b className="num text-ink">{nok(E.diesel)}</b> kr/l</span>
          <span className="inline-flex items-center gap-1" title={`Spot ${P.zone} snitt 30 dager: ${nok(E.spot)} kr/kWh eks. mva`}><PlugZap className="h-3.5 w-3.5" aria-hidden />Strøm hjemme <b className="num text-ink">{nok(E.home)}</b> · snitt lading <b className="num text-ink">{nok(E.kwh)}</b> kr/kWh</span>
          <ChevronDown className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && (
        <div className="grid gap-5 border-t border-line p-4 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <div className="h-title mb-1">Kjøremønster <span className="font-normal text-muted">– påvirker brukskostnad og rangering</span></div>
            <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
              <Slider label="Kjørelengde per år" value={P.kmYear} min={3000} max={50000} step={1000} onChange={v => set({ kmYear: v })} format={v => `${num(v)} km`} />
              <Slider label="Andel landevei / motorvei" value={P.highway} min={0} max={100} step={5} onChange={v => set({ highway: v })} format={v => `${v} %`}
                hint="Elbiler bruker mer strøm i høy fart, hybrider sparer mest i by." />
              <Slider label="Turer Stavanger–Bergen (tur/retur) per år" value={P.sbTrips} min={0} max={52} onChange={v => set({ sbTrips: v })} format={v => `${v}`}
                hint="To ferjer + bom hver vei. Elbil får rabatt. Kostnad per tur kan endres under Innstillinger." />
              <Slider label="Bompasseringer i by per måned" value={P.tollMonth} min={0} max={120} step={2} onChange={v => set({ tollMonth: v })} format={v => `${v}`} />
              <div className="space-y-2">
                <Toggle on={P.homeCharge} onChange={v => set({ homeCharge: v })}>Kan lade hjemme / på jobb</Toggle>
                {P.homeCharge && <Slider label="Andel lading hjemme" value={P.homeShare} min={0} max={100} step={5} onChange={v => set({ homeShare: v })} format={v => `${v} %`} />}
              </div>
              <div className="space-y-2">
                <div>
                  <div className="h-sub mb-1">Strømsone</div>
                  <select className="input" value={P.zone} onChange={e => set({ zone: e.target.value })}>
                    {ZONES.map(([id, n]) => <option key={id} value={id}>{n}{market?.prices?.power?.[id]?.avg30 != null ? ` – ${nok(market.prices.power[id].avg30)} kr spot` : ""}</option>)}
                  </select>
                </div>
                <Seg label="Strømavtale" value={P.tariff} onChange={v => set({ tariff: v })} options={[["spot", "Spot + strømstøtte"], ["norgespris", "Norgespris"]]} />
              </div>
              <Toggle on={P.withDep} onChange={v => set({ withDep: v })}>Ta med verditap i brukskostnaden</Toggle>
              <button className="btn-ghost w-fit text-xs" onClick={() => setProfile({ ...DEFAULT_PROFILE })}><RotateCcw className="h-3.5 w-3.5" /> Standard</button>
            </div>
          </div>
          <div>
            <div className="h-title mb-1 flex items-center gap-1.5"><Scale className="h-4 w-4 text-accent" aria-hidden /> Hva betyr mest for deg?</div>
            <p className="mb-2 text-xs text-muted">Vektene bestemmer totalscoren (0–100) som rangerer bilene.</p>
            <div className="space-y-2">
              {Object.keys(DEFAULT_WEIGHTS).map(k => (
                <Slider key={k} label={W_LABEL[k]} value={W[k]} min={0} max={60} onChange={v => setW({ [k]: v })} format={v => `${Math.round((v / wsum) * 100)} %`} />
              ))}
            </div>
            <button className="btn-ghost mt-1 text-xs" onClick={() => setWeights({ ...DEFAULT_WEIGHTS })}><RotateCcw className="h-3.5 w-3.5" /> Standardvekter</button>
          </div>
        </div>
      )}
    </section>
  );
}
