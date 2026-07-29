# Malha fina — correção em massa de local de instalação com "9" extra

**Data:** 2026-07-14
**Seções afetadas:** Verificar (frontend) + módulo COFFEE (backend)

## Problema

Notas travadas no COFFEE por local de instalação com um dígito "9" a
mais no final. O formato do local é fixo em 13 caracteres —
cidade(3) + tipo(2) + número(8) (`coffee_module/client.py:25`) — e o
"9" extra é sistemático (a chave de topologia de proteção da Input é
gerada concatenando `"9"` ao final). Hoje a correção é manual, uma
nota por vez (`POST /api/coffee/local-instalacao`).

## Solução

Detectar na planilha do Verificar os locais de 14 caracteres
terminados em "9" cujo prefixo de 13 caracteres existe em outra nota,
e corrigir em massa via API COFFEE, com confirmação prévia por nota e
geração opcional encadeada.

**Regra de negócio:** existem locais legítimos terminados em 9 (13
chars). A correção só se aplica quando há um dígito **a mais**
(14 chars) — e a direção é sempre **remover** o 9 final.

## Decisões de design

| Decisão | Escolha |
|---|---|
| Fonte da detecção | Planilha primeiro; COFFEE confirma antes de alterar |
| Direção | Sempre remover o 9 (local proposto = prefixo de 13 chars) |
| Escopo da varredura | Todas as linhas da planilha (coluna `local_instalacao`) |
| Confirmação COFFEE | `json_all/{id}` da nota travada — local atual deve ser o errado |
| UI | Detecção automática pós-upload, painel no dashboard Verificar |
| Pós-correção | Checkbox "Gerar após corrigir" (default off); geração só para itens corrigidos com sucesso |
| Arquitetura | Detecção no frontend (estado derivado); correção no backend (job em lote) |

## 1. Detecção (frontend)

Função pura `detectarNoveExtra(records)` em
`frontend/src/features/verificar/malha-fina.ts`:

1. Índice `local → notas[]` a partir de `record.raw.local_instalacao`
   de todas as linhas.
2. Candidato: local com 14 chars, termina em `"9"`, prefixo de 13
   chars existe no índice em ≥1 outra nota.
3. Saída agrupada por local errado:

```ts
type GrupoNoveExtra = {
  localErrado: string;          // ex.: 718ET000267739
  localProposto: string;        // ex.: 718ET00026773
  notasAfetadas: RecordNota[];  // todas com o local errado
  notasReferencia: RecordNota[]; // as que provam o prefixo
};
```

Consumido via `useMemo` no dashboard. Nada persiste — re-upload
recalcula. Notas afetadas sem `id` numérico são excluídas do grupo
(COFFEE exige int) e contadas como ignoradas no painel.

## 2. Correção (backend)

### Endpoint — `POST /api/coffee/corrigir-local-lote` (routes.py)

```python
class CorrigirLocalItem(BaseModel):
    id: int
    local: str          # local proposto (13 chars)

class CorrigirLocalPedido(BaseModel):
    itens: list[CorrigirLocalItem]
    gerar_apos: bool = False
```

- 400 se lista vazia ou algum `local` ≠ 13 chars.
- Loga `acao_usuario/correcao_local_lote` e retorna `{job_id}`.
- Polling pelo `GET /api/coffee/job/{job_id}` existente.

### Job — `jobs.iniciar_correcao_local(itens, gerar_apos, trace)`

Worker por item (padrão `_rodar_geracao`: thread daemon, `_LOCK`,
`time.sleep(DELAY)` entre itens, falha individual não derruba lote):

1. `client.buscar_nota(id)` — confirma local atual no COFFEE:
   - igual a `local + "9"` → segue para correção;
   - igual a `local` (proposto) → conta em `ja_corrigidas`, pula;
   - diferente dos dois → conta em `divergentes`, pula (planilha
     defasada; nunca altera).
2. `client.alterar_local(id, local)`.
3. Se `gerar_apos` e passos 1–2 ok: mesma lógica de geração do
   `_rodar_geracao` (SAP placeholder → desarquivar → re-busca →
   upsert → `marcar_gerar(pk, False)`).

Relatório do job: `corrigidas`, `ja_corrigidas`, `divergentes`,
`geradas`, `erros[{pk, msg}]`, além de `total/feitas/estado`.

Idempotência: rerodar o mesmo lote é seguro — itens já corrigidos
caem em `ja_corrigidas`.

## 3. UI — painel "Malha fina" (dashboard Verificar)

- Card renderizado só quando `grupos.length > 0`, com badge
  ("Malha fina · 3 grupos / 17 notas").
- Linha por grupo: checkbox · `localErrado` → `localProposto` (mono,
  DESIGN.md) · nº de notas afetadas · nº de referências. Expansível
  para listar ids.
- Seleção por grupo (corrige todas as notas do grupo).
- Header: selecionar tudo · checkbox "Gerar após corrigir" (default
  off) · botão "Corrigir selecionadas (N notas)".
- Confirmação via AlertDialog: N notas, M grupos, gerar sim/não.
- Progresso via polling do job; ao concluir, chips
  `corrigidas / já corrigidas / divergentes / erros` e grupos
  corrigidos saem da lista (marcação local, sem re-upload).
- Arquivos: `malha-fina.ts` (detecção) e `malha-fina-panel.tsx` (UI)
  em `features/verificar/`; mutation nova em `api.ts`.
- Visual segue DESIGN.md (skill frontend-design na implementação).

## 4. Edge cases

- Mesmo prefixo com duas variantes erradas → grupos separados.
- Nota referência travada por outro motivo → irrelevante (só prova o
  prefixo).
- Restart do servidor durante job → jobs são in-process (mesmo risco
  do gerar-lote atual); polling devolve 404, usuário reroda e itens
  já corrigidos caem em `ja_corrigidas`.

## 5. Testes

- Backend (`test_coffee_module.py`, API fake): caminho feliz,
  `ja_corrigidas`, `divergentes`, `gerar_apos` encadeando só os
  corrigidos, erro isolado não derruba lote, validação 13 chars.
- Frontend: `npm run build` (tsc); detecção como função pura
  facilita teste futuro.

## 6. Documentação

- `docs/dev/05-backend-coffee-module.md` — endpoint + job.
- Doc do Verificar frontend — painel e detecção.
- Mesmo commit da implementação.
