import React from 'react';
import { useCoffeeLogs } from './use-coffee-logs';
import { LogTable, PASSOS } from './coffee-log-table';

interface LogDrawerProps {
  notaPk: number;
  open: boolean;
  onClose: () => void;
}

export function LogDrawer({ notaPk, open, onClose }: LogDrawerProps): React.JSX.Element | null {
  const [passo, setPasso] = React.useState("");
  const { logs, loading, refresh } = useCoffeeLogs({
    nota_pk: notaPk,
    limit: 50,
  });

  React.useEffect(() => {
    if (open) refresh();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* overlay */}
      <div onClick={onClose}
           style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 200 }} />

      {/* panel */}
      <div style={{ position: "fixed", top: 0, right: 0, width: 360, height: "100vh",
                    background: "var(--surface)", borderLeft: "1px solid var(--line)",
                    zIndex: 201, display: "flex", flexDirection: "column",
                    animation: "clog-slide-in 150ms ease" }}>
        <style>{`@keyframes clog-slide-in{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

        {/* header */}
        <div style={{ height: 48, flexShrink: 0, display: "flex", alignItems: "center",
                      padding: "0 16px", borderBottom: "1px solid var(--line)", gap: 8 }}>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>
            Logs — Nota <span className="edp-mono">#{notaPk}</span>
          </span>
          <button aria-label="Fechar" onClick={onClose}
                  style={{ width: 28, height: 28, border: 0, borderRadius: 6, cursor: "pointer",
                           background: "var(--surface-2)", color: "var(--text-mute)", fontSize: 14 }}>
            ✕
          </button>
        </div>

        {/* filtro de passo */}
        <div style={{ flexShrink: 0, padding: "10px 16px 6px", display: "flex", gap: 0 }}>
          <div className="edp-seg" style={{ fontSize: 11 }}>
            {PASSOS.map((p) => (
              <button key={p.value} className={passo === p.value ? "on" : ""}
                      onClick={() => setPasso(p.value)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* table */}
        <LogTable logs={logs} loading={loading} compact passo={passo} />
      </div>
    </>
  );
}
