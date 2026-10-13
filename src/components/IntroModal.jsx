import { Modal } from "./ui.jsx";

const STEPS = [
  ["1", "Fortell hvordan du kjører", "Åpne «Din kjøring» øverst: km per år, andel landevei, turer Stavanger–Bergen, om du kan lade hjemme og strømsone. Det endrer brukskostnaden – og dermed rangeringen."],
  ["2", "Filtrer", "Søk på merke/modell, velg drivstoff, pris, årsmodell og km. «Flere filtre» gir hjuldrift, rekkevidde, fylke, avstand fra Stavanger/Bergen, garanti, hengerfeste, kilde og mye mer."],
  ["3", "Se dashbordet", "Hver bil får en score 0–100: pris mot markedsverdi, kilometerstand, modell, brukskostnad og trygghet. Dashbordet viser de beste kjøpene, et verdikart og vinneren i hver kategori. Listen er sortert billigst først."],
  ["4", "Åpne en bil", "Se markedsverdi og de mest like bilene, full brukskostnad per måned, verditap, importkostnad for svenske biler og få en AI-vurdering av kjente svakheter for modellen."],
  ["5", "Spør AI-agenten", "Trykk «AI-agent» og skriv f.eks. «Finn de beste elbilene under 250 000 i Rogaland». Agenten endrer filtrene for deg, sammenligner biler og søker på nettet. Legg inn Gemini-nøkkelen under ⚙️ først."],
];

export default function IntroModal({ onClose }) {
  return (
    <Modal title="Velkommen til Bilscreeneren 🚗" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-ink2">Siden henter automatisk alle personbiler til salgs på <b className="text-ink">Finn.no</b>, elbiler fra <b className="text-ink">Blocket.se</b> og auksjoner fra <b className="text-ink">KVD</b> to ganger i døgnet, og regner ut hva som er det beste kjøpet for deg med dagens bensin-, diesel- og strømpriser.</p>
        <ol className="space-y-3">
          {STEPS.map(([n, t, d]) => (
            <li key={n} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-white">{n}</span>
              <div><div className="text-sm font-semibold">{t}</div><div className="text-sm text-ink2">{d}</div></div>
            </li>
          ))}
        </ol>
        <p className="rounded-lg bg-ink/5 p-3 text-xs text-ink2">Tallene er estimater basert på annonsepriser – ikke takst eller finansiell rådgivning. Prøvekjør, sjekk servicehistorikk, EU-kontroll og heftelser (og batteritest for elbil) før du kjøper.</p>
        <button className="btn-primary" onClick={onClose}>Kom i gang</button>
      </div>
    </Modal>
  );
}
