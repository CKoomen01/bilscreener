# Bilscreener 🚗

Finn det beste bruktbilkjøpet i Norge. Siden henter alle personbiler til salgs på **Finn.no**, brukte elbiler fra **Blocket.se** og auksjoner fra **KVD** (Sverige) to ganger i døgnet. Hver bil får en **score 0–100** basert på pris mot markedsverdi, kilometerstand, modell/pålitelighet, brukskostnad og trygghet. Brukskostnaden regnes med dagens bensin-, diesel- og strømpriser og din egen kjøreprofil.

**Nettside:** https://ckoomen01.github.io/bilscreener/

## Funksjoner

- **Dashbord:** beste kjøp akkurat nå, verdikart (pris mot markedsverdi), vinner i hver kategori og nøkkeltall.
- **Søk og filtre:** fritekst, merke, modell, drivstoff, karosseri, 4×4, pris, årsmodell, km, girkasse, rekkevidde, effekt, seter, kilde, selger, salgsform, fylke, avstand fra by, maks brukskostnad, minimum score, garanti, servicehefte, hengerfeste, prisnedsatt og nye annonser. Standard sortering er billigst først.
- **Din kjøring (påvirker rangeringen):** km per år, andel landevei, turer Stavanger–Bergen (ferje og bom), hjemmelading, strømsone og strømavtale (spot med strømstøtte eller Norgespris), bompasseringer og om verditap skal telle med.
- **Vekting:** du bestemmer hvor mye pris, km, modell, drift og trygghet skal telle.
- **Hver bil:** markedsverdi med usikkerhetsbånd og de mest like bilene, brukskostnad linje for linje, verditap, eierkostnad over flere år, importregnestykke for svenske biler, utstyr, beskrivelse, notater og budkalkulator.
- **AI (Gemini):** AI-vurdering av hver bil (søker etter kjente feil for modellen og årsmodellen), en AI-agent som filtrerer og sammenligner for deg, og en daglig AI-oppsummering.
- Favoritter, sammenligning av opptil fire biler, kart, markedsvisning med drivstoff- og strømpriser og modellstatistikk.

## Slik fungerer det

| Del | Hva |
| --- | --- |
| `scripts/vend.py` | Finn og Blocket bruker samme plattform. Henteren bruker sidenes interne søke-API. Søket deles opp etter karosseri, hjuldrift, drivstoff og prisintervaller til hver del har under 2 500 treff. |
| `scripts/kvd.py` | KVD sitt åpne auksjons-API. Brukes for forventet sluttpris, forbruk, CO₂ og antall eiere. |
| `scripts/prices.py` | Drivstoffpriser fra SSB (tabell 09654), spotpris per strømsone fra hvakosterstrommen.no og valuta fra Norges Bank. |
| `scripts/valuation.py` | Hierarkisk ridge-regresjon på log(pris) i nivåene marked → merke → modell → drivstoff, med leave-one-out. Gir markedsverdi, spredning og verditap per år og per 10 000 km. |
| `scripts/fetch_data.py` | Kjører alt, fjerner duplikater (samme regnr.), finner fylke og henter detaljsider (effekt, vekt, EU-kontroll, utstyr). Rogaland og Vestland prioriteres. |
| `src/lib/analysis.js` | Forbruk, brukskostnad, importkostnad og score. Alt regnes i nettleseren og oppdateres med en gang. |
| `.github/workflows/update.yml` | Kjører kl. 04 og 14 UTC. Tilstanden lagres i grenen `data`, og siden publiseres på GitHub Pages. |

## Gemini-nøkkel

- **I nettsiden:** ⚙️ → lim inn nøkkelen fra [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Den lagres bare i nettleseren din.
- **Daglig AI-oppsummering:** legg nøkkelen inn som repo-secret `GEMINI_API_KEY`. Nøkkelen skal aldri stå i koden.

## Kjør lokalt

```bash
pip install -r scripts/requirements.txt
python scripts/fetch_data.py --out public/data --cache cache   # ca. 30–60 min første gang
npm install && npm run dev
```

Tallene er estimater basert på annonsepriser og er ikke takst eller finansiell rådgivning. Pålitelighetstallene er skjønnsmessige. Prøvekjør bilen og sjekk servicehistorikk, EU-kontroll og heftelser før du kjøper. For elbil bør du også få en batteritest.
