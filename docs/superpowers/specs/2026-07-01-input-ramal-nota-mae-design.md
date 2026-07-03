# Input — Aba Ramal + Nota_Mae na Visão Geral — Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adicionar aba Ramal ao módulo Input (CRUD completo + hierarquia) e expor o campo Nota_Mae no Overview.

**Architecture:** Feature-first dentro de `frontend/src/input/`. Ramal tab espelha Manage (7 modos). DataGrid para leitura, NotesTable para edição/seleção. Hierarquia via POST /api/input/hierarquia.

**Tech Stack:** React 18, TypeScript, react-datasheet-grid, React Query, Sonner, Tailwind v4, Radix UI.

---

## Global Constraints

- Nunca editar `src/components/ui/` (vendored)
- Nunca usar `any` — `unknown` ou tipos próprios
- Seguir padrão feature-first: tudo em `frontend/src/input/`
- Reutilizar `DataGrid`, `NotesTable`, `Filters`, `IdentityModal` sem modificar
- `Nota_Mae` gerenciada EXCLUSIVAMENTE via `/api/input/hierarquia` — nunca via salvar_em_massa

---

## Parte 1 — Nota_Mae na Visão Geral

### Mudança

`columns.ts`: adicionar após `Medida_vs_Planejado`:

```ts
{ key: 'Nota_Mae', label: 'Nota Mãe', numeric: true }
```

Backend já retorna `Nota_Mae` em `GET /api/input/notas`. Campo aparece automaticamente no DataGrid do Overview e nos filtros de faixa (`FILTROS_FAIXA`).

Adicionar `'Nota_Mae'` a `FILTROS_FAIXA` em `columns.ts`.

---

## Parte 2 — Aba Ramal

### Novos arquivos

#### `types.ts` — adições

```ts
export interface NotaRamal {
  Numero_Nota: number;
  Status_Obra: string;
  Conjunto: string;
  Circuito: string;
  Local_Instalacao: string;
  Planejado_DDPM: number;
  Mes_Execucao_Planejado: string;
  CenTrab_Respon: string;
  Prioridade_Nota: string;
  Observacao: string;
  Extracao_Antiga: string;
  Status_Nota: string;
  Status_Anterior: string;
  Check_Btzero: string;
  Plano: string;
  ID_Cronologia: number;
}

export interface RamalDataset {
  registros: NotaRamal[];
}

// AbaInput: adicionar 'ramal'
export type AbaInput = "visao" | "gerenciar" | "relatorios" | "logs" | "config" | "ramal";
```

#### `api.ts` — adições

```ts
ramal: () => req<RamalDataset>('/ramal'),
importarRamal: (notas: Partial<NotaRamal>[]) =>
  req<{ inseridas: number }>('/ramal/bulk', escrita('POST', { notas })),
excluirRamal: (numeros: number[]) =>
  req<{ excluidas: number }>('/ramal', escrita('DELETE', { numeros })),
vincularHierarquia: (dados: Record<string, number[]>) =>
  req<{ atualizadas: number }>('/hierarquia', escrita('POST', { dados })),
obterHierarquia: (numero: number) =>
  req<{ nota_mae: string; filhas: Array<{ Numero_Nota: number; Status_Nota: string; Conjunto: string }> }>(
    `/hierarquia/${numero}`),
```

#### `use-ramal-data.ts`

```ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { InputApi } from './api';

export const RAMAL_KEY = ['input', 'ramal'];

export function useRamalData() {
  return useQuery({ queryKey: RAMAL_KEY, queryFn: InputApi.ramal });
}

export function useRecarregarRamal() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: RAMAL_KEY });
}
```

#### `columns-ramal.ts`

ColunaDef[] com as 15 colunas de notas_ramal (excluindo ID_Cronologia):
- Numero_Nota (numeric, largura 110)
- Status_Nota (editavel, opcoes: 'status')
- Status_Obra (editavel)
- Conjunto (editavel)
- Circuito (editavel)
- Local_Instalacao (editavel, largura 170)
- Planejado_DDPM (numeric, editavel)
- Mes_Execucao_Planejado (editavel)
- CenTrab_Respon
- Prioridade_Nota (editavel, opcoes: 'prioridade')
- Observacao (editavel, largura 220)
- Extracao_Antiga
- Status_Anterior
- Check_Btzero (editavel)
- Plano (editavel)

#### `ramal.tsx` — componente principal

7 modos: `visao | rapida | lote | exclusao | cadastro | colagem | hierarquia`

**visao**: DataGrid com COLUNAS_RAMAL (igual ao Overview mas para notas_ramal)

**rapida**: NotesTable com edicoes + onEditar. Salva via `InputApi.importarRamal` (UPSERT).

**lote**: NotesTable com checkboxes. Campos editáveis em lote: Status_Nota, Prioridade_Nota, Mes_Execucao_Planejado. Salva via `InputApi.importarRamal`.

**exclusao**: NotesTable com checkboxes. Confirma e chama `InputApi.excluirRamal`.

**cadastro**: Form grid 3 colunas (mesmo padrão de Manage). Salva via `InputApi.importarRamal([nota])`.

**colagem**: Textarea TSV + preview NotesTable. Colunas de colagem ramal: Numero_Nota, Status_Nota, Prioridade_Nota, Planejado_DDPM, Status_Obra, Conjunto, Circuito, Local_Instalacao, Mes_Execucao_Planejado, Observacao, Check_Btzero, Plano. Salva via `InputApi.importarRamal`.

**hierarquia**: 
- Campo de texto para número da nota mãe
- Lista das notas ramal selecionáveis como filhas (com checkboxes)
- Botão "Vincular" → `InputApi.vincularHierarquia({ [mae]: [filhas] })`
- Badge mostrando nota mãe atual de cada filha selecionada (via obterHierarquia se necessário)

#### `input-section.tsx` — adição

```ts
{ id: 'ramal', rotulo: 'Ramal' }
```

Render: `{dados && sub === 'ramal' && <Ramal dadosPrincipais={dados} />}`

`Ramal` recebe `dadosPrincipais: InputDataset` para reutilizar `status_opcoes` e `prioridade_opcoes`.

---

## Fluxo de dados

```
GET /api/input/ramal ──► useRamalData() ──► ramal.tsx (visao/rapida/lote)
POST /api/input/ramal/bulk ◄── importarRamal() ◄── cadastro/colagem/rapida save
DELETE /api/input/ramal ◄── excluirRamal() ◄── exclusao save
POST /api/input/hierarquia ◄── vincularHierarquia() ◄── hierarquia save
GET /api/input/hierarquia/{n} ──► obterHierarquia() ──► hierarquia display
```

---

## Sem desfazer em Ramal

`notas_ramal` não tem suporte a `reverter_ultima_alteracao` no backend. Ramal tab não expõe botão "Reverter".

---

## Arquivos modificados

| Arquivo | Tipo |
|---------|------|
| `frontend/src/input/columns.ts` | modificar |
| `frontend/src/input/types.ts` | modificar |
| `frontend/src/input/api.ts` | modificar |
| `frontend/src/input/input-section.tsx` | modificar |
| `frontend/src/input/use-ramal-data.ts` | criar |
| `frontend/src/input/columns-ramal.ts` | criar |
| `frontend/src/input/ramal.tsx` | criar |
