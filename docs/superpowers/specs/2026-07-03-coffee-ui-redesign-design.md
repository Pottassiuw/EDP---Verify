# COFFEE — Redesenho Abrir/Verificar + funcionalidades Corrigidas/Pendentes/Logs

**Data:** 2026-07-03
**Status:** aprovado pelo usuário (brainstorm concluído)
**Contexto:** continuação da elevação visual "direção Supabase" já aplicada ao módulo Input e à casca do COFFEE. Paleta EDP intacta (verde `#00a859` único acento). Primitivos compartilhados já existem em `src/components/branded/section.tsx` (`PageHeader`, `StatTile`, `Banner`, `SegTabs`) e classes `.edp-*` em `src/tokens.css`.

## Decisões travadas (respostas do usuário)

1. **Paleta COFFEE unificada no verde EDP.** O tan/marrom `variant="coffee"` morre; ações COFFEE usam botão padrão + ícone `Coffee` (Lucide).
2. **Marca "To De Olho 👀" fica intacta** (nome + emoji). Personalidade preservada; só execução tipográfica sobe (weight 800 → 600 + tracking).
3. **Abrir converge para um layout único responsivo.** Setting `coffeeLayout` (composer/split) morre.
4. **TopBar da Verificar morre.** Arquivo/API/Nova sobem para o header do hub.
5. **Abrir usa lista única** (funde nuvem de chips + modo "Lista de links"); modos de abertura viram duas ações diretas.
6. **Funcionalidades escolhidas:**
   - Corrigidas: busca por ID · copiar IDs · abrir no COFFEE por linha
   - Pendentes: busca seletiva · idade da pendência · abrir no COFFEE por linha · arquivar em lote
   - Logs: StatTiles resumo · filtro de período · auto-refresh

## A1 · Abrir (`coffee-abrir.tsx` — reescrita do miolo)

Coluna única centrada (max-width ~860px), seções em `edp-panel`:

1. **Captura** — input mono `edp-field` (flex) + botão primário "Adicionar" (ícone `Plus`). Parser de tokens e validação `COFFEE_ID_RE` atuais permanecem.
2. **Placar** — três `StatTile` (na lista / abertas / restantes) + barra de progresso (`coffee-bar` atual, tokenizada) + ações ghost "Copiar IDs" e "Limpar tudo".
3. **Ações de abertura** — CTA primário "Abrir todas (N)" (ícone `Coffee`) + controle "Abrir próximas N" com stepper (clamp 1–50 atual). O antigo modo "blocos" vira controle direto; o aviso sobre abas/extensão permanece como microcopy.
4. **Lista única** — substitui chips e o modo "links". Linha: indicador de estado (`Circle` aberto pendente / `Check` verde aberta) + ID mono + `tipo_nota · referencia` dim + botão "Abrir"/"Reabrir" (outline, sm) + remover (`X` ghost). Estado vazio: caixa tracejada com instrução.
5. **Banner de retorno** (`coffeeReturn`) — vira `Banner` âmbar com botão primário "Voltar à triagem" e dispensar com ícone `X`.

**Morre:** estados/props dos 3 modos, nuvem de chips, renderização dupla composer/split, setting `coffeeLayout` (remoção em `settings-context.tsx`, `configuracoes.tsx`, prop em `App.tsx` e `CoffeeHub`), tipos `CoffeeOpenMode` e `CoffeeLayout` em `types.ts` (grep confirmou: sem outros usos), maior parte do bloco `COFFEE_STYLE`.

**Persistência mantida:** `localStorage` `edp_coffee_ids` / `edp_coffee_opened` como hoje.

## A2 · Verificar (estrutura + pele)

- **TopBar morre** (`top-bar.tsx` deletado). Quando `sub === "verificar"` e `triage.screen === "dashboard"`, o header do `CoffeeHub` mostra, à direita: badge mono do arquivo (`triage.file`), badge API/Demo (verde/âmbar, como hoje), botão ghost "Nova planilha" (`triage.onReset`). `CoffeeHub` já recebe `triage`; sem novas props externas. O componente `Logo` e o tipo `LogoProps` morrem junto (grep confirmou: único uso era a TopBar; o upload usa as constantes `LOGO_DARK/LIGHT` direto).
- **Upload hero:** marca e gradiente ficam. Ajustes: título weight 800 → 600 + `--tracking-display`; botão `variant="accent"` → `default`.
- **Dashboard:**
  - Selects/input do filtro (`ctrlStyle`) → classe `edp-field` (o `ctrlStyle` de `shared.tsx` morre se ficar sem uso).
  - `Detail` h2 weight 800 → `edp-title`.
  - Emoji-glifos → Lucide: `⤢/⤡`→`Maximize2/Minimize2`, `↺`→`RotateCcw`, `✓`→`Check`, `☕`→`Coffee`, `◎`→`MapPin`, `→ ☕` da fila→`Coffee` pequeno.
  - CSS local `.accent-btn` morre (usos viram `Button` default).
  - Estrutura master-detail (fila + detalhe), chips de regra (`rchip`/`fchip`), KpiDrawer e DuplicateCompare **intocados**.

## A3 · Paleta unificada (`button.tsx`)

Variants `coffee` e `accent` são adições do projeto ao arquivo vendored (não são shadcn) e saem. `accent` duplica `default` (verde preenchido). Todos os usos migram para `default`. Nenhuma outra linha do arquivo vendored muda.

Usos a migrar: `coffee-abrir.tsx`, `coffee-geradas.tsx` (`AbrirCoffeeBtn`), `dashboard.tsx` (COFFEE + accent-btn), `upload-screen.tsx` (accent), `duplicate-compare.tsx` e demais ocorrências de `variant="coffee"|"accent"` (varrer com grep).

## B1 · Corrigidas (`coffee-corrigidas.tsx`)

- Busca por ID: `edp-field` no cabeçalho; filtro client-side por `pk` ou `id_sap` (substring).
- "Copiar IDs": botão outline; copia os `pk` filtrados (um por linha) via clipboard; toast de confirmação.
- Coluna de ações ganha botão ☕ Abrir no COFFEE (reusar `AbrirCoffeeBtn` — mover para `coffee-notas-table.tsx` ou arquivo comum, hoje está local em `coffee-geradas.tsx`).

## B2 · Pendentes (`coffee-pendentes.tsx` + backend)

- **Seleção:** `CoffeeNotasTable` com `selectable` (infra já existe e está sem uso). Cabeçalho mostra contagem selecionada.
- **Busca seletiva:** com seleção → CTA "Atualizar selecionadas (N)" envia só os pks selecionados a `POST /coffee/buscar` (endpoint já aceita lista; zero backend). Sem seleção → "Atualizar todas" (comportamento atual).
- **Arquivar em lote:** com seleção → botão destructive "Arquivar selecionadas (N)" → `ConfirmModal` com justificativa única → loop sequencial `POST /coffee/arquivar` por id. Falhas parciais: toast lista os pks que falharam. `// ponytail: loop sequencial; endpoint de lote se passar de ~50 notas por vez`.
- **Idade da pendência:**
  - Backend: coluna `classificacao_em TEXT` em `notas_coffee` (migração `ALTER TABLE` no padrão de `inicializar_banco`). `upsert_nota` grava `now()` quando a classificação muda ou a linha nasce. Campo entra no `_COLUNAS` e na resposta de `/notas`.
  - Frontend: `CoffeeNota.classificacao_em?: string | null`; coluna "Pendente há" (tempo relativo, `formatRelativeTime`); NULL (notas antigas) mostra "—". Lista ordenada mais antiga primeiro (NULL no fim).
- Coluna de ações ganha ☕ Abrir no COFFEE.

## B3 · Logs (`coffee-logs.tsx` + backend)

- **Período:** select `edp-field` (Hoje / 7 dias / 30 dias / Tudo) → param novo `since: Optional[str]` (ISO) em `GET /coffee/logs` e `listar_logs` (`timestamp >= ?`, comparação lexicográfica de ISO). "Tudo" omite o param.
- **StatTiles** acima da timeline: Ações (grupos), Falhas (`sucesso=false`), Notas tocadas (`nota_pk` únicos) — agregação client-side dos logs carregados. Eyebrow do bloco: "no período carregado" (o `limit` continua valendo).
- **Auto-refresh:** toggle "Ao vivo" (switch shadcn ou checkbox estilizado); ativo → `refresh()` do `useCoffeeLogs` a cada 10 s; limpa intervalo ao desativar/desmontar.

## Fora de escopo

- Transição SAP inline em Corrigidas (recusado pelo usuário).
- Busca textual em Logs (recusado).
- Endpoint de arquivamento em lote no backend.
- Qualquer mudança em KpiDrawer, DuplicateCompare, telas Geradas/Gerar-modal além da troca de variant.

## Critérios de aceite

1. `tsc -b` e `vite build` limpos; grep sem `variant="coffee"`, `variant="accent"`, `coffeeLayout`, `top-bar`.
2. Abrir: adicionar/abrir/copiar/limpar funcionam; progresso e persistência preservados; um único layout em qualquer largura.
3. Verificar: uma barra a menos; upload e triagem funcionais; marca intacta.
4. Pendentes: buscar seletivo dispara job só com os pks marcados; arquivar em lote grava justificativa em cada log; coluna de idade renderiza relativo/"—".
5. Logs: período filtra no backend; tiles batem com a timeline visível; "Ao vivo" atualiza sozinho e para ao desligar.
6. Checklist de qualidade do CLAUDE.md (sem dead code, sem console.log, imports limpos, a11y preservada — SegTabs/Radix, labels em ícones).
