# Design — UX de registro de notas (Input / Ramal)

- **Data:** 2026-07-13
- **Status:** aprovado (aguardando plano)
- **Módulos:** `frontend/src/features/input`, `frontend/src/components/ui`, `frontend/src/app.css`

---

## Contexto e problema

A tela de registro de notas do módulo Input (e sua irmã Ramal) tem quatro
atritos de UX/estética levantados pelo usuário:

1. **Mês de execução planejado** é um campo de texto livre (`<Input>`), tanto
   em *Cadastrar Nota* quanto em *Edição em Lote*. Aceita qualquer string, então
   um erro de digitação vira `jnu-2026`. O formato correto é `MMM-YYYY`
   minúsculo.
2. **Colar Planilha** usa uma `<Textarea>` crua; o formato esperado das colunas
   aparece só como texto, e a grade de conferência só surge **depois** de colar.
3. **Borda branca dos containeres:** todo `<Card>` exibe um anel branco forte no
   tema escuro, destoando do hairline discreto previsto no `DESIGN.md`.
4. **Fonte dos selects:** os dropdowns renderizam em Inter (fonte do app), que
   destoa da estética "mono para dados" do restante do Input.

Tudo se aplica igualmente ao Ramal, que espelha o Manage 1:1.

## Diagnóstico (evidência no código)

- `features/input/manage.tsx` — cadastro renderiza `Mes_Execucao_Planejado` como
  `<Input>` livre (bloco genérico do `NOTA_VAZIA`); lote usa
  `<Input value={loteMes} placeholder="Novo mês execução (ex: jun-2026)">`.
- `features/input/ramal.tsx` — idêntico: `NOTA_RAMAL_VAZIA.Mes_Execucao_Planejado`
  e estado `loteMes`.
- `features/input/manage.tsx` e `ramal.tsx` — bloco `modo === 'colagem'`
  quase duplicado: `<Textarea>` + `NotesTable` de preview.
- `app.css` (tema escuro) — `--line-2: rgba(255,255,255,0.12)` → `--border` →
  `ui/card.tsx` (`className="... border ..."`). É o "anel branco".
  `--line: rgba(255,255,255,0.07)` é o hairline mais discreto.
- `app.css` — `--font-body: 'Inter'` global; os selects herdam Inter, não têm
  formatação própria. `--font-mono: 'IBM Plex Mono'`.

## Decisões (aprovadas)

| Tópico | Decisão |
|---|---|
| Fonte dos selects | Selects do Input/Ramal em **IBM Plex Mono** (casa com a grade de dados) |
| Colar Planilha | **Grade viva leve**: cabeçalho de colunas visível desde o início + preview ao vivo |
| Borda dos cards | **Hairline suave**: `--line` (7%) no lugar de `--line-2` (12%), escopo Input |
| Anos futuros do picker | **Só 2027 (ano+1) e 2050**, ambos gravados como `jan-AAAA` |

---

## Design detalhado

### 1. `MesExecucaoPicker` (novo — `features/input/mes-execucao-picker.tsx`)

Componente de UI puro sobre o `Select` (Radix) do shadcn. Preserva
acessibilidade do Radix.

**Props**

```ts
interface MesExecucaoPickerProps {
  value: string;                 // ex.: 'mar-2026', 'jan-2050', ou o valorNeutro
  onChange: (v: string) => void;
  valorNeutro: string;           // o que emitir quando "nenhum" for escolhido
  rotuloNeutro: string;          // rótulo do item neutro
  id?: string;
  className?: string;
}
```

**Opções**

- `anoAtual = new Date().getFullYear()` (hoje = 2026).
- 12 meses do ano atual: `['jan','fev','mar','abr','mai','jun','jul','ago',
  'set','out','nov','dez']`. Valor `${mes}-${anoAtual}`; rótulo = mês
  capitalizado (`Jan`…`Dez`). Ano fica implícito (automático).
- `SelectSeparator`, depois grupo "Futuro (sempre janeiro)":
  - `{ value: 'jan-' + (anoAtual + 1), rotulo: String(anoAtual + 1) }`
  - `{ value: 'jan-2050', rotulo: '2050' }`
- Item neutro no topo (sentinela interna `__neutro`, pois o Radix não aceita
  valor string vazio). Ao escolher, emite `valorNeutro`. Para exibição, quando
  `value === valorNeutro`, o `Select` mostra o sentinela.

**Uso e semântica do neutro**

- Cadastrar Nota (Manage e Ramal): `valorNeutro='-'`, `rotuloNeutro='—'`
  (o default de `NOTA_VAZIA` já é `'-'`).
- Edição em Lote (Manage e Ramal): `valorNeutro=''`, `rotuloNeutro='(manter atual)'`
  (`''` = não alterar, mantendo a semântica atual do `loteMes`).

**Escopo de uso:** entrada de dados (cadastro/lote), não edição inline na grade.
Um valor legado fora da lista (ex.: mês de ano anterior) simplesmente não casa
com nenhuma opção — aceitável, pois o picker não edita células existentes.

**Fonte:** mono embutida (className `[font-family:var(--font-mono)]` no trigger e
no content).

### 2. `ColagemPlanilha` (novo — `features/input/colagem-planilha.tsx`)

Extrai o bloco `modo === 'colagem'` hoje duplicado em Manage e Ramal.

**Props**

```ts
interface ColagemPlanilhaProps {
  titulo: string;                        // "Colar planilha" | "Colar planilha ramal"
  colunasColagem: string[];              // chaves na ordem esperada
  colunasPreview: ColunaDef[];           // defs p/ o NotesTable de conferência
  rotulos: Record<string, string>;       // ROTULOS / ROTULOS_RAMAL
  texto: string;
  setTexto: (v: string) => void;
  preview: Array<Record<string, string>>;
  salvando: boolean;
  rotuloSalvar: string;                  // "Salvar lote (N)" já formatado pelo pai
  onSalvar: () => void;
}
```

**Layout (grade viva leve)**

- `Card` com `CardHeader`/`CardTitle` (o `titulo`).
- Container emoldurado (hairline) contendo:
  - **Linha de cabeçalho fixa** com os rótulos de `colunasColagem`, reusando o
    estilo do header do `NotesTable`
    (`font-mono text-[10px] font-medium tracking-[0.14em] uppercase`), para casar
    visualmente com a Visão Geral.
  - `<Textarea>` como corpo ("Ctrl+V com as linhas do Excel…"), mono.
- Abaixo, quando `preview.length > 0`: o `NotesTable` de conferência + botão
  salvar (comportamento atual preservado).

Sem grade editável (fora de escopo — decisão "grade viva leve").

### 3. Borda hairline suave (escopo Input)

- `ui/card.tsx`: adicionar `data-slot="card"` ao `<div>` raiz do `Card`
  (atributo apenas; sem mudança de comportamento; padrão shadcn).
- `input-section.tsx`: adicionar a classe `input-scope` ao `<div>` raiz de
  `InputSection` (linha ~44).
- `app.css`: regra escopada
  ```css
  .input-scope [data-slot="card"] { border-color: var(--line); }
  ```
- Cobre todos os cards do Input de uma vez, sem editar card a card, e **não**
  afeta Coffee/Verificar.

### 4. Selects em mono (Input / Ramal)

- `app.css`: `.input-scope [data-slot="select-trigger"] { font-family: var(--font-mono); }`
  (cobre todos os gatilhos de select do Input automaticamente).
- Conteúdo do dropdown é portalado para fora do `.input-scope`; por isso recebe a
  fonte via className compartilhada (`[font-family:var(--font-mono)]`) nos
  `SelectContent` do Input/Ramal (registro, filtros e o picker).
- Desvio deliberado do `DESIGN.md` (que reserva mono para código); escolha
  explícita do usuário para casar com a grade.

### 5. Ramal

Aplica 1–4 de forma simétrica: `MesExecucaoPicker` no cadastro e no lote,
`ColagemPlanilha` no modo colagem, hairline e mono herdados do escopo/CSS.

---

## Arquivos

**Novos**
- `features/input/mes-execucao-picker.tsx`
- `features/input/colagem-planilha.tsx`

**Editados**
- `components/ui/card.tsx` — `data-slot="card"`.
- `components/ui/select.tsx` — exportar `SelectGroup`, `SelectLabel`,
  `SelectSeparator` (partes padrão do shadcn) para o divisor do picker.
- `app.css` — bloco escopado `.input-scope` (borda + mono).
- `features/input/input-section.tsx` — classe `input-scope` na raiz.
- `features/input/manage.tsx` — usa `MesExecucaoPicker` (cadastro + lote) e
  `ColagemPlanilha`; mono nos `SelectContent`.
- `features/input/ramal.tsx` — idem.
- `docs/dev/03-frontend-input.md` — documentar picker, colagem-planilha, mono e
  hairline (mandato do CLAUDE.md).

---

## Acessibilidade

- `MesExecucaoPicker` mantém a estrutura Radix `Select` (teclado + ARIA).
- `id` propagado para casar com `<Label htmlFor>` no cadastro.
- Mono é só fonte; contraste e tamanhos inalterados.

## Verificação

- `npm run build` (typecheck + bundle) sem erros.
- Subir backend (porta 8000) + servir front e exercitar cada tela:
  - cadastro/lote de Manage e Ramal → picker grava `MMM-YYYY` correto
    (mês do ano atual, `jan-2027`, `jan-2050`, neutro).
  - Colar Planilha (Manage e Ramal) → cabeçalho visível antes de colar; preview
    ao colar; salvar lote.
  - Visual: cards com hairline discreto; selects em mono; Coffee/Verificar
    inalterados.

## Fora de escopo

- Trocar a fonte global do app (Inter permanece).
- Grade de colagem editável célula a célula (canvas).
- Hairline/mono em Coffee e Verificar.
- Anos futuros além de 2027 e 2050.
