# Módulo Verificar

## O que faz

**Verificar** é a triagem de notas do COFFEE. A fonte é a tabela
`ids_verificacao` de `Verificar.db`, lida diretamente pela API em modo somente
leitura; o usuário não importa mais uma planilha.

O backend preserva o contrato já consumido pelo dashboard: converte as colunas
`chk_*` em falhas, ignora `chk_trafo`, resolve `chk_duplicada`, monta o de-para
do gerador e devolve somente as colunas de `raw` usadas no frontend.

## Fonte SQLite

O caminho padrão é o `Verificar.db` compartilhado. `VERIFICAR_DB_PATH` permite
apontar para um clone local, usado para testes de schema ou mudanças aprovadas.
A conexão usa `mode=ro` e `PRAGMA query_only`: o app não cria tabela, coluna,
journal ou outro artefato no banco da rede.

Se a fonte estiver indisponível, a seção mostra uma mensagem com ação **Tentar
novamente**. Não há fallback silencioso para dados antigos ou cópia local. A
query React Query atualiza a fonte a cada 30 segundos.

## Fluxo COFFEE

1. Uma nota com falha aparece em **COFFEE > Verificar**.
2. **Encaminhar** registra a origem no `coffee.db`, relacionando `verificar_id`
   ao `pk` real retornado pelo COFFEE. A relação é persistida porque os IDs não
   são assumidos como iguais.
3. Enquanto estiver em tratamento, a nota recebe o estado **Em correção**.
4. Com SAP real, a transição a classifica como `corrigida`, registra data/hora
   e usuário da conclusão e a remove da triagem.
5. Ela fica em **COFFEE > Concluídas > Corrigidas**.

Retirar uma nota da fila do COFFEE a torna visível novamente em Verificar. SAP
real é terminal para este fluxo; notas corrigidas não retornam à triagem.

## Interface

`dashboard.tsx` é responsável por filtros, seleção e apresentação. A ação que
antes dizia “Concluir” agora é **Encaminhar**; “concluída” fica reservado ao
resultado real no SAP. `source-screen.tsx` representa carregamento ou
indisponibilidade da fonte.

O filtro **Gerada por** alterna entre **Todos** e **Inspetores ES/SP**. Neste
último escopo, o filtro **Inspetor** permite selecionar uma matrícula. A fila
sempre mostra nome e UF de quem gerou a nota e sinaliza matrículas não
cadastradas no De-Para.

Em Concluídas, a lista informa quando a nota veio de Verificar e quando foi
corrigida. A ficha lateral mostra também quem a encaminhou e quem concluiu.

## Arquivos principais

| Arquivo | Responsabilidade |
|---|---|
| `backend/verificar_module/source.py` | Abre `Verificar.db` somente leitura e lê `ids_verificacao`. |
| `backend/main.py` | Normaliza a tabela no contrato de triagem e expõe `GET /api/data`. Upload é compatibilidade de API/testes. |
| `frontend/src/features/verificar/useTriageData.ts` | Query React Query da fonte, com atualização de 30 segundos. |
| `frontend/src/features/verificar/source-screen.tsx` | Estado de carregamento/erro da fonte SQLite. |
| `frontend/src/features/verificar/dashboard.tsx` | Filtros, fila e encaminhamento para COFFEE. |
| `frontend/src/features/coffee/concluidas/` | Histórico de notas geradas/corrigidas e rastreabilidade. |

## Testes

`backend/test_verificar_source.py` usa clone SQLite temporário para validar
leitura sem mutação e o vínculo entre o ID de Verificar e um PK COFFEE
diferente.

- Backend: `python -m pytest test_verificar_source.py test_upload.py`
- Frontend: `npm test -- --run` e `npm run build`
