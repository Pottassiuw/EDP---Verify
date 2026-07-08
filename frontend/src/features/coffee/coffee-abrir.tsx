import React from 'react';
import type { Note } from '../../types';
import { EDPApi } from '../../api';
import { Button } from '@/components/ui/button';
import { StatTile, Banner } from '@/components/branded/section';
import { Plus, Coffee, Check, Copy, Trash2, X } from 'lucide-react';

const COFFEE_STYLE = `
  .coffee{flex:1;min-height:0;display:flex;flex-direction:column;overflow:auto;background:var(--bg-2)}
  .coffee-wrap{width:100%;max-width:860px;margin:0 auto;padding:18px 26px 28px;
    display:flex;flex-direction:column;gap:var(--gap)}
  .coffee-input{display:flex;gap:8px}
  .coffee-input input{flex:1;min-width:0;height:40px;font-size:15px;font-family:var(--font-mono);
    letter-spacing:.02em}
  .coffee-fb{font-size:12px;color:var(--text-mute);min-height:16px}
  .coffee-bar{height:6px;border-radius:999px;background:var(--surface-3);overflow:hidden}
  .coffee-bar>div{height:100%;background:var(--green);border-radius:999px;transition:width .2s ease}
  .coffee-stepper{display:inline-flex;align-items:center;border:1px solid var(--line-2);
    border-radius:var(--r-sm);overflow:hidden}
  .coffee-stepper button{width:30px;height:30px;border:0;background:var(--surface-2);
    color:var(--text);cursor:pointer;font-size:16px}
  .coffee-stepper button:hover{background:var(--surface-3)}
  .coffee-stepper input{width:46px;height:30px;text-align:center;border:0;background:var(--surface-2);
    color:var(--text);font-family:var(--font-mono);font-size:14px;font-weight:600;outline:none;
    -moz-appearance:textfield}
  .coffee-rows{display:flex;flex-direction:column;gap:1px;background:var(--line);
    border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden}
  .coffee-row{display:flex;align-items:center;gap:10px;padding:9px 13px;background:var(--surface)}
  .coffee-row.opened{background:var(--bg-2)}
  .coffee-row .id{font-family:var(--font-mono);font-size:13px;font-weight:600}
  .coffee-row.opened .id{color:var(--text-dim)}
  .coffee-row .tn{font-size:11.5px;color:var(--text-mute);flex:1;min-width:0;overflow:hidden;
    text-overflow:ellipsis;white-space:nowrap}
  .coffee-empty{color:var(--text-mute);font-size:13px;text-align:center;padding:34px 16px;
    border:1px dashed var(--line-2);border-radius:var(--r-sm)}
  .coffee button:disabled{opacity:.45;cursor:not-allowed}
`;

const COFFEE_ID_RE = /^\d{5,12}$/;
function coffeeTokens(text: string): string[] {
  return text.split(/[^0-9]+/).filter(Boolean);
}
function sortIdsDesc(list: string[]): string[] {
  return [...list].sort((a, b) => Number(b) - Number(a));
}

export interface CoffeeAbrirProps {
  notes: Note[];
  coffeeReturn: { noteId: string; noteRef: string } | null;
  onClearReturn: () => void;
  onBackToTriagem: () => void;
}

export function CoffeeAbrir({ notes, coffeeReturn, onClearReturn, onBackToTriagem }: CoffeeAbrirProps): React.JSX.Element {
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
  function clearAll(): void { setIds([]); setOpened(new Set()); setFeedback(null); }

  function openList(list: string[]): void { if (list.length) { EDPApi.openCoffee(list); markOpened(list); } }

  async function copyIds(): Promise<void> {
    try { await navigator.clipboard.writeText(ids.join("\n")); setFeedback(<span><b>{ids.length}</b> ID(s) copiado(s) para a área de transferência</span>); }
    catch { setFeedback("Não foi possível copiar automaticamente."); }
  }

  const proximas = sortIdsDesc(remaining).slice(0, block);

  return (
    <section className="coffee">
      <style>{COFFEE_STYLE}</style>
      <div className="coffee-wrap">
        <div>
          <h1 className="edp-title">Abrir notas no COFFEE</h1>
          <p className="edp-sub mt-[4px]">
            Monte uma lista de notas e abra no COFFEE — todas de uma vez, em blocos ou uma a uma.</p>
        </div>

        {coffeeReturn && (
          <Banner tipo="err">
            <span className="flex-1 min-w-0">
              Você estava na <strong className="edp-mono">Nota {coffeeReturn.noteId}</strong>
              {coffeeReturn.noteRef ? <span className="text-text-dim"> · {coffeeReturn.noteRef}</span> : null}
            </span>
            <Button size="sm" onClick={onBackToTriagem}>Voltar à triagem</Button>
            <Button variant="ghost" size="icon-xs" title="Dispensar" aria-label="Dispensar" onClick={onClearReturn}>
              <X />
            </Button>
          </Banner>
        )}

        <div className="edp-panel flex flex-col gap-[14px]">
          <div className="coffee-input">
            <input className="edp-field" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown}
                   inputMode="numeric" placeholder="Digite ou cole IDs e tecle Enter…" aria-label="ID da nota" />
            <Button onClick={() => { if (input.trim()) addFromText(input); }} disabled={!input.trim()}>
              <Plus /> Adicionar
            </Button>
          </div>
          <div className="coffee-fb">{feedback}</div>

          <div className="flex gap-[10px] flex-wrap items-stretch">
            <StatTile label="Na lista" value={ids.length} />
            <StatTile label="Abertas" value={opened.size} />
            <StatTile label="Restantes" value={remaining.length} />
            <div className="flex-1 min-w-[220px] flex flex-col justify-center gap-[8px]">
              <div className="coffee-bar">
                <div style={{ width: (ids.length ? (opened.size / ids.length) * 100 : 0) + "%" }} />
              </div>
              <div className="flex gap-[8px] items-center">
                <span className="edp-mono text-[11.5px] text-text-mute flex-1">
                  {opened.size} de {ids.length} abertas</span>
                <Button variant="ghost" size="sm" disabled={!ids.length} onClick={() => void copyIds()}>
                  <Copy /> Copiar IDs
                </Button>
                <Button variant="ghost" size="sm" disabled={!ids.length}
                        style={{ color: ids.length ? "var(--red)" : undefined }} onClick={clearAll}>
                  <Trash2 /> Limpar tudo
                </Button>
              </div>
            </div>
          </div>

          <div className="flex gap-[12px] items-center flex-wrap border-t border-t-line pt-[14px]">
            <Button disabled={!remaining.length} onClick={() => openList(sortIdsDesc(remaining))}>
              <Coffee /> Abrir todas ({remaining.length})
            </Button>
            <div className="flex gap-[8px] items-center">
              <Button variant="outline" size="sm" disabled={!proximas.length} onClick={() => openList(proximas)}>
                Abrir próximas {proximas.length}
              </Button>
              <div className="coffee-stepper">
                <button aria-label="Diminuir bloco" onClick={() => setBlockClamped(block - 1)}>−</button>
                <input type="number" min={1} max={50} value={block} aria-label="Tamanho do bloco"
                       onChange={(e) => setBlockClamped(Number(e.target.value))} />
                <button aria-label="Aumentar bloco" onClick={() => setBlockClamped(block + 1)}>+</button>
              </div>
            </div>
            <span className="text-[11px] text-text-mute">
              Abre em ordem decrescente, uma aba por nota. Agrupar abas exige extensão de navegador.</span>
          </div>
        </div>

        {ids.length === 0 ? (
          <div className="coffee-empty">
            Nenhuma nota na lista ainda.<br />Digite um ID acima e tecle Enter para começar.
          </div>
        ) : (
          <div className="coffee-rows">
            {ids.map((id) => {
              const n = noteIndex.get(id);
              const isOpen = opened.has(id);
              return (
                <div key={id} className={"coffee-row" + (isOpen ? " opened" : "")}>
                  {isOpen
                    ? <Check size={14} className="text-green shrink-0" aria-label="Aberta" />
                    : <span aria-hidden className="w-[8px] h-[8px] rounded-[50%] bg-[var(--accent)] shrink-0" />}
                  <span className="id">{id}</span>
                  <span className="tn">{n ? n.tipo_nota + " · " + n.referencia : "—"}</span>
                  <Button asChild variant="outline" size="sm">
                    <a target="_blank" rel="noopener" href={EDPApi.coffeeUrl(id)} onClick={() => markOpened([id])}>
                      {isOpen ? "Reabrir" : "Abrir"}
                    </a>
                  </Button>
                  <Button variant="ghost" size="icon-xs" title={"Remover " + id} aria-label={"Remover " + id}
                          onClick={() => removeId(id)}>
                    <X />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
