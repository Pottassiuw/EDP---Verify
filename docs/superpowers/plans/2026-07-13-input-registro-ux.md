# Input/Ramal Registro UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Melhorar o registro de notas do Input/Ramal — picker de mês de execução, "Colar Planilha" com cara de planilha, borda hairline nos cards e selects em fonte mono.

**Architecture:** Dois componentes novos e puros no feature `input` (`MesExecucaoPicker`, `ColagemPlanilha`), consumidos por `manage.tsx` e `ramal.tsx`. Borda e fonte mono resolvidas por CSS escopado a um wrapper `.input-scope` (mais dois atributos `data-slot` nos primitivos shadcn). Sem lógica de negócio nos componentes — estado e chamadas de API permanecem nos pais.

**Tech Stack:** React 18 + TypeScript, Vite, Tailwind v4, Radix UI (shadcn vendorizado), fontsource (Inter + IBM Plex Mono).

**Suggested branch:** `feat/input-registro-ux`.

## Global Constraints

- TypeScript: nunca `any`; tipar props e helpers. (CLAUDE.md)
- Tailwind: só design tokens; nunca cores da paleta Tailwind nem cores arbitrárias fora dos tokens `var(--…)`. (CLAUDE.md / DESIGN.md)
- Componentes só renderizam UI; estado/serviços ficam nos pais/hooks. (CLAUDE.md)
- shadcn em `components/ui/` é editável, mas preserve estrutura e acessibilidade Radix. (CLAUDE.md)
- Formato do mês gravado: `MMM-YYYY` minúsculo (ex.: `jun-2026`, `jan-2027`, `jan-2050`).
- Anos futuros: **apenas** `anoAtual+1` e `2050`, ambos em janeiro.
- Sem framework de teste no front → verificação = `npm run build` + drive manual. Não adicionar dependência de teste.
- Toda mudança de front atualiza `docs/dev/03-frontend-input.md`. (CLAUDE.md)

---

### Task 1: Primitivos shadcn — `data-slot` no Card e partes de grupo no Select

**Files:**
- Modify: `frontend/src/components/ui/card.tsx:4-8`
- Modify: `frontend/src/components/ui/select.tsx` (adicionar 3 partes + exports)

**Interfaces:**
- Produces: `<Card data-slot="card">` (âncora p/ CSS da Task 2); `SelectGroup`, `SelectLabel`, `SelectSeparator` exportados de `@/components/ui/select` (usados na Task 3).

- [ ] **Step 1: Adicionar `data-slot="card"` ao Card**

Em `card.tsx`, o `<div>` raiz do `Card`:

```tsx
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card"
      className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)}
      {...props}
    />
  ),
);
```

- [ ] **Step 2: Adicionar SelectGroup / SelectLabel / SelectSeparator ao select.tsx**

Adicionar estas três funções (padrão shadcn) antes do bloco `export {`:

```tsx
function SelectGroup(props: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("text-muted-foreground px-2 py-1.5 text-xs", className)}
      {...props}
    />
  )
}

function SelectSeparator({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
      {...props}
    />
  )
}
```

E incluir `SelectGroup, SelectLabel, SelectSeparator` no `export { … }` (ordem alfabética, junto aos demais).

- [ ] **Step 3: Verificar build**

Run: `cd frontend && npm run build`
Expected: PASS (tsc + vite sem erros).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ui/card.tsx frontend/src/components/ui/select.tsx
git commit -m "feat(ui): add card data-slot and select group/label/separator parts"
```

---

### Task 2: CSS escopado `.input-scope` — hairline + selects mono

**Files:**
- Modify: `frontend/src/app.css` (novo bloco no final do `@layer components`)
- Modify: `frontend/src/features/input/input-section.tsx:44`

**Interfaces:**
- Consumes: `[data-slot="card"]` (Task 1), `[data-slot="select-trigger"]` (já existe no select.tsx).
- Produces: wrapper `.input-scope` no topo do módulo Input; regras de borda/fonte para todas as telas Input.

- [ ] **Step 1: Adicionar `input-scope` à raiz do InputSection**

Em `input-section.tsx`, linha 44, trocar:

```tsx
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
```

por:

```tsx
    <div className="input-scope flex-1 min-w-0 flex flex-col overflow-hidden">
```

- [ ] **Step 2: Adicionar o bloco CSS escopado**

No fim de `app.css`, dentro do `@layer components` (antes do `}` que fecha a layer), acrescentar:

```css
/* ============================================================
   Escopo do módulo Input — hairline discreto nos cards e
   fonte mono nos selects (casa com a grade de dados).
   Só afeta telas dentro de .input-scope; Coffee/Verificar
   permanecem inalterados.
   ============================================================ */
.input-scope [data-slot="card"] { border-color: var(--line); }
.input-scope [data-slot="select-trigger"],
.input-scope select.edp-field { font-family: var(--font-mono); }
```

- [ ] **Step 3: Verificar build + drive**

Run: `cd frontend && npm run build`
Expected: PASS.

Drive manual (backend na porta 8000 + `npm run dev`): abrir Input → cards com costura discreta (não anel branco); gatilhos de select em mono. Abrir Coffee e Verificar → cards inalterados (anel original).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app.css frontend/src/features/input/input-section.tsx
git commit -m "feat(input): scope hairline card border and mono selects to input module"
```

---

### Task 3: Componente `MesExecucaoPicker`

**Files:**
- Create: `frontend/src/features/input/mes-execucao-picker.tsx`
- Create: `frontend/src/features/input/ui.ts`

**Interfaces:**
- Consumes: `Select*` de `@/components/ui/select` (incl. `SelectGroup/SelectLabel/SelectSeparator` da Task 1).
- Produces:
  - `CLASSE_SELECT_MONO: string` (de `./ui`) — className mono p/ `SelectContent` portalado (usada nas Tasks 5–7).
  - `construirOpcoesMes(anoAtual: number): { meses: Opcao[]; futuros: Opcao[] }` onde `interface Opcao { value: string; rotulo: string }`.
  - Componente `MesExecucaoPicker(props: MesExecucaoPickerProps)` com:
    ```ts
    interface MesExecucaoPickerProps {
      value: string;
      onChange: (v: string) => void;
      valorNeutro: string;
      rotuloNeutro: string;
      id?: string;
      className?: string;
    }
    ```

- [ ] **Step 1: Criar `features/input/ui.ts`**

```ts
/** Fonte mono aplicada aos dropdowns do Input/Ramal (casa com a grade de dados).
 *  O conteúdo do Select é portalado p/ fora de .input-scope, então recebe a
 *  fonte por className em cada uso. */
export const CLASSE_SELECT_MONO = '[font-family:var(--font-mono)]';
```

- [ ] **Step 2: Criar `mes-execucao-picker.tsx`**

```tsx
import React from 'react';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectSeparator, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CLASSE_SELECT_MONO } from './ui';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
               'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;

interface Opcao { value: string; rotulo: string; }

/** Monta as opções do picker a partir do ano atual.
 *  Ex. anoAtual=2026 →
 *    meses:   jan-2026 (Jan) … dez-2026 (Dez)
 *    futuros: jan-2027 (2027), jan-2050 (2050) */
export function construirOpcoesMes(anoAtual: number): { meses: Opcao[]; futuros: Opcao[] } {
  const meses = MESES.map((m) => ({
    value: `${m}-${anoAtual}`,
    rotulo: m.charAt(0).toUpperCase() + m.slice(1),
  }));
  const futuros: Opcao[] = [
    { value: `jan-${anoAtual + 1}`, rotulo: String(anoAtual + 1) },
    { value: 'jan-2050', rotulo: '2050' },
  ];
  return { meses, futuros };
}

const SENTINELA_NEUTRO = '__neutro';

interface MesExecucaoPickerProps {
  value: string;
  onChange: (v: string) => void;
  valorNeutro: string;
  rotuloNeutro: string;
  id?: string;
  className?: string;
}

export function MesExecucaoPicker({
  value, onChange, valorNeutro, rotuloNeutro, id, className,
}: MesExecucaoPickerProps): React.JSX.Element {
  const anoAtual = new Date().getFullYear();
  const { meses, futuros } = construirOpcoesMes(anoAtual);

  const valorSelect = value === valorNeutro ? SENTINELA_NEUTRO : (value || undefined);
  const aoMudar = (v: string): void => onChange(v === SENTINELA_NEUTRO ? valorNeutro : v);

  return (
    <Select value={valorSelect} onValueChange={aoMudar}>
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder={rotuloNeutro} />
      </SelectTrigger>
      <SelectContent className={CLASSE_SELECT_MONO}>
        <SelectItem value={SENTINELA_NEUTRO}>{rotuloNeutro}</SelectItem>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>{anoAtual}</SelectLabel>
          {meses.map((o) => <SelectItem key={o.value} value={o.value}>{o.rotulo}</SelectItem>)}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Futuro (janeiro)</SelectLabel>
          {futuros.map((o) => <SelectItem key={o.value} value={o.value}>{o.rotulo}</SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 3: Conferência da lógica (revisão, sem runner)**

Verificar por leitura que `construirOpcoesMes(2026)` produz:
`meses[0] = { value:'jan-2026', rotulo:'Jan' }`, `meses[11] = { value:'dez-2026', rotulo:'Dez' }`,
`futuros = [{ value:'jan-2027', rotulo:'2027' }, { value:'jan-2050', rotulo:'2050' }]`.
Mapeamento neutro: `value===valorNeutro` mostra o sentinela; escolher o sentinela emite `valorNeutro`.

- [ ] **Step 4: Verificar build**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/input/mes-execucao-picker.tsx frontend/src/features/input/ui.ts
git commit -m "feat(input): add MesExecucaoPicker with current-year months + 2027/2050"
```

---

### Task 4: Componente `ColagemPlanilha`

**Files:**
- Create: `frontend/src/features/input/colagem-planilha.tsx`

**Interfaces:**
- Consumes: `Card*`, `Button`, `Textarea`, `NotesTable`, `ColunaDef` (de `./columns`).
- Produces: componente presentacional `ColagemPlanilha(props)`:
  ```ts
  interface ColagemPlanilhaProps {
    titulo: string;
    colunasColagem: string[];
    colunasPreview: ColunaDef[];
    rotulos: Record<string, string>;
    texto: string;
    setTexto: (v: string) => void;
    preview: Array<Record<string, string>>;
    salvando: boolean;
    rotuloSalvar: string;
    onSalvar: () => void;
  }
  ```

- [ ] **Step 1: Criar `colagem-planilha.tsx`**

```tsx
import React from 'react';
import type { ColunaDef } from './columns';
import type { NotaInput } from './types';
import { NotesTable } from './notes-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface ColagemPlanilhaProps {
  titulo: string;
  colunasColagem: string[];
  colunasPreview: ColunaDef[];
  rotulos: Record<string, string>;
  texto: string;
  setTexto: (v: string) => void;
  preview: Array<Record<string, string>>;
  salvando: boolean;
  rotuloSalvar: string;
  onSalvar: () => void;
}

export function ColagemPlanilha({
  titulo, colunasColagem, colunasPreview, rotulos, texto, setTexto,
  preview, salvando, rotuloSalvar, onSalvar,
}: ColagemPlanilhaProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader><CardTitle>{titulo}</CardTitle></CardHeader>
      <CardContent>
        <p className="text-[12.5px] text-text-dim mt-[0px] mx-[0px] mb-[10px]">
          Cole as linhas copiadas do Excel (sem cabeçalho), na ordem das colunas abaixo.
        </p>

        <div className="rounded-[8px] border border-line overflow-hidden">
          <div className="flex bg-[var(--surface-2)] border-b border-line">
            {colunasColagem.map((c) => (
              <span key={c}
                    className="flex-1 min-w-0 px-[10px] py-[6px] font-mono text-[10px] font-medium
                               tracking-[0.14em] uppercase text-text-mute border-r border-line
                               last:border-r-0 whitespace-nowrap overflow-hidden text-ellipsis">
                {rotulos[c] ?? c}
              </span>
            ))}
          </div>
          <Textarea value={texto} rows={8} placeholder="Ctrl+V com as linhas do Excel…"
                    onChange={(e) => setTexto(e.target.value)}
                    className="border-0 rounded-none font-mono text-[12px] focus-visible:ring-0" />
        </div>

        {preview.length > 0 && (
          <div className="mt-[12px] flex flex-col gap-[10px]">
            <span className="text-[12.5px]">
              {preview.length} linha(s) reconhecida(s) — confira antes de salvar:
            </span>
            <NotesTable colunas={colunasPreview}
                        registros={preview.map((r, i) => ({
                          ...r, Numero_Nota: Number(r.Numero_Nota) || -(i + 1),
                        })) as unknown as NotaInput[]}
                        altura={240} />
            <div>
              <Button disabled={salvando} onClick={onSalvar}>💾 {rotuloSalvar}</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verificar build**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/input/colagem-planilha.tsx
git commit -m "feat(input): add ColagemPlanilha with spreadsheet-style header"
```

---

### Task 5: Ligar Manage (`manage.tsx`)

**Files:**
- Modify: `frontend/src/features/input/manage.tsx`

**Interfaces:**
- Consumes: `MesExecucaoPicker` (Task 3), `ColagemPlanilha` (Task 4), `CLASSE_SELECT_MONO` (Task 3).

- [ ] **Step 1: Ajustar imports**

Adicionar ao topo de `manage.tsx` (após os imports internos existentes):

```tsx
import { MesExecucaoPicker } from './mes-execucao-picker';
import { ColagemPlanilha } from './colagem-planilha';
import { CLASSE_SELECT_MONO } from './ui';
```

- [ ] **Step 2: Lote — trocar o `<Input loteMes>` pelo picker**

Substituir (bloco `modo === 'lote'`, ~linha 211):

```tsx
                  <Input value={loteMes} placeholder="Novo mês execução (ex: jun-2026)"
                         onChange={(e) => setLoteMes(e.target.value)} className="w-[240px]" />
```

por:

```tsx
                  <MesExecucaoPicker value={loteMes} onChange={setLoteMes}
                                     valorNeutro="" rotuloNeutro="Mês: (manter atual)"
                                     className="w-[240px]" />
```

- [ ] **Step 3: Lote — mono no conteúdo dos selects Status/Prioridade**

Nos dois `<SelectContent>` do bloco lote, adicionar a className mono:

```tsx
                    <SelectContent className={CLASSE_SELECT_MONO}>
```

(um no select de Status, outro no de Prioridade).

- [ ] **Step 4: Cadastro — usar o picker no campo de mês e mono nos selects**

No bloco `modo === 'cadastro'` (loop sobre `NOTA_VAZIA`), trocar a condição de render para tratar o mês. Substituir:

```tsx
                  {campo === 'Status_Nota' || campo === 'Prioridade_Nota' ? (
                    <Select value={novaNota[campo]}
                            onValueChange={(v) => setNovaNota({ ...novaNota, [campo]: v })}>
                      <SelectTrigger id={`nova-${campo}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(campo === 'Status_Nota' ? dados.meta.status_opcoes : dados.meta.prioridade_opcoes)
                          .map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input id={`nova-${campo}`} value={novaNota[campo]}
                           onChange={(e) => setNovaNota({ ...novaNota, [campo]: e.target.value })} />
                  )}
```

por:

```tsx
                  {campo === 'Status_Nota' || campo === 'Prioridade_Nota' ? (
                    <Select value={novaNota[campo]}
                            onValueChange={(v) => setNovaNota({ ...novaNota, [campo]: v })}>
                      <SelectTrigger id={`nova-${campo}`}><SelectValue /></SelectTrigger>
                      <SelectContent className={CLASSE_SELECT_MONO}>
                        {(campo === 'Status_Nota' ? dados.meta.status_opcoes : dados.meta.prioridade_opcoes)
                          .map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : campo === 'Mes_Execucao_Planejado' ? (
                    <MesExecucaoPicker id={`nova-${campo}`}
                                       value={novaNota[campo]}
                                       onChange={(v) => setNovaNota({ ...novaNota, [campo]: v })}
                                       valorNeutro="-" rotuloNeutro="—" />
                  ) : (
                    <Input id={`nova-${campo}`} value={novaNota[campo]}
                           onChange={(e) => setNovaNota({ ...novaNota, [campo]: e.target.value })} />
                  )}
```

- [ ] **Step 5: Colagem — substituir o bloco pela `ColagemPlanilha`**

Substituir todo o bloco `modo === 'colagem'` (o `<Card>` de "Colar planilha", ~linhas 299-325) por:

```tsx
      {modo === 'colagem' && (
        <ColagemPlanilha
          titulo="Colar planilha"
          colunasColagem={COLUNAS_COLAGEM}
          colunasPreview={COLUNAS.filter((c) => COLUNAS_COLAGEM.includes(c.key))}
          rotulos={ROTULOS}
          texto={textoColagem}
          setTexto={setTextoColagem}
          preview={previewColagem}
          salvando={salvando}
          rotuloSalvar={`Salvar lote (${previewColagem.length})`}
          onSalvar={salvarColagem} />
      )}
```

- [ ] **Step 6: Remover imports órfãos**

Se após as trocas `Textarea` não for mais usado em `manage.tsx`, remover seu import. (Confirmar por busca no arquivo.)

- [ ] **Step 7: Verificar build + drive**

Run: `cd frontend && npm run build`
Expected: PASS (sem imports não usados; tipos batendo).

Drive manual (Input → Gerenciar):
- Cadastrar Nota: campo "Mês Execução Planejado" agora é dropdown. Selecionar `Mar` grava `mar-2026`; `2027` grava `jan-2027`; `2050` grava `jan-2050`; `—` grava `-`. Salvar e conferir no banco/Visão Geral.
- Edição em Lote: dropdown de mês com "(manter atual)" mantém; escolher mês aplica; Status/Prioridade em mono.
- Colar Planilha: cabeçalho de colunas visível antes de colar; colar linhas → preview; salvar lote.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/input/manage.tsx
git commit -m "feat(input): wire month picker, mono selects and ColagemPlanilha in Manage"
```

---

### Task 6: Ligar Ramal (`ramal.tsx`)

**Files:**
- Modify: `frontend/src/features/input/ramal.tsx`

**Interfaces:**
- Consumes: `MesExecucaoPicker` (Task 3), `ColagemPlanilha` (Task 4), `CLASSE_SELECT_MONO` (Task 3).

- [ ] **Step 1: Ajustar imports**

Adicionar ao topo de `ramal.tsx`:

```tsx
import { MesExecucaoPicker } from './mes-execucao-picker';
import { ColagemPlanilha } from './colagem-planilha';
import { CLASSE_SELECT_MONO } from './ui';
```

- [ ] **Step 2: Lote — trocar `<Input loteMes>` pelo picker**

Substituir (bloco lote, ~linha 253):

```tsx
                  <Input value={loteMes} placeholder="Novo mês execução (ex: jun-2026)"
                         onChange={(e) => setLoteMes(e.target.value)} className="w-[240px]" />
```

por:

```tsx
                  <MesExecucaoPicker value={loteMes} onChange={setLoteMes}
                                     valorNeutro="" rotuloNeutro="Mês: (manter atual)"
                                     className="w-[240px]" />
```

- [ ] **Step 3: Lote — mono nos `<SelectContent>` de Status/Prioridade**

Nos dois `<SelectContent>` do bloco lote (~linhas 239 e 248), trocar `<SelectContent>` por:

```tsx
                    <SelectContent className={CLASSE_SELECT_MONO}>
```

- [ ] **Step 4: Cadastro — picker no campo de mês e mono nos selects**

No bloco `modo === 'cadastro'` (loop sobre `NOTA_RAMAL_VAZIA`), substituir o render condicional dos campos:

```tsx
                  {campo === 'Status_Nota' ? (
                    <Select value={novaNota[campo]}
                            onValueChange={(v) => setNovaNota({ ...novaNota, [campo]: v })}>
                      <SelectTrigger id={`nova-ramal-${campo}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {dadosPrincipais.meta.status_opcoes.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : campo === 'Prioridade_Nota' ? (
                    <Select value={novaNota[campo]}
                            onValueChange={(v) => setNovaNota({ ...novaNota, [campo]: v })}>
                      <SelectTrigger id={`nova-ramal-${campo}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {dadosPrincipais.meta.prioridade_opcoes.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input id={`nova-ramal-${campo}`} value={novaNota[campo]}
                           onChange={(e) => setNovaNota({ ...novaNota, [campo]: e.target.value })} />
                  )}
```

por:

```tsx
                  {campo === 'Status_Nota' ? (
                    <Select value={novaNota[campo]}
                            onValueChange={(v) => setNovaNota({ ...novaNota, [campo]: v })}>
                      <SelectTrigger id={`nova-ramal-${campo}`}><SelectValue /></SelectTrigger>
                      <SelectContent className={CLASSE_SELECT_MONO}>
                        {dadosPrincipais.meta.status_opcoes.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : campo === 'Prioridade_Nota' ? (
                    <Select value={novaNota[campo]}
                            onValueChange={(v) => setNovaNota({ ...novaNota, [campo]: v })}>
                      <SelectTrigger id={`nova-ramal-${campo}`}><SelectValue /></SelectTrigger>
                      <SelectContent className={CLASSE_SELECT_MONO}>
                        {dadosPrincipais.meta.prioridade_opcoes.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : campo === 'Mes_Execucao_Planejado' ? (
                    <MesExecucaoPicker id={`nova-ramal-${campo}`}
                                       value={novaNota[campo]}
                                       onChange={(v) => setNovaNota({ ...novaNota, [campo]: v })}
                                       valorNeutro="-" rotuloNeutro="—" />
                  ) : (
                    <Input id={`nova-ramal-${campo}`} value={novaNota[campo]}
                           onChange={(e) => setNovaNota({ ...novaNota, [campo]: e.target.value })} />
                  )}
```

- [ ] **Step 5: Colagem — substituir o bloco pela `ColagemPlanilha`**

Substituir todo o bloco `modo === 'colagem'` (o `<Card>` de "Colar planilha ramal", ~linhas 333-361) por:

```tsx
      {modo === 'colagem' && (
        <ColagemPlanilha
          titulo="Colar planilha ramal"
          colunasColagem={COLUNAS_COLAGEM_RAMAL}
          colunasPreview={COLUNAS_RAMAL.filter((c) => COLUNAS_COLAGEM_RAMAL.includes(c.key))}
          rotulos={ROTULOS_RAMAL}
          texto={textoColagem}
          setTexto={setTextoColagem}
          preview={previewColagem}
          salvando={salvando}
          rotuloSalvar={`Salvar lote ramal (${previewColagem.length})`}
          onSalvar={salvarColagem} />
      )}
```

- [ ] **Step 6: Remover imports órfãos**

Conferir e remover imports que ficaram sem uso em `ramal.tsx` (`Textarea`, e `NotesTable`/`DataGrid` só se realmente não usados em outros blocos — confirmar por busca antes de remover).

- [ ] **Step 7: Verificar build + drive**

Run: `cd frontend && npm run build`
Expected: PASS.

Drive manual (Input → Ramal): cadastro com picker de mês; lote com picker "(manter atual)" + Status/Prioridade mono; Colar Planilha ramal com cabeçalho + preview + salvar.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/input/ramal.tsx
git commit -m "feat(input): wire month picker, mono selects and ColagemPlanilha in Ramal"
```

---

### Task 7: Filtros mono + documentação

**Files:**
- Modify: `frontend/src/features/input/filters.tsx:98`
- Modify: `docs/dev/03-frontend-input.md`

**Interfaces:**
- Consumes: `CLASSE_SELECT_MONO` (Task 3).

- [ ] **Step 1: Mono no conteúdo do select de filtro**

Em `filters.tsx`, adicionar o import:

```tsx
import { CLASSE_SELECT_MONO } from "./ui";
```

e na linha 98 trocar `<SelectContent>` por:

```tsx
            <SelectContent className={CLASSE_SELECT_MONO}>
```

(O gatilho e o `<select multiple>` nativo já herdam mono pelo CSS `.input-scope` da Task 2.)

- [ ] **Step 2: Atualizar o manual do desenvolvedor**

Em `docs/dev/03-frontend-input.md`, na seção de componentes do Input, acrescentar:

```markdown
### Registro de notas — componentes de UI

- `mes-execucao-picker.tsx` — `MesExecucaoPicker`: dropdown do mês de execução
  planejado. Meses do ano corrente (ano automático via `new Date()`), mais os
  futuros `jan-<ano+1>` e `jan-2050`. Grava `MMM-YYYY` minúsculo. `valorNeutro`/
  `rotuloNeutro` configuram o item neutro ('-' no cadastro, '' = manter no lote).
- `colagem-planilha.tsx` — `ColagemPlanilha`: bloco "Colar Planilha" com cabeçalho
  de colunas estilo planilha (mono/uppercase) visível antes de colar; presentacional
  (estado e parse ficam no pai). Usado por Manage e Ramal.
- Estética do Input: cards com hairline discreto e selects em IBM Plex Mono, via
  CSS escopado a `.input-scope` (`app.css`) — não afeta Coffee/Verificar. Fonte mono
  do conteúdo (portalado) dos selects vem de `CLASSE_SELECT_MONO` (`ui.ts`).
```

(Ajustar o cabeçalho da seção ao estilo já existente no arquivo.)

- [ ] **Step 3: Verificar build**

Run: `cd frontend && npm run build`
Expected: PASS.

Drive: Input → Gerenciar → Filtros avançados → dropdown "+ Adicionar campo" em mono.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/input/filters.tsx docs/dev/03-frontend-input.md
git commit -m "feat(input): mono filter dropdown and update dev docs"
```

---

## Self-Review

**Spec coverage:**
- Picker de mês (12 meses + 2027/2050 + neutro) → Task 3; ligado em Manage (Task 5) e Ramal (Task 6). ✓
- Colar Planilha como planilha (grade viva leve) → Task 4; ligado nas Tasks 5–6. ✓
- Borda hairline escopada ao Input → Tasks 1 (data-slot) + 2 (CSS). ✓
- Selects em mono → Task 2 (trigger + nativo via CSS) + Tasks 3/5/6/7 (conteúdo portalado via `CLASSE_SELECT_MONO`). ✓
- Ramal simétrico → Task 6. ✓
- Docs → Task 7. ✓

**Placeholder scan:** sem TBD/TODO; todo passo de código traz o código real. ✓

**Type consistency:** `MesExecucaoPickerProps`, `construirOpcoesMes`, `ColagemPlanilhaProps`, `CLASSE_SELECT_MONO` usados com as mesmas assinaturas nas Tasks 5–7. `ColunaDef` importado de `./columns` (existente). ✓

**Riscos / notas:**
- Sem runner de teste no front: correção do `construirOpcoesMes` é verificada por leitura (Task 3, Step 3) e pelo drive manual; typecheck do `npm run build` pega desvios de interface.
- Se `Textarea`/`NotesTable`/`DataGrid` continuarem usados em outros blocos de `manage.tsx`/`ramal.tsx`, **não** remover os imports (Tasks 5–6, passos de imports órfãos pedem confirmação por busca).
