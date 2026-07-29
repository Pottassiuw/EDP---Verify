# Input — Tabela de notas: cabeçalho fixo, shadcn e Ordem SAP

**Data:** 2026-06-28
**Branch:** develop
**Escopo:** Frontend (`frontend/src/input/notes-table.tsx`, `frontend/src/input/columns.ts`, novo `frontend/src/components/ui/table.tsx`)

> Sub-projeto **A** do overhaul da seção Input. Ordem geral: **A** (tabela) → B (navegação igual ao COFFEE) → C (formulários do Gerenciar em shadcn) → D (sweep dos primitivos compartilhados). Cada um tem spec/plan/execução próprios.

## Problema

A tabela de notas (`notes-table.tsx`) tem três defeitos:

1. **Cabeçalho não fixa.** O `<th>` usa `position: sticky; top: 0`, mas a `<table>` é posicionada com `position: absolute` + `transform: translateY(...)` (virtualização manual). Um ancestral com `transform` **quebra** o `position: sticky` — por isso o cabeçalho "desce" junto com o scroll em vez de grudar no topo.
2. **"Não traz o ID SAP."** A coluna `Ordem` (número da ordem SAP, já preenchida pelo `engine.py` via IW28/IW38 e servida em `GET /api/input/notas`) existe no `COLUNAS`, mas fica na posição ~22 e rotulada só "Ordem" — passa despercebida.
3. **Formatação tosca.** Estilos inline soltos, sem o padrão visual do shadcn que o resto do app está adotando.

## Objetivos

1. Cabeçalho **fixo de verdade** no scroll, mantendo a virtualização (datasets podem ter milhares de notas).
2. **Ordem SAP** como coluna destacada logo após o Nº da Nota.
3. Tabela restilizada com o primitivo **shadcn `Table`**, preservando todo o comportamento atual.

## Não-objetivos (YAGNI)

- Sem `@tanstack/react-table`/`react-virtual` — o bug do sticky se resolve em poucas linhas; nova dependência seria peso sem ganho proporcional (abordagem #1, decidida com o usuário).
- Sem backend: nenhuma rota nova, nenhum join COFFEE↔Input. A `Ordem` já vem pronta.
- Sem mexer em `manage.tsx`, sidebar ou navegação — isso é sub-projeto B/C.
- Sem paginação, sem busca, sem export novo.

## Decisões (confirmadas com o usuário)

- "ID SAP" na tabela do Input = **a coluna `Ordem` (Ordem SAP)** existente, só destacada — não o `id_sap` do COFFEE.
- shadcn em todo o overhaul (escopo "Input + compartilhados"); **neste sub-projeto** isso significa o primitivo `Table`.
- Abordagem da tabela: **#1** — corrigir a causa-raiz do sticky + estilo shadcn, sem dependência nova.

## Design

Tudo em três arquivos do frontend.

### 1. Virtualização sem `transform` (corrige o sticky)

Troca a virtualização baseada em `transform: translateY` por **linhas-espaçadoras** dentro de um único container de scroll:

```
<div scroll (height=altura, overflow:auto, onScroll → setScrollTop)>
  <table> (fluxo normal: sem position:absolute, sem transform)
    <thead> → <th> com position: sticky; top: 0   ← agora funciona
    <tbody>
      <tr spacer-topo  height = inicio * ALTURA_LINHA />
      …linhas visíveis (fatia)…
      <tr spacer-fundo height = (total - inicio - fatia.length) * ALTURA_LINHA />
```

Sem ancestral transformado, o `sticky` do `<thead>` gruda no topo do container. O cálculo de `inicio`/`qtdVisiveis`/`fatia` a partir de `scrollTop` continua igual; só muda **como** o deslocamento é aplicado (spacers em vez de `translateY`).

### 2. Estilo shadcn (`components/ui/table.tsx`)

Adiciona o primitivo padrão do shadcn (`Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`) — wrappers finos de `<table>`/`<thead>`/… com classes Tailwind. A `notes-table.tsx` passa a usar esses componentes para cabeçalho, linhas e células, **sem** o `<div className="relative w-full overflow-auto">` que o wrapper `Table` do shadcn embute por padrão (o container de scroll com altura fixa + `onScroll` é nosso, por causa da virtualização). Ou seja: usa `TableHead`/`TableRow`/`TableCell` para o visual e mantém o container/scroll/spacers próprios.

Comportamento preservado integralmente:
- **Ordenação** por clique no cabeçalho (`ordem`/`setOrdem`, `compararDatas`, numérico vs. texto pt-BR), com a seta ↑/↓ e o destaque `--accent`.
- **Edição** por duplo clique (`onEditar`, `editando`), `<input>`/`<select>` na célula, Enter/Escape/blur, destaque de célula alterada (`--accent`, peso 600).
- **Seleção** por checkbox (coluna opcional quando `selecionados` presente; "marcar todos" da fatia).
- **`formatarNumero`** (0 casas para `Numero_Nota`/`ranking`, 2 para o resto) e truncamento (`ellipsis`, `maxWidth`).

### 3. Coluna Ordem SAP (`columns.ts`)

- Reposiciona a entrada de `Ordem` para **logo após** `Numero_Nota`.
- Relabela `label: 'Ordem'` → `label: 'Ordem SAP'`, `largura: 120`.
- Nada mais muda no `COLUNAS` (as demais colunas seguem na ordem atual).

## Tratamento de erro / casos de borda

- Dataset vazio → `<tbody>` só com os spacers (altura 0) e nenhuma linha; cabeçalho ainda renderiza.
- `Ordem` "Fora SAP"/vazia (base SAP indisponível em dev) → célula mostra o texto como qualquer outra; sem tratamento especial (é dado legítimo do backend).
- Scroll até o fim → spacer-fundo com altura ≥ 0 (clamp em 0 via `Math.max`).
- Edição em célula da Ordem: a coluna **não** é editável (`editavel` ausente) — comportamento atual mantido.

## Verificação

Sem test runner no frontend → check = `cd frontend && npm run build` (`tsc -b && vite build`) sem erros + verificação manual no dev server:

1. Rolar a tabela → **cabeçalho gruda no topo** (não desce mais).
2. **Ordem SAP** aparece como 2ª coluna, logo após Nº Nota, com os valores do SAP.
3. Ordenar clicando no cabeçalho, editar célula com duplo clique, marcar/desmarcar seleção — tudo como antes.
4. Aparência shadcn (linhas, hover, borda, cabeçalho) consistente com o resto do app.
5. Performance ok com a base cheia (virtualização preservada — só a fatia visível renderiza).

## Arquivos afetados

- `frontend/src/components/ui/table.tsx` — **novo**: primitivo shadcn `Table`.
- `frontend/src/input/notes-table.tsx` — virtualização por spacers (corrige sticky) + render com shadcn `Table`.
- `frontend/src/input/columns.ts` — `Ordem` vira `Ordem SAP` e sobe para logo após `Numero_Nota`.
