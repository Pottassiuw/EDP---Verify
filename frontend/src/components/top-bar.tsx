import React from 'react';
import type { TweakState, Source, SetTweak, Theme } from '../types';
import { Logo } from './shared';

interface TopBarProps { t: TweakState; setTweak: SetTweak<TweakState>; file: string; source: Source; onReset: () => void; }

export function TopBar({ t, setTweak, file, source, onReset }: TopBarProps): React.JSX.Element {
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
