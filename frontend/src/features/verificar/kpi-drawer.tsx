import React from 'react';
import type { KpiDrawerProps } from '../../types';

export function KpiDrawer(props: KpiDrawerProps): React.JSX.Element {
  const { pct, cTotal, cOk, cErr, cDup, cDone, cVisible, selectedNotes = [], onRemoveSelected } = props;
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
                className="flex items-center gap-[8px] py-[10px] px-[16px] text-[14px]"
                style={{ position: "fixed", right: 18, bottom: 18, zIndex: 40,
                         border: 0, borderRadius: 999, cursor: "pointer",
                         background: "var(--accent)", color: "#fff", fontFamily: "var(--font-display)",
                         fontWeight: 800, boxShadow: "0 4px 14px rgba(0,0,0,.35)" }}>
          <span className="text-[15px]" style={{ lineHeight: 1 }}>⊞</span>{safePct}%
        </button>
      )}
      {open && (
        <React.Fragment>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 41 }} />
          <aside role="dialog" aria-modal="true" aria-label="Indicadores"
                 className="bg-surface flex flex-col py-[16px] px-[18px] gap-[12px]"
                 style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 320, zIndex: 42,
                          borderLeft: "2px solid var(--accent)",
                          boxShadow: "-8px 0 24px rgba(0,0,0,.3)", animation: "kpi-slide-in .2s ease-out",
                          overflowY: "auto" }}>
            <div className="flex items-center justify-between">
              <span className="edp-eyebrow">Indicadores</span>
              <button ref={closeRef} onClick={() => setOpen(false)} title="Fechar" aria-label="Fechar indicadores"
                      className="text-[18px] text-text-mute py-[2px] px-[6px]"
                      style={{ all: "unset", cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <div className="bg-surface-2 rounded-edp-sm py-[12px] px-[14px]">
              <div className="edp-eyebrow">Conformidade</div>
              <div className="text-[30px]" style={{ fontFamily: "var(--font-display)", fontWeight: 800, lineHeight: 1.2, color: "var(--accent)" }}>{safePct}%</div>
              <div className="bg-surface-3 overflow-hidden" style={{ height: 6, borderRadius: 999, margin: "8px 0 6px" }}>
                <div style={{ width: safePct + "%", height: "100%", background: "var(--accent)", borderRadius: 999 }} />
              </div>
              <span className="edp-mono text-[12px] text-text-dim">{cOk}/{cTotal} prontas para o SAP</span>
            </div>
            {rows.map(([lbl, val, c]) => (
              <div key={lbl} className="flex items-center justify-between bg-surface-2 rounded-edp-sm py-[10px] px-[14px]">
                <span className="edp-eyebrow">{lbl}</span>
                <span className="text-[18px]" style={{ fontFamily: "var(--font-display)", fontWeight: 800, lineHeight: 1, color: "var(--" + c + ")" }}>{val}</span>
              </div>
            ))}
            {selectedNotes.length > 0 && (
              <div className="bg-surface-2 rounded-edp-sm py-[10px] px-[14px]">
                <div className="edp-eyebrow" style={{ marginBottom: 8 }}>
                  Notas Selecionadas · {selectedNotes.length}</div>
                <div className="flex flex-col gap-[6px] overflow-auto" style={{ maxHeight: 220 }}>
                  {selectedNotes.map((n) => (
                    <div key={n.id} className="flex items-center gap-[8px]">
                      <span className="edp-mono text-[12px] font-semibold">{n.id}</span>
                      <span className="flex-1 min-w-0 text-[11px] text-text-mute overflow-hidden text-ellipsis whitespace-nowrap">
                        {n.tipo_nota} · {n.uf}/{n.setor}</span>
                      {onRemoveSelected && (
                        <span role="button" aria-label={"Remover " + n.id} onClick={() => onRemoveSelected(n.id)}
                              className="text-text-mute text-[14px] py-[0px] px-[4px]"
                              style={{ cursor: "pointer", lineHeight: 1 }}>×</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </React.Fragment>
      )}
    </React.Fragment>
  );
}
