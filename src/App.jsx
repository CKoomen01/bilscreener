import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Car, Gauge, Heart, LayoutDashboard, List, Map as MapIcon } from "lucide-react";
import { AppContext, applyFilters, loadData } from "./lib/data.js";
import { analyzeAll, energyPrices } from "./lib/analysis.js";
import {
  assumptionsStore, compareStore, favoritesStore, filtersStore, notesStore, profileStore, settingsStore, useStore, weightsStore,
} from "./lib/store.js";
import Header from "./components/Header.jsx";
import ProfileBar from "./components/ProfileBar.jsx";
import FilterBar from "./components/FilterBar.jsx";
import Dashboard from "./components/Dashboard.jsx";
import ListView from "./components/ListView.jsx";
import MapView from "./components/MapView.jsx";
import MarketView from "./components/MarketView.jsx";
import CarDrawer from "./components/CarDrawer.jsx";
import CompareModal, { CompareTray } from "./components/Compare.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import IntroModal from "./components/IntroModal.jsx";
import BriefCard from "./components/BriefCard.jsx";
import { Empty, Spinner } from "./components/ui.jsx";

const VIEWS = [
  ["dashbord", "Dashbord", LayoutDashboard],
  ["liste", "Biler", List],
  ["kart", "Kart", MapIcon],
  ["favoritter", "Favoritter", Heart],
  ["marked", "Marked og priser", BarChart3],
];

export default function App() {
  const [data, setData] = useState(null);
  const [settings, setSettings] = useStore(settingsStore);
  const [profile, setProfile] = useStore(profileStore);
  const [weights, setWeights] = useStore(weightsStore);
  const [assumptions, setAssumptions] = useStore(assumptionsStore);
  const [filters, setFilters] = useStore(filtersStore);
  const [favorites, setFavorites] = useStore(favoritesStore);
  const [compare, setCompare] = useStore(compareStore);
  const [notes, setNotes] = useStore(notesStore);
  const [view, setView] = useState("dashbord");
  const [openId, setOpenId] = useState(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(!settings.seenIntro);

  useEffect(() => { loadData().then(setData); }, []);

  // Tema
  useEffect(() => {
    const apply = () => {
      const t = settings.theme;
      const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme]);

  const listings = data?.listings || [];
  const market = data?.market || {};
  const meta = data?.meta || {};
  const E = useMemo(() => energyPrices(market, assumptions, profile), [market, assumptions, profile]);

  // Tunge beregninger bruker utsatte verdier, så glidebrytere og skriving føles raske
  const dProfile = useDeferredValue(profile);
  const dWeights = useDeferredValue(weights);
  const dAssump = useDeferredValue(assumptions);
  const dFilters = useDeferredValue(filters);
  const dE = useDeferredValue(E);
  const A = useMemo(() => analyzeAll(listings, dProfile, dWeights, dAssump, dE), [listings, dProfile, dWeights, dAssump, dE]);
  const filtered = useMemo(() => applyFilters(listings, A, dFilters), [listings, A, dFilters]);
  const favList = useMemo(() => applyFilters(listings, A, { sort: dFilters.sort }, favorites, true), [listings, A, dFilters.sort, favorites]);
  const busy = dProfile !== profile || dWeights !== weights || dFilters !== filters || dAssump !== assumptions;

  const openListing = useCallback(id => setOpenId(id), []);
  const byId = useMemo(() => new Map(listings.map(l => [l.id, l])), [listings]);
  const ctx = {
    listings, byId, market, meta, brief: data?.brief, A, filtered, E,
    profile, setProfile, weights, setWeights, assumptions, setAssumptions, filters, setFilters,
    favorites, setFavorites, compare, setCompare, notes, setNotes, settings, setSettings,
    openListing, setView, view, openSettings: () => setSettingsOpen(true), openChat: () => setChatOpen(true),
    openCompare: () => setCompareOpen(true),
  };
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  ctx.getCtx = () => ctxRef.current;

  const open = openId ? byId.get(openId) : null;

  return (
    <AppContext.Provider value={ctx}>
      <div className="min-h-screen">
        <Header onSettings={() => setSettingsOpen(true)} onChat={() => setChatOpen(o => !o)} onHelp={() => setIntroOpen(true)} />
        <main className={`mx-auto max-w-[1440px] space-y-4 px-4 pb-24 pt-4 transition-[padding] ${chatOpen ? "lg:pr-[440px]" : ""}`}>
          {!data ? (
            <div className="flex items-center justify-center gap-2 py-24 text-ink2"><Spinner /> Laster biler …</div>
          ) : !listings.length ? (
            <Empty icon={Car} title="Ingen data ennå">
              Dataene hentes automatisk av GitHub to ganger i døgnet. Første innhenting tar en stund – sjekk igjen om litt.
            </Empty>
          ) : (
            <>
              <ProfileBar />
              <BriefCard />
              <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar" aria-label="Visning">
                {VIEWS.map(([id, label, Icon]) => (
                  <button key={id} onClick={() => setView(id)} aria-pressed={view === id}
                    className={`btn shrink-0 ${view === id ? "bg-ink text-surface" : "text-ink2 hover:bg-ink/5"}`}>
                    <Icon className="h-4 w-4" aria-hidden />{label}
                    {id === "favoritter" && favorites.length > 0 && <span className="num rounded-full bg-accent px-1.5 text-[10px] text-white">{favorites.length}</span>}
                  </button>
                ))}
                {busy && <span className="ml-2 inline-flex items-center gap-1.5 text-xs text-muted"><Gauge className="h-3.5 w-3.5 animate-pulse" /> Regner …</span>}
              </nav>
              {["dashbord", "liste", "kart"].includes(view) && <FilterBar count={filtered.length} />}
              {view === "dashbord" && <Dashboard items={filtered} />}
              {view === "liste" && <ListView items={filtered} />}
              {view === "kart" && <MapView items={filtered} />}
              {view === "favoritter" && (favList.length ? <ListView items={favList} /> : (
                <Empty icon={Heart} title="Ingen favoritter ennå">Trykk på hjertet på en bil for å lagre den her. Favorittene lagres i denne nettleseren.</Empty>
              ))}
              {view === "marked" && <MarketView items={filtered} />}
            </>
          )}
        </main>
        <CompareTray />
        {open && <CarDrawer l={open} onClose={() => setOpenId(null)} />}
        {compareOpen && <CompareModal onClose={() => setCompareOpen(false)} />}
        {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
        {introOpen && <IntroModal onClose={() => { setIntroOpen(false); setSettings(s => ({ ...s, seenIntro: true })); }} />}
      </div>
    </AppContext.Provider>
  );
}
