import React from 'react';
import type { Note, TweakState, UrgBand, RuleKey, Source, AppSection, Theme, Accent } from './types';
import { EDPApi, ruleMeta } from './api';
import { EDP_DEMO } from './data';
import { Logo, PriorityChip, StatusTag, Field, ctrlStyle } from './components/shared';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle, TweakColor } from './components/tweaks-panel';
import { UploadScreen } from './components/upload-screen';
import { DuplicateCompare } from './components/duplicate-compare';
import { CoffeeSection } from './components/coffee-section';
import { useTriageData } from './hooks/useTriageData';

type CssVars = React.CSSProperties & Record<`--${string}`, string>;

const TWEAK_DEFAULTS: TweakState = {
  theme: "dark",
  density: "cozy",
  accent: ["#00a859", "#1dbd6e", "rgba(0,168,89,0.13)"],
  showKpis: true,
  coffeeLayout: "composer",
};

const URG: Record<UrgBand, string> = { high: "Alta (1–2)", med: "Média (3–4)", low: "Baixa (5+)" };
function urgBand(p: number): UrgBand { return p <= 2 ? "high" : p <= 4 ? "med" : "low"; }

interface DashboardProps {
  t: TweakState;
  notes: Note[];
  completed: Set<string>;
  dupResolved: Set<string>;
  onToggleComplete: (id: string) => void;
  onMarkMany: (ids: string[], action: "done" | "reopen") => void;
  onMarkDuplicate: (id: string) => void;
  onSendToCoffee: (ids: string[], sourceId?: string) => void;
}

function Dashboard(props: DashboardProps): React.JSX.Element {
  const { t, notes, completed, dupResolved, onToggleComplete, onMarkMany, onMarkDuplicate, onSendToCoffee } = props;
  const [q, setQ] = React.useState("");
  const [uf, setUf] = React.useState("all");
  const [setor, setSetor] = React.useState("all");
  const [urg, setUrg] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [situacao, setSituacao] = React.useState("all");
  const [rules, setRules] = React.useState<Set<RuleKey>>(() => new Set());
  const [selBatch, setSelBatch] = React.useState<Set<string>>(() => new Set());
  const [selId, setSelId] = React.useState<string | null>(notes[0] ? notes[0].id : null);
  const [queueCollapsed, setQueueCollapsed] = React.useState<boolean>(() => localStorage.getItem("edp_queue_collapsed") === "1");
  function toggleQueue(): void {
    setQueueCollapsed((c) => { const v = !c; localStorage.setItem("edp_queue_collapsed", v ? "1" : "0"); return v; });
  }

  const ufOpts = [...new Set(notes.map((n) => n.uf).filter(Boolean))].sort();
  const setorOpts = [...new Set(notes.map((n) => n.setor).filter(Boolean))].sort();
  const ruleStats: Record<RuleKey, number> = {};
  notes.forEach((n) => n.errors.forEach((e) => { ruleStats[e.rule] = (ruleStats[e.rule] ?? 0) + 1; }));

  const terms = q.toLowerCase().split(/[\s,;]+/).filter(Boolean);
  function matches(n: Note): boolean {
    if (terms.length) {
      const hay = `${n.id} ${n.referencia} ${n.tipo_nota} ${n.setor}`.toLowerCase();
      if (!terms.some((tm) => hay.includes(tm))) return false;
    }
    if (uf !== "all" && n.uf !== uf) return false;
    if (setor !== "all" && n.setor !== setor) return false;
    if (urg !== "all" && urgBand(n.prioridade) !== urg) return false;
    if (status !== "all" && n.status !== status) return false;
    const done = completed.has(n.id);
    if (situacao === "pending" && done) return false;
    if (situacao === "done" && !done) return false;
    if (rules.size && !n.errors.some((e) => rules.has(e.rule))) return false;
    return true;
  }
  const filtered = notes.filter(matches).sort((a, b) =>
    (Number(b.errors.length > 0) - Number(a.errors.length > 0)) || a.prioridade - b.prioridade);

  React.useEffect(() => {
    if (filtered.length && !filtered.some((n) => n.id === selId)) setSelId(filtered[0]?.id ?? null);
  }, [q, uf, setor, urg, status, situacao, rules]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel: Note | undefined = notes.find((n) => n.id === selId) ?? filtered[0];

  const cTotal = notes.length;
  const cErr = notes.filter((n) => n.errors.length).length;
  const cOk = notes.filter((n) => !n.errors.length).length;
  const cDone = notes.filter((n) => completed.has(n.id)).length;
  const cDup = notes.filter((n) => n.duplicates.length).length;
  const pct = Math.round(cOk / cTotal * 100);

  const chips: Array<{ k: string; clear: () => void }> = [];
  if (q) terms.forEach((tm) => chips.push({ k: "Busca: " + tm, clear: () => setQ(terms.filter((x) => x !== tm).join(" ")) }));
  if (uf !== "all") chips.push({ k: "UF: " + uf, clear: () => setUf("all") });
  if (setor !== "all") chips.push({ k: "Setor: " + setor, clear: () => setSetor("all") });
  if (urg !== "all") chips.push({ k: "Urgência: " + URG[urg as UrgBand], clear: () => setUrg("all") });
  if (status !== "all") chips.push({ k: "Status: " + (status === "ok" ? "Conforme" : "Com erro"), clear: () => setStatus("all") });
  if (situacao !== "all") chips.push({ k: "Situação: " + (situacao === "done" ? "Concluídas" : "Pendentes"), clear: () => setSituacao("all") });
  rules.forEach((r) => chips.push({ k: "Bloqueio: " + ruleMeta(r).short, clear: () => { const s = new Set(rules); s.delete(r); setRules(s); } }));
  function clearAll(): void { setQ(""); setUf("all"); setSetor("all"); setUrg("all"); setStatus("all"); setSituacao("all"); setRules(new Set()); }

  function toggleRule(r: RuleKey): void { const s = new Set(rules); if (s.has(r)) s.delete(r); else s.add(r); setRules(s); }
  function toggleBatch(id: string): void { const s = new Set(selBatch); if (s.has(id)) s.delete(id); else s.add(id); setSelBatch(s); }

  return (
    <React.Fragment>
      <style>{`
        .triage .q{display:flex;align-items:center;gap:11px;padding:var(--row-py) 15px;cursor:pointer;
          border-bottom:1px solid var(--line);border-left:3px solid transparent;transition:background .1s}
        .triage .q:hover{background:var(--surface-2)}
        .triage .q.on{background:var(--surface-2);border-left-color:var(--accent)}
        .triage .q.dimdone{opacity:.55}
        .triage .kv{display:flex;flex-direction:column;gap:3px;background:var(--surface);padding:11px 14px}
        .triage .kv small{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-mute)}
        .triage .kv div{font-size:13px;color:var(--text)}
        .triage .rchip{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:500;
          padding:6px 11px;border-radius:999px;cursor:pointer;white-space:nowrap;border:1px solid var(--line-2);
          background:var(--surface);color:var(--text-dim);transition:all .12s}
        .triage .rchip:hover{border-color:var(--text-mute);color:var(--text)}
        .triage .rchip.on{background:var(--accent-tint);border-color:var(--accent);color:var(--accent)}
        .triage .rchip .c{font-family:var(--font-mono);font-size:11px;font-weight:600;opacity:.85}
        .triage .fchip{display:inline-flex;align-items:center;gap:7px;font-family:var(--font-mono);font-size:11.5px;
          padding:4px 6px 4px 10px;border-radius:999px;background:var(--surface-2);border:1px solid var(--line-2);
          color:var(--text);cursor:pointer}
        .triage .fchip:hover{border-color:var(--red);color:var(--red)}
        .triage select:focus,.triage input:focus{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-tint)}
        .triage .accent-btn{background:var(--accent);border-color:var(--accent);color:#fff}
        .triage .accent-btn:hover{background:var(--accent-2)}
      `}</style>

      {t.showKpis && (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
                      padding: "9px 22px", background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="edp-eyebrow">Conformidade</span>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 17, lineHeight: 1, color: "var(--accent)" }}>{pct}%</span>
            <div style={{ width: 96, height: 6, borderRadius: 999, background: "var(--surface-3)", overflow: "hidden" }}>
              <div style={{ width: pct + "%", height: "100%", background: "var(--accent)", borderRadius: 999 }} />
            </div>
            <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-dim)", whiteSpace: "nowrap" }}>{cOk}/{cTotal} prontas</span>
          </div>
          <div style={{ width: 1, height: 24, background: "var(--line-2)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
            {([["Com erro", cErr, "red"], ["Duplicatas", cDup, "indigo"], ["Visíveis", filtered.length, "blue"], ["Concluídas", cDone, "green"]] as Array<[string, number, string]>).map(([lbl, val, c]) => (
              <div key={lbl} style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, lineHeight: 1, color: "var(--" + c + ")" }}>{val}</span>
                <span className="edp-eyebrow">{lbl}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ flexShrink: 0, background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", padding: "12px 22px", flexWrap: "wrap" }}>
          <Field label="Buscar · ID, referência, tipo, setor" grow>
            <input style={ctrlStyle} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: 104728801, VIX-04, poda…" />
          </Field>
          <Field label="Estado (UF)" accent>
            <select style={ctrlStyle} value={uf} onChange={(e) => setUf(e.target.value)}>
              <option value="all">Todos</option>{ufOpts.map((o) => <option key={o} value={o}>{o}</option>)}</select>
          </Field>
          <Field label="Setor" accent>
            <select style={ctrlStyle} value={setor} onChange={(e) => setSetor(e.target.value)}>
              <option value="all">Todos</option>{setorOpts.map((o) => <option key={o} value={o}>{o}</option>)}</select>
          </Field>
          <Field label="Urgência">
            <select style={ctrlStyle} value={urg} onChange={(e) => setUrg(e.target.value)}>
              <option value="all">Todas</option>{Object.entries(URG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </Field>
          <Field label="Status">
            <select style={ctrlStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Todos</option><option value="erro">Com erro</option><option value="ok">Conforme</option></select>
          </Field>
          <Field label="Situação">
            <select style={ctrlStyle} value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              <option value="all">Todas</option><option value="pending">Pendentes</option><option value="done">Concluídas</option></select>
          </Field>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 22px 13px", flexWrap: "wrap" }}>
          <span className="edp-eyebrow" style={{ marginRight: 2 }}>Bloqueio</span>
          {Object.entries(ruleStats).sort((a, b) => b[1] - a[1]).map(([r, n]) => (
            <button key={r} className={"rchip" + (rules.has(r) ? " on" : "")} onClick={() => toggleRule(r)}>
              {ruleMeta(r).label}<span className="c">{n}</span></button>
          ))}
        </div>

        {chips.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 22px 13px", flexWrap: "wrap" }}>
            <span className="edp-eyebrow" style={{ marginRight: 2 }}>Ativos</span>
            {chips.map((c, i) => (
              <button key={i} className="fchip" onClick={c.clear}>{c.k}<span style={{ fontSize: 14, lineHeight: 1 }}>×</span></button>
            ))}
            <button className="fchip" style={{ color: "var(--red)", borderColor: "rgba(240,85,92,.3)", background: "var(--tint-red)" }}
                    onClick={clearAll}>Limpar tudo</button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, display: "grid",
                    gridTemplateColumns: queueCollapsed ? "46px 1fr" : "minmax(430px,1fr) 1.2fr",
                    overflow: "hidden" }}>
        <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid var(--line)", overflow: "hidden", background: "var(--surface)" }}>
          {queueCollapsed && (
            <button onClick={toggleQueue} title="Expandir fila" aria-label="Expandir fila"
                    style={{ all: "unset", boxSizing: "border-box", cursor: "pointer", height: "100%", width: "100%",
                             display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "12px 0" }}>
              <span style={{ fontSize: 15, color: "var(--text-dim)" }}>»</span>
              <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontFamily: "var(--font-mono)",
                             fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--text-mute)",
                             whiteSpace: "nowrap" }}>
                Fila · {filtered.length} {filtered.length === 1 ? "nota" : "notas"}</span>
            </button>
          )}
          {!queueCollapsed && (<React.Fragment>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 15px",
                        borderBottom: "1px solid var(--line)", background: "var(--bg-2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <button className="edp-btn ghost sm" title="Recolher fila" aria-label="Recolher fila"
                      style={{ padding: "2px 8px", fontSize: 13, lineHeight: 1 }} onClick={toggleQueue}>«</button>
              <span className="edp-eyebrow">Fila · {filtered.length} {filtered.length === 1 ? "nota" : "notas"}</span>
            </div>
            {filtered.length > 0 && (
              <button className="edp-btn ghost sm" style={{ fontSize: 11 }}
                      onClick={() => setSelBatch(new Set(filtered.map((n) => n.id)))}>Selecionar todas</button>
            )}
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "48px 20px", textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
                Nenhuma nota com os filtros atuais.<br />
                <button className="edp-btn sm" style={{ marginTop: 14 }} onClick={clearAll}>Limpar filtros</button>
              </div>
            ) : filtered.map((n) => {
              const done = completed.has(n.id);
              const isDup = dupResolved.has(n.id);
              const isSel = selBatch.has(n.id);
              const flagDup = n.duplicates.length > 0 && !isDup;
              return (
                <div key={n.id} className={"q" + (n.id === selId ? " on" : "") + (done ? " dimdone" : "")}
                     onClick={() => setSelId(n.id)}>
                  <input type="checkbox" checked={isSel} onClick={(e) => e.stopPropagation()}
                         onChange={() => toggleBatch(n.id)}
                         style={{ width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer", flexShrink: 0 }} />
                  <PriorityChip p={n.prioridade} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="edp-mono" style={{ fontSize: 13, fontWeight: 600 }}>{n.id}</span>
                      {flagDup && <span title="Possível duplicata" style={{ color: "var(--indigo)", fontSize: 13 }}>⧉</span>}
                      <span style={{ fontSize: 11, color: "var(--text-mute)" }}>· {n.uf}/{n.setor}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.tipo_nota}</div>
                  </div>
                  {flagDup && !isDup && (
                    <button title="Enviar candidatas para a fila COFFEE"
                            style={{ all: "unset", cursor: "pointer", fontSize: 13, color: "var(--amber)", flexShrink: 0, lineHeight: 1, padding: "2px 4px" }}
                            onClick={(e) => { e.stopPropagation(); onSendToCoffee(n.duplicates.map((d) => d.id), n.id); }}>→ ☕</button>
                  )}
                  {isDup ? <span className="edp-tag dup"><span className="edp-dot" />Dup.</span>
                    : done ? <span className="edp-tag done"><span className="edp-dot" />OK</span>
                    : n.errors.length ? <span className="edp-mono" style={{ fontSize: 11, color: "var(--red)", fontWeight: 600, flexShrink: 0 }}>
                        {n.errors.length} {n.errors.length > 1 ? "falhas" : "falha"}</span>
                    : <span className="edp-tag ok"><span className="edp-dot" />OK</span>}
                </div>
              );
            })}
          </div>

          {selBatch.size > 0 && (() => {
            const ids = [...selBatch];
            const allDone = ids.every((id) => completed.has(id));
            const allOpen = ids.every((id) => !completed.has(id));
            const doAction = (action: "done" | "reopen"): void => { onMarkMany(ids, action); setSelBatch(new Set()); };
            return (
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "10px 15px",
                            background: "var(--bg-2)", borderTop: "1px solid var(--line-2)", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "var(--text-dim)", marginRight: 2 }}>
                  <strong style={{ color: "var(--accent)", fontFamily: "var(--font-display)", fontSize: 15 }}>{selBatch.size}</strong> selec.</span>
                {!allDone && (
                  <button className="edp-btn accent-btn sm" onClick={() => doAction("done")}>
                    ✓ {allOpen ? "Concluir" : "Concluir pendentes"}
                  </button>
                )}
                {!allOpen && (
                  <button className="edp-btn ghost sm" onClick={() => doAction("reopen")}>
                    ↺ {allDone ? "Reabrir" : "Reabrir concluídas"}
                  </button>
                )}
                <button className="edp-btn coffee sm" onClick={() => EDPApi.openCoffee(ids)}>☕ COFFEE</button>
                <button className="edp-btn ghost sm" onClick={() => setSelBatch(new Set())}>Limpar</button>
              </div>
            );
          })()}
          </React.Fragment>)}
        </div>

        <Detail sel={sel} done={!!sel && completed.has(sel.id)} dup={!!sel && dupResolved.has(sel.id)}
                onToggleDone={onToggleComplete} onMarkDuplicate={onMarkDuplicate} onSendToCoffee={onSendToCoffee} />
      </div>
    </React.Fragment>
  );
}

interface DetailProps {
  sel: Note | undefined;
  done: boolean;
  dup: boolean;
  onToggleDone: (id: string) => void;
  onMarkDuplicate: (id: string) => void;
  onSendToCoffee: (ids: string[], sourceId?: string) => void;
}

function Detail({ sel, done, dup, onToggleDone, onMarkDuplicate, onSendToCoffee }: DetailProps): React.JSX.Element {
  if (!sel) return <div style={{ background: "var(--bg-2)" }} />;
  const v = (x: string | number | null | undefined, fb = "—"): string => {
    const s = x == null ? "" : String(x);
    return s === "" || s === "-" ? fb : s;
  };
  const fields: Array<[string, string]> = [
    ["Tipo de nota", v(sel.tipo_nota)], ["Referência", v(sel.referencia)], ["Problema", v(sel.problema || sel.descricao)],
    ["Colaborador", v(sel.colaborador)], ["Estado", v(sel.uf)], ["Setor", v(sel.setor)],
    ["Local instal.", v(sel.local_instalacao)], ["Poste", v(sel.poste)], ["ID SAP", v(sel.id_sap)],
    ["Imagens", v(sel.imagens_recebidas) + " / " + v(sel.imagens_totais)],
    ["Latitude", v(sel.latitude)], ["Longitude", v(sel.longitude)],
  ];
  const otherErrors = sel.errors.filter((e) => e.rule !== "chk_duplicata");
  const hasDup = sel.duplicates.length > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-2)" }}>
      <div style={{ padding: "15px 24px", borderBottom: "1px solid var(--line)", background: "var(--surface)",
                    display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexShrink: 0 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 21, margin: 0, whiteSpace: "nowrap" }}>Nota {sel.id}</h2>
            <PriorityChip p={sel.prioridade} />
            <StatusTag status={sel.status} done={done} dup={dup} />
          </div>
          <div className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)", marginTop: 5 }}>
            {sel.tipo_nota} · {sel.referencia} · {sel.uf}/{sel.setor}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button className="edp-btn coffee sm" onClick={() => EDPApi.openCoffee(sel.id)}>☕ COFFEE</button>
          <button className={"edp-btn sm" + (done ? "" : " accent-btn")} onClick={() => onToggleDone(sel.id)}>
            {done ? "↺ Reabrir" : "✓ Concluir"}</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 22 }}>
        {hasDup && <DuplicateCompare note={sel} resolved={dup} onMarkDuplicate={onMarkDuplicate} onSendToCoffee={onSendToCoffee} />}

        <section>
          <div className="edp-eyebrow" style={{ marginBottom: 11 }}>
            {otherErrors.length ? `⚠ Falhas encontradas (${otherErrors.length})`
              : hasDup ? "Outras falhas" : "Status"}</div>
          {otherErrors.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {otherErrors.map((e) => (
                <div key={e.rule} style={{ background: "var(--tint-red)", border: "1px solid rgba(240,85,92,0.25)",
                     borderLeft: "3px solid var(--red)", borderRadius: "var(--r-sm)", padding: "11px 14px" }}>
                  <div className="edp-mono" style={{ fontSize: 10.5, color: "var(--red)", letterSpacing: ".08em" }}>{e.rule}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{e.rule_name}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 2 }}>Valor: {e.value}</div>
                </div>
              ))}
            </div>
          ) : !hasDup ? <span className="edp-tag ok"><span className="edp-dot" />Conforme — nenhuma falha, pronta para o SAP</span>
            : <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Sem outras falhas além da duplicata.</div>}
        </section>
        <section>
          <div className="edp-eyebrow" style={{ marginBottom: 11 }}>Identificação & localização</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, background: "var(--line)",
                        borderRadius: "var(--r-sm)", overflow: "hidden", border: "1px solid var(--line)" }}>
            {fields.map(([k, val]) => (
              <div key={k} className="kv"><small>{k}</small><div className="edp-mono" style={{ fontSize: 12.5 }}>{val}</div></div>
            ))}
          </div>
          {sel.latitude && sel.longitude && (
            <a className="edp-btn sm" target="_blank" rel="noopener" href={EDPApi.mapsUrl(sel.latitude, sel.longitude)}
               style={{ marginTop: 12, color: "var(--blue)", borderColor: "rgba(31,159,214,0.4)" }}>◎ Abrir no Google Maps</a>
          )}
        </section>
      </div>
    </div>
  );
}

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

interface SidebarProps { section: AppSection; setSection: (s: AppSection) => void; }
function Sidebar({ section, setSection }: SidebarProps): React.JSX.Element {
  return (
    <nav className="edp-nav" style={{ width: 56, flexShrink: 0, background: "var(--surface)", borderRight: "1px solid var(--line)",
         display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 0 14px", gap: 6, zIndex: 2 }}>
      <style>{`.edp-nav button:not(:disabled):hover{background:var(--surface-2)!important;color:var(--text)!important}`}</style>
      <div style={{ marginBottom: 10 }}><BrandGlyph /></div>
      <NavBtn active={section === "triagem"} label="Triagem" onClick={() => setSection("triagem")}><IconTriage /></NavBtn>
      <NavBtn active={section === "coffee"} label="COFFEE" onClick={() => setSection("coffee")}><IconCoffee /></NavBtn>
      <div style={{ flex: 1 }} />
      <NavBtn soon label="Relatórios"><IconReport /></NavBtn>
      <NavBtn soon label="De olho no BI"><IconBI /></NavBtn>
      <NavBtn soon label="Configurações"><IconGear /></NavBtn>
    </nav>
  );
}

interface TopBarProps { t: TweakState; setTweak: (key: keyof TweakState, value: TweakState[keyof TweakState]) => void; file: string; source: Source; onReset: () => void; }
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
    if (action === "done") {
      const targets = ids.filter((i) => !completed.has(i));
      setCompleted((prev) => { const s = new Set(prev); targets.forEach((i) => s.add(i)); persistDone(s); return s; });
      if (source === "api") targets.forEach((id) => EDPApi.toggleComplete(id).catch(() => {}));
    } else {
      const targets = ids.filter((i) => completed.has(i));
      setCompleted((prev) => { const s = new Set(prev); targets.forEach((i) => s.delete(i)); persistDone(s); return s; });
      if (source === "api") targets.forEach((id) => EDPApi.toggleComplete(id).catch(() => {}));
    }
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
      {screen === "upload" ? (
        <UploadScreen theme={t.theme} onDemo={loadDemo} onUpload={handleUpload} />
      ) : (
        <React.Fragment>
          <Sidebar section={section} setSection={changeSection} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <TopBar t={t} setTweak={(k, v) => setTweak(k, v)} file={file} source={source} onReset={() => { setCoffeeReturn(null); setScreen("upload"); }} />
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
          </div>
        </React.Fragment>
      )}

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
