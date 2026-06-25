# Spec — Performance e persistência de estado

**Data:** 2026-06-18
**Status:** Aprovado para implementação

## Problema

Quatro incômodos no uso diário do EDP-Verify, todos independentes entre si:

1. **Tela branca ao abrir o app.** O first paint demora vários segundos. O frontend é um bundle único (`dist/assets/index-*.js`, ~295 KB) sem code-splitting: o navegador baixa e parseia o app inteiro — incluindo o módulo Input (~1.850 linhas) — antes de pintar a primeira tela, mesmo quando o usuário só quer o Verify. O backend serve o `dist/` via `StaticFiles`, **sem compressão**, então os 295 KB trafegam crus (agravado quando o app roda a partir de pasta de rede).

2. **COFFEE preso atrás da planilha do Verify.** A seção COFFEE só renderiza quando `screen === "dashboard"` (`App.tsx`), estado que exige carregar uma planilha do Verify (upload ou demo). Antes disso, clicar em COFFEE cai na `UploadScreen`. Porém o COFFEE não precisa da planilha: os IDs vêm do `localStorage` e da digitação manual; os `notes` só enriquecem os chips com tipo/referência (e já há o fallback "Fora da planilha carregada").

3. **Filtros do Verify se perdem ao trocar de seção.** O `Dashboard` guarda `q, uf, setor, urg, status, situacao, rules` como `useState` interno. Ao navegar para COFFEE/Input, o `App` desmonta o `Dashboard` e o estado é perdido; ao voltar, remonta zerado. Quem tinha uma busca/filtragem trabalhosa perde tudo.

4. **Carregamento lento e aparentemente sem cache no Input.** A página Input parece recarregar do zero. O react-query já cacheia (`staleTime: 60s`, `gcTime` padrão de 5 min), mas com `staleTime` de 60s, voltar à seção após 1 min dispara um refetch que bate no endpoint lento. O custo real é o backend lendo Excels da rede a cada `enriquecer_dados()` — fora do escopo reescrever isso agora.

## Soluções

### 1. First paint: code-splitting + compressão

**Frontend — code-splitting.** Carregar `InputSection` e `CoffeeSection` via `React.lazy` + `Suspense`, tirando-os do bundle crítico. O caminho de quem abre no Verify deixa de pagar pelo módulo Input.

- Em `App.tsx`, trocar os imports estáticos de `InputSection` e `CoffeeSection` por `React.lazy(() => import(...))`.
- Cada um vira um named export adaptado para default import (ou wrapper `.then(m => ({ default: m.X }))`), conforme o tipo de export atual de cada arquivo.
- Envolver os pontos de render dessas seções em `<React.Suspense fallback={<...>}>`. O fallback é um placeholder leve e neutro (ex.: um `div` centralizado com o texto "Carregando…" no estilo do app), não um spinner novo de biblioteca.

**Backend — compressão.** Adicionar `GZipMiddleware` ao FastAPI (`backend/main.py`), com `minimum_size` em torno de 500–1000 bytes, antes do mount estático. Reduz os ~295 KB para ~90 KB na transferência.

### 2. COFFEE independente da planilha

No `App.tsx`, tratar `section === "coffee"` como `section === "input"` já é tratado: render direto, sem depender de `screen`. A ordem de decisão de render passa a ser:

1. `section === "input"` → `InputSection`
2. `section === "coffee"` → `CoffeeSection` (sempre acessível)
3. caso contrário → fluxo `upload`/`dashboard` (Verify)

A faixa "voltar à triagem" (`coffeeReturn`) e o `TopBar` continuam aparecendo no COFFEE **apenas quando** há uma planilha carregada (`screen === "dashboard"`); sem planilha, o COFFEE renderiza sozinho. Os `notes` continuam sendo passados ao `CoffeeSection` e enriquecem os chips quando existem; quando a lista está vazia, o comportamento atual de exibir só o ID é mantido.

### 3. Filtros do Verify persistentes (`sessionStorage`)

Persistir o estado de filtros do `Dashboard` em `sessionStorage` por meio de um hook reutilizável `usePersistedState`. Característica do `sessionStorage`: sobrevive a trocar de seção **e** a um reload da aba, mas zera ao fechar a aba/abrir nova sessão — o meio-termo desejado (não perder o filtro do momento, sem filtros "fantasma" dias depois).

- Novo hook (ex.: `frontend/src/hooks/use-persisted-state.ts`): assinatura no estilo `useState`, lendo/gravando uma chave em `sessionStorage`, com `try/catch` defensivo (igual ao padrão já usado com `localStorage` no projeto) e serialização JSON.
- Aplicar aos sete filtros do `Dashboard`: `q`, `uf`, `setor`, `urg`, `status`, `situacao`, `rules` (este último é `Set<RuleKey>`, então serializa como array). Chaves prefixadas, ex.: `edp_verify_filtros`.
- **Reset em nova planilha:** ao carregar uma planilha nova (upload ou demo), as opções de UF/Setor mudam e os filtros antigos podem não fazer sentido. Limpar o estado persistido nesse momento. Mecanismo: o `App` já sabe quando uma planilha nova entra (`handleUpload`, `loadDemo`); a limpeza pode ser uma remoção da chave de `sessionStorage` disparada nesses pontos, ou um identificador de planilha (nome do arquivo) guardado junto e comparado na hidratação — a implementação escolhe o mais simples que garanta o reset.
- `selBatch`, `selId`, `queueCollapsed` **não** entram nesta persistência: seleção de lote e nota ativa são efêmeras; `queueCollapsed` já persiste em `localStorage` e continua como está.

### 4. Cache do Input

Subir o `staleTime` de `useInputData` (`frontend/src/input/use-input-data.ts`) de `60_000` para `300_000` (5 min), alinhando ao `gcTime` padrão. Efeito: trocar de seção e voltar dentro de 5 min **não** dispara refetch — os dados vêm do cache instantaneamente. A atualização continua acontecendo por dois caminhos já existentes: o botão "Recarregar" (`useRecarregarInput`) e o aviso de sincronização via polling de `/sync` (`useAvisoSincronizacao`), que detecta alterações de outros usuários. Nenhuma mudança no backend.

## Componentes

| Arquivo | Mudança |
|---|---|
| `frontend/src/App.tsx` | Imports lazy de `InputSection`/`CoffeeSection`; `Suspense`; render de `coffee` independente de `screen`; reset dos filtros persistidos em `handleUpload`/`loadDemo`. |
| `frontend/src/components/dashboard.tsx` | Sete filtros migram de `useState` para `usePersistedState`. |
| `frontend/src/hooks/use-persisted-state.ts` | **Novo.** Hook `useState`-like sobre `sessionStorage`. |
| `frontend/src/input/use-input-data.ts` | `staleTime` 60s → 5 min. |
| `backend/main.py` | `GZipMiddleware`. |

## Inalterado

- Backend do módulo Input (`backend/input_module/*`) e o cache do `engine` (600 s).
- Lógica de filtragem/ordenação do `Dashboard` (só a *fonte* do estado muda).
- Mecânica do COFFEE (IDs, modos de abertura, persistência em `localStorage`).
- `KpiDrawer`, `tweaks-panel`, sidebar.

## Verificação

O projeto não tem testes de frontend; o backend usa pytest.

1. **Build limpo:** `cd frontend; npm run build` (`tsc -b` + `vite build`) — conferir que o output agora gera **chunks separados** para Input/COFFEE (vários `assets/*.js` em vez de um só).
2. **Backend:** `cd backend; python -m pytest test_input_module.py test_upload.py -v` — regressão (GZip não pode quebrar rotas/estáticos).
3. **Verificação manual:**
   - First paint: abrir o app; a tela inicial aparece antes de o módulo Input carregar; no DevTools → Network, o JS principal vem `Content-Encoding: gzip` e há chunk(s) carregados sob demanda ao entrar no Input/COFFEE.
   - COFFEE sem planilha: recarregar o app sem fazer upload nem demo, clicar em COFFEE → a seção abre e permite adicionar/abrir IDs.
   - Filtros: no Verify, aplicar busca + UF + um bloqueio; ir ao COFFEE e voltar → filtros intactos; recarregar a aba → ainda intactos; carregar nova planilha (ou demo) → filtros zerados.
   - Cache Input: entrar no Input (1ª carga lenta esperada), sair e voltar em < 5 min → instantâneo, sem refetch (conferir na aba Network).

## Fora de escopo

- Reescrever o backend do Input para separar payload rápido (banco) do lento (rede).
- Otimizar a leitura dos Excels da rede ou o cache do servidor.
- Persistir seleção de lote, nota ativa ou estado entre sessões diferentes do navegador (`localStorage`).
- Lazy-loading de outras seções além de Input e COFFEE.
