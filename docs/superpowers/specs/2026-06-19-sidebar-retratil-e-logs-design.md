# Spec — Sub-projeto 1: Sidebar Retratil + Sistema de Logs COFFEE

**Data:** 2026-06-19
**Status:** Aprovado para implementacao

> **Contexto maior:** Este e o Sub-projeto 1 de uma iniciativa de redesign do Hub COFFEE. Entrega a sidebar retratil (UX amigavel) e o sistema de logs completo no SQLite. O Sub-projeto 2 (sub-paginas: Gerar com regerar, Verificar como triagem embutida, UI de logs) depende deste.

## Problema

1. **Sidebar inacessivel para leigos:** A sidebar atual tem 56px fixos (so icones). As sub-paginas COFFEE ficam num flyout acionado por um chevron minusculo — invisivel para usuarios nao tecnicos.
2. **Ausencia total de logs:** O modulo COFFEE nao registra historico de chamadas a API, transicoes de estado das notas, nem acoes do usuario. Nao ha rastreabilidade.

## Solucao

1. Sidebar retratil que colapsa em icones (56px) e expande com labels + sub-itens inline (~220px).
2. Tabela `coffee_logs` no SQLite com registro de API calls, transicoes de estado e acoes do usuario.

---

## 1. Sidebar Retratil

### 1.1 Dois estados

| Estado | Largura | Conteudo |
|--------|---------|----------|
| Colapsada | 56px | Icones, botao de expandir (`>>`) no topo |
| Expandida | 220px | Icones + labels + sub-itens COFFEE inline |

### 1.2 Comportamento

- **Toggle:** Botao no topo da sidebar. Icone `<<` (expandida) ou `>>` (colapsada).
- **Persistencia:** `localStorage("edp_sidebar_expanded")`. Default: `true` (expandida).
- **Animacao:** Transicao de `width` com `transition: width 150ms ease`.
- **Flyout removido:** O flyout atual (popup lateral) e eliminado. Na sidebar colapsada, clicar no icone COFFEE navega para a ultima sub-pagina visitada (comportamento atual do botao principal). Sub-paginas ficam acessiveis pelo header segmentado do `CoffeeHub`.

### 1.3 Layout expandido

```
+----------------------+
|  (o)  EDP Verify [<<]|   <- logo + botao de colapsar
|                      |
|  [T]  Triagem        |   <- item simples
|  [C]  COFFEE     [v] |   <- secao com accordion
|       +- Abrir       |
|       +- Gerar       |   <- renomeado de "Geradas"
|       +- Corrigidas  |
|       +- Pendentes   |
|       +- Verificar   |
|  [I]  Input          |
|                      |
|  ---separador---     |
|  [R]  Relatorios soon|
|  [B]  BI         soon|
|  [G]  Config     soon|
+----------------------+
```

### 1.4 Layout colapsado

Identico ao sidebar atual (56px, so icones), mas:
- Botao de expandir (`>>`) no lugar do logo/brand.
- Sem flyout — sub-paginas COFFEE nao aparecem.
- Tooltip nos botoes (ja existe via `title`).

### 1.5 Accordion COFFEE

- Na sidebar expandida, o item "COFFEE" tem duas areas clicaveis:
  - **Icone + label "COFFEE"**: navega para a secao COFFEE (ultima sub-pagina visitada), igual ao comportamento atual.
  - **Chevron (v / >)**: expande/colapsa os 5 sub-itens do accordion.
- Estado do accordion persistido em `localStorage("edp_coffee_open")`. Default: `true`.
- Clicar num sub-item: escreve em `sessionStorage("edp_coffee_sub")` e chama `setSection("coffee")`.
- Item ativo: barra lateral accent (3px) + fundo `var(--accent-tint)`.
- Chevron do accordion rota: `v` (aberto) / `>` (fechado).

### 1.6 Props

Nenhuma prop nova. O `Sidebar` continua recebendo `{ section, setSection }`. A comunicacao com o `CoffeeHub` sobre a sub-pagina ativa continua via `sessionStorage` — desacoplado.

### 1.7 Responsividade

O botao toggle e suficiente. Nao ha comportamento de hover-to-expand nem breakpoint automatico.

---

## 2. Sistema de Logs (SQLite)

### 2.1 Tabela `coffee_logs`

Criada no mesmo banco `coffee.db` existente, inicializada junto com `notas_coffee` em `inicializar_banco()`.

```sql
CREATE TABLE IF NOT EXISTS coffee_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   TEXT NOT NULL,
    tipo        TEXT NOT NULL,
    acao        TEXT NOT NULL,
    nota_pk     INTEGER,
    detalhes    TEXT,
    sucesso     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_nota_pk ON coffee_logs(nota_pk);
CREATE INDEX IF NOT EXISTS idx_logs_tipo ON coffee_logs(tipo);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON coffee_logs(timestamp);
```

### 2.2 Campos

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `id` | INTEGER PK AUTO | Identificador unico |
| `timestamp` | TEXT | ISO 8601, `datetime.now().isoformat()` |
| `tipo` | TEXT | `'api_call'`, `'transicao'`, `'acao_usuario'` |
| `acao` | TEXT | Nome da acao (ver tabela abaixo) |
| `nota_pk` | INTEGER | PK da nota. NULL se evento generico |
| `detalhes` | TEXT | JSON livre com contexto do evento |
| `sucesso` | INTEGER | 1 = ok, 0 = erro |

### 2.3 Eventos registrados

| tipo | acao | Quando | detalhes (JSON) |
|------|------|--------|-----------------|
| `api_call` | `buscar_nota` | Cada chamada a `GET /json_all/{id}` | `{id, status_http, tempo_ms, erro?}` |
| `api_call` | `arquivar` | Chamada a `GET /sap/{id}/{sap}` | `{id, sap, status_http, erro?}` |
| `api_call` | `desarquivar` | Chamada a `GET /desarquivar/{id}` | `{id, status_http, erro?}` |
| `api_call` | `alterar_local` | Chamada a `GET /local_instalacao/{id}/{local}` | `{id, local, status_http, erro?}` |
| `transicao` | `classificar` | `upsert_nota` detecta mudanca de classificacao | `{anterior, novo, id_sap_anterior, id_sap_atual}` |
| `transicao` | `arquivar_estado` | Nota muda arquivada <-> desarquivada | `{anterior: bool, novo: bool}` |
| `acao_usuario` | `regerar` | Usuario clica "Regerar" na UI | `{id, origem: "ui"}` |
| `acao_usuario` | `busca_lote` | Usuario dispara busca em lote | `{ids: [...], total}` |

### 2.4 Funcao de registro

Nova funcao em `db.py`:

```python
def registrar_log(tipo: str, acao: str, nota_pk: int | None,
                  detalhes: dict | None, sucesso: bool) -> None:
```

Insere um registro na tabela `coffee_logs`. Toda escrita de log passa por esta funcao.

### 2.5 Pontos de integracao no backend

- **`client.py`** — cada funcao (`buscar_nota`, `arquivar`, `desarquivar`, `alterar_local`) chama `registrar_log` com tipo `api_call`, medindo tempo de resposta e capturando erro.
- **`db.py` -> `upsert_nota`** — apos o upsert, se a classificacao mudou em relacao ao valor anterior no banco, chama `registrar_log` com tipo `transicao` e acao `classificar`. Se `arquivado` mudou, registra `transicao` / `arquivar_estado`.
- **`routes.py`** — rotas `/buscar` e `/sap` registram `acao_usuario`. A nova rota `/regerar` (preparacao para o Sub-projeto 2) tambem registra.

### 2.6 Rota de consulta

```
GET /api/coffee/logs?nota_pk={pk}&tipo={tipo}&limit={n}
```

- Retorna logs filtrados, ordenados por `timestamp DESC`.
- Default `limit=100`.
- Resposta: `{ "logs": [...] }`.

### 2.7 Nova rota de regerar (preparacao)

```
POST /api/coffee/regerar
Body: { "id": 12345 }
```

Fluxo:
1. Registra log `acao_usuario` / `regerar`.
2. Chama `client.desarquivar(id)`.
3. Chama `client.buscar_nota(id)`.
4. Chama `db.upsert_nota(...)` com os dados atualizados.
5. Retorna `{ "ok": true, "nota": {...} }`.

A UI para esta rota vem no Sub-projeto 2.

### 2.8 Retencao

Sem limpeza automatica. Volume esperado baixo (dezenas a centenas/dia). Revisitar se necessario.

---

## 3. Arquivos afetados

### Frontend
| Arquivo | Mudanca |
|---------|---------|
| `frontend/src/components/sidebar.tsx` | Reescrever: dois estados, accordion, sem flyout |
| `frontend/src/App.tsx` | Nenhuma mudanca funcional (sidebar props nao mudam) |

### Backend
| Arquivo | Mudanca |
|---------|---------|
| `backend/coffee_module/db.py` | Adicionar tabela `coffee_logs`, funcao `registrar_log`, logica de transicao em `upsert_nota`, funcao `listar_logs` |
| `backend/coffee_module/client.py` | Adicionar logging em cada funcao |
| `backend/coffee_module/routes.py` | Adicionar rota `/logs`, rota `/regerar`, logging em rotas existentes |

### Nenhum arquivo novo

Todas as mudancas sao em arquivos existentes.

---

## 4. Fora de escopo (Sub-projeto 2)

- Sub-pagina "Gerar" com UI de regerar (input de ID + status + ciclo de vida).
- Sub-pagina "Verificar" como triagem embutida no COFFEE.
- UI de visualizacao de logs no frontend.
- Renomear label "Geradas" -> "Gerar" no header segmentado do `CoffeeHub` (trivial, mas coerente com o Sub-projeto 2 — a sidebar ja mostra "Gerar" desde este sub-projeto).

---

## 5. Verificacao

- Sidebar expande e colapsa com animacao suave.
- Estado da sidebar persiste em localStorage (reload mantem).
- Default: expandida.
- Accordion COFFEE abre/fecha, sub-itens navegam corretamente.
- Na sidebar colapsada, clicar COFFEE navega para ultima sub-pagina.
- Flyout antigo removido.
- Tabela `coffee_logs` criada ao inicializar banco.
- Chamadas a API COFFEE geram logs com tempo de resposta.
- Transicoes de classificacao geram logs automaticamente.
- Rota `GET /api/coffee/logs` retorna logs filtrados.
- Rota `POST /api/coffee/regerar` desarquiva + rebusca + registra logs.
- App builda sem erros (`npm run build`).
