# EDP Verify — De olho no Problema

Painel de triagem de notas SAP: importa a planilha de verificação, lista as
notas com falhas (coordenada, imagens, referência, duplicata…), permite
comparar duplicatas lado a lado e abrir notas direto no COFFEE.

## Estrutura

```
├── frontend/   React 18 + TypeScript + Vite + TanStack Query
│   └── src/
│       ├── components/   shared, dashboard, sidebar, upload-screen,
│       │                 duplicate-compare, coffee-section, tweaks-panel
│       ├── hooks/        useTriageData (TanStack Query)
│       ├── api.ts        integração com o backend + COFFEE/Maps
│       ├── data.ts       dataset de demonstração (offline)
│       └── types.ts      tipos compartilhados
├── backend/    FastAPI + pandas
│   ├── main.py           endpoints /api/* + parsing da planilha
│   └── test_upload.py    testes (pytest)
└── docs/       especificações de design
```

## Desenvolvimento

```bash
# Terminal 1 — backend (porta 8000)
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Terminal 2 — frontend (porta 5173, com proxy /api → :8000)
cd frontend
npm install
npm run dev
```

Sem backend, o app funciona em **modo demo** ("ver demonstração" na tela
inicial). A base da API é configurável via
`localStorage.setItem('edp_api', 'http://SEU_HOST:8000/api')`.

## Produção

```bash
cd frontend && npm run build   # gera frontend/dist/ (não versionado)
cd ../backend && uvicorn main:app
```

O FastAPI serve `frontend/dist/` como estático e expõe a API no mesmo
processo (porta 8000).

## API

| Ação                  | Requisição                     | Retorno |
|-----------------------|--------------------------------|---------|
| Carregar dados        | `GET  /api/data`               | `{ records, completed, rule_stats, … }` |
| Importar planilha     | `POST /api/upload` (multipart) | `{ status, total }` |
| Concluir / reabrir    | `POST /api/complete/{id}`      | `{ status, completed }` (toggle) |
| Marcar como duplicata | `POST /api/duplicata/{id}`     | `{ status }` |

## Testes

```bash
cd backend && python -m pytest test_upload.py   # backend
cd frontend && npm run build                    # type-check (tsc) + build
```
