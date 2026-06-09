# EDP Verify — Migração Frontend para React + Vite + TanStack Query

**Data:** 2026-06-08  
**Status:** Aprovado

---

## Objetivo

Substituir o frontend atual (React via CDN + Babel Standalone, sem bundler) por uma aplicação Vite + React 18 + TypeScript + TanStack Query, mantendo o backend FastAPI intacto.

---

## Contexto atual

- Frontend: arquivos `.tsx`/`.ts` carregados como `<script type="text/babel">` no HTML, compilados no navegador pelo Babel Standalone.
- Componentes comunicam-se via `window.*` globals (sem `import`/`export`).
- Backend: `main.py` FastAPI na raiz, serve `frontend/` como `StaticFiles`.
- Node.js agora disponível na máquina — viabiliza build real com Vite.

---

## Decisões de design

| Decisão | Escolha | Motivo |
|---|---|---|
| Bundler | Vite 6 | Padrão atual, hot-reload rápido, suporte nativo a TypeScript/JSX |
| UI library | React 18 + TypeScript | Já em uso, sem mudança |
| Estado remoto | TanStack Query v5 | App vai crescer; cache, refetch, loading/error states automáticos |
| Estrutura | `frontend/` + `backend/` | Separação clara entre frontend e backend |
| Build de produção | `frontend/dist/` servido por FastAPI via `StaticFiles` | Um único processo em produção |

---

## Estrutura de pastas

```
EDP Verify/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── shared.tsx
│   │   │   ├── tweaks-panel.tsx
│   │   │   ├── upload-screen.tsx
│   │   │   ├── duplicate-compare.tsx
│   │   │   └── coffee-section.tsx
│   │   ├── hooks/
│   │   │   └── useTriageData.ts
│   │   ├── api.ts
│   │   ├── data.ts
│   │   ├── types.ts
│   │   ├── tokens.css
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   │   └── assets/          ← logos EDP (PNG/SVG)
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts
├── backend/
│   ├── main.py              ← copiado de main.py na raiz + StaticFiles path atualizado
│   └── requirements.txt     ← copiado de requirements.txt na raiz
├── main.py                  ← raiz (manter temporariamente, remover após validação)
├── requirements.txt
└── .venv/
```

---

## Arquitetura em desenvolvimento

```
Browser (localhost:5173)
    │  /api/*  → proxy
    ▼
Vite dev server (:5173)  ──proxy──►  FastAPI uvicorn (:8000)
```

- O `vite.config.ts` configura `server.proxy`: `/api` → `http://localhost:8000`.
- Sem CORS no browser em desenvolvimento.
- FastAPI mantém `CORSMiddleware` para clientes externos.

## Arquitetura em produção

```
Browser → FastAPI (:8000) → serve frontend/dist/ (StaticFiles)
                          → /api/* (endpoints)
```

`backend/main.py` passa a montar (caminho relativo a partir de `backend/`):
```python
import pathlib
DIST = pathlib.Path(__file__).parent.parent / "frontend" / "dist"
app.mount("/", StaticFiles(directory=str(DIST), html=True), name="static")
```

> A linha atual `StaticFiles(directory="frontend", html=True)` será substituída por esta versão com caminho absoluto resolvido via `pathlib`, garantindo que funcione independentemente do diretório de trabalho ao iniciar o uvicorn.

---

## Conversão de globais para módulos ES

### Antes (escopo global)
```ts
// shared.tsx
window.Logo = Logo;
window.PriorityChip = PriorityChip;
```

### Depois (ES modules)
```ts
// src/components/shared.tsx
export function Logo(...) { ... }
export function PriorityChip(...) { ... }
```

### Regras de conversão por arquivo

| Arquivo | Mudança |
|---|---|
| `types.ts` | Remover bloco `interface Window {}` inteiro; manter todos os tipos |
| `api.ts` | Remover `window.EDPApi = ...`; adicionar `export const EDPApi = ...` |
| `data.ts` | Remover IIFEs/globals; adicionar `export const EDP_DEMO = ...`, `export const EDP = ...` |
| `shared.tsx` | Remover `window.X = X` para cada componente; adicionar `export` nas funções |
| `tweaks-panel.tsx` | Idem |
| `upload-screen.tsx` | Idem |
| `duplicate-compare.tsx` | Idem |
| `coffee-section.tsx` | Idem |
| `triage-app.tsx` → `App.tsx` | Remover leituras de `window.*`; adicionar imports ES; exportar `default App` |

---

## Hooks TanStack Query

**`src/hooks/useTriageData.ts`**

```ts
export function useTriageData() {
  return useQuery({ queryKey: ['triage'], queryFn: EDPApi.fetchData });
}

export function useUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: EDPApi.upload,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['triage'] }),
  });
}

export function useToggleComplete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: EDPApi.toggleComplete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['triage'] }),
  });
}

export function useMarkDuplicate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: EDPApi.markDuplicate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['triage'] }),
  });
}
```

---

## Entry point

**`src/main.tsx`**
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReactDOM from 'react-dom/client';
import App from './App';
import './tokens.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
```

---

## Dependências npm

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@tanstack/react-query": "^5.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^6.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
```

---

## Assets

Os logos EDP (`assets/RGB/...`) são copiados de `frontend/assets/` para `frontend/public/assets/`. No código, referenciados como `/assets/...` (caminho público do Vite).

---

## Fluxo de desenvolvimento

```bash
# Terminal 1 — backend
cd backend
uvicorn main:app --reload   # porta 8000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev                 # porta 5173 (com proxy para :8000)
```

---

## Critérios de sucesso

1. `npm run dev` em `frontend/` abre o app em `http://localhost:5173` sem erros de console.
2. `npm run build` em `frontend/` gera `frontend/dist/` sem erros TypeScript.
3. Todas as funcionalidades existentes funcionam: upload de planilha, triagem, duplicatas, tweaks, modo demo.
4. `tsc --noEmit` passa sem erros (strict mode mantido).
