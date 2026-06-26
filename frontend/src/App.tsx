import React from 'react';
import type { Note, TweakState, Source, AppSection, Accent, CoffeeSubPage } from './types';
import type { TriageHandoff } from './coffee/coffee-verificar';
import { usePersistedState } from './hooks/use-persisted-state';
import { EDPApi } from './api';
import { EDP_DEMO } from './data';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle, TweakColor } from './components/tweaks-panel';
import { Sidebar } from './components/sidebar';
import { useTriageData } from './hooks/useTriageData';
const InputSection = React.lazy(() =>
  import('./input/input-section').then((m) => ({ default: m.InputSection })));
const CoffeeHub = React.lazy(() =>
  import('./coffee/coffee-hub').then((m) => ({ default: m.CoffeeHub })));

type CssVars = React.CSSProperties & Record<`--${string}`, string>;

const TWEAK_DEFAULTS: TweakState = {
  theme: "dark",
  density: "cozy",
  accent: ["#00a859", "#1dbd6e", "rgba(0,168,89,0.13)"],
  showKpis: true,
  coffeeLayout: "composer",
};

const VERIFY_FILTER_KEYS = [
  "edp_verify_q", "edp_verify_uf", "edp_verify_setor", "edp_verify_urg",
  "edp_verify_status", "edp_verify_situacao", "edp_verify_rules", "edp_verify_sel",
];
function limparFiltrosVerify(): void {
  try { VERIFY_FILTER_KEYS.forEach((k) => sessionStorage.removeItem(k)); } catch { /* ignore */ }
}

const TRIAGE_SNAPSHOT_KEY = "edp_triage_snapshot";

interface TriageSnapshot {
  notes: Note[];
  completed: string[];
  dupResolved: string[];
  file: string;
  source: Source;
  screen: "upload" | "dashboard";
}

function lerSnapshot(): TriageSnapshot | null {
  try {
    const raw = sessionStorage.getItem(TRIAGE_SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as TriageSnapshot) : null;
  } catch { return null; }
}
function gravarSnapshot(s: TriageSnapshot): void {
  try { sessionStorage.setItem(TRIAGE_SNAPSHOT_KEY, JSON.stringify(s)); } catch { /* cota/indisponivel: degrada */ }
}
function limparSnapshot(): void {
  try { sessionStorage.removeItem(TRIAGE_SNAPSHOT_KEY); } catch { /* ignore */ }
}

function SectionLoading(): React.JSX.Element {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--text-mute)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
      Carregando…
    </div>
  );
}

export default function App(): React.JSX.Element {
  const [t, setTweak] = useTweaks<TweakState>(TWEAK_DEFAULTS);
  const _snap = React.useMemo(() => lerSnapshot(), []);
  const [screen, setScreen] = React.useState<"upload" | "dashboard">(_snap?.screen ?? "upload");
  const [notes, setNotes] = React.useState<Note[]>(_snap?.notes ?? []);
  const [completed, setCompleted] = React.useState<Set<string>>(() => new Set(_snap?.completed ?? []));
  const [dupResolved, setDupResolved] = React.useState<Set<string>>(() => new Set(_snap?.dupResolved ?? []));
  const [file, setFile] = React.useState(_snap?.file ?? "");
  const [source, setSource] = React.useState<Source>(_snap?.source ?? "demo");
  const [section, setSection] = React.useState<AppSection>("coffee");
  const [coffeeReturn, setCoffeeReturn] = React.useState<{ noteId: string; noteRef: string } | null>(null);
  const [coffeeSub, setCoffeeSub] = usePersistedState<CoffeeSubPage>("edp_coffee_sub", "verificar");
  const accentStyle: CssVars = { "--accent": t.accent[0], "--accent-2": t.accent[1], "--accent-tint": t.accent[2] };

  React.useEffect(() => {
    if (screen !== "dashboard" || notes.length === 0) return;
    gravarSnapshot({
      notes, completed: [...completed], dupResolved: [...dupResolved], file, source, screen,
    });
  }, [notes, completed, dupResolved, file, source, screen]);

  function changeSection(s: AppSection): void {
    if (s !== "coffee") setCoffeeReturn(null);
    setSection(s);
  }

  const { data: apiData } = useTriageData();

  React.useEffect(() => {
    if (_snap) return;  // snapshot válido tem prioridade sobre o refetch
    if (!apiData?.notes?.length || screen !== "upload" || source === "demo") return;
    setNotes(apiData.notes);
    setCompleted(apiData.completed);
    setSource("api");
    setFile(localStorage.getItem("edp_file") ?? "planilha carregada");
    setScreen("dashboard");
  }, [apiData]); // eslint-disable-line react-hooks/exhaustive-deps

  function loadDemo(name?: string): void {
    limparFiltrosVerify();
    limparSnapshot();
    const savedDone = JSON.parse(localStorage.getItem("edp_demo_done") ?? "null") as string[] | null;
    const savedDup = JSON.parse(localStorage.getItem("edp_demo_dup") ?? "null") as string[] | null;
    setNotes(EDP_DEMO.notes);
    setCompleted(new Set(savedDone ?? EDP_DEMO.defaultDone));
    setDupResolved(new Set(savedDup ?? EDP_DEMO.defaultDup));
    setSource("demo"); setFile(name ?? EDP_DEMO.file); setScreen("dashboard");
  }

  async function handleUpload(f: File): Promise<void> {
    limparFiltrosVerify();
    limparSnapshot();
    await EDPApi.upload(f);
    const d = await EDPApi.fetchData();
    setNotes(d.notes); setCompleted(d.completed); setSource("api");
    setFile(f.name); localStorage.setItem("edp_file", f.name);
    setScreen("dashboard");
  }

  function persistDone(set: Set<string>): void { if (source === "demo") localStorage.setItem("edp_demo_done", JSON.stringify([...set])); }
  function persistDup(set: Set<string>): void { if (source === "demo") localStorage.setItem("edp_demo_dup", JSON.stringify([...set])); }

  function toggleComplete(id: string): void {
    const reopening = completed.has(id);
    setCompleted((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); persistDone(s); return s; });
    if (reopening) setDupResolved((prev) => { const s = new Set(prev); s.delete(id); persistDup(s); return s; });
    if (source === "api") EDPApi.toggleComplete(id).catch(() => {});
  }

  function markMany(ids: string[], action: "done" | "reopen"): void {
    const marking = action === "done";
    const targets = ids.filter((id) => completed.has(id) !== marking);
    setCompleted((prev) => {
      const s = new Set(prev);
      targets.forEach((id) => { if (marking) s.add(id); else s.delete(id); });
      persistDone(s);
      return s;
    });
    if (source === "api") targets.forEach((id) => EDPApi.toggleComplete(id).catch(() => {}));
  }

  function sendToCoffeeQueue(ids: string[], sourceId?: string): void {
    const existing = JSON.parse(localStorage.getItem("edp_coffee_ids") ?? "[]") as string[];
    const valid = ids.filter((id) => /^\d{5,12}$/.test(id));
    const merged = [...new Set([...existing, ...valid])];
    localStorage.setItem("edp_coffee_ids", JSON.stringify(merged));
    if (sourceId) {
      const src = notes.find((n) => n.id === sourceId);
      setCoffeeReturn(src ? { noteId: src.id, noteRef: src.referencia } : null);
    }
    setCoffeeSub("abrir");
    setSection("coffee");
  }

  function markDuplicate(id: string): void {
    const undo = dupResolved.has(id);
    setDupResolved((prev) => { const s = new Set(prev); if (undo) s.delete(id); else s.add(id); persistDup(s); return s; });
    setCompleted((prev) => { const s = new Set(prev); if (undo) s.delete(id); else s.add(id); persistDone(s); return s; });
    if (source === "api") {
      if (undo) EDPApi.toggleComplete(id).catch(() => {});
      else EDPApi.markDuplicate(id).catch(() => {});
    }
  }

  const triage: TriageHandoff = {
    resolvedTheme: t.theme as "dark" | "light",
    showKpis: t.showKpis,
    notes, completed, dupResolved, source, file, screen,
    onToggleComplete: toggleComplete,
    onMarkMany: markMany,
    onMarkDuplicate: markDuplicate,
    onSendToCoffee: sendToCoffeeQueue,
    onUpload: handleUpload,
    onDemo: loadDemo,
    onReset: () => { setCoffeeReturn(null); limparSnapshot(); setScreen("upload"); },
  };

  return (
    <div className="edp triage" data-theme={t.theme} data-density={t.density}
         style={{ height: "100vh", display: "flex", flexDirection: "row", background: "var(--bg)", ...accentStyle }}>
      <Sidebar section={section} setSection={changeSection}
               coffeeSub={coffeeSub} setCoffeeSub={setCoffeeSub} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <React.Suspense fallback={<SectionLoading />}>
          {section === "input" ? (
            <InputSection />
          ) : (
            <CoffeeHub notes={notes} layout={t.coffeeLayout}
                       sub={coffeeSub} setSub={setCoffeeSub}
                       triage={triage}
                       coffeeReturn={coffeeReturn}
                       onClearReturn={() => setCoffeeReturn(null)}
                       onBackToTriagem={() => { setCoffeeSub("verificar"); }} />
          )}
        </React.Suspense>
      </div>

      <TweaksPanel>
        <TweakSection label="Aparência" />
        <TweakRadio label="Tema" value={t.theme} options={["dark", "light"]} onChange={(val) => setTweak("theme", val)} />
        <TweakRadio label="Densidade" value={t.density} options={["compact", "cozy"]} onChange={(val) => setTweak("density", val)} />
        <TweakColor label="Cor de destaque" value={t.accent}
                    options={[["#00a859", "#1dbd6e", "rgba(0,168,89,0.13)"],
                              ["#1f9fd6", "#46b6e3", "rgba(31,159,214,0.14)"],
                              ["#6b5ce6", "#8576ec", "rgba(107,92,230,0.15)"]]}
                    onChange={(val) => setTweak("accent", val as Accent)} />
        <TweakSection label="Layout" />
        <TweakToggle label="Mostrar indicadores (KPIs)" value={t.showKpis} onChange={(val) => setTweak("showKpis", val)} />
        <TweakSection label="Seção COFFEE" />
        <TweakRadio label="Layout" value={t.coffeeLayout}
                    options={[{ value: "composer", label: "Composer" }, { value: "split", label: "Split" }]}
                    onChange={(val) => setTweak("coffeeLayout", val)} />
      </TweaksPanel>
    </div>
  );
}
