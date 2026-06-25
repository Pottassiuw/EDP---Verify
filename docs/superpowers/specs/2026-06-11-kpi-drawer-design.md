# Spec — Drawer flutuante de KPIs

**Data:** 2026-06-11
**Status:** Aprovado para implementação

## Problema

A faixa de KPIs no topo do dashboard de triagem (`frontend/src/components/dashboard.tsx`, bloco `t.showKpis`) polui a visualização e ocupa espaço vertical permanente. O usuário quer o dashboard principal contendo apenas o essencial de trabalho (busca, filtros, fila, detalhe), com os indicadores disponíveis sob demanda.

## Solução

Remover a faixa de KPIs do topo e substituí-la por um **drawer flutuante (overlay)** ancorado à direita, aberto por um **botão flutuante (FAB)** no canto inferior direito que exibe a conformidade como badge.

Decisões tomadas durante o brainstorm (com mockups visuais):

| Decisão | Escolha |
|---|---|
| Comportamento da sidebar | Drawer overlay — desliza por cima do conteúdo, não empurra |
| Conteúdo do drawer | Somente os KPIs; filtros e chips de Bloqueio ficam onde estão |
| Gatilho | Botão flutuante no canto inferior direito |
| Badge no botão | Conformidade (ex.: "⊞ 78%") sempre visível |

## Comportamento

### Botão flutuante (FAB)

- Posição: canto inferior direito da área de conteúdo da triagem.
- Conteúdo: ícone + percentual de conformidade (`pct`), formato pílula (ex.: "⊞ 78%").
- Cor: `var(--accent)` com texto branco, sombra para destacar do conteúdo.
- Some enquanto o drawer está aberto.
- O toggle existente "Mostrar indicadores (KPIs)" (`t.showKpis`) é reaproveitado: desligado, esconde o FAB (e portanto o acesso ao drawer) por completo.

### Drawer

- Painel de ~320px de largura, `position: fixed` ocupando a altura total da viewport (`top: 0; right: 0; bottom: 0`), deslizando da direita por cima do conteúdo (overlay; não reposiciona fila/detalhe). O FAB também é `position: fixed`, no canto inferior direito.
- Animação de entrada ~200ms.
- Conteúdo, de cima para baixo:
  1. Cabeçalho "Indicadores" com botão × de fechar.
  2. Conformidade em destaque: percentual grande, barra de progresso, "`cOk`/`cTotal` prontas para o SAP".
  3. Quatro linhas de contagem com as cores atuais: Com erro (`cErr`, vermelho), Duplicatas (`cDup`, índigo), Visíveis no filtro atual (`filtered.length`, azul), Concluídas (`cDone`, verde).
- Fecha com: botão ×, clique fora do painel (backdrop transparente) ou tecla Esc.
- Estado inicial: fechado a cada sessão. Não persiste em localStorage — um overlay aberto por padrão cobriria o conteúdo ao carregar.
- Existe apenas na seção Triagem (os KPIs são derivados dos dados da triagem).

## Componentes

### Novo: `frontend/src/components/kpi-drawer.tsx`

Componente `KpiDrawer` contendo FAB + painel. Puramente apresentacional; estado aberto/fechado é interno ao componente.

Props:

```ts
interface KpiDrawerProps {
  pct: number;        // conformidade %
  cTotal: number;
  cOk: number;
  cErr: number;
  cDup: number;
  cDone: number;
  cVisible: number;   // filtered.length
}
```

### Alterado: `frontend/src/components/dashboard.tsx`

- Remover o bloco da faixa de KPIs (atualmente linhas 112–133, condicionado a `t.showKpis`).
- Manter o cálculo das contagens (`cTotal`, `cErr`, `cOk`, `cDone`, `cDup`, `pct`) como está.
- Renderizar `{t.showKpis && <KpiDrawer … />}` no lugar da faixa removida (o componente usa `position: fixed`, então o ponto de renderização não afeta o layout).

### Inalterado

- `tweaks-panel.tsx` e o toggle "Mostrar indicadores (KPIs)" em `App.tsx` — mesmo nome, novo efeito (mostrar/esconder o FAB).
- Filtros, chips de Bloqueio, chips de filtros ativos, fila (incl. colapso), detalhe.

## Verificação

O projeto não possui testes de frontend. Validação:

1. Build TypeScript limpo (`npm run build` no `frontend/`).
2. Verificação visual: temas claro e escuro, densidades compact e cozy.
3. Conferir: FAB com badge correto; drawer abre/fecha por ×, clique fora e Esc; toggle de tweaks esconde o FAB; números do drawer batem com os da faixa antiga.

## Fora de escopo

- Mover filtros ou chips de Bloqueio para o drawer.
- Persistência do estado aberto/fechado do drawer.
- KPIs na seção COFFEE.
