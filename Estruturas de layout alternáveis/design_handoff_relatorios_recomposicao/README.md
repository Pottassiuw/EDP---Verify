# Handoff: Relatórios · Plano de Recomposição (EDP Verify)

## Overview
Redesenho completo da área **Relatórios** do EDP Verify: seis telas que respondem a uma pergunta operacional — *estamos cobertos para a meta deste período?* — e levam o engenheiro do risco à ação sem sair do contexto.

As telas são: **Dashboard Geral**, **Carteira por regional**, **Mensalização**, **Financeiro**, **Postergações** e **Exportar**. Todas compartilham o mesmo header, o mesmo conjunto de filtros globais (mês/ano, regional, busca) e o mesmo painel lateral de detalhe do plano.

## About the Design Files
Os arquivos deste pacote são **referências de design escritas em HTML** — protótipos que mostram aparência e comportamento pretendidos, **não** código de produção para copiar.

A tarefa é **recriar estes designs no ambiente já existente do repositório `EDP---Verify`**: React 18 + TypeScript, Vite, Tailwind v4 (`frontend/src/app.css`), shadcn/ui (`frontend/src/components/ui/*`) e os wrappers de marca em `frontend/src/components/branded/section.tsx` (`PageHeader`, `StatTile`, `SegTabs`). Nada de CSS novo solto: as classes utilitárias e os tokens `--edp-*` já existem no `app.css` e devem ser reutilizados.

O protótipo é um Design Component (`.dc.html`) e usa estilos inline por exigência da ferramenta de prototipagem. **Não replique estilos inline no código real** — traduza cada valor para as classes/tokens equivalentes do Tailwind/app.css.

## Fidelity
**Alta fidelidade (hifi).** Cores, tipografia, espaçamentos, estados e cópia são finais e foram derivados do próprio código do app. Recrie pixel-perfect usando os componentes existentes. Onde o protótipo desenha algo à mão (barras, matriz, chips de %Disp), prefira o componente equivalente do repositório se houver; se não houver, crie um componente novo em `features/relatorios/`.

## Arquitetura sugerida

```
frontend/src/features/relatorios/
  relatorios-section.tsx        // shell: PageHeader + SegTabs + filtros + router de aba
  filtros-globais.tsx           // mês, regional, busca, chip de escopo, limpar
  use-relatorios-data.ts        // seleção/derivação: enrich, filtros, agregações
  fmt.ts                        // JÁ EXISTE — fmtQtd, fmtPct, farol, FAROL_COR
  dashboard/
    resumo-decisao.tsx          // 3 cards da faixa de decisão
    acoes-criticas.tsx
    saldo-regional-resumo.tsx
    detalhamento-carteira.tsx
  regional/
    regional-kpis.tsx
    regional-ranking.tsx
    regional-matriz.tsx
  mensalizacao/
    mensalizacao-chart.tsx      // JÁ EXISTE — estender p/ par meta|carteira
    mensalizacao-tabela.tsx
  financeiro/
    financeiro-kpis.tsx
    financeiro-areas.tsx
    financeiro-top-gap.tsx
    financeiro-regionais.tsx
  postergacoes/
    postergacoes-kpis.tsx
    postergacoes-tabela.tsx
    postergacoes-por-mes.tsx
  exportar/
    exportar-form.tsx
    exportar-historico.tsx
  plano-inspector.tsx           // painel lateral (Sheet do shadcn)
```

O roteamento de abas deve seguir o padrão já usado em `App.tsx` para as sub-páginas do COFFEE (`normalizeCoffeeSubPage`): sub-página na URL/estado do app, sidebar e SegTabs refletindo a mesma fonte de verdade.

## Design Tokens

Todos já presentes em `frontend/src/app.css` — use os tokens, não os hex literais, quando existir token.

### Cores
| Papel | Hex | Uso |
|---|---|---|
| app background | `#161e2b` | fundo da página e header de tabela |
| surface | `#212c3e` | sidebar, painéis, cards |
| surface-2 | `#283449` | item ativo, hover de linha, callouts |
| surface-inset | `#1b2433` | inputs, stat tiles, group header de tabela |
| row selected | `#31405a` | linha selecionada |
| text | `#eef2f8` | texto primário |
| text-dim | `#9aa9c2` | texto secundário |
| text-mute | `#61708c` | eyebrows, legendas, valores neutros |
| hairline | `rgba(255,255,255,0.12)` | bordas de painel, divisores de header |
| hairline-soft | `rgba(255,255,255,0.07)` | divisores entre linhas |
| verde EDP | `#00a859` | ação primária, ≥100%, executado |
| verde claro | `#1dbd6e` | carteira (barra do mês ativo), link hover |
| âmbar | `#f0a93b` | postergadas, pendente de SAP/validação, 85–99% |
| vermelho | `#f0555c` | déficit, sem cobertura, <85% |
| azul | `#1f9fd6` | COFFEE / cobertura potencial |
| violeta | `#6b5ce6` | anel externo do logo, nota de drill-down |

Tints (fundo de chip/callout): verde `rgba(0,168,89,0.12)`, âmbar `rgba(240,169,59,0.13)`, vermelho `rgba(240,85,92,0.12)`, azul `rgba(31,159,214,0.13)` — bordas correspondentes em `0.22–0.28` de alfa.

### Farol de disponibilidade
Idêntico a `features/relatorios/fmt.ts` — **não reimplementar**:
- `%Disp ≥ 100%` → verde `#00a859`
- `85% ≤ %Disp < 100%` → âmbar `#f0a93b`
- `%Disp < 85%` → vermelho `#f0555c`

### Tipografia
- UI: **Inter** 400/500/600
- Números, códigos, eyebrows: **IBM Plex Mono** 400/500
- H2 de página: 21px / 600 / line-height 1.15 / letter-spacing −0.03em
- H3 de painel: 15px / 600 / −0.015em
- Big number (hero): 34px / 600 / line-height 1 / −0.03em / `font-variant-numeric: tabular-nums`
- Big number (KPI, stat tile): 22–26px / 600 / −0.03em / tabular-nums
- Corpo: 13px / 1.45 · secundário 12–12.5px · legenda 11–11.5px
- Eyebrow: IBM Plex Mono 10px / 500 / uppercase / letter-spacing 0.18em / cor `#61708c`
- Header de tabela: IBM Plex Mono 10px / 500 / uppercase / 0.14em / `#61708c`
- Todo número em coluna alinhada à direita usa tabular-nums

### Espaçamento e forma
- Sidebar: largura fixa 256px, padding 10px 8px, gap 2px entre itens
- Conteúdo: padding 20px, gap 16px entre seções
- Painel: padding 16px (cabeçalho 14px 16px), radius 11px, borda hairline, `box-shadow: 0 1px 2px rgba(0,0,0,0.30)`
- Card de decisão: padding 18px 20px
- Stat tile interno: padding 12px 14px, radius 11px, fundo surface-inset
- Linha de tabela: padding 11px 16px (dashboard) / 10px 16px (demais), divisor hairline-soft
- Radius: 4px (checkbox/badge quadrado), 6px (controles, callouts, itens de nota), 11px (painéis/cards), 999px (chips, barras)
- Controles: altura 34px (filtros), 30px (controles de tabela), padding lateral 9–11px
- Barras: trilha 6px, valor 8px; marcador de meta = 2px branco `#eef2f8`

### Anotações de design (N1–N4)
O protótipo tem um toggle "Anotações" que revela cartões explicativos. **É andaime de comunicação — não implementar.**

## Telas

---

### 1 · Dashboard Geral
**Propósito:** decidir. Responde se a meta do período está coberta e o que fazer agora.

**Layout:** coluna única, seções empilhadas com gap 16px. Ordem deliberada — risco antes de análise.

#### 1.1 Faixa de decisão (3 cards, `flex` 1:1:1, gap 12px)

**Card A — Carteira vs. meta**
- Eyebrow "CARTEIRA VS. META"
- Hero: `%Disp` do escopo, cor pelo farol; sufixo "de disponibilidade" (13px, text-dim)
- Frase: "Carteira cobre **X%** da meta — `carteira` de `meta` und."
- Barra de progresso: trilha 6px surface-2 full-width, valor 8px na cor do farol, marcador branco 2px na extremidade direita (= meta). Escala em `0` / `meta N` em mono 10px
- Dois stat tiles lado a lado: **Executado** (texto primário) e **Postergadas** (âmbar)

**Card B — Déficit / Superávit do período**
- Título alterna: "Déficit do período" quando existe qualquer plano abaixo da meta; senão "Superávit do período"
- Hero: **déficit real somado** (não o saldo líquido), prefixado com `−`. Cor pelo farol
- Frase: "Faltam N und. distribuídas em M planos abaixo da meta."
- Sub-linha mono 11.5px: "saldo líquido ±N und. · superávits não compensam déficit"
- Tile "GAP FINANCEIRO ESTIMADO": R$ compacto pt-BR + nota "saldo × valor modular do dispositivo"
- Lista "Concentração do déficit": por área (Construção/CSD/Outros), barra vermelha proporcional ao maior déficit, valor à direita. Oculta quando não há déficit

**Card C — Cobertura possível do déficit**
Três estados mutuamente exclusivos:
1. **Com déficit e com dados** — hero azul = und. supríveis; barra segmentada azul/âmbar/vermelho proporcional ao déficit total; legenda de 3 linhas com valores; nota "Pendentes não entram no total confirmado. Nada é movido automaticamente."
2. **Sem dados do COFFEE** — callout âmbar (borda esquerda 3px `#f0a93b`, fundo tint) + botão primário "Sincronizar COFFEE"
3. **Sem déficit** — callout verde "✓ Nenhum dispositivo abaixo da meta"

Ícone `?` (14px, círculo hairline) no eyebrow com tooltip: "Nenhuma alocação é automática: a cobertura é uma recomendação a revisar."

#### 1.2 Ações críticas
Painel com header: título + chip vermelho "N planos" + regra de ordenação em texto ("impacto R$ ↓ · %Disp ↑ · déficit ↓").

Grid de 9 colunas: `1.9fr 1fr 62px 76px 66px 74px 92px 1.3fr 120px` → Plano/dispositivo · Regional · Meta · Carteira · Déficit · %Disp · R$ gap · Cobertura · Ação.

- Cada linha tem `box-shadow: inset 2px 0 0 <cor do farol>` como marcador de criticidade
- Célula de plano em duas linhas: nome (13px) + "área · U.M" (11px, mute)
- %Disp como chip pill (tint + cor do farol, 11px/600)
- Cobertura: ícone + label na cor semântica (✓ verde, ● / ◐ azul, ◔ âmbar, ✕ vermelho, ? âmbar)
- Ação é rótulo derivado do estado: "Revisar cobertura" / "Cobrar validação" / "Criar notas" / "Ver plano"
- Ordenação: `R$ gap desc → %Disp asc → déficit desc`
- Estado vazio quando não há déficit
- Linha inteira clicável (e `tabindex=0`, Enter/Space) → abre o painel lateral

#### 1.3 Saldo por regional (resumo)
Grid `150px 1fr 70px 66px`. Barra dupla sobreposta: trilha = meta (surface-2 com borda), barra colorida = carteira, marcador branco na posição da meta. Máx. 6 regionais, críticas no topo. Clique aplica/alterna o filtro global. Subtítulo aponta para a aba completa.

#### 1.4 Detalhamento da carteira por dispositivo
- Header: contagem de planos, select de ordenação (Criticidade / Saldo / %Disp / R$ gap / Nome) e botão "Ocultar/Mostrar secundárias" (colunas Postergado e R$ gap)
- Corpo com `max-height: 520px` e header de tabela `sticky`
- Agrupado por área com linha de grupo colapsável (chevron ▾/▸ + totais de meta/carteira/%Disp)
- Grid 8 ou 10 colunas: `1.9fr 52px 66px 80px 70px 68px 130px 1.2fr` (+ `88px 84px` quando secundárias visíveis)
- Coluna "Meta vs. carteira": mini-barra com padding lateral 14px
- Estado vazio quando os filtros não retornam nada

---

### 2 · Carteira por regional
**Propósito:** comparar regionais e localizar onde o déficit se concentra.

- **4 KPIs** (flex, gap 12px): Regionais no escopo · Abaixo da meta · Maior gap (nome + R$) · Melhor cobertura (%Disp + nome)
- **Ranking de regionais**: grid `1.1fr 1.6fr 80px 90px 80px 76px 96px 96px` → Regional (nome + "N planos · M abaixo da meta") · barra meta/carteira · Meta · Carteira · Saldo · %Disp (chip) · R$ gap · Postergado. Marcador `inset 2px` na cor do farol. Ordenado por %Disp asc. Clique aplica o filtro global
- **Matriz regional × área**: grid `1.2fr repeat(3,1fr) 1fr`; cada célula é um chip de %Disp (tint + cor do farol, min-width 56px) com `title` = "área · meta N / carteira M"; `—` quando a regional não tem meta na área; coluna Total à direita

---

### 3 · Mensalização
**Propósito:** ver a série anual e antecipar meses sem carteira. (Removida do Dashboard Geral por decisão de produto.)

- **Alerta** no topo listando os meses com carteira < meta (callout âmbar)
- **Gráfico de 12 meses**, altura 230px: por mês um par de barras (40% cada, gap 4px) — meta (surface-2 com borda) e carteira (colorida). O executado é um segmento verde `#00a859` preenchendo a base da barra de carteira. Dot âmbar 7px acima da barra quando postergadas > 15. Mês da referência com fundo surface-2 e labels em texto primário; os outros em mute e cores dessaturadas (`#177f4d` / `#8d3b41`). Alturas normalizadas pelo maior valor da série
- **Tabela detalhada**: grid `90px 1fr 90px 90px 90px 100px 84px 1.1fr` → Mês · barra · Meta · Carteira · Executado · Postergadas · %Disp (chip) · Situação ("Carteira cobre a meta" / "Recomposição parcial pendente" / "Falta de carteira — agir")
- Clique no mês (gráfico ou tabela) troca a referência global de todo o relatório

---

### 4 · Financeiro
**Propósito:** traduzir carteira e déficit em R$ pelo valor modular.

- **4 KPIs**: Carteira R$ · Meta R$ · Gap R$ · Cobertura R$ (%)
- **Grid 1fr 1fr**:
  - *Carteira R$ vs. meta R$ por área* — por área: nome, carteira, "/ meta", %Disp; barra de progresso; rodapé com "gap R$" e "valor modular médio"
  - *Onde o gap custa mais* — top 5 planos por R$: nome + R$ gap vermelho, barra proporcional ao maior gap, metadados (regional · déficit · modular). Linha clicável → painel lateral. Estado vazio verde quando não há gap
- **Financeiro por regional**: grid `1.2fr 120px 120px 120px 1fr 80px` → Regional · Meta R$ · Carteira R$ · Gap R$ · barra de participação no gap · %Disp
- Moeda sempre `Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', notation:'compact' })`

---

### 5 · Postergações
**Propósito:** controlar itens deslocados para fora do mês e o efeito no plano.

- **4 KPIs**: Postergadas no mês · Volume deslocado R$ · Reincidentes · Destino predominante
- **Callout** de contexto: "Postergadas saem do mês de referência mas continuam na carteira do ano. O impacto aparece no mês de destino — confira a aba Mensalização antes de repostergar."
- **Tabela**: grid `1.7fr 1fr 90px 100px 110px 96px 110px 1fr` → Plano (nome + área) · Regional · Postergado (âmbar) · % carteira · R$ deslocado · Destino · Reincidência ("1ª vez" mute / "N× no ano" âmbar ou vermelho a partir de 2) · Efeito na meta ("Agrava déficit do mês" vermelho / "Sem impacto no mês (meta atendida)"). Ordenada por R$ deslocado desc. Linha clicável → painel lateral. Estado vazio próprio
- **Postergadas por mês**: barras simples 120px de altura, âmbar quando > 15, cinza `#31405a` abaixo disso

---

### 6 · Exportar
**Propósito:** gerar o pacote do relatório com o escopo já filtrado.

Grid `1.35fr 1fr`.

**Coluna esquerda — Exportar relatório**
- Subtítulo: "A exportação usa exatamente os filtros ativos no topo — o arquivo carrega o escopo no nome."
- Bloco "ESCOPO DO ARQUIVO": chips com mês, escopo (azul quando regional específica), N planos, N abaixo da meta; abaixo, o nome do arquivo em mono
- "BLOCOS INCLUÍDOS": grid 2×3 de toggles (checkbox 16px radius 4px; ativo = fundo/borda tint verde + check branco). Blocos: Resumo de decisão · Ações críticas · Detalhamento por dispositivo · Carteira por regional · Mensalização · Notas de cobertura (COFFEE). Cada um mostra o escopo de linhas
- "FORMATO": 3 cards radio — XLSX (aba por bloco) · CSV (tabela única, pronta para BI) · PDF (layout para envio)
- Ações: botão primário "Gerar arquivo", secundário "Agendar envio mensal", nota "A geração roda no servidor e avisa por toast ao concluir."
- Nome do arquivo derivado: `recomposicao_<ano>-<mês>_<escopo-slug>_<N>blocos.<ext>` (ex.: `recomposicao_2026-07_SP-todas_5blocos.xlsx`)

**Coluna direita — Exportações recentes**
Lista de 4 itens (arquivo mono, "quando · autor", tamanho, link "baixar") + callout azul "Envio mensal ativo" com dia, hora e destinatário.

---

### Painel lateral · detalhe do plano
`Sheet` lateral, largura **470px**, fundo surface, borda esquerda hairline, sombra `0 24px 60px rgba(0,0,0,0.45)`, overlay `rgba(10,14,22,0.6)`. Fecha por ✕, clique no overlay ou **Esc**.

- Header: eyebrow "área · regional", título 18px, 4 stat tiles (Meta · Carteira · Saldo · R$ gap)
- Status (ícone + label na cor semântica) e parágrafo-resumo gerado a partir do estado — inclui variante para "sem dados do COFFEE"
- Barra segmentada de 4 partes sobre a meta: verde (na carteira) · azul (potencial) · âmbar (pendente) · vermelho (sem cobertura)
- Três listas de notas: **Notas já na carteira / plano** (surface-inset), **COFFEE · prontas para mover ao plano** (tint azul), **Pendentes de SAP / validação** (tint âmbar). Cada item: id da nota (mono) · origem (truncada) · quantidade. Estado vazio próprio por lista
- Callout "Ainda falta cobrir": valor 22px na cor do estado + frase de recomendação
- Nota de rodapé: "A cobertura acima é uma **recomendação**. Nenhuma nota é movida automaticamente para o plano — revise origem, quantidade e data antes de confirmar."
- Rodapé fixo: "Revisar cobertura" (primário), "Ver notas", "Abrir no plano"

## Interações & comportamento

- **Filtros globais** (mês/ano, regional, busca) valem para todas as abas e recalculam todo agregado. Chip de escopo fica azul quando há regional específica; link "limpar filtros" aparece só quando há filtro ativo
- **Drill-down**: linha de plano → painel lateral (sem trocar de aba); regional (dashboard ou ranking) → aplica/alterna o filtro global; mês (gráfico ou tabela) → troca a referência global
- **Teclado**: toda linha e todo controle custom é focável (`tabindex=0`) e ativa com Enter/Space; `focus-visible` = outline 2px verde EDP; Esc fecha o painel
- **Hover** de linha e de item de navegação: fundo surface-2 (`#283449`)
- **Grupos** do detalhamento colapsáveis, estado por área, todos abertos por padrão
- Cor nunca é o único portador de significado — sempre acompanha ícone, rótulo e número
- Nenhuma alocação de nota é automática: toda cobertura é recomendação sujeita a revisão

## Estado

```ts
type RelatoriosState = {
  pagina: 'dashboard' | 'regional' | 'mensalizacao' | 'financeiro' | 'postergacoes' | 'exportar';
  mes: string;            // referência ativa, ex. 'Julho de 2026'
  regional: string;       // 'SP (todas)' | nome da regional
  busca: string;          // filtra nome do plano + área
  sel: string | null;     // id do plano aberto no painel lateral
  sort: 'crit' | 'saldo' | 'pct' | 'gap' | 'nome';
  cols: boolean;          // colunas secundárias do detalhamento
  expanded: Record<string, boolean>;  // grupos por área
  blocos: Record<string, boolean>;    // seleção de export
  formato: 'xlsx' | 'csv' | 'pdf';
};
```

Derivações (memoizar; hoje vivem em `renderVals()` do protótipo):
- `enrich(plano)` → `saldo`, `pct`, `def`, `cob`/`pen`/`sem` (cobertura em cascata limitada pelo déficit), `gapv = def × valor`, `status`, `acao`
- Agregações por escopo, por área, por regional (incl. matriz área×regional) e por mês
- **O déficit total é a soma dos déficits por plano**, nunca o saldo líquido — superávits de um plano não compensam o déficit de outro. Exiba os dois (hero = déficit, sub-linha = saldo líquido)
- Cobertura em cascata: `cob = min(coffeeComSap, def)`, `pen = min(pendentes, def − cob)`, `sem = def − cob − pen`. **Pendentes nunca entram no total confirmado**

### Dados / API
O protótipo usa mocks. No app, cada plano precisa de: `id`, `nome`, `grupo` (área), `regional`, `unidade` (U.M), `meta`, `carteira`, `executado`, `postergado`, `reincidencia`, `valorModular`, e as notas em três coleções (`carteira`, `coffeeComSap`, `pendentes`) com `{ id, origem, qtd }`. A série mensal precisa de `meta`, `carteira`, `executado`, `postergadas` por mês.

O estado "sem dados de cobertura" (integração COFFEE sem retorno) é um caso de UI de primeira classe, não um erro genérico: mantenha o déficit visível e marque a cobertura como não confirmável.

## Assets
Nenhum asset binário. O logo do EDP Verify é um SVG inline de três anéis concêntricos (r=30 violeta `#6b5ce6`, r=18 azul `#1f9fd6`, r=7 verde `#00a859`, `stroke-width: 9`) — no app, use o componente de logo já existente. Ícones da sidebar seguem o padrão `lucide-react` usado em `app-sidebar.tsx`.

## Files
- `Dashboard Geral.dc.html` — protótipo completo das 6 telas (template + lógica). Abre direto no navegador
- `support.js` — runtime da ferramenta de prototipagem; necessário só para abrir o HTML localmente, **não** faz parte da entrega
- `github.md` — mapa de quais arquivos do repo embasaram o design

### Como abrir o protótipo
Sirva a pasta por HTTP (ex.: `npx serve .`) e abra `Dashboard Geral.dc.html`. As abas são navegáveis pela sidebar ou pelas tabs; o select "Estado" no canto direito dos filtros alterna os três cenários de dados (déficit com cobertura parcial · tudo dentro da meta · sem dados de cobertura), e o botão "Anotações" liga/desliga os cartões explicativos (que não devem ser implementados).

## Screenshots
Capturas em `screenshots/`, larguras reais de design (1440px; painel lateral em 2×):

| Arquivo | Tela |
|---|---|
| `01-dashboard-geral.png` | Dashboard Geral (faixa de decisão · ações críticas · saldo por regional · detalhamento) |
| `02-carteira-por-regional.png` | Carteira por regional (KPIs · ranking · matriz área × regional) |
| `03-mensalizacao.png` | Mensalização (alerta · gráfico de 12 meses · tabela) |
| `04-financeiro.png` | Financeiro (KPIs · R$ por área · top gap · por regional) |
| `05-postergacoes.png` | Postergações (KPIs · tabela · volume por mês) |
| `06-exportar.png` | Exportar (escopo · blocos · formato · histórico) |
| `07-painel-plano.png` | Painel lateral de detalhe do plano (estado "cobertura integral identificada") |

Observações de leitura das capturas:
- Os cartões N2/N3/N4 e o botão "Anotações" são andaime de comunicação — **não implementar**.
- O select "Estado" no canto direito dos filtros é um alternador de cenário do protótipo (déficit com cobertura parcial · tudo dentro da meta · sem dados de cobertura). No app real esses três estados vêm dos dados, não de um controle na UI.
- O valor do filtro de mês nas capturas pode divergir da referência usada nos números; a referência canônica do protótipo é **Julho de 2026**.
