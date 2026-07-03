import React from 'react';
import type { Note, CoffeeOpenMode } from '../types';
import { EDPApi } from '../api';
import { Button } from '@/components/ui/button';
import { SegTabs } from '@/components/branded/section';

const COFFEE_STYLE = `
  .coffee{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-2)}
  .coffee-hd{flex-shrink:0;padding:18px 26px 0}
  .coffee-h1{font-family:var(--font-display);font-weight:800;font-size:21px;margin:0;letter-spacing:-.01em}
  .coffee-sub{font-size:13px;color:var(--text-dim);margin-top:5px;max-width:560px}
  .coffee-card{background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r-md)}
  .coffee-input{display:flex;gap:8px}
  .coffee-input input{flex:1;min-width:0;background:var(--bg-2);border:1px solid var(--line-2);color:var(--text);
    padding:11px 13px;border-radius:var(--r-sm);font-size:15px;font-family:var(--font-mono);outline:none;letter-spacing:.02em}
  .coffee-input input:focus{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-tint)}
  .coffee-fb{font-size:12px;color:var(--text-mute);min-height:16px;display:flex;gap:6px;align-items:center}
  .coffee-chips{display:flex;flex-wrap:wrap;gap:8px;align-content:flex-start}
  .coffee-chip{display:inline-flex;align-items:center;gap:8px;padding:6px 8px 6px 12px;border-radius:999px;
    background:var(--surface-2);border:1px solid var(--line-2);font-family:var(--font-mono);font-size:13px;color:var(--text)}
  .coffee-chip.opened{background:var(--tint-green);border-color:rgba(0,168,89,.35);color:var(--text-dim)}
  .coffee-chip .tn{font-family:var(--font-body);font-size:11px;color:var(--text-mute);max-width:120px;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .coffee-chip .ck{color:var(--green);font-weight:700}
  .coffee-chip .rm{cursor:pointer;color:var(--text-mute);width:18px;height:18px;display:flex;align-items:center;
    justify-content:center;border-radius:50%;font-size:14px;line-height:1}
  .coffee-chip .rm:hover{background:rgba(240,85,92,.18);color:var(--red)}
  .coffee-empty{color:var(--text-mute);font-size:13px;text-align:center;padding:34px 16px;border:1px dashed var(--line-2);
    border-radius:var(--r-sm)}
  .coffee-count{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
  .coffee-count .n{font-family:var(--font-display);font-weight:800;font-size:17px;line-height:1}
  .coffee-bar{height:6px;border-radius:999px;background:var(--surface-3);overflow:hidden}
  .coffee-bar>div{height:100%;background:var(--green);border-radius:999px;transition:width .2s ease}
  .coffee-links{display:flex;flex-direction:column;gap:1px;background:var(--line);border:1px solid var(--line);
    border-radius:var(--r-sm);overflow:hidden}
  .coffee-link{display:flex;align-items:center;gap:10px;padding:9px 13px;background:var(--surface)}
  .coffee-link.opened{background:var(--bg-2)}
  .coffee-link .id{font-family:var(--font-mono);font-size:13px;font-weight:600}
  .coffee-link .tn{font-size:11.5px;color:var(--text-mute);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .coffee-stepper{display:inline-flex;align-items:center;border:1px solid var(--line-2);border-radius:var(--r-sm);overflow:hidden}
  .coffee-stepper button{width:30px;height:30px;border:0;background:var(--surface-2);color:var(--text);cursor:pointer;font-size:16px}
  .coffee-stepper button:hover{background:var(--surface-3)}
  .coffee-stepper span{min-width:34px;text-align:center;font-family:var(--font-mono);font-size:14px;font-weight:600}
  .coffee button:disabled,.coffee a[aria-disabled="true"]{opacity:.45;cursor:not-allowed}
`;

const COFFEE_ID_RE = /^\d{5,12}$/;
function coffeeTokens(text: string): string[] {
  return text.split(/[^0-9]+/).filter(Boolean);
}
function sortIdsDesc(list: string[]): string[] {
  return [...list].sort((a, b) => Number(b) - Number(a));
}

interface CoffeeAbrirProps {
  notes: Note[];
  layout: "composer" | "split";
  coffeeReturn: { noteId: string; noteRef: string } | null;
  onClearReturn: () => void;
  onBackToTriagem: () => void;
}

export function CoffeeAbrir({ notes, layout, coffeeReturn, onClearReturn, onBackToTriagem }: CoffeeAbrirProps): React.JSX.Element {
  const api = EDPApi;
  const [ids, setIds] = React.useState<string[]>(() => {
    try { return (JSON.parse(localStorage.getItem("edp_coffee_ids") ?? "[]") as string[]).filter((x) => COFFEE_ID_RE.test(x)); }
    catch { return []; }
  });
  const [opened, setOpened] = React.useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("edp_coffee_opened") ?? "[]") as string[]); }
    catch { return new Set(); }
  });
  const [input, setInput] = React.useState("");
  const [feedback, setFeedback] = React.useState<React.ReactNode>(null);
  const [mode, setMode] = React.useState<CoffeeOpenMode>("all");
  const [block, setBlock] = React.useState(10);

  function setBlockClamped(v: number): void {
    setBlock(Math.min(50, Math.max(1, Math.floor(v) || 1)));
  }

  const noteIndex = React.useMemo(() => {
    const m = new Map<string, Note>();
    notes.forEach((n) => m.set(n.id, n));
    return m;
  }, [notes]);

  React.useEffect(() => { localStorage.setItem("edp_coffee_ids", JSON.stringify(ids)); }, [ids]);
  React.useEffect(() => { localStorage.setItem("edp_coffee_opened", JSON.stringify([...opened])); }, [opened]);

  const remaining = ids.filter((id) => !opened.has(id));

  function persistOpened(next: Set<string>): void { setOpened(next); }
  function markOpened(list: string[]): void {
    setOpened((prev) => { const s = new Set(prev); list.forEach((id) => s.add(id)); return s; });
  }

  function addFromText(text: string): void {
    const tokens = [...new Set(coffeeTokens(text))];
    const cur = new Set(ids);
    const valid: string[] = []; let dupes = 0; let invalid = 0;
    tokens.forEach((tk) => {
      if (!COFFEE_ID_RE.test(tk)) invalid++;
      else if (cur.has(tk)) dupes++;
      else { valid.push(tk); cur.add(tk); }
    });
    if (valid.length) setIds((prev) => [...prev, ...valid]);
    const parts: string[] = [];
    if (valid.length) parts.push(`${valid.length} adicionada${valid.length > 1 ? "s" : ""}`);
    if (dupes) parts.push(`${dupes} duplicada${dupes > 1 ? "s" : ""} ignorada${dupes > 1 ? "s" : ""}`);
    if (invalid) parts.push(`${invalid} inválida${invalid > 1 ? "s" : ""} descartada${invalid > 1 ? "s" : ""}`);
    setFeedback(parts.length ? parts.join(" · ") : null);
    setInput("");
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter" || e.key === "," || e.key === " ") { e.preventDefault(); if (input.trim()) addFromText(input); }
  }
  function removeId(id: string): void {
    setIds((prev) => prev.filter((x) => x !== id));
    setOpened((prev) => { if (!prev.has(id)) return prev; const s = new Set(prev); s.delete(id); return s; });
  }
  function clearAll(): void { setIds([]); persistOpened(new Set()); setFeedback(null); }

  function openList(list: string[]): void { if (list.length) { api.openCoffee(list); markOpened(list); } }
  function openOne(id: string): void { api.openCoffee(id); markOpened([id]); }
  void openOne; // used in links mode via anchor onClick

  async function copyIds(): Promise<void> {
    const text = ids.join("\n");
    try { await navigator.clipboard.writeText(text); setFeedback(<span><b>{ids.length}</b> ID(s) copiado(s) para a área de transferência</span>); }
    catch { setFeedback("Não foi possível copiar automaticamente."); }
  }

  const inputBlock = (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <div className="coffee-input">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown}
               inputMode="numeric" placeholder="Digite o ID da nota e tecle Enter…" aria-label="ID da nota" />
        <Button variant="accent" style={{ padding: "0 18px", fontWeight: 700 }}
                onClick={() => { if (input.trim()) addFromText(input); }}>Adicionar</Button>
      </div>
      <div className="coffee-fb">{feedback}</div>
    </div>
  );

  const countBlock = (
    <div className="coffee-count">
      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span className="n" style={{ color: "var(--text)" }}>{ids.length}</span>
        <span className="edp-eyebrow">na lista</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span className="n" style={{ color: "var(--green)" }}>{opened.size}</span>
        <span className="edp-eyebrow">abertas</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
        <span className="n" style={{ color: "var(--accent)" }}>{remaining.length}</span>
        <span className="edp-eyebrow">restantes</span>
      </div>
      <div style={{ flex: 1 }} />
      <Button variant="ghost" size="sm" disabled={!ids.length} onClick={() => void copyIds()}>⧉ Copiar IDs</Button>
      <Button variant="ghost" size="sm" disabled={!ids.length} style={{ color: ids.length ? "var(--red)" : undefined }} onClick={clearAll}>Limpar tudo</Button>
    </div>
  );

  const chipList = ids.length === 0 ? (
    <div className="coffee-empty">Nenhuma nota na lista ainda.<br />Digite um ID acima e tecle Enter para começar.</div>
  ) : (
    <div className="coffee-chips">
      {ids.map((id) => {
        const n = noteIndex.get(id);
        const isOpen = opened.has(id);
        return (
          <span key={id} className={"coffee-chip" + (isOpen ? " opened" : "")} title={n ? n.tipo_nota + " · " + n.referencia : "Fora da planilha carregada"}>
            {isOpen && <span className="ck">✓</span>}
            {id}
            {n && <span className="tn">{n.tipo_nota}</span>}
            <span className="rm" role="button" aria-label={"Remover " + id} onClick={() => removeId(id)}>×</span>
          </span>
        );
      })}
    </div>
  );

  const modeSeg = (
    <SegTabs<CoffeeOpenMode>
      tabs={[{ id: "all", rotulo: "Todas" }, { id: "block", rotulo: "Em blocos" }, { id: "links", rotulo: "Lista de links" }]}
      value={mode} onChange={setMode} ariaLabel="Modo de abertura" />
  );

  const actionBody = (() => {
    if (!ids.length) return <div style={{ fontSize: 13, color: "var(--text-mute)" }}>Adicione notas à lista para habilitar a abertura.</div>;
    if (mode === "all") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0 }}>
            Abre uma aba por nota ainda não aberta, em ordem decrescente de ID. As abas
            abrem em sequência; agrupar abas em janelas exige uma extensão de navegador.</p>
          <Button variant="coffee" style={{ alignSelf: "flex-start", padding: "11px 20px", fontWeight: 700, fontSize: 14 }}
                  disabled={!remaining.length} onClick={() => openList(sortIdsDesc(remaining))}>
            ☕ Abrir {remaining.length} nota{remaining.length === 1 ? "" : "s"} no COFFEE</Button>
          {!remaining.length && <span className="edp-tag done" style={{ alignSelf: "flex-start" }}><span className="edp-dot" />Todas as notas já foram abertas</span>}
        </div>
      );
    }
    if (mode === "block") {
      const ordered = sortIdsDesc(remaining);
      const next = ordered.slice(0, block);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0 }}>
            Abre as próximas notas em pequenos lotes — mais seguro para o navegador quando a lista é grande.</p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span className="edp-eyebrow">Tamanho do bloco</span>
            <div className="coffee-stepper">
              <button aria-label="Diminuir" onClick={() => setBlockClamped(block - 1)}>−</button>
              <input type="number" min={1} max={50} value={block}
                     onChange={(e) => setBlockClamped(Number(e.target.value))}
                     aria-label="Tamanho do bloco"
                     style={{ width: 46, textAlign: "center", border: 0, background: "var(--surface-2)",
                              color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 14,
                              fontWeight: 600, outline: "none", MozAppearance: "textfield" }} />
              <button aria-label="Aumentar" onClick={() => setBlockClamped(block + 1)}>＋</button>
            </div>
            <Button variant="coffee" style={{ fontWeight: 700 }} disabled={!next.length} onClick={() => openList(next)}>
              ☕ Abrir próximas {next.length}</Button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="coffee-bar"><div style={{ width: (ids.length ? (opened.size / ids.length) * 100 : 0) + "%" }} /></div>
            <span className="edp-mono" style={{ fontSize: 11.5, color: "var(--text-mute)" }}>{opened.size} de {ids.length} abertas</span>
          </div>
          <span style={{ fontSize: 11, color: "var(--text-mute)" }}>
            Abre em ordem decrescente, em sequência. Agrupar abas exige extensão de navegador.</span>
        </div>
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0 }}>
          Abra uma a uma, no seu ritmo. Cada link marca a nota como aberta automaticamente.</p>
        <div className="coffee-links">
          {ids.map((id) => {
            const n = noteIndex.get(id);
            const isOpen = opened.has(id);
            return (
              <div key={id} className={"coffee-link" + (isOpen ? " opened" : "")}>
                {isOpen ? <span className="ck" style={{ color: "var(--green)", fontWeight: 700 }}>✓</span>
                        : <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />}
                <span className="id" style={{ color: isOpen ? "var(--text-dim)" : "var(--text)" }}>{id}</span>
                <span className="tn">{n ? n.tipo_nota + " · " + n.referencia : "—"}</span>
                <Button asChild variant="coffee" size="sm">
                  <a target="_blank" rel="noopener" href={api.coffeeUrl(id)} onClick={() => markOpened([id])}>
                    {isOpen ? "↗ Reabrir" : "☕ Abrir"}
                  </a>
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    );
  })();

  const header = (
    <div className="coffee-hd">
      <h1 className="coffee-h1">Abrir notas no COFFEE</h1>
      <p className="coffee-sub">Monte uma lista de notas e abra todas direto no COFFEE — uma a uma, em blocos ou de uma vez só.</p>
    </div>
  );

  const returnBanner = coffeeReturn ? (
    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "8px 18px",
                  background: "var(--tint-amber)", borderBottom: "1px solid rgba(240,169,59,.3)",
                  fontSize: 13, color: "var(--text)" }}>
      <span style={{ fontSize: 15, lineHeight: 1 }}>←</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        Voce estava na{" "}
        <strong className="edp-mono" style={{ fontSize: 13 }}>Nota {coffeeReturn.noteId}</strong>
        {coffeeReturn.noteRef ? <span style={{ color: "var(--text-dim)" }}> · {coffeeReturn.noteRef}</span> : null}
      </span>
      <Button variant="accent" size="sm" onClick={onBackToTriagem}>← Voltar a triagem</Button>
      <button onClick={onClearReturn}
              style={{ all: "unset", cursor: "pointer", fontSize: 18, lineHeight: 1, color: "var(--text-mute)", padding: "2px 6px" }}
              title="Dispensar" aria-label="Dispensar">x</button>
    </div>
  ) : null;

  if (layout === "split") {
    return (
      <section className="coffee">
        <style>{COFFEE_STYLE}</style>
        {header}
        {returnBanner}
        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(360px, 0.85fr) 1fr", gap: 18, padding: "16px 26px 24px", overflow: "hidden" }}>
          <div className="coffee-card" style={{ display: "flex", flexDirection: "column", padding: 16, gap: 14, minHeight: 0, overflow: "hidden" }}>
            {inputBlock}
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>{countBlock}</div>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{chipList}</div>
          </div>
          <div className="coffee-card" style={{ display: "flex", flexDirection: "column", padding: 16, gap: 14, minHeight: 0, overflow: "hidden" }}>
            <div className="edp-eyebrow">Modo de abertura</div>
            {modeSeg}
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{actionBody}</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="coffee">
      <style>{COFFEE_STYLE}</style>
      {header}
      {returnBanner}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "16px 26px 28px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 760, display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="coffee-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            {inputBlock}
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>{countBlock}</div>
          </div>
          <div className="coffee-card" style={{ padding: 18 }}>{chipList}</div>
          <div className="coffee-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div className="edp-eyebrow">Modo de abertura</div>
              {modeSeg}
            </div>
            {actionBody}
          </div>
        </div>
      </div>
    </section>
  );
}
