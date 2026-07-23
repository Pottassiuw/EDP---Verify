# Manual do Desenvolvedor — Visão Geral

## O que é este projeto

O EDP Verify ("De olho no Problema") é um painel de triagem de notas SAP
para a equipe de manutenção da EDP. Ele importa a planilha de verificação,
lista notas com falhas (coordenada, imagens, referência, duplicata…) e
permite comparar duplicatas lado a lado. Três módulos principais cobrem o
fluxo de trabalho do usuário: **Verificar** (triagem inicial da planilha),
**COFFEE** (gera e acompanha notas reais no SAP a partir das notas
triadas) e **Input** (gestão contínua das notas do departamento, cruzando
bases SAP IW28/IW38/IW66). O usuário tipicamente triagem na aba Verificar,
envia notas válidas para a fila do COFFEE, e usa o Input para
acompanhamento e correção de dados no dia a dia.

## Arquitetura

O frontend segue arquitetura feature-first: `features/{verificar, coffee,
input, configuracoes}` concentram a lógica de negócio de cada módulo, e
`components/{ui, branded}` ficam reservados a código genérico e reutilizável
— `components/ui/` é o shadcn vendorizado (editável) e `components/branded/`
são composições sobre `ui/`. Essa regra está registrada em `CLAUDE.md`
("Business logic belongs inside features. Global folders should contain
only reusable code.").

Essa estrutura foi introduzida no SP1
([spec](../superpowers/specs/2026-07-06-refatoracao-sp1-limpeza-estrutura-design.md)).
Antes do SP1, o frontend estava "meio feature-first": `coffee/` e `input/`
já eram features, mas a feature Verificar vivia espalhada em `components/`
(dashboard, upload-screen, kpi-drawer, duplicate-compare, shared)
misturada com o shell da aplicação (`app-sidebar`) e o código vendorizado
(`ui/`, `branded/`). O SP1 moveu esses arquivos de Verificar para
`features/verificar/` com `git mv`, deixando uma feature = uma pasta em
todo o frontend.

## Stack

### Frontend

- **React 18** — biblioteca de UI usada em todo o frontend.
- **TypeScript** — tipagem estática; `CLAUDE.md` proíbe `any` e pede
  `unknown` ou tipos próprios.
- **Vite** — build tool e dev server (`npm run dev` sobe em `:5173` com
  proxy `/api` → `:8000`, conforme README).
- **Tailwind v4** — o preflight global foi ligado no SP2a, substituindo o
  hack `.ui-reset` que existia antes (detalhado em
  `04-frontend-shared.md`).
- **Radix UI via shadcn** (`components/ui/`) — vendorizado, mas é
  editável diretamente por decisão explícita registrada em `CLAUDE.md`
  ("`src/components/ui/` is vendored, but it is project code — edit it
  directly to theme, resize, or adjust a primitive's default behavior.").
  Ver `04-frontend-shared.md`.
- **React Query** — solução padrão de estado de servidor, conforme
  `CLAUDE.md` ("React Query is the default server state solution.").
- **Lucide** — biblioteca de ícones usada nos componentes (ex.:
  `ChevronDown` em `app-sidebar.tsx`).
- **Sonner** — usada para toasts (`Toaster` em `App.tsx`); não foi
  encontrada uma justificativa documentada além de ser a lib de toast
  listada no stack do `CLAUDE.md`.

### Backend

- **FastAPI** — framework do backend; `CLAUDE.md` pede endpoints finos
  ("validate, call services, return responses").
- **Python** — linguagem do backend.
- **Pandas** — usado para ler a planilha de upload (`pd.read_excel`/
  `pd.read_csv` em `backend/main.py`) e, no `input_module`, para cruzar as
  bases SAP IW28/IW38/IW66 (detalhado em `06-backend-input-module.md`).
- **OpenPyXL** — leitura/escrita de arquivos `.xlsx` (dependência de
  suporte do Pandas para Excel).
- **httpx** — cliente HTTP usado em `coffee_module/client.py` para a
  integração com a API externa do COFFEE (detalhado em
  `05-backend-coffee-module.md`).

Uma decisão notável do módulo Input: o cache local em SQLite
(`salvar_base_dataframe`/`carregar_base_dataframe`) substituiu a leitura
direta de Excel a cada requisição — detalhado em
`06-backend-input-module.md`.

## Como rodar localmente

Comandos extraídos do `README.md` e de `frontend/package.json`/
`backend/requirements.txt`:

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

O app exige o backend rodando — não há modo demo (removido no SP1). A base
da API é configurável via
`localStorage.setItem('edp_api', 'http://SEU_HOST:8000/api')`.

Build de produção (`README.md`):

```bash
cd frontend && npm run build   # gera frontend/dist/ (não versionado)
cd ../backend && uvicorn main:app
```

O FastAPI serve `frontend/dist/` como estático e expõe a API no mesmo
processo (`backend/main.py:330-332`).

Testes (`README.md`):

```bash
cd backend && python -m pytest test_upload.py test_input_module.py   # backend
cd frontend && npm run build                    # type-check (tsc) + build
```

## Mapa dos módulos

| Módulo | Caminho | O que faz | Doc detalhado |
|---|---|---|---|
| Relatórios | `frontend/src/features/relatorios/` | Home do app: dashboard vivo do Plano de Recomposição (hero do mês, visão anual, mensalização, saldo por regional, financeiro) | [04-frontend-shared.md](./04-frontend-shared.md) |
| Verificar | `frontend/src/features/verificar/` | Triagem da planilha, upload, KPIs, comparação de duplicatas | [01-frontend-verificar.md](./01-frontend-verificar.md) |
| COFFEE | `frontend/src/features/coffee/` | Geração de notas no SAP via COFFEE, consulta de status, correção, logs | [02-frontend-coffee.md](./02-frontend-coffee.md) |
| Input | `frontend/src/features/input/` | Gestão de notas do departamento, edição em lote, sincronização SAP | [03-frontend-input.md](./03-frontend-input.md) |
| Compartilhado | `frontend/src/components/`, `frontend/src/features/configuracoes/`, `frontend/src/context/`, `frontend/src/hooks/` | shadcn (`ui/`), composições (`branded/`), sidebar, tema/densidade/accent, hooks utilitários | [04-frontend-shared.md](./04-frontend-shared.md) |
| Backend — coffee_module | `backend/coffee_module/` | Integração com COFFEE/SAP, jobs em background, classificação de notas | [05-backend-coffee-module.md](./05-backend-coffee-module.md) |
| Backend — input_module | `backend/input_module/` | Cruzamento IW28/IW38/IW66, cache SQLite, sincronização SAP | [06-backend-input-module.md](./06-backend-input-module.md) |
| Fluxos de negócio | (cross-cutting) | Ciclo de vida de uma nota, regra de geração COFFEE, timings consolidados | [07-fluxos-de-negocio.md](./07-fluxos-de-negocio.md) |
| Backend — integracao_module | `backend/integracao_module/` | Ponte COFFEE → Input: monta revisão de uma nota gerada e move (cria/atualiza) o registro correspondente no plano | [08-integracao-coffee-input.md](./08-integracao-coffee-input.md) |
| Backend — databricks_module | `backend/databricks_module/` | Integração genérica e reutilizável com o Databricks SQL Warehouse (client, config, descoberta de schema); base da Carteira de Notas | [09-backend-databricks-module.md](./09-backend-databricks-module.md) |
| Backend — carteira_module | `backend/carteira_module/` | Projeção local da base COFFEE (Databricks), sync idempotente, situação derivada e API do explorador da Carteira de Notas | [10-backend-carteira-module.md](./10-backend-carteira-module.md) |
| Carteira | `frontend/src/features/carteira/` | Explorador da base COFFEE (Databricks): tabela paginada, filtros, situação, detalhe e sincronização — primeira feature na direção visual Supabaze (DESIGN.md) | [11-frontend-carteira.md](./11-frontend-carteira.md) |
| Backend — core (Verificar) | `backend/main.py` | Endpoints `/api/upload`, `/api/data`, `/api/complete`, `/api/duplicata`; monta os routers de `coffee_module`/`input_module` | (sem doc dedicado — coberto neste overview e em 07) |

## Pontos de atenção

- `backend/main.py:78-79` e `backend/main.py:90-91` — `save_state()` e
  `load_state()` engolem qualquer exceção com `except Exception: pass`,
  sem log nem mensagem — contraria a regra de `CLAUDE.md` ("Never
  silently ignore exceptions").
- `backend/main.py:61-63` — `RECORDS`/`COMPLETED` são estado global
  em memória do processo Python (não por sessão/usuário), persistido em
  `backend/app_state.json` só nos pontos em que `save_state()` é chamado
  explicitamente; um restart sem esse arquivo perde o estado da última
  planilha carregada.
- `backend/main.py:17-22` — CORS liberado para `allow_origins=["*"]`,
  `allow_methods=["*"]`, `allow_headers=["*"]`.
- `backend/main.py:37-53` — o agendador da extração noturna do SAP não usa
  um scheduler de verdade: é um `while True` que testa `hour == 3 and
  minute == 0` a cada 30 segundos e depois dorme 61 minutos para não
  repetir no mesmo minuto.
