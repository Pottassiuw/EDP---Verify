# Auto-Vínculos, Identity e UX Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar modal de identidade (auto-detectar via OS), tornar Detetive de Vínculos automático com status line, mover hierarquia para Visão Geral, corrigir gutter column do DataGrid.

**Architecture:** Backend expõe `GET /me` lendo `USERNAME`/`USER` do ambiente. Frontend inicializa identidade automaticamente no mount de `InputSection`. Hook `useAutoVinculos` aplica Nota_Mae silenciosamente quando dados chegam. `IdentityModal` deletado. Hierarquia manual movida de `ramal.tsx` para novo `hierarquia-card.tsx` renderizado em `overview.tsx`.

**Tech Stack:** FastAPI, React 18, TypeScript, React Query (`@tanstack/react-query`), Sonner, react-datasheet-grid.

## Global Constraints

- Nunca usar `any` — tipos explícitos ou `unknown`
- Sem comentários exceto WHY não-óbvio
- Build `npm run build` em `frontend/` deve passar sem erros antes de cada commit
- Arquivos de componente: target < 200 linhas
- Código em `frontend/src/input/` (feature-first)
- Backend em `backend/input_module/`

---

### Task 1: DataGrid gutter column width

**Files:**
- Modify: `frontend/src/input/data-grid.tsx` (linha ~216)

**Interfaces:**
- Consumes: nada de tarefas anteriores
- Produces: nada consumido por tarefas posteriores

- [ ] **Step 1: Adicionar prop `gutterColumn` em `DataSheetGrid`**

Em `data-grid.tsx`, no componente `DataSheetGrid` (linha ~216), adicionar `gutterColumn`:

```tsx
      <DataSheetGrid<NotaInput>
        key={remontar}
        value={ordenados}
        onChange={() => { /* read-only: todas as colunas disabled */ }}
        columns={cols}
        height={altura}
        rowHeight={ALTURA_LINHA}
        lockRows
        disableContextMenu
        onSelectionChange={aoSelecionar}
        gutterColumn={{ basis: 70, grow: 0 }}
      />
```

- [ ] **Step 2: Build + commit**

```bash
cd frontend && npm run build
```

Esperado: `✓ built` sem erros TS.

```bash
git add frontend/src/input/data-grid.tsx
git commit -m "fix(input): aumentar largura gutter column (70px) para números de 5 dígitos"
```

---

### Task 2: Backend `/me` + auto-identity no frontend

**Files:**
- Modify: `backend/input_module/routes.py`
- Modify: `frontend/src/input/api.ts`
- Modify: `frontend/src/input/input-section.tsx`

**Interfaces:**
- Consumes: nada
- Produces:
  - `InputApi.me(): Promise<{ usuario: string }>` — usado em `input-section.tsx`
  - `getUsuario()` em localStorage sempre preenchido após mount de `InputSection`

- [ ] **Step 1: Adicionar endpoint `GET /me` em `routes.py`**

Logo após a função `_garantir_banco` (linha ~31), antes do primeiro `@router.get`:

```python
@router.get("/me")
def quem_sou_eu():
    usuario = os.environ.get("USERNAME") or os.environ.get("USER") or "sistema"
    return {"usuario": usuario}
```

- [ ] **Step 2: Adicionar `me()` em `api.ts`**

Na linha 1 do bloco `export const InputApi = {`, adicionar antes de `dados`:

```ts
export const InputApi = {
  me: () => req<{ usuario: string }>('/me'),
  dados: () => req<InputDataset>('/notas'),
  // ... resto permanece igual
```

- [ ] **Step 3: Auto-init em `input-section.tsx`**

Adicionar imports `getUsuario`, `setUsuario` no import existente de `'./api'`:

```ts
import { useAvisoSincronizacao, useInputData, useRecarregarInput } from './use-input-data';
```

No início de `InputSection`, adicionar `useEffect` de init:

```tsx
import { getUsuario, setUsuario, InputApi } from './api';

// Dentro de InputSection, antes do return:
React.useEffect(() => {
  if (!getUsuario()) {
    InputApi.me()
      .then(({ usuario }) => setUsuario(usuario))
      .catch(() => setUsuario('sistema'));
  }
}, []);
```

O import de `React` já existe. Adicionar `getUsuario, setUsuario` ao import existente de `'./api'` que hoje é só `{ InputApi }` (linha 4 de input-section.tsx — verificar nome exato do import e ajustar).

- [ ] **Step 4: Build + commit**

```bash
cd frontend && npm run build
```

```bash
git add backend/input_module/routes.py frontend/src/input/api.ts frontend/src/input/input-section.tsx
git commit -m "feat(input): auto-identity via GET /me (USERNAME/USER env var)"
```

---

### Task 3: Deletar `IdentityModal` + limpar `acaoPendente` de `manage.tsx` e `ramal.tsx`

**Files:**
- Delete: `frontend/src/input/identity-modal.tsx`
- Modify: `frontend/src/input/manage.tsx`
- Modify: `frontend/src/input/ramal.tsx`

**Interfaces:**
- Consumes: Task 2 garantiu que `getUsuario()` sempre retorna valor após mount
- Produces: componentes sem modal, sem acaoPendente — escreve direto

**Padrão de remoção em ambos os arquivos:**
1. Remover `import { IdentityModal } from './identity-modal'`
2. Remover `getUsuario` do import de `'./api'`
3. Remover `const [acaoPendente, setAcaoPendente] = React.useState<(() => void) | null>(null)`
4. Remover `function comIdentidade(acao: () => void)` inteiro
5. Desempacotar cada `comIdentidade(...)`: `const fn = (): void => comIdentidade(() => { body });` → `const fn = (): void => { body };`
6. Remover `<IdentityModal aberto={...} .../>` do JSX

- [ ] **Step 1: Deletar `identity-modal.tsx`**

```bash
rm frontend/src/input/identity-modal.tsx
```

- [ ] **Step 2: Limpar `manage.tsx`**

Linha 3 — remover `getUsuario` do import:
```ts
// ANTES
import { getUsuario, InputApi } from './api';
// DEPOIS
import { InputApi } from './api';
```

Linha 11 — remover import IdentityModal:
```ts
// REMOVER LINHA:
import { IdentityModal } from './identity-modal';
```

Linha 48 — remover state:
```ts
// REMOVER LINHA:
const [acaoPendente, setAcaoPendente] = React.useState<(() => void) | null>(null);
```

Linhas 60-63 — remover função `comIdentidade` inteira:
```ts
// REMOVER BLOCO:
function comIdentidade(acao: () => void): void {
  if (getUsuario()) acao();
  else setAcaoPendente(() => acao);
}
```

Desempacotar cada função que usava `comIdentidade`:
```ts
// ANTES
const salvarRapida = (): void => comIdentidade(() => {
  void executar(`${edicoes.size} nota(s) atualizada(s).`, async () => {
    const linhas = [...edicoes.entries()].map(([n, campos]) => ({ Numero_Nota: n, ...campos }));
    await InputApi.editar(linhas);
    setEdicoes(new Map());
  });
});
// DEPOIS
const salvarRapida = (): void => {
  void executar(`${edicoes.size} nota(s) atualizada(s).`, async () => {
    const linhas = [...edicoes.entries()].map(([n, campos]) => ({ Numero_Nota: n, ...campos }));
    await InputApi.editar(linhas);
    setEdicoes(new Map());
  });
};
```

Aplicar o mesmo padrão para: `aplicarLote`, `excluirSelecionadas`, `desfazer`, `cadastrar`, `salvarColagem`.

Remover `<IdentityModal ...>` do JSX (linhas 345-347):
```tsx
// REMOVER BLOCO:
<IdentityModal aberto={acaoPendente !== null}
               onConfirmado={() => { const acao = acaoPendente; setAcaoPendente(null); acao?.(); }}
               onCancelar={() => setAcaoPendente(null)} />
```

- [ ] **Step 3: Limpar `ramal.tsx`**

Mesmo padrão do Step 2. Diferenças específicas:

Linha 3 — `import { getUsuario, InputApi }` → `import { InputApi }`
Linha 10 — remover `import { IdentityModal } from './identity-modal'`
Linha 52 — remover `const [acaoPendente, setAcaoPendente] = ...`
Linhas 69-72 — remover `function comIdentidade`

Desempacotar: `salvarRapida`, `aplicarLote`, `excluirSelecionadas`, `cadastrar`, `salvarColagem`, `vincularHierarquia` (a função de ramal, não a de overview).

O estado de hierarquia (`maeSelecionada`, `filhasSelecionadas`, etc.) permanece por ora — será removido na Task 6.

Remover `<IdentityModal ...>` do JSX (linhas 455-457 de ramal.tsx).

- [ ] **Step 4: Build + commit**

```bash
cd frontend && npm run build
```

Esperado: zero erros TS. Se algum erro de import não resolvido, corrigir.

```bash
git add frontend/src/input/identity-modal.tsx frontend/src/input/manage.tsx frontend/src/input/ramal.tsx
git commit -m "refactor(input): deletar IdentityModal, auto-identity via localStorage"
```

---

### Task 4: Mover `varrerVinculos` para `lib.ts`

**Files:**
- Modify: `frontend/src/input/lib.ts`
- Modify: `frontend/src/input/overview.tsx`

**Interfaces:**
- Consumes: nada de tarefas anteriores
- Produces:
  - `export interface SugestaoDetetive { Nota_Filha_Orfa: number; Possivel_Nota_Mae: string; }` em `lib.ts`
  - `export function varrerVinculos(registros: NotaInput[]): SugestaoDetetive[]` em `lib.ts`

- [ ] **Step 1: Adicionar ao final de `lib.ts`**

```ts
export interface SugestaoDetetive {
  Nota_Filha_Orfa: number;
  Possivel_Nota_Mae: string;
}

const PALAVRAS_PROIBIDAS = ['SUBSTITUIDA', 'SUBSTITUÍDA', 'SUBST.', 'SUBST ', 'CANCELADA'];

export function varrerVinculos(registros: NotaInput[]): SugestaoDetetive[] {
  const dictConj: Record<string, string> = {};
  for (const r of registros) {
    dictConj[String(r.Numero_Nota)] = String(r['Conjunto'] ?? '').trim().toUpperCase();
  }
  const orfas = registros.filter((r) => {
    const mae = String(r['Nota_Mae'] ?? '-').trim();
    return (mae === '-' || mae === '' || mae === 'None') && Number(r['Planejado_DDPM']) === 0;
  });
  const seen = new Set<number>();
  const sugestoes: SugestaoDetetive[] = [];
  for (const row of orfas) {
    const texto = `${String(row['Status_Obra'] ?? '')} ${String(row['Observacao'] ?? '')}`.toUpperCase();
    if (PALAVRAS_PROIBIDAS.some((p) => texto.includes(p))) continue;
    const nums = [...texto.matchAll(/\b\d{6,9}\b/g)].map((m) => m[0]);
    const conjOrfa = String(row['Conjunto'] ?? '').trim().toUpperCase();
    for (const num of nums) {
      if (num in dictConj && num !== String(row.Numero_Nota) && dictConj[num] === conjOrfa) {
        if (!seen.has(row.Numero_Nota)) {
          seen.add(row.Numero_Nota);
          sugestoes.push({ Nota_Filha_Orfa: row.Numero_Nota, Possivel_Nota_Mae: num });
        }
        break;
      }
    }
  }
  return sugestoes;
}
```

- [ ] **Step 2: Atualizar `overview.tsx` — remover definições locais, importar de lib**

Remover de `overview.tsx`:
- `interface SugestaoDetetive { ... }` (linhas 14-17)
- `const PALAVRAS_PROIBIDAS = [...]` (linha 19)
- `function varrerVinculos(...)` (linhas 21-48)

Adicionar ao import existente de `'./lib'`:
```ts
// ANTES
import { aplicarFiltros, parseBuscaGlobal } from './lib';
// DEPOIS
import { aplicarFiltros, parseBuscaGlobal, varrerVinculos } from './lib';
```

(O tipo `SugestaoDetetive` será usado em `use-auto-vinculos.ts`, não mais em `overview.tsx` diretamente.)

- [ ] **Step 3: Build + commit**

```bash
cd frontend && npm run build
```

```bash
git add frontend/src/input/lib.ts frontend/src/input/overview.tsx
git commit -m "refactor(input): mover varrerVinculos para lib.ts"
```

---

### Task 5: Hook `use-auto-vinculos.ts`

**Files:**
- Create: `frontend/src/input/use-auto-vinculos.ts`

**Interfaces:**
- Consumes:
  - `varrerVinculos(registros: NotaInput[]): SugestaoDetetive[]` de `'./lib'`
  - `InputApi.vincularHierarquia(dados: Record<string, number[]>): Promise<{ atualizadas: number }>` de `'./api'`
  - `useQueryClient` de `'@tanstack/react-query'`
- Produces:
  - `export interface VinculoStatus { atualizadas: number; hora: string; }`
  - `export function useAutoVinculos(registros: NotaInput[]): { status: VinculoStatus | null }`

**Lógica anti-loop:** após aplicar vínculos, a query recarrega → `registros` tem nova referência → effect dispara novamente → `varrerVinculos` encontra 0 (órfãs agora têm `Nota_Mae` preenchida) → `setStatus(prev => prev ?? ...)` não sobrescreve → sem chamada API → loop para.

- [ ] **Step 1: Criar `use-auto-vinculos.ts`**

```ts
import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { NotaInput } from './types';
import { InputApi } from './api';
import { varrerVinculos } from './lib';

export interface VinculoStatus {
  atualizadas: number;
  hora: string;
}

export function useAutoVinculos(registros: NotaInput[]): { status: VinculoStatus | null } {
  const qc = useQueryClient();
  const [status, setStatus] = React.useState<VinculoStatus | null>(null);
  const rodandoRef = React.useRef(false);

  React.useEffect(() => {
    const sugestoes = varrerVinculos(registros);

    if (sugestoes.length === 0) {
      setStatus((prev) => prev ?? {
        atualizadas: 0,
        hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      });
      return;
    }

    if (rodandoRef.current) return;
    rodandoRef.current = true;

    const payload: Record<string, number[]> = {};
    for (const s of sugestoes) {
      if (!payload[s.Possivel_Nota_Mae]) payload[s.Possivel_Nota_Mae] = [];
      payload[s.Possivel_Nota_Mae].push(s.Nota_Filha_Orfa);
    }

    InputApi.vincularHierarquia(payload)
      .then(({ atualizadas }) => {
        const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        setStatus({ atualizadas, hora });
        if (atualizadas > 0) {
          toast.success(`${atualizadas} vínculo(s) Nota_Mae aplicados automaticamente`);
          void qc.invalidateQueries({ queryKey: ['input-dados'] });
        }
      })
      .catch(() => { /* backend fora: o erro principal já aparece na sessão */ })
      .finally(() => { rodandoRef.current = false; });
  }, [registros, qc]);

  return { status };
}
```

- [ ] **Step 2: Build + commit**

```bash
cd frontend && npm run build
```

```bash
git add frontend/src/input/use-auto-vinculos.ts
git commit -m "feat(input): hook useAutoVinculos — aplica Nota_Mae automaticamente ao carregar dados"
```

---

### Task 6: `hierarquia-card.tsx` — componente de hierarquia manual

**Files:**
- Create: `frontend/src/input/hierarquia-card.tsx`

**Interfaces:**
- Consumes:
  - `InputApi.obterHierarquia(numero: number): Promise<HierarquiaInfo>` de `'./api'`
  - `InputApi.vincularHierarquia(dados: Record<string, number[]>): Promise<{ atualizadas: number }>` de `'./api'`
  - `HierarquiaInfo` de `'./types'`
  - `NotaInput` de `'./types'`
- Produces:
  - `export function HierarquiaCard({ registros, recarregar }: HierarquiaCardProps): React.JSX.Element`

**Lógica de candidatas:** notas com `Nota_Mae === '-'|''|'None'` E `Planejado_DDPM === 0` E mesmo `Conjunto` da nota mãe buscada.

- [ ] **Step 1: Criar `hierarquia-card.tsx`**

```tsx
import React from 'react';
import type { HierarquiaInfo, NotaInput } from './types';
import { InputApi } from './api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface HierarquiaCardProps {
  registros: NotaInput[];
  recarregar: () => Promise<void>;
}

export function HierarquiaCard({ registros, recarregar }: HierarquiaCardProps): React.JSX.Element {
  const [maeInput, setMaeInput] = React.useState('');
  const [hierarquia, setHierarquia] = React.useState<HierarquiaInfo | null>(null);
  const [buscando, setBuscando] = React.useState(false);
  const [filhasSelecionadas, setFilhasSelecionadas] = React.useState<Set<number>>(new Set());
  const [vinculando, setVinculando] = React.useState(false);

  const candidatas = React.useMemo(() => {
    if (!hierarquia) return [];
    const maenota = registros.find((r) => r.Numero_Nota === Number(maeInput));
    if (!maenota) return [];
    const conjMae = String(maenota['Conjunto'] ?? '').trim().toUpperCase();
    return registros.filter((r) => {
      const mae = String(r['Nota_Mae'] ?? '-').trim();
      return (mae === '-' || mae === '' || mae === 'None')
        && Number(r['Planejado_DDPM']) === 0
        && String(r['Conjunto'] ?? '').trim().toUpperCase() === conjMae
        && r.Numero_Nota !== Number(maeInput);
    });
  }, [registros, hierarquia, maeInput]);

  async function buscar(): Promise<void> {
    const n = Number(maeInput.trim());
    if (!n) return;
    setBuscando(true);
    try {
      setHierarquia(await InputApi.obterHierarquia(n));
      setFilhasSelecionadas(new Set());
    } catch (e) {
      toast.error('Nota não encontrada', { description: e instanceof Error ? e.message : String(e) });
      setHierarquia(null);
    } finally {
      setBuscando(false);
    }
  }

  async function vincular(): Promise<void> {
    if (filhasSelecionadas.size === 0) return;
    setVinculando(true);
    try {
      const { atualizadas } = await InputApi.vincularHierarquia({
        [maeInput]: [...filhasSelecionadas],
      });
      toast.success(`${atualizadas} vínculo(s) aplicado(s).`);
      setFilhasSelecionadas(new Set());
      await recarregar();
      setHierarquia(await InputApi.obterHierarquia(Number(maeInput)));
    } catch (e) {
      toast.error('Falha ao vincular', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setVinculando(false);
    }
  }

  function toggleFilha(numero: number): void {
    setFilhasSelecionadas((prev) => {
      const s = new Set(prev);
      if (s.has(numero)) s.delete(numero); else s.add(numero);
      return s;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle style={{ fontSize: 14 }}>🔗 Hierarquia Manual</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Label>Nota Mãe</Label>
            <Input value={maeInput} placeholder="ex: 100123456"
                   onChange={(e) => setMaeInput(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') void buscar(); }}
                   style={{ width: 180 }} />
          </div>
          <Button size="sm" variant="outline" disabled={buscando || !maeInput.trim()}
                  onClick={() => void buscar()}>
            {buscando ? 'Buscando…' : 'Buscar'}
          </Button>
        </div>

        {hierarquia && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {hierarquia.filhas.length > 0 && (
              <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: 0 }}>
                Filhas atuais: {hierarquia.filhas.map((f) => f.Numero_Nota).join(', ')}
              </p>
            )}
            {candidatas.length > 0 ? (
              <React.Fragment>
                <span style={{ fontSize: 12.5 }}>
                  {candidatas.length} candidata(s) — mesmo conjunto, órfãs:
                </span>
                <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {candidatas.map((r) => (
                    <label key={r.Numero_Nota}
                           style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, cursor: 'pointer' }}>
                      <input type="checkbox" checked={filhasSelecionadas.has(r.Numero_Nota)}
                             onChange={() => toggleFilha(r.Numero_Nota)} />
                      <span className="edp-mono">{r.Numero_Nota}</span>
                      <span style={{ color: 'var(--text-dim)' }}>
                        {String(r['Status_Nota'] ?? '-')} · {String(r['Conjunto'] ?? '-')}
                      </span>
                    </label>
                  ))}
                </div>
                <div>
                  <Button size="sm" disabled={vinculando || filhasSelecionadas.size === 0}
                          onClick={() => void vincular()}>
                    🔗 Vincular selecionadas ({filhasSelecionadas.size})
                  </Button>
                </div>
              </React.Fragment>
            ) : (
              <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: 0 }}>
                Nenhuma nota órfã candidata no mesmo conjunto.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
cd frontend && npm run build
```

```bash
git add frontend/src/input/hierarquia-card.tsx
git commit -m "feat(input): HierarquiaCard — vincular hierarquia manual na Visão Geral"
```

---

### Task 7: `overview.tsx` — integrar auto-vinculos + HierarquiaCard, limpar estado antigo

**Files:**
- Modify: `frontend/src/input/overview.tsx`

**Interfaces:**
- Consumes:
  - `useAutoVinculos(registros: NotaInput[]): { status: VinculoStatus | null }` de `'./use-auto-vinculos'`
  - `VinculoStatus` de `'./use-auto-vinculos'`
  - `HierarquiaCard` de `'./hierarquia-card'`
  - `useRecarregarInput` de `'./use-input-data'`
- Produces: nada (leaf component)

**O que remover de `overview.tsx`:**
- `import { getUsuario, InputApi, ... }` → remover `getUsuario` do import de `'./api'`
- `import { IdentityModal } from './identity-modal'` — remover
- `import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'` — manter (usado pelo card de hierarquia? não — HierarquiaCard tem seus próprios imports. Remover se não for mais usado)
- `import { Textarea } from '@/components/ui/textarea'` — remover (não usado após remoção do detetive UI)
- States a remover: `sugestoes`, `rodando`, `aplicando`, `acaoPendente`
- Funções a remover: `iniciarDetetive`, `aplicarSugestoes`
- JSX a remover: Card detetive inteiro (linhas 129-178), `<IdentityModal>` (linhas 180-183)

**O que adicionar:**
- Import `useAutoVinculos`, `VinculoStatus` de `'./use-auto-vinculos'`
- Import `HierarquiaCard` de `'./hierarquia-card'`
- Import `useRecarregarInput` de `'./use-input-data'`
- State: nenhum novo (hook cuida disso)
- No corpo: `const { status: vinculoStatus } = useAutoVinculos(dados.registros);`
- No corpo: `const recarregar = useRecarregarInput();`
- No JSX: status line + `<HierarquiaCard>`

- [ ] **Step 1: Reescrever `overview.tsx`**

Substituir o arquivo completo pelo conteúdo abaixo:

```tsx
import React from 'react';
import type { InputDataset, NotaInput } from './types';
import { InputApi, baixarBlob } from './api';
import { toast } from 'sonner';
import { aplicarFiltros, parseBuscaGlobal } from './lib';
import { COLUNAS } from './columns';
import { Filters, FILTROS_INICIAIS, type FiltersState } from './filters';
import { DataGrid } from './data-grid';
import { HierarquiaCard } from './hierarquia-card';
import { useRecarregarInput } from './use-input-data';
import { useAutoVinculos } from './use-auto-vinculos';
import { Button } from '@/components/ui/button';

export function filtrarRegistros(registros: NotaInput[], estado: FiltersState): NotaInput[] {
  let resultado = registros;
  const numeros = parseBuscaGlobal(estado.busca);
  if (estado.busca.trim() !== '') {
    resultado = numeros.length ? resultado.filter((r) => numeros.includes(r.Numero_Nota)) : [];
  }
  return aplicarFiltros(resultado, estado.filtros);
}

export function Overview({ dados }: { dados: InputDataset }): React.JSX.Element {
  const [estado, setEstado] = React.useState<FiltersState>(FILTROS_INICIAIS);
  const [exportando, setExportando] = React.useState(false);
  const recarregar = useRecarregarInput();
  const { status: vinculoStatus } = useAutoVinculos(dados.registros);
  const filtrados = React.useMemo(
    () => filtrarRegistros(dados.registros, estado), [dados.registros, estado]);

  async function exportar(): Promise<void> {
    setExportando(true);
    try {
      const blob = await InputApi.exportar(
        filtrados.map((r) => r.Numero_Nota), COLUNAS.map((c) => c.key));
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
      baixarBlob(blob, `export_notas_${stamp}.xlsx`);
      toast.success('Exportação concluída');
    } catch (e) {
      toast.error('Falha na exportação', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setExportando(false);
    }
  }

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: 18, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
          Total de registros: <strong className="edp-mono">{filtrados.length}</strong>
          {filtrados.length !== dados.registros.length ? ` de ${dados.registros.length}` : ''}
        </span>
        <Button variant="outline" size="sm" disabled={exportando || filtrados.length === 0}
                onClick={() => { void exportar(); }}>
          {exportando ? 'Gerando…' : '⬇ Exportar Excel'}
        </Button>
      </div>

      <Filters registros={dados.registros} estado={estado} setEstado={setEstado} />
      <DataGrid registros={filtrados} colunas={COLUNAS} />

      <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '2px 0' }}>
        {vinculoStatus === null
          ? 'Verificando vínculos Nota_Mae…'
          : vinculoStatus.atualizadas > 0
            ? `🔗 ${vinculoStatus.atualizadas} vínculo(s) Nota_Mae aplicados às ${vinculoStatus.hora}`
            : `✓ Nenhum vínculo Nota_Mae pendente (verificado às ${vinculoStatus.hora})`}
      </div>

      <HierarquiaCard registros={dados.registros} recarregar={recarregar} />
    </div>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
cd frontend && npm run build
```

Esperado: zero erros. Se `Card`/`Textarea`/`IdentityModal` ainda importados em algum lugar que quebraram, corrigir.

```bash
git add frontend/src/input/overview.tsx
git commit -m "feat(input): detetive automático + hierarquia manual na Visão Geral"
```

---

### Task 8: `ramal.tsx` — remover modo hierarquia

**Files:**
- Modify: `frontend/src/input/ramal.tsx`

**Interfaces:**
- Consumes: nada de tarefas anteriores
- Produces: `ModoRamal` sem `'hierarquia'`; ramal com 6 modos

- [ ] **Step 1: Remover hierarquia de `ramal.tsx`**

Linha 21 — remover `'hierarquia'` do tipo:
```ts
// ANTES
type ModoRamal = 'visao' | 'rapida' | 'lote' | 'exclusao' | 'cadastro' | 'colagem' | 'hierarquia';
// DEPOIS
type ModoRamal = 'visao' | 'rapida' | 'lote' | 'exclusao' | 'cadastro' | 'colagem';
```

Linhas 23-31 — remover `{ id: 'hierarquia', rotulo: 'Hierarquia' }` do array `MODOS`:
```ts
const MODOS: { id: ModoRamal; rotulo: string }[] = [
  { id: 'visao',    rotulo: 'Visão Geral' },
  { id: 'rapida',   rotulo: 'Edição Rápida' },
  { id: 'lote',     rotulo: 'Edição em Lote' },
  { id: 'exclusao', rotulo: 'Exclusão' },
  { id: 'cadastro', rotulo: 'Cadastrar Nota' },
  { id: 'colagem',  rotulo: 'Colar Planilha' },
];
```

Remover estados de hierarquia:
```ts
// REMOVER:
const [maeSelecionada, setMaeSelecionada] = React.useState('');
const [filhasSelecionadas, setFilhasSelecionadas] = React.useState<Set<number>>(new Set());
```

Remover funções de hierarquia:
```ts
// REMOVER:
function toggleFilha(numero: number): void { ... }
function toggleTodasFilhas(numeros: number[], marcar: boolean): void { ... }
const vincularHierarquia = (): void => { ... }; // a função de ramal.tsx
```

Remover do `trocarModo`:
```ts
// ANTES
function trocarModo(m: ModoRamal): void {
  setModo(m); setMsg(null); setSelecionados(new Set()); setEdicoes(new Map());
}
// DEPOIS — igual, só ModoRamal mudou de tipo (automático)
```

Remover bloco JSX `{/* HIERARQUIA */}` inteiro (linhas 414-453).

- [ ] **Step 2: Build + commit**

```bash
cd frontend && npm run build
```

```bash
git add frontend/src/input/ramal.tsx
git commit -m "refactor(input): remover modo hierarquia de ramal (cabo físico, sem relação mãe/filha)"
```

---

## Self-Review

**Spec coverage:**
- ✓ Gutter column: Task 1
- ✓ Backend /me: Task 2
- ✓ Auto-init identidade: Task 2
- ✓ Deletar IdentityModal: Task 3
- ✓ Limpar acaoPendente manage + ramal: Task 3
- ✓ varrerVinculos → lib.ts: Task 4
- ✓ useAutoVinculos hook: Task 5
- ✓ Status line opção C (toast + linha permanente): Task 5 + Task 7
- ✓ HierarquiaCard novo: Task 6
- ✓ Hierarquia na Visão Geral: Task 7
- ✓ Ramal sem hierarquia: Task 8

**Placeholder scan:** Nenhum TBD. Todo código completo.

**Type consistency:**
- `VinculoStatus` definido em Task 5, consumido em Task 7 via import
- `HierarquiaCardProps` definido e consumido em Task 6
- `varrerVinculos` exportado em Task 4, importado em Task 5
- `SugestaoDetetive` exportado em Task 4, consumido em Task 5
- `recarregar: () => Promise<void>` — `useRecarregarInput()` retorna exatamente esse tipo
