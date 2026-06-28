# Modal Gerar/Consultar — UX por linha + persistência em sessão

**Data:** 2026-06-28
**Branch:** develop
**Escopo:** Frontend (`frontend/src/coffee/coffee-gerar-modal.tsx`)

## Problema / Motivação

Depois de colocar o modal de gerar/consultar em uso, surgiram três atritos:

1. **Não dá pra remover uma linha do modal.** Ids que dão `502`/erro ou foram colados errados ficam presos na lista sem como tirar.
2. **Local de instalação é editável direto na tabela**, o tempo todo — risco de alteração acidental de um campo sensível.
3. **O modal perde tudo ao fechar.** Reabrir zera a lista de notas consultadas, mesmo dentro da mesma sessão de trabalho.

## Objetivos

1. Remover linhas do modal (ação local, não mexe no backend).
2. Local de instalação **read-only por padrão**; edição só sob ação explícita ("Alterar local").
3. Persistir o estado do modal em **sessão** (`sessionStorage`): reabrir mantém as notas consultadas.

## Não-objetivos (YAGNI)

- Não mexer no backend (nenhuma rota nova; `/coffee/local-instalacao`, `/consultar`, `/gerar-lote` continuam como estão).
- Não persistir em `localStorage` (permanente) — é **sessão**, some ao fechar a aba.
- Não tocar nas telas/tabelas da página Geradas (A gerar / Geradas) — só o modal.
- Sub-projeto B (logs/auditoria) é spec separada.

## Decisões (confirmadas com o usuário)

- "Remover da lista" = **remover a linha do modal** (não a fila "A gerar" da página).
- Local: **só exibir** por padrão; botão **"Alterar local"** (cor de destaque, ao lado das demais ações) habilita a edição daquela linha.
- Persistência em **sessão**.

## Design

Tudo em `coffee-gerar-modal.tsx`. O tipo `Row` já tem o estado necessário; entra um campo novo `editando?: boolean`.

### 1. Coluna "Ações" por linha

Nova coluna ao final de cada linha, com dois botões:

- **Alterar local** — cor de destaque (`var(--accent)` na borda/texto, como o botão "Gerar"). Habilitado só quando a linha está `estado === "ok"`. Ao clicar, `editando = true` para aquela linha:
  - o campo de local vira input editável (máscara `DDD-DD-resto`);
  - o botão vira **Salvar** (mesma posição). Salvar dispara `POST /coffee/local-instalacao { id, local }` com o valor **desmascarado**; em sucesso, atualiza `localAtual`, sai do modo edição (`editando = false`) e dá toast; em erro, mantém o modo edição e dá toast de erro.
  - Salvar fica desabilitado se o valor desmascarado for igual ao `localAtual` (nada a salvar).
- **✕ Remover** — remove a linha da lista (filtra por `id`). Não chama backend. Cor neutra/vermelha discreta.

### 2. Local de instalação read-only por padrão

A coluna **Local de instalação** deixa de renderizar input sempre-editável. Passa a mostrar:
- `estado === "ok"`: o local mascarado como **texto** (`maskLocal(localAtual)`), ou "—" se vazio. Vira input **somente** quando `editando === true`.
- `estado === "consultando"`: "…".
- `estado === "erro"`: vazio (o erro aparece na coluna de status/estado, como hoje).

As funções `maskLocal`/`unmaskLocal` existentes são reaproveitadas sem mudança.

### 3. Persistência em sessão

- **Chave:** `sessionStorage["edp_coffee_gerar_rows"]`.
- **Salvar:** um `useEffect` grava `rows` (JSON) sempre que mudam, enquanto o modal está montado.
- **Hidratar (ao abrir):** em vez de zerar, o efeito de `[open]` carrega as linhas salvas. Em seguida, para cada id em `idsIniciais` que **ainda não** está na lista, dispara `consultar(id)` e adiciona. (Assim "Gerar fila (N)" soma a fila ao que já estava no modal, sem duplicar.)
- **Linhas interrompidas:** ao hidratar, qualquer linha com `estado === "consultando"` (consulta cortada por um fechamento no meio) é **re-consultada**. Linhas `ok`/`erro` ficam como estão (o usuário pode "Consultar" de novo ou remover).
- **Botão "Limpar"** no rodapé (ao lado de Fechar/Consultar/Gerar): esvazia a lista e a chave de sessão. É a forma intencional de recomeçar do zero.
- Remover `setRows([])` do efeito de abertura (o reset deixa de ser automático).

### Layout da linha (referência)

```
ID COFFEE | ID SAP   | LOCAL DE INSTALAÇÃO | STATUS    | AÇÕES
44421     | 10000000 | 733-CF-00000031     | arquivada | [Alterar local] [✕]
                       └ vira input só ao clicar "Alterar local" (botão vira "Salvar")
```

## Tratamento de erro

- Salvar local: erro → toast de erro, mantém o modo edição e o valor digitado para nova tentativa.
- `consultar`/`gerar` mantêm o comportamento atual (já tratados).
- `sessionStorage` indisponível (quota/privado): leitura/gravação em `try/catch` silencioso, igual aos helpers de snapshot já existentes em `App.tsx`.

## Verificação

`cd frontend && npm run build` (sem test runner; check é o build + manual).

Manual (dev server):
1. Consultar ids → local aparece como **texto**; não dá pra editar direto.
2. "Alterar local" numa linha → campo edita com máscara, botão vira "Salvar"; salvar chama `/local-instalacao` e volta a texto.
3. "✕" remove a linha (inclusive linhas de erro/502); backend não é chamado.
4. Fechar e reabrir o modal → a lista continua lá (sessão).
5. "Gerar fila (N)" com o modal já populado → soma os ids da fila sem duplicar os existentes.
6. "Limpar" esvazia a lista e a sessão.
7. Recarregar a aba (F5) mantém a lista; fechar a aba e abrir nova zera (é `sessionStorage`).

## Arquivos afetados

- `frontend/src/coffee/coffee-gerar-modal.tsx` — coluna de ações, local read-only/edição sob botão, persistência em sessão, botão Limpar.
