# Spec — Sub-projeto 2: Gerar com Ciclo de Vida + UI de Logs

**Data:** 2026-06-19
**Status:** Aprovado para implementacao

> **Contexto maior:** Sub-projeto 2 da iniciativa de redesign do Hub COFFEE. Depende do Sub-projeto 1 (sidebar retratil + sistema de logs). Entrega a sub-pagina Gerar reescrita (regerar com timeline), a UI de visualizacao de logs (sub-pagina + drawer lateral), e o rename do header. O Sub-projeto 3 (Verificar como triagem embutida) depende deste.

## Problema

1. **Sub-pagina Geradas e passiva:** so lista notas geradas, sem acao de regerar. O usuario precisa usar a API manualmente para regerar uma nota.
2. **Logs invisiveis:** o Sub-projeto 1 criou o sistema de logs no backend, mas nao ha UI para visualizar. Nao ha como ver historico de acoes, transicoes ou erros de API.
3. **Inconsistencia de labels:** a sidebar mostra "Gerar" mas o header do CoffeeHub ainda diz "Geradas".

## Solucao

1. Reescrever a sub-pagina "Gerar" com input de regerar + card de resultado com ciclo de vida (transicao anterior -> novo) + tabela de geradas com acao por linha.
2. Nova sub-pagina "Logs" com tabela paginada e filtros + drawer lateral contextual reutilizavel de qualquer sub-pagina.
3. Rename trivial no header.

---

## 1. Tipos e Infraestrutura

### 1.1 Novo tipo `CoffeeLog`

Em `frontend/src/coffee/types.ts`:

```ts
export interface CoffeeLog {
  id: number;
  timestamp: string;
  tipo: "api_call" | "transicao" | "acao_usuario";
  acao: string;
  nota_pk: number | null;
  detalhes: Record<string, unknown> | null;
  sucesso: boolean;
}
```

### 1.2 Novo valor de `CoffeeSubPage`

Em `frontend/src/types.ts`:

```ts
export type CoffeeSubPage = "abrir" | "geradas" | "corrigidas" | "pendentes" | "verificar" | "logs";
```

### 1.3 Novo hook `useCoffeeLogs`

Em `frontend/src/coffee/use-coffee-logs.ts`. Mesmo padrao de `useCoffeeNotas` (fetch manual + useState).

```ts
function useCoffeeLogs(params?: {
  nota_pk?: number;
  tipo?: string;
  limit?: number;
}): { logs: CoffeeLog[]; loading: boolean; refresh: () => void }
```

- Faz `GET /api/coffee/logs?nota_pk=X&tipo=Y&limit=N`
- Espera resposta `{ logs: CoffeeLog[] }`
- Refaz fetch quando `params` mudam (via `JSON.stringify` como dep key)
- `refresh()` refaz fetch manualmente

### 1.4 Atualizacao do CoffeeHub

Em `frontend/src/coffee/coffee-hub.tsx`:
- Adicionar `{ id: "logs", label: "Logs" }` ao array `SUBS`
- Renomear `{ id: "geradas", label: "Geradas" }` para `{ id: "geradas", label: "Gerar" }`
- Renderizar `<CoffeeLogs />` quando `activeSub === "logs"`
- Import dos novos componentes

### 1.5 Atualizacao da Sidebar

Em `frontend/src/components/sidebar.tsx`:
- Adicionar `{ id: "logs", label: "Logs" }` ao array `COFFEE_SUBS`

---

## 2. Componente LogTable (reutilizavel)

### 2.1 Arquivo

`frontend/src/coffee/coffee-log-table.tsx`

### 2.2 Props

```ts
interface LogTableProps {
  logs: CoffeeLog[];
  loading: boolean;
  compact?: boolean;
}
```

- `compact={true}`: esconde coluna "Nota", fonte menor (12px vs 13px). Usado no drawer.

### 2.3 Colunas

| Coluna | Conteudo | Compact |
|--------|----------|---------|
| Quando | Timestamp relativo (`formatRelativeTime` existente) + tooltip ISO | sim |
| Tipo | Tag colorida: azul `api_call`, roxo `transicao`, verde `acao_usuario` | sim |
| Acao | Texto da acao (`buscar_nota`, `classificar`, `regerar`, etc.) | sim |
| Nota | PK como texto (nao-clicavel) | **escondida** |
| Status | Icone: checkmark verde (sucesso) / X vermelho (falha) | sim |
| Detalhes | `<details>` nativo com `<summary>` mostrando preview curto do JSON | sim |

### 2.4 Estados

- **Loading:** spinner inline substituindo a tabela
- **Vazio:** mensagem "Nenhum log encontrado" centralizada
- **Normal:** tabela com linhas

### 2.5 Estilo

Segue padrao existente: inline styles com CSS custom properties (`var(--surface)`, `var(--text)`, etc.). Classe `edp-mono` para timestamps.

---

## 3. Sub-pagina Logs

### 3.1 Arquivo

`frontend/src/coffee/coffee-logs.tsx`

### 3.2 Layout

```
+--------------------------------------------------+
|  [Todos] [API] [Transicao] [Usuario]   Nota: [  ] Limite: [100v] |
+--------------------------------------------------+
|  Quando    | Tipo       | Acao         | Nota   | Status | Detalhes |
|  2min atras| api_call   | buscar_nota  | 355617 | ok     | {...}    |
|  5min atras| transicao  | classificar  | 355617 | ok     | {...}    |
|  ...       |            |              |        |        |          |
+--------------------------------------------------+
```

### 3.3 Filtros

- **Tipo:** segmented buttons (`Todos` | `API` | `Transicao` | `Usuario`). Mapeia para query param `tipo`: `null`, `"api_call"`, `"transicao"`, `"acao_usuario"`.
- **Nota PK:** input numerico opcional. Filtra por nota especifica.
- **Limite:** select com opcoes `50 | 100 | 500`. Default `100`.

### 3.4 Comportamento

- Ao mudar qualquer filtro, refaz fetch imediatamente (sem botao "buscar")
- Usa `useCoffeeLogs({ tipo, nota_pk, limit })` internamente
- Passa `logs` e `loading` para `<LogTable />`

---

## 4. LogDrawer (painel lateral contextual)

### 4.1 Arquivo

`frontend/src/coffee/coffee-log-drawer.tsx`

### 4.2 Props

```ts
interface LogDrawerProps {
  notaPk: number;
  open: boolean;
  onClose: () => void;
}
```

### 4.3 Anatomia

- Painel fixo no lado direito: `width: 360px`, `height: 100vh`, `position: fixed`, `right: 0`, `top: 0`
- Fundo: `var(--surface)`, borda esquerda `1px solid var(--line)`
- Overlay atras: `rgba(0,0,0,0.3)`, `position: fixed`, cobre tela toda
- Clique no overlay fecha
- ESC fecha
- Transicao: slide da direita com `transform: translateX` + `transition: transform 150ms ease`
- `z-index: 200` (acima da sidebar que e `z-index: 2`)

### 4.4 Header

```
+-------------------------------------+
|  Logs — Nota #355617           [X]  |
+-------------------------------------+
```

- Titulo com PK da nota
- Botao fechar (X) no canto direito

### 4.5 Corpo

- Filtro de tipo inline (segmented buttons compactos)
- `<LogTable compact={true} />` com logs filtrados
- Limite fixo: 50
- Auto-refresh ao abrir (novo fetch quando `open` muda para `true`)

### 4.6 Integracao nas sub-paginas

As sub-paginas Geradas/Gerar, Corrigidas, Pendentes ganham:
- Um botao-icone por linha na tabela que abre o drawer
- Estado local: `const [drawerPk, setDrawerPk] = useState<number | null>(null)`
- `<LogDrawer notaPk={drawerPk!} open={drawerPk !== null} onClose={() => setDrawerPk(null)} />`
- O `LogDrawer` e renderizado dentro de cada sub-pagina (nao e global)

---

## 5. Sub-pagina Gerar (rewrite)

### 5.1 Arquivo

`frontend/src/coffee/coffee-geradas.tsx` (mesmo arquivo, conteudo reescrito)

### 5.2 Layout

```
+--------------------------------------------------+
|  Regerar Nota                                     |
|  [  ID da nota  ] [Regerar]                       |
|                                                   |
|  +-- Card de Resultado (apos regerar) ----------+ |
|  | Classificacao: pendente -> corrigida          | |
|  | ID SAP: 10000000 -> 17247854                  | |
|  | Arquivado: nao                                | |
|  | [Ver logs]  [Regerar outra]                   | |
|  +----------------------------------------------+ |
|                                                   |
|  --- Notas Geradas (tabela) ---                   |
|  | PK     | ID SAP   | Buscado em  | Acoes      | |
|  | 355617 | 17247854 | 2min atras  | [R] [L]    | |
|  | ...    |          |             |             | |
+--------------------------------------------------+
```

### 5.3 Zona 1: Regerar

- **Input:** numerico, placeholder "ID da nota"
- **Botao:** "Regerar", desabilitado se input vazio ou request em andamento
- **Durante operacao:** spinner no botao + texto "Regenerando..."
- **Request:** `POST /api/coffee/regerar` body `{ "id": <number> }`
- **Sucesso:** mostra card de resultado (ver abaixo)
- **Erro:** banner vermelho com mensagem de erro (`var(--red)` background)

### 5.4 Card de Resultado

Dados do card:
- `POST /api/coffee/regerar` retorna `{ ok: true, nota: { pk, id_sap, arquivado, fields } }`
- Apos sucesso, faz `GET /api/coffee/logs?nota_pk=PK&tipo=transicao&limit=5` para obter transicoes recentes
- Se houver transicao de classificacao: mostra `anterior -> novo` com tags coloridas
- Se nao houver transicao: mostra so o estado atual
- Campos exibidos:
  - Classificacao (com seta se houve transicao)
  - ID SAP (com seta se mudou)
  - Arquivado (sim/nao)
- Botoes:
  - "Ver logs" — abre `LogDrawer` para o PK
  - "Regerar outra" — limpa o card e foca o input

### 5.5 Zona 2: Tabela de Notas Geradas

- Usa `useCoffeeNotas("gerada")` (existente)
- Colunas: PK, ID SAP, Arquivado, Buscado em (relativo), Acoes
- Acoes por linha:
  - Botao "Regerar" (icone de refresh): chama `POST /api/coffee/regerar` com o PK da linha, mostra spinner na linha, ao completar atualiza a lista (`refresh()` do hook)
  - Botao "Logs" (icone): abre `LogDrawer` com `notaPk` da linha
- Apos um regerar por linha, a lista e atualizada automaticamente (a nota pode mudar de classificacao e sair da lista "gerada")

### 5.6 Refresh automatico

Apos qualquer regerar (input ou por linha), chama `refresh()` do `useCoffeeNotas` para atualizar a tabela.

---

## 6. Rename Header

Em `frontend/src/coffee/coffee-hub.tsx`, no array `SUBS`:
- Trocar `{ id: "geradas", label: "Geradas" }` por `{ id: "geradas", label: "Gerar" }`

O `id` permanece `"geradas"` em todos os lugares (tipo, sessionStorage, rotas). So o label visual muda.

---

## 7. Arquivos afetados

### Novos
| Arquivo | Responsabilidade |
|---------|-----------------|
| `frontend/src/coffee/coffee-log-table.tsx` | Componente LogTable reutilizavel |
| `frontend/src/coffee/coffee-log-drawer.tsx` | Drawer lateral contextual |
| `frontend/src/coffee/coffee-logs.tsx` | Sub-pagina Logs |
| `frontend/src/coffee/use-coffee-logs.ts` | Hook de fetch de logs |

### Modificados
| Arquivo | Mudanca |
|---------|---------|
| `frontend/src/types.ts` | Adicionar `"logs"` ao `CoffeeSubPage` |
| `frontend/src/coffee/types.ts` | Adicionar interface `CoffeeLog` |
| `frontend/src/coffee/coffee-hub.tsx` | Adicionar tab Logs, rename Geradas->Gerar, import novos componentes |
| `frontend/src/components/sidebar.tsx` | Adicionar `{ id: "logs", label: "Logs" }` ao COFFEE_SUBS |
| `frontend/src/coffee/coffee-geradas.tsx` | Reescrever: zona regerar + card resultado + tabela com acoes |
| `frontend/src/coffee/coffee-corrigidas.tsx` | Adicionar botao de logs por linha + LogDrawer |
| `frontend/src/coffee/coffee-pendentes.tsx` | Adicionar botao de logs por linha + LogDrawer |

---

## 8. Fora de escopo

- Sub-pagina "Verificar" como triagem embutida (Sub-projeto 3 — depende de acesso ao algoritmo de validacao)
- Paginacao com offset na UI de logs (volume baixo, limit basta)
- Filtro por range de data nos logs (backend nao suporta)
- Regerar em lote (a rota /regerar e individual; lote seria escopo novo)
- Limpeza/retencao automatica de logs

---

## 9. Verificacao

- Sub-pagina Logs aparece no header e sidebar do CoffeeHub.
- Filtros de tipo/nota/limite funcionam e atualizam imediatamente.
- LogDrawer abre e fecha com animacao suave, overlay funciona, ESC fecha.
- LogDrawer mostra logs filtrados por nota em modo compacto.
- Sub-pagina Gerar: input + regerar funciona, spinner durante request.
- Card de resultado mostra transicao (anterior -> novo) quando houver.
- Card mostra estado atual quando nao houver transicao.
- Erro de regerar mostra banner vermelho.
- Tabela de geradas tem botoes Regerar e Logs por linha.
- Regerar por linha atualiza a tabela automaticamente.
- Header do CoffeeHub mostra "Gerar" em vez de "Geradas".
- Corrigidas e Pendentes tem botao de logs por linha.
- `npm run build` sem erros.
