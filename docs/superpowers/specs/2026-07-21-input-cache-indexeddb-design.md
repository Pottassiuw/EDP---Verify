# Cache persistente do Input em IndexedDB (Dexie)

**Data:** 2026-07-21
**Status:** aprovado (conversa 2026-07-21)

## Problema

O dataset do Input (`GET /api/input/notas`, 16k+ notas com colunas
dinâmicas) vive só no cache em memória do React Query. Todo F5 ou
reabertura do app joga o cache fora e refaz o fetch pesado (o backend
monta o payload inteiro via pandas), deixando o usuário olhando
"Carregando…" por segundos. A persistência IndexedDB estava registrada
como evolução adiada desde a spec da integração (ver
`2026-07-17-relatorios-home-design.md`, seção "Fora de escopo").

## Decisões (com o usuário)

- **Escopo:** só o módulo Input — snapshots de `notas` (InputDataset) e
  `ramal` (RamalDataset). Relatórios e COFFEE ficam como estão.
- **Comportamento:** stale-while-revalidate — ao abrir, a grade aparece
  instantânea com o snapshot do IndexedDB; a revalidação contra o
  backend roda em paralelo e troca os dados quando chega.
- **Biblioteca:** Dexie.js, sempre (regra do projeto para qualquer uso
  de IndexedDB — nunca a API crua).
- **Cache é somente leitura:** não há edição offline. `PATCH`/`POST`
  continuam exigindo backend; o refetch pós-escrita regrava o snapshot.
- **Backend fora do ar:** em vez do erro seco atual, a UI mostra o
  snapshot com aviso "dados de {salvoEm} — backend indisponível".

## Arquitetura (abordagem A — snapshot por dataset)

Uma tabela Dexie `snapshots` com **uma linha por dataset**, chaveada por
nome. Nada de tabela por registro (YAGNI: a grade consome o array
inteiro; o backend só versiona o dataset como um todo) e nada de
persister genérico do React Query (dependência extra, serializa queries
fora do escopo).

### Novo arquivo `frontend/src/features/input/cache.ts`

```ts
interface Snapshot {
  chave: string;            // 'input-dados' | 'ramal-dados'
  versao: string | null;    // meta.versao (informativo; null no ramal)
  salvoEm: string;          // Date.toISOString(), exibido no aviso offline
  dados: unknown;           // InputDataset | RamalDataset
}

class EdpVerifyCache extends Dexie {
  snapshots!: Table<Snapshot, string>;
  constructor() {
    super('edp-verify');
    this.version(1).stores({ snapshots: 'chave' });
  }
}
```

Funções exportadas (todas best-effort):

- `lerSnapshot(chave): Promise<Snapshot | null>`
- `gravarSnapshot(chave, versao, dados): Promise<void>`

Falha de IndexedDB (modo privado, quota, browser antigo) **não pode
quebrar o fluxo**: as duas funções capturam o erro e retornam
`null`/resolvem normalmente, com comentário explicando que cache é
camada opcional — o app degrada para o comportamento atual (fetch
direto). Não é "engolir exceção" de regra de negócio: é a definição da
camada (cache indisponível ≡ cache vazio).

### Mudança em `use-input-data.ts` (e `use-ramal-data.ts`)

1. **Bootstrap (uma vez por montagem do app):** efeito lê
   `lerSnapshot('input-dados')`; se a query `['input-dados']` ainda não
   tem dado, semeia com
   `queryClient.setQueryData(KEY, dados, { updatedAt: Date.parse(salvoEm) })`.
   O `updatedAt` antigo marca o dado como stale ⇒ o React Query dispara
   o refetch de revalidação sozinho no mount — é o mecanismo padrão da
   lib fazendo o stale-while-revalidate, sem estado manual.
2. **Escrita:** toda resposta bem-sucedida de `InputApi.dados()` regrava
   o snapshot (`gravarSnapshot('input-dados', meta.versao, dataset)`),
   dentro do próprio `queryFn` (após o retorno) — um único ponto de
   escrita.
3. **Aviso offline:** o hook passa a expor também
   `{ deCache: boolean; salvoEm: string | null }` (derivado: query com
   `error` e `data` presente ⇒ dado é do snapshot). `input-section.tsx`
   troca o erro bloqueante por banner discreto quando houver dado de
   cache para mostrar.

O poll de `/sync` (60s) e o toast "dados atualizados por outro usuário"
continuam intocados — seguem sendo o invalidador entre sessões abertas.

### Fluxo (abertura do app)

```
IndexedDB(snapshot) ──seed──► React Query cache ──render──► grade instantânea
                                   │ (stale)
                                   └─refetch──► GET /input/notas ──► troca dados
                                                     └──► gravarSnapshot(novo)
```

Backend fora: o refetch falha, `data` (seed) permanece, `error` chega
junto ⇒ banner "dados de {salvoEm} — backend indisponível".

## Dependências

- `dexie` (npm). Mantida, madura, zero transitive pesada. Única adição.

## Erros

- Dexie indisponível ⇒ comportamento atual (fetch direto), sem aviso.
- Snapshot corrompido (JSON inválido/estrutura antiga) ⇒ `lerSnapshot`
  descarta (delete da linha) e retorna `null`.
- Evolução de schema do dataset: a `versao` global do backend muda a
  cada alteração de dados, mas não protege contra mudança de *formato*;
  como o seed é sempre revalidado no mount, um formato velho vive no
  máximo até o primeiro refetch — aceitável; sem migração de snapshot.

## Testes / validação

O frontend não tem harness de testes automatizados (sem vitest/jest no
package.json) — não vamos introduzir um nesta entrega. Validação:

- `npm run build` (tsc) limpo.
- Roteiro manual: (1) abrir app, popular cache, F5 ⇒ grade instantânea +
  revalidação; (2) derrubar backend, F5 ⇒ grade com banner de dados
  salvos; (3) editar nota ⇒ snapshot regravado (verificar em DevTools >
  IndexedDB); (4) janela anônima ⇒ comportamento atual sem erro.

## Fora de escopo

- Persistência de Relatórios/COFFEE.
- Edição offline / fila de mutações.
- Tabela por registro com índices locais (só se surgir demanda de
  filtro offline).
- Harness de testes do frontend.
