# COFFEE — Verificar como Triagem embutida + correções de navegação, logs e persistência

**Data:** 2026-06-22
**Status:** Design aprovado, aguardando revisão do spec antes do plano de implementação.

## Objetivo

Resolver quatro adendos do hub COFFEE, sendo o central a unificação do fluxo de trabalho:

1. **Navegação** — subseções da sidebar não navegam quando já se está no COFFEE (só o header funciona).
2. **Logs** — não capturam o usuário da máquina (`$USER`); necessário para multiusuário futuro.
3. **Verificar = Triagem embutida** — a planilha de triagem passa a viver dentro da subseção *Verificar*; marcar uma nota como "a gerar" a leva para a aba *Gerar*, que ganha uma tabela das notas que precisam ser geradas.
4. **Persistência** — o estado da planilha Verificar (dados + filtros + seleção) não sobrevive a refresh.

## Decisão de arquitetura central

Hoje o bug de navegação existe porque `section` (em `App.tsx`) e o sub-page do COFFEE (`edp_coffee_sub`, lido por `usePersistedState` na `Sidebar` **e** no `CoffeeHub`, sem sincronização) vivem em lugares diferentes. A solução de base, que destrava as quatro frentes:

**Subir o estado de navegação para `App.tsx` como fonte única de verdade.**

- `App.tsx` passa a ser dono de `section` e `coffeeSub` (ambos via `usePersistedState`).
- `Sidebar` e `CoffeeHub` ficam **controlados**: recebem `section/setSection` e `coffeeSub/setCoffeeSub` por prop. Clicar na sidebar e clicar no header passam a mexer no mesmo estado.
- A planilha de triagem (`Dashboard`) deixa de ser uma seção de topo e passa a ser renderizada **dentro** da subseção `verificar` do COFFEE. `App` continua dono dos dados/handlers de triagem e os repassa por `CoffeeHub → CoffeeVerificar`.
- A seção padrão vira `"coffee"` e o sub padrão vira `"verificar"`.

**Alternativa descartada:** mover a posse dos dados de triagem para um Context (`TriageProvider`). Mais limpo a longo prazo, mas é refactor grande e arriscado para o prazo atual. O `CoffeeHub` já recebe `notes`; o threading de props é incremental. Context fica como melhoria futura se a árvore de props incomodar.

---

## Bloco A — Navegação (sidebar + header sincronizados)

**Arquivos:** `frontend/src/App.tsx`, `frontend/src/components/sidebar.tsx`, `frontend/src/coffee/coffee-hub.tsx`

- `App.tsx`: `const [coffeeSub, setCoffeeSub] = usePersistedState<CoffeeSubPage>("edp_coffee_sub", "verificar")`.
- `Sidebar`: remove o estado interno `activeSub`; recebe `coffeeSub`/`setCoffeeSub` por prop. Sub-item → `setCoffeeSub(sub); setSection("coffee")`. Destaque do item ativo deriva de `coffeeSub`.
- `CoffeeHub`: remove o `usePersistedState` próprio; recebe `sub`/`setSub` por prop. Header e sidebar dirigem o mesmo estado.
- As funções `readCoffeeSub`/`writeCoffeeSub`/`readBool`/`writeBool` específicas de sub na sidebar são removidas/reduzidas (a persistência de `coffeeSub` passa a ser do `App`). `edp_sidebar_expanded` e `edp_coffee_open` (estado puramente visual da sidebar) permanecem locais à `Sidebar`.

**Resultado:** navegação funciona da sidebar e do header, persistida em sessionStorage por uma única fonte.

---

## Bloco B — Logs capturando o usuário da máquina

**Arquivos:** `backend/coffee_module/db.py`, `frontend/src/coffee/types.ts`, `frontend/src/coffee/coffee-log-table.tsx`

**Backend (best-effort, como o resto do logging):**
- **Migração idempotente** em `inicializar_banco`: se a coluna não existir (checagem via `PRAGMA table_info(coffee_logs)`), `ALTER TABLE coffee_logs ADD COLUMN usuario TEXT`. A DDL de criação da tabela também passa a incluir `usuario TEXT`.
- Helper `_usuario_atual() -> str`: `getpass.getuser()` dentro de `try/except`, com fallback para `os.environ.get("USERNAME")`/`os.environ.get("USER")` e, no pior caso, `"desconhecido"`. Nunca levanta.
- `registrar_log` popula `usuario` automaticamente em toda inserção. **A assinatura pública não muda** — nenhum chamador (`client.py`, `db.upsert_nota`, `routes.py`) é tocado.
- `listar_logs` passa a devolver `usuario` em cada dict. `_COLUNAS_LOG` ganha `"usuario"`.

**Frontend:**
- `CoffeeLog` ganha `usuario: string | null`.
- `LogTable` ganha coluna **"Usuário"**, escondida no modo `compact` (drawer), igual ao tratamento já dado à coluna "Nota".

**Decisão:** captura no momento do registro (lado servidor). Como backend e frontend rodam na máquina do operador, `getpass.getuser()` reflete o operador real. Se o backend virar central/remoto, troca-se a fonte para um header de identidade sem mexer no schema.

---

## Bloco C — Verificar = Triagem embutida + flag "a gerar" + tabela na aba Gerar

### C.1 — Mover a triagem para dentro de Verificar (frontend)

**Arquivos:** `frontend/src/App.tsx`, `frontend/src/components/sidebar.tsx`, `frontend/src/coffee/coffee-hub.tsx`, `frontend/src/coffee/coffee-verificar.tsx`, `frontend/src/types.ts`

- Remove o item "Triagem" da `Sidebar` (modo expandido e colapsado). Sobram COFFEE e Input.
- `App.tsx` deixa de renderizar `UploadScreen`/`Dashboard` no nível da seção. Passa os dados/handlers de triagem para `CoffeeHub`, que repassa para `CoffeeVerificar`: `notes, completed, dupResolved, onToggleComplete, onMarkMany, onMarkDuplicate, onSendToCoffee`, mais `t` (tweaks), `source`, `file`, `onReset` (nova planilha), `onUpload`, `onDemo`.
- **`CoffeeVerificar` vira um gate de entrada:**
  - Sem planilha carregada (`notes.length === 0` e nenhum snapshot) → renderiza `UploadScreen` (demo/upload).
  - Com planilha → renderiza `TopBar` (com "↑ Nova planilha") + `Dashboard` (a triagem real existente: filtros, regras, fila, detalhe).
- `AppSection` perde `"triagem"`. A seção padrão vira `"coffee"`; sub padrão `"verificar"` (decisão: app abre em COFFEE → Verificar com upload embutido).

### C.2 — Flag "a gerar" no banco (backend)

**Arquivos:** `backend/coffee_module/db.py`, `backend/coffee_module/routes.py`

- **Migração idempotente** em `inicializar_banco`: se a coluna não existir (`PRAGMA table_info(notas_coffee)`), `ALTER TABLE notas_coffee ADD COLUMN a_gerar INTEGER NOT NULL DEFAULT 0`. DDL de criação inclui `a_gerar INTEGER NOT NULL DEFAULT 0`.
- `listar_notas` passa a incluir `a_gerar` (bool) em cada dict e a suportar o filtro especial `status="a_gerar"` → retorna linhas com `a_gerar=1` (independente da `classificacao`).
- Nova função `db.marcar_gerar(pk: int, a_gerar: bool) -> None`: seta a coluna na linha existente.
- **Nova rota** `POST /api/coffee/marcar-gerar` body `{id: int, a_gerar: bool}`:
  - Garante que a nota existe em `notas_coffee`. Se não existir, faz `client.buscar_nota(id)` + `db.upsert_nota(...)` antes. Se a busca falhar, devolve erro claro (HTTP 502/422) e loga `acao_usuario`/`marcar_gerar` com `sucesso=False`.
  - Seta `a_gerar` e registra `acao_usuario`/`marcar_gerar` (com `usuario`, via Bloco B). Retorna `{ok: true}`.
- **Limpeza automática:** `POST /regerar`, ao concluir com sucesso, chama `db.marcar_gerar(pk, False)` antes de retornar. A nota sai da lista "a gerar" quando é efetivamente gerada (decisão: limpar ao regerar com sucesso).

### C.3 — Ação na triagem para marcar "a gerar"

**Arquivos:** `frontend/src/components/dashboard.tsx` (painel de detalhe e barra de ações em lote)

- Botão dedicado **"Marcar p/ gerar"** (separado de "Concluir" para não confundir a semântica de triagem com a de geração), no detalhe da nota e na seleção em lote.
- Chama `POST /api/coffee/marcar-gerar {id, a_gerar:true}` e dá feedback (sucesso/erro inline).
- **Vínculo de dados:** o elo triagem↔COFFEE é o número da nota (`id` numérico = `pk` em `notas_coffee`). Notas com id não-numérico têm o botão desabilitado (mesma regra `/^\d{5,12}$/` que o `sendToCoffeeQueue` já aplica).
- `onSendToCoffee` (fila de abertura) permanece intacto — é outro fluxo.

### C.4 — Aba Gerar mostra "as que precisam ser geradas"

**Arquivos:** `frontend/src/coffee/coffee-geradas.tsx`

- Acima da tabela de geradas, nova seção **"A gerar"** que lê `useCoffeeNotas("a_gerar")`:
  - Vazia → mensagem leve ("Nenhuma nota marcada para gerar.").
  - Com itens → tabela com **Regerar** por linha (fluxo existente) + **Logs**. Regerar com sucesso some a linha daqui (flag limpa em C.2) e atualiza a tabela de geradas.
  - **"Regerar todas"** — botão que regenera todas as marcadas em sequência, com feedback de progresso (ex.: "3/8…"), desabilitado durante a execução (decisão: por linha + lote).
- A tabela "Geradas" existente continua abaixo. O aviso "Nenhuma nota gerada encontrada…" só aparece quando **ambas** as seções estão vazias — resolvendo a observação original.

---

## Bloco D — Persistir o estado da planilha Verificar

**Arquivos:** `frontend/src/App.tsx`, `frontend/src/components/dashboard.tsx`, `frontend/src/hooks/useTriageData.ts`

Escopo escolhido: **dados + filtros + seleção**.

- **Dados:** persistir `notes`, `completed`, `dupResolved`, `file`, `source` em `sessionStorage` (`edp_triage_snapshot`). Ao montar, `App` re-hidrata daí antes de cair no upload. Refresh restaura a triagem exatamente como estava, sem refetch nem voltar à tela de upload.
  - **Cota:** gravação em `try/except` (best-effort); se estourar a cota do `sessionStorage`, degrada para o comportamento atual (recarrega). Serializar só o necessário (sem campos derivados).
  - `useTriageData` deixa de sobrescrever um snapshot válido — só busca do backend se não houver snapshot.
- **Filtros:** já persistem via `usePersistedState` (`edp_verify_*`). Mantidos.
- **Seleção:** `selId` no `Dashboard` passa de `useState` para `usePersistedState("edp_verify_sel")`. Fila colapsada já persiste em `localStorage`.
- **Invalidação:** "↑ Nova planilha" e novo upload limpam o snapshot e os filtros (`limparFiltrosVerify` já existe).

---

## Verificação final (critérios de aceite)

- [ ] Clicar numa subseção COFFEE na sidebar navega, mesmo já estando no COFFEE; header e sidebar destacam o mesmo item. (A)
- [ ] `coffee_logs` tem coluna `usuario`; novos logs gravam o usuário da máquina; `LogTable` mostra a coluna "Usuário". (B)
- [ ] Item "Triagem" sumiu do topo; a triagem aparece dentro de COFFEE → Verificar. (C.1)
- [ ] App sem planilha abre em COFFEE → Verificar mostrando upload/demo. (C.1)
- [ ] `notas_coffee` tem coluna `a_gerar`; `POST /marcar-gerar` seta a flag e garante a linha; `GET /notas?status=a_gerar` retorna as marcadas. (C.2)
- [ ] `POST /regerar` com sucesso limpa a flag `a_gerar`. (C.2)
- [ ] Triagem tem botão "Marcar p/ gerar" (detalhe + lote), desabilitado para id não-numérico. (C.3)
- [ ] Aba Gerar mostra seção "A gerar" (com Regerar por linha, Logs e "Regerar todas") acima das Geradas; aviso de vazio só quando ambas vazias. (C.4)
- [ ] Refresh na Verificar restaura dados + filtros + nota selecionada, sem voltar ao upload. (D)
- [ ] `cd backend && .venv/Scripts/python.exe -m pytest test_coffee_module.py -q` verde.
- [ ] `cd frontend && npm run build` sem erros.

## Fora de escopo

- Filtro de logs por usuário (só exibição agora).
- Identidade real multiusuário (auth/headers) — preparado pelo schema, não implementado.
- Paginação/retenção de logs.
- Regerar todas com paralelismo (será sequencial).
- Migrar posse dos dados de triagem para Context.
