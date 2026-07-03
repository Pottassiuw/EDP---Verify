# COFFEE UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescrever Abrir (lista única), fundir a TopBar da Verificar no header do hub, unificar a paleta no verde EDP e adicionar as funcionalidades aprovadas em Corrigidas, Pendentes e Logs.

**Architecture:** Frontend React/TS (Vite) com tokens `.edp-*` em `src/tokens.css` e primitivos em `src/components/branded/section.tsx`. Backend FastAPI + SQLite (`backend/coffee_module/`). Duas mudanças de backend pequenas (coluna `classificacao_em`, param `since`), resto é frontend.

**Tech Stack:** React 18, TypeScript, Vite, Radix/shadcn (vendored em `src/components/ui/`), lucide-react, Sonner (toast), FastAPI, SQLite, pytest.

**Spec:** `docs/superpowers/specs/2026-07-03-coffee-ui-redesign-design.md`

## Global Constraints

- Paleta EDP intacta: verde `#00a859` é o único acento; nunca cores hardcoded — sempre `var(--*)` de `tokens.css`.
- Nunca usar `any` (use `unknown` ou tipos próprios).
- Marca "To De Olho 👀" (nome + emoji) fica intacta onde já existe.
- `src/components/ui/` é vendored: a ÚNICA mudança permitida é remover as variants `coffee` e `accent` de `button.tsx` (adições do projeto, não shadcn) — Task 11.
- Frontend não tem test runner: verificação = `npx tsc -b` (zero erros) + `npx vite build` (sucesso), rodados a partir de `frontend/`. Backend usa pytest a partir de `backend/`.
- Commits em português, formato `feat(coffee): …` / `refactor(coffee): …`, terminando com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Ícones: lucide-react (`^1.21.0`, já instalado). Sem emoji como glifo de botão em código novo (exceção: marca "To De Olho 👀").
- Textos de UI em português.

---

### Task 1: Backend — coluna `classificacao_em`

**Files:**
- Modify: `backend/coffee_module/db.py` (`_COLUNAS` linha ~35, `inicializar_banco` linhas ~50-96, `upsert_nota` linhas ~99-130)
- Test: `backend/test_coffee_module.py` (append no fim)

**Interfaces:**
- Consumes: fixture `coffee_tmp` já existente no test file (isola banco via `COFFEE_DATA_DIR`).
- Produces: cada dict de `db.listar_notas()` ganha a chave `classificacao_em: str | None` (ISO local, ex. `"2026-07-03T14:22:01.123456"`). `GET /coffee/notas` passa a devolvê-la automaticamente (a rota serializa o dict inteiro). Task 9 consome como `CoffeeNota.classificacao_em`.

Semântica: `classificacao_em` = instante em que a classificação **mudou** pela última vez (ou em que a linha nasceu). Re-busca que mantém a mesma classe **não** atualiza o valor (preserva a idade da pendência).

- [ ] **Step 1: Escrever o teste que falha**

Append em `backend/test_coffee_module.py`:

```python
def test_classificacao_em_gravada_e_preservada(coffee_tmp):
    from coffee_module import db
    db.upsert_nota(1, 10000000, {})
    t1 = db.listar_notas("pendente")[0]["classificacao_em"]
    assert t1  # gravada no nascimento da linha

    _time.sleep(0.01)
    db.upsert_nota(1, 10000000, {})  # re-busca, mesma classe
    assert db.listar_notas("pendente")[0]["classificacao_em"] == t1  # idade preservada

    _time.sleep(0.01)
    db.upsert_nota(1, 17247854, {})  # pendente -> corrigida
    t2 = db.listar_notas("corrigida")[0]["classificacao_em"]
    assert t2 > t1  # reclassificação atualiza
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && python -m pytest test_coffee_module.py::test_classificacao_em_gravada_e_preservada -v`
Expected: FAIL com `KeyError: 'classificacao_em'`

- [ ] **Step 3: Implementar em `db.py`**

3a. `_COLUNAS` ganha a coluna (linha ~35):

```python
_COLUNAS = ["pk", "id_sap", "id_sap_anterior", "arquivado",
            "classificacao", "dados_json", "buscado_em", "erro", "a_gerar", "origem",
            "classificacao_em"]
```

3b. Em `inicializar_banco`, junto às migrações existentes de `a_gerar`/`origem`:

```python
    if "classificacao_em" not in cols_notas:
        conn.execute("ALTER TABLE notas_coffee ADD COLUMN classificacao_em TEXT")
```

3c. Em `upsert_nota`, o INSERT/UPSERT vira (substituir o `conn.execute` atual; `IS` é comparação NULL-safe do SQLite — linha nascida por `registrar_erro` tem `classificacao` NULL):

```python
    agora = datetime.datetime.now().isoformat()
    conn.execute(
        """
        INSERT INTO notas_coffee
            (pk, id_sap, id_sap_anterior, arquivado, classificacao, dados_json,
             buscado_em, erro, classificacao_em)
        VALUES (?, ?, ?, 0, ?, ?, ?, NULL, ?)
        ON CONFLICT(pk) DO UPDATE SET
            id_sap=excluded.id_sap, id_sap_anterior=excluded.id_sap_anterior,
            classificacao=excluded.classificacao,
            dados_json=excluded.dados_json, buscado_em=excluded.buscado_em, erro=NULL,
            classificacao_em=CASE
                WHEN notas_coffee.classificacao IS excluded.classificacao
                THEN notas_coffee.classificacao_em
                ELSE excluded.classificacao_em END
        """,
        (pk, id_sap, id_sap_anterior, classe,
         json.dumps(dados_json, ensure_ascii=False), agora, agora),
    )
```

(As duas últimas posições do tuple são `buscado_em` e `classificacao_em`, ambas `agora`.)

- [ ] **Step 4: Rodar o teste novo + suíte inteira**

Run: `cd backend && python -m pytest test_coffee_module.py -v`
Expected: teste novo PASS e nenhuma regressão (os testes existentes de upsert continuam verdes).

- [ ] **Step 5: Commit**

```bash
git add backend/coffee_module/db.py backend/test_coffee_module.py
git commit -m "feat(coffee): coluna classificacao_em para idade da pendência

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Backend — param `since` em `/coffee/logs`

**Files:**
- Modify: `backend/coffee_module/db.py` (`listar_logs`, linhas ~272-303)
- Modify: `backend/coffee_module/routes.py` (rota `logs`, linhas ~124-128)
- Test: `backend/test_coffee_module.py` (append)

**Interfaces:**
- Produces: `db.listar_logs(..., since: str | None = None)` — filtra `timestamp >= since` (ISO local, comparação lexicográfica). Rota: `GET /coffee/logs?since=<iso>`. Task 10 consome via query string.

- [ ] **Step 1: Escrever o teste que falha**

```python
def test_listar_logs_since(coffee_tmp):
    from coffee_module import db
    db.registrar_log("acao_usuario", "primeira", None, None, True)
    _time.sleep(0.01)
    db.registrar_log("acao_usuario", "segunda", None, None, True)
    todos = db.listar_logs()
    corte = todos[0]["timestamp"]  # ordem DESC: [0] é "segunda"
    filtrados = db.listar_logs(since=corte)
    assert [l["acao"] for l in filtrados] == ["segunda"]
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && python -m pytest test_coffee_module.py::test_listar_logs_since -v`
Expected: FAIL com `TypeError: listar_logs() got an unexpected keyword argument 'since'`

- [ ] **Step 3: Implementar**

3a. `db.py` — assinatura e cláusula:

```python
def listar_logs(nota_pk: int | None = None, tipo: str | None = None,
                limit: int = 100, usuario: str | None = None,
                since: str | None = None) -> list:
```

Após o bloco `if usuario:` existente, antes do `if clausulas:`:

```python
    if since:
        clausulas.append("timestamp >= ?")
        params.append(since)
```

3b. `routes.py` — rota:

```python
@router.get("/logs")
def logs(nota_pk: Optional[int] = None, tipo: Optional[str] = None,
         limit: int = 100, usuario: Optional[str] = None,
         since: Optional[str] = None):
    _garantir_banco()
    return {"logs": db.listar_logs(nota_pk=nota_pk, tipo=tipo, limit=limit,
                                   usuario=usuario, since=since)}
```

- [ ] **Step 4: Rodar suíte**

Run: `cd backend && python -m pytest test_coffee_module.py -v`
Expected: tudo PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/coffee_module/db.py backend/coffee_module/routes.py backend/test_coffee_module.py
git commit -m "feat(coffee): filtro since em /coffee/logs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Abrir — reescrita com lista única

**Files:**
- Rewrite: `frontend/src/coffee/coffee-abrir.tsx` (conteúdo completo abaixo)
- Modify: `frontend/src/coffee/coffee-hub.tsx` (remover prop `layout` da interface e do repasse)
- Modify: `frontend/src/App.tsx:227` (remover `layout={settings.coffeeLayout}`)

**Interfaces:**
- Consumes: `StatTile`, `Banner` de `@/components/branded/section`; `EDPApi.openCoffee(ids: string | string[])`, `EDPApi.coffeeUrl(id: string): string` de `../api`; classes `.edp-field`, `.edp-panel`, `.edp-title`, `.edp-eyebrow`, `.edp-mono` de `tokens.css`; ícones `Plus, Coffee, Check, Copy, Trash2, X` de `lucide-react`.
- Produces: `CoffeeAbrirProps` SEM `layout` (campos: `notes`, `coffeeReturn`, `onClearReturn`, `onBackToTriagem`). `CoffeeHubProps` SEM `layout`. Nenhum uso de `variant="coffee"`/`"accent"` neste arquivo.

Nota: `settings.coffeeLayout` continua existindo no context até a Task 4 (fica sem uso um commit; a Task 4 limpa).

- [ ] **Step 1: Reescrever `coffee-abrir.tsx` por inteiro**

```tsx
import React from 'react';
import type { Note } from '../types';
import { EDPApi } from '../api';
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
          <p className="edp-sub" style={{ marginTop: 4 }}>
            Monte uma lista de notas e abra no COFFEE — todas de uma vez, em blocos ou uma a uma.</p>
        </div>

        {coffeeReturn && (
          <Banner tipo="err">
            <span style={{ flex: 1, minWidth: 0 }}>
              Você estava na <strong className="edp-mono">Nota {coffeeReturn.noteId}</strong>
              {coffeeReturn.noteRef ? <span style={{ color: "var(--text-dim)" }}> · {coffeeReturn.noteRef}</span> : null}
            </span>
            <Button size="sm" onClick={onBackToTriagem}>Voltar à triagem</Button>
            <Button variant="ghost" size="icon-xs" title="Dispensar" aria-label="Dispensar" onClick={onClearReturn}>
              <X />
            </Button>
          </Banner>
        )}

        <div className="edp-panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="coffee-input">
            <input className="edp-field" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown}
                   inputMode="numeric" placeholder="Digite ou cole IDs e tecle Enter…" aria-label="ID da nota" />
            <Button onClick={() => { if (input.trim()) addFromText(input); }} disabled={!input.trim()}>
              <Plus /> Adicionar
            </Button>
          </div>
          <div className="coffee-fb">{feedback}</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
            <StatTile label="Na lista" value={ids.length} />
            <StatTile label="Abertas" value={opened.size} />
            <StatTile label="Restantes" value={remaining.length} />
            <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
              <div className="coffee-bar">
                <div style={{ width: (ids.length ? (opened.size / ids.length) * 100 : 0) + "%" }} />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="edp-mono" style={{ fontSize: 11.5, color: "var(--text-mute)", flex: 1 }}>
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

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
                        borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <Button disabled={!remaining.length} onClick={() => openList(sortIdsDesc(remaining))}>
              <Coffee /> Abrir todas ({remaining.length})
            </Button>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
            <span style={{ fontSize: 11, color: "var(--text-mute)" }}>
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
                    ? <Check size={14} style={{ color: "var(--green)", flexShrink: 0 }} aria-label="Aberta" />
                    : <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />}
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
```

Nota: `api.ts` exporta `coffeeUrl` de duas formas (export solto na linha 5 e dentro do objeto `EDPApi` na linha 150). `EDPApi.coffeeUrl(id)` e `EDPApi.openCoffee(list)` usados acima existem — verificado.

- [ ] **Step 2: Remover a prop `layout` da cadeia**

Em `coffee-hub.tsx`, na interface e no uso:

```tsx
interface CoffeeHubProps {
  notes: Note[];
  sub: CoffeeSubPage;
  setSub: (s: CoffeeSubPage) => void;
  triage: TriageHandoff;
  coffeeReturn: { noteId: string; noteRef: string } | null;
  onClearReturn: () => void;
  onBackToTriagem: () => void;
}
```

Assinatura da função perde `layout`; o render vira:

```tsx
        <CoffeeAbrir notes={notes}
                     coffeeReturn={coffeeReturn} onClearReturn={onClearReturn}
                     onBackToTriagem={onBackToTriagem} />
```

Em `App.tsx:227`, remover só o pedaço `layout={settings.coffeeLayout}`:

```tsx
             <CoffeeHub notes={notes}
                        sub={coffeeSub} setSub={setCoffeeSub}
                        triage={triage}
                        coffeeReturn={coffeeReturn}
                        onClearReturn={() => setCoffeeReturn(null)}
                        onBackToTriagem={() => { setCoffeeSub("verificar"); }} />
```

- [ ] **Step 3: Verificar**

Run: `cd frontend && npx tsc -b && npx vite build`
Expected: zero erros, build verde.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/coffee/coffee-abrir.tsx frontend/src/coffee/coffee-hub.tsx frontend/src/App.tsx
git commit -m "feat(coffee): Abrir com lista única e layout responsivo

Funde chips + modo links numa lista só; modos viram ações diretas
(Abrir todas / Abrir próximas N). Layout único, prop layout removida.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Matar o setting `coffeeLayout`

**Files:**
- Modify: `frontend/src/types.ts` (linhas 10-11: remover `CoffeeLayout` e `CoffeeOpenMode`)
- Modify: `frontend/src/context/settings-context.tsx` (import linha 2, interface linha 9, DEFAULTS linha 24)
- Modify: `frontend/src/pages/configuracoes.tsx` (remover Card "Seção COFFEE", linhas ~107-124)

**Interfaces:**
- Produces: `Settings` sem `coffeeLayout`. `types.ts` sem `CoffeeLayout`/`CoffeeOpenMode`.

- [ ] **Step 1: `types.ts`** — deletar as duas linhas:

```ts
export type CoffeeLayout = "composer" | "split";
export type CoffeeOpenMode = "all" | "block" | "links";
```

- [ ] **Step 2: `settings-context.tsx`** — três remoções:

```ts
import type { Theme, Density, Accent } from '../types';
```

Interface `Settings` perde a linha `coffeeLayout: CoffeeLayout;`. `DEFAULTS` perde a linha `coffeeLayout: "composer",`.

(Valor órfão salvo no `localStorage` de usuários antigos é inofensivo: o spread `{ ...DEFAULTS, ...parsed }` só carrega chave extra que ninguém lê — TypeScript não reclama de runtime extra.)

- [ ] **Step 3: `configuracoes.tsx`** — remover o Card inteiro:

```tsx
          <Card>
            <CardHeader>
              <CardTitle>Seção COFFEE</CardTitle>
            </CardHeader>
            <CardContent>
              <Row label="Layout">
                <ToggleGroup ... value={settings.coffeeLayout} ...>
                  <ToggleGroupItem value="composer" ...>Composer</ToggleGroupItem>
                  <ToggleGroupItem value="split" ...>Split</ToggleGroupItem>
                </ToggleGroup>
              </Row>
            </CardContent>
          </Card>
```

NÃO remover os imports de `ToggleGroup`/`Switch`/`Row` — tema e densidade ainda usam (confirmado por grep).

- [ ] **Step 4: Verificar**

Run: `cd frontend && npx tsc -b && npx vite build`
Expected: zero erros.
Run: `grep -rn "coffeeLayout\|CoffeeOpenMode\|CoffeeLayout" frontend/src/`
Expected: nenhuma ocorrência.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types.ts frontend/src/context/settings-context.tsx frontend/src/pages/configuracoes.tsx
git commit -m "refactor(coffee): remover setting coffeeLayout e tipos órfãos

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Verificar — TopBar funde no header do hub

**Files:**
- Modify: `frontend/src/coffee/coffee-hub.tsx` (cluster no header)
- Modify: `frontend/src/coffee/coffee-verificar.tsx` (remover TopBar)
- Delete: `frontend/src/components/top-bar.tsx`
- Modify: `frontend/src/components/shared.tsx` (remover componente `Logo`; manter `LOGO_DARK`/`LOGO_LIGHT` — upload usa)
- Modify: `frontend/src/types.ts` (remover `LogoProps`)

**Interfaces:**
- Consumes: `triage.file: string`, `triage.source: "api" | "demo"`-like (`Source`), `triage.onReset: () => void`, `triage.screen` — já presentes em `TriageHandoff`.
- Produces: header do hub com cluster de contexto quando `sub === "verificar" && triage.screen === "dashboard"`.

- [ ] **Step 1: Cluster no header do hub**

Em `coffee-hub.tsx`, o bloco do header (`hdr-top`) vira:

```tsx
      <div style={{ flexShrink: 0, background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ padding: "13px 22px 11px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span className="edp-eyebrow">Módulo COFFEE</span>
            <strong className="edp-title" style={{ fontSize: 16 }}>Geração de notas</strong>
          </div>
          {sub === "verificar" && triage.screen === "dashboard" && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
              <span className="edp-mono" style={{ fontSize: 11, color: "var(--text-mute)", background: "var(--bg-2)",
                    padding: "5px 10px", borderRadius: 6, border: "1px solid var(--line)" }}>{triage.file}</span>
              <span title={triage.source === "api" ? "Conectado ao backend" : "Dados de demonstração (offline)"}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5,
                             fontFamily: "var(--font-mono)", letterSpacing: ".06em", textTransform: "uppercase",
                             padding: "4px 9px", borderRadius: 999,
                             color: triage.source === "api" ? "var(--green)" : "var(--amber)",
                             background: triage.source === "api" ? "var(--tint-green)" : "var(--tint-amber)",
                             border: "1px solid " + (triage.source === "api" ? "rgba(0,168,89,.3)" : "rgba(240,169,59,.3)") }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                {triage.source === "api" ? "API" : "Demo"}
              </span>
              <Button variant="ghost" size="sm" title="Nova planilha" onClick={triage.onReset}>↑ Nova</Button>
            </div>
          )}
        </div>
        <div style={{ padding: "0 22px", borderTop: "1px solid var(--line)" }}>
          <SegTabs ... />  {/* inalterado */}
        </div>
      </div>
```

Adicionar `import { Button } from '@/components/ui/button';` no hub.

- [ ] **Step 2: `coffee-verificar.tsx`** — remover `TopBar` (import + render). O branch dashboard vira:

```tsx
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Dashboard showKpis={triage.showKpis} notes={triage.notes} completed={triage.completed}
                 dupResolved={triage.dupResolved}
                 onToggleComplete={triage.onToggleComplete} onMarkMany={triage.onMarkMany}
                 onMarkDuplicate={triage.onMarkDuplicate} onSendToCoffee={triage.onSendToCoffee} />
    </div>
  );
```

- [ ] **Step 3: Deletar `top-bar.tsx`; limpar `Logo` e `LogoProps`**

```bash
rm frontend/src/components/top-bar.tsx
```

Em `shared.tsx`: remover o componente `Logo` (linhas 9-34) e o import de `LogoProps`. Em `types.ts`: remover a interface/`type` `LogoProps`.

- [ ] **Step 4: Verificar**

Run: `cd frontend && npx tsc -b && npx vite build`
Expected: zero erros.
Run: `grep -rn "top-bar\|LogoProps" frontend/src/`
Expected: nenhuma ocorrência.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src
git commit -m "refactor(coffee): TopBar funde no header do hub

Arquivo/API/Nova sobem para o header quando a aba é Verificar.
top-bar.tsx, Logo e LogoProps removidos (sem uso).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Verificar — pele do upload e do dashboard

**Files:**
- Modify: `frontend/src/components/upload-screen.tsx`
- Modify: `frontend/src/components/dashboard.tsx`
- Modify: `frontend/src/components/duplicate-compare.tsx` (linhas 85 e 135)
- Modify: `frontend/src/components/shared.tsx` (remover `ctrlStyle` — dashboard é o único usuário, confirmado por grep)

**Interfaces:**
- Consumes: classe `.edp-field`, `.edp-title`; ícones `Maximize2, Minimize2, RotateCcw, Check, Coffee, MapPin` de `lucide-react`.
- Produces: nenhum uso de `variant="coffee"`/`"accent"` nestes arquivos; `ctrlStyle` deixa de existir.

- [ ] **Step 1: `upload-screen.tsx`**

Título "To De Olho 👀" (texto fica IGUAL): `fontWeight: 800` → `fontWeight: 600`, `letterSpacing: "-0.02em"` → `letterSpacing: "var(--tracking-display)"`. H2 "Importar planilha": `fontWeight: 700` → `600`. Botão:

```tsx
        <Button asChild style={{ padding: "10px 22px" }}>
          <span>Selecionar arquivo</span>
        </Button>
```

(gradiente radial e resto do hero: NÃO mexer.)

- [ ] **Step 2: `dashboard.tsx`**

2a. Imports: adicionar `import { Maximize2, Minimize2, RotateCcw, Check, Coffee, MapPin } from 'lucide-react';` e remover `ctrlStyle` do import de `./shared` (manter `PriorityChip, StatusTag, Field`).

2b. Filtros (linhas ~124-153): todo `style={ctrlStyle}` vira `className="edp-field"`; o input de busca vira `className="edp-field"` com `style={{ paddingRight: q ? 30 : 11, width: "100%" }}`.

2c. CSS local: apagar as duas regras `.accent-btn` do bloco `<style>`.

2d. Batch bar (linha ~256): `variant="accent"` → sem variant (default):

```tsx
                  <Button size="sm" onClick={() => doAction("done")}>
                    <Check /> {allOpen ? "Concluir" : "Concluir pendentes"}
                  </Button>
```

2e. Botões COFFEE (linhas ~265 e ~335): `variant="coffee"` → default + ícone:

```tsx
                <Button size="sm" onClick={() => { toast("Abrindo no COFFEE…"); EDPApi.openCoffee(ids); }}>
                  <Coffee /> COFFEE
                </Button>
```

```tsx
          <Button size="sm" onClick={() => { toast("Abrindo no COFFEE…"); EDPApi.openCoffee(sel.id); }}>
            <Coffee /> COFFEE
          </Button>
```

2f. `Detail` (linha ~327): `<h2 style={{ fontFamily: ..., fontWeight: 800, fontSize: 21, ... }}>` vira:

```tsx
            <h2 className="edp-title" style={{ fontSize: 21, margin: 0, whiteSpace: "nowrap" }}>Nota {sel.id}</h2>
```

2g. Emoji-glifos no `Detail`:

```tsx
          <Button variant="outline" size="icon-sm" title={fs ? "Sair da tela cheia" : "Expandir"}
                  aria-label={fs ? "Sair da tela cheia" : "Expandir"} onClick={() => setFs((v) => !v)}>
            {fs ? <Minimize2 /> : <Maximize2 />}
          </Button>
          <Button variant={done ? "outline" : "default"} size="sm" onClick={() => onToggleDone(sel.id)}>
            {done ? <><RotateCcw /> Reabrir</> : <><Check /> Concluir</>}
          </Button>
```

Maps (linha ~375): `◎ Abrir no Google Maps` → `<MapPin /> Abrir no Google Maps`.

Fila (linha ~233): botão `→ ☕` vira ícone com o mesmo comportamento:

```tsx
                    <button title="Enviar candidatas para a fila COFFEE"
                            style={{ all: "unset", cursor: "pointer", color: "var(--amber)", flexShrink: 0, lineHeight: 1, padding: "2px 4px", display: "inline-flex" }}
                            onClick={(e) => { e.stopPropagation(); onSendToCoffee(n.duplicates.map((d) => d.id), n.id); }}>
                      <Coffee size={14} />
                    </button>
```

(Glifos `⧉`, `»`, `«`, `×`, `↺` em outros pontos da fila/batch: trocar apenas os listados acima; o resto fica — escopo contido.)

- [ ] **Step 3: `duplicate-compare.tsx`**

Linhas 85 e 135: `variant="coffee"` → sem variant, texto com `<Coffee />` no lugar de "☕" (adicionar `import { Coffee } from 'lucide-react';`).

- [ ] **Step 4: `shared.tsx`** — apagar o export `ctrlStyle` (linhas 105-115).

- [ ] **Step 5: Verificar**

Run: `cd frontend && npx tsc -b && npx vite build`
Expected: zero erros.
Run: `grep -rn "ctrlStyle" frontend/src/`
Expected: nenhuma ocorrência.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components
git commit -m "refactor(verificar): pele elevada — edp-field, Lucide, tipografia display

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: `AbrirCoffeeBtn` compartilhado + Corrigidas

**Files:**
- Modify: `frontend/src/coffee/coffee-notas-table.tsx` (ganha o export `AbrirCoffeeBtn`)
- Modify: `frontend/src/coffee/coffee-geradas.tsx` (remove o local, importa o novo)
- Modify: `frontend/src/coffee/coffee-corrigidas.tsx` (busca + copiar + botão por linha)

**Interfaces:**
- Produces: `export function AbrirCoffeeBtn({ pk }: { pk: number })` em `coffee-notas-table.tsx`. Tasks 8/9 consomem.
- Consumes: `coffeeUrl` de `../api` (mesmo import que `coffee-geradas.tsx` já usa), `Coffee` de lucide.

- [ ] **Step 1: Mover `AbrirCoffeeBtn`**

Em `coffee-notas-table.tsx`, adicionar no topo (com os imports novos `Button`, `Coffee`, `coffeeUrl`):

```tsx
import { Button } from '@/components/ui/button';
import { Coffee } from 'lucide-react';
import { coffeeUrl } from '../api';

/** Botão-âncora "abrir no COFFEE" — compartilhado pelas telas de lista. */
export function AbrirCoffeeBtn({ pk }: { pk: number }): React.JSX.Element {
  return (
    <Button asChild variant="outline" size="sm" title="Abrir no COFFEE">
      <a target="_blank" rel="noopener" href={coffeeUrl(String(pk))} aria-label={`Abrir nota ${pk} no COFFEE`}>
        <Coffee />
      </a>
    </Button>
  );
}
```

Em `coffee-geradas.tsx`: apagar a função local `AbrirCoffeeBtn` (linhas 15-21) e o import `coffeeUrl` se ficar órfão; adicionar `import { CoffeeNotasTable, AbrirCoffeeBtn } from './coffee-notas-table';` (ajustando o import existente).

- [ ] **Step 2: `coffee-corrigidas.tsx`** — reescrever o corpo do componente:

```tsx
import React from 'react';
import { useCoffeeNotas } from './use-coffee-notas';
import { CoffeeNotasTable, AbrirCoffeeBtn } from './coffee-notas-table';
import { LogDrawer } from './coffee-log-drawer';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';

export function CoffeeCorrigidas(): React.JSX.Element {
  const { notas, isLoading, error, refetch } = useCoffeeNotas("corrigida");
  const [drawerPk, setDrawerPk] = React.useState<number | null>(null);
  const [busca, setBusca] = React.useState("");

  const filtradas = React.useMemo(() => {
    const q = busca.trim();
    if (!q) return notas;
    return notas.filter((n) => String(n.pk).includes(q) || String(n.id_sap).includes(q));
  }, [notas, busca]);

  async function copiarIds(): Promise<void> {
    try {
      await navigator.clipboard.writeText(filtradas.map((n) => n.pk).join("\n"));
      toast.success(`${filtradas.length} ID(s) copiado(s)`);
    } catch {
      toast.error("Não foi possível copiar automaticamente");
    }
  }

  if (error) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "var(--text-mute)" }}>
        <span style={{ color: "var(--red)" }}>Erro ao carregar notas: {error}</span>
        <Button variant="outline" size="sm" onClick={refetch}>Tentar de novo</Button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flexShrink: 0, padding: "14px 22px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className="edp-title" style={{ fontSize: 16 }}>Notas Corrigidas</span>
        {!isLoading && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)" }}>
            {filtradas.length}{busca.trim() ? ` de ${notas.length}` : ""} nota{filtradas.length !== 1 ? "s" : ""}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <input className="edp-field edp-mono" value={busca} placeholder="Buscar ID ou SAP…"
               style={{ width: 180, height: 30, fontSize: 12 }}
               onChange={(e) => setBusca(e.target.value)} />
        <Button variant="outline" size="sm" disabled={filtradas.length === 0} onClick={() => void copiarIds()}>
          <Copy /> Copiar IDs
        </Button>
      </div>
      <div style={{ flexShrink: 0, padding: "0 22px 10px", fontSize: 12, color: "var(--text-dim)" }}>
        Notas que transitaram de pendente para SAP real. Na próxima busca, passam para Geradas.
      </div>
      <CoffeeNotasTable
        notas={filtradas}
        isLoading={isLoading}
        emptyMessage={busca.trim()
          ? "Nenhuma nota corrigida bate com a busca."
          : "Nenhuma nota corrigida no momento. Notas aparecem aqui quando transitam de SAP pendente para SAP real."}
        actionColumn={(nota) => (
          <>
            <AbrirCoffeeBtn pk={nota.pk} />
            <Button variant="ghost" size="sm" onClick={() => setDrawerPk(nota.pk)} title="Ver logs">
              Logs
            </Button>
          </>
        )}
      />
      {drawerPk !== null && (
        <LogDrawer notaPk={drawerPk} open onClose={() => setDrawerPk(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar**

Run: `cd frontend && npx tsc -b && npx vite build`
Expected: zero erros.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/coffee/coffee-notas-table.tsx frontend/src/coffee/coffee-geradas.tsx frontend/src/coffee/coffee-corrigidas.tsx
git commit -m "feat(coffee): Corrigidas com busca, copiar IDs e abrir no COFFEE

AbrirCoffeeBtn promovido a coffee-notas-table (compartilhado).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Pendentes — seleção, busca seletiva, arquivar em lote, idade

**Files:**
- Modify: `frontend/src/coffee/types.ts` (campo `classificacao_em`)
- Modify: `frontend/src/coffee/coffee-notas-table.tsx` (coluna opcional de idade)
- Modify: `frontend/src/coffee/coffee-pendentes.tsx`

**Interfaces:**
- Consumes: `classificacao_em` da Task 1 (via `/coffee/notas`); `AbrirCoffeeBtn` da Task 7; infra `selectable/selectedPks/onToggleSelect/onToggleAll` já existente na tabela; `ConfirmModal` existente.
- Produces: prop nova `mostrarIdade?: boolean` em `CoffeeNotasTableProps`.

- [ ] **Step 1: `types.ts` (coffee)** — em `CoffeeNota`, após `buscado_em: string;`:

```ts
  classificacao_em?: string | null;
```

- [ ] **Step 2: Coluna de idade na tabela**

Em `CoffeeNotasTableProps`, adicionar `mostrarIdade?: boolean;` (e desestruturar no componente). No `<TableHeader>`, após a coluna "Status":

```tsx
            {mostrarIdade && <TableHead style={STICKY_TH}>Pendente há</TableHead>}
```

No `<TableBody>`, na mesma posição:

```tsx
              {mostrarIdade && (
                <TableCell style={{ color: "var(--text-mute)", fontSize: 12 }}>
                  {n.classificacao_em ? formatRelativeTime(n.classificacao_em) : "—"}
                </TableCell>
              )}
```

- [ ] **Step 3: `coffee-pendentes.tsx`**

3a. Imports novos: `AbrirCoffeeBtn` (junto de `CoffeeNotasTable`).

3b. Estado de seleção + ordenação por idade (mais antiga primeiro, `null` no fim) — dentro do componente:

```tsx
  const [selecionadas, setSelecionadas] = React.useState<Set<number>>(() => new Set());

  const ordenadas = React.useMemo(
    () => [...notas].sort((a, b) =>
      (a.classificacao_em ?? "￿").localeCompare(b.classificacao_em ?? "￿")),
    [notas]);

  function toggleSelecionada(pk: number): void {
    setSelecionadas((prev) => { const s = new Set(prev); if (s.has(pk)) s.delete(pk); else s.add(pk); return s; });
  }
  function toggleTodas(): void {
    setSelecionadas((prev) => prev.size === ordenadas.length
      ? new Set() : new Set(ordenadas.map((n) => n.pk)));
  }
```

3c. `iniciarBusca` passa a receber os pks (busca seletiva; endpoint já aceita lista):

```tsx
  function iniciarBusca(): void {
    const alvo = selecionadas.size > 0 ? [...selecionadas] : ordenadas.map((n) => n.pk);
    if (alvo.length === 0) return;
    ...
    const ids = alvo.map(String);
    ...  // resto idêntico ao atual (fetch /coffee/buscar { ids }, poll do job)
  }
```

Após `refetch()` no conclusão do job, adicionar `setSelecionadas(new Set());`.

3d. Estado + handler do arquivamento em lote (novo estado `arquivarLote: boolean`):

```tsx
  const [arquivarLoteOpen, setArquivarLoteOpen] = React.useState(false);

  async function arquivarLote(justificativa: string): Promise<void> {
    setModalBusy(true);
    const pks = [...selecionadas];
    const falhas: number[] = [];
    // ponytail: loop sequencial; endpoint de lote se passar de ~50 notas por vez
    for (const pk of pks) {
      try {
        const res = await fetch(`${API_BASE}/coffee/arquivar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: pk, justificativa }),
        });
        if (!res.ok) throw new Error(String(res.status));
      } catch { falhas.push(pk); }
    }
    setModalBusy(false);
    setArquivarLoteOpen(false);
    setSelecionadas(new Set());
    refetch();
    if (falhas.length) toast.error(`${falhas.length} de ${pks.length} falharam ao arquivar`, { description: falhas.join(", ") });
    else toast.success(`${pks.length} nota(s) arquivada(s)`);
  }
```

3e. Header da tela — CTA seletivo + arquivar em lote (substituir o bloco do botão "Atualizar notas"):

```tsx
        {selecionadas.size > 0 && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--accent)" }}>
            {selecionadas.size} selecionada{selecionadas.size !== 1 ? "s" : ""}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {selecionadas.size > 0 && (
          <Button variant="destructive" size="sm" disabled={buscaEstado === "rodando"}
                  onClick={() => setArquivarLoteOpen(true)}>
            Arquivar selecionadas ({selecionadas.size})
          </Button>
        )}
        <Button size="sm"
                disabled={buscaEstado === "rodando" || isLoading || notas.length === 0}
                onClick={iniciarBusca}>
          {buscaEstado === "rodando" ? "Buscando..."
            : selecionadas.size > 0 ? `Atualizar selecionadas (${selecionadas.size})` : "Atualizar todas"}
        </Button>
```

3f. Tabela — seleção + idade + botão COFFEE:

```tsx
      <CoffeeNotasTable
        notas={ordenadas}
        isLoading={isLoading}
        mostrarIdade
        selectable
        selectedPks={selecionadas}
        onToggleSelect={toggleSelecionada}
        onToggleAll={toggleTodas}
        emptyMessage="Nenhuma nota pendente encontrada. Notas aparecem aqui quando buscadas com SAP 10000000."
        actionColumn={(nota) => (
          <>
            <AbrirCoffeeBtn pk={nota.pk} />
            <Button variant="destructive" size="sm" onClick={() => setArquivarPk(nota.pk)} title="Arquivar nota">
              Arquivar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDrawerPk(nota.pk)} title="Ver logs">
              Logs
            </Button>
          </>
        )}
      />
```

3g. Segundo `ConfirmModal` (lote), ao lado do existente de arquivar individual:

```tsx
      <ConfirmModal
        open={arquivarLoteOpen}
        title={`Arquivar ${selecionadas.size} nota(s)`}
        message="As notas selecionadas serão arquivadas e não aparecerão mais nas listagens. A justificativa vale para todas."
        confirmLabel="Arquivar todas"
        tone="danger"
        requireJustification
        busy={modalBusy}
        onConfirm={(j) => { void arquivarLote(j); }}
        onCancel={() => setArquivarLoteOpen(false)}
      />
```

- [ ] **Step 4: Verificar**

Run: `cd frontend && npx tsc -b && npx vite build`
Expected: zero erros.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/coffee/types.ts frontend/src/coffee/coffee-notas-table.tsx frontend/src/coffee/coffee-pendentes.tsx
git commit -m "feat(coffee): Pendentes com seleção, busca seletiva, arquivar em lote e idade

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Logs — período, StatTiles e Ao vivo

**Files:**
- Modify: `frontend/src/coffee/use-coffee-logs.ts` (param `since`)
- Modify: `frontend/src/coffee/coffee-logs.tsx`

**Interfaces:**
- Consumes: `since` da Task 2; `StatTile` de `@/components/branded/section`; `Switch` de `@/components/ui/switch`; `agruparLogs` já exportado de `./coffee-log-table`.
- Produces: `UseCoffeeLogsParams.since?: string`.

- [ ] **Step 1: `use-coffee-logs.ts`**

Interface ganha `since?: string;`. No efeito, junto aos outros params:

```ts
    if (params?.since) qs.set("since", params.since);
```

- [ ] **Step 2: `coffee-logs.tsx`**

2a. Imports novos:

```tsx
import { StatTile } from '@/components/branded/section';
import { Switch } from '@/components/ui/switch';
import { agruparLogs } from './coffee-log-table';
```

(`LogTable, PASSOS` já vêm de `./coffee-log-table` — juntar no mesmo import.)

2b. Helper de ISO **local** (backend grava `datetime.now().isoformat()` sem timezone; `toISOString()` é UTC com sufixo `Z` e quebraria a comparação lexicográfica):

```tsx
const PERIODOS = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "7d", rotulo: "7 dias" },
  { id: "30d", rotulo: "30 dias" },
  { id: "tudo", rotulo: "Tudo" },
] as const;
type Periodo = (typeof PERIODOS)[number]["id"];

function isoLocal(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function sinceDe(periodo: Periodo): string | undefined {
  if (periodo === "tudo") return undefined;
  const d = new Date();
  if (periodo === "hoje") d.setHours(0, 0, 0, 0);
  else d.setDate(d.getDate() - (periodo === "7d" ? 7 : 30));
  return isoLocal(d);
}
```

2c. Estado + hook:

```tsx
  const [periodo, setPeriodo] = React.useState<Periodo>("7d");
  const [aoVivo, setAoVivo] = React.useState(false);

  const { logs, loading, refresh } = useCoffeeLogs({
    nota_pk: pkValido,
    usuario: usuario || undefined,
    limit,
    since: sinceDe(periodo),
  });

  React.useEffect(() => {
    if (!aoVivo) return;
    const t = window.setInterval(refresh, 10_000);
    return () => window.clearInterval(t);
  }, [aoVivo, refresh]);
```

(`refresh` é `useCallback` estável no hook — o intervalo não recria à toa.)

2d. Na barra de filtros, após o select de limite:

```tsx
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 12, color: "var(--text-mute)" }}>Período:</label>
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}
                  className="edp-field" style={{ height: 30, fontSize: 12 }}>
            {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Switch id="logs-ao-vivo" checked={aoVivo} onCheckedChange={setAoVivo} />
          <label htmlFor="logs-ao-vivo" style={{ fontSize: 12, color: aoVivo ? "var(--green)" : "var(--text-mute)", cursor: "pointer" }}>
            Ao vivo
          </label>
        </div>
```

2e. StatTiles entre a barra de filtros e a `LogTable` (agregação client-side do carregado):

```tsx
      <div style={{ flexShrink: 0, padding: "0 22px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="edp-eyebrow">No período carregado</span>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <StatTile label="Ações" value={agruparLogs(logs).length} />
          <StatTile label="Falhas" value={logs.filter((l) => !l.sucesso).length} />
          <StatTile label="Notas tocadas" value={new Set(logs.map((l) => l.nota_pk).filter((p) => p !== null)).size} />
        </div>
      </div>
```

- [ ] **Step 3: Verificar**

Run: `cd frontend && npx tsc -b && npx vite build`
Expected: zero erros.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/coffee/use-coffee-logs.ts frontend/src/coffee/coffee-logs.tsx
git commit -m "feat(coffee): Logs com período, resumo em tiles e modo ao vivo

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Remover variants `coffee`/`accent` do button + varredura final

**Files:**
- Modify: `frontend/src/components/ui/button.tsx` (apagar 2 variants — única mudança permitida no vendored)

**Interfaces:**
- Consumes: Tasks 3, 5, 6, 7 já migraram todos os usos (grep confirma antes de apagar).

- [ ] **Step 1: Confirmar zero usos**

Run: `grep -rn "variant=\"coffee\"\|variant=\"accent\"" frontend/src/`
Expected: nenhuma ocorrência. (Se aparecer alguma, migrar para default ANTES de seguir — mesmo padrão das tasks anteriores.)

- [ ] **Step 2: Apagar as duas variants em `button.tsx`**

Remover exatamente estas linhas do objeto `variant`:

```tsx
        coffee:
          "border border-[rgba(190,140,100,0.3)] bg-[rgba(111,78,55,0.18)] text-[#d8a883] hover:bg-[rgba(111,78,55,0.28)]",
        accent:
          "border border-[var(--accent)] bg-[var(--accent)] text-white font-semibold hover:opacity-90",
```

- [ ] **Step 3: Varredura final (critérios de aceite da spec)**

Run: `cd frontend && npx tsc -b && npx vite build`
Expected: zero erros, build verde.

Run: `grep -rn "variant=\"coffee\"\|variant=\"accent\"\|coffeeLayout\|CoffeeOpenMode\|CoffeeLayout\|top-bar\|LogoProps\|ctrlStyle" frontend/src/`
Expected: nenhuma ocorrência.

Run: `cd backend && python -m pytest test_coffee_module.py -v`
Expected: tudo PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ui/button.tsx
git commit -m "refactor(ui): remover variants coffee/accent do button

Paleta unificada: verde EDP é o único acento; variants eram
adições do projeto ao arquivo vendored, sem uso restante.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Verificação final (manual, com app rodando)

Backend `:8000` + `npm run dev` no frontend. Conferir:

1. **Abrir**: adicionar IDs (Enter/vírgula/espaço), abrir todas, abrir bloco com stepper, reabrir por linha, copiar, limpar, recarregar página (persistência), banner de retorno.
2. **Verificar**: upload mostra hero intacto; dashboard mostra badge arquivo/API/Nova no header do hub; filtros funcionam; detalhe abre COFFEE.
3. **Corrigidas**: busca filtra, copiar IDs cola no editor, ☕ abre nota.
4. **Pendentes**: selecionar 2 → "Atualizar selecionadas (2)" busca só elas; arquivar em lote pede justificativa e some com as notas; coluna "Pendente há" mostra relativo (novas) e "—" (antigas).
5. **Logs**: trocar período muda o resultado; tiles batem com a timeline; "Ao vivo" atualiza a cada 10 s e para ao desligar.
6. Tema claro: nenhuma fonte escura ilegível nas telas tocadas.
