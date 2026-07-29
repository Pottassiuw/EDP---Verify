# Relatórios Status 99 e Caminhos SAP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a raiz das extrações SAP e contabilizar `Status_Final = 99` como executado, com fallback de mês planejado e aviso visível quando faltar data SAP.

**Architecture:** `input_module.config` define uma única raiz para IW28/IW38/IW66. `input_module.relatorios` mantém a classificação e a atribuição mensal em funções puras, devolvendo o contador anual de notas executadas sem data. A feature React de Relatórios tipa o novo contrato, alinha `mes_referencia` ao payload real e renderiza um banner âmbar.

**Tech Stack:** Python, Pandas, pytest, FastAPI, React 18, TypeScript, React Query, Vitest.

## Global Constraints

- Usar `Status_Final` como fonte principal do código exato 99; `Status_Nota` só é fallback quando `Status_Final` está ausente.
- Preservar `Export_status = "ENCE EXEC"`; não ampliar outros textos da linha 20 nesta entrega.
- Sem data SAP válida, contabilizar no mês planejado e contar uma nota no aviso anual do filtro regional ativo.
- Derivar IW28, IW38 e IW66 de `REDE_ARQUIVOS_SAP`.
- Não adicionar dependências nem criar abstrações fora do escopo.
- Atualizar `docs/dev/` junto com cada mudança de código.
- Preservar a alteração do usuário em `AGENTS.md`; nunca incluí-la nos commits desta entrega.

---

### Task 1: Unificar caminhos das extrações SAP

**Files:**
- Modify: `backend/test_input_module.py`
- Modify: `backend/input_module/config.py`
- Modify: `docs/dev/06-backend-input-module.md`

**Interfaces:**
- Consumes: `config.REDE_ARQUIVOS_SAP: str`.
- Produces: `CAMINHO_BASE_IW28`, `CAMINHO_CUSTO_ORD_IW38` e `CAMINHO_BASE_IW66` sob a mesma raiz.

- [ ] **Step 1: Escrever o teste de caminho**

Adicionar após `test_config_dicionarios_completos`:

```python
def test_extracoes_sap_compartilham_raiz_arquivos_sap():
    arquivos = {
        config.CAMINHO_BASE_IW28: "Gerada_base_IW28.XLSX",
        config.CAMINHO_CUSTO_ORD_IW38: "Gerada_custo_ord_IW38.XLSX",
        config.CAMINHO_BASE_IW66: "Gerada_medidas_IW66.XLSX",
    }

    for caminho, arquivo in arquivos.items():
        assert caminho == config.REDE_ARQUIVOS_SAP + f"\\{arquivo}"
```

- [ ] **Step 2: Executar RED**

Run em `backend/`:

```powershell
.\venv\Scripts\python.exe -m pytest test_input_module.py::test_extracoes_sap_compartilham_raiz_arquivos_sap -v
```

Expected: FAIL para IW28 e IW66, pois ambos ainda apontam diretamente para `REDE_INPUT_SQL`.

- [ ] **Step 3: Implementar a raiz única**

Substituir o bloco de caminhos SAP em `backend/input_module/config.py` por:

```python
REDE_RAIZ = r"\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM"
REDE_INPUT_SQL = REDE_RAIZ + r"\INPUT SQL"
REDE_ARQUIVOS_SAP = REDE_INPUT_SQL + r"\Arquivos_SAP"
REDE_BASES_APOIO = REDE_INPUT_SQL + r"\Bases_Apoio"

REDE_DB_ORIGEM = REDE_INPUT_SQL + r"\notas_departamento.db"

CAMINHO_BASE_IW28 = REDE_ARQUIVOS_SAP + r"\Gerada_base_IW28.XLSX"
CAMINHO_CUSTO_ORD_IW38 = REDE_ARQUIVOS_SAP + r"\Gerada_custo_ord_IW38.XLSX"
CAMINHO_BASE_IW66 = REDE_ARQUIVOS_SAP + r"\Gerada_medidas_IW66.XLSX"
```

Isso também remove a segunda declaração idêntica de `REDE_BASES_APOIO`.

- [ ] **Step 4: Atualizar manual do backend**

Adicionar após a introdução de `docs/dev/06-backend-input-module.md`:

```markdown
## Origem das extrações SAP

IW28, IW38 e IW66 são lidas e gravadas sob a raiz única
`\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\INPUT SQL\Arquivos_SAP`.
`config.REDE_ARQUIVOS_SAP` é a fonte dos três caminhos; não monte caminhos
SAP diretamente a partir de `REDE_INPUT_SQL`.
```

- [ ] **Step 5: Executar GREEN**

Run em `backend/`:

```powershell
.\venv\Scripts\python.exe -m pytest test_input_module.py::test_extracoes_sap_compartilham_raiz_arquivos_sap -v
```

Expected: PASS.

- [ ] **Step 6: Commit isolado**

```powershell
git add -- backend/test_input_module.py backend/input_module/config.py docs/dev/06-backend-input-module.md
git commit -m "fix(input): unify SAP extraction paths"
```

### Task 2: Reconhecer Status Final 99 e sinalizar falta de data

**Files:**
- Modify: `backend/test_input_module.py`
- Modify: `backend/input_module/relatorios.py`
- Modify: `docs/dev/06-backend-input-module.md`

**Interfaces:**
- Consumes: linhas Pandas com `Status_Final`, `Status_Nota`, `Export_status`, `Encerram.por data` e `Mes_Execucao_Planejado`.
- Produces: `_status_99(valor) -> bool`, `_executada(row) -> bool`, fatos com `executada_sem_data: bool` e payload `avisos.executadas_sem_data: int`.

- [ ] **Step 1: Escrever testes unitários de código 99**

Adicionar antes de `_fx_relatorios` em `backend/test_input_module.py`:

```python
@pytest.mark.parametrize("valor", [99, 99.0, "99", "99.0", "99 Encerrado"])
def test_relatorios_reconhece_codigo_99_exato(valor):
    from input_module import relatorios

    assert relatorios._status_99(valor) is True


@pytest.mark.parametrize("valor", [None, "-", 9, 98, 999, "999", "99A"])
def test_relatorios_nao_confunde_outros_status_com_99(valor):
    from input_module import relatorios

    assert relatorios._status_99(valor) is False


def test_relatorios_status_final_preenchido_prevalece_sobre_status_nota():
    from input_module import relatorios

    row = pd.Series({
        "Status_Final": "10 Em planejamento",
        "Status_Nota": "99 Encerrado",
        "Export_status": "-",
    })

    assert relatorios._executada(row) is False


def test_relatorios_preserva_fallbacks_existentes():
    from input_module import relatorios

    status_local = pd.Series({
        "Status_Final": "-",
        "Status_Nota": "99 Encerrado",
        "Export_status": "-",
    })
    status_textual_sap = pd.Series({
        "Status_Final": "ENCE EXEC",
        "Status_Nota": "10 Em planejamento",
        "Export_status": "ENCE EXEC",
    })

    assert relatorios._executada(status_local) is True
    assert relatorios._executada(status_textual_sap) is True
```

- [ ] **Step 2: Escrever testes do mês e do aviso**

Adicionar após os testes anteriores:

```python
def _dashboard_nota_status_final(
    status_final,
    encerramento,
    regional="Guarulhos",
):
    from input_module import relatorios

    df_notas = pd.DataFrame([{
        "Numero_Nota": 9001,
        "Conjunto": "POSTES - CAPEX",
        "Planejado_DDPM": 2.0,
        "Mes_Execucao_Planejado": "jul-2026",
        "Regional": regional,
        "Regional_CSD": regional,
        "Status_Final": status_final,
        "Status_Nota": "10 Em planejamento",
        "Export_status": "-",
        "Encerram.por data": encerramento,
    }])
    _, df_ramal, df_metas, df_depara, df_postergacoes = _fx_relatorios()

    return relatorios.montar_dashboard(
        df_notas,
        df_ramal.iloc[0:0],
        df_metas,
        df_depara,
        df_postergacoes.iloc[0:0],
        ano=2026,
        mes_referencia=7,
        regional=None,
    )


def test_dashboard_status_final_99_usa_mes_real():
    dashboard = _dashboard_nota_status_final(99, "2026-08-03")

    julho = dashboard["mensalizacao"][6]
    agosto = dashboard["mensalizacao"][7]
    assert julho["executado"] == 0.0
    assert agosto["executado"] == 2.0
    assert dashboard["avisos"]["executadas_sem_data"] == 0


def test_dashboard_status_final_99_sem_data_usa_mes_planejado_e_avisa():
    dashboard = _dashboard_nota_status_final("99 Encerrado", None)

    julho = dashboard["mensalizacao"][6]
    assert julho["executado"] == 2.0
    assert dashboard["avisos"]["executadas_sem_data"] == 1


def test_dashboard_aviso_sem_data_respeita_filtro_regional():
    dashboard = _dashboard_nota_status_final(
        "99 Encerrado",
        None,
        regional="Mogi das Cruzes",
    )
    from input_module import relatorios
    _, df_ramal, df_metas, df_depara, df_postergacoes = _fx_relatorios()
    nota_sem_data = pd.DataFrame([{
        "Numero_Nota": 9002,
        "Conjunto": "POSTES - CAPEX",
        "Planejado_DDPM": 1.0,
        "Mes_Execucao_Planejado": "jul-2026",
        "Regional": "Mogi das Cruzes",
        "Regional_CSD": "Mogi das Cruzes",
        "Status_Final": "99",
        "Status_Nota": "10 Em planejamento",
        "Export_status": "-",
        "Encerram.por data": None,
    }])
    filtrado = relatorios.montar_dashboard(
        nota_sem_data,
        df_ramal.iloc[0:0],
        df_metas,
        df_depara,
        df_postergacoes.iloc[0:0],
        ano=2026,
        mes_referencia=7,
        regional="Guarulhos",
    )

    assert dashboard["avisos"]["executadas_sem_data"] == 1
    assert filtrado["avisos"]["executadas_sem_data"] == 0
```

- [ ] **Step 3: Executar RED**

Run em `backend/`:

```powershell
.\venv\Scripts\python.exe -m pytest test_input_module.py -k "relatorios_reconhece_codigo_99_exato or relatorios_nao_confunde_outros_status_com_99 or relatorios_status_final or dashboard_status_final_99 or dashboard_aviso_sem_data" -v
```

Expected: FAIL porque `_status_99` e `avisos` ainda não existem, e `_executada` ignora `Status_Final`.

- [ ] **Step 4: Implementar classificação exata**

Adicionar `import re` no topo de `backend/input_module/relatorios.py` e substituir `_executada`:

```python
def _status_99(valor) -> bool:
    if pd.isna(valor):
        return False
    texto = str(valor).strip()
    return re.fullmatch(r"99(?:\.0+)?(?:\s+.*)?", texto) is not None


def _valor_preenchido(valor) -> bool:
    if pd.isna(valor):
        return False
    return str(valor).strip().lower() not in ("", "-", "nan", "none")


def _executada(row) -> bool:
    status_final = row.get("Status_Final")
    status_99 = (
        _status_99(status_final)
        if _valor_preenchido(status_final)
        else _status_99(row.get("Status_Nota"))
    )
    status_textual = str(row.get("Export_status") or "").strip().upper()
    return status_99 or status_textual == "ENCE EXEC"
```

Atualizar o docstring do módulo:

```python
"""Agregação do dashboard do Plano de Recomposição (funções puras).

Regras:
- Executado: código exato 99 em Status_Final; Status_Nota é fallback quando
  Status_Final está ausente; Export_status == "ENCE EXEC" é preservado.
- Com data SAP válida, execução usa o mês real. Sem data, usa o mês planejado
  e incrementa avisos.executadas_sem_data.
"""
```

- [ ] **Step 5: Implementar mês planejado e contador**

Em `_linhas_fato`, produzir `executada_sem_data` para notas e ramais:

```python
        enc = pd.to_datetime(row.get("Encerram.por data"), errors="coerce")
        executada = _executada(row)
        exec_mes = None
        executada_sem_data = False
        if executada and pd.notna(enc) and enc.year == ano:
            exec_mes = int(enc.month)
        elif executada and pd.isna(enc):
            exec_mes = mes
            executada_sem_data = True
        fatos.append({
            "plano": str(row.get("Conjunto") or "-").strip(),
            "regional": _regional_csd_nota(row),
            "mes": mes,
            "qtd": float(row.get("Planejado_DDPM") or 0),
            "exec_mes": exec_mes,
            "executada_sem_data": executada_sem_data,
        })
```

No bloco de ramal:

```python
        executada = _executada(row)
        fatos.append({
            "plano": PLANO_RAMAL,
            "regional": _regional_csd_ramal(row.get("Local_Instalacao")),
            "mes": mes,
            "qtd": float(row.get("Planejado_DDPM") or 0),
            "exec_mes": mes if executada else None,
            "executada_sem_data": executada,
        })
```

Manter schema vazio completo:

```python
        return pd.DataFrame(columns=[
            "plano", "regional", "mes", "qtd", "exec_mes",
            "executada_sem_data",
        ])
```

Depois de criar `fato_f` em `montar_dashboard`, calcular:

```python
    avisos = {
        "executadas_sem_data": (
            int(fato_f["executada_sem_data"].sum()) if not fato_f.empty else 0
        ),
    }
```

Incluir no retorno:

```python
    return {
        "ano": ano,
        "mes_referencia": mes_referencia,
        "regional": regional,
        "hero": hero,
        "visao_anual": linhas,
        "mensalizacao": mensalizacao,
        "regionais": regionais,
        "financeiro_ano": fin,
        "avisos": avisos,
    }
```

- [ ] **Step 6: Atualizar manual do backend**

No item `GET /relatorios/dashboard` de `docs/dev/06-backend-input-module.md`, acrescentar:

```markdown
Executado reconhece o código exato 99 em `Status_Final`; `Status_Nota` só é
fallback quando o consolidado está ausente, e `ENCE EXEC` continua válido.
Sem `Encerram.por data`, a execução usa `Mes_Execucao_Planejado` e o payload
incrementa `avisos.executadas_sem_data`, contado por nota no ano e no filtro
regional ativo.
```

- [ ] **Step 7: Executar GREEN e regressão do backend**

Run em `backend/`:

```powershell
.\venv\Scripts\python.exe -m pytest test_input_module.py -v
```

Expected: todos os testes de `test_input_module.py` passam.

- [ ] **Step 8: Commit isolado**

```powershell
git add -- backend/test_input_module.py backend/input_module/relatorios.py docs/dev/06-backend-input-module.md
git commit -m "fix(relatorios): count final status 99"
```

### Task 3: Exibir aviso e alinhar contrato do frontend

**Files:**
- Modify: `frontend/src/features/relatorios/types.ts`
- Modify: `frontend/src/features/relatorios/relatorios-data.ts`
- Modify: `frontend/src/features/relatorios/relatorios-data.test.ts`
- Modify: `frontend/src/features/relatorios/relatorios-section.tsx`
- Modify: `frontend/src/features/relatorios/use-relatorios-data.ts`
- Modify: `frontend/src/features/relatorios/dashboard/resumo-decisao.tsx`
- Modify: `frontend/src/features/relatorios/mensalizacao/mensalizacao.tsx`
- Modify: `frontend/src/features/relatorios/postergacoes/postergacoes.tsx`
- Modify: `frontend/src/features/relatorios/postergacoes/postergacoes-kpis.tsx`
- Modify: `frontend/src/features/relatorios/postergacoes/postergacoes-por-mes.tsx`
- Modify: `docs/dev/09-frontend-relatorios.md`

**Interfaces:**
- Consumes: `DashboardRelatorios.avisos.executadas_sem_data` e `DashboardRelatorios.mes_referencia`.
- Produces: `criarAvisoExecutadasSemData(quantidade: number) -> string | null` e banner de status no shell de Relatórios.

- [ ] **Step 1: Escrever teste da mensagem**

Importar `criarAvisoExecutadasSemData` em `relatorios-data.test.ts` e adicionar:

```typescript
describe('criarAvisoExecutadasSemData', () => {
  it('omite o aviso quando nenhuma nota usou o mês planejado', () => {
    expect(criarAvisoExecutadasSemData(0)).toBeNull();
  });

  it('explica o fallback no singular', () => {
    expect(criarAvisoExecutadasSemData(1)).toBe(
      'Neste ano, 1 nota executada sem data de encerramento SAP foi contabilizada no mês planejado.',
    );
  });

  it('explica o fallback no plural', () => {
    expect(criarAvisoExecutadasSemData(2)).toBe(
      'Neste ano, 2 notas executadas sem data de encerramento SAP foram contabilizadas no mês planejado.',
    );
  });
});
```

- [ ] **Step 2: Executar RED**

Run em `frontend/`:

```powershell
npm test -- relatorios-data.test.ts
```

Expected: FAIL porque `criarAvisoExecutadasSemData` ainda não é exportada.

- [ ] **Step 3: Implementar mensagem pura**

Adicionar em `relatorios-data.ts`:

```typescript
export function criarAvisoExecutadasSemData(quantidade: number): string | null {
  if (quantidade <= 0) {
    return null;
  }

  if (quantidade === 1) {
    return 'Neste ano, 1 nota executada sem data de encerramento SAP foi contabilizada no mês planejado.';
  }

  return `Neste ano, ${quantidade} notas executadas sem data de encerramento SAP foram contabilizadas no mês planejado.`;
}
```

- [ ] **Step 4: Tipar payload real**

Atualizar `DashboardRelatorios` em `types.ts`:

```typescript
export interface DashboardRelatorios {
  ano: number;
  mes_referencia: number;
  regional: string | null;
  regionais_disponiveis: string[];
  hero: HeroMes;
  visao_anual: LinhaAnual[];
  mensalizacao: MesMensalizacao[];
  regionais: RegionalResumo[];
  financeiro_ano: { meta_rs: number; carteira_rs: number; gap_rs: number };
  avisos: { executadas_sem_data: number };
  metas_info: MetasInfo;
}
```

Trocar somente os acessos ao campo do payload:

```typescript
dashboard.mes_corrente
principal.data?.mes_corrente
principal.data.mes_corrente
```

por:

```typescript
dashboard.mes_referencia
principal.data?.mes_referencia
principal.data.mes_referencia
```

Aplicar nos arquivos listados nesta tarefa. Props internas chamadas
`mesCorrente` podem manter o nome; apenas o campo da API muda.

Mapa exato dos acessos:

```typescript
// relatorios-section.tsx
dashboard?.mes_referencia

// use-relatorios-data.ts
principal.data?.mes_referencia
principal.data.mes_referencia
dashboard.mes_referencia

// dashboard/resumo-decisao.tsx
dashboard.mes_referencia

// mensalizacao/mensalizacao.tsx
dashboard.mes_referencia

// postergacoes/postergacoes.tsx
dashboard.mes_referencia

// postergacoes/postergacoes-kpis.tsx
dashboard.mes_referencia

// postergacoes/postergacoes-por-mes.tsx
dashboard.mes_referencia
```

- [ ] **Step 5: Renderizar banner**

Em `relatorios-section.tsx`, importar:

```typescript
import { criarAvisoExecutadasSemData } from './relatorios-data';
```

Após `const dashboard = dados.dashboard`, derivar:

```typescript
  const avisoExecutadasSemData = dashboard
    ? criarAvisoExecutadasSemData(dashboard.avisos.executadas_sem_data)
    : null;
```

Após o banner de erro de metas, renderizar:

```tsx
      {avisoExecutadasSemData && (
        <Banner tipo="err">{avisoExecutadasSemData}</Banner>
      )}
```

`Banner tipo="err"` já usa tokens âmbar em `app.css` e `role="status"`;
nenhum CSS ou componente vendorizado precisa mudar.

- [ ] **Step 6: Atualizar manual do frontend**

Corrigir `docs/dev/09-frontend-relatorios.md`:

```markdown
- **Mês** seleciona o recorte da série mensal devolvida pelo endpoint. O
  payload usa `mes_referencia`; o frontend não usa mais o nome legado
  `mes_corrente`.

## Executado e aviso de data SAP

O dashboard recebe `avisos.executadas_sem_data`, contador anual por nota e
por filtro regional. Valor maior que zero mostra banner âmbar no topo:
notas com código 99 foram contabilizadas no mês planejado porque
`Encerram.por data` estava ausente. O banner usa `role="status"` herdado de
`Banner`.
```

- [ ] **Step 7: Executar GREEN, busca de contrato antigo e build**

Run em `frontend/`:

```powershell
npm test -- relatorios-data.test.ts
npm run build
rg -n "mes_corrente" src/features/relatorios
```

Expected: Vitest PASS; build exit 0; `rg` sem resultados.

- [ ] **Step 8: Commit isolado**

```powershell
git add -- frontend/src/features/relatorios docs/dev/09-frontend-relatorios.md
git commit -m "fix(relatorios): warn missing SAP dates"
```

### Task 4: Verificação final

**Files:**
- Verify only: all modified files.

**Interfaces:**
- Consumes: implementação das Tasks 1–3.
- Produces: evidência fresca de testes, build, documentação e diff limpos.

- [ ] **Step 1: Rodar backend completo do módulo**

Run em `backend/`:

```powershell
.\venv\Scripts\python.exe -m pytest test_input_module.py -v
```

Expected: 0 failures.

- [ ] **Step 2: Rodar frontend completo**

Run em `frontend/`:

```powershell
npm test
npm run build
```

Expected: Vitest 0 failures; TypeScript/Vite exit 0.

- [ ] **Step 3: Revisar qualidade e escopo**

Run na raiz:

```powershell
rg -n "mes_corrente" frontend/src/features/relatorios
git diff --check
git status --short
git log -4 --oneline
```

Expected:

- nenhuma ocorrência de `mes_corrente` na feature;
- nenhum erro de whitespace;
- `AGENTS.md` continua modificado e fora dos commits;
- commits isolados mostram caminhos SAP, regra 99 e aviso frontend.

- [ ] **Step 4: Revisar checklist**

Confirmar:

```text
No duplicated logic
No dead code or console.log
Python and TypeScript typing consistent
Status 999 rejected
ENCE EXEC preserved
Warning filtered by regional
All SAP paths under REDE_ARQUIVOS_SAP
Developer manual updated
AGENTS.md untouched by implementation commits
```
