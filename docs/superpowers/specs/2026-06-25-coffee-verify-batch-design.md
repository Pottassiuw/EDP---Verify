# COFFEE — Lote de tarefas da seção Verify

**Data:** 2026-06-25
**Status:** Aprovado

## Contexto

Cinco tarefas independentes da seção **EDP / Verify** (Todoist), agrupadas em um único
spec e plano. Cada tarefa carrega tags `model:` / `reasoning:` nos subtasks do Todoist,
que guiam qual modelo usar na implementação.

| # | Tarefa | Área | Arquivos |
|---|--------|------|----------|
| 1 | Abrir notas em ordem decrescente + bloco editável + abertura sequencial | Frontend | `frontend/src/coffee/coffee-abrir.tsx` |
| 2 | Mover "Verificar" para a 1ª aba do hub | Frontend | `frontend/src/coffee/coffee-hub.tsx`, `frontend/src/App.tsx` |
| 3 | Bug nota 356322 (transição `pendente`) + documentação | Backend | `backend/coffee_module/classify.py`, `jobs.py`, `db.py` |
| 4 | Verificar: fullscreen na nota + "Notas Selecionadas" no KPI | Frontend | `frontend/src/components/dashboard.tsx`, `kpi-drawer.tsx` |
| 5 | Fluxo de geração: checar `arquivado` antes de gerar | Backend | `backend/coffee_module/jobs.py`, `client.py` |

**Ordem de construção sugerida:** 5 → 3 → 1 → 4 → 2 (backends de maior risco/p1 primeiro,
frontends depois).

---

## 1. Abertura em ordem decrescente + bloco editável + abertura sequencial

Arquivo: `frontend/src/coffee/coffee-abrir.tsx`.

### 1a. Ordenar abertura em ordem decrescente (`model:sonnet`, `reasoning:low`)
- As listas passadas para `api.openCoffee` são ordenadas numericamente em ordem
  **decrescente**, igual à ordem do filtro da triagem.
- Afeta o modo **"Todas"** (`openList(remaining)`) e o modo **"Em blocos"** (`next`).
- A exibição dos chips permanece em ordem de inserção; **apenas a ordem de abertura** muda.
- Helper local: `sortDesc(ids) => [...ids].sort((a, b) => Number(b) - Number(a))`.

### 1b. Editar tamanho do bloco por digitação (`model:sonnet`, `reasoning:low`)
- No modo "Em blocos", manter o stepper `−/＋` e adicionar um `<input>` numérico editável
  ligado ao estado `block`, com clamp 1–50.
- Digitar um valor fora do intervalo é normalizado para o limite mais próximo.

### 1c. Feature de Grupos → fallback de abertura sequencial
- Agrupamento real de abas usa `chrome.tabGroups`, que **não** é acessível a JS de página
  web (apenas via extensão de navegador) — portanto fora de escopo.
- Implementar **abertura sequencial escalonada** (best-effort): um pequeno atraso entre
  cada abertura de aba para reduzir bloqueio de pop-ups pelo navegador.
  - Modo "Todas": abre todas as `remaining` em sequência escalonada.
  - Modo "Em blocos": abre o bloco `next` em sequência escalonada.
- Nota de UI de uma linha informando que o agrupamento verdadeiro de abas exige uma
  extensão de navegador (fora de escopo).
- Confirmar o mecanismo atual de `api.openCoffee` no plano antes de implementar o stagger.

### Critérios de aceite
- [ ] Notas abrem em ordem decrescente de ID nos modos "Todas" e "Em blocos".
- [ ] Tamanho do bloco pode ser digitado (além do stepper), com clamp 1–50.
- [ ] Abertura é sequencial escalonada; UI informa que grupos reais exigem extensão.

---

## 2. Mover "Verificar" para a primeira aba

Arquivos: `frontend/src/coffee/coffee-hub.tsx`, `frontend/src/App.tsx`.
(`model:sonnet`, `reasoning:low`)

- Reordenar o array `SUBS` para: `Verificar, Abrir, Gerar, Corrigidas, Pendentes, Logs`.
  As demais abas mantêm a ordem relativa.
- Alterar o `sub` inicial padrão do hub para `"verificar"` em `App.tsx`, para que a página
  abra direto em Verificar (decisão confirmada com o autor).

### Critérios de aceite
- [ ] "Verificar" é o primeiro botão do segmento de navegação do COFFEE.
- [ ] O hub abre por padrão em Verificar.
- [ ] Demais abas mantêm a ordem relativa.

---

## 3. Bug nota 356322 — transição de status presa em "pendente"

Arquivos: `backend/coffee_module/classify.py`, `jobs.py`, `db.py`. **Investigação-gated:**
o subtask de diagnóstico determina o fix exato.

### 3a. Diagnosticar estado da 356322 (`model:opus`, `reasoning:medium`)
- Consultar o `coffee.db` real: `id_sap`, `id_sap_anterior`, `classificacao` da 356322.
- Confirmar qual cenário se aplica:
  - **(a)** A nota nunca foi re-buscada com o SAP real após `definir_sap(PENDENTE)`, então
    o `id_sap` armazenado continua `SAP_PENDENTE` (10000000) → presa em `pendente`.
  - **(b)** `classificar()` não distingue nota **avulsa** (deveria ir `pendente→gerada`) de
    nota de **erro/Verificar** (`pendente→corrigida`): hoje ambas resolvem para `corrigida`
    na re-busca, porque a regra só olha `id_sap_anterior == SAP_PENDENTE`.

### 3b. Corrigir a classificação/persistência (`model:opus`, `reasoning:high`)
- Se confirmado: persistir a **origem** da nota (avulsa vs. erro/Verificar) para que
  `classificar()` resolva corretamente a transição final (`gerada` vs. `corrigida`),
  garantindo que `id_sap_anterior` sobreviva à reclassificação no `upsert_nota`.
- Implementado sob **TDD** (teste cobrindo ambos os caminhos de transição).
- O fix exato é determinado pelo diagnóstico (3a) — a hipótese principal é a marcação de
  origem; se o diagnóstico revelar causa diferente, o fix acompanha.

### 3c. Documentar o fluxo de transição (`model:sonnet`, `reasoning:low`)
- Documentar o fluxo definitivo:
  - Avulsa: `Gerar → Pendentes → Geradas`.
  - Com erro (da Verificar): `Gerar → Pendentes → Corrigidas → Geradas`.
- Explicar como o sistema distingue os dois caminhos.

### Critérios de aceite
- [ ] Estado da 356322 reproduzido/explicado (`id_sap` atual × anterior).
- [ ] Transição `pendente → corrigida/gerada` resolve corretamente, com teste.
- [ ] Fluxo definitivo documentado.

---

## 4. Verificar: fullscreen na nota + "Notas Selecionadas" no KPI

Arquivos: `frontend/src/components/dashboard.tsx`, `kpi-drawer.tsx`.
(`model:sonnet`, `reasoning:low`)

### 4a. Botão fullscreen na visualização de notas
- Adicionar botão **expandir** no cabeçalho do componente `Detail` (o painel de
  visualização da nota, lado direito).
- Clicar renderiza o mesmo conteúdo do `Detail` em um overlay `position:fixed; inset:0`
  com z-index alto; fechar via botão ou tecla **Esc**, voltando à visão normal.

### 4b. Mover notas selecionadas para o KPI lateral ("Notas Selecionadas")
- Passar as notas de `selBatch` (e um handler de remoção) para o `KpiDrawer`.
- Adicionar uma seção **"Notas Selecionadas"** no `KpiDrawer` listando essas notas, com
  remoção por nota, reduzindo a poluição da fila principal.
- A barra de ações em lote (concluir/reabrir/COFFEE/marcar p/ gerar) permanece onde está.
- Adicionar `overflow: auto` onde a seleção atualmente transborda sem rolagem.

### Critérios de aceite
- [ ] Botão expandir abre a nota em visualização fullscreen; fecha via botão/Esc.
- [ ] Notas selecionadas aparecem na seção "Notas Selecionadas" do KPI lateral, com remoção.
- [ ] Área de seleção tem `overflow: auto` (sem quebrar layout com muitas notas).

---

## 5. Fluxo de geração: checar `arquivado` antes de gerar

Arquivos: `backend/coffee_module/jobs.py` (`_rodar_geracao`), `client.py`.
(`model:sonnet`, `reasoning:medium`)

- **Inverter a ordem** em `_rodar_geracao`: chamar `buscar_nota` (GET) **antes** de
  `definir_sap(SAP_PENDENTE)`, para ler `arquivado` + `id_sap` e decidir o fluxo.
- **Branch nota arquivada** (`arquivado == true`): **não** chamar `definir_sap`; apenas
  registrar/retornar id COFFEE (`pk`), id SAP e local de instalação (lido de
  `nota["fields"]`) no resultado do job / log. Nenhuma geração.
- **Branch não arquivada**: seguir o fluxo atual (`definir_sap(PENDENTE)` → re-buscar →
  `upsert_nota` → `marcar_gerar`), **reaproveitando** a primeira busca para evitar GET
  redundante onde possível.
- Ambos os caminhos cobertos sob **TDD**.

### Critérios de aceite
- [ ] `_rodar_geracao` faz `buscar_nota` antes de `definir_sap`.
- [ ] Nota arquivada: não define SAP; retorna id COFFEE, id SAP e local de instalação.
- [ ] Nota não arquivada: segue o fluxo atual; testes cobrem ambos os caminhos.

---

## Mapeamento de modelos (fase de implementação)

Após spec + plano, a implementação usa o modelo/esforço conforme as tags dos subtasks:

| Tarefa / subtask | model | reasoning |
|------------------|-------|-----------|
| 1a ordenar abertura | sonnet | low |
| 1b bloco editável | sonnet | low |
| 2 reordenar nav | sonnet | low |
| 3a diagnosticar 356322 | opus | medium |
| 3b corrigir persistência | opus | high |
| 3c documentar fluxo | sonnet | low |
| 4a fullscreen | sonnet | low |
| 4b notas selecionadas no KPI | sonnet | low |
| 5 fluxo de geração (ambos subtasks) | sonnet | medium |

## Escopo excluído

- Agrupamento real de abas via `chrome.tabGroups` (extensão-only) — apenas fallback sequencial.
- Qualquer mudança nas abas Corrigidas/Geradas/Pendentes/Logs além do necessário.
- Mudanças no fluxo de geração além da checagem de `arquivado`.
