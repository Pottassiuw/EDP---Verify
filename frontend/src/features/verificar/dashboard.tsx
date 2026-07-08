import React from 'react';
import type { Note, UrgBand, RuleKey } from '../../types';
import { EDPApi, ruleMeta } from '../../api';
import { PriorityChip, StatusTag, Field } from './shared';
import { DuplicateCompare } from './duplicate-compare';
import { KpiDrawer } from './kpi-drawer';
import { usePersistedState } from '../../hooks/use-persisted-state';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Maximize2, Minimize2, RotateCcw, Check, Coffee, MapPin } from 'lucide-react';

const URG: Record<UrgBand, string> = { high: "Alta (1–2)", med: "Média (3–4)", low: "Baixa (5+)" };
function urgBand(p: number): UrgBand { return p <= 2 ? "high" : p <= 4 ? "med" : "low"; }


export interface DashboardProps {
  showKpis: boolean;
  notes: Note[];
  completed: Set<string>;
  dupResolved: Set<string>;
  onToggleComplete: (id: string) => void;
  onMarkMany: (ids: string[], action: "done" | "reopen") => void;
  onMarkDuplicate: (id: string) => void;
  onSendToCoffee: (ids: string[], sourceId?: string) => void;
}

export function Dashboard(props: DashboardProps): React.JSX.Element {
  const { showKpis, notes, completed, dupResolved, onToggleComplete, onMarkMany, onMarkDuplicate, onSendToCoffee } = props;
  const [q, setQ] = usePersistedState("edp_verify_q", "");
  const [uf, setUf] = usePersistedState("edp_verify_uf", "all");
  const [setor, setSetor] = usePersistedState("edp_verify_setor", "all");
  const [urg, setUrg] = usePersistedState("edp_verify_urg", "all");
  const [status, setStatus] = usePersistedState("edp_verify_status", "all");
  const [situacao, setSituacao] = usePersistedState("edp_verify_situacao", "all");
  const [rulesArr, setRulesArr] = usePersistedState<RuleKey[]>("edp_verify_rules", []);
  const rules = React.useMemo(() => new Set(rulesArr), [rulesArr]);
  const setRules = React.useCallback((s: Set<RuleKey>) => setRulesArr([...s]), [setRulesArr]);
  const [selBatch, setSelBatch] = React.useState<Set<string>>(() => new Set());
  const [selId, setSelId] = usePersistedState<string | null>("edp_verify_sel", notes[0] ? notes[0].id : null);
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

  // IDs da search bar não viram chips: com muitos IDs a barra "Ativos" estourava
  // (1 chip por nota, sem scroll). Gerenciamento de IDs é feito direto na search bar.
  const chips: Array<{ k: string; clear: () => void }> = [];
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
      `}</style>

      <div className="shrink-0 bg-surface border-b-[1px] border-b-line">
        <div className="flex gap-[12px] items-end py-[12px] px-[22px] flex-wrap">
          <Field label="Buscar · ID, referência, tipo, setor" grow>
            <div className="relative w-full">
              <input className="edp-field w-full" style={{ paddingRight: q ? 30 : 11 }} value={q}
                     onChange={(e) => setQ(e.target.value)} placeholder="Ex.: 104728801, VIX-04, poda…" />
              {q && (
                <button type="button" aria-label="Limpar busca" onClick={() => setQ("")}
                        className="text-text-mute text-[16px] py-[2px] px-[4px] absolute right-[6px] top-[50%] [transform:translateY(-50%)]
                                 border-0 bg-transparent cursor-pointer
                                 leading-none">×</button>
              )}
            </div>
          </Field>
          <Field label="Estado (UF)" accent>
            <select className="edp-field" value={uf} onChange={(e) => setUf(e.target.value)}>
              <option value="all">Todos</option>{ufOpts.map((o) => <option key={o} value={o}>{o}</option>)}</select>
          </Field>
          <Field label="Setor" accent>
            <select className="edp-field" value={setor} onChange={(e) => setSetor(e.target.value)}>
              <option value="all">Todos</option>{setorOpts.map((o) => <option key={o} value={o}>{o}</option>)}</select>
          </Field>
          <Field label="Urgência">
            <select className="edp-field" value={urg} onChange={(e) => setUrg(e.target.value)}>
              <option value="all">Todas</option>{Object.entries(URG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </Field>
          <Field label="Status">
            <select className="edp-field" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Todos</option><option value="erro">Com erro</option><option value="ok">Conforme</option></select>
          </Field>
          <Field label="Situação">
            <select className="edp-field" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              <option value="all">Todas</option><option value="pending">Pendentes</option><option value="done">Concluídas</option></select>
          </Field>
        </div>

        <div className="flex items-center gap-[9px] flex-wrap pt-0 px-[22px] pb-[13px]">
          <span className="edp-eyebrow mr-[2px]">Bloqueio</span>
          {Object.entries(ruleStats).sort((a, b) => b[1] - a[1]).map(([r, n]) => (
            <button key={r} className={"rchip" + (rules.has(r) ? " on" : "")} onClick={() => toggleRule(r)}>
              {ruleMeta(r).label}<span className="c">{n}</span></button>
          ))}
        </div>

        {chips.length > 0 && (
          <div className="flex items-center gap-[8px] flex-wrap pt-0 px-[22px] pb-[13px]">
            <span className="edp-eyebrow mr-[2px]">Ativos</span>
            {chips.map((c, i) => (
              <button key={i} className="fchip" onClick={c.clear}>{c.k}<span className="text-[14px] leading-none">×</span></button>
            ))}
            <button className="fchip text-red bg-tint-red" style={{ borderColor: "rgba(240,85,92,.3)" }}
                    onClick={clearAll}>Limpar tudo</button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden grid" style={{
                    gridTemplateColumns: queueCollapsed ? "46px 1fr" : "minmax(430px,1fr) 1.2fr" }}>
        <div className="flex flex-col overflow-hidden bg-surface border-r-[1px] border-r-line">
          {queueCollapsed && (
            <button onClick={toggleQueue} title="Expandir fila" aria-label="Expandir fila"
                    className="flex flex-col items-center gap-[16px] py-[12px] px-[0px] [all:unset] box-border cursor-pointer h-full w-full">
              <span className="text-[15px] text-text-dim">»</span>
              <span className="font-mono text-[10.5px] text-text-mute whitespace-nowrap
                    [writing-mode:vertical-rl] [transform:rotate(180deg)] tracking-[.16em] uppercase">
                Fila · {filtered.length} {filtered.length === 1 ? "nota" : "notas"}</span>
            </button>
          )}
          {!queueCollapsed && (<React.Fragment>
          <div className="flex items-center justify-between py-[9px] px-[15px] bg-bg-2 border-b-[1px] border-b-line">
            <div className="flex items-center gap-[9px]">
              <Button variant="ghost" size="icon-sm" title="Recolher fila" aria-label="Recolher fila"
                      onClick={toggleQueue}>«</Button>
              <span className="edp-eyebrow">Fila · {filtered.length} {filtered.length === 1 ? "nota" : "notas"}</span>
            </div>
            {filtered.length > 0 && (
              <Button variant="ghost" size="sm"
                      onClick={() => setSelBatch(new Set(filtered.map((n) => n.id)))}>Selecionar todas</Button>
            )}
          </div>
          <div className="flex-1 overflow-auto">
            {filtered.length === 0 ? (
              <div className="py-[48px] px-[20px] text-text-mute text-[13px] text-center">
                Nenhuma nota com os filtros atuais.<br />
                <Button variant="outline" size="sm" className="mt-[14px]" onClick={clearAll}>Limpar filtros</Button>
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
                         className="shrink-0 w-[16px] h-[16px] [accent-color:var(--accent)] cursor-pointer" />
                  <PriorityChip p={n.prioridade} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-[8px]">
                      <span className="edp-mono text-[13px] font-semibold">{n.id}</span>
                      {flagDup && <span title="Possível duplicata" className="text-indigo text-[13px]">⧉</span>}
                      <span className="text-[11px] text-text-mute">· {n.uf}/{n.setor}</span>
                    </div>
                    <div className="text-[12px] text-text-dim whitespace-nowrap overflow-hidden text-ellipsis">{n.tipo_nota}</div>
                  </div>
                  {flagDup && !isDup && (
                    <button title="Enviar candidatas para a fila COFFEE" aria-label="Enviar candidatas para a fila COFFEE"
                            className="text-amber shrink-0 py-[2px] px-[4px] [all:unset] cursor-pointer leading-none inline-flex"
                            onClick={(e) => { e.stopPropagation(); onSendToCoffee(n.duplicates.map((d) => d.id), n.id); }}>
                      <Coffee size={14} />
                    </button>
                  )}
                  {isDup ? <span className="edp-tag dup"><span className="edp-dot" />Dup.</span>
                    : done ? <span className="edp-tag done"><span className="edp-dot" />OK</span>
                    : n.errors.length ? <span className="edp-mono text-[11px] text-red font-semibold shrink-0">
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
              <div className="shrink-0 flex items-center gap-[10px] py-[10px] px-[15px] bg-bg-2 flex-wrap border-t-[1px] border-t-line-2">
                <span className="text-[13px] text-text-dim mr-[2px]">
                  <strong className="text-[15px] text-[var(--accent)] [font-family:var(--font-display)]">{selBatch.size}</strong> selec.</span>
                {!allDone && (
                  <Button size="sm" onClick={() => doAction("done")}>
                    <Check /> {allOpen ? "Concluir" : "Concluir pendentes"}
                  </Button>
                )}
                {!allOpen && (
                  <Button variant="ghost" size="sm" onClick={() => doAction("reopen")}>
                    ↺ {allDone ? "Reabrir" : "Reabrir concluídas"}
                  </Button>
                )}
                <Button size="sm" onClick={() => { toast("Abrindo no COFFEE…"); EDPApi.openCoffee(ids); }}>
                  <Coffee /> COFFEE
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelBatch(new Set())}>Limpar</Button>
              </div>
            );
          })()}
          </React.Fragment>)}
        </div>

        <Detail sel={sel} done={!!sel && completed.has(sel.id)} dup={!!sel && dupResolved.has(sel.id)}
                onToggleDone={onToggleComplete} onMarkDuplicate={onMarkDuplicate} onSendToCoffee={onSendToCoffee} />
      </div>

      {showKpis && (
        <KpiDrawer pct={pct} cTotal={cTotal} cOk={cOk} cErr={cErr} cDup={cDup}
                   cDone={cDone} cVisible={filtered.length}
                   selectedNotes={notes.filter((n) => selBatch.has(n.id))}
                   onRemoveSelected={(id) => toggleBatch(id)} />
      )}
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
  const [fs, setFs] = React.useState(false);
  React.useEffect(() => {
    if (!fs) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") setFs(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fs]);
  if (!sel) return <div className="bg-bg-2" />;
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
    <div className={"flex flex-col overflow-hidden bg-bg-2" + (fs ? " fixed inset-0 z-[60]" : "")}>
      <div className="py-[15px] px-[24px] bg-surface flex items-start justify-between gap-[16px] shrink-0 border-b-[1px] border-b-line">
        <div>
          <div className="flex items-center gap-[10px]">
            <h2 className="edp-title text-[21px] whitespace-nowrap m-0">Nota {sel.id}</h2>
            <PriorityChip p={sel.prioridade} />
            <StatusTag status={sel.status} done={done} dup={dup} />
          </div>
          <div className="edp-mono text-[12px] text-text-mute mt-[5px]">
            {sel.tipo_nota} · {sel.referencia} · {sel.uf}/{sel.setor}</div>
        </div>
        <div className="flex gap-[8px] shrink-0">
          <Button size="sm" onClick={() => { toast("Abrindo no COFFEE…"); EDPApi.openCoffee(sel.id); }}>
            <Coffee /> COFFEE
          </Button>
          <Button variant="outline" size="icon-sm" title={fs ? "Sair da tela cheia" : "Expandir"}
                  aria-label={fs ? "Sair da tela cheia" : "Expandir"} onClick={() => setFs((v) => !v)}>
            {fs ? <Minimize2 /> : <Maximize2 />}
          </Button>
          <Button variant={done ? "outline" : "default"} size="sm" onClick={() => onToggleDone(sel.id)}>
            {done ? <><RotateCcw /> Reabrir</> : <><Check /> Concluir</>}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto flex flex-col gap-[22px] p-[24px]">
        {hasDup && <DuplicateCompare note={sel} resolved={dup} onMarkDuplicate={onMarkDuplicate} onSendToCoffee={onSendToCoffee} />}

        <section>
          <div className="edp-eyebrow mb-[11px]">
            {otherErrors.length ? `⚠ Falhas encontradas (${otherErrors.length})`
              : hasDup ? "Outras falhas" : "Status"}</div>
          {otherErrors.length ? (
            <div className="flex flex-col gap-[8px]">
              {otherErrors.map((e) => (
                <div key={e.rule} className="bg-tint-red rounded-edp-sm py-[11px] px-[14px]" style={{ border: "1px solid rgba(240,85,92,0.25)", borderLeft: "3px solid var(--red)" }}>
                  <div className="edp-mono text-[10.5px] text-red tracking-[.08em]">{e.rule}</div>
                  <div className="text-[14px] font-semibold mt-[2px]">{e.rule_name}</div>
                  <div className="text-[12.5px] text-text-dim mt-[2px]">Valor: {e.value}</div>
                </div>
              ))}
            </div>
          ) : !hasDup ? <span className="edp-tag ok"><span className="edp-dot" />Conforme — nenhuma falha, pronta para o SAP</span>
            : <div className="text-[12.5px] text-text-dim">Sem outras falhas além da duplicata.</div>}
        </section>
        <section>
          <div className="edp-eyebrow mb-[11px]">Identificação & localização</div>
          <div className="gap-[1px] rounded-edp-sm overflow-hidden border border-line grid [grid-template-columns:repeat(3,1fr)] bg-line">
            {fields.map(([k, val]) => (
              <div key={k} className="kv"><small>{k}</small><div className="edp-mono text-[12.5px]">{val}</div></div>
            ))}
          </div>
          {sel.latitude && sel.longitude && (
            <Button asChild variant="outline" size="sm" className="text-blue mt-[12px]" style={{ borderColor: "rgba(31,159,214,0.4)" }}>
              <a target="_blank" rel="noopener" href={EDPApi.mapsUrl(sel.latitude, sel.longitude)}><MapPin /> Abrir no Google Maps</a>
            </Button>
          )}
        </section>
      </div>
    </div>
  );
}
