# Módulo Input — Gestão de Notas (porte do painel Streamlit)

**Data:** 2026-06-11
**Status:** aprovado para planejamento

## Contexto

A pasta `Input/` contém um painel Streamlit ("Gestão de Notas EDP") que gerencia
a planilha de Input do departamento: um banco SQLite de notas, enriquecido em
tempo de execução com planilhas Excel da rede da EDP (extrações SAP IW28/IW38,
indicadores ANEEL, custos modulares, clientes por conjunto, ganhos, históricos).
Este documento especifica a reescrita completa desse painel como um módulo do
EDP-Verify (React + TypeScript no frontend, FastAPI + pandas no backend).

Arquivos de referência do original: `Input/app.py` (UI e regras de tela),
`Input/config.py` (dicionários), `Input/database.py` (SQLite, logs, undo,
backups), `Input/processamento.py` (motor de enriquecimento e cópia Excel).
`Input/Sap_Robot.py` está **fora do escopo** — continua rodando à parte,
alimentando os Excels da rede.

## Decisões de projeto (confirmadas com o usuário)

1. **Reescrita completa** — UI em React, lógica no FastAPI; o Streamlit é aposentado.
2. **Banco local ao backend** — SQLite em `backend/data/notas_departamento.db`
   (não mais o `.db` compartilhado na rede).
3. **Excels da rede lidos em runtime** — o backend roda numa máquina com acesso
   a `\\ebeat-fp1\...` e lê os mesmos caminhos do original.
4. **Migração inicial** — na primeira execução, se o banco local não existir e o
   da rede estiver acessível, o backend copia o `.db` da rede.
5. **Cópia Excel da rede preservada** — após cada escrita, regrava
   `Base_Notas_Sincronizada.xlsx` na rede (o BI do departamento não quebra).
6. **Identidade sem senha** — a UI pede o nome da pessoa uma vez (localStorage)
   e envia em cada escrita via header `X-User`; vai para o log de alterações.
7. **Navegação destravada** — o app abre direto na sidebar; "Input" é uma seção
   nova; a tela de upload passa a travar apenas a Triagem.

## Arquitetura

### Backend — `backend/input_module/`

| Arquivo | Papel |
|---|---|
| `config.py` | Porte direto dos dicionários do original (STATUS_MAP, DE_PARA_CIDADES, DE_PARA_REGIONAL, MAP_FILTROS, MAP_ORDEM_EXECUTADA, MAP_REGIONAL_CSD, DE_PARA_CJ_ANEEL, caminhos de rede), sem nada de Streamlit |
| `db.py` | SQLite local: tabelas `notas`, `log_alteracoes`, `log_arquivos` (mesmo schema do original, incl. ALTER TABLE defensivo); upsert em massa; diff e gravação de logs; undo por timestamp; exclusão; backups rotativos (20 arquivos, intervalo 2h) em `backend/data/backups/`; migração inicial a partir do `.db` da rede |
| `engine.py` | Porte de `processamento.py`: carrega o banco local e aplica os cruzamentos — cidades/regionais, indicador de continuidade ANEEL (criticidade + ranking), IW28 (status SAP, ordem, data de encerramento, centro), clientes por conjunto, IW38 (custos planejado/real, % execução, ordem executada), custos modulares (CHI, CI, ocorrências, DEC_PROG_CHI, sazonalidade), DEC/FEC, ganhos CHI-Conj, históricos Table1, topologia de proteção. **Inclui também a coluna `Auditoria_Cronograma`** (regra `avaliar_prazo_sap` do original, hoje calculada na UI) e gera a cópia Excel da rede |
| `routes.py` | `APIRouter` montado em `/api/input` no `main.py` existente |

Decisões:

- **Cache do dataset enriquecido** em memória com TTL de 10 minutos,
  invalidado imediatamente após qualquer escrita.
- **Escritas** disparam, em `BackgroundTasks`: backup rotativo (se vencido o
  intervalo) e regravação da cópia Excel na rede.
- **Resiliência**: Excel de rede ausente/ilegível produz os mesmos fallbacks do
  original ("Pendente Extração SAP", "Fora SAP", zeros, "-") e a resposta de
  `GET /notas` inclui `meta.bases` com o status de cada arquivo de rede.
- **Validação Pydantic** em todos os endpoints de escrita.

### Endpoints

| Método e rota | Função |
|---|---|
| `GET /api/input/notas` | Dataset completo enriquecido + metadados (opções de status/prioridade, situação das bases de rede, timestamp da última alteração) |
| `POST /api/input/notas` | Cadastro individual (valida duplicata, gera `ID_Cronologia`, deriva `Regional` do local de instalação) |
| `POST /api/input/notas/bulk` | Colagem em massa (valida duplicatas no lote e contra o banco; rejeita lote inteiro com lista dos números conflitantes) |
| `PATCH /api/input/notas` | Edição rápida ou em lote: recebe linhas editadas, calcula diff campo a campo contra o banco, grava `log_alteracoes` (um registro por campo alterado, mesmo timestamp por lote), atualiza `Status_Anterior` quando o status muda, faz upsert |
| `DELETE /api/input/notas` | Exclusão por lista de `Numero_Nota` |
| `POST /api/input/desfazer` | Undo do último salvamento: reverte todos os registros de log com o último timestamp e os remove ("Ctrl+Z infinito") |
| `GET /api/input/logs` | Log de alterações (filtros por nota e usuário no cliente) |
| `GET /api/input/logs/arquivos` | Log de atualizações das bases de apoio |
| `GET /api/input/logs/nota/{id}` | Linha do tempo de uma nota |
| `POST /api/input/export` | Gera Excel da seleção (recebe IDs filtrados + colunas visíveis; aplica os nomes amigáveis de coluna do original) |
| `GET/PUT /api/input/responsaveis` | Responsáveis por conjunto (JSON, mesmo formato do original) |
| `GET /api/input/bases` | Lista as bases de apoio da rede com status (encontrada/ausente, data de modificação) |
| `GET /api/input/bases/{nome}/download` | Baixa a base atual da rede |
| `POST /api/input/bases/{nome}` | Substitui a base na rede (grava `log_arquivos`) |
| `GET /api/input/backups` + download | Lista/baixa backups do banco local |
| `GET /api/input/sync` | Timestamp da última alteração (polling leve) |

Escritas exigem header `X-User`; ausência retorna 400.

### Frontend — `frontend/src/input/`

| Arquivo | Papel |
|---|---|
| `types.ts`, `api.ts` | Tipos da nota enriquecida; cliente dos endpoints com `X-User` |
| `input-section.tsx` | Casca da seção com sub-abas: Visão Geral, Gerenciar, Relatórios, Logs, Configurações |
| `notes-table.tsx` | Tabela compartilhada: ordenação por coluna, virtualização de linhas (base com milhares de notas), seleção por checkbox, células editáveis em modo edição |
| `filters.tsx` | Busca global por nº de nota (lista separada por espaço/vírgula/ponto-e-vírgula), filtros avançados (multiselect, texto parcial, faixa numérica — mesmo motor do original, no cliente) e calculadora (soma/média/contagem) |
| `manage.tsx` | Edição rápida inline; edição em lote (status/prioridade/mês aplicados às selecionadas); exclusão com confirmação; cadastro individual; colagem em massa (parse de TSV do clipboard com grade de conferência); botão de undo com modal de confirmação |
| `reports.tsx` | Auditoria de prazos: KPIs (total, no prazo, antecipadas, com atraso, fora do plano, passíveis de encerramento), filtros rápidos e específicos, tabela, gráfico de rosca em SVG próprio (sem lib de gráficos) e export |
| `logs.tsx` | Três visões: alterações nas notas, atualizações de bases, linha do tempo por nota |
| `settings.tsx` | Responsáveis por conjunto (tabela editável), bases de apoio (status + download + upload), backups (lista + download), edição do nome de usuário |

Decisões:

- **Filtragem no cliente**: `GET /notas` traz tudo (TanStack Query, já usado no
  projeto); filtros e calculadora rodam em memória no navegador.
- **Sincronização multiusuário**: polling de `GET /sync` a cada 60 s; mudança de
  timestamp mostra aviso com botão "Recarregar dados".
- **Visual**: tokens/temas existentes do Verify (claro/escuro, acento,
  densidade); nenhum estilo paralelo.
- **Modo demo não cobre o Input** — a seção exige backend e mostra orientação
  clara quando ele está fora do ar.

### Mudança na navegação existente

`App.tsx` deixa de condicionar o app inteiro à tela de upload. O layout com
sidebar é renderizado sempre; a seção Triagem mostra a tela de upload
internamente enquanto não houver planilha carregada. Seções: Triagem, COFFEE,
Input.

## Fluxo de uma edição

1. Usuário edita células na aba Gerenciar e clica Salvar.
2. Frontend envia apenas as linhas tocadas (`PATCH /notas`, header `X-User`).
3. Backend faz diff campo a campo contra o banco, grava um registro de log por
   campo alterado (timestamp único por lote), ajusta `Status_Anterior`, upsert.
4. Em background: backup rotativo e regravação do Excel da rede.
5. Cache invalidado; resposta traz o novo timestamp.
6. Frontend refaz `GET /notas` e confirma o sucesso.

## Tratamento de erros

- **Rede indisponível**: fallbacks idênticos ao original; badges de status por
  base nas Configurações; aviso resumido na Visão Geral. Nunca derruba a tela.
- **Migração inicial falhou**: backend sobe com banco vazio; UI avisa e oferece
  "Tentar importar de novo" (endpoint dedicado de migração).
- **Conflito de escrita**: último salvamento vence (comportamento atual),
  rastreado no log; o aviso de sincronização reduz a janela de conflito.
- **Duplicatas**: erro com a lista dos números já existentes.

## Testes

- **Backend (pytest)**: `db.py` (upsert, diff/log, undo, exclusão, backup
  rotativo) com banco temporário; `engine.py` com fixtures de Excels pequenos
  (incluindo arquivos ausentes); endpoints via `TestClient` (CRUD, duplicatas,
  undo, exigência de `X-User`).
- **Frontend**: type-check + build (`npm run build`), padrão do projeto.

## Fases de implementação

1. **Backend núcleo** — config, db, migração inicial, engine, endpoints de leitura
2. **Visão Geral** — seção na sidebar, navegação destravada, tabela + filtros + calculadora + export
3. **Gerenciar** — edição rápida/lote, exclusão, cadastro, colagem em massa, undo, identidade
4. **Relatórios + Logs** — auditoria com KPIs e gráfico; três visões de log
5. **Configurações + integração de rede** — responsáveis, bases de apoio, backups, cópia Excel da rede, polling de sincronização

## Fora do escopo

- `Sap_Robot.py` (RPA do SAP GUI) — continua rodando à parte.
- Autenticação com senha.
- Modo demo para o Input.
- Tabela `bloqueios` do schema original (não é usada pelo app atual).
