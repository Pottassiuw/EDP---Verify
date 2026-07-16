# Integração COFFEE → INPUT + Cache do INPUT — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir revisar uma nota do COFFEE (dados COFFEE + IW28) e movê-la — individual ou em lote — para o plano do INPUT com só 4 campos manuais, e eliminar recarregamentos completos do INPUT após refresh via cache SWR + versão de dataset.

**Architecture:** Novo módulo backend `integracao_module` é o único código que conhece `coffee_module` E `input_module` (direção `integracao → {coffee, input}`; os dois seguem sem imports mútuos). O mapeamento de campos vive em um único arquivo puro (`mapping.py`). A escrita reusa o caminho canônico do INPUT (extraído para `input_module/service.py`). No frontend, a UI mora em `features/coffee` (botão Revisar + Sheet + Modal) e fala só com `/api/integracao`. Cache: defaults do React Query (SWR nativo) + invalidação ativa via polling `/sync` + versão de dataset derivada dos logs com ETag/304 no `GET /notas`. Persistência IndexedDB fica FORA (fase 2, decidido pelo usuário).

**Tech Stack:** FastAPI + Pydantic + pandas + SQLite (backend); React 18 + TypeScript + React Query v5 + Radix/shadcn + sonner (frontend); pytest (testes backend); `npm run build` = type-check do frontend.

## Global Constraints

- Decisões do usuário (2026-07-15): de-para prioridade COFFEE→INPUT é índice 1–6 da lista `config.PRIORIDADES` (`1=Emergente, 2=Urgente, 3=Importante, 4=Prioritário, 5=Programável, 6=Informativo`); valores fora de 1–6 (ex.: 7 existe no banco) caem em `Programável` + aviso. "Descrição" da spec = `Observacao` (pré-preenchida de `fields.observacoes`). "Equipamento" já está contido no local de instalação. Mover exige `id_sap` real (≠ 10000000) — validação server-side. Nota já no plano → 409 amigável + fluxo "Atualizar dados". Mover em lote entra na v1. Persist IndexedDB adiado.
- CLAUDE.md: endpoints finos; lógica em services; React Query padrão p/ server state; nunca `any` (usar `unknown`/tipos); sem dependência nova; docs `docs/dev/` atualizados NO MESMO COMMIT da mudança; Rule of Three.
- Tokens de design apenas (`var(--...)`); dados de máquina em `edp-mono`; botões com `title` + `aria-label`.
- Toda tarefa de UI (Tasks 9–12): invocar a skill `frontend-design` antes de escrever JSX (preferência registrada do usuário).
- Testes backend: `cd backend && python -m pytest <arquivo> -v` (fixtures via env `INPUT_DATA_DIR` / `COFFEE_DATA_DIR` + `tmp_path`, padrão de `test_input_module.py`).
- Frontend: `cd frontend && npm run build` (tsc + vite) é o gate de tipo/build de toda task frontend.
- Commits convencionais, um por task, com a atualização de docs incluída.
- Constantes do domínio: `SAP_PENDENTE = 10000000` (`coffee_module/config.py`); campos manuais = `Mes_Execucao_Planejado`, `Status_Obra`, `Observacao`, `Check`; `Numero_Nota` do plano = `id_sap` real do COFFEE; enriquecimento IW28 do registro criado é automático (engine já cruza `base_iw28.Nota ↔ Numero_Nota`).

---

## Entrega A — Cache SWR no frontend (sem dependência nova)

### Task 1: Defaults do QueryClient + chave compartilhada + invalidação ativa

**Files:**
- Modify: `frontend/src/main.tsx:14`
- Modify: `frontend/src/features/input/use-input-data.ts`
- Modify: `frontend/src/features/input/use-ramal-data.ts`
- Modify: `frontend/src/features/input/use-auto-vinculos.ts:44`
- Modify: `frontend/src/features/input/input-section.tsx:40,55-61`
- Docs: `docs/dev/03-frontend-input.md`, `docs/dev/04-frontend-shared.md`

**Interfaces:**
- Produces: `export const INPUT_DADOS_KEY = ['input-dados'] as const` em `use-input-data.ts` — Tasks 11/12 importam para invalidar após mover.
- Comportamento: dados em cache renderizam na hora; revalidação roda em background; escrita de outro usuário converge em ≤60s sem clique.

- [ ] **Step 1: Defaults do QueryClient em `main.tsx`**

```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      retry: 1,
    },
  },
});
```

(Não mexer em `refetchOnWindowFocus`: com staleTime, o refetch por focus vira revalidação em background sem tirar dado da tela — comportamento SWR desejado.)

- [ ] **Step 2: `use-input-data.ts` — constante exportada + invalidação no polling**

Substituir o arquivo por:

```ts
import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { InputApi } from './api';

export const INPUT_DADOS_KEY = ['input-dados'] as const;

export function useInputData() {
  return useQuery({
    queryKey: INPUT_DADOS_KEY,
    queryFn: InputApi.dados,
    staleTime: 300_000,
    retry: 1,
  });
}

export function useRecarregarInput(): () => Promise<void> {
  const qc = useQueryClient();
  return React.useCallback(async () => {
    await qc.invalidateQueries({ queryKey: INPUT_DADOS_KEY });
  }, [qc]);
}

/** Polling de /sync: quando outro usuário salva, revalida em background e avisa. */
export function useSincronizacaoAutomatica(ultimaConhecida: string | null | undefined): void {
  const qc = useQueryClient();
  React.useEffect(() => {
    if (ultimaConhecida === undefined) return;
    const id = window.setInterval(() => {
      InputApi.sync()
        .then((s) => {
          if (s.ultima_alteracao !== (ultimaConhecida ?? null)) {
            toast.info('Dados atualizados por outro usuário', {
              description: 'A tabela foi recarregada em segundo plano.',
            });
            void qc.invalidateQueries({ queryKey: INPUT_DADOS_KEY });
          }
        })
        .catch(() => { /* backend fora: o erro aparece no fluxo principal */ });
    }, 60_000);
    return () => window.clearInterval(id);
  }, [ultimaConhecida, qc]);
}
```

(`useAvisoSincronizacao` deixa de existir — o refetch em background substitui o banner manual; quando `ultima_alteracao` novo chegar no refetch, o efeito re-arma sozinho.)

- [ ] **Step 3: `input-section.tsx` — trocar banner por hook automático**

Trocar o import de `useAvisoSincronizacao` por `useSincronizacaoAutomatica`, trocar a linha 40 por:

```tsx
useSincronizacaoAutomatica(dados?.meta.ultima_alteracao);
```

e REMOVER o bloco JSX do banner `desatualizado` (linhas 55-61) e as referências a `desatualizado`/`limpar`.

- [ ] **Step 4: `use-ramal-data.ts` — staleTime + useCallback**

```ts
import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { InputApi } from './api';

export const RAMAL_KEY = ['input', 'ramal'] as const;

export function useRamalData() {
  return useQuery({ queryKey: RAMAL_KEY, queryFn: InputApi.ramal, staleTime: 300_000 });
}

export function useRecarregarRamal(): () => Promise<void> {
  const qc = useQueryClient();
  return React.useCallback(async () => {
    await qc.invalidateQueries({ queryKey: RAMAL_KEY });
  }, [qc]);
}
```

- [ ] **Step 5: `use-auto-vinculos.ts` — usar a constante**

Adicionar `import { INPUT_DADOS_KEY } from './use-input-data';` e na linha 44 trocar `['input-dados']` por `INPUT_DADOS_KEY`.

- [ ] **Step 6: Build**

Run: `cd frontend && npm run build`
Expected: sem erro de tipo. Se `useRecarregarRamal` tiver consumidores esperando retorno síncrono, ajustar o call-site (`void recarregar()`).

- [ ] **Step 7: Docs + commit**

Atualizar `docs/dev/04-frontend-shared.md` (novos defaults do QueryClient e por quê) e `docs/dev/03-frontend-input.md` (INPUT_DADOS_KEY, `useSincronizacaoAutomatica` substituindo o banner, staleTime do ramal).

```bash
git add frontend/src/main.tsx frontend/src/features/input/ docs/dev/03-frontend-input.md docs/dev/04-frontend-shared.md
git commit -m "perf(input): SWR real — defaults do QueryClient, chave compartilhada e invalidação ativa via /sync"
```

---

## Entrega B — Backend da integração

### Task 2: Extrair caminho de escrita do INPUT para `input_module/service.py`

**Files:**
- Create: `backend/input_module/service.py`
- Modify: `backend/input_module/routes.py` (remove `NovaNota`, `_preparar_novas`, `_garantir_banco`, `_migracao`, `_banco_lock`; delega)
- Test: `backend/test_input_module.py`
- Docs: `docs/dev/06-backend-input-module.md`

**Interfaces:**
- Produces: `service.NovaNota` (Pydantic, mesmos campos/defaults do atual em routes.py:103-115); `service.NotasDuplicadasErro(Exception)`; `service.criar_notas(notas: list[NovaNota], usuario: str) -> int`; `service.garantir_banco() -> str` (migração+init com lock, retorna "ja-existe"|"migrado"|"rede-indisponivel"). Tasks 6/7 consomem tudo isso.

- [ ] **Step 1: Teste que falha**

Adicionar em `backend/test_input_module.py`:

```python
def test_service_criar_notas(banco_temporario):
    from input_module import db, service
    nota = service.NovaNota(
        Numero_Nota=555001, Status_Nota="00 Pendente",
        Prioridade_Nota="Programável", Local_Instalacao="045RL00000001",
    )
    assert service.criar_notas([nota], usuario="teste") == 1
    df = db.carregar_dados()
    linha = df[df["Numero_Nota"] == 555001].iloc[0]
    assert linha["Regional"] == "Guarulhos"          # derivada de Local_Instalacao[:3]
    assert linha["ID_Cronologia"] == 1
    with pytest.raises(service.NotasDuplicadasErro):
        service.criar_notas([nota], usuario="teste")


def test_service_criar_notas_duplicata_no_lote(banco_temporario):
    from input_module import service
    n = service.NovaNota(Numero_Nota=7, Status_Nota="00 Pendente", Prioridade_Nota="Programável")
    with pytest.raises(service.NotasDuplicadasErro):
        service.criar_notas([n, n], usuario="teste")
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && python -m pytest test_input_module.py -k service_criar -v`
Expected: FAIL (`No module named 'input_module.service'` ou AttributeError).

- [ ] **Step 3: Criar `backend/input_module/service.py`**

```python
"""Caminho canônico de escrita do módulo Input (reusado por rotas e integração)."""
import threading

import pandas as pd
from pydantic import BaseModel

from input_module import config, db

# Estado da migração inicial (resolvido uma vez por processo)
_migracao = {"resultado": None}
_banco_lock = threading.Lock()


def garantir_banco() -> str:
    with _banco_lock:
        if _migracao["resultado"] is None:
            _migracao["resultado"] = db.migrar_da_rede_se_preciso()
            db.inicializar_banco()
    return _migracao["resultado"]


def resetar_migracao() -> None:
    _migracao["resultado"] = None


class NovaNota(BaseModel):
    Numero_Nota: int
    Status_Nota: str
    Prioridade_Nota: str
    Planejado_DDPM: float = 0.0
    Status_Obra: str = "-"
    Conjunto: str = "-"
    Circuito: str = "-"
    Local_Instalacao: str = "-"
    Mes_Execucao_Planejado: str = "-"
    Data_Envio_Projeto: str = "-"
    Observacao: str = ""
    Check: str = "-"


class NotasDuplicadasErro(Exception):
    """Numero_Nota repetido no lote ou já existente no banco."""


def _preparar_novas(notas: list[NovaNota], df_banco: pd.DataFrame) -> pd.DataFrame:
    """Valida duplicatas e completa Regional/ID_Cronologia (Input/app.py:640-728)."""
    numeros = [n.Numero_Nota for n in notas]
    repetidas_lote = {str(n) for n in numeros if numeros.count(n) > 1}
    if repetidas_lote:
        raise NotasDuplicadasErro(
            "Notas duplicadas no próprio lote: " + ", ".join(sorted(repetidas_lote)))
    existentes = set(df_banco["Numero_Nota"].tolist()) if not df_banco.empty else set()
    repetidas_banco = sorted(str(n) for n in numeros if n in existentes)
    if repetidas_banco:
        raise NotasDuplicadasErro(
            "Notas já existentes no banco: " + ", ".join(repetidas_banco))
    base_id = db.proximo_id_cronologia(df_banco)
    linhas = []
    for i, nota in enumerate(notas):
        registro = nota.model_dump()
        registro["ID_Cronologia"] = base_id + i
        registro["Regional"] = config.DE_PARA_REGIONAL.get(str(nota.Local_Instalacao)[:3], "-")
        registro["Centro_Responsavel"] = "-"
        registro["Status_Anterior"] = "-"
        linhas.append(registro)
    return pd.DataFrame(linhas)


def criar_notas(notas: list[NovaNota], usuario: str) -> int:
    """Insere notas novas no plano; levanta NotasDuplicadasErro em conflito."""
    df_novas = _preparar_novas(notas, db.carregar_dados())
    db.salvar_em_massa(df_novas)
    return len(df_novas)
```

- [ ] **Step 4: Delegar em `routes.py`**

Em `backend/input_module/routes.py`:
1. Remover `_migracao`, `_banco_lock`, `_garantir_banco`, `class NovaNota`, `_preparar_novas` e o import de `threading`.
2. Adicionar `from input_module.service import NovaNota, NotasDuplicadasErro, criar_notas, garantir_banco, resetar_migracao`.
3. Trocar TODAS as chamadas `_garantir_banco()` por `garantir_banco()` (mesmo retorno).
4. `criar_nota` e `criar_lote` viram:

```python
@router.post("/notas")
def criar_nota(nota: NovaNota, tasks: BackgroundTasks,
               usuario: str = Depends(usuario_atual)):
    garantir_banco()
    try:
        criar_notas([nota], usuario=usuario)
    except NotasDuplicadasErro as e:
        raise HTTPException(409, str(e))
    _pos_escrita(tasks)
    return {"inseridas": 1}


@router.post("/notas/bulk")
def criar_lote(pedido: LotePedido, tasks: BackgroundTasks,
               usuario: str = Depends(usuario_atual)):
    garantir_banco()
    if not pedido.notas:
        raise HTTPException(400, "Lote vazio.")
    try:
        inseridas = criar_notas(pedido.notas, usuario=usuario)
    except NotasDuplicadasErro as e:
        raise HTTPException(409, str(e))
    _pos_escrita(tasks)
    return {"inseridas": inseridas}
```

5. Em `POST /migrar`, trocar `_migracao["resultado"] = None` por `resetar_migracao()`.

- [ ] **Step 5: Rodar todos os testes do módulo**

Run: `cd backend && python -m pytest test_input_module.py test_upload.py -v`
Expected: PASS (incluindo os antigos — contrato HTTP inalterado).

- [ ] **Step 6: Docs + commit**

Atualizar `docs/dev/06-backend-input-module.md`: nova seção "service.py — caminho canônico de escrita" (garantir_banco, criar_notas, NotasDuplicadasErro; rotas delegam).

```bash
git add backend/input_module/ backend/test_input_module.py docs/dev/06-backend-input-module.md
git commit -m "refactor(input): extrai criar_notas/garantir_banco para service.py (reuso pela integração)"
```

### Task 3: Contrato de leitura IW28 + consulta de nota do plano

**Files:**
- Create: `backend/input_module/iw28.py`
- Modify: `backend/input_module/db.py` (adicionar `obter_nota_plano` no fim)
- Test: `backend/test_input_module.py`
- Docs: `docs/dev/06-backend-input-module.md`

**Interfaces:**
- Produces: `iw28.obter_por_nota(numero: int) -> dict | None` (linha da `base_iw28`, NaN→None, tolera tabela ausente); `iw28.extraida_em() -> str | None`; `db.obter_nota_plano(numero: int) -> dict | None` (registro FORMATADO como `carregar_dados()` — status texto, mês "fev-2026"). Task 6 consome.

- [ ] **Step 1: Testes que falham**

```python
def test_iw28_obter_por_nota(banco_temporario):
    from input_module import db, iw28
    assert iw28.obter_por_nota(12345678) is None  # tabela ainda não existe
    db.salvar_base_dataframe("base_iw28", pd.DataFrame([{
        "Nota": 12345678.0, "Status usuário": "PLAN",
        "CenTrabalho princ.": "POA", "Ordem": 900001, "Encerram.por data": None,
    }]))
    registro = iw28.obter_por_nota(12345678)
    assert registro is not None
    assert registro["Status usuário"] == "PLAN"
    assert registro["Encerram.por data"] is None      # NaN vira None (JSON-safe)
    assert iw28.obter_por_nota(99999999) is None


def test_obter_nota_plano(banco_temporario):
    from input_module import db
    assert db.obter_nota_plano(1000) is None
    db.salvar_em_massa(pd.DataFrame([_nota(1000)]))
    registro = db.obter_nota_plano(1000)
    assert registro is not None
    assert registro["Status_Nota"] == "10 Em planejamento"   # formatado, não int
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && python -m pytest test_input_module.py -k "iw28 or nota_plano" -v`
Expected: FAIL.

- [ ] **Step 3: Criar `backend/input_module/iw28.py`**

```python
"""Contrato de leitura da base IW28 (extração diária do SAP).

A tabela base_iw28 é recriada por to_sql(if_exists="replace") a partir do
Excel do robô SAP — schema flutuante e pode não existir (cópia dev). Toda
leitura degrada para None em vez de levantar.
"""
import pandas as pd

from input_module import db


def obter_por_nota(numero: int) -> dict | None:
    """Linha da base_iw28 para a nota SAP, ou None (ausente/fora da extração)."""
    conn = db.get_db_connection()
    try:
        df = pd.read_sql(
            "SELECT * FROM base_iw28 WHERE CAST(Nota AS INTEGER) = ?",
            conn, params=(int(numero),))
    except Exception:
        return None  # tabela ausente ou coluna Nota renomeada pelo robô
    finally:
        conn.close()
    if df.empty:
        return None
    registro = df.iloc[0].to_dict()
    return {chave: (None if pd.isna(valor) else valor) for chave, valor in registro.items()}


def extraida_em() -> str | None:
    """Data da última importação da IW28 registrada em log_arquivos."""
    conn = db.get_db_connection()
    try:
        row = conn.execute(
            "SELECT MAX(Data_Hora) FROM log_arquivos WHERE Nome_Arquivo LIKE '%IW28%'"
        ).fetchone()
        return row[0] if row and row[0] else None
    except Exception:
        return None
    finally:
        conn.close()
```

E no fim de `backend/input_module/db.py`:

```python
def obter_nota_plano(numero: int) -> dict | None:
    """Registro do plano na MESMA representação formatada de carregar_dados()."""
    df = carregar_dados()
    if df.empty or numero not in df["Numero_Nota"].values:
        return None
    return df[df["Numero_Nota"] == numero].iloc[0].to_dict()
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && python -m pytest test_input_module.py -v`
Expected: PASS.

- [ ] **Step 5: Docs + commit**

`docs/dev/06-backend-input-module.md`: seção "iw28.py — contrato de leitura" (quem consome hoje: integração; extensível a enriquecimentos futuros).

```bash
git add backend/input_module/iw28.py backend/input_module/db.py backend/test_input_module.py docs/dev/06-backend-input-module.md
git commit -m "feat(input): contrato de leitura iw28.py + obter_nota_plano"
```

### Task 4: Leitura de nota única no COFFEE

**Files:**
- Modify: `backend/coffee_module/db.py` (após `listar_notas`, ~linha 185)
- Test: `backend/test_coffee_module.py`
- Docs: `docs/dev/05-backend-coffee-module.md`

**Interfaces:**
- Produces: `coffee_module.db.obter_nota(pk: int) -> dict | None` — mesmas chaves de `listar_notas` (`pk, id_sap, id_sap_anterior, arquivado, classificacao, dados_json (dict), buscado_em, erro, a_gerar, origem, classificacao_em`). Task 6 consome.

- [ ] **Step 1: Teste que falha** (seguir o padrão de fixtures existente em `test_coffee_module.py`; se não houver fixture de banco, usar este)

```python
def test_obter_nota(monkeypatch, tmp_path):
    monkeypatch.setenv("COFFEE_DATA_DIR", str(tmp_path))
    from coffee_module import db
    db.inicializar_banco()
    db.upsert_nota(4242, 12345678, {"prioridade": 3, "observacoes": "Trocar poste"})
    nota = db.obter_nota(4242)
    assert nota is not None
    assert nota["id_sap"] == 12345678
    assert nota["dados_json"]["observacoes"] == "Trocar poste"
    assert nota["a_gerar"] is False
    assert db.obter_nota(999999) is None
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && python -m pytest test_coffee_module.py -k obter_nota -v`
Expected: FAIL (AttributeError).

- [ ] **Step 3: Implementar em `coffee_module/db.py`**

```python
def obter_nota(pk: int) -> dict | None:
    """Linha única de notas_coffee com dados_json parseado (mesma forma de listar_notas)."""
    conn = get_db_connection()
    row = conn.execute(
        f"SELECT {', '.join(_COLUNAS)} FROM notas_coffee WHERE pk = ?", (pk,)
    ).fetchone()
    conn.close()
    if row is None:
        return None
    d = dict(zip(_COLUNAS, row))
    d["arquivado"] = bool(d["arquivado"]) if d["arquivado"] is not None else None
    d["a_gerar"] = bool(d["a_gerar"])
    d["dados_json"] = json.loads(d["dados_json"]) if d["dados_json"] else None
    return d
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && python -m pytest test_coffee_module.py -v`
Expected: PASS.

- [ ] **Step 5: Docs + commit**

`docs/dev/05-backend-coffee-module.md`: mencionar `obter_nota` e seu consumidor (integração).

```bash
git add backend/coffee_module/db.py backend/test_coffee_module.py docs/dev/05-backend-coffee-module.md
git commit -m "feat(coffee): db.obter_nota(pk) para leitura passiva pela integração"
```

### Task 5: `integracao_module/mapping.py` — o de-para

**Files:**
- Create: `backend/integracao_module/__init__.py` (vazio)
- Create: `backend/integracao_module/mapping.py`
- Test: `backend/test_integracao_module.py` (novo)

**Interfaces:**
- Consumes: `coffee_module.client.compor_local_instalacao(fields)`; `input_module.service.NovaNota`.
- Produces: `DE_PARA_PRIORIDADE: dict[int, str]`; `PRIORIDADE_PADRAO = "Programável"`; `STATUS_NOTA_INICIAL = "00 Pendente"`; `CAMPOS_MANUAIS: list[str]`; `CAMPOS_ATUALIZAVEIS: list[str]`; `montar_proposta(nota_coffee: dict) -> dict`; `avisos_proposta(nota_coffee: dict) -> list[str]`; `montar_nova_nota(nota_coffee: dict, campos_usuario: dict) -> NovaNota`. Task 6 consome.

- [ ] **Step 1: Testes que falham** — criar `backend/test_integracao_module.py`:

```python
"""Testes do módulo de integração COFFEE → INPUT."""
import pandas as pd
import pytest


def _nota_coffee(pk=4242, id_sap=12345678, **fields_extras):
    fields = {
        "prioridade": 3, "observacoes": "Trocar poste podre",
        "cidade": "718", "tipo_local_instalacao": "ET",
        "local_instalacao_numero": 26773, "alimentador": "BJU02",
        "arquivado": True,
    }
    fields.update(fields_extras)
    return {"pk": pk, "id_sap": id_sap, "dados_json": fields,
            "classificacao": "gerada", "buscado_em": "2026-07-15T08:00:00"}


def test_montar_proposta_mapeia_campos():
    from integracao_module import mapping
    proposta = mapping.montar_proposta(_nota_coffee())
    assert proposta["Numero_Nota"] == 12345678
    assert proposta["Local_Instalacao"] == "718ET00026773"
    assert proposta["Circuito"] == "BJU02"
    assert proposta["Prioridade_Nota"] == "Importante"      # 3 -> índice na lista
    assert proposta["Status_Nota"] == "00 Pendente"
    assert proposta["Observacao"] == "Trocar poste podre"
    assert mapping.avisos_proposta(_nota_coffee()) == []


def test_montar_proposta_prioridade_fora_da_faixa():
    from integracao_module import mapping
    nota = _nota_coffee(prioridade=7)
    proposta = mapping.montar_proposta(nota)
    assert proposta["Prioridade_Nota"] == "Programável"     # fallback decidido pelo usuário
    assert any("prioridade" in a.lower() for a in mapping.avisos_proposta(nota))


def test_montar_proposta_sem_local_composto():
    from integracao_module import mapping
    proposta = mapping.montar_proposta(_nota_coffee(cidade=None))
    assert proposta["Local_Instalacao"] == "-"


def test_montar_nova_nota_manual_vence():
    from integracao_module import mapping
    nova = mapping.montar_nova_nota(_nota_coffee(), {
        "Mes_Execucao_Planejado": "ago-2026", "Status_Obra": "Linha Viva",
        "Observacao": "Texto editado pelo usuário", "Check": "OK",
    })
    assert nova.Numero_Nota == 12345678
    assert nova.Mes_Execucao_Planejado == "ago-2026"
    assert nova.Observacao == "Texto editado pelo usuário"
    assert nova.Check == "OK"
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && python -m pytest test_integracao_module.py -v`
Expected: FAIL (`No module named 'integracao_module'`).

- [ ] **Step 3: Criar o módulo**

`backend/integracao_module/__init__.py`: arquivo vazio.

`backend/integracao_module/mapping.py`:

```python
"""De-para COFFEE → INPUT. Único arquivo do sistema que conhece os dois vocabulários.

Decisões do usuário (2026-07-15): prioridade COFFEE é o índice 1-6 da lista
config.PRIORIDADES do INPUT; 7-8 não são usados pelo COFFEE (fallback + aviso).
"""
import datetime

from coffee_module.client import compor_local_instalacao
from input_module.service import NovaNota

DE_PARA_PRIORIDADE = {
    1: "Emergente",
    2: "Urgente",
    3: "Importante",
    4: "Prioritário",
    5: "Programável",
    6: "Informativo",
}
PRIORIDADE_PADRAO = "Programável"
STATUS_NOTA_INICIAL = "00 Pendente"

# O que o usuário preenche no modal (spec)
CAMPOS_MANUAIS = ["Mes_Execucao_Planejado", "Status_Obra", "Observacao", "Check"]
# O que "Atualizar dados" pode sobrescrever num registro já existente no plano
# (nunca Status_Nota/Data_Envio_Projeto — são estado do planejamento, não da nota)
CAMPOS_ATUALIZAVEIS = ["Local_Instalacao", "Circuito", "Prioridade_Nota"]


def montar_proposta(nota_coffee: dict) -> dict:
    """Campos do plano deriváveis do snapshot COFFEE (sem os manuais)."""
    fields = nota_coffee.get("dados_json") or {}
    prioridade = DE_PARA_PRIORIDADE.get(fields.get("prioridade"))
    return {
        "Numero_Nota": nota_coffee.get("id_sap"),
        "Local_Instalacao": compor_local_instalacao(fields) or "-",
        "Circuito": str(fields.get("alimentador") or "-"),
        "Prioridade_Nota": prioridade or PRIORIDADE_PADRAO,
        "Status_Nota": STATUS_NOTA_INICIAL,
        "Data_Envio_Projeto": datetime.date.today().strftime("%d/%m/%Y"),
        "Observacao": str(fields.get("observacoes") or ""),
    }


def avisos_proposta(nota_coffee: dict) -> list[str]:
    """Mapeamentos incertos que o usuário deve conferir na revisão."""
    fields = nota_coffee.get("dados_json") or {}
    avisos = []
    if fields.get("prioridade") not in DE_PARA_PRIORIDADE:
        avisos.append(
            f"Prioridade {fields.get('prioridade')!r} do COFFEE está fora do de-para (1-6); "
            f"usando '{PRIORIDADE_PADRAO}' — confira antes de mover.")
    if compor_local_instalacao(fields) is None:
        avisos.append("Local de instalação incompleto no COFFEE (cidade/tipo/número).")
    return avisos


def montar_nova_nota(nota_coffee: dict, campos_usuario: dict) -> NovaNota:
    """Proposta automática + campos manuais do usuário (manual vence)."""
    proposta = montar_proposta(nota_coffee)
    manuais = {c: campos_usuario[c] for c in CAMPOS_MANUAIS if c in campos_usuario}
    return NovaNota(**{**proposta, **manuais})
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && python -m pytest test_integracao_module.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/integracao_module/ backend/test_integracao_module.py
git commit -m "feat(integracao): mapping.py — de-para COFFEE->INPUT puro e testável"
```

### Task 6: `integracao_module/service.py` — revisão e mover (individual, lote, atualizar)

**Files:**
- Create: `backend/integracao_module/service.py`
- Test: `backend/test_integracao_module.py`

**Interfaces:**
- Consumes: `coffee_module.db.obter_nota`; `coffee_module.config.SAP_PENDENTE`; `input_module.{db.obter_nota_plano, db.aplicar_edicoes, iw28, service.criar_notas}`; `mapping.*`.
- Produces: `montar_revisao(pk: int) -> dict` (chaves: `coffee, iw28, iw28_extraida_em, plano, ja_no_plano, proposta, avisos, pode_mover, motivo_bloqueio`); `mover_para_plano(pks: list[int], campos_usuario: dict, usuario: str, atualizar_existente: bool = False) -> dict` (`{"inseridas": int, "atualizadas": int}`); exceções `NotaNaoEncontradaErro`, `SapPendenteErro`, `JaNoPlanoErro`. Task 7 consome.

- [ ] **Step 1: Fixture + testes que falham** — adicionar em `test_integracao_module.py`:

```python
@pytest.fixture
def ambiente(monkeypatch, tmp_path):
    """Bancos COFFEE e INPUT temporários, com uma nota gerada e base IW28."""
    monkeypatch.setenv("COFFEE_DATA_DIR", str(tmp_path / "coffee"))
    monkeypatch.setenv("INPUT_DATA_DIR", str(tmp_path / "input"))
    from coffee_module import db as coffee_db
    from input_module import db as input_db
    coffee_db.inicializar_banco()
    input_db.inicializar_banco()
    coffee_db.upsert_nota(4242, 12345678, _nota_coffee()["dados_json"])
    coffee_db.upsert_nota(4243, 10000000, _nota_coffee(prioridade=2)["dados_json"])  # pendente
    input_db.salvar_base_dataframe("base_iw28", pd.DataFrame([{
        "Nota": 12345678, "Status usuário": "PLAN", "CenTrabalho princ.": "POA",
        "Ordem": 900001, "Encerram.por data": "2026-08-01",
    }]))
    return tmp_path


def test_montar_revisao_completa(ambiente):
    from integracao_module import service
    revisao = service.montar_revisao(4242)
    assert revisao["coffee"]["id_sap"] == 12345678
    assert revisao["iw28"]["Status usuário"] == "PLAN"
    assert revisao["ja_no_plano"] is False
    assert revisao["pode_mover"] is True
    assert revisao["proposta"]["Local_Instalacao"] == "718ET00026773"


def test_montar_revisao_pendente_bloqueia(ambiente):
    from integracao_module import service
    revisao = service.montar_revisao(4243)
    assert revisao["pode_mover"] is False
    assert revisao["iw28"] is None
    assert "SAP" in revisao["motivo_bloqueio"]


def test_montar_revisao_pk_desconhecido(ambiente):
    from integracao_module import service
    with pytest.raises(service.NotaNaoEncontradaErro):
        service.montar_revisao(999999)


CAMPOS = {"Mes_Execucao_Planejado": "ago-2026", "Status_Obra": "Linha Viva",
          "Observacao": "Obs final", "Check": "OK"}


def test_mover_para_plano_cria_registro(ambiente):
    from input_module import db as input_db
    from integracao_module import service
    resultado = service.mover_para_plano([4242], CAMPOS, usuario="teste")
    assert resultado == {"inseridas": 1, "atualizadas": 0}
    registro = input_db.obter_nota_plano(12345678)
    assert registro["Circuito"] == "BJU02"
    assert registro["Prioridade_Nota"] == "Importante"
    assert registro["Observacao"] == "Obs final"


def test_mover_pendente_recusa(ambiente):
    from integracao_module import service
    with pytest.raises(service.SapPendenteErro):
        service.mover_para_plano([4243], CAMPOS, usuario="teste")


def test_mover_ja_no_plano_recusa_e_atualiza(ambiente):
    from input_module import db as input_db
    from integracao_module import service
    service.mover_para_plano([4242], CAMPOS, usuario="teste")
    with pytest.raises(service.JaNoPlanoErro):
        service.mover_para_plano([4242], CAMPOS, usuario="teste")
    resultado = service.mover_para_plano(
        [4242], {**CAMPOS, "Status_Obra": "Linha Morta"},
        usuario="teste", atualizar_existente=True)
    assert resultado["atualizadas"] == 1
    registro = input_db.obter_nota_plano(12345678)
    assert registro["Status_Obra"] == "Linha Morta"
    assert registro["Status_Nota"] == "00 Pendente"   # atualização NÃO reseta status


def test_mover_lote_all_or_nothing(ambiente):
    from integracao_module import service
    with pytest.raises(service.SapPendenteErro):
        service.mover_para_plano([4242, 4243], CAMPOS, usuario="teste")
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && python -m pytest test_integracao_module.py -v`
Expected: novos testes FAIL.

- [ ] **Step 3: Criar `backend/integracao_module/service.py`**

```python
"""Composição COFFEE + IW28 + plano. Direção de dependência: integracao -> {coffee, input}."""
from coffee_module import config as coffee_config
from coffee_module import db as coffee_db
from input_module import db as input_db
from input_module import iw28
from input_module import service as input_service
from integracao_module import mapping


class NotaNaoEncontradaErro(Exception):
    """pk não existe no snapshot local do COFFEE (coffee.db)."""


class SapPendenteErro(Exception):
    """Nota sem SAP real — mover quebraria o cruzamento IW28."""


class JaNoPlanoErro(Exception):
    """Numero_Nota já cadastrado no plano do INPUT."""


def _sap_real(nota: dict) -> bool:
    return bool(nota.get("id_sap")) and nota["id_sap"] != coffee_config.SAP_PENDENTE


def montar_revisao(pk: int) -> dict:
    nota = coffee_db.obter_nota(pk)
    if nota is None:
        raise NotaNaoEncontradaErro(
            f"Nota {pk} não está no snapshot local do COFFEE — busque-a antes (Pendentes/Gerar).")
    sap_real = _sap_real(nota)
    registro_iw28 = iw28.obter_por_nota(nota["id_sap"]) if sap_real else None
    plano = input_db.obter_nota_plano(nota["id_sap"]) if sap_real else None
    pode_mover, motivo = True, None
    if not sap_real:
        pode_mover, motivo = False, "Nota ainda sem SAP real (pendente no COFFEE)."
    return {
        "coffee": nota,
        "iw28": registro_iw28,
        "iw28_extraida_em": iw28.extraida_em(),
        "plano": plano,
        "ja_no_plano": plano is not None,
        "proposta": mapping.montar_proposta(nota),
        "avisos": mapping.avisos_proposta(nota),
        "pode_mover": pode_mover,
        "motivo_bloqueio": motivo,
    }


def _carregar_validas(pks: list[int]) -> list[dict]:
    notas, problemas = [], []
    for pk in pks:
        nota = coffee_db.obter_nota(pk)
        if nota is None:
            problemas.append(f"{pk}: não está no snapshot local do COFFEE")
        elif not _sap_real(nota):
            problemas.append(f"{pk}: sem SAP real (pendente)")
        else:
            notas.append(nota)
    if problemas:
        raise SapPendenteErro("; ".join(problemas))
    return notas


def mover_para_plano(pks: list[int], campos_usuario: dict, usuario: str,
                     atualizar_existente: bool = False) -> dict:
    """Cria (ou atualiza, se pedido) registros do plano a partir de notas COFFEE.

    Lote é all-or-nothing: qualquer nota inválida aborta antes de escrever.
    """
    if atualizar_existente and len(pks) != 1:
        raise ValueError("Atualização de dados vale para uma nota por vez.")
    notas = _carregar_validas(pks)

    if atualizar_existente:
        nota = notas[0]
        proposta = mapping.montar_proposta(nota)
        linha = {"Numero_Nota": nota["id_sap"]}
        linha.update({c: proposta[c] for c in mapping.CAMPOS_ATUALIZAVEIS})
        linha.update({c: campos_usuario[c] for c in mapping.CAMPOS_MANUAIS if c in campos_usuario})
        resultado = input_db.aplicar_edicoes([linha], usuario=usuario)
        coffee_db.registrar_log("acao_usuario", "atualizar_no_plano", nota["pk"],
                                {"id_sap": nota["id_sap"], "campos": resultado["campos"]}, True)
        return {"inseridas": 0, "atualizadas": resultado["alteradas"]}

    ja_existem = [n for n in notas if input_db.obter_nota_plano(n["id_sap"]) is not None]
    if ja_existem:
        raise JaNoPlanoErro(
            "Já no plano: " + ", ".join(str(n["id_sap"]) for n in ja_existem))
    novas = [mapping.montar_nova_nota(n, campos_usuario) for n in notas]
    inseridas = input_service.criar_notas(novas, usuario=usuario)
    coffee_db.registrar_log("acao_usuario", "mover_para_plano", None,
                            {"pks": list(pks),
                             "saps": [n["id_sap"] for n in notas]}, True)
    return {"inseridas": inseridas, "atualizadas": 0}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && python -m pytest test_integracao_module.py -v`
Expected: PASS. (Se `aplicar_edicoes` reclamar de tipos em `Prioridade_Nota`, converter valores da proposta com `str()` na montagem da linha.)

- [ ] **Step 5: Commit**

```bash
git add backend/integracao_module/service.py backend/test_integracao_module.py
git commit -m "feat(integracao): service — revisão consolidada e mover para o plano (lote + atualizar)"
```

### Task 7: Rotas `/api/integracao/*` + montagem no app

**Files:**
- Create: `backend/integracao_module/routes.py`
- Modify: `backend/main.py` (junto aos `include_router` existentes, ~linha 325)
- Test: `backend/test_integracao_module.py`
- Docs: Create `docs/dev/08-integracao-coffee-input.md`; Modify `docs/dev/00-overview.md` (mapa de módulos), `docs/dev/07-fluxos-de-negocio.md` (fluxo COFFEE→Plano)

**Interfaces:**
- Produces (contrato HTTP consumido pelas Tasks 9–12):
  - `GET /api/integracao/nota/{pk}/revisao` → corpo = retorno de `montar_revisao` (404 pk desconhecido).
  - `POST /api/integracao/mover-para-plano` body `{pks: number[], campos_usuario: {Mes_Execucao_Planejado?, Status_Obra?, Observacao?, Check?}, atualizar_existente?: boolean}`, header `X-User` obrigatório → `{inseridas, atualizadas}`; 422 SAP pendente/pk desconhecido; 409 já no plano; 400 X-User ausente ou pedido inválido.

- [ ] **Step 1: Testes de API que falham** — adicionar em `test_integracao_module.py`:

```python
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _client():
    from integracao_module.routes import router
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_api_revisao(ambiente):
    client = _client()
    r = client.get("/api/integracao/nota/4242/revisao")
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["proposta"]["Numero_Nota"] == 12345678
    assert corpo["iw28"]["Ordem"] == 900001
    assert client.get("/api/integracao/nota/999999/revisao").status_code == 404


def test_api_mover_fluxo_completo(ambiente):
    client = _client()
    payload = {"pks": [4242], "campos_usuario": CAMPOS}
    assert client.post("/api/integracao/mover-para-plano", json=payload).status_code == 400  # sem X-User
    r = client.post("/api/integracao/mover-para-plano", json=payload, headers={"X-User": "teste"})
    assert r.status_code == 200 and r.json()["inseridas"] == 1
    assert client.post("/api/integracao/mover-para-plano", json=payload,
                       headers={"X-User": "teste"}).status_code == 409
    r = client.post("/api/integracao/mover-para-plano",
                    json={**payload, "atualizar_existente": True},
                    headers={"X-User": "teste"})
    assert r.status_code == 200 and r.json()["atualizadas"] >= 0
    assert client.post("/api/integracao/mover-para-plano",
                       json={"pks": [4243], "campos_usuario": CAMPOS},
                       headers={"X-User": "teste"}).status_code == 422
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && python -m pytest test_integracao_module.py -k api -v`
Expected: FAIL.

- [ ] **Step 3: Criar `backend/integracao_module/routes.py`**

```python
"""Rotas /api/integracao/* — ponte COFFEE → INPUT (endpoints finos)."""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from input_module import engine
from input_module.routes import usuario_atual
from input_module.service import NotasDuplicadasErro, garantir_banco
from integracao_module import service

router = APIRouter(prefix="/api/integracao")


class MoverPedido(BaseModel):
    pks: list[int] = Field(min_length=1)
    campos_usuario: dict[str, str] = {}
    atualizar_existente: bool = False


@router.get("/nota/{pk}/revisao")
def revisao(pk: int):
    garantir_banco()
    try:
        return service.montar_revisao(pk)
    except service.NotaNaoEncontradaErro as e:
        raise HTTPException(404, str(e))


@router.post("/mover-para-plano")
def mover(pedido: MoverPedido, tasks: BackgroundTasks,
          usuario: str = Depends(usuario_atual)):
    garantir_banco()
    try:
        resultado = service.mover_para_plano(
            pedido.pks, pedido.campos_usuario, usuario, pedido.atualizar_existente)
    except service.SapPendenteErro as e:
        raise HTTPException(422, str(e))
    except (service.JaNoPlanoErro, NotasDuplicadasErro) as e:
        raise HTTPException(409, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    engine.invalidar_cache()
    tasks.add_task(engine.gerar_copia_excel_rede)
    return resultado
```

Em `backend/main.py`, junto aos includes existentes:

```python
from integracao_module.routes import router as integracao_router
app.include_router(integracao_router)
```

- [ ] **Step 4: Rodar TODOS os testes backend**

Run: `cd backend && python -m pytest test_integracao_module.py test_input_module.py test_coffee_module.py test_upload.py -v`
Expected: PASS.

- [ ] **Step 5: Docs + commit**

Criar `docs/dev/08-integracao-coffee-input.md`: responsabilidade do módulo, os 2 endpoints com request/response, regra de direção (`integracao → {coffee, input}`, nunca o inverso; coffee↔input seguem sem se conhecer), mapping como único ponto de de-para, decisões do usuário (prioridade 1–6, atualizar não reseta Status_Nota, lote all-or-nothing). Atualizar `docs/dev/00-overview.md` (linha nova no mapa de módulos) e `docs/dev/07-fluxos-de-negocio.md` (etapa COFFEE→Plano no ciclo de vida).

```bash
git add backend/integracao_module/ backend/main.py backend/test_integracao_module.py docs/dev/
git commit -m "feat(integracao): rotas /api/integracao (revisao + mover-para-plano) montadas no app"
```

---

## Entrega C — Frontend da integração (usar skill frontend-design nas Tasks 9–12)

### Task 8: Promover `MesExecucaoPicker` para `components/branded/`

**Files:**
- Move (git mv): `frontend/src/features/input/mes-execucao-picker.tsx` → `frontend/src/components/branded/mes-execucao-picker.tsx`
- Modify: consumidores atuais (descobrir com `grep -r "mes-execucao-picker" frontend/src` — esperado: `features/input/manage.tsx`)
- Docs: `docs/dev/04-frontend-shared.md`, `docs/dev/03-frontend-input.md`

**Interfaces:**
- Produces: `import { MesExecucaoPicker } from '@/components/branded/mes-execucao-picker'` — Task 11 consome. Props inalteradas (`value, onChange, valorNeutro, rotuloNeutro, id?, className?`).

- [ ] **Step 1: Mover e desacoplar**

```bash
git mv frontend/src/features/input/mes-execucao-picker.tsx frontend/src/components/branded/mes-execucao-picker.tsx
```

No arquivo movido, remover `import { CLASSE_SELECT_MONO } from './ui';` e declarar local (branded não pode importar de features):

```ts
const CLASSE_SELECT_MONO = '[font-family:var(--font-mono)]';
```

- [ ] **Step 2: Atualizar consumidores**

Em cada arquivo apontado pelo grep (esperado `manage.tsx`), trocar o import para `@/components/branded/mes-execucao-picker`.

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 4: Docs + commit**

`04-frontend-shared.md`: registrar o componente em branded/ (2º consumidor: modal da integração). `03-frontend-input.md`: ajustar referência.

```bash
git add -A frontend/src docs/dev/03-frontend-input.md docs/dev/04-frontend-shared.md
git commit -m "refactor(front): promove MesExecucaoPicker a components/branded (2o consumidor)"
```

### Task 9: Tipos + API da integração no frontend

**Files:**
- Modify: `frontend/src/features/coffee/types.ts`
- Modify: `frontend/src/api.ts`

**Interfaces:**
- Produces (Tasks 10–12 consomem):
  - Tipos em `features/coffee/types.ts`: `PropostaPlano`, `CamposManuais`, `NotaRevisao`, `MoverResultado` (abaixo). Também adicionar em `CoffeeNota`: `a_gerar?: boolean; origem?: string | null;` (backend já envia).
  - Em `src/api.ts`: `revisarNota(pk: number): Promise<NotaRevisao>`; `moverParaPlano(pks: number[], camposUsuario: Partial<CamposManuais>, atualizarExistente?: boolean): Promise<MoverResultado>`; ambos exportados e adicionados ao facade `EDPApi`.

- [ ] **Step 1: Tipos em `features/coffee/types.ts`**

```ts
export interface PropostaPlano {
  Numero_Nota: number;
  Local_Instalacao: string;
  Circuito: string;
  Prioridade_Nota: string;
  Status_Nota: string;
  Data_Envio_Projeto: string;
  Observacao: string;
}

export interface CamposManuais {
  Mes_Execucao_Planejado: string;
  Status_Obra: string;
  Observacao: string;
  Check: string;
}

export interface NotaRevisao {
  coffee: CoffeeNota;
  iw28: Record<string, string | number | null> | null;
  iw28_extraida_em: string | null;
  plano: Record<string, string | number | null> | null;
  ja_no_plano: boolean;
  proposta: PropostaPlano;
  avisos: string[];
  pode_mover: boolean;
  motivo_bloqueio: string | null;
}

export interface MoverResultado {
  inseridas: number;
  atualizadas: number;
}
```

E em `CoffeeNota` acrescentar `a_gerar?: boolean;` e `origem?: string | null;`.

- [ ] **Step 2: Funções em `src/api.ts`** (padrão `erroComDetail` existente; X-User compartilha a convenção `localStorage.edp_input_user` do INPUT, com fallback `GET /input/me` — mesma lógica de `input-section.tsx:33-39`)

```ts
async function garantirUsuarioInput(): Promise<string> {
  const salvo = localStorage.getItem("edp_input_user");
  if (salvo) return salvo;
  let usuario = "sistema";
  try {
    const res = await fetch(BASE + "/input/me");
    if (res.ok) usuario = ((await res.json()) as { usuario: string }).usuario;
  } catch { /* backend fora: cai no fallback */ }
  localStorage.setItem("edp_input_user", usuario);
  return usuario;
}

export async function revisarNota(
  pk: number,
): Promise<import("./features/coffee/types").NotaRevisao> {
  const res = await fetch(BASE + "/integracao/nota/" + pk + "/revisao", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw await erroComDetail(res, "GET /integracao/revisao");
  return res.json();
}

export async function moverParaPlano(
  pks: number[],
  camposUsuario: Partial<import("./features/coffee/types").CamposManuais>,
  atualizarExistente = false,
): Promise<import("./features/coffee/types").MoverResultado> {
  const res = await fetch(BASE + "/integracao/mover-para-plano", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User": await garantirUsuarioInput(),
    },
    body: JSON.stringify({
      pks,
      campos_usuario: camposUsuario,
      atualizar_existente: atualizarExistente,
    }),
  });
  if (!res.ok) throw await erroComDetail(res, "POST /integracao/mover-para-plano");
  return res.json();
}
```

Adicionar `revisarNota` e `moverParaPlano` ao objeto `EDPApi` (api.ts:217-228).

- [ ] **Step 3: Build + commit**

Run: `cd frontend && npm run build` → PASS.

```bash
git add frontend/src/api.ts frontend/src/features/coffee/types.ts
git commit -m "feat(front): tipos e cliente da API de integracao (revisarNota, moverParaPlano)"
```

### Task 10: Hook `useNotaRevisao` + botão + Sheet "Revisar Nota"

**Files:**
- Create: `frontend/src/features/coffee/use-nota-revisao.ts`
- Create: `frontend/src/features/coffee/revisar-nota-sheet.tsx`
- Modify: `frontend/src/features/coffee/coffee-notas-table.tsx` (exportar `RevisarNotaBtn`)

**Interfaces:**
- Consumes: `EDPApi.revisarNota` (Task 9), `Sheet` (molde `coffee-log-drawer.tsx`), `formatRelativeTime` de coffee-notas-table.
- Produces: `useNotaRevisao(pk: number | null)` (React Query, key `['coffee','revisao',pk]`); `<RevisarNotaSheet pk={number|null} onClose={() => void} onMover={(revisao: NotaRevisao) => void} />`; `<RevisarNotaBtn pk={n} onClick={() => void} />` (ícone `Eye`, ghost icon-sm). Tasks 11/12 consomem.

- [ ] **Step 1: Hook `use-nota-revisao.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { EDPApi } from '../../api';

export const REVISAO_KEY = (pk: number | null) => ['coffee', 'revisao', pk] as const;

export function useNotaRevisao(pk: number | null) {
  return useQuery({
    queryKey: REVISAO_KEY(pk),
    queryFn: () => EDPApi.revisarNota(pk as number),
    enabled: pk !== null,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: `RevisarNotaBtn` em `coffee-notas-table.tsx`** (ao lado de `LogsBtn`, mesmo contrato)

```tsx
import { Coffee, Eye, ScrollText } from 'lucide-react';

/** Botão "revisar nota" das linhas — abre o sheet de revisão da integração. */
export function RevisarNotaBtn({ pk, onClick }: { pk: number; onClick: () => void }): React.JSX.Element {
  return (
    <Button variant="ghost" size="icon-sm" onClick={onClick}
            aria-label={`Revisar nota ${pk}`} title="Revisar nota">
      <Eye />
    </Button>
  );
}
```

- [ ] **Step 3: `revisar-nota-sheet.tsx`** — Sheet right `w-[520px] sm:max-w-[520px]` (molde estrutural do `coffee-log-drawer.tsx`). Conteúdo por seções; chaves de máquina em `edp-mono`. Estrutura completa:

```tsx
import React from 'react';
import type { NotaRevisao } from './types';
import { useNotaRevisao } from './use-nota-revisao';
import { formatRelativeTime } from './coffee-notas-table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-[6px]">
      <span className="edp-eyebrow">{titulo}</span>
      {children}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-[10px] text-[12.5px]">
      <span className="w-[168px] shrink-0 text-text-mute">{rotulo}</span>
      <span className="edp-mono break-all">{valor ?? '—'}</span>
    </div>
  );
}

/** Campos do dados_json com tratamento curado; o resto vai na lista genérica. */
const CAMPOS_CURADOS = new Set([
  'observacoes', 'sintoma', 'prioridade', 'alimentador', 'cidade',
  'tipo_local_instalacao', 'local_instalacao_numero', 'id_sap', 'arquivado',
]);

interface RevisarNotaSheetProps {
  pk: number | null;
  onClose: () => void;
  onMover: (revisao: NotaRevisao) => void;
}

export function RevisarNotaSheet({ pk, onClose, onMover }: RevisarNotaSheetProps): React.JSX.Element {
  const { data: revisao, isLoading, error } = useNotaRevisao(pk);
  const fields = (revisao?.coffee.dados_json ?? {}) as Record<string, unknown>;
  const restantes = Object.entries(fields).filter(([chave]) => !CAMPOS_CURADOS.has(chave));

  return (
    <Sheet open={pk !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="right" className="w-[520px] sm:max-w-[520px] gap-0 p-0 flex flex-col">
        <SheetHeader className="sr-only">
          <SheetTitle>Revisar nota #{pk}</SheetTitle>
        </SheetHeader>
        <div className="h-[48px] shrink-0 flex items-center pl-[16px] pr-[40px] border-b border-b-line">
          <span className="flex-1 font-bold text-[14px]">
            Revisar nota <span className="edp-mono">#{pk}</span>
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-[16px] flex flex-col gap-[16px]">
          {isLoading && <div className="text-text-mute text-[13px]">Carregando…</div>}
          {error != null && (
            <div className="text-red text-[13px]">
              {error instanceof Error ? error.message : String(error)}
            </div>
          )}
          {revisao && (
            <>
              <Secao titulo="Identificação">
                <Linha rotulo="ID COFFEE" valor={revisao.coffee.pk} />
                <Linha rotulo="ID SAP" valor={revisao.coffee.id_sap} />
                <Linha rotulo="Classificação" valor={revisao.coffee.classificacao} />
                <Linha rotulo="Última busca" valor={formatRelativeTime(revisao.coffee.buscado_em)} />
              </Secao>
              <Separator />
              <Secao titulo="Proposta para o plano">
                <Linha rotulo="Nº Nota" valor={revisao.proposta.Numero_Nota} />
                <Linha rotulo="Local de instalação" valor={revisao.proposta.Local_Instalacao} />
                <Linha rotulo="Circuito" valor={revisao.proposta.Circuito} />
                <Linha rotulo="Prioridade" valor={revisao.proposta.Prioridade_Nota} />
                <Linha rotulo="Status inicial" valor={revisao.proposta.Status_Nota} />
                <Linha rotulo="Observação (prefill)" valor={revisao.proposta.Observacao || '—'} />
                {revisao.avisos.map((aviso) => (
                  <div key={aviso} className="text-[12px] text-amber">{aviso}</div>
                ))}
              </Secao>
              <Separator />
              <Secao titulo={`Dados SAP (IW28)${revisao.iw28_extraida_em ? ` — extração ${formatRelativeTime(revisao.iw28_extraida_em)}` : ''}`}>
                {revisao.iw28 ? (
                  Object.entries(revisao.iw28).map(([chave, valor]) => (
                    <Linha key={chave} rotulo={chave} valor={valor as React.ReactNode} />
                  ))
                ) : (
                  <div className="text-[12.5px] text-text-mute">Nota ainda não consta na extração IW28.</div>
                )}
              </Secao>
              <Separator />
              <Secao titulo="Dados do COFFEE">
                <Linha rotulo="Sintoma" valor={String(fields.sintoma ?? '—')} />
                <Linha rotulo="Observações" valor={String(fields.observacoes ?? '—')} />
                <Linha rotulo="Prioridade (código)" valor={String(fields.prioridade ?? '—')} />
                <Linha rotulo="Alimentador" valor={String(fields.alimentador ?? '—')} />
                {restantes.map(([chave, valor]) => (
                  <Linha key={chave} rotulo={chave} valor={valor === null ? '—' : String(valor)} />
                ))}
              </Secao>
            </>
          )}
        </div>

        {revisao && (
          <div className="shrink-0 border-t border-t-line p-[12px] flex items-center gap-[10px]">
            {revisao.ja_no_plano && (
              <span className="text-[12px] text-amber">Nota já está no plano.</span>
            )}
            {!revisao.pode_mover && revisao.motivo_bloqueio && (
              <span className="text-[12px] text-text-mute flex-1">{revisao.motivo_bloqueio}</span>
            )}
            <div className="flex-1" />
            <Button size="sm" disabled={!revisao.pode_mover} onClick={() => onMover(revisao)}
                    title={revisao.motivo_bloqueio ?? undefined}>
              {revisao.ja_no_plano ? 'Atualizar dados' : 'Mover para o Plano'}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Build + commit**

Run: `cd frontend && npm run build` → PASS.

```bash
git add frontend/src/features/coffee/
git commit -m "feat(coffee): sheet Revisar Nota (COFFEE + IW28 + proposta) com hook React Query"
```

### Task 11: Modal "Mover para o Plano" (individual, atualizar e lote)

**Files:**
- Create: `frontend/src/features/coffee/mover-plano-modal.tsx`

**Interfaces:**
- Consumes: `EDPApi.moverParaPlano` (Task 9), `MesExecucaoPicker` (Task 8), `INPUT_DADOS_KEY` de `features/input/use-input-data` (Task 1), `REVISAO_KEY` (Task 10), `Dialog` de ui/, `meta.status? não` — opções de `Status_Obra` são texto livre (Input) → usar `Input` de ui/.
- Produces: `<MoverPlanoModal alvo={MoverAlvo | null} onClose={() => void} onSucesso={() => void} onIrParaInput={(() => void) | undefined} />` com `export interface MoverAlvo { pks: number[]; revisao: NotaRevisao | null }` (revisao=null → fluxo em lote). Task 12 consome.

- [ ] **Step 1: Criar `mover-plano-modal.tsx`**

```tsx
import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CamposManuais, NotaRevisao } from './types';
import { EDPApi } from '../../api';
import { REVISAO_KEY } from './use-nota-revisao';
import { INPUT_DADOS_KEY } from '../input/use-input-data';
import { MesExecucaoPicker } from '@/components/branded/mes-execucao-picker';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface MoverAlvo {
  pks: number[];
  /** null = fluxo em lote (sem prefill por nota) */
  revisao: NotaRevisao | null;
}

interface MoverPlanoModalProps {
  alvo: MoverAlvo | null;
  onClose: () => void;
  onSucesso: () => void;
  onIrParaInput?: () => void;
}

function camposIniciais(revisao: NotaRevisao | null): CamposManuais {
  if (revisao?.ja_no_plano && revisao.plano) {
    return {
      Mes_Execucao_Planejado: String(revisao.plano.Mes_Execucao_Planejado ?? '-'),
      Status_Obra: String(revisao.plano.Status_Obra ?? '-'),
      Observacao: String(revisao.plano.Observacao ?? ''),
      Check: String(revisao.plano.Check ?? '-'),
    };
  }
  return {
    Mes_Execucao_Planejado: '-',
    Status_Obra: '-',
    Observacao: revisao?.proposta.Observacao ?? '',
    Check: '-',
  };
}

export function MoverPlanoModal({ alvo, onClose, onSucesso, onIrParaInput }: MoverPlanoModalProps): React.JSX.Element {
  const qc = useQueryClient();
  const [campos, setCampos] = React.useState<CamposManuais>(() => camposIniciais(alvo?.revisao ?? null));
  React.useEffect(() => { setCampos(camposIniciais(alvo?.revisao ?? null)); }, [alvo]);

  const atualizar = alvo?.revisao?.ja_no_plano === true;
  const emLote = (alvo?.pks.length ?? 0) > 1;

  const mutacao = useMutation({
    mutationFn: () => EDPApi.moverParaPlano(alvo!.pks, campos, atualizar),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: INPUT_DADOS_KEY });
      alvo!.pks.forEach((pk) => void qc.invalidateQueries({ queryKey: REVISAO_KEY(pk) }));
      toast.success(
        atualizar ? 'Dados atualizados no plano' : `${r.inseridas} nota(s) movida(s) para o plano`,
        onIrParaInput ? { action: { label: 'Ver no plano', onClick: onIrParaInput } } : undefined,
      );
      onSucesso();
      onClose();
    },
    onError: (e: unknown) => {
      toast.error(atualizar ? 'Falha ao atualizar' : 'Falha ao mover para o plano', {
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });

  const proposta = alvo?.revisao?.proposta;

  return (
    <Dialog open={alvo !== null} onOpenChange={(next) => { if (!next && !mutacao.isPending) onClose(); }}>
      <DialogContent className="w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {atualizar ? 'Atualizar dados no plano' : emLote
              ? `Mover ${alvo?.pks.length} notas para o Plano`
              : 'Mover para o Plano'}
          </DialogTitle>
          <DialogDescription>
            {emLote
              ? 'Os campos abaixo serão aplicados a todas as notas selecionadas.'
              : 'Campos automáticos vêm do COFFEE; preencha só o restante.'}
          </DialogDescription>
        </DialogHeader>

        {proposta && !emLote && (
          <div className="rounded-[8px] border border-line bg-surface-2 p-[10px] flex flex-col gap-[4px] text-[12.5px]">
            <div><span className="text-text-mute">Nº Nota </span><span className="edp-mono">{proposta.Numero_Nota}</span></div>
            <div><span className="text-text-mute">Local </span><span className="edp-mono">{proposta.Local_Instalacao}</span></div>
            <div><span className="text-text-mute">Circuito </span><span className="edp-mono">{proposta.Circuito}</span></div>
            <div><span className="text-text-mute">Prioridade </span>{proposta.Prioridade_Nota}</div>
          </div>
        )}

        <div className="flex flex-col gap-[12px]">
          <div className="flex flex-col gap-[4px]">
            <Label htmlFor="mp-mes">Data de execução planejada</Label>
            <MesExecucaoPicker id="mp-mes" value={campos.Mes_Execucao_Planejado}
                               onChange={(v) => setCampos((c) => ({ ...c, Mes_Execucao_Planejado: v }))}
                               valorNeutro="-" rotuloNeutro="Sem planejamento" />
          </div>
          <div className="flex flex-col gap-[4px]">
            <Label htmlFor="mp-obra">Status da obra</Label>
            <Input id="mp-obra" value={campos.Status_Obra}
                   onChange={(e) => setCampos((c) => ({ ...c, Status_Obra: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-[4px]">
            <Label htmlFor="mp-obs">Observação</Label>
            <Textarea id="mp-obs" rows={3} value={campos.Observacao}
                      onChange={(e) => setCampos((c) => ({ ...c, Observacao: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-[4px]">
            <Label htmlFor="mp-check">Check</Label>
            <Input id="mp-check" value={campos.Check}
                   onChange={(e) => setCampos((c) => ({ ...c, Check: e.target.value }))} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" disabled={mutacao.isPending} onClick={onClose}>Cancelar</Button>
          <Button size="sm" disabled={mutacao.isPending} onClick={() => mutacao.mutate()}>
            {mutacao.isPending ? 'Enviando…' : atualizar ? 'Atualizar dados' : 'Mover para o Plano'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Build + commit**

Run: `cd frontend && npm run build` → PASS.

```bash
git add frontend/src/features/coffee/mover-plano-modal.tsx
git commit -m "feat(coffee): modal Mover para o Plano (individual, atualizar e lote) com useMutation"
```

### Task 12: Fiação nas telas COFFEE + navegação COFFEE→INPUT

**Files:**
- Modify: `frontend/src/features/coffee/coffee-corrigidas.tsx` (Revisar + seleção múltipla + mover em lote)
- Modify: `frontend/src/features/coffee/coffee-geradas.tsx` (Revisar na zona "Notas Geradas")
- Modify: `frontend/src/features/coffee/coffee-pendentes.tsx` (Revisar — mover fica bloqueado pelo `pode_mover`)
- Modify: `frontend/src/features/coffee/coffee-hub.tsx` (prop `onIrParaInput`)
- Modify: `frontend/src/App.tsx:211-216` (callback)
- Docs: `docs/dev/02-frontend-coffee.md`, `docs/dev/03-frontend-input.md`

**Interfaces:**
- Consumes: `RevisarNotaBtn`, `RevisarNotaSheet` (Task 10), `MoverPlanoModal`/`MoverAlvo` (Task 11).
- Produces: fluxo completo das duas ações da spec, com lote em Corrigidas.

- [ ] **Step 1: `App.tsx`** — passar callback ao hub (padrão `onBackToTriagem`):

```tsx
<CoffeeHub notes={notes}
           sub={coffeeSub} setSub={setCoffeeSub}
           triage={triage}
           coffeeReturn={coffeeReturn}
           onClearReturn={() => setCoffeeReturn(null)}
           onBackToTriagem={() => { setCoffeeSub("verificar"); }}
           onIrParaInput={() => { setInputSub("visao"); setSection("input"); }} />
```

- [ ] **Step 2: `coffee-hub.tsx`** — aceitar e repassar:

```tsx
interface CoffeeHubProps {
  // ...campos existentes...
  onIrParaInput?: () => void;
}
```

Repassar `onIrParaInput={onIrParaInput}` para `<CoffeeGeradas />`, `<CoffeeCorrigidas />` e `<CoffeePendentes />`.

- [ ] **Step 3: `coffee-corrigidas.tsx`** — tela principal do fluxo. Mudanças:

1. Props: `export function CoffeeCorrigidas({ onIrParaInput }: { onIrParaInput?: () => void })`.
2. Estados novos: `const [revisaoPk, setRevisaoPk] = React.useState<number | null>(null);`, `const [moverAlvo, setMoverAlvo] = React.useState<MoverAlvo | null>(null);`, `const [selecionadas, setSelecionadas] = React.useState<Set<number>>(new Set());`.
3. `CoffeeNotasTable` ganha `selectable selectedPks={selecionadas} onToggleSelect={(pk) => setSelecionadas((s) => { const n = new Set(s); if (n.has(pk)) n.delete(pk); else n.add(pk); return n; })} onToggleAll={() => setSelecionadas((s) => s.size === filtradas.length ? new Set() : new Set(filtradas.map((n) => n.pk)))}` e `actionColumn` vira:

```tsx
actionColumn={(nota) => (
  <>
    <AbrirCoffeeBtn pk={nota.pk} />
    <RevisarNotaBtn pk={nota.pk} onClick={() => setRevisaoPk(nota.pk)} />
    <LogsBtn pk={nota.pk} onClick={() => setDrawerPk(nota.pk)} />
  </>
)}
```

4. No header (ao lado de "Copiar IDs"):

```tsx
<Button size="sm" disabled={selecionadas.size === 0}
        onClick={() => setMoverAlvo({ pks: [...selecionadas], revisao: null })}>
  Mover p/ Plano ({selecionadas.size})
</Button>
```

5. Renderizar no fim (imports: `RevisarNotaSheet`, `MoverPlanoModal`, `type MoverAlvo`, `RevisarNotaBtn`):

```tsx
<RevisarNotaSheet pk={revisaoPk} onClose={() => setRevisaoPk(null)}
                  onMover={(revisao) => { setRevisaoPk(null); setMoverAlvo({ pks: [revisao.coffee.pk], revisao }); }} />
<MoverPlanoModal alvo={moverAlvo} onClose={() => setMoverAlvo(null)}
                 onSucesso={() => setSelecionadas(new Set())}
                 onIrParaInput={onIrParaInput} />
```

- [ ] **Step 4: `coffee-geradas.tsx` e `coffee-pendentes.tsx`** — fluxo individual apenas: mesmos estados `revisaoPk`/`moverAlvo`, `RevisarNotaBtn` no `actionColumn` (em geradas, só na zona "Notas Geradas"), mesmo par `<RevisarNotaSheet/>`+`<MoverPlanoModal/>` no fim, prop `onIrParaInput` aceita e repassada. Em pendentes o CTA do sheet já sai desabilitado por `pode_mover=false` — nenhuma lógica extra.

- [ ] **Step 5: Build + verificação manual**

Run: `cd frontend && npm run build` → PASS.
Depois: subir backend (`cd backend && uvicorn main:app`) e conferir no navegador: Corrigidas → olho → sheet com dados; mover 1 nota → aparece no INPUT; mover de novo → 409 amigável → "Atualizar dados"; seleção múltipla → lote.

- [ ] **Step 6: Docs + commit**

`02-frontend-coffee.md`: seções Revisar Nota e Mover para o Plano (componentes, estados, pontos de contato com o INPUT: `INPUT_DADOS_KEY`, convenção `edp_input_user`, callback `onIrParaInput`). `03-frontend-input.md`: nota sobre notas vindas do COFFEE serem indistinguíveis de cadastro manual.

```bash
git add frontend/src/features/coffee/ frontend/src/App.tsx docs/dev/02-frontend-coffee.md docs/dev/03-frontend-input.md
git commit -m "feat(coffee): acoes Revisar Nota e Mover para o Plano (individual e lote) nas telas"
```

---

## Entrega D — Performance backend: versão de dataset + ETag

### Task 13: Versão do dataset + log do scheduler noturno

**Files:**
- Modify: `backend/input_module/db.py` (nova função no fim)
- Modify: `backend/input_module/routes.py:291-309` (`_rotina_sap_background`)
- Test: `backend/test_input_module.py`
- Docs: `docs/dev/06-backend-input-module.md`

**Interfaces:**
- Produces: `db.obter_versao_dataset() -> str` — muda quando: edição/exclusão (log_alteracoes), criação (COUNT notas), importação de base (log_arquivos). Task 14/15 consomem.

- [ ] **Step 1: Testes que falham**

```python
def test_versao_dataset_muda_com_escritas(banco_temporario):
    from input_module import db, service
    import datetime
    v0 = db.obter_versao_dataset()
    nota = service.NovaNota(Numero_Nota=777001, Status_Nota="00 Pendente", Prioridade_Nota="Programável")
    service.criar_notas([nota], usuario="teste")           # criação não loga: pega pelo COUNT(notas)
    v1 = db.obter_versao_dataset()
    assert v1 != v0
    db.aplicar_edicoes([{"Numero_Nota": 777001, "Observacao": "editada"}], usuario="teste")
    v2 = db.obter_versao_dataset()
    assert v2 != v1
    db.salvar_log_arquivo("Gerada_base_IW28.XLSX", "robo-sap", datetime.datetime.now(), "Sync SAP")
    assert db.obter_versao_dataset() != v2
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && python -m pytest test_input_module.py -k versao -v`
Expected: FAIL.

- [ ] **Step 3: Implementar em `db.py`**

```python
def obter_versao_dataset() -> str:
    """Versão barata do dataset, derivada dos logs + contagem de notas.

    Muda quando: edição/exclusão/undo (log_alteracoes), criação (COUNT de
    notas — criação não passa pelo log), importação de base (log_arquivos).
    É a moeda de revalidação do cache do engine e do ETag de GET /notas.
    """
    conn = get_db_connection()
    try:
        max_alt = conn.execute("SELECT MAX(Data_Hora) FROM log_alteracoes").fetchone()[0]
        qtd_alt = conn.execute("SELECT COUNT(*) FROM log_alteracoes").fetchone()[0]
        max_arq = conn.execute("SELECT MAX(Data_Hora) FROM log_arquivos").fetchone()[0]
        qtd_notas = conn.execute("SELECT COUNT(*) FROM notas").fetchone()[0]
    finally:
        conn.close()
    return f"{max_alt}|{qtd_alt}|{max_arq}|{qtd_notas}"
```

E em `_rotina_sap_background` (routes.py), após os três `_processar_upload_base(...)` e antes de `engine.invalidar_cache()`:

```python
        agora = datetime.datetime.now()
        for nome in ("Gerada_base_IW28.XLSX", "Gerada_custo_ord_IW38.XLSX",
                     "Gerada_medidas_IW66.XLSX"):
            db.salvar_log_arquivo(nome, "robo-sap", agora, "Sync SAP")
```

(O scheduler hoje NÃO loga — sem isso a importação noturna não mudaria a versão.)

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && python -m pytest test_input_module.py -v` → PASS.

- [ ] **Step 5: Docs + commit**

`06-backend-input-module.md`: seção "Versão do dataset" (composição, o que cobre, limitação: escrita direta no .db sem log não é detectada — TTL 600s segue como fallback).

```bash
git add backend/input_module/ backend/test_input_module.py docs/dev/06-backend-input-module.md
git commit -m "feat(input): versao de dataset derivada dos logs + log do scheduler noturno"
```

### Task 14: Cache do engine validado por versão + memo de `status_bases`

**Files:**
- Modify: `backend/input_module/engine.py:593-627`
- Test: `backend/test_input_module.py`
- Docs: `docs/dev/06-backend-input-module.md`

**Interfaces:**
- Mantém assinaturas públicas (`get_dataset`, `invalidar_cache`, `status_bases`). Comportamento novo: cache invalida sozinho quando a versão muda (multiusuário/multi-worker correto); stats SMB no máximo 1x/60s.

- [ ] **Step 1: Teste que falha**

```python
def test_get_dataset_revalida_por_versao(banco_temporario, monkeypatch):
    from input_module import db, engine, service
    engine.invalidar_cache()
    df1 = engine.get_dataset()
    chamadas = {"n": 0}
    original = engine.enriquecer_dados
    def contando():
        chamadas["n"] += 1
        return original()
    monkeypatch.setattr(engine, "enriquecer_dados", contando)
    engine.get_dataset()                      # versão igual: serve do cache
    assert chamadas["n"] == 0
    nota = service.NovaNota(Numero_Nota=888001, Status_Nota="00 Pendente", Prioridade_Nota="Programável")
    service.criar_notas([nota], usuario="teste")   # muda a versão (sem invalidar_cache manual)
    df2 = engine.get_dataset()
    assert chamadas["n"] == 1
    assert 888001 in df2["Numero_Nota"].values
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && python -m pytest test_input_module.py -k revalida -v`
Expected: FAIL (cache TTL serve dado velho, `chamadas == 0` no segundo trecho).

- [ ] **Step 3: Implementar em `engine.py`** — substituir o bloco de cache (linhas 596-626) por:

```python
_CACHE_TTL_SEGUNDOS = 600  # fallback para escritas que não passem pelos logs
_cache = {"df": None, "quando": 0.0, "versao": None}
_cache_lock = threading.Lock()


def get_dataset(forcar: bool = False) -> pd.DataFrame:
    with _cache_lock:
        versao = db.obter_versao_dataset()
        expirado = time.time() - _cache["quando"] > _CACHE_TTL_SEGUNDOS
        if (forcar or _cache["df"] is None or expirado
                or _cache["versao"] != versao):
            _cache["df"] = enriquecer_dados()
            _cache["quando"] = time.time()
            _cache["versao"] = versao
        return _cache["df"].copy()


def invalidar_cache() -> None:
    with _cache_lock:
        _cache["df"] = None


_STATUS_BASES_TTL_SEGUNDOS = 60
_status_bases_cache = {"quando": 0.0, "valor": None}


def status_bases() -> list:
    """Stats dos 7 caminhos SMB, cacheados 60s — fora do hot path de GET /notas."""
    agora = time.time()
    if (_status_bases_cache["valor"] is not None
            and agora - _status_bases_cache["quando"] < _STATUS_BASES_TTL_SEGUNDOS):
        return _status_bases_cache["valor"]
    bases = []
    for nome, caminho in config.BASES_REDE.items():
        existe = os.path.exists(caminho)
        bases.append({
            "nome": nome,
            "arquivo": os.path.basename(caminho),
            "encontrada": existe,
            "modificada": datetime.datetime.fromtimestamp(
                os.path.getmtime(caminho)).isoformat() if existe else None,
        })
    _status_bases_cache["quando"] = agora
    _status_bases_cache["valor"] = bases
    return bases
```

(`from input_module import db` já deve existir no topo do engine; conferir e adicionar se faltar.)

- [ ] **Step 4: Rodar TODOS os testes**

Run: `cd backend && python -m pytest test_input_module.py test_integracao_module.py -v` → PASS.

- [ ] **Step 5: Docs + commit**

```bash
git add backend/input_module/engine.py backend/test_input_module.py docs/dev/06-backend-input-module.md
git commit -m "perf(input): cache do engine validado por versao + memo 60s de status_bases"
```

### Task 15: ETag/304 em `GET /notas` + `versao` no `/sync` + front usa a versão

**Files:**
- Modify: `backend/input_module/routes.py:43-63` (listar_notas, sync)
- Modify: `frontend/src/features/input/api.ts:41` (tipo do sync)
- Modify: `frontend/src/features/input/types.ts` (`InputMeta.versao`)
- Modify: `frontend/src/features/input/use-input-data.ts` (polling compara `versao`)
- Test: `backend/test_input_module.py`
- Docs: `docs/dev/06-backend-input-module.md`, `docs/dev/03-frontend-input.md`

**Interfaces:**
- `GET /api/input/notas` responde `ETag: W/"<versao>"` + `Cache-Control: no-cache`; com `If-None-Match` igual → 304 sem tocar o engine (o cache HTTP do navegador serve o corpo ao `fetch` de forma transparente). `meta.versao: string` novo. `GET /sync` → `{ultima_alteracao, versao}`.

- [ ] **Step 1: Teste que falha**

```python
def test_notas_etag_304(banco_temporario):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from input_module.routes import router
    app = FastAPI(); app.include_router(router)
    client = TestClient(app)
    r1 = client.get("/api/input/notas")
    assert r1.status_code == 200
    etag = r1.headers["etag"]
    assert r1.json()["meta"]["versao"]
    r2 = client.get("/api/input/notas", headers={"If-None-Match": etag})
    assert r2.status_code == 304
    r3 = client.get("/api/input/sync")
    assert "versao" in r3.json()
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && python -m pytest test_input_module.py -k etag -v` → FAIL.

- [ ] **Step 3: Implementar em `routes.py`** (adicionar `Request` ao import de fastapi):

```python
@router.get("/notas")
def listar_notas(request: Request, response: Response):
    migracao = garantir_banco()
    versao = db.obter_versao_dataset()
    etag = f'W/"{versao}"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    df = engine.get_dataset()
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "no-cache"
    return {
        "registros": _df_para_registros(df),
        "meta": {
            "status_opcoes": list(config.STATUS_MAP.values()),
            "prioridade_opcoes": config.PRIORIDADES,
            "bases": engine.status_bases(),
            "ultima_alteracao": db.obter_data_ultima_alteracao(),
            "migracao": migracao,
            "colunas": config.COLUNAS_PAINEL,
            "versao": versao,
        },
    }


@router.get("/sync")
def sync():
    garantir_banco()
    return {
        "ultima_alteracao": db.obter_data_ultima_alteracao(),
        "versao": db.obter_versao_dataset(),
    }
```

- [ ] **Step 4: Frontend** — `features/input/types.ts`: adicionar `versao: string;` a `InputMeta`. `features/input/api.ts`: `sync: () => req<{ ultima_alteracao: string | null; versao: string }>('/sync')`. `use-input-data.ts`: `useSincronizacaoAutomatica` passa a receber/comparar `versao` (criações passam a ser detectadas):

```ts
export function useSincronizacaoAutomatica(versaoConhecida: string | undefined): void {
  const qc = useQueryClient();
  React.useEffect(() => {
    if (versaoConhecida === undefined) return;
    const id = window.setInterval(() => {
      InputApi.sync()
        .then((s) => {
          if (s.versao !== versaoConhecida) {
            toast.info('Dados atualizados por outro usuário', {
              description: 'A tabela foi recarregada em segundo plano.',
            });
            void qc.invalidateQueries({ queryKey: INPUT_DADOS_KEY });
          }
        })
        .catch(() => { /* backend fora: o erro aparece no fluxo principal */ });
    }, 60_000);
    return () => window.clearInterval(id);
  }, [versaoConhecida, qc]);
}
```

E em `input-section.tsx`: `useSincronizacaoAutomatica(dados?.meta.versao);`.

- [ ] **Step 5: Rodar tudo**

Run: `cd backend && python -m pytest test_input_module.py test_integracao_module.py -v` → PASS.
Run: `cd frontend && npm run build` → PASS.

- [ ] **Step 6: Docs + commit**

```bash
git add backend/input_module/routes.py frontend/src/features/input/ backend/test_input_module.py docs/dev/03-frontend-input.md docs/dev/06-backend-input-module.md
git commit -m "perf(input): ETag/304 em GET /notas e polling por versao de dataset"
```

---

### Task 16: Verificação de ponta a ponta + auditoria

**Files:** nenhum novo — validação e limpeza.

- [ ] **Step 1: Suíte completa**

Run: `cd backend && python -m pytest test_upload.py test_input_module.py test_coffee_module.py test_integracao_module.py -v` → PASS.
Run: `cd frontend && npm run build` → PASS.

- [ ] **Step 2: Subir e exercitar o fluxo real** (regra do usuário: sempre build + subir antes de reportar; usar a skill `verify`)

```bash
cd backend && uvicorn main:app
```

Roteiro: (1) COFFEE → Corrigidas → olho → sheet mostra COFFEE + IW28 + proposta; (2) Mover 1 nota → toast → "Ver no plano" → nota no INPUT com Local/Circuito/Prioridade certos; (3) mover a mesma de novo → 409 amigável → sheet oferece "Atualizar dados" → atualiza sem resetar Status_Nota; (4) selecionar 2+ em Corrigidas → mover em lote; (5) F5 no INPUT → dados renderizam do cache HTTP/RQ com revalidação em background (aba Network: `GET /notas` → 304); (6) editar em outra aba anônima → aba original converge em ≤60s com toast.

- [ ] **Step 3: Auditoria pós-feature** (regra do usuário): rodar `/simplify` e depois `/code-review` sobre o diff da branch; aplicar o que for real.

- [ ] **Step 4: Checklist do CLAUDE.md** (sem `console.log`, sem import morto, docs atualizados em todos os commits) e commit final de ajustes, se houver.
