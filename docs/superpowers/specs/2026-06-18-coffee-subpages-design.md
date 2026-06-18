# Spec — Sub-paginas COFFEE: Tabelas e Acoes

**Data:** 2026-06-18
**Status:** Aprovado para implementacao

> **Contexto maior:** Este e o **Sub-projeto 3** da iniciativa Hub Operacional COFFEE. O Sub-projeto 1 (fundacao backend — `/api/coffee/*`) e o Sub-projeto 2 (navegacao frontend — hub wrapper + flyout) estao completos. Este sub-projeto substitui os placeholders das 4 sub-paginas restantes por conteudo real: tabelas consumindo `GET /api/coffee/notas` e acoes especificas por pagina. O conteudo de "Verificar" (regras de validacao) fica para um sub-projeto futuro.

## Problema

As sub-paginas Geradas, Corrigidas, Pendentes e Verificar hoje exibem um placeholder generico ("Em breve"). O backend ja expoe `GET /api/coffee/notas?status=X` com dados reais classificados. Precisamos de UI que consuma esses dados e exponha as acoes operacionais: arquivar notas geradas, re-buscar notas pendentes, e visualizar o estado geral.

## Solucao

Um hook compartilhado `useCoffeeNotas(status?)` para fetch de dados, um componente de tabela reutilizavel `CoffeeNotasTable`, e wrappers finos por sub-pagina que adicionam as acoes especificas. Segue a Opcao A (tabela compartilhada) para zero duplicacao.

## Arquitetura de dados

### Hook: `useCoffeeNotas`

```typescript
interface UseCoffeeNotasResult {
  notas: CoffeeNota[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

function useCoffeeNotas(status?: string): UseCoffeeNotasResult;
```

- Faz `GET /api/coffee/notas` (sem `status`) ou `GET /api/coffee/notas?status=X` ao montar
- Retorna a lista de notas, estado de loading, erro, e funcao de refetch
- `refetch()` re-executa o fetch (usado apos acoes que alteram dados)
- Usa `fetch` nativo (padrao do projeto — nao usa axios/swr)

### Tipo frontend

```typescript
interface CoffeeNota {
  pk: number;
  id_sap: number;
  id_sap_anterior: number | null;
  arquivado: boolean | null;
  classificacao: string;
  dados_json: Record<string, unknown> | null;
  buscado_em: string;
  erro: string | null;
}
```

Adicionado em `frontend/src/coffee/types.ts` (novo arquivo, tipos locais do modulo COFFEE).

## Componente de tabela: `CoffeeNotasTable`

### Props

```typescript
interface CoffeeNotasTableProps {
  notas: CoffeeNota[];
  isLoading: boolean;
  emptyMessage?: string;
  actionColumn?: (nota: CoffeeNota) => React.ReactNode;
}
```

### Colunas

| Coluna | Campo | Formato |
|---|---|---|
| ID | `pk` | Numero, mono |
| SAP | `id_sap` | Numero, mono. Se `10000000`, mostra tag "Pendente" em amarelo |
| Status | `classificacao` | Tag colorida: verde (gerada), azul (corrigida), amarelo (pendente) |
| Ultima busca | `buscado_em` | Data/hora formatada relativa ("ha 2h", "ontem") |

### Comportamento

- Estado loading: skeleton ou spinner centralizado
- Estado vazio: mensagem customizavel (prop `emptyMessage`)
- Estado de erro: mensagem de erro com botao "Tentar de novo"
- `actionColumn`: render prop que recebe a nota e retorna JSX para a coluna de acoes (botao, etc.)
- Estilo: segue padroes do projeto (`var(--surface)`, `var(--line)`, `var(--text)`, etc.)
- Sem paginacao por enquanto (volume esperado e dezenas/centenas, nao milhares)

## Sub-paginas

### Geradas (`coffee-geradas.tsx`)

- Usa `useCoffeeNotas("gerada")`
- Header: **"Notas Geradas"** + contador ("12 notas")
- Tabela com `actionColumn`: botao **"Arquivar"** por linha
  - Chama `POST /api/coffee/sap` com `{ id: nota.pk, sap: nota.id_sap }`
  - Enquanto processa: botao mostra loading, desabilitado
  - Sucesso: a linha fica com opacidade reduzida, tag "Arquivada" aparece, refetch apos breve delay
  - Erro: mensagem inline na linha
- Nota de UX: "Arquivar" aqui corresponde a marcar no sistema COFFEE externo que a nota foi gerada e processada. A integracao real com o modulo Input (criar nota la) fica para sub-projeto futuro.

### Corrigidas (`coffee-corrigidas.tsx`)

- Usa `useCoffeeNotas("corrigida")`
- Header: **"Notas Corrigidas"** + contador
- Tabela **sem `actionColumn`** — puramente informativa
- Banner informativo sutil no topo: "Notas que transitaram de pendente para SAP real. Na proxima busca, passam para Geradas."
- Explica o carater transitorio da classificacao "corrigida"

### Pendentes (`coffee-pendentes.tsx`)

- Usa `useCoffeeNotas("pendente")`
- Header: **"Notas Pendentes"** + contador + botao **"Atualizar notas"**
- Tabela sem `actionColumn` (sem acoes individuais)

#### Fluxo de re-busca (botao "Atualizar notas")

1. Coleta todos os `pk` da lista `notas` atual
2. `POST /api/coffee/buscar` com `{ ids: [pk1, pk2, ...] }` (como strings)
3. Recebe `{ job_id }` na resposta
4. Inicia polling: `GET /api/coffee/job/{job_id}` a cada 2 segundos
5. Exibe barra de progresso: `feitas / total` com percentual
6. Estado textual: "Buscando nota X de Y..." enquanto `estado === "rodando"`
7. Ao `estado === "concluido"`:
   - Para o polling
   - Se houver `erros` no job: exibe lista resumida (pk + mensagem, colapsavel)
   - Chama `refetch()` para atualizar a tabela
8. Botao fica desabilitado durante a busca

#### Estados visuais do progresso

```
[=====>        ] 34% · Buscando nota 17 de 50...
```

Barra usa `var(--accent)` como cor. Ao concluir: barra cheia em `var(--green)` + mensagem "Concluido" por 3 segundos, depois some.

### Verificar (`coffee-verificar.tsx`)

- Usa `useCoffeeNotas()` (sem filtro — todas as notas)
- Header: **"Verificar Notas"** + contador
- Banner no topo: fundo `var(--tint-amber)`, texto "Em breve: verificacao automatica de regras para notas COFFEE"
- Tabela completa (todas as notas), sem `actionColumn`
- Serve como visualizacao geral do banco COFFEE e placeholder funcional

## Estrutura de arquivos

```
frontend/src/coffee/
  types.ts                 (NOVO — CoffeeNota, CoffeeJob)
  use-coffee-notas.ts      (NOVO — hook de fetch)
  coffee-notas-table.tsx   (NOVO — tabela reutilizavel)
  coffee-geradas.tsx       (NOVO — wrapper com acao Arquivar)
  coffee-corrigidas.tsx    (NOVO — wrapper read-only)
  coffee-pendentes.tsx     (NOVO — wrapper com re-busca + progresso)
  coffee-verificar.tsx     (NOVO — placeholder melhorado com tabela)
  coffee-hub.tsx           (MODIFICA — roteamento para novos componentes)
  coffee-abrir.tsx         (sem mudanca)
  placeholder.tsx          (sem mudanca — nao mais referenciado pelo hub)
```

## Mudancas no `coffee-hub.tsx`

- Remove o `PLACEHOLDERS` constant
- Remove o import de `CoffeePlaceholder`
- Adiciona imports dos 4 novos componentes
- O bloco de renderizacao muda de `CoffeePlaceholder` para roteamento explicito:

```tsx
{sub === "abrir" ? <CoffeeAbrir ... />
 : sub === "geradas" ? <CoffeeGeradas />
 : sub === "corrigidas" ? <CoffeeCorrigidas />
 : sub === "pendentes" ? <CoffeePendentes />
 : sub === "verificar" ? <CoffeeVerificar />
 : null}
```

Os novos componentes **nao recebem props** do CoffeeHub — cada um faz seu proprio fetch via `useCoffeeNotas`. O hub e puro roteamento.

## Tipo auxiliar para job

```typescript
interface CoffeeJob {
  estado: "rodando" | "concluido";
  total: number;
  feitas: number;
  erros: Array<{ pk: number; msg: string }>;
  iniciado_em: string;
}
```

Adicionado em `frontend/src/coffee/types.ts` junto com `CoffeeNota`.

## Fora de escopo

- Verificacao com regras de validacao (Sub-projeto 4+)
- Integracao real "mover para Input" (criar nota no banco Input)
- Paginacao na tabela (volume esperado nao justifica)
- Filtros/busca dentro das tabelas (pode ser adicionado depois)
- Qualquer mudanca no backend (endpoints ja prontos)
- Geraao de PDF a partir do ID COFFEE (mencionado como possibilidade futura)

## Verificacao

- `cd frontend && npx tsc -b --noEmit && npx vite build` — SUCCESS
- Cada sub-pagina carrega dados do backend ao montar
- Geradas: botao "Arquivar" chama POST /sap e atualiza a tabela
- Corrigidas: tabela read-only com banner informativo
- Pendentes: botao "Atualizar notas" dispara busca em lote com barra de progresso
- Verificar: tabela geral com banner "em breve"
- Estado vazio tratado com mensagem amigavel em todas as paginas
- Estado de loading tratado (skeleton/spinner)
- Estado de erro tratado com opcao de retry
- Code-splitting preservado (tudo dentro do chunk coffee)
