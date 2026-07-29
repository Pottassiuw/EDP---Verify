# Carteira de Notas — Fase 4b (Frontend de Enriquecimento) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir os dados read-only da projeção da Carteira nos detalhes do Input e do COFFEE por meio de um card hierárquico compartilhado, sem adicionar colunas de enriquecimento às grades nem alterar os fluxos existentes.

**Architecture:** A feature Carteira é dona do contrato TypeScript, cliente HTTP, hook React Query e card apresentacional. Input cria um Sheet de detalhe aberto por uma coluna utilitária fixa do `react-datasheet-grid`; COFFEE incorpora o mesmo card no inspector existente. O App continua dono da navegação e fornece um callback explícito para Carteira → Sincronização, sem Context novo ou eventos globais.

**Tech Stack:** React 18, TypeScript, Vite, React Query, react-datasheet-grid, Radix Sheet, shadcn/ui, Vitest, React DOM server rendering.

## Global Constraints

- **Spec fonte:** `docs/superpowers/specs/2026-07-29-carteira-fase-4b-enriquecimento-design.md`.
- **Pré-requisito:** `docs/superpowers/plans/2026-07-29-carteira-fase-4b-backend.md` concluído e endpoint `/api/carteira/notas/por-sap/{numero}` disponível.
- **Fonte do número:** Input usa `NotaInput.Numero_Nota`; COFFEE usa `revisao.data.coffee.id_sap`; nunca usar `coffee.pk`.
- **Campos read-only:** `descricao_conjunto`, `conjunto`, `sintoma`, `componente_novo`, `kit`, `n_trafo`, `dispositivo_protecao`, `status_sap`, `prioridade_sap`.
- **Composição:** rubrica (`descricao_conjunto`) proeminente, conjunto como contexto e grade responsiva com os sete campos restantes.
- **Estados:** sem correspondência é neutro; tombstone mantém os dados e mostra aviso/data; base nunca sincronizada oferece ação para Carteira → Sincronização; erro real oferece `Tentar novamente`.
- **Carregamento:** consulta habilitada somente enquanto o inspector estiver aberto e houver número SAP inteiro positivo; `staleTime=300_000`, `retry=1`.
- **Input:** nenhum campo enriquecido entra em `COLUNAS`; a seleção, ordenação, resize, autofit, cópia e barra de soma/média/contagem permanecem intactos.
- **COFFEE:** o card é somente leitura e não altera edição de local, ações contextuais, atividade ou rodapé.
- **Fora de escopo:** não persistir os campos no Input/COFFEE, não consultar
  `notas_sp` e não criar UI para dados pessoais.
- **Navegação:** App continua dono de `section` e `carteiraSub`; não criar Context, singleton ou `CustomEvent`.
- **Estilo:** somente tokens existentes e componentes `src/components/ui/`; não editar os componentes vendorizados.
- **Acessibilidade:** botão da grade possui nome acessível, opera por teclado e não transforma a linha inteira em alvo de clique; Sheet e foco Radix preservados.
- **Documentação:** atualizar `docs/dev/11-frontend-carteira.md`, `03-frontend-input.md` e `02-frontend-coffee.md` na mesma entrega.
- **Comandos frontend:** executar a partir de `frontend/` com `npm test` e `npm run build`.

---

## File Structure

- `frontend/src/features/carteira/types.ts` — contrato discriminado do endpoint.
- `frontend/src/features/carteira/api.ts` — chamada `CarteiraApi.enriquecimento`.
- `frontend/src/features/carteira/use-carteira-enriquecimento.ts` — query key, enable gate, stale time e retry.
- `frontend/src/features/carteira/carteira-enriquecimento-card.tsx` — comportamento da query + apresentação dos estados.
- `frontend/src/features/carteira/api.test.ts` — URL e decodificação do contrato.
- `frontend/src/features/carteira/carteira-enriquecimento-card.test.tsx` — renderização dos estados sem nova dependência.
- `frontend/src/features/input/input-nota-inspector.tsx` — Sheet e resumo de `NotaInput`.
- `frontend/src/features/input/input-nota-inspector.test.tsx` — resumo read-only.
- `frontend/src/features/input/data-grid.tsx` — coluna utilitária fixa à direita.
- `frontend/src/features/input/overview.tsx` — seleção da nota e montagem do inspector.
- `frontend/src/features/input/input-section.tsx` — propagação da navegação.
- `frontend/src/features/coffee/components/coffee-nota-inspector.tsx` — consumo do card compartilhado.
- `frontend/src/features/coffee/operacao/coffee-operacao.tsx` — propagação da navegação para o inspector.
- `frontend/src/features/coffee/concluidas/coffee-concluidas.tsx` — propagação da navegação para o inspector.
- `frontend/src/features/coffee/coffee-hub.tsx` — fronteira de navegação do módulo.
- `frontend/src/App.tsx` — ação única Carteira → Sincronização.
- `docs/dev/11-frontend-carteira.md` — contrato, hook e card.
- `docs/dev/03-frontend-input.md` — ação fixa e novo inspector.
- `docs/dev/02-frontend-coffee.md` — enriquecimento no inspector.

---

### Task 1: Contrato TypeScript, cliente HTTP e hook React Query

**Files:**
- Modify: `frontend/src/features/carteira/types.ts:6`
- Modify: `frontend/src/features/carteira/api.ts:38`
- Create: `frontend/src/features/carteira/use-carteira-enriquecimento.ts`
- Create: `frontend/src/features/carteira/api.test.ts`

**Interfaces:**
- Produces: `CarteiraEnriquecimento`, `DadosCarteiraEnriquecimento` e `EstadoCarteiraEnriquecimento`.
- Produces: `CarteiraApi.enriquecimento(numeroSap: number) -> Promise<CarteiraEnriquecimento>`.
- Produces: `CARTEIRA_ENRIQUECIMENTO_KEY(numeroSap)` e `useCarteiraEnriquecimento(numeroSap, enabled)`.

- [ ] **Step 1: Escrever o teste que falha para o cliente HTTP**

Crie `frontend/src/features/carteira/api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CarteiraApi } from './api';
import type { CarteiraEnriquecimento } from './types';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CarteiraApi.enriquecimento', () => {
  it('consulta a nota pelo número SAP e preserva o contrato discriminado', async () => {
    const resposta: CarteiraEnriquecimento = {
      numero_sap: 700500,
      estado: 'encontrada',
      dados: {
        descricao_conjunto: 'POSTES - CAPEX',
        conjunto: 'POSTE',
        sintoma: 'Queda',
        componente_novo: 'Rede primária',
        kit: 'KIT-01',
        n_trafo: 'TR-10',
        dispositivo_protecao: 'REL-2',
        status_sap: 'Pendente',
        prioridade_sap: 2,
      },
      ausente_na_origem_em: null,
      versao: '7',
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(resposta), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await CarteiraApi.enriquecimento(700500);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/carteira/notas/por-sap/700500',
      undefined,
    );
    expect(resultado).toEqual(resposta);
  });
});
```

- [ ] **Step 2: Rodar o teste para confirmar a falha**

Run, a partir de `frontend/`:

```powershell
npx vitest run src/features/carteira/api.test.ts
```

Expected: FAIL porque `CarteiraApi.enriquecimento` e os tipos ainda não existem.

- [ ] **Step 3: Adicionar os tipos**

Adicione depois de `NotaCarteira` em `frontend/src/features/carteira/types.ts`:

```ts
export type EstadoCarteiraEnriquecimento =
  | 'encontrada'
  | 'ausente_na_origem'
  | 'sem_correspondencia'
  | 'base_nao_sincronizada';

export interface DadosCarteiraEnriquecimento {
  descricao_conjunto: string | null;
  conjunto: string | null;
  sintoma: string | null;
  componente_novo: string | null;
  kit: string | null;
  n_trafo: string | null;
  dispositivo_protecao: string | null;
  status_sap: string | null;
  prioridade_sap: number | null;
}

export interface CarteiraEnriquecimento {
  numero_sap: number;
  estado: EstadoCarteiraEnriquecimento;
  dados: DadosCarteiraEnriquecimento | null;
  ausente_na_origem_em: string | null;
  versao: string;
}
```

- [ ] **Step 4: Adicionar o método do cliente**

Inclua `CarteiraEnriquecimento` no import de tipos de `api.ts` e adicione ao objeto `CarteiraApi`:

```ts
  enriquecimento: (numeroSap: number) =>
    req<CarteiraEnriquecimento>(`/notas/por-sap/${numeroSap}`),
```

- [ ] **Step 5: Criar o hook**

Crie `frontend/src/features/carteira/use-carteira-enriquecimento.ts`:

```ts
import { useQuery } from '@tanstack/react-query';

import { CarteiraApi } from './api';

export const CARTEIRA_ENRIQUECIMENTO_KEY = (numeroSap: number | null) =>
  ['carteira', 'enriquecimento', numeroSap] as const;

export function useCarteiraEnriquecimento(
  numeroSap: number | null,
  enabled: boolean,
) {
  const numeroValido = (
    numeroSap !== null
    && Number.isSafeInteger(numeroSap)
    && numeroSap > 0
  );

  return useQuery({
    queryKey: CARTEIRA_ENRIQUECIMENTO_KEY(numeroSap),
    queryFn: () => CarteiraApi.enriquecimento(numeroSap as number),
    enabled: enabled && numeroValido,
    staleTime: 300_000,
    retry: 1,
  });
}
```

- [ ] **Step 6: Rodar teste e build**

Run:

```powershell
npx vitest run src/features/carteira/api.test.ts
npm run build
```

Expected: ambos PASS.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/features/carteira/types.ts frontend/src/features/carteira/api.ts frontend/src/features/carteira/use-carteira-enriquecimento.ts frontend/src/features/carteira/api.test.ts
git commit -m "feat(carteira): add enrichment query client"
```

---

### Task 2: Card hierárquico compartilhado e estados honestos

**Files:**
- Create: `frontend/src/features/carteira/carteira-enriquecimento-card.tsx`
- Create: `frontend/src/features/carteira/carteira-enriquecimento-card.test.tsx`

**Interfaces:**
- Consumes: `useCarteiraEnriquecimento(numeroSap, enabled)` da Task 1.
- Produces: `CarteiraEnriquecimentoCard`.
- Produces: `CarteiraEnriquecimentoContent`, componente apresentacional puro usado pelo teste.

- [ ] **Step 1: Escrever os testes de apresentação que falham**

Crie `frontend/src/features/carteira/carteira-enriquecimento-card.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  CarteiraEnriquecimentoContent,
} from './carteira-enriquecimento-card';
import type { CarteiraEnriquecimento } from './types';

const encontrada: CarteiraEnriquecimento = {
  numero_sap: 700500,
  estado: 'encontrada',
  dados: {
    descricao_conjunto: 'POSTES - CAPEX',
    conjunto: 'POSTE',
    sintoma: 'Queda',
    componente_novo: 'Rede primária',
    kit: 'KIT-01',
    n_trafo: 'TR-10',
    dispositivo_protecao: 'REL-2',
    status_sap: 'Pendente',
    prioridade_sap: 2,
  },
  ausente_na_origem_em: null,
  versao: '7',
};

function render(resultado: CarteiraEnriquecimento | undefined): string {
  return renderToStaticMarkup(
    <CarteiraEnriquecimentoContent
      resultado={resultado}
      carregando={false}
      erro={null}
      onRetry={vi.fn()}
      onIrParaSincronizacao={vi.fn()}
    />,
  );
}

describe('CarteiraEnriquecimentoContent', () => {
  it('renderiza a hierarquia e os nove campos sem PII', () => {
    const html = render(encontrada);

    expect(html).toContain('Dados da base COFFEE');
    expect(html).toContain('POSTES - CAPEX');
    expect(html).toContain('POSTE');
    expect(html).toContain('Sintoma');
    expect(html).toContain('Componente novo');
    expect(html).toContain('KIT-01');
    expect(html).toContain('TR-10');
    expect(html).toContain('REL-2');
    expect(html).toContain('Pendente');
    expect(html).toContain('Prioridade SAP');
    expect(html).not.toContain('Solicitante');
    expect(html).not.toContain('Colaborador');
  });

  it('mantém os dados e avisa quando a nota é tombstone', () => {
    const html = render({
      ...encontrada,
      estado: 'ausente_na_origem',
      ausente_na_origem_em: '2026-07-29T12:00:00',
    });

    expect(html).toContain('Ausente na origem desde');
    expect(html).toContain('POSTES - CAPEX');
  });

  it('diferencia ausência e base nunca sincronizada', () => {
    const semCorrespondencia = render({
      ...encontrada,
      estado: 'sem_correspondencia',
      dados: null,
    });
    const semSync = render({
      ...encontrada,
      estado: 'base_nao_sincronizada',
      dados: null,
    });

    expect(semCorrespondencia).toContain(
      'Sem correspondência na base COFFEE.',
    );
    expect(semSync).toContain('A Carteira ainda não foi sincronizada.');
    expect(semSync).toContain('Ir para Sincronização');
  });

  it('oferece retry somente para erro real', () => {
    const html = renderToStaticMarkup(
      <CarteiraEnriquecimentoContent
        resultado={undefined}
        carregando={false}
        erro={new Error('offline')}
        onRetry={vi.fn()}
        onIrParaSincronizacao={vi.fn()}
      />,
    );

    expect(html).toContain('Não foi possível consultar a base COFFEE.');
    expect(html).toContain('Tentar novamente');
  });

  it('marca o carregamento sem bloquear o inspector', () => {
    const html = renderToStaticMarkup(
      <CarteiraEnriquecimentoContent
        resultado={undefined}
        carregando
        erro={null}
        onRetry={vi.fn()}
        onIrParaSincronizacao={vi.fn()}
      />,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Carregando dados da base COFFEE');
  });
});
```

- [ ] **Step 2: Rodar os testes para confirmar a falha**

Run:

```powershell
npx vitest run src/features/carteira/carteira-enriquecimento-card.test.tsx
```

Expected: FAIL porque os componentes ainda não existem.

- [ ] **Step 3: Implementar o card e a apresentação pura**

Crie `frontend/src/features/carteira/carteira-enriquecimento-card.tsx`:

```tsx
import React from 'react';
import { AlertTriangle, Database, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import type {
  CarteiraEnriquecimento,
  DadosCarteiraEnriquecimento,
} from './types';
import { useCarteiraEnriquecimento } from './use-carteira-enriquecimento';

const CAMPOS: Array<{
  chave: keyof DadosCarteiraEnriquecimento;
  rotulo: string;
}> = [
  { chave: 'sintoma', rotulo: 'Sintoma' },
  { chave: 'componente_novo', rotulo: 'Componente novo' },
  { chave: 'kit', rotulo: 'Kit' },
  { chave: 'n_trafo', rotulo: 'Transformador' },
  { chave: 'dispositivo_protecao', rotulo: 'Dispositivo de proteção' },
  { chave: 'status_sap', rotulo: 'Status SAP' },
  { chave: 'prioridade_sap', rotulo: 'Prioridade SAP' },
];

function exibir(valor: string | number | null): string {
  return valor === null || valor === '' ? '—' : String(valor);
}

function formatarData(valor: string | null): string {
  if (valor === null) return '—';
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? valor
    : data.toLocaleString('pt-BR');
}

interface ContentProps {
  resultado: CarteiraEnriquecimento | undefined;
  carregando: boolean;
  erro: Error | null;
  onRetry: () => void;
  onIrParaSincronizacao: () => void;
}

export function CarteiraEnriquecimentoContent({
  resultado,
  carregando,
  erro,
  onRetry,
  onIrParaSincronizacao,
}: ContentProps): React.JSX.Element {
  if (carregando) {
    return (
      <Card
        aria-busy="true"
        aria-label="Carregando dados da base COFFEE"
      >
        <CardHeader className="p-4">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-6 w-3/4" />
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 p-4 pt-0 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-10" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (erro !== null) {
    return (
      <Card role="alert" className="border-red/30">
        <CardContent className="flex items-start gap-3 p-4">
          <AlertTriangle className="mt-0.5 text-red" />
          <div className="flex-1">
            <p className="text-sm font-medium">
              Não foi possível consultar a base COFFEE.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={onRetry}
            >
              <RefreshCw /> Tentar novamente
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (
    resultado === undefined
    || resultado.estado === 'sem_correspondencia'
  ) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-4 text-sm text-text-mute">
          <Database />
          <span>Sem correspondência na base COFFEE.</span>
        </CardContent>
      </Card>
    );
  }

  if (resultado.estado === 'base_nao_sincronizada') {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-medium">
            A Carteira ainda não foi sincronizada.
          </p>
          <p className="mt-1 text-sm text-text-mute">
            Sincronize a projeção antes de consultar o enriquecimento.
          </p>
          <Button
            type="button"
            variant="link"
            className="mt-2 h-auto p-0"
            onClick={onIrParaSincronizacao}
          >
            Ir para Sincronização
          </Button>
        </CardContent>
      </Card>
    );
  }

  const dados = resultado.dados;
  if (dados === null) {
    return (
      <Card role="alert">
        <CardContent className="p-4">
          <p className="text-sm text-red">
            Resposta inválida da base COFFEE.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={onRetry}
          >
            <RefreshCw /> Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="gap-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="edp-eyebrow">Dados da base COFFEE</span>
          <Badge variant="outline">Somente leitura</Badge>
        </div>
        <CardTitle className="text-lg">
          {exibir(dados.descricao_conjunto)}
        </CardTitle>
        <p className="edp-mono text-sm text-text-mute">
          Conjunto {exibir(dados.conjunto)}
        </p>
        {resultado.estado === 'ausente_na_origem' && (
          <p role="status" className="rounded-md bg-amber/10 p-2 text-sm text-amber">
            Ausente na origem desde{' '}
            {formatarData(resultado.ausente_na_origem_em)}.
          </p>
        )}
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CAMPOS.map(({ chave, rotulo }) => (
            <div key={chave} className="min-w-0 rounded-md bg-surface-2 p-3">
              <dt className="edp-eyebrow">{rotulo}</dt>
              <dd className="edp-mono mt-1 break-words text-sm">
                {exibir(dados[chave])}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

interface CardProps {
  numeroSap: number | null;
  enabled: boolean;
  onIrParaSincronizacao: () => void;
}

export function CarteiraEnriquecimentoCard({
  numeroSap,
  enabled,
  onIrParaSincronizacao,
}: CardProps): React.JSX.Element {
  const query = useCarteiraEnriquecimento(numeroSap, enabled);
  return (
    <CarteiraEnriquecimentoContent
      resultado={query.data}
      carregando={query.isLoading}
      erro={query.error instanceof Error ? query.error : null}
      onRetry={() => { void query.refetch(); }}
      onIrParaSincronizacao={onIrParaSincronizacao}
    />
  );
}
```

- [ ] **Step 4: Rodar teste e build**

Run:

```powershell
npx vitest run src/features/carteira/carteira-enriquecimento-card.test.tsx
npm run build
```

Expected: ambos PASS.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/features/carteira/carteira-enriquecimento-card.tsx frontend/src/features/carteira/carteira-enriquecimento-card.test.tsx
git commit -m "feat(carteira): add enrichment detail card"
```

---

### Task 3: Inspector do Input e ação fixa sem quebrar a grade

**Files:**
- Create: `frontend/src/features/input/input-nota-inspector.tsx`
- Create: `frontend/src/features/input/input-nota-inspector.test.tsx`
- Modify: `frontend/src/features/input/data-grid.tsx:124`
- Modify: `frontend/src/features/input/overview.tsx:27`
- Modify: `frontend/src/features/input/input-section.tsx:18`
- Modify: `frontend/src/App.tsx:143`

**Interfaces:**
- `DataGridProps` ganha `onOpenDetails?: (nota: NotaInput) => void`.
- `InputNotaInspector` recebe `nota`, `onClose` e `onIrParaSincronizacao`.
- `InputSection` e `Overview` recebem `onIrParaSincronizacao`.
- App produz `irParaSincronizacaoCarteira()`.

- [ ] **Step 1: Escrever o teste do resumo do Input**

Crie `frontend/src/features/input/input-nota-inspector.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { InputNotaResumo } from './input-nota-inspector';
import type { NotaInput } from './types';

describe('InputNotaResumo', () => {
  it('mostra somente o resumo já existente da nota', () => {
    const nota: NotaInput = {
      Numero_Nota: 700500,
      Regional: 'Guarulhos',
      Status_Obra: 'Planejada',
      Conjunto: 'POSTE',
      Circuito: 'GUA-01',
      Local_Instalacao: 'ABC-10',
      Planejado_DDPM: 12,
      Mes_Execucao_Planejado: 'jul-2026',
      Prioridade_Nota: 'Alta',
      Status_Nota: 'Em aberto',
    };

    const html = renderToStaticMarkup(<InputNotaResumo nota={nota} />);

    expect(html).toContain('Resumo do Input');
    expect(html).toContain('700500');
    expect(html).toContain('Guarulhos');
    expect(html).toContain('ABC-10');
    expect(html).toContain('jul-2026');
    expect(html).not.toContain('Dados da base COFFEE');
  });
});
```

- [ ] **Step 2: Rodar o teste para confirmar a falha**

Run:

```powershell
npx vitest run src/features/input/input-nota-inspector.test.tsx
```

Expected: FAIL porque `input-nota-inspector.tsx` ainda não existe.

- [ ] **Step 3: Criar o inspector e o resumo**

Crie `frontend/src/features/input/input-nota-inspector.tsx`:

```tsx
import React from 'react';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

import { CarteiraEnriquecimentoCard } from '../carteira/carteira-enriquecimento-card';
import { ROTULOS } from './columns';
import type { NotaInput } from './types';

const CAMPOS_RESUMO = [
  'Numero_Nota',
  'Regional',
  'Status_Obra',
  'Conjunto',
  'Circuito',
  'Local_Instalacao',
  'Planejado_DDPM',
  'Mes_Execucao_Planejado',
  'Prioridade_Nota',
  'Status_Nota',
] as const;

export function InputNotaResumo({
  nota,
}: {
  nota: NotaInput;
}): React.JSX.Element {
  return (
    <section aria-labelledby="input-nota-resumo">
      <h2 id="input-nota-resumo" className="edp-eyebrow mb-3">
        Resumo do Input
      </h2>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CAMPOS_RESUMO.map((campo) => (
          <div key={campo} className="min-w-0">
            <dt className="text-xs text-text-mute">
              {ROTULOS[campo] ?? campo}
            </dt>
            <dd className="edp-mono mt-1 break-words text-sm">
              {String(nota[campo] ?? '—')}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

interface InputNotaInspectorProps {
  nota: NotaInput | null;
  onClose: () => void;
  onIrParaSincronizacao: () => void;
}

export function InputNotaInspector({
  nota,
  onClose,
  onIrParaSincronizacao,
}: InputNotaInspectorProps): React.JSX.Element {
  return (
    <Sheet open={nota !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="edp flex w-full max-w-none flex-col gap-0 p-0 sm:max-w-[560px]"
      >
        <SheetHeader className="border-b border-line p-4">
          <SheetTitle>
            Nota SAP{' '}
            <span className="edp-mono">#{nota?.Numero_Nota ?? '—'}</span>
          </SheetTitle>
        </SheetHeader>
        {nota !== null && (
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
            <InputNotaResumo nota={nota} />
            <CarteiraEnriquecimentoCard
              numeroSap={nota.Numero_Nota}
              enabled
              onIrParaSincronizacao={onIrParaSincronizacao}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Adicionar a coluna utilitária fixa do DataGrid**

Em `frontend/src/features/input/data-grid.tsx`:

1. acrescente `PanelRightOpen` e os tipos `CellProps`/`SimpleColumn` aos imports;
2. importe `Button`;
3. adicione o componente da célula;
4. exponha a prop opcional;
5. passe `stickyRightColumn`.

Use:

```tsx
interface DetalhesColumnData {
  onOpenDetails: (nota: NotaInput) => void;
}

function CelulaDetalhes({
  rowData,
  columnData,
}: CellProps<NotaInput, DetalhesColumnData>): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Abrir detalhes da nota ${rowData.Numero_Nota}`}
        title="Abrir detalhes"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          columnData.onOpenDetails(rowData);
        }}
      >
        <PanelRightOpen />
      </Button>
    </div>
  );
}

export interface DataGridProps {
  registros: NotaInput[];
  colunas: ColunaDef[];
  altura?: number;
  onOpenDetails?: (nota: NotaInput) => void;
}
```

Dentro de `DataGrid`, derive a coluna sem alterar `cols`:

```tsx
  const detailsColumn = React.useMemo<
    SimpleColumn<NotaInput, DetalhesColumnData> | undefined
  >(() => (
    onOpenDetails
      ? {
          title: <span className="sr-only">Detalhes</span>,
          component: CelulaDetalhes,
          columnData: { onOpenDetails },
          basis: 44,
          minWidth: 44,
          maxWidth: 44,
          grow: 0,
          shrink: 0,
        }
      : undefined
  ), [onOpenDetails]);
```

No `DataSheetGrid`, adicione:

```tsx
        stickyRightColumn={detailsColumn}
```

Não insira a ação em `colunas`/`COLUNAS`: `stickyRightColumn` mantém os índices entregues a `calcularSelecao` alinhados com as colunas de dados.

- [ ] **Step 5: Montar o inspector na Visão Geral**

Em `overview.tsx`, importe `InputNotaInspector`, acrescente
`onIrParaSincronizacao` às props, crie:

```tsx
  const [notaDetalhe, setNotaDetalhe] = React.useState<NotaInput | null>(null);
```

Troque o DataGrid e monte o Sheet como irmãos:

```tsx
        <DataGrid
          registros={filtrados}
          colunas={COLUNAS}
          onOpenDetails={setNotaDetalhe}
        />
        <InputNotaInspector
          nota={notaDetalhe}
          onClose={() => setNotaDetalhe(null)}
          onIrParaSincronizacao={onIrParaSincronizacao}
        />
```

- [ ] **Step 6: Ligar a navegação App → Input**

Em `InputSectionProps`, adicione:

```ts
  onIrParaSincronizacao: () => void;
```

Passe a prop ao `Overview`.

Em `App.tsx`, depois de `changeSection`, adicione:

```ts
  function irParaSincronizacaoCarteira(): void {
    setCarteiraSub('sincronizacao');
    changeSection('carteira');
  }
```

Passe a ação ao Input:

```tsx
<InputSection
  sub={inputSub}
  setSub={setInputSub}
  filtrosHandoff={filtrosHandoff}
  onIrParaSincronizacao={irParaSincronizacaoCarteira}
/>
```

- [ ] **Step 7: Rodar teste e build**

Run:

```powershell
npx vitest run src/features/input/input-nota-inspector.test.tsx
npm run build
```

Expected: ambos PASS; `ramal.tsx` continua compilando sem passar `onOpenDetails`.

- [ ] **Step 8: Validar a interação da grade**

Com o app local aberto:

1. selecione um retângulo de células numéricas e anote soma, média e contagem;
2. role horizontalmente até o fim e confirme que a ação de detalhes continua fixa à direita;
3. feche o Sheet e repita a seleção: os três valores devem ser idênticos;
4. use `Tab` até o botão “Abrir detalhes da nota …”, pressione `Enter`, feche com `Escape` e confirme retorno de foco;
5. confira que `COLUNAS` não contém nenhum dos nove campos de enriquecimento.

Expected: grade e barra de status inalteradas; somente a ação fixa abre o Sheet.

- [ ] **Step 9: Commit**

```powershell
git add frontend/src/features/input/input-nota-inspector.tsx frontend/src/features/input/input-nota-inspector.test.tsx frontend/src/features/input/data-grid.tsx frontend/src/features/input/overview.tsx frontend/src/features/input/input-section.tsx frontend/src/App.tsx
git commit -m "feat(input): add read-only note inspector"
```

---

### Task 4: Integrar o card no inspector do COFFEE

**Files:**
- Modify: `frontend/src/features/coffee/components/coffee-nota-inspector.tsx:39`
- Modify: `frontend/src/features/coffee/operacao/coffee-operacao.tsx:20`
- Modify: `frontend/src/features/coffee/concluidas/coffee-concluidas.tsx:33`
- Modify: `frontend/src/features/coffee/coffee-hub.tsx:12`
- Modify: `frontend/src/App.tsx:281`

**Interfaces:**
- `CoffeeNotaInspectorProps` ganha `onIrParaSincronizacao: () => void`.
- `CoffeeOperacao`, `CoffeeConcluidas` e `CoffeeHub` propagam a mesma ação.
- O número enviado ao card é exclusivamente `revisao.data.coffee.id_sap`.

- [ ] **Step 1: Integrar o card no inspector**

Em `coffee-nota-inspector.tsx`, importe:

```ts
import { CarteiraEnriquecimentoCard } from '../../carteira/carteira-enriquecimento-card';
```

Adicione a prop obrigatória:

```ts
  onIrParaSincronizacao: () => void;
```

Desestruture-a na função e, imediatamente depois de `<NotaSummary revisao={revisao.data} />`, renderize:

```tsx
              <CarteiraEnriquecimentoCard
                numeroSap={revisao.data.coffee.id_sap}
                enabled={open}
                onIrParaSincronizacao={onIrParaSincronizacao}
              />
```

Não use `pk`; ele é a chave interna do SQLite do COFFEE e não é o número SAP.

- [ ] **Step 2: Propagar pela Operação**

Altere a assinatura:

```tsx
interface CoffeeOperacaoProps {
  onIrParaSincronizacao: () => void;
}

export function CoffeeOperacao({
  onIrParaSincronizacao,
}: CoffeeOperacaoProps): React.JSX.Element {
```

Passe a prop para `CoffeeNotaInspector`:

```tsx
        onIrParaSincronizacao={onIrParaSincronizacao}
```

- [ ] **Step 3: Propagar por Concluídas**

Acrescente em `CoffeeConcluidasProps`:

```ts
  onIrParaSincronizacao: () => void;
```

Desestruture a prop e passe ao `CoffeeNotaInspector`:

```tsx
        onIrParaSincronizacao={onIrParaSincronizacao}
```

- [ ] **Step 4: Propagar pelo hub**

Acrescente em `CoffeeHubProps`:

```ts
  onIrParaSincronizacao: () => void;
```

Desestruture a prop e altere as duas montagens:

```tsx
        <CoffeeOperacao
          onIrParaSincronizacao={onIrParaSincronizacao}
        />
```

```tsx
        <CoffeeConcluidas
          concluidasHandoff={concluidasHandoff}
          onIrParaInput={onIrParaInput}
          onIrParaSincronizacao={onIrParaSincronizacao}
        />
```

- [ ] **Step 5: Ligar o hub ao App**

Na montagem de `CoffeeHub` em `App.tsx`, passe a função criada na Task 3:

```tsx
onIrParaSincronizacao={irParaSincronizacaoCarteira}
```

- [ ] **Step 6: Rodar build e testes**

Run, a partir de `frontend/`:

```powershell
npm run build
npm test
```

Expected: ambos PASS.

- [ ] **Step 7: Validar o inspector do COFFEE**

No app local:

1. abra uma nota pela Operação e uma por Concluídas;
2. confirme que a ficha, edição de local, atividade e ações existentes continuam iguais;
3. confirme que o card consulta o número mostrado como “ID SAP” no resumo;
4. feche o inspector, abra novamente dentro de cinco minutos e confirme reuso do cache React Query;
5. navegue para outra nota e confirme nova query key pelo outro `id_sap`.

Expected: enriquecimento read-only nos dois fluxos, sem request pelo `pk`.

- [ ] **Step 8: Commit**

```powershell
git add frontend/src/features/coffee/components/coffee-nota-inspector.tsx frontend/src/features/coffee/operacao/coffee-operacao.tsx frontend/src/features/coffee/concluidas/coffee-concluidas.tsx frontend/src/features/coffee/coffee-hub.tsx frontend/src/App.tsx
git commit -m "feat(coffee): show carteira enrichment in inspector"
```

---

### Task 5: Documentação, validação visual e gates finais

**Files:**
- Modify: `docs/dev/11-frontend-carteira.md`
- Modify: `docs/dev/03-frontend-input.md`
- Modify: `docs/dev/02-frontend-coffee.md`

**Interfaces:**
- Documenta o contrato visual compartilhado e os dois consumidores.
- Não cria comportamento novo.

- [ ] **Step 1: Atualizar o manual da Carteira**

Em `docs/dev/11-frontend-carteira.md`, na árvore de arquivos e na seção React Query, registre:

```markdown
- `use-carteira-enriquecimento.ts` consulta por número SAP somente quando o
  inspector está aberto, com `staleTime=300_000` e `retry=1`.
- `carteira-enriquecimento-card.tsx` é a apresentação read-only compartilhada
  por Input e COFFEE. O card diferencia encontrada, tombstone, sem
  correspondência, base nunca sincronizada e erro real; somente erro real
  oferece retry.
- O card mostra rubrica e conjunto como hierarquia e os outros sete campos em
  grade responsiva. Nenhuma PII entra no tipo ou na UI.
```

- [ ] **Step 2: Atualizar o manual do Input**

Em `docs/dev/03-frontend-input.md`, atualize as entradas de `overview.tsx` e `data-grid.tsx` e adicione `input-nota-inspector.tsx`:

```markdown
- A Visão Geral mantém a grade somente leitura e abre `InputNotaInspector`
  por uma ação acessível na `stickyRightColumn` do react-datasheet-grid.
- A ação fixa não integra `COLUNAS`, portanto não desloca os índices usados
  pela seleção Excel-like nem aparece na exportação.
- O inspector mostra primeiro dez campos já presentes em `NotaInput` e depois
  o card read-only da Carteira por `Numero_Nota`. Nenhum campo enriquecido
  vira coluna ou é persistido no Input.
```

- [ ] **Step 3: Atualizar o manual do COFFEE**

Em `docs/dev/02-frontend-coffee.md`, complemente a descrição do
`coffee-nota-inspector.tsx`:

```markdown
- O inspector inclui o card read-only da Carteira usando
  `revisao.coffee.id_sap`; `coffee.pk` permanece somente como chave interna.
- O card não interfere na edição de local, atividade ou ações contextuais.
  Base nunca sincronizada navega para Carteira → Sincronização por callback
  do App.
```

- [ ] **Step 4: Rodar todos os testes e o build frontend**

Run, a partir de `frontend/`:

```powershell
npm test
npm run build
```

Expected: ambos PASS.

- [ ] **Step 5: Rodar a suíte backend como gate de integração**

Run, a partir de `backend/`:

```powershell
.venv\Scripts\python.exe -m pytest -q
```

Expected: PASS.

- [ ] **Step 6: Fazer a matriz visual final**

Suba os serviços:

```powershell
# backend/
.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

```powershell
# frontend/
npm run dev -- --host 127.0.0.1
```

Valide em viewport desktop e estreito:

1. Input encontrada: rubrica, conjunto e sete campos visíveis.
2. Input sem correspondência: estado neutro sem botão de retry.
3. COFFEE encontrada: mesmo card usando `coffee.id_sap`.
4. Tombstone: dados preservados com aviso/data.
5. Base nunca sincronizada: ação abre Carteira → Sincronização.
6. Backend interrompido: alerta de erro com `Tentar novamente`.
7. Loading: skeleton fica somente dentro do card; restante do inspector continua utilizável.
8. Nenhuma label ou valor de PII aparece.
9. Teclado: abrir, fechar e navegar pela ação da grade e pelos botões do card.

Expected: os nove comportamentos aprovados sem regressão das telas existentes.

- [ ] **Step 7: Validar o diff**

Run, a partir da raiz:

```powershell
git diff --check
git status --short
```

Expected: `git diff --check` sem saída; somente os três manuais permanecem sem commit.

- [ ] **Step 8: Commit**

```powershell
git add docs/dev/11-frontend-carteira.md docs/dev/03-frontend-input.md docs/dev/02-frontend-coffee.md
git commit -m "docs: document phase 4b enrichment UI"
```

---

## Self-Review

**Spec coverage:**

- Contrato e query pela fronteira da Carteira → Task 1.
- Card hierárquico compartilhado com nove campos e sem PII → Task 2.
- Quatro estados, retry somente em erro e loading local → Task 2.
- Inspector novo do Input → Task 3.
- Ação estreita sem clique na linha e sem colunas enriquecidas → Task 3.
- Seleção Excel-like preservada por `stickyRightColumn` → Task 3.
- Integração no inspector do COFFEE usando `coffee.id_sap` → Task 4.
- Nenhuma persistência local e nenhum consumo de `notas_sp` → as Tasks 1–4
  fazem somente GET contra a projeção existente.
- Link real para Carteira → Sincronização sem Context/evento global → Tasks 3 e 4.
- Consulta somente com inspector aberto, cache de cinco minutos e retry único → Tasks 1, 3 e 4.
- Docs 11/03/02, testes, build, acessibilidade e matriz visual → Task 5.

**Varredura de lacunas:** todas as ações, interfaces, testes, estados e
comandos estão definidos; não há decisão aberta.

**Type/signature consistency:** `CarteiraEnriquecimento` reflete exatamente o backend; `CarteiraApi.enriquecimento` alimenta `useCarteiraEnriquecimento`; o card recebe `numeroSap: number | null`; Input fornece `Numero_Nota`; COFFEE fornece `coffee.id_sap`. O callback `onIrParaSincronizacao` nasce no App e chega aos dois consumidores com a mesma assinatura.

**Dependency direction:** Input e COFFEE importam a fronteira frontend da Carteira; a Carteira não importa componentes dessas features. O App coordena apenas navegação compartilhada.

**Sequenciamento:** executar este plano somente após o backend 4b. A Fase 4c permanece bloqueada até os gates da Task 5 passarem.
