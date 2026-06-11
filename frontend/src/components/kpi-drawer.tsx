import React from 'react';
import type { KpiDrawerProps } from '../types';

export function KpiDrawer(props: KpiDrawerProps): React.JSX.Element {
  const { pct, cTotal, cOk, cErr, cDup, cDone, cVisible } = props;
  const [open, setOpen] = React.useState(false);

  const safePct = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;

  const fabRef = React.useRef<HTMLButtonElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const mountedRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  React.useEffect(() => {
    if (open) {
      closeRef.current?.focus();
    } else if (mountedRef.current) {
      fabRef.current?.focus();
    }
    mountedRef.current = true;
  }, [open]);

  const rows: Array<[string, number, "red" | "indigo" | "blue" | "green"]> = [
    ["Com erro", cErr, "red"], ["Duplicatas", cDup, "indigo"],
    ["Visíveis (filtro atual)", cVisible, "blue"], ["Concluídas", cDone, "green"],
  ];

  return (
    <React.Fragment>
      <style>{`@keyframes kpi-slide-in{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
      {!open && (
        <button ref={fabRef} onClick={() => setOpen(true)} title="Indicadores" aria-label="Abrir indicadores"
                style={{ position: "fixed", right: 18, bottom: 18, zIndex: 40, display: "flex", alignItems: "center", gap: 8,
                         padding: "10px 16px", border: 0, borderRadius: 999, cursor: "pointer",
                         background: "var(--accent)", color: "#fff", fontFamily: "var(--font-display)",
                         fontWeight: 800, fontSize: 14, boxShadow: "0 4px 14px rgba(0,0,0,.35)" }}>
          <span style={{ fontSize: 15, lineHeight: 1 }}>⊞</span>{safePct}%
        </button>
      )}
      {open && (
        <React.Fragment>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 41 }} />
          <aside role="dialog" aria-modal="true" aria-label="Indicadores"
                 style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 320, zIndex: 42,
                          background: "var(--surface)", borderLeft: "2px solid var(--accent)",
                          boxShadow: "-8px 0 24px rgba(0,0,0,.3)", display: "flex", flexDirection: "column",
                          padding: "16px 18px", gap: 12, animation: "kpi-slide-in .2s ease-out",
                          overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="edp-eyebrow">Indicadores</span>
              <button ref={closeRef} onClick={() => setOpen(false)} title="Fechar" aria-label="Fechar indicadores"
                      style={{ all: "unset", cursor: "pointer", fontSize: 18, lineHeight: 1, color: "var(--text-mute)", padding: "2px 6px" }}>×</button>
            </div>
            <div style={{ background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: "12px 14px" }}>
              <div className="edp-eyebrow">Conformidade</div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 30, lineHeight: 1.2, color: "var(--accent)" }}>{safePct}%</div>
              <div style={{ height: 6, borderRadius: 999, background: "var(--surface-3)", overflow: "hidden", margin: "8px 0 6px" }}>
                <div style={{ width: safePct + "%", height: "100%", background: "var(--accent)", borderRadius: 999 }} />
              </div>
              <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>{cOk}/{cTotal} prontas para o SAP</span>
            </div>
            {rows.map(([lbl, val, c]) => (
              <div key={lbl} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                                      background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: "10px 14px" }}>
                <span className="edp-eyebrow">{lbl}</span>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, lineHeight: 1, color: "var(--" + c + ")" }}>{val}</span>
              </div>
            ))}
          </aside>
        </React.Fragment>
      )}
    </React.Fragment>
  );
}
