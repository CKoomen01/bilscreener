import { useState } from "react";
import { CheckCircle2, ExternalLink, Eye, EyeOff, RotateCcw } from "lucide-react";
import { assumptionsStore, DEFAULT_ASSUMPTIONS, settingsStore, useStore } from "../lib/store.js";
import { listModels, PREFERRED_MODELS } from "../lib/gemini.js";
import { useApp } from "../lib/data.js";
import { REPO } from "../lib/github.js";
import { num } from "../lib/format.js";
import { Modal, NumInput, Seg, Spinner } from "./ui.jsx";

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="h-sub">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

function SecretInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative flex-1">
      <input className="input pr-9 font-mono" type={show ? "text" : "password"} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} autoComplete="off" spellCheck={false} />
      <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink" onClick={() => setShow(s => !s)} aria-label={show ? "Skjul" : "Vis"}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export default function SettingsModal({ onClose }) {
  const { E, profile, setProfile } = useApp();
  const [settings, setSettings] = useStore(settingsStore);
  const [A, setA] = useStore(assumptionsStore);
  const [key, setKey] = useState(settings.apiKey);
  const [gh, setGh] = useState(settings.ghToken);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = patch => setSettings(s => ({ ...s, ...patch }));
  const setAs = patch => setA(s => ({ ...s, ...patch }));

  async function test() {
    setBusy(true); setStatus(null);
    try {
      const models = await listModels(key.trim());
      set({ apiKey: key.trim(), models });
      setStatus({ ok: true, text: `Nøkkelen virker! ${models.length} Gemini-modeller tilgjengelig.` });
    } catch (e) {
      setStatus({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const modelOptions = settings.models?.length
    ? [...PREFERRED_MODELS.filter(m => settings.models.includes(m)), ...settings.models.filter(m => !PREFERRED_MODELS.includes(m))]
    : PREFERRED_MODELS;

  return (
    <Modal title="Innstillinger og forutsetninger" onClose={onClose} wide>
      <div className="space-y-6">
        <section>
          <h3 className="h-title">AI-agent (Google Gemini)</h3>
          <p className="mt-1 text-sm text-ink2">Lim inn Gemini API-nøkkelen og trykk «Lagre og test». Den lagres bare i denne nettleseren og sendes kun til Google. Gjør det én gang per enhet (PC/mobil).</p>
          <a className="mt-1 inline-flex items-center gap-1 text-sm text-accent hover:underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
            Lag eller finn nøkkel: aistudio.google.com/apikey <ExternalLink className="h-3 w-3" />
          </a>
          <div className="mt-3 flex gap-2">
            <SecretInput value={key} onChange={setKey} placeholder="Lim inn nøkkelen her" />
            <button className="btn-primary" onClick={test} disabled={!key.trim() || busy}>{busy ? <Spinner /> : null} Lagre og test</button>
          </div>
          {status && <p className={`mt-2 flex items-center gap-1.5 text-sm ${status.ok ? "text-up" : "text-down"}`}>{status.ok && <CheckCircle2 className="h-4 w-4" />}{status.text}</p>}
          {settings.apiKey && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Field label="Modell">
                <select className="input" value={settings.model} onChange={e => set({ model: e.target.value })}>
                  <option value="">Automatisk (anbefalt)</option>
                  {modelOptions.map(m => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <button className="btn-ghost text-xs text-down" onClick={() => { set({ apiKey: "", models: [], model: "" }); setKey(""); }}>Fjern nøkkel fra denne nettleseren</button>
            </div>
          )}
        </section>

        <section className="border-t border-line pt-5">
          <h3 className="h-title">Priser og satser</h3>
          <p className="mt-1 text-sm text-ink2">Brukes i brukskostnad og import. Tomme felt hentes automatisk (SSB og strømbørsen). Endringer slår inn med en gang.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Bensin" hint={`Tomt = SSB (${num(E.bensin, 2)} kr/l)`}><NumInput value={A.bensin ?? ""} onChange={v => setAs({ bensin: v || null })} placeholder={E.bensin?.toFixed(2)} suffix="kr/l" /></Field>
            <Field label="Diesel" hint={`Tomt = SSB (${num(E.diesel, 2)} kr/l)`}><NumInput value={A.diesel ?? ""} onChange={v => setAs({ diesel: v || null })} placeholder={E.diesel?.toFixed(2)} suffix="kr/l" /></Field>
            <Field label="Spotpris strøm" hint="Tomt = snitt siste 30 dager i valgt sone, eks. mva"><NumInput value={A.spot ?? ""} onChange={v => setAs({ spot: v || null })} placeholder={E.spot?.toFixed(2)} suffix="kr/kWh" /></Field>
            <Field label="Nettleie + elavgift" hint="Per kWh inkl. mva"><NumInput value={A.grid} onChange={v => setAs({ grid: v })} suffix="kr/kWh" /></Field>
            <Field label="Norgespris"><NumInput value={A.norgespris} onChange={v => setAs({ norgespris: v })} suffix="kr/kWh" /></Field>
            <Field label="Hurtiglading"><NumInput value={A.fastCharge} onChange={v => setAs({ fastCharge: v })} suffix="kr/kWh" /></Field>
            <Field label="Ladetap hjemme"><NumInput value={A.chargeLoss} onChange={v => setAs({ chargeLoss: v })} suffix="%" /></Field>
            <Field label="Ferje + bom Stavanger–Bergen, fossil" hint="Per enveis tur, AutoPASS-avtale"><NumInput value={A.tripFossil} onChange={v => setAs({ tripFossil: v })} suffix="kr" /></Field>
            <Field label="Ferje + bom Stavanger–Bergen, elbil"><NumInput value={A.tripEl} onChange={v => setAs({ tripEl: v })} suffix="kr" /></Field>
            <Field label="Bompassering by: fossil / el">
              <div className="flex gap-1.5"><NumInput value={A.tollFossil} onChange={v => setAs({ tollFossil: v })} suffix="kr" /><NumInput value={A.tollEl} onChange={v => setAs({ tollEl: v })} suffix="kr" /></div>
            </Field>
            <Field label="Trafikkforsikringsavgift: fossil / el" hint="Per år (2026)">
              <div className="flex gap-1.5"><NumInput value={A.tfaFossil} onChange={v => setAs({ tfaFossil: v })} /><NumInput value={A.tfaEl} onChange={v => setAs({ tfaEl: v })} /></div>
            </Field>
            <Field label="Forsikring: grunnbeløp + % av verdi">
              <div className="flex gap-1.5"><NumInput value={A.insBase} onChange={v => setAs({ insBase: v })} suffix="kr" /><NumInput value={A.insPct} onChange={v => setAs({ insPct: v })} suffix="%" /></div>
            </Field>
            <Field label="Dekkslitasje"><NumInput value={A.tiresKm} onChange={v => setAs({ tiresKm: v })} suffix="kr/km" /></Field>
            <Field label="Import: transport fra Sverige"><NumInput value={A.importTransport} onChange={v => setAs({ importTransport: v })} suffix="kr" /></Field>
            <Field label="Import: godkjenning og registrering"><NumInput value={A.importFees} onChange={v => setAs({ importFees: v })} suffix="kr" /></Field>
            <Field label="Mva-fri grense elbil"><NumInput value={A.mvaLimitEv} onChange={v => setAs({ mvaLimitEv: v })} suffix="kr" /></Field>
            <Field label="Eierperiode" hint="Brukes i «Totalt over X år»"><NumInput value={profile.years} onChange={v => setProfile(p => ({ ...p, years: v || 4 }))} suffix="år" /></Field>
          </div>
          <button className="btn-ghost mt-2 text-xs" onClick={() => setA({ ...DEFAULT_ASSUMPTIONS })}><RotateCcw className="h-3.5 w-3.5" /> Tilbakestill priser og satser</button>
        </section>

        <section className="border-t border-line pt-5">
          <h3 className="h-title">«Hent ferske data nå» (valgfritt)</h3>
          <p className="mt-1 text-sm text-ink2">
            Data oppdateres automatisk to ganger daglig. Vil du kunne starte innhenting med ett klikk (eller be AI-agenten gjøre det), lag et
            {" "}<a className="text-accent hover:underline" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">fine-grained GitHub-token</a>{" "}
            med tilgang kun til repoet <code className="rounded bg-ink/5 px-1 text-xs">{REPO}</code> og rettigheten <b>Actions: Read and write</b>.
          </p>
          <div className="mt-2 flex gap-2">
            <SecretInput value={gh} onChange={setGh} placeholder="github_pat_…" />
            <button className="btn-outline" onClick={() => set({ ghToken: gh.trim() })} disabled={gh.trim() === settings.ghToken}>Lagre</button>
          </div>
        </section>

        <section className="border-t border-line pt-5">
          <h3 className="h-title mb-2">Tema</h3>
          <Seg label="Tema" value={settings.theme} onChange={v => set({ theme: v })} options={[["system", "Automatisk"], ["light", "Lyst"], ["dark", "Mørkt"]]} />
        </section>
      </div>
    </Modal>
  );
}
