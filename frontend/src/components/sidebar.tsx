import React from 'react';
import type { AppSection, CoffeeSubPage } from '../types';

const svgBase = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const BrandGlyph = (): React.JSX.Element => (
  <svg width="26" height="26" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="30" fill="none" stroke="var(--indigo)" strokeWidth="9" />
    <circle cx="50" cy="50" r="18" fill="none" stroke="var(--blue)" strokeWidth="9" />
    <circle cx="50" cy="50" r="7" fill="none" stroke="var(--green)" strokeWidth="9" />
  </svg>
);
const IconTriage = (): React.JSX.Element => (<svg {...svgBase}><path d="M4 6h10M4 12h10M4 18h7" /><path d="M15.5 16.5l2 2 4-4.5" /></svg>);
const IconCoffee = (): React.JSX.Element => (<svg {...svgBase}><path d="M5 9h12v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9z" /><path d="M17 10h2.4a2.5 2.5 0 0 1 0 5H17" /><path d="M8 3c-.5 1 .5 1.6 0 2.6M12 3c-.5 1 .5 1.6 0 2.6" /></svg>);
const IconInput = (): React.JSX.Element => (
  <svg {...svgBase}><rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M9 9v11" /></svg>
);
const IconReport = (): React.JSX.Element => (<svg {...svgBase}><path d="M3 21h18" /><rect x="5" y="10" width="3" height="8" rx="1" /><rect x="11" y="5" width="3" height="13" rx="1" /><rect x="17" y="13" width="3" height="5" rx="1" /></svg>);
const IconBI = (): React.JSX.Element => (<svg {...svgBase}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>);
const IconGear = (): React.JSX.Element => (<svg {...svgBase}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>);

interface NavBtnProps { active?: boolean; soon?: boolean; label: string; onClick?: () => void; children: React.ReactNode; }
function NavBtn({ active, soon, label, onClick, children }: NavBtnProps): React.JSX.Element {
  return (
    <button title={soon ? label + " · em breve" : label} aria-label={label} disabled={soon} onClick={onClick}
            style={{ position: "relative", width: 42, height: 42, border: 0, borderRadius: 11,
                     cursor: soon ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                     background: active ? "var(--accent-tint)" : "transparent",
                     color: active ? "var(--accent)" : "var(--text-mute)", opacity: soon ? 0.4 : 1, transition: "background .12s, color .12s" }}>
      {active && <span style={{ position: "absolute", left: -7, top: 9, bottom: 9, width: 3, borderRadius: 999, background: "var(--accent)" }} />}
      {children}
      {soon && <span style={{ position: "absolute", top: 4, right: 4, width: 5, height: 5, borderRadius: "50%", background: "var(--amber)" }} />}
    </button>
  );
}

const COFFEE_SUBS: { id: CoffeeSubPage; label: string; icon: string }[] = [
  { id: "abrir", label: "Abrir Notas", icon: "☕" },
  { id: "geradas", label: "Geradas", icon: "✓" },
  { id: "corrigidas", label: "Corrigidas", icon: "↻" },
  { id: "pendentes", label: "Pendentes", icon: "⏳" },
  { id: "verificar", label: "Verificar", icon: "🔍" },
];

function readCoffeeSub(): CoffeeSubPage {
  try {
    const raw = sessionStorage.getItem("edp_coffee_sub");
    if (raw) return JSON.parse(raw) as CoffeeSubPage;
  } catch { /* ignore */ }
  return "abrir";
}

function writeCoffeeSub(sub: CoffeeSubPage): void {
  try { sessionStorage.setItem("edp_coffee_sub", JSON.stringify(sub)); } catch { /* ignore */ }
}

interface SidebarProps { section: AppSection; setSection: (s: AppSection) => void; }
export function Sidebar({ section, setSection }: SidebarProps): React.JSX.Element {
  const [flyoutOpen, setFlyoutOpen] = React.useState(false);
  const flyoutRef = React.useRef<HTMLDivElement>(null);
  const chevronRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!flyoutOpen) return;
    function onMouseDown(e: MouseEvent): void {
      if (flyoutRef.current?.contains(e.target as Node)) return;
      if (chevronRef.current?.contains(e.target as Node)) return;
      setFlyoutOpen(false);
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") setFlyoutOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("mousedown", onMouseDown); document.removeEventListener("keydown", onKeyDown); };
  }, [flyoutOpen]);

  function selectSub(sub: CoffeeSubPage): void {
    writeCoffeeSub(sub);
    setSection("coffee");
    setFlyoutOpen(false);
  }

  const activeSub = readCoffeeSub();

  return (
    <nav className="edp-nav" style={{ width: 56, flexShrink: 0, background: "var(--surface)", borderRight: "1px solid var(--line)",
         display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 0 14px", gap: 6, zIndex: 2 }}>
      <style>{`.edp-nav button:not(:disabled):hover{background:var(--surface-2)!important;color:var(--text)!important}`}</style>
      <div style={{ marginBottom: 10 }}><BrandGlyph /></div>
      <NavBtn active={section === "triagem"} label="Triagem" onClick={() => setSection("triagem")}><IconTriage /></NavBtn>

      {/* COFFEE com flyout */}
      <div style={{ position: "relative" }}>
        <NavBtn active={section === "coffee"} label="COFFEE" onClick={() => setSection("coffee")}><IconCoffee /></NavBtn>
        <button ref={chevronRef} aria-label="Sub-paginas COFFEE"
                onClick={() => setFlyoutOpen((p) => !p)}
                style={{ position: "absolute", bottom: 0, right: 0, width: 14, height: 14, border: 0,
                         borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                         background: flyoutOpen ? "var(--accent)" : "var(--surface-2)",
                         color: flyoutOpen ? "#fff" : "var(--text-mute)", fontSize: 8, lineHeight: 1,
                         transition: "background .12s" }}>
          ▾
        </button>

        {flyoutOpen && (
          <div ref={flyoutRef}
               style={{ position: "absolute", left: "calc(100% + 8px)", top: 0, width: 180,
                        background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-md)",
                        boxShadow: "0 4px 24px rgba(0,0,0,.25)", zIndex: 100,
                        display: "flex", flexDirection: "column", padding: "4px 0", overflow: "hidden" }}>
            {COFFEE_SUBS.map((s) => {
              const isActive = section === "coffee" && activeSub === s.id;
              return (
                <button key={s.id} onClick={() => selectSub(s.id)}
                        style={{ position: "relative", display: "flex", alignItems: "center", gap: 10,
                                 padding: "9px 14px", border: 0, cursor: "pointer", fontSize: 13,
                                 background: isActive ? "var(--accent-tint)" : "transparent",
                                 color: isActive ? "var(--accent)" : "var(--text)",
                                 transition: "background .1s" }}>
                  {isActive && <span style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: 3,
                                              borderRadius: 999, background: "var(--accent)" }} />}
                  <span style={{ width: 18, textAlign: "center", fontSize: 14 }}>{s.icon}</span>
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <NavBtn active={section === "input"} label="Input" onClick={() => setSection("input")}><IconInput /></NavBtn>
      <div style={{ flex: 1 }} />
      <NavBtn soon label="Relatorios"><IconReport /></NavBtn>
      <NavBtn soon label="De olho no BI"><IconBI /></NavBtn>
      <NavBtn soon label="Configuracoes"><IconGear /></NavBtn>
    </nav>
  );
}
