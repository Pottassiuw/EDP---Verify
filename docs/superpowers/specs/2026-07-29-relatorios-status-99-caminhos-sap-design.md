# Relatórios — Status Final 99 e caminhos das extrações SAP

Data: 2026-07-29. Aprovado em brainstorm com o usuário nesta data.

## Contexto

A seção Relatórios calcula o executado a partir do dataset enriquecido do
módulo Input. A regra atual consulta `Status_Nota` e `Export_status`, mas não
usa `Status_Final`, que é o campo apresentado na planilha do Plano de
Recomposição 2026 como situação consolidada da nota.

Além disso, as três extrações SAP não compartilham a mesma raiz: IW38 já usa
`INPUT SQL\Arquivos_SAP`, enquanto IW28 e IW66 ainda apontam diretamente para
`INPUT SQL`.

## Decisões de produto

1. `Status_Final` é a fonte principal para reconhecer o encerramento explícito
   com código 99.
2. Serão aceitas as representações equivalentes `99`, `99.0` e
   `99 Encerrado`. Códigos diferentes, como `999`, não podem ser confundidos
   com 99.
3. A compatibilidade com os sinais já reconhecidos será preservada:
   `Status_Nota = 99` como fallback quando `Status_Final` estiver ausente e
   `Export_status = "ENCE EXEC"`.
   Um `Status_Final` preenchido com outro código não consulta o fallback
   `Status_Nota`, evitando que um estado local antigo prevaleça sobre o
   consolidado.
4. Uma nota executada com `Encerram.por data` válida será atribuída ao mês real
   do encerramento.
5. Uma nota executada sem data de encerramento válida será contabilizada no
   mês planejado e produzirá um aviso claro no relatório.
6. A interpretação completa da linha 20 do SAP, além do sinal
   `ENCE EXEC` já existente, fica fora desta entrega.
7. IW28, IW38 e IW66 devem derivar seus caminhos da raiz única:
   `\\ebeat-fp1\Documentos\Diretoria Tecnica\Engenharia\DSPM\Planejamento Distribuição 2016\Estrutura BI - DDPM\INPUT SQL\Arquivos_SAP`.

## Arquitetura

A classificação continuará no backend, em
`backend/input_module/relatorios.py`, pois essa é a fronteira que transforma o
dataset do Input em métricas de Relatórios. Um helper pequeno e puro
normalizará o código de status sem espalhar comparações textuais.

`_linhas_fato` continuará responsável por atribuir o mês de execução. Quando
uma nota executada não possuir data SAP válida, usará o mês planejado e
marcará o fato como `executada_sem_data`. A agregação devolverá a quantidade
de registros nessa situação durante o ano, respeitando o filtro regional.
Esse contador não soma `Planejado_DDPM` e independe do mês selecionado na
interface.

O contrato do dashboard ganhará:

```json
{
  "avisos": {
    "executadas_sem_data": 2
  }
}
```

O frontend exibirá, quando o valor for maior que zero, um alerta visível no
topo da seção:

> Neste ano, 2 notas executadas sem data de encerramento SAP foram
> contabilizadas no mês planejado.

No singular, a mensagem usará “1 nota executada”.

## Caminhos SAP

`backend/input_module/config.py` manterá `REDE_ARQUIVOS_SAP` como única raiz
das extrações:

- `CAMINHO_BASE_IW28 = REDE_ARQUIVOS_SAP + "\Gerada_base_IW28.XLSX"`
- `CAMINHO_CUSTO_ORD_IW38 = REDE_ARQUIVOS_SAP + "\Gerada_custo_ord_IW38.XLSX"`
- `CAMINHO_BASE_IW66 = REDE_ARQUIVOS_SAP + "\Gerada_medidas_IW66.XLSX"`

A declaração duplicada de `REDE_BASES_APOIO` será removida. Não haverá
refatoração adicional de configuração.

## Fluxo de dados

1. O robô SAP escreve IW28, IW38 e IW66 em `Arquivos_SAP`.
2. O módulo Input importa as extrações e monta `Status_Final`.
3. Relatórios reconhece o código exato 99 em `Status_Final`.
4. Com data SAP, usa o mês real; sem data, usa o mês planejado e incrementa o
   aviso.
5. A API devolve métricas e avisos no mesmo payload.
6. A interface mostra o alerta somente quando há ocorrências.

## Erros e casos-limite

- `Status_Final` vazio: usa os sinais de compatibilidade existentes.
- `Status_Final = 999`: não é código 99.
- Data inválida ou vazia: usa o mês planejado e alerta.
- Nota sem mês planejado válido: não entra no fato anual, como já ocorre hoje.
- Filtro regional: o contador do aviso respeita o mesmo escopo dos demais
  indicadores.
- Zero ocorrências: `executadas_sem_data` será `0` e nenhum alerta será
  exibido.

## Testes

- Teste de configuração confirma os três caminhos completos sob
  `REDE_ARQUIVOS_SAP`.
- Teste unitário confirma as representações aceitas do código 99 e rejeita
  `999`.
- Teste do dashboard confirma `Status_Final = 99` com data no mês real.
- Teste do dashboard confirma fallback para o mês planejado e contador do
  aviso quando a data estiver ausente.
- Teste confirma que o filtro regional também filtra o contador.
- Testes existentes preservam o comportamento de `ENCE EXEC`.
- Build e testes do frontend validam o novo contrato e a renderização
  tipada do alerta.

## Documentação

`docs/dev/09-frontend-relatorios.md` será atualizado com a nova regra,
o campo `avisos.executadas_sem_data` e o comportamento visual. A documentação
do backend em `docs/dev/06-backend-input-module.md` será atualizada com a raiz
única das extrações SAP e a regra de execução.

## Fora de escopo

- Interpretar todos os textos possíveis da linha 20 do SAP.
- Alterar a extração RPA ou o formato das planilhas.
- Criar um relatório detalhado das notas sem data.
- Refatorar outras constantes ou módulos não envolvidos.
