# Refatoração UI/UX — Fase 0: Fundação (Tailwind v4 + shadcn + bridge de tokens)

**Data:** 2026-06-26
**Status:** Aprovado

## Contexto

O software EDP Verify está crescendo e há reclamações de design/layout. Vamos
refatorar a UI/UX adotando **Tailwind CSS v4** + **shadcn/ui**, com foco em
facilidade de uso, acessibilidade e conforto (visual clean/low-profile).

A estilização atual é:
- `frontend/src/tokens.css`: design tokens em CSS variables, escopados em `.edp`,
  com `data-theme` (dark/light), `data-density` (compact/cozy), accent por CSS var,
  fontes Archivo + IBM Plex Mono e a paleta de marca EDP (verde/azul/índigo).
- Classes-átomo: `.edp-btn`, `.edp-tag`, `.edp-seg`, `.edp-prio`, `.edp-rule`.
- **Muito `style={{}}` inline** em todos os componentes.
- Controle de tema/densidade/accent no **TweaksPanel** (painel flutuante de
  scaffold "omelette", não uma página real). O tema **não persiste**.

Stack: React 18, Vite 6, TypeScript 5.8. Dependências de UI hoje: apenas
`@tanstack/react-query`, `react`, `react-dom`.

## Decisões de produto (definidas no brainstorming)

1. **Marca preservada**, mas com **fonte sans trocada para Inter** (IBM Plex Mono
   mantida nos dados/IDs das tabelas).
2. **Accent e densidade** continuam customizáveis, porém migrados para uma página
   de **Configurações** real (Fase 1). O TweaksPanel flutuante sai do produto.
3. **Tema** com opções system/light/dark, **default = tema do sistema**,
   persistido (Fase 1).
4. **Bridge**: os tokens EDP existentes viram o tema do Tailwind/shadcn (não
   substituir nem jogar fora o token system).
5. **Reskin com IA igual**: mesmos módulos (COFFEE, Input), sub-páginas e fluxos.
   Adotar o bloco de **sidebar do shadcn**. Relatórios/BI seguem placeholder.
   A página Configurações passa a existir (requisito do item 3 acima).

## Roadmap (5 sub-projetos, cada um com spec → plano → implementação)

Ordem: **0 → 1 → 2 → 3 → 4**.

| Fase | Sub-projeto | Entrega |
|------|-------------|---------|
| **0** | **Fundação** (esta spec) — Tailwind v4 + shadcn + bridge de tokens + Inter | Build passa, app ~idêntico, tooling/bridge vivos, 1 primitivo migrado como prova |
| 1 | Shell — sidebar shadcn + página Configurações + tema (system default, persistido) | Sidebar nova, Configurações real, TweaksPanel removido |
| 2 | COFFEE — migrar telas do módulo | Tabelas, dashboard/verificar, KPI drawer, modais e logs em Tailwind/shadcn |
| 3 | Input — migrar telas do módulo | Overview, manage, notes-table, logs, reports, settings reestilizados |
| 4 | Polimento — acessibilidade, limpeza, responsivo | Auditoria AA, remoção de CSS morto (`tokens.css` átomos), conforto/responsivo |

Esta spec cobre **apenas a Fase 0**. As demais serão specadas quando chegarem.

---

## Escopo da Fase 0

**Objetivo:** introduzir Tailwind v4 + shadcn/ui no app, com um bridge que expõe os
tokens EDP como tema semântico do shadcn, trocar a fonte sans para Inter, e provar
a integração migrando **um** primitivo (Button) — **sem alterar telas ou fluxos**.
O app deve continuar visualmente equivalente e o `npm run build` deve passar.

### 1. Tooling — Tailwind v4

- Adicionar dependências: `tailwindcss@^4`, `@tailwindcss/vite@^4`,
  `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`,
  `tw-animate-css`.
- `frontend/vite.config.ts`: adicionar o plugin `@tailwindcss/vite` e o alias de
  path `@` → `frontend/src`.
- `frontend/tsconfig.json` (e `tsconfig.app.json` se aplicável): adicionar
  `baseUrl` + `paths` (`"@/*": ["./src/*"]`) para casar com o alias do Vite.
- Criar `frontend/src/lib/utils.ts` com `cn()` (`clsx` + `tailwind-merge`).

### 2. Entrada CSS do Tailwind — **sem preflight nesta fase**

- Criar `frontend/src/index.css` (importado em `main.tsx` antes de `tokens.css`).
- **Não** usar `@import "tailwindcss";` cru (puxaria o preflight/reset, que
  alteraria as telas antigas que dependem de estilo de elemento padrão + inline).
  Em vez disso, importar só as camadas necessárias:

  ```css
  @layer theme, base, components, utilities;
  @import "tailwindcss/theme.css" layer(theme);
  @import "tailwindcss/utilities.css" layer(utilities);
  @import "tw-animate-css";
  ```

- Justificativa: as telas ainda não migradas continuam funcionando intactas.
  O preflight será reativado na **Fase 4**, quando tudo estiver migrado.

### 3. Bridge de tokens (coração da fase)

shadcn espera CSS vars semânticas. Mapeá-las para os tokens EDP existentes, dentro
dos seletores que já alternam dark/light, para herdar o switch automaticamente.

- Em `tokens.css`, **dentro de `.edp`** (tema dark, base), adicionar as vars
  semânticas referenciando os tokens existentes:

  | shadcn var | ← token EDP |
  |------------|-------------|
  | `--background` | `--bg` |
  | `--foreground` | `--text` |
  | `--card` | `--surface` |
  | `--card-foreground` | `--text` |
  | `--popover` | `--surface-2` |
  | `--popover-foreground` | `--text` |
  | `--primary` | `--accent` (marca) |
  | `--primary-foreground` | `#fff` |
  | `--secondary` | `--surface-2` |
  | `--secondary-foreground` | `--text-dim` |
  | `--muted` | `--surface-2` |
  | `--muted-foreground` | `--text-mute` |
  | `--accent` (hover sutil shadcn) | `--surface-2` |
  | `--accent-foreground` | `--text` |
  | `--destructive` | `--red` |
  | `--destructive-foreground` | `#fff` |
  | `--border` | `--line-2` |
  | `--input` | `--line-2` |
  | `--ring` | `--accent` |
  | `--radius` | `--r` (9px) |

- **Colisão de nomes resolvida:** o `--accent` do shadcn (fundo de hover sutil) é
  diferente do `--accent` da EDP (cor de marca). Para não quebrar o sistema EDP, a
  marca é mapeada para `--primary` do shadcn; o `--accent` do shadcn aponta para
  `--surface-2`. Como o accent de marca já varia por usuário, `--primary`
  (e `--ring`) acompanham essa escolha automaticamente.
- O bloco `.edp[data-theme="light"]` **não precisa redefinir** as vars de bridge:
  elas referenciam tokens EDP que já trocam por tema. Confirmar no build/checagem
  manual que `--background` etc. resolvem para os valores light no tema claro.
- Expor as vars como cores utilitárias do Tailwind v4 via `@theme inline` em
  `index.css`, para habilitar `bg-background`, `text-foreground`, `border-border`,
  `bg-primary`, etc.:

  ```css
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
    --color-accent: var(--accent);
    --color-accent-foreground: var(--accent-foreground);
    --color-destructive: var(--destructive);
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

- **Densidade:** mantida como está (`data-density` dirige `--row-py/--pad/--gap`).
  Não há bridge de densidade nesta fase; os componentes shadcn usam spacing fixo e
  a densidade afeta sobretudo as tabelas EDP, que migram nas Fases 2/3.

### 4. Tipografia — Inter

- Adicionar `@fontsource/inter` (e, por consistência/offline,
  `@fontsource/ibm-plex-mono`); importar os pesos usados em `main.tsx`.
- Remover o `@import` do Google Fonts em `tokens.css`.
- Em `tokens.css`, trocar `--font-display` e `--font-body` para Inter; manter
  `--font-mono` em IBM Plex Mono.

  ```css
  --font-display: 'Inter', system-ui, -apple-system, sans-serif;
  --font-body: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
  ```

### 5. shadcn — init + primeiro primitivo (prova)

- Criar `frontend/components.json` (estilo padrão, RSC `false`, TSX `true`, base
  color neutra, CSS var = `index.css`, aliases `@/components`, `@/lib/utils`).
- Adicionar os componentes `Button` e `Card` em `frontend/src/components/ui/`.
  (Podem ser adicionados via CLI `npx shadcn@latest add button card` ou copiados;
  o importante é que usem o `cn` e as cores do bridge.)
- **Prova:** o `Button` deve renderizar com a cor de marca (`bg-primary`) e o
  hover/foco corretos, idênticos em dark e light, sem regressão nas telas.

## Critérios de aceite (Fase 0)

- [ ] `npm run build` (tsc + vite) passa sem erros.
- [ ] App roda (`npm run dev`) e está **visualmente equivalente** ao atual em dark
      e em light (telas não migradas intactas — preflight desligado).
- [ ] Alias `@` resolve em runtime (Vite) e em type-check (tsconfig).
- [ ] `cn()` disponível em `@/lib/utils`.
- [ ] Vars de bridge resolvem corretamente em dark **e** light (checar
      `--background`, `--primary`, `--border` no inspetor nos dois temas).
- [ ] Fonte Inter aplicada ao corpo/headers; dados/IDs seguem em IBM Plex Mono.
- [ ] `Button` (e `Card`) do shadcn renderizam com a cor de marca e foco/hover
      corretos nos dois temas — prova do bridge.
- [ ] Nenhuma lógica de tela/fluxo alterada nesta fase.

## Riscos e mitigações

- **Preflight do Tailwind alterando telas antigas** → mitigado importando só
  `theme` + `utilities` (sem `base`) nesta fase; preflight volta na Fase 4.
- **Colisão `--accent` (EDP marca) × `--accent` (shadcn hover)** → resolvida pelo
  mapeamento explícito (marca→`--primary`, hover→`--surface-2`).
- **Compatibilidade shadcn × Tailwind v4** → usar o caminho oficial de v4 do
  shadcn (`@theme inline`, `components.json` com cssVariables).
- **Fontes externas bloqueadas no ambiente interno** → `@fontsource` (npm,
  self-host) em vez de Google Fonts.

## Escopo excluído (Fase 0)

- Migrar qualquer tela do COFFEE ou Input (Fases 2/3).
- Sidebar shadcn, página Configurações e tema persistido/system (Fase 1).
- Remover `tokens.css` átomos ou reativar preflight (Fase 4).
- Bridge de densidade (mantida como CSS vars até as tabelas migrarem).
