# Input — Visão Geral com grade estilo Excel (react-datasheet-grid)

**Sub-projeto A do Track 2** (tabela estilo Excel). Spec focada na tela
**Visão Geral** do módulo Input. O Gerenciar (edição/lote/exclusão/colagem) é o
**Sub-B**, em spec separada.

## 1. Contexto e problema

A `input/notes-table.tsx` é uma tabela com virtual-scroll feito à mão
(`scrollTop` em state + `slice` + linhas-espaçador). Reclamações do usuário,
todas na Visão Geral:

- **#5** — "comportamento estranho de se atualizar a partir do scroll" e
  "colunas não terem posição fixa". Causa: `ALTURA_LINHA = 32` fixo, mas o
  `TableCell` do shadcn tem padding próprio → altura real ≠ 32 → a conta dos
  espaçadores desvia e a tabela "treme" ao rolar. Largura de coluna também
  reflui entre fatias.
- **#6** — células não se comportam como Excel: só há duplo-clique-para-editar
  (e nem isso na Visão Geral). Sem seleção de intervalo, sem cópia, sem
  navegação por teclado.
- **#7** — o botão "📊 Calculadora" (em `filters.tsx`) é um resíduo da
  implementação do Streamlit (escolher colunas e somar). Deve sair: a agregação
  passa a vir da **seleção de células**, como no Excel.

## 2. Decisão de biblioteca

**`react-datasheet-grid` (DSG) — v4.11.x, licença MIT, React 18.**

Avaliadas: `react-data-grid` (não copia bloco de células — limitação
histórica), `AG Grid` (seleção de range é Enterprise/pago), `Handsontable`
(licença comercial paga ~US$979/dev), `glide-data-grid` (MIT, mas canvas → tema
por objeto JS, atrito com o token system). DSG é **DOM** (estiliza com os tokens
EDP), MIT, e foi feita para planilha estilo Excel/Airtable com seleção de
intervalo, cópia/colagem de/para Excel, navegação por teclado e virtualização —
exatamente o conjunto pedido.

DSG expõe `onSelectionChange({ min, max })` e `onActiveCellChange`, que
alimentam a barra de status. Colunas read-only via `disabled`. Estiliza por
`style`/`className`/`cellClassName` + override do CSS das classes do DSG
(superfície exata confirmada na implementação).

## 3. Escopo

**Dentro (Sub-A):**
- Substituir a tabela da **Visão Geral** (`input/overview.tsx`) por uma grade
  DSG **read-only** (todas as colunas `disabled`), mantendo ordenação por
  clique no cabeçalho e o número de registros já exibido.
- Seleção de intervalo + cópia em TSV + navegação por teclado.
- Barra de status no rodapé com **Soma / Média / Contagem** da seleção.
- Remover a Calculadora (botão, painel, estado `calcColunas`, `calcular()`,
  `COLUNAS_CALCULAVEIS`).
- Tema (light/dark) mapeado para os tokens; IBM Plex Mono nos IDs.

**Fora (vai para Sub-B ou não entra):**
- Gerenciar (edição rápida, lote, exclusão, preview da colagem) — segue usando a
  `notes-table.tsx` atual até o Sub-B. **`notes-table.tsx` NÃO é removida nesta
  spec.**
- Pin/congelamento de coluna (usuário não pediu).
- Edição na Visão Geral (ela é só leitura).

## 4. Arquitetura

Novo componente **`input/data-grid.tsx`** — wrapper fino sobre DSG:

- **Props:** `registros: NotaInput[]`, `colunas: ColunaDef[]`,
  `altura?: number`, e um callback opcional de agregação (ver §6). Para Sub-A o
  wrapper só precisa do modo **read-only**; a assinatura é desenhada para o
  Sub-B estender (edição/seleção) sem reescrever.
- **Mapeamento `ColunaDef → coluna DSG`:** para cada `c` em `colunas`,
  `keyColumn(c.key, tipo)` com `title: c.label`, `disabled: true` (Sub-A),
  `minWidth: c.largura`. O `tipo`:
  - `Numero_Nota` / `ranking` → inteiro **sem separador de milhar**
    (`formatarNumero(v, 0, false)` — já corrigido no #3); fonte mono.
  - demais `numeric` → float com 2 casas (`formatarNumero(v, 2)`).
  - `Mes_Execucao_Planejado` → texto, mas a **ordenação** usa `compararDatas`.
  - demais → texto.
  As células read-only renderizam valor formatado (component custom leve, já que
  o `keyColumn`/`textColumn` padrão do DSG mostra o valor cru).
- **Ordenação:** mantida no wrapper (mesmo `useState<{campo, asc}>` de hoje,
  reaproveitando `compararDatas` e o comparador numérico/texto da
  `notes-table.tsx`, com `localeCompare` para texto). DSG renderiza a lista já
  ordenada.
- **Integração:** `overview.tsx` troca `<NotesTable …>` por `<DataGrid …>`. O
  cabeçalho de contagem de registros e o botão Exportar permanecem.

## 5. Comportamentos Excel (nativos do DSG)

- Seleção de intervalo (arrastar e Shift+clique/Shift+setas).
- **Cópia em TSV** (Ctrl/Cmd+C) — cola direto no Excel/Sheets.
- Navegação por teclado (setas, Shift+setas estende, Ctrl+A seleciona tudo).
- Virtualização — **resolve o #5**: o DSG controla a altura de linha, então não
  há mais o desvio dos espaçadores nem o reflow de largura entre fatias.

## 6. Barra de status (agregação — substitui a Calculadora)

Faixa fininha **colada no rodapé da grade** (estilo canto inferior do Excel),
dentro do `data-grid.tsx`:

- Fonte: `onSelectionChange({ min, max })`. Para o retângulo selecionado,
  percorrem-se as células; as **numéricas** entram em Soma / Média / Contagem.
  (Contagem = nº de células numéricas; células de texto são ignoradas no cálculo
  mas não quebram nada.)
- Exibição mono: `Soma 12.345,67 · Média 1.234,57 · Contagem 10`
  (via `formatarNumero`, com agrupamento nos valores agregados).
- Seleção vazia / sem numéricos → barra mostra estado neutro (ex.: "Selecione
  células para ver soma/média/contagem").

A Calculadora sai de `filters.tsx`: removem-se o botão "📊 Calculadora", o painel
`calcAberta`, o campo `calcColunas` de `FiltersState`, e — se não houver outro
uso — `calcular()` e `COLUNAS_CALCULAVEIS`.

**Consequência conhecida:** `filters.tsx` é compartilhado com o Gerenciar, então
o Gerenciar **perde a Calculadora** já no Sub-A e só recupera agregação (via
grade) no Sub-B. É aceitável: o usuário declarou a Calculadora obsoleta. Ponto
sinalizado para a revisão do spec.

## 7. Tema

DSG é DOM → estilização por `cellClassName`/CSS sobreposto às classes do DSG,
mapeando `--surface` (fundo), `--text` (texto), `--line` (grade/bordas),
`--accent` (borda da seleção) e `--font-mono` nas colunas de ID/numéricas.
Light/dark seguem automaticamente pelo seletor `.edp[data-theme]` existente. A
barra de status usa os mesmos tokens da `notes-table` atual.

## 8. Casos de borda

- **Dataset grande:** virtualização do DSG cobre (testar com a base real).
- **Filtro ativo:** a grade recebe `registros` já filtrados (como hoje); a
  seleção/cópia opera sobre o que está visível.
- **Cópia:** formato TSV (uma linha por registro, colunas na ordem de `COLUNAS`,
  valores **formatados** como na tela — decidir na impl se copia formatado ou
  cru; padrão: como exibido).
- **Ordenação + seleção:** ordenar limpa/reposiciona a seleção (comportamento do
  DSG); aceitável.

## 9. Verificação

- `npm run build` limpo (tsc + vite).
- Subir o backend e a Visão Geral com base real; conferir manualmente:
  seleção de intervalo, Ctrl+C colando no Excel, navegação por teclado, barra de
  status com soma/média/contagem corretas, scroll **sem tremor**, light e dark.
- (Regra do usuário: **sempre** build + servir backend ao terminar.)

## 10. Próximos (fora desta spec)

- **Sub-B:** migrar o Gerenciar (edição rápida/lote/exclusão/colagem) para a
  mesma grade DSG, trocando o modelo de estado (`edicoes` Map / `Set` de
  selecionados → `onChange` do DSG + coluna de checkbox no gutter), e então
  remover a `notes-table.tsx`.
