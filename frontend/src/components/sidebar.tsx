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
const IconCoffee = (): React.JSX.Element => (<svg {...svgBase}><path d="M5 9h12v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9z" /><path d="M17 10h2.4a2.5 2.5 0 0 1 0 5H17" /><path d="M8 3c-.5 1 .5 1.6 0 2.6M12 3c-.5 1 .5 1.6 0 2.6" /></svg>);
const IconInput = (): React.JSX.Element => (
  <svg {...svgBase}><rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M9 9v11" /></svg>
);
const IconReport = (): React.JSX.Element => (<svg {...svgBase}><path d="M3 21h18" /><rect x="5" y="10" width="3" height="8" rx="1" /><rect x="11" y="5" width="3" height="13" rx="1" /><rect x="17" y="13" width="3" height="5" rx="1" /></svg>);
const IconBI = (): React.JSX.Element => (<svg {...svgBase}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>);
const IconGear = (): React.JSX.Element => (<svg {...svgBase}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>);

const COFFEE_SUBS: { id: CoffeeSubPage; label: string }[] = [
  { id: "abrir", label: "Abrir" },
  { id: "geradas", label: "Gerar" },
  { id: "corrigidas", label: "Corrigidas" },
  { id: "pendentes", label: "Pendentes" },
  { id: "verificar", label: "Verificar" },
  { id: "logs", label: "Logs" },
];

function readBool(key: string, def: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return raw === "true";
  } catch { /* ignore */ }
  return def;
}
function writeBool(key: string, val: boolean): void {
  try { localStorage.setItem(key, String(val)); } catch { /* ignore */ }
}


interface IconBtnProps { active?: boolean; soon?: boolean; label: string; onClick?: () => void; children: React.ReactNode; }
function IconBtn({ active, soon, label, onClick, children }: IconBtnProps): React.JSX.Element {
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

// Linha completa (ícone + label) usada na sidebar expandida.
interface RowProps { active?: boolean; soon?: boolean; label: string; onClick?: () => void; icon: React.ReactNode; right?: React.ReactNode; }
function Row({ active, soon, label, onClick, icon, right }: RowProps): React.JSX.Element {
  return (
    <button title={soon ? label + " · em breve" : label} aria-label={label} disabled={soon} onClick={onClick}
            style={{ position: "relative", width: "100%", height: 42, border: 0, borderRadius: 11, padding: "0 10px",
                     cursor: soon ? "default" : "pointer", display: "flex", alignItems: "center", gap: 11,
                     background: active ? "var(--accent-tint)" : "transparent",
                     color: active ? "var(--accent)" : "var(--text-mute)", opacity: soon ? 0.4 : 1,
                     transition: "background .12s, color .12s", textAlign: "left", fontSize: 13.5 }}>
      {active && <span style={{ position: "absolute", left: -4, top: 9, bottom: 9, width: 3, borderRadius: 999, background: "var(--accent)" }} />}
      <span style={{ display: "flex", width: 20, justifyContent: "center", flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {soon ? <span style={{ fontSize: 9, opacity: .8 }}>soon</span> : right}
    </button>
  );
}

interface SidebarProps {
  section: AppSection;
  setSection: (s: AppSection) => void;
  coffeeSub: CoffeeSubPage;
  setCoffeeSub: (s: CoffeeSubPage) => void;
}
export function Sidebar({ section, setSection, coffeeSub, setCoffeeSub }: SidebarProps): React.JSX.Element {
  const [expanded, setExpanded] = React.useState(() => readBool("edp_sidebar_expanded", true));
  const [coffeeOpen, setCoffeeOpen] = React.useState(() => readBool("edp_coffee_open", true));

  function toggleExpanded(): void {
    setExpanded((p) => { const v = !p; writeBool("edp_sidebar_expanded", v); return v; });
  }
  function toggleCoffee(): void {
    setCoffeeOpen((p) => { const v = !p; writeBool("edp_coffee_open", v); return v; });
  }
  function selectSub(sub: CoffeeSubPage): void {
    setCoffeeSub(sub);
    setSection("coffee");
  }

  const navStyle: React.CSSProperties = {
    width: expanded ? 220 : 56, flexShrink: 0, background: "var(--surface)",
    borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column",
    alignItems: expanded ? "stretch" : "center", padding: expanded ? "12px 10px 14px" : "12px 0 14px",
    gap: 6, zIndex: 2, transition: "width 150ms ease",
  };

  return (
    <nav className="edp-nav" style={navStyle}>
      <style>{`.edp-nav button:not(:disabled):hover{background:var(--surface-2)!important;color:var(--text)!important}`}</style>

      {/* Topo: brand + toggle (expandida) | toggle (colapsada) */}
      {expanded ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px 6px" }}>
          <BrandGlyph />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>EDP Verify</span>
          <button aria-label="Colapsar menu" title="Colapsar" onClick={toggleExpanded}
                  style={{ width: 24, height: 24, border: 0, borderRadius: 6, cursor: "pointer",
                           background: "var(--surface-2)", color: "var(--text-mute)", fontSize: 12 }}>
            &laquo;
          </button>
        </div>
      ) : (
        <button aria-label="Expandir menu" title="Expandir" onClick={toggleExpanded}
                style={{ width: 42, height: 42, marginBottom: 6, border: 0, borderRadius: 11, cursor: "pointer",
                         background: "var(--surface-2)", color: "var(--text-mute)", fontSize: 14 }}>
          &raquo;
        </button>
      )}

      {expanded ? (
        <>
          {/* COFFEE com accordion */}
          <Row active={section === "coffee"} label="COFFEE" icon={<IconCoffee />}
               onClick={() => setSection("coffee")}
               right={
                 <span role="button" aria-label={coffeeOpen ? "Fechar sub-itens COFFEE" : "Abrir sub-itens COFFEE"}
                       onClick={(e) => { e.stopPropagation(); toggleCoffee(); }}
                       style={{ width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 10, cursor: "pointer", color: "var(--text-mute)" }}>
                   {coffeeOpen ? "▾" : "▸"}
                 </span>
               } />
          {coffeeOpen && COFFEE_SUBS.map((s) => {
            const isActive = section === "coffee" && coffeeSub === s.id;
            return (
              <button key={s.id} onClick={() => selectSub(s.id)} aria-label={s.label}
                      style={{ position: "relative", display: "flex", alignItems: "center",
                               width: "100%", height: 34, padding: "0 10px 0 41px", border: 0, borderRadius: 9,
                               cursor: "pointer", fontSize: 12.5, textAlign: "left",
                               background: isActive ? "var(--accent-tint)" : "transparent",
                               color: isActive ? "var(--accent)" : "var(--text-mute)", transition: "background .1s" }}>
                {isActive && <span style={{ position: "absolute", left: 24, top: 7, bottom: 7, width: 3, borderRadius: 999, background: "var(--accent)" }} />}
                {s.label}
              </button>
            );
          })}

          <Row active={section === "input"} label="Input" icon={<IconInput />} onClick={() => setSection("input")} />
          <div style={{ flex: 1 }} />
          <div style={{ height: 1, background: "var(--line)", margin: "6px 4px" }} />
          <Row soon label="Relatorios" icon={<IconReport />} />
          <Row soon label="De olho no BI" icon={<IconBI />} />
          <Row soon label="Configuracoes" icon={<IconGear />} />
        </>
      ) : (
        <>
          <IconBtn active={section === "coffee"} label="COFFEE" onClick={() => setSection("coffee")}><IconCoffee /></IconBtn>
          <IconBtn active={section === "input"} label="Input" onClick={() => setSection("input")}><IconInput /></IconBtn>
          <div style={{ flex: 1 }} />
          <IconBtn soon label="Relatorios"><IconReport /></IconBtn>
          <IconBtn soon label="De olho no BI"><IconBI /></IconBtn>
          <IconBtn soon label="Configuracoes"><IconGear /></IconBtn>
        </>
      )}
    </nav>
  );
}
