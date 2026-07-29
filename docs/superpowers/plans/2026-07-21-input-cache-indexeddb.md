# Cache persistente do Input em IndexedDB (Dexie) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grade do Input aparece instantânea ao abrir o app, hidratada de um snapshot IndexedDB, com revalidação em background (stale-while-revalidate).

**Architecture:** Tabela Dexie `snapshots` (uma linha por dataset: `input-dados`, `ramal-dados`). O seed usa `queryClient.setQueryData(KEY, dados, { updatedAt: antigo })` para o próprio React Query disparar a revalidação; a escrita do snapshot acontece dentro do `queryFn` após cada resposta boa. Cache é somente leitura e best-effort: qualquer falha de IndexedDB degrada para o fluxo atual.

**Tech Stack:** React 18, TypeScript, @tanstack/react-query v5, Dexie.js (nova dependência).

**Spec:** `docs/superpowers/specs/2026-07-21-input-cache-indexeddb-design.md`

## Global Constraints

- IndexedDB SEMPRE via Dexie.js — nunca a API nativa crua (regra do projeto).
- `any` proibido; usar `unknown` + narrowing (CLAUDE.md).
- Sem novos frameworks de teste no frontend — validação por `npm run build` (tsc) + roteiro manual da spec.
- O working tree contém outra feature não commitada. **Cada commit adiciona APENAS os arquivos listados na task** (`git add` com caminhos explícitos, nunca `git add -A`).
- Comentários só para restrições que o código não mostra (ex.: por que engolir erro de IndexedDB é correto aqui).
- Textos de UI em pt-BR, tokens de design existentes (nada de cor arbitrária).

---

### Task 1: Camada de cache Dexie (`cache.ts`)

**Files:**
- Modify: `frontend/package.json` (via `npm install dexie`)
- Create: `frontend/src/features/input/cache.ts`

**Interfaces:**
- Consumes: nada do projeto (só Dexie e tipos TS).
- Produces (Tasks 2 e 3 dependem):
  - `SNAPSHOT_INPUT = 'input-dados'`, `SNAPSHOT_RAMAL = 'ramal-dados'` (constantes string)
  - `lerSnapshot(chave: string): Promise<Snapshot | null>`
  - `gravarSnapshot(chave: string, versao: string | null, dados: unknown): Promise<void>`
  - `interface Snapshot { chave: string; versao: string | null; salvoEm: string; dados: unknown }`

- [ ] **Step 1: Instalar a dependência**

Run (em `frontend/`): `npm install dexie`
Expected: `dexie` adicionado a `dependencies` no `package.json` (± "^4.x").

- [ ] **Step 2: Criar `frontend/src/features/input/cache.ts`**

```ts
import Dexie, { type Table } from 'dexie';

export const SNAPSHOT_INPUT = 'input-dados';
export const SNAPSHOT_RAMAL = 'ramal-dados';

export interface Snapshot {
  chave: string;
  versao: string | null;
  salvoEm: string; // Date.toISOString()
  dados: unknown;
}

class EdpVerifyCache extends Dexie {
  snapshots!: Table<Snapshot, string>;

  constructor() {
    super('edp-verify');
    this.version(1).stores({ snapshots: 'chave' });
  }
}

const db = new EdpVerifyCache();

/** Cache é camada opcional: IndexedDB indisponível (modo privado, quota,
 *  browser antigo) equivale a cache vazio — nunca propaga erro pro fluxo
 *  principal, que degrada para o fetch direto. */
export async function lerSnapshot(chave: string): Promise<Snapshot | null> {
  try {
    const snap = await db.snapshots.get(chave);
    if (!snap || typeof snap.salvoEm !== 'string' || snap.dados === undefined) {
      if (snap) await db.snapshots.delete(chave); // estrutura antiga: descarta
      return null;
    }
    return snap;
  } catch {
    return null;
  }
}

export async function gravarSnapshot(
  chave: string,
  versao: string | null,
  dados: unknown,
): Promise<void> {
  try {
    await db.snapshots.put({ chave, versao, salvoEm: new Date().toISOString(), dados });
  } catch { /* mesma regra do lerSnapshot: cache é best-effort */ }
}
```

- [ ] **Step 3: Verificar tipos**

Run (em `frontend/`): `npx tsc -b`
Expected: sem erros.

- [ ] **Step 4: Commit (apenas os arquivos da task)**

ATENÇÃO: `package.json`/`package-lock.json` já contêm o `recharts` não
commitado da feature de Relatórios. Antes deste commit, confirme com o
usuário se a feature anterior deve ser commitada primeiro (preferível);
se ele optar por seguir assim mesmo, este commit carrega as linhas do
recharts junto — registre isso na mensagem.

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/features/input/cache.ts
git commit -m "feat(input): camada de cache Dexie para snapshots do dataset"
```

---

### Task 2: Seed + escrita no `useInputData`

**Files:**
- Modify: `frontend/src/features/input/use-input-data.ts`

**Interfaces:**
- Consumes (Task 1): `lerSnapshot`, `gravarSnapshot`, `SNAPSHOT_INPUT`, `Snapshot`.
- Produces (Task 4 depende): `useInputData()` passa a retornar
  `{ ...UseQueryResult<InputDataset>, snapshotSalvoEm: string | null }` —
  os campos atuais (`data`, `isLoading`, `error`…) continuam existindo;
  `snapshotSalvoEm` é o `salvoEm` do snapshot usado no seed (null se não houve seed).

- [ ] **Step 1: Reescrever o topo de `use-input-data.ts`**

Substituir as linhas 1–15 atuais (imports, `INPUT_DADOS_KEY`, `useInputData`) por:

```ts
import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { InputApi } from './api';
import { gravarSnapshot, lerSnapshot, SNAPSHOT_INPUT } from './cache';
import type { InputDataset } from './types';

export const INPUT_DADOS_KEY = ['input-dados'] as const;

async function buscarEGravar(): Promise<InputDataset> {
  const dataset = await InputApi.dados();
  await gravarSnapshot(SNAPSHOT_INPUT, dataset.meta.versao, dataset);
  return dataset;
}

export function useInputData() {
  const qc = useQueryClient();
  const [snapshotSalvoEm, setSnapshotSalvoEm] = React.useState<string | null>(null);

  // Seed do IndexedDB: só se a query ainda não tem dado (rede pode ter
  // chegado antes). updatedAt antigo marca o seed como stale, então o
  // próprio React Query dispara a revalidação — sem estado manual.
  React.useEffect(() => {
    let cancelado = false;
    void lerSnapshot(SNAPSHOT_INPUT).then((snap) => {
      if (cancelado || !snap) return;
      if (qc.getQueryData(INPUT_DADOS_KEY) === undefined) {
        qc.setQueryData(INPUT_DADOS_KEY, snap.dados as InputDataset,
                        { updatedAt: Date.parse(snap.salvoEm) });
      }
      setSnapshotSalvoEm(snap.salvoEm);
    });
    return () => { cancelado = true; };
  }, [qc]);

  const query = useQuery({
    queryKey: INPUT_DADOS_KEY,
    queryFn: buscarEGravar,
    staleTime: 300_000,
    retry: 1,
  });
  return { ...query, snapshotSalvoEm };
}
```

As demais funções do arquivo (`useRecarregarInput`, `useSincronizacaoAutomatica`, `useNetworkSync`) ficam intocadas.

- [ ] **Step 2: Verificar tipos**

Run (em `frontend/`): `npx tsc -b`
Expected: sem erros (os call sites desestruturam campos que continuam existindo).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/input/use-input-data.ts
git commit -m "feat(input): seed do dataset via snapshot IndexedDB com revalidacao"
```

---

### Task 3: Mesma mecânica no `useRamalData`

**Files:**
- Modify: `frontend/src/features/input/use-ramal-data.ts`

**Interfaces:**
- Consumes (Task 1): `lerSnapshot`, `gravarSnapshot`, `SNAPSHOT_RAMAL`.
- Produces: `useRamalData()` mantém o retorno atual (`UseQueryResult<RamalDataset>`) — ramal não expõe `salvoEm` (o banner offline da Task 4 cobre a seção inteira).

- [ ] **Step 1: Reescrever `use-ramal-data.ts`**

Conteúdo completo do arquivo:

```ts
import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { InputApi } from './api';
import { gravarSnapshot, lerSnapshot, SNAPSHOT_RAMAL } from './cache';
import type { RamalDataset } from './types';

export const RAMAL_KEY = ['input', 'ramal'] as const;

async function buscarEGravar(): Promise<RamalDataset> {
  const dataset = await InputApi.ramal();
  // ramal não tem meta/versao própria: snapshot leva versao null
  await gravarSnapshot(SNAPSHOT_RAMAL, null, dataset);
  return dataset;
}

export function useRamalData() {
  const qc = useQueryClient();

  React.useEffect(() => {
    let cancelado = false;
    void lerSnapshot(SNAPSHOT_RAMAL).then((snap) => {
      if (cancelado || !snap) return;
      if (qc.getQueryData(RAMAL_KEY) === undefined) {
        qc.setQueryData(RAMAL_KEY, snap.dados as RamalDataset,
                        { updatedAt: Date.parse(snap.salvoEm) });
      }
    });
    return () => { cancelado = true; };
  }, [qc]);

  return useQuery({ queryKey: RAMAL_KEY, queryFn: buscarEGravar, staleTime: 300_000 });
}

export function useRecarregarRamal(): () => Promise<void> {
  const qc = useQueryClient();
  return React.useCallback(async () => {
    await qc.invalidateQueries({ queryKey: RAMAL_KEY });
  }, [qc]);
}
```

- [ ] **Step 2: Verificar tipos**

Run (em `frontend/`): `npx tsc -b`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/input/use-ramal-data.ts
git commit -m "feat(input): snapshot IndexedDB tambem para o dataset do ramal"
```

---

### Task 4: Banner offline no `input-section.tsx`

**Files:**
- Modify: `frontend/src/features/input/input-section.tsx:25` (desestruturação) e `:115-119` (bloco de erro)

**Interfaces:**
- Consumes (Task 2): `snapshotSalvoEm` no retorno de `useInputData()`.
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Incluir `snapshotSalvoEm` na desestruturação (linha 25)**

```tsx
const { data: dados, isLoading, error, snapshotSalvoEm } = useInputData();
```

- [ ] **Step 2: Trocar o bloco de erro (linhas 115-119)**

Hoje o erro aparece mesmo com `dados` presente; com o seed isso mostraria
erro + grade juntos. Substituir por: erro bloqueante SÓ sem dados; com
dados de cache + erro, banner discreto.

```tsx
{error != null && !dados && (
  <div className="p-[24px] text-red">
    Backend indisponível. O módulo Input exige o backend rodando (porta 8000). Detalhe: {String((error as Error).message)}
  </div>
)}
{error != null && dados && (
  <div className="py-[6px] px-[18px] text-[12px] text-amber">
    Backend indisponível — mostrando dados salvos
    {snapshotSalvoEm ? ` de ${new Date(snapshotSalvoEm).toLocaleString('pt-BR')}` : ''}.
  </div>
)}
```

- [ ] **Step 3: Verificar tipos e build**

Run (em `frontend/`): `npm run build`
Expected: build limpo.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/input/input-section.tsx
git commit -m "feat(input): banner de dados salvos quando backend esta fora"
```

---

### Task 5: Documentação + validação final

**Files:**
- Modify: `docs/dev/03-frontend-input.md` (tabela de arquivos + fluxo de dados)

**Interfaces:**
- Consumes: nada; descreve as Tasks 1–4.

- [ ] **Step 1: Documentar em `docs/dev/03-frontend-input.md`**

Na tabela de arquivos da feature, adicionar a linha:

```markdown
| `frontend/src/features/input/cache.ts` | Snapshots do dataset em IndexedDB via Dexie (tabela `snapshots`, uma linha por dataset: `input-dados`, `ramal-dados`). Best-effort: falha de IndexedDB equivale a cache vazio. |
```

Na seção que descreve `useInputData`/fluxo de dados, adicionar parágrafo:

```markdown
Os hooks `useInputData`/`useRamalData` hidratam o React Query com o
snapshot do IndexedDB no mount (`setQueryData` com `updatedAt` antigo —
o dado nasce stale e o próprio React Query revalida em background) e
regravam o snapshot a cada resposta boa da rede, dentro do `queryFn`.
Com backend fora e snapshot presente, `input-section.tsx` mostra a grade
com o banner "Backend indisponível — mostrando dados salvos de {data}"
em vez do erro bloqueante. Cache é somente leitura; o poll de `/sync`
segue sendo o invalidador entre sessões.
```

- [ ] **Step 2: Build final**

Run (em `frontend/`): `npm run build`
Expected: build limpo.

- [ ] **Step 3: Roteiro manual (validação da spec)**

1. Backend no ar: abrir o app, aba Input carrega → DevTools > Application > IndexedDB > `edp-verify` > `snapshots` tem `input-dados`.
2. F5 → grade aparece instantânea (antes do fetch terminar) e revalida.
3. Derrubar o backend, F5 → grade renderiza com banner âmbar de dados salvos.
4. Subir o backend, editar uma nota → snapshot regravado (campo `salvoEm` muda).
5. Janela anônima (IndexedDB restrito) → comportamento atual, sem erro no console.

- [ ] **Step 4: Commit**

```bash
git add docs/dev/03-frontend-input.md
git commit -m "docs(dev): cache IndexedDB do Input (Dexie) no manual"
```
