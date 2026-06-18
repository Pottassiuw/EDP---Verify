import React from 'react';
import type { Note, TweakState, Source, AppSection, Theme, Accent, SetTweak } from './types';
import { EDPApi } from './api';
import { EDP_DEMO } from './data';
import { Logo } from './components/shared';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle, TweakColor } from './components/tweaks-panel';
import { UploadScreen } from './components/upload-screen';
import { Dashboard } from './components/dashboard';
import { Sidebar } from './components/sidebar';
import { useTriageData } from './hooks/useTriageData';
const InputSection = React.lazy(() =>
  import('./input/input-section').then((m) => ({ default: m.InputSection })));
const CoffeeSection = React.lazy(() =>
  import('./components/coffee-section').then((m) => ({ default: m.CoffeeSection })));

type CssVars = React.CSSProperties & Record<`--${string}`, string>;

const TWEAK_DEFAULTS: TweakState = {
  theme: "dark",
  density: "cozy",
  accent: ["#00a859", "#1dbd6e", "rgba(0,168,89,0.13)"],
  showKpis: true,
  coffeeLayout: "composer",
};

interface TopBarProps { t: TweakState; setTweak: SetTweak<TweakState>; file: string; source: Source; onReset: () => void; }
function TopBar({ t, setTweak, file, source, onReset }: TopBarProps): React.JSX.Element {
  return (
    <div style={{ height: 56, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "0 22px", background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
      <Logo theme={t.theme} h={24} />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="edp-mono" style={{ fontSize: 11, color: "var(--text-mute)", background: "var(--bg-2)",
                   padding: "5px 10px", borderRadius: 6, border: "1px solid var(--line)" }}>{file}</span>
        <span title={source === "api" ? "Conectado ao backend" : "Dados de demonstração (offline)"}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontFamily: "var(--font-mono)",
                       letterSpacing: ".06em", textTransform: "uppercase", padding: "4px 9px", borderRadius: 999,
                       color: source === "api" ? "var(--green)" : "var(--amber)",
                       background: source === "api" ? "var(--tint-green)" : "var(--tint-amber)",
                       border: "1px solid " + (source === "api" ? "rgba(0,168,89,.3)" : "rgba(240,169,59,.3)") }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
          {source === "api" ? "API" : "Demo"}
        </span>
        <div className="edp-seg">
          {(["dark", "light"] as Theme[]).map((th) => (
            <button key={th} className={t.theme === th ? "on" : ""} onClick={() => setTweak("theme", th)}>
              {th === "dark" ? "Escuro" : "Claro"}</button>
          ))}
        </div>
        <button className="edp-btn ghost sm" title="Nova planilha" onClick={onReset}>↑ Nova</button>
      </div>
    </div>
  );
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
  const [screen, setScreen] = React.useState<"upload" | "dashboard">("upload");
  const [notes, setNotes] = React.useState<Note[]>([]);
  const [completed, setCompleted] = React.useState<Set<string>>(() => new Set());
  const [dupResolved, setDupResolved] = React.useState<Set<string>>(() => new Set());
  const [file, setFile] = React.useState("");
  const [source, setSource] = React.useState<Source>("demo");
  const [section, setSection] = React.useState<AppSection>("triagem");
  const [coffeeReturn, setCoffeeReturn] = React.useState<{ noteId: string; noteRef: string } | null>(null);
  const accentStyle: CssVars = { "--accent": t.accent[0], "--accent-2": t.accent[1], "--accent-tint": t.accent[2] };

  function changeSection(s: AppSection): void {
    if (s !== "coffee") setCoffeeReturn(null);
    setSection(s);
  }

  const { data: apiData } = useTriageData();

  React.useEffect(() => {
    if (!apiData?.notes?.length || screen !== "upload" || source === "demo") return;
    setNotes(apiData.notes);
    setCompleted(apiData.completed);
    setSource("api");
    setFile(localStorage.getItem("edp_file") ?? "planilha carregada");
    setScreen("dashboard");
  }, [apiData]); // eslint-disable-line react-hooks/exhaustive-deps

  function loadDemo(name?: string): void {
    const savedDone = JSON.parse(localStorage.getItem("edp_demo_done") ?? "null") as string[] | null;
    const savedDup = JSON.parse(localStorage.getItem("edp_demo_dup") ?? "null") as string[] | null;
    setNotes(EDP_DEMO.notes);
    setCompleted(new Set(savedDone ?? EDP_DEMO.defaultDone));
    setDupResolved(new Set(savedDup ?? EDP_DEMO.defaultDup));
    setSource("demo"); setFile(name ?? EDP_DEMO.file); setScreen("dashboard");
  }

  async function handleUpload(f: File): Promise<void> {
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

  return (
    <div className="edp triage" data-theme={t.theme} data-density={t.density}
         style={{ height: "100vh", display: "flex", flexDirection: "row", background: "var(--bg)", ...accentStyle }}>
      <Sidebar section={section} setSection={changeSection} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <React.Suspense fallback={<SectionLoading />}>
          {section === "input" ? (
            <InputSection t={t} />
          ) : screen === "upload" ? (
            <UploadScreen theme={t.theme} onDemo={loadDemo} onUpload={handleUpload} />
          ) : (
            <React.Fragment>
              <TopBar t={t} setTweak={setTweak} file={file} source={source} onReset={() => { setCoffeeReturn(null); setScreen("upload"); }} />
              {section === "coffee" && coffeeReturn && (
                <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "8px 18px",
                              background: "var(--tint-amber)", borderBottom: "1px solid rgba(240,169,59,.3)",
                              fontSize: 13, color: "var(--text)" }}>
                  <span style={{ fontSize: 15, lineHeight: 1 }}>←</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    Você estava na{" "}
                    <strong className="edp-mono" style={{ fontSize: 13 }}>Nota {coffeeReturn.noteId}</strong>
                    {coffeeReturn.noteRef ? <span style={{ color: "var(--text-dim)" }}> · {coffeeReturn.noteRef}</span> : null}
                  </span>
                  <button className="edp-btn sm" style={{ background: "var(--accent)", borderColor: "var(--accent)", color: "#fff", fontWeight: 600 }}
                          onClick={() => { changeSection("triagem"); }}>
                    ← Voltar à triagem
                  </button>
                  <button onClick={() => setCoffeeReturn(null)}
                          style={{ all: "unset", cursor: "pointer", fontSize: 18, lineHeight: 1, color: "var(--text-mute)", padding: "2px 6px" }}
                          title="Dispensar" aria-label="Dispensar">×</button>
                </div>
              )}
              {section === "triagem"
                ? <Dashboard t={t} notes={notes} completed={completed} dupResolved={dupResolved}
                             onToggleComplete={toggleComplete} onMarkMany={markMany} onMarkDuplicate={markDuplicate}
                             onSendToCoffee={sendToCoffeeQueue} />
                : <CoffeeSection notes={notes} layout={t.coffeeLayout} />}
            </React.Fragment>
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
