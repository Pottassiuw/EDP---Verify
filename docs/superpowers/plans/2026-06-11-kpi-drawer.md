# Drawer Flutuante de KPIs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a faixa de KPIs do topo do dashboard de triagem por um drawer overlay à direita, aberto por um botão flutuante com badge de conformidade.

**Architecture:** Novo componente apresentacional `KpiDrawer` (FAB + painel, estado aberto/fechado interno) renderizado pelo `Dashboard`, que continua calculando as contagens. A faixa de KPIs atual é removida; o tweak `showKpis` passa a esconder/mostrar o FAB. Posicionamento via `position: fixed`, seguindo o padrão do codebase de estilos inline + blocos `<style>`.

**Tech Stack:** React 18 + TypeScript + Vite. Sem framework de testes no projeto — conforme o spec (`docs/superpowers/specs/2026-06-11-kpi-drawer-design.md`), a verificação é build TypeScript limpo + checagem visual manual.

**Spec:** `docs/superpowers/specs/2026-06-11-kpi-drawer-design.md`

---

### Task 1: Componente `KpiDrawer`

**Files:**
- Modify: `frontend/src/types.ts` (seção "Props dos componentes", após `CoffeeSectionProps`, ~linha 149)
- Create: `frontend/src/components/kpi-drawer.tsx`

- [ ] **Step 1: Adicionar `KpiDrawerProps` em `types.ts`**

Inserir após a interface `CoffeeSectionProps` (que termina na linha 149):

```ts
export interface KpiDrawerProps {
  pct: number;      // conformidade %
  cTotal: number;   // total de notas
  cOk: number;      // notas sem falha
  cErr: number;     // notas com erro
  cDup: number;     // notas com duplicatas
  cDone: number;    // notas concluídas
  cVisible: number; // notas visíveis no filtro atual
}
```

- [ ] **Step 2: Criar `frontend/src/components/kpi-drawer.tsx`**

Conteúdo completo do arquivo:

```tsx
import React from 'react';
import type { KpiDrawerProps } from '../types';

export function KpiDrawer(props: KpiDrawerProps): React.JSX.Element {
  const { pct, cTotal, cOk, cErr, cDup, cDone, cVisible } = props;
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const rows: Array<[string, number, string]> = [
    ["Com erro", cErr, "red"], ["Duplicatas", cDup, "indigo"],
    ["Visíveis (filtro atual)", cVisible, "blue"], ["Concluídas", cDone, "green"],
  ];

  return (
    <React.Fragment>
      <style>{`@keyframes kpi-slide-in{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
      {!open && (
        <button onClick={() => setOpen(true)} title="Indicadores" aria-label="Abrir indicadores"
                style={{ position: "fixed", right: 18, bottom: 18, zIndex: 40, display: "flex", alignItems: "center", gap: 8,
                         padding: "10px 16px", border: 0, borderRadius: 999, cursor: "pointer",
                         background: "var(--accent)", color: "#fff", fontFamily: "var(--font-display)",
                         fontWeight: 800, fontSize: 14, boxShadow: "0 4px 14px rgba(0,0,0,.35)" }}>
          <span style={{ fontSize: 15, lineHeight: 1 }}>⊞</span>{pct}%
        </button>
      )}
      {open && (
        <React.Fragment>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 41 }} />
          <aside style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 320, zIndex: 42,
                          background: "var(--surface)", borderLeft: "2px solid var(--accent)",
                          boxShadow: "-8px 0 24px rgba(0,0,0,.3)", display: "flex", flexDirection: "column",
                          padding: "16px 18px", gap: 12, animation: "kpi-slide-in .2s ease-out" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="edp-eyebrow">Indicadores</span>
              <button onClick={() => setOpen(false)} title="Fechar" aria-label="Fechar indicadores"
                      style={{ all: "unset", cursor: "pointer", fontSize: 18, lineHeight: 1, color: "var(--text-mute)", padding: "2px 6px" }}>×</button>
            </div>
            <div style={{ background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: "12px 14px" }}>
              <div className="edp-eyebrow">Conformidade</div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 30, lineHeight: 1.2, color: "var(--accent)" }}>{pct}%</div>
              <div style={{ height: 6, borderRadius: 999, background: "var(--surface-3)", overflow: "hidden", margin: "8px 0 6px" }}>
                <div style={{ width: pct + "%", height: "100%", background: "var(--accent)", borderRadius: 999 }} />
              </div>
              <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>{cOk}/{cTotal} prontas para o SAP</span>
            </div>
            {rows.map(([lbl, val, c]) => (
              <div key={lbl} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                                      background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: "10px 14px" }}>
                <span className="edp-eyebrow">{lbl}</span>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, lineHeight: 1, color: "var(--" + c + ")" }}>{val}</span>
              </div>
            ))}
          </aside>
        </React.Fragment>
      )}
    </React.Fragment>
  );
}
```

Notas de fidelidade ao codebase: classes `edp-eyebrow`/`edp-mono` e as variáveis CSS (`--accent`, `--surface`, `--red`, `--indigo`, `--blue`, `--green`, `--r-sm`) já existem no tema global e são usadas pelo `dashboard.tsx` da mesma forma.

- [ ] **Step 3: Verificar que o build passa**

Run (PowerShell, a partir da raiz do repo): `cd frontend; npm run build`
Expected: `tsc -b` sem erros e `vite build` concluído ("✓ built in …"). O componente ainda não é usado — só não pode quebrar o build.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/components/kpi-drawer.tsx
git commit -m "feat: adiciona componente KpiDrawer (FAB + drawer de indicadores)"
```

---

### Task 2: Integrar no Dashboard e remover a faixa de KPIs

**Files:**
- Modify: `frontend/src/components/dashboard.tsx:1-5` (imports), `:112-133` (faixa de KPIs), `:279-281` (fim do Fragment)

- [ ] **Step 1: Importar o componente**

Em `dashboard.tsx`, adicionar ao bloco de imports (após a linha 5, `import { DuplicateCompare } …`):

```tsx
import { KpiDrawer } from './kpi-drawer';
```

- [ ] **Step 2: Remover a faixa de KPIs do topo**

Apagar o bloco inteiro das linhas 112–133 — começa com `{t.showKpis && (` seguido de `<div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 20, …` e contém os textos "Conformidade", "Com erro", "Duplicatas", "Visíveis", "Concluídas". Termina com `)}` logo antes do `<div style={{ flexShrink: 0, background: "var(--surface)", borderBottom: …` da barra de filtros.

**Não** remover os cálculos `cTotal`, `cErr`, `cOk`, `cDone`, `cDup`, `pct` (linhas 66–71) — eles passam a alimentar o drawer.

- [ ] **Step 3: Renderizar o drawer**

No final do JSX do `Dashboard`, logo após o `</div>` que fecha o grid fila/detalhe e antes de `</React.Fragment>` (atualmente linhas 281–282):

```tsx
      {t.showKpis && (
        <KpiDrawer pct={pct} cTotal={cTotal} cOk={cOk} cErr={cErr} cDup={cDup}
                   cDone={cDone} cVisible={filtered.length} />
      )}
```

O tweak "Mostrar indicadores (KPIs)" em `App.tsx` não muda — ele continua escrevendo em `t.showKpis`, que agora esconde/mostra o FAB.

- [ ] **Step 4: Verificar que o build passa**

Run: `cd frontend; npm run build`
Expected: sem erros de TypeScript (atenção a variáveis órfãs: se `tsc` acusar variável não usada após a remoção, o Step 2 removeu demais ou de menos).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard.tsx
git commit -m "feat: substitui faixa de KPIs pelo drawer flutuante"
```

---

### Task 3: Verificação visual manual

**Files:** nenhum (verificação).

- [ ] **Step 1: Subir o dev server**

Run: `cd frontend; npm run dev`
Abrir `http://localhost:5173` e carregar os dados de demonstração (botão de demo na tela de upload).

- [ ] **Step 2: Checklist visual**

Conferir cada item (os números de referência vêm dos dados de demo):

1. A faixa de KPIs **não** aparece mais no topo; a barra de filtros é a primeira faixa abaixo do TopBar.
2. FAB no canto inferior direito mostrando "⊞ NN%" com a mesma porcentagem que a faixa antiga mostrava.
3. Clicar no FAB: drawer desliza da direita, FAB some. Conferir Conformidade (percentual + barra + "X/Y prontas para o SAP") e as quatro linhas (Com erro, Duplicatas, Visíveis, Concluídas) com os mesmos números de antes.
4. Filtrar a fila (ex.: UF) com o drawer aberto: "Visíveis (filtro atual)" acompanha o filtro.
5. Fechar por cada um dos três caminhos: botão ×, clique fora do painel, tecla Esc.
6. Abrir o painel de Tweaks e desligar "Mostrar indicadores (KPIs)": FAB some; religar: FAB volta.
7. Repetir checagem rápida (itens 2–3) no tema claro e na densidade compact.
8. Ir para a seção COFFEE: nenhum FAB/drawer lá.

- [ ] **Step 3: Corrigir e commitar ajustes visuais (se houver)**

Se algum item falhar, ajustar `kpi-drawer.tsx`/`dashboard.tsx` e commitar:

```bash
git add frontend/src/components/kpi-drawer.tsx frontend/src/components/dashboard.tsx
git commit -m "fix: ajustes visuais do drawer de KPIs"
```
