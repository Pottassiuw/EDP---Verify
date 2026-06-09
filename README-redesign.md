# EDP Verify — Redesign do painel (Direção B · Triagem)

Redesign do painel "De olho no Problema". Front-end em **TypeScript** (React via
CDN, compilado no navegador pelo Babel — preset `typescript`), com **camada de
integração ao backend FastAPI** existente e **fallback de demonstração** offline.

## Stack

- **React 18.3.1** (UMD, sem bundler) + **Babel Standalone 7.29** com preset
  `typescript`/`react` — os `.ts`/`.tsx` rodam direto no navegador, com os tipos
  removidos em runtime.
- **TypeScript strict, sem `any`.** Tipos centralizados em `types.ts`.
- Checagem real no seu repo: `tsconfig.json` (strict) + `.eslintrc.json`
  (`@typescript-eslint/no-explicit-any: error` e regras `no-unsafe-*`).

```bash
# no seu repo, antes do commit:
npx tsc --noEmit          # type-check strict
npx eslint "*.ts" "*.tsx" # lint (no-any)
```

> Observação: o ambiente de protótipo não roda `tsc`/`eslint` — eles pertencem
> ao seu pipeline (FastAPI + front). Os arquivos já estão prontos e tipados.

## Rodar

Precisa ser **servido** (não abra com `file://` — os scripts `.tsx`/`.css` não
carregam por CORS):

```bash
python -m http.server 5173
# abra http://localhost:5173/EDP%20Verify%20-%20Painel%20de%20Triagem.html
```

- **Sem backend:** clique em *"ver demonstração"* → roda com dados de exemplo.
- **Com backend:** suba o FastAPI (`uvicorn main:app --reload` em `backend/`).
  Ao importar uma planilha, o app envia para a API e recarrega os dados reais.
  Se já houver planilha carregada no servidor, o painel restaura sozinho.

## Funcionalidade de duplicatas

Quando uma nota não gerou por suspeita de **duplicata**, o backend deve mandar a
regra `chk_duplicata` e a lista de candidatas em `duplicates[]`. O painel então:

1. Mostra um banner *"Possível duplicata · N candidatas"* no detalhe.
2. Compara, lado a lado, a nota aberta com cada candidata, destacando os
   **campos-chave** (local instal. · ID SAP · descrição · poste): ✓ verde quando
   coincide, ≠ âmbar quando diverge, e um selo `n/4 campos-chave`.
3. **Verificação no COFFEE:** um botão `☕ COFFEE` por candidata (abre só aquela)
   **e** um `☕ Abrir todas no COFFEE` (uma aba por candidata).
4. Confirmada a duplicata, `⧉ Marcar como duplicata` registra a nota (e a conclui,
   tirando-a da fila). Como esta planilha é só de notas que não geraram, marcar
   como duplicata é a resolução do caso.

### Formato esperado de uma candidata (backend)

```jsonc
{
  "id": "104726640",
  "match": ["local_instalacao", "id_sap", "descricao", "poste"],
  "local_instalacao": "SER-11", "id_sap": "45472881",
  "descricao": "Ponto quente em conexão de MT", "poste": "TR-088",
  "tipo_nota": "...", "setor": "...", "uf": "...", "prioridade": 2,
  "latitude": "-20.31", "longitude": "-40.29"
}
```

## Integração com a API

`api.ts` fala com os endpoints de `backend/main.py`:

| Ação                  | Requisição                       | Retorno |
|-----------------------|----------------------------------|---------|
| Carregar dados        | `GET  /api/data`                 | `{ records, completed, ... }` (records incl. `duplicates[]`) |
| Importar planilha     | `POST /api/upload` (multipart)   | `{ status, total }` |
| Concluir / reabrir    | `POST /api/complete/{id}`        | `{ status, completed }` (toggle) |
| Marcar como duplicata | `POST /api/duplicata/{id}`       | `{ status }` *(novo — implementar no FastAPI)* |

**Base da API configurável** (caso o backend não seja `localhost:8000`):

```js
localStorage.setItem('edp_api', 'http://SEU_HOST:8000/api');
```

## Consulta a BI (futuro) — é possível

Sim. O caminho recomendado é o **FastAPI como intermediário**: o painel chama um
endpoint seu (ex.: `GET /api/bi/consulta?...`) e o backend resolve a fonte:

- **Power BI** → REST API / executeQueries (DAX) com Service Principal (Azure AD).
- **Data warehouse / SQL** (de onde o BI lê) → o FastAPI consulta direto — mais
  simples e robusto que passar pelo Power BI.
- **Endpoint próprio do BI** → FastAPI faz proxy + cache.

O front só precisa de JSON. Dá para mockar a UX antes de plugar o real — me diga
qual é o BI (Power BI, Tableau, Metabase, SQL direto…) que eu encaixo.

## Arquivos

| Arquivo | Papel |
|---|---|
| `EDP Verify - Painel de Triagem.html` | Host: carrega React, Babel e os scripts |
| `types.ts` | Tipos compartilhados (domínio, props, globais de `window`) |
| `tokens.css` | Sistema visual (cores da marca EDP, tema claro/escuro, densidade) |
| `api.ts` | Integração com o backend + COFFEE/Maps + `markDuplicate` |
| `data.ts` | Dataset de demonstração (offline) + clusters de duplicata |
| `shared.tsx` | Componentes base (logo, chips, donut, tiles, status) |
| `upload-screen.tsx` | Tela de importação |
| `duplicate-compare.tsx` | Comparação de duplicatas lado a lado + COFFEE |
| `triage-app.tsx` | App: filtros, fila, painel de detalhe, lote, Tweaks |
| `tweaks-panel.tsx` | Painel de Tweaks (tema, densidade, cor de destaque) |
| `tsconfig.json` / `.eslintrc.json` | Config strict para `tsc` + `eslint` no repo |

## Pendências para produção

- Implementar `POST /api/duplicata/{id}` no FastAPI (e a detecção `chk_duplicata`
  + `duplicates[]` no `GET /api/data`).
- O backend não expõe `colaborador` / `imagens_*` / `id_sap` / `descricao` /
  `poste` no topo do registro — o `api.ts` já faz fallback lendo de `raw`, mas
  vale padronizar no backend.
- Botões "COFFEE" e "Google Maps" usam as URLs do `main.js` original — reapontar
  se necessário (`COFFEE_BASE` em `api.ts`).
