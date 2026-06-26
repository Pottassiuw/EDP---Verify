# UI/UX Fase 0 — Fundação (Tailwind v4 + shadcn + bridge de tokens) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduzir Tailwind v4 + shadcn/ui no frontend, com um *bridge* que expõe os tokens EDP existentes como tema semântico do shadcn, trocar a fonte sans para Inter e provar a integração com um primitivo (Button/Card) — sem alterar nenhuma tela ou fluxo.

**Architecture:** O `tokens.css` continua sendo a fonte da verdade de cores/temas (`.edp` dark, `.edp[data-theme="light"]` light). Adicionamos vars semânticas do shadcn (`--background`, `--primary`, …) **dentro de `.edp`**, referenciando os tokens EDP, de modo que herdam o switch dark/light automaticamente. Um novo `index.css` importa apenas as camadas `theme` + `utilities` do Tailwind v4 (**sem preflight**, para não resetar telas ainda não migradas) e expõe as vars como cores utilitárias via `@theme inline`.

**Tech Stack:** React 18, Vite 6, TypeScript 5.8 (strict, `noUnusedLocals`/`noUnusedParameters`), Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui (new-york, cssVariables), `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-slot`, `lucide-react`, `tw-animate-css`, `@fontsource/inter`, `@fontsource/ibm-plex-mono`.

## Global Constraints

- Todos os comandos rodam a partir de `frontend/` (ex.: `cd frontend && npm run build`).
- Não há test runner no frontend; o ciclo de teste de cada task é **`npm run build`** (tsc `-b` + vite build) + verificação manual via `npm run dev`.
- **Nenhuma tela ou fluxo pode ser alterado nesta fase.** O app deve ficar visualmente equivalente em dark e light.
- **Preflight do Tailwind fica desligado nesta fase** (importar só `theme` + `utilities`, nunca `@import "tailwindcss";` cru). Será reativado na Fase 4.
- TS é strict com `noUnusedLocals` + `noUnusedParameters`: todo código novo deve compilar sem símbolos não usados.
- Colisão de nomes resolvida no bridge: marca EDP (`--accent`) → `--primary` do shadcn; `--accent` do shadcn (hover sutil) → `--surface-2`.
- Vite config é ESM (`"type": "module"`): não usar `__dirname`; usar `fileURLToPath(new URL(...))`.
- Commits em português, prefixos convencionais (`build`/`feat`/`style`), seguindo o histórico do repo. Terminar a mensagem com a linha `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

- `frontend/package.json` — novas dependências (Tasks 1, 3, 4).
- `frontend/vite.config.ts` — plugin Tailwind + alias `@` (Task 1).
- `frontend/tsconfig.json` + `frontend/tsconfig.app.json` — `baseUrl` + `paths` para o alias `@` (Task 1).
- `frontend/src/lib/utils.ts` — helper `cn()` (Task 1, novo).
- `frontend/src/index.css` — entrada Tailwind sem preflight + `@theme inline` (Task 2, novo).
- `frontend/src/tokens.css` — vars de bridge em `.edp`; troca de fonte (Tasks 2, 3).
- `frontend/src/main.tsx` — importar `index.css` + fontes (Tasks 2, 3).
- `frontend/components.json` — config do shadcn (Task 4, novo).
- `frontend/src/components/ui/button.tsx` + `card.tsx` — primitivos de prova (Task 4, novos).

---

## Task 1: Tooling — Tailwind v4 + alias `@` + cn()

**Tags:** `model:sonnet`, `reasoning:low`.

**Files:**
- Modify: `frontend/package.json` (deps via npm)
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/tsconfig.json`
- Modify: `frontend/tsconfig.app.json`
- Create: `frontend/src/lib/utils.ts`

**Interfaces:**
- Produces: alias `@` → `frontend/src` (Vite + tsconfig); `cn(...inputs: ClassValue[]) => string` exportado de `@/lib/utils`; plugin Tailwind v4 ativo no Vite.

- [ ] **Step 1: Instalar dependências de tooling**

Run:
```bash
cd frontend && npm install tailwindcss @tailwindcss/vite class-variance-authority clsx tailwind-merge
```
Expected: instala sem erros; `package.json` ganha as 5 dependências.

- [ ] **Step 2: Adicionar o plugin Tailwind e o alias `@` no Vite**

Substituir todo o conteúdo de `frontend/vite.config.ts` por:

```ts
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 3: Adicionar `baseUrl` + `paths` nos tsconfig**

Em `frontend/tsconfig.json`, adicionar um bloco `compilerOptions` (o arquivo hoje só tem `files`/`references`) para o editor resolver o alias:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

Em `frontend/tsconfig.app.json`, adicionar dentro de `compilerOptions` (logo após `"jsx": "react-jsx",`):

```json
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] },
```

- [ ] **Step 4: Criar o helper `cn()`**

Criar `frontend/src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Build para validar tooling + alias**

Run: `cd frontend && npm run build`
Expected: PASS (tsc + vite build sem erros). Valida que o plugin Tailwind carrega e que o alias/`paths` não quebram o type-check.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/tsconfig.json frontend/tsconfig.app.json frontend/src/lib/utils.ts
git commit -m "build(ui): Tailwind v4 no Vite + alias @ + helper cn()"
```

---

## Task 2: Entrada CSS sem preflight + bridge de tokens + @theme inline

**Tags:** `model:sonnet`, `reasoning:medium`.

**Files:**
- Create: `frontend/src/index.css`
- Modify: `frontend/src/tokens.css`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Consumes: tokens EDP existentes em `tokens.css` (`--bg`, `--text`, `--surface`, `--surface-2`, `--accent`, `--red`, `--line-2`, `--r`, `--text-dim`, `--text-mute`, `--font-body`, `--font-mono`).
- Produces: vars semânticas shadcn (`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius` e respectivos `*-foreground`) em `.edp`; cores utilitárias Tailwind (`bg-background`, `text-foreground`, `border-border`, `bg-primary`, …) via `@theme inline` em `index.css`.

- [ ] **Step 1: Instalar `tw-animate-css`**

Run: `cd frontend && npm install tw-animate-css`
Expected: instala sem erros (usado pelos componentes shadcn na Task 4).

- [ ] **Step 2: Criar `frontend/src/index.css` (sem preflight) com `@theme inline`**

Criar `frontend/src/index.css`:

```css
/* Tailwind v4 — só theme + utilities (SEM preflight nesta fase).
   O preflight/reset volta na Fase 4, quando todas as telas estiverem migradas. */
@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
@import "tw-animate-css";

/* Bridge: expõe as vars semânticas (definidas em tokens.css, dentro de .edp)
   como cores/raios/fontes utilitárias do Tailwind. */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--sh-accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 2px);
  --radius-md: var(--radius);
  --radius-lg: calc(var(--radius) + 3px);
  --font-sans: var(--font-body);
  --font-mono: var(--font-mono);
}
```

- [ ] **Step 3: Adicionar as vars de bridge em `tokens.css` (dentro de `.edp`)**

Em `frontend/src/tokens.css`, dentro do bloco `.edp { … }`, logo antes da linha `color: var(--text);` (atualmente linha ~62), inserir o bloco abaixo.

**Importante — colisão de nomes:** o `--accent` de **marca EDP** já está definido no topo do `.edp` (linha ~14) e é consumido pelo app inteiro. Por isso **não** redefina `--accent` aqui; o accent-de-hover do shadcn recebe um nome próprio, `--sh-accent` (já referenciado em `index.css` via `--color-accent: var(--sh-accent)`). A marca chega ao shadcn por `--primary`/`--ring`.

```css
  /* — bridge shadcn (mapeado para os tokens EDP; herda dark/light) — */
  --background: var(--bg);
  --foreground: var(--text);
  --card: var(--surface);
  --card-foreground: var(--text);
  --popover: var(--surface-2);
  --popover-foreground: var(--text);
  --primary: var(--accent);            /* marca EDP */
  --primary-foreground: #fff;
  --secondary: var(--surface-2);
  --secondary-foreground: var(--text-dim);
  --muted: var(--surface-2);
  --muted-foreground: var(--text-mute);
  --sh-accent: var(--surface-2);       /* hover sutil do shadcn (NÃO é a marca EDP) */
  --accent-foreground: var(--text);
  --destructive: var(--red);
  --destructive-foreground: #fff;
  --border: var(--line-2);
  --input: var(--line-2);
  --ring: var(--accent);
  --radius: var(--r);
```

- [ ] **Step 4: Importar `index.css` no `main.tsx` (antes de `tokens.css`)**

Em `frontend/src/main.tsx`, na linha 5 (`import './tokens.css';`), inserir a
importação do `index.css` **antes** dela:

```tsx
import './index.css';
import './tokens.css';
```

- [ ] **Step 5: Build**

Run: `cd frontend && npm run build`
Expected: PASS. Valida que o CSS do Tailwind compila e o `@theme inline` é aceito.

- [ ] **Step 6: Verificação manual (dark + light, sem regressão)**

Run: `cd frontend && npm run dev` e abrir `http://localhost:5173`.
Conferir:
1. O app está **visualmente igual** ao anterior (nada de reset/preflight quebrando espaçamento, listas ou botões).
2. No DevTools, inspecionar o elemento raiz `.edp` e confirmar que resolvem:
   `--background` (= `--bg`), `--primary` (= cor de marca verde), `--border`.
3. Alternar o tema (TweaksPanel → Tema light) e confirmar que `--background`/`--foreground` mudam para os valores light.
4. Confirmar que a sidebar e os botões `.edp-btn` mantêm a cor de marca (prova de que `--accent` não foi sobrescrito).

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/index.css frontend/src/tokens.css frontend/src/main.tsx
git commit -m "feat(ui): bridge de tokens EDP -> tema shadcn (Tailwind sem preflight)"
```

---

## Task 3: Tipografia Inter (fontsource)

**Tags:** `model:sonnet`, `reasoning:low`.

**Files:**
- Modify: `frontend/package.json` (deps)
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/tokens.css`

**Interfaces:**
- Consumes: `--font-display`, `--font-body`, `--font-mono` em `tokens.css`.
- Produces: corpo/headers em Inter; dados/IDs seguem em IBM Plex Mono; sem request a fonte externa.

- [ ] **Step 1: Instalar as fontes self-hosted**

Run: `cd frontend && npm install @fontsource/inter @fontsource/ibm-plex-mono`
Expected: instala sem erros.

- [ ] **Step 2: Importar os pesos no `main.tsx`**

Em `frontend/src/main.tsx`, no topo (após a linha `import './tokens.css';`), adicionar:

```tsx
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
```

- [ ] **Step 3: Remover o Google Fonts e trocar as famílias em `tokens.css`**

Em `frontend/src/tokens.css`, remover a linha 8 (o `@import url('https://fonts.googleapis.com/...')`).

Trocar as três linhas de família (atualmente linhas ~46-48):

```css
  --font-display: 'Inter', system-ui, -apple-system, sans-serif;
  --font-body: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
```

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: PASS.

- [ ] **Step 5: Verificação manual**

Run: `cd frontend && npm run dev`.
Conferir: textos de corpo/headers renderizam em **Inter**; IDs/tags monoespaçados
seguem em IBM Plex Mono; sem requisição a `fonts.googleapis.com` (aba Network).

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/main.tsx frontend/src/tokens.css
git commit -m "style(ui): fonte Inter self-hosted (mantendo IBM Plex Mono nos dados)"
```

---

## Task 4: shadcn — components.json + Button/Card (prova do bridge)

**Tags:** `model:sonnet`, `reasoning:low`.

**Files:**
- Modify: `frontend/package.json` (deps)
- Create: `frontend/components.json`
- Create: `frontend/src/components/ui/button.tsx`
- Create: `frontend/src/components/ui/card.tsx`

**Interfaces:**
- Consumes: `cn` de `@/lib/utils` (Task 1); cores utilitárias do bridge (Task 2).
- Produces: `Button` (`variant`, `size`, `asChild`) e `Card` (+ subpartes) em `@/components/ui/*`, prontos para as fases seguintes.

- [ ] **Step 1: Instalar a dependência do Button**

Run: `cd frontend && npm install @radix-ui/react-slot lucide-react`
Expected: instala sem erros.

- [ ] **Step 2: Criar `frontend/components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

> O `components.json` permite adicionar futuros componentes via
> `npx shadcn@latest add <comp>`. Como o ambiente é não-interativo, os arquivos
> abaixo são fornecidos diretamente (fonte oficial new-york), já apontando para o
> bridge — não dependem da CLI.

- [ ] **Step 3: Criar `frontend/src/components/ui/button.tsx`**

```tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

- [ ] **Step 4: Criar `frontend/src/components/ui/card.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...props} />
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('font-semibold leading-none tracking-tight', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
```

- [ ] **Step 5: Build (compila contra o bridge)**

Run: `cd frontend && npm run build`
Expected: PASS. A compilação prova que as classes do bridge (`bg-primary`,
`text-primary-foreground`, `bg-card`, `border`, `ring-ring`, etc.) são geradas
pelo Tailwind e que os componentes type-checkam no modo strict.

- [ ] **Step 6: Verificação manual da prova (dark + light)**

Montar o `Button` temporariamente para inspeção visual e **reverter antes do commit**:
1. Em `frontend/src/App.tsx`, importar `import { Button } from '@/components/ui/button';` e renderizar `<Button>Teste</Button>` logo após a abertura do `<div className="edp triage" …>`.
2. Run: `cd frontend && npm run dev`. Confirmar que o botão aparece com **fundo verde de marca** (`bg-primary`), texto branco, hover levemente mais escuro e anel de foco visível ao tabular — idêntico em dark e em light (alternar tema no TweaksPanel).
3. Desfazer a edição do `App.tsx` (o botão era só prova; nenhuma tela muda nesta fase).

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/components.json frontend/src/components/ui/button.tsx frontend/src/components/ui/card.tsx
git commit -m "feat(ui): shadcn components.json + Button/Card sobre o bridge de tokens"
```

---

## Self-Review

**Spec coverage:**
- Spec §1 (Tooling Tailwind v4: deps, plugin Vite, alias, tsconfig paths, `cn`) → Task 1 ✔
- Spec §2 (entrada CSS sem preflight + `@theme inline`) → Task 2 (Steps 2, 5) ✔
- Spec §3 (bridge de tokens em `.edp`, colisão `--accent` resolvida via `--sh-accent`) → Task 2 (Step 3) ✔
- Spec §4 (tipografia Inter via `@fontsource`, remover Google Fonts) → Task 3 ✔
- Spec §5 (shadcn init + Button/Card como prova) → Task 4 ✔
- Critérios de aceite (build passa, paridade dark/light, alias, `cn`, vars resolvem, Inter, Button) → cobertos pelos Steps de build + verificação manual de cada task ✔

**Placeholder scan:** Sem TBD/TODO. Todos os passos de código mostram o código completo; todos os passos de comando trazem o comando exato e o resultado esperado. A "prova" da Task 4 é concreta (montar/reverter Button + inspeção dark/light).

**Type consistency:** `cn(...inputs: ClassValue[]) => string` definido na Task 1 e consumido nas Tasks 2/4; `--primary←--accent` (marca) e `--sh-accent←--surface-2` consistentes entre `tokens.css` (Task 2 Step 3) e `index.css` (`--color-accent: var(--sh-accent)`, Task 2 Step 2); `Button`/`Card` exportam nomes usados de forma consistente. A colisão `--accent` (marca EDP) × `--accent` (hover shadcn) é resolvida usando `--sh-accent` para o hover, sem nunca sobrescrever a marca.

**Decisão de granularidade:** 4 tasks, cada uma com um build verde e (onde há efeito visual) verificação manual própria — um revisor pode aprovar/rejeitar cada uma isoladamente.
