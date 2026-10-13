// Kunnskap om merker og modeller som brukes i «Modell»-scoren og i forbruksestimatet.
// Pålitelighet (0–100) er en skjønnsmessig sammenstilling av offentlig tilgjengelige kilder
// (TÜV-rapporten, NAF/Consumer Reports-undersøkelser, typiske verkstedserfaringer).
// Den er grov og ment som én av flere faktorer – AI-vurderingen i hver bil går mer i dybden.

const MAKES = {
  toyota: 90, lexus: 92, mazda: 84, honda: 84, suzuki: 80, subaru: 78, mitsubishi: 74, kia: 79, hyundai: 78,
  skoda: 77, seat: 72, cupra: 70, volkswagen: 72, audi: 68, porsche: 74, volvo: 73, polestar: 70, tesla: 70,
  bmw: 66, mini: 64, "mercedes-benz": 65, smart: 60, ford: 66, opel: 63, peugeot: 62, citroen: 60, ds: 58,
  renault: 60, dacia: 70, nissan: 66, fiat: 55, alfaromeo: 52, jeep: 52, landrover: 45, jaguar: 50, mg: 64,
  byd: 68, xpeng: 64, nio: 60, aiways: 52, maxus: 55, ora: 58, gwm: 58, voyah: 58, zeekr: 64, lynkco: 65,
  chevrolet: 60, cadillac: 56, dodge: 54, chrysler: 52, ram: 56, saab: 58, infiniti: 66, ssangyong: 62, kgm: 62,
  jac: 55, dongfeng: 55, leapmotor: 60, firefly: 60, genesis: 74, alpine: 60, abarth: 55, lancia: 52,
  ferrari: 65, lamborghini: 60, maserati: 48, bentley: 55, astonmartin: 52, rollsroyce: 60, lotus: 55,
};

// Modellspesifikke justeringer (legges til merkets tall)
const MODEL_ADJ = [
  [/^toyota.*(prius|yaris|corolla|rav4|auris|c-?hr)/, 4],
  [/^lexus/, 0],
  [/^mazda.*(cx-?5|mazda3|3$|cx-?30)/, 2],
  [/^honda.*(jazz|cr-?v)/, 3],
  [/^nissan.*leaf/, -6],             // batterislitasje uten aktiv kjøling
  [/^nissan.*qashqai/, -4],
  [/^tesla.*model ?3/, 4],
  [/^tesla.*model ?y/, 2],
  [/^tesla.*model ?s/, -6],
  [/^tesla.*model ?x/, -12],
  [/^volkswagen.*(golf|passat)/, 2],
  [/^volkswagen.*(id\.?3|id\.?4|id\.?5)/, -2],
  [/^volkswagen.*(e-?golf|e-?up)/, 4],
  [/^hyundai.*ioniq/, 3],
  [/^kia.*(niro|ceed|soul)/, 2],
  [/^skoda.*(octavia|superb|fabia)/, 3],
  [/^audi.*e-?tron/, -4],
  [/^bmw.*i3/, 4],
  [/^bmw.*(x5|x6|x7)/, -4],
  [/^mercedes-benz.*(eqc|eqs|eqe|gle|gls)/, -5],
  [/^volvo.*(xc90|xc60)/, -2],
  [/^volvo.*(v60|v70|v90|xc40)/, 1],
  [/^ford.*focus/, -2],
  [/^ford.*mustang mach/, 0],
  [/^peugeot.*(208|2008)/, 2],
  [/^renault.*zoe/, 2],
  [/^jeep.*(compass|renegade)/, -4],
  [/^land ?rover.*(discovery|range rover)/, -4],
  [/^mitsubishi.*outlander/, 2],
];

// Reelt forbruk (norske forhold, helårssnitt) for vanlige modeller: kWh/100 km for elbil, l/100 km ellers
const CONS = [
  [/tesla.*model ?3/, 16.5], [/tesla.*model ?y/, 18], [/tesla.*model ?s/, 20.5], [/tesla.*model ?x/, 23.5],
  [/volkswagen.*id\.?\s?3/, 17.5], [/volkswagen.*id\.?\s?4/, 19.5], [/volkswagen.*id\.?\s?5/, 19], [/volkswagen.*id\.?\s?7/, 18.5],
  [/volkswagen.*id\.?\s?buzz/, 23], [/volkswagen.*e-?golf/, 16], [/volkswagen.*e-?up/, 14.5], [/skoda.*enyaq/, 19.5],
  [/skoda.*elroq/, 18], [/audi.*q4/, 19.5], [/audi.*q8 e-?tron|audi.*e-?tron(?!.*gt)/, 25], [/audi.*e-?tron gt/, 22],
  [/nissan.*leaf/, 17], [/nissan.*ariya/, 19.5], [/hyundai.*ioniq ?5/, 19.5], [/hyundai.*ioniq ?6/, 16.5],
  [/hyundai.*ioniq(?! ?[56])/, 14.5], [/hyundai.*kona/, 16.5], [/kia.*(e-?niro|niro ev)/, 17], [/kia.*ev ?6/, 19.5],
  [/kia.*ev ?9/, 23], [/kia.*ev ?3/, 17], [/kia.*e-?soul/, 17], [/polestar.*2/, 19], [/polestar.*3/, 23], [/polestar.*4/, 20.5],
  [/volvo.*ex ?30/, 17], [/volvo.*(xc40|ex40|c40)/, 21], [/volvo.*(ex ?90|ex90)/, 24], [/bmw.*i3/, 15],
  [/bmw.*ix3/, 19.5], [/bmw.*\bi4\b/, 18], [/bmw.*\bix\b(?!1|2|3)/, 22], [/bmw.*ix1/, 18.5], [/mercedes.*eqc/, 24],
  [/mercedes.*eqa/, 18.5], [/mercedes.*eqb/, 19.5], [/mercedes.*eqe/, 20], [/renault.*zoe/, 16], [/renault.*megane e/, 17],
  [/mg.*(mg ?4|\b4\b)/, 17.5], [/mg.*zs/, 19], [/mg.*marvel/, 21], [/byd.*atto ?3/, 18], [/byd.*seal(?!ion)/, 17.5],
  [/byd.*dolphin/, 16], [/byd.*(sealion|tang)/, 21], [/ford.*mach-?e/, 20], [/ford.*explorer/, 18.5],
  [/toyota.*bz ?4x/, 19], [/subaru.*solterra/, 19.5], [/peugeot.*e-?208|peugeot.*208.*el/, 16], [/peugeot.*e-?2008/, 17.5],
  [/fiat.*500/, 15], [/opel.*corsa/, 16], [/cupra.*born/, 17.5], [/xpeng.*g ?6/, 18.5], [/zeekr/, 19],
  [/toyota.*yaris/, 4.6], [/toyota.*corolla/, 5.0], [/toyota.*prius/, 4.7], [/toyota.*c-?hr/, 5.4],
  [/toyota.*rav ?4/, 6.3], [/toyota.*auris/, 5.2], [/lexus.*(ux|nx)/, 6.4], [/honda.*jazz/, 4.9],
];

const norm = s => (s || "").toLowerCase().replace(/\s+/g, " ").trim();

const relCache = new Map();
const consCache = new Map();

export function reliability(make, model) {
  const ck = `${make}|${model}`;
  if (relCache.has(ck)) return relCache.get(ck);
  const v = reliabilityRaw(make, model);
  relCache.set(ck, v);
  return v;
}

function reliabilityRaw(make, model) {
  const mk = norm(make).replace(/[^a-z-]/g, "");
  let r = MAKES[mk] ?? MAKES[mk.replace(/-/g, "")] ?? 62;
  const key = `${norm(make)} ${norm(model)}`;
  for (const [re, adj] of MODEL_ADJ) if (re.test(key)) { r += adj; break; }
  return Math.max(30, Math.min(97, r));
}

export function knownConsumption(make, model) {
  const ck = `${make}|${model}`;
  if (consCache.has(ck)) return consCache.get(ck);
  const key = `${norm(make)} ${norm(model)}`;
  let v = null;
  for (const [re, x] of CONS) if (re.test(key)) { v = x; break; }
  consCache.set(ck, v);
  return v;
}

export const RELIABILITY_LABEL = r =>
  r >= 85 ? "svært pålitelig" : r >= 75 ? "pålitelig" : r >= 65 ? "middels" : r >= 55 ? "under middels" : "mange kjente problemer";
