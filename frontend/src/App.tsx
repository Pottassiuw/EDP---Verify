import React from 'react';
import { normalizeCoffeeSubPage, normalizeRelatoriosPage } from './types';
import type {
  AppSection,
  CarteiraSubPage,
  CoffeeConclusaoFiltro,
  CoffeeSubPage,
  Note,
  RelatoriosPage,
  Source,
} from './types';
import type { AbaInput } from './features/input/types';
import type { FiltersState } from './features/input/filters';
import { filtroPorMes, filtroPorPlano, type Filtro } from './features/input/lib';
import type { TriageHandoff } from './features/coffee/coffee-verificar';
import { usePersistedState } from './hooks/use-persisted-state';
import { SettingsProvider, useSettings } from './context/settings-context';
import { EDPApi } from './api';
import { AppSidebar } from './components/app-sidebar';
import { useTriageData } from './features/verificar/useTriageData';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { toast, Toaster } from 'sonner';

const InputSection = React.lazy(() =>
  import('./features/input/input-section').then((m) => ({ default: m.InputSection })));
const CoffeeHub = React.lazy(() =>
  import('./features/coffee/coffee-hub').then((m) => ({ default: m.CoffeeHub })));
const ConfiguracoesPage = React.lazy(() =>
  import('./features/configuracoes/configuracoes').then((m) => ({ default: m.ConfiguracoesPage })));
const RelatoriosSection = React.lazy(() =>
  import('./features/relatorios/relatorios-section').then((m) => ({ default: m.RelatoriosSection })));
const CarteiraSection = React.lazy(() =>
  import('./features/carteira/carteira-section').then((m) => ({ default: m.CarteiraSection })));

type CssVars = React.CSSProperties & Record<`--${string}`, string>;

const VERIFY_FILTER_KEYS = [
  "edp_verify_q", "edp_verify_uf", "edp_verify_setor", "edp_verify_urg",
  "edp_verify_status", "edp_verify_situacao", "edp_verify_rules", "edp_verify_sel",
];
function limparFiltrosVerify(): void {
  try { VERIFY_FILTER_KEYS.forEach((k) => sessionStorage.removeItem(k)); } catch { /* ignore */ }
}

const TRIAGE_SNAPSHOT_KEY = "edp_triage_snapshot";
const NUMERIC_ID_RE = /^\d{5,12}$/;

interface TriageSnapshot {
  notes: Note[];
  completed: string[];
  dupResolved: string[];
  file: string;
  source: Source;
  screen: "upload" | "dashboard";
}

function lerSnapshot(): TriageSnapshot | null {
  try {
    const raw = sessionStorage.getItem(TRIAGE_SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as TriageSnapshot) : null;
  } catch { return null; }
}
function gravarSnapshot(s: TriageSnapshot): void {
  try { sessionStorage.setItem(TRIAGE_SNAPSHOT_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
function limparSnapshot(): void {
  try { sessionStorage.removeItem(TRIAGE_SNAPSHOT_KEY); } catch { /* ignore */ }
}

function SectionLoading(): React.JSX.Element {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--text-mute)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
      Carregando…
    </div>
  );
}

function AppContent(): React.JSX.Element {
  const { settings, resolvedTheme } = useSettings();
  const _snap = React.useMemo(() => lerSnapshot(), []);
  const [screen, setScreen] = React.useState<"upload" | "dashboard">(_snap?.screen ?? "upload");
  const [notes, setNotes] = React.useState<Note[]>(_snap?.notes ?? []);
  const [completed, setCompleted] = React.useState<Set<string>>(() => new Set(_snap?.completed ?? []));
  const [dupResolved, setDupResolved] = React.useState<Set<string>>(() => new Set(_snap?.dupResolved ?? []));
  const [file, setFile] = React.useState(_snap?.file ?? "");
  const [source, setSource] = React.useState<Source>(_snap?.source ?? "api");
  const [section, setSection] = usePersistedState<AppSection>("edp_active_section", "relatorios");
  const [storedRelatoriosPage, setStoredRelatoriosPage] =
    usePersistedState<string>("edp_relatorios_page", "dashboard");
  const relatoriosPage = normalizeRelatoriosPage(storedRelatoriosPage);
  const setRelatoriosPage = React.useCallback(
    (page: RelatoriosPage): void => setStoredRelatoriosPage(page),
    [setStoredRelatoriosPage],
  );
  const [coffeeReturn, setCoffeeReturn] = React.useState<{ noteId: string; noteRef: string } | null>(null);
  const [storedCoffeeSub, setStoredCoffeeSub] =
    usePersistedState<string>("edp_coffee_sub", "verificar");
  const coffeeSub = normalizeCoffeeSubPage(storedCoffeeSub);
  const setCoffeeSub = React.useCallback(
    (sub: CoffeeSubPage): void => setStoredCoffeeSub(sub),
    [setStoredCoffeeSub],
  );
  const [coffeeConcluidasHandoff, setCoffeeConcluidasHandoff] =
    React.useState<{ filtro: CoffeeConclusaoFiltro; id: number } | null>(null);
  const [inputSub, setInputSub] = usePersistedState<AbaInput>("edp_input_sub", "visao");
  const [carteiraSub, setCarteiraSub] = usePersistedState<CarteiraSubPage>("edp_carteira_sub", "dashboard");
  const [filtrosHandoff, setFiltrosHandoff] =
    React.useState<{ estado: FiltersState; id: number } | null>(null);

  function irParaInputFiltrado(filtros: Filtro[]): void {
    setFiltrosHandoff((prev) => ({
      estado: { busca: "", filtros, somente2026: true, somenteNotasMaes: false },
      id: (prev?.id ?? 0) + 1,
    }));
    setInputSub("visao");
    changeSection("input");
  }

  const accentStyle: CssVars = {
    "--accent": settings.accent[0],
    "--accent-2": settings.accent[1],
    "--accent-tint": settings.accent[2],
  };

  React.useEffect(() => {
    if (screen !== "dashboard" || notes.length === 0) return;
    gravarSnapshot({ notes, completed: [...completed], dupResolved: [...dupResolved], file, source, screen });
  }, [notes, completed, dupResolved, file, source, screen]);

  React.useEffect(() => {
    if (storedCoffeeSub !== coffeeSub) setStoredCoffeeSub(coffeeSub);
  }, [coffeeSub, setStoredCoffeeSub, storedCoffeeSub]);

  React.useEffect(() => {
    if (storedRelatoriosPage !== relatoriosPage) setStoredRelatoriosPage(relatoriosPage);
  }, [relatoriosPage, setStoredRelatoriosPage, storedRelatoriosPage]);

  function changeSection(s: AppSection): void {
    if (s !== "coffee") setCoffeeReturn(null);
    setSection(s);
  }

  function irParaSincronizacaoCarteira(): void {
    setCarteiraSub("sincronizacao");
    changeSection("carteira");
  }

  const { data: apiData } = useTriageData();
  // A hidratação da triagem vale uma vez por sessão. Sem a trava, um refetch
  // do React Query devolve as notas do backend e joga o usuário de volta ao
  // dashboard logo depois de ele pedir "↑ Nova" para importar outra planilha.
  const triagemHidratada = React.useRef(false);

  React.useEffect(() => {
    if (_snap || triagemHidratada.current) return;
    if (!apiData?.notes?.length || screen !== "upload") return;
    triagemHidratada.current = true;
    setNotes(apiData.notes);
    setCompleted(apiData.completed);
    setSource("api");
    setFile(localStorage.getItem("edp_file") ?? "planilha carregada");
    setScreen("dashboard");
  }, [apiData]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUpload(f: File): Promise<void> {
    triagemHidratada.current = true;
    limparFiltrosVerify();
    limparSnapshot();
    const p = (async () => { await EDPApi.upload(f); return EDPApi.fetchData(); })();
    toast.promise(p, {
      loading: "Enviando planilha…",
      success: "Planilha carregada",
      error: (e) => `Falha no upload: ${e instanceof Error ? e.message : String(e)}`,
    });
    try {
      const d = await p;
      setNotes(d.notes); setCompleted(d.completed); setSource("api");
      setFile(f.name); localStorage.setItem("edp_file", f.name);
      setScreen("dashboard");
    } catch { /* toast já informou o erro */ }
  }

  function toggleComplete(id: string): void {
    const reopening = completed.has(id);
    const concluding = !reopening;
    setCompleted((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
    if (reopening) setDupResolved((prev) => { const s = new Set(prev); s.delete(id); return s; });

    const numeric = NUMERIC_ID_RE.test(id);
    const willGenerate = source === "api" && numeric;
    if (source === "api") {
      EDPApi.toggleComplete(id).catch((e) => toast.error("Falha ao atualizar nota", { description: e instanceof Error ? e.message : String(e) }));
      if (numeric) EDPApi.marcarGerar(id, concluding, concluding ? undefined : "Nota reaberta na Verificar")
        .catch((e) => toast.error(concluding ? "Falha ao marcar para gerar" : "Falha ao tirar da fila de geração", { description: e instanceof Error ? e.message : String(e) }));
    }
    toast.success(
      concluding ? `Nota ${id} concluída` : `Nota ${id} reaberta`,
      { description: willGenerate ? (concluding ? "Marcada para gerar" : "Desmarcada para gerar") : undefined },
    );
  }

  function markMany(ids: string[], action: "done" | "reopen"): void {
    const marking = action === "done";
    const targets = ids.filter((id) => completed.has(id) !== marking);
    setCompleted((prev) => {
      const s = new Set(prev);
      targets.forEach((id) => { if (marking) s.add(id); else s.delete(id); });
      return s;
    });
    const numericTargets = targets.filter((id) => NUMERIC_ID_RE.test(id));
    if (source === "api") {
      targets.forEach((id) => EDPApi.toggleComplete(id).catch((e) => toast.error("Falha ao atualizar nota", { description: e instanceof Error ? e.message : String(e) })));
      numericTargets.forEach((id) => EDPApi.marcarGerar(id, marking, marking ? undefined : "Nota reaberta na Verificar")
        .catch((e) => toast.error(marking ? "Falha ao marcar para gerar" : "Falha ao tirar da fila de geração", { description: e instanceof Error ? e.message : String(e) })));
    }
    if (targets.length === 0) return;
    const gerarInfo = source === "api" && numericTargets.length > 0
      ? `${numericTargets.length} ${marking ? "marcada(s) para gerar" : "desmarcada(s)"}`
      : undefined;
    toast.success(`${targets.length} nota(s) ${marking ? "concluída(s)" : "reaberta(s)"}`, { description: gerarInfo });
  }

  function sendToCoffeeQueue(ids: string[], sourceId?: string): void {
    const existing = JSON.parse(localStorage.getItem("edp_coffee_ids") ?? "[]") as string[];
    const valid = ids.filter((id) => NUMERIC_ID_RE.test(id));
    const merged = [...new Set([...existing, ...valid])];
    localStorage.setItem("edp_coffee_ids", JSON.stringify(merged));
    if (sourceId) {
      const src = notes.find((n) => n.id === sourceId);
      setCoffeeReturn(src ? { noteId: src.id, noteRef: src.referencia } : null);
    }
    setCoffeeSub("abrir");
    setSection("coffee");
    if (valid.length > 0) toast.success(`${valid.length} nota(s) enviada(s) para a fila do COFFEE`);
  }

  function markDuplicate(id: string): void {
    const undo = dupResolved.has(id);
    setDupResolved((prev) => { const s = new Set(prev); if (undo) s.delete(id); else s.add(id); return s; });
    setCompleted((prev) => { const s = new Set(prev); if (undo) s.delete(id); else s.add(id); return s; });
    if (source === "api") {
      if (undo) EDPApi.toggleComplete(id).catch((e) => toast.error("Falha ao desfazer duplicata", { description: e instanceof Error ? e.message : String(e) }));
      else EDPApi.markDuplicate(id).catch((e) => toast.error("Falha ao marcar duplicata", { description: e instanceof Error ? e.message : String(e) }));
    }
    toast.success(undo ? "Duplicata desfeita" : "Nota marcada como duplicata");
  }

  const triage: TriageHandoff = {
    resolvedTheme,
    showKpis: settings.showKpis,
    notes, completed, dupResolved, source, file, screen,
    onToggleComplete: toggleComplete,
    onMarkMany: markMany,
    onMarkDuplicate: markDuplicate,
    onSendToCoffee: sendToCoffeeQueue,
    onUpload: handleUpload,
    onReset: () => { setCoffeeReturn(null); limparSnapshot(); setScreen("upload"); },
  };

  return (
    <div className="triage" data-theme={resolvedTheme} data-density={settings.density}
         style={{ height: "100vh", overflow: "hidden", background: "var(--bg)", ...accentStyle } as CssVars}>
      <SidebarProvider style={{ height: "100%", minHeight: 0 }}>
        <AppSidebar section={section} setSection={changeSection}
                    relatoriosPage={relatoriosPage} setRelatoriosPage={setRelatoriosPage}
                    coffeeSub={coffeeSub} setCoffeeSub={setCoffeeSub}
                    inputSub={inputSub} setInputSub={setInputSub}
                    carteiraSub={carteiraSub} setCarteiraSub={setCarteiraSub} />
        <SidebarInset style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <React.Suspense fallback={<SectionLoading />}>
            {section === "relatorios" ? (
              <RelatoriosSection
                page={relatoriosPage}
                setPage={setRelatoriosPage}
                onVerNotasDoMes={(mes, ano) => irParaInputFiltrado([filtroPorMes(mes, ano)])}
                onVerPlano={(plano, regional) => irParaInputFiltrado(filtroPorPlano(plano, regional))}
                onIrParaCoffee={() => {
                  setCoffeeConcluidasHandoff((prev) => ({
                    filtro: "corrigida",
                    id: (prev?.id ?? 0) + 1,
                  }));
                  setCoffeeSub("concluidas");
                  changeSection("coffee");
                }}
              />
            ) : section === "input" ? (
              <InputSection
                sub={inputSub}
                setSub={setInputSub}
                filtrosHandoff={filtrosHandoff}
                onIrParaSincronizacao={irParaSincronizacaoCarteira}
              />
            ) : section === "carteira" ? (
              <CarteiraSection sub={carteiraSub} setSub={setCarteiraSub} />
            ) : section === "configuracoes" ? <ConfiguracoesPage /> :
             <CoffeeHub notes={notes}
                        sub={coffeeSub} setSub={setCoffeeSub}
                        triage={triage}
                        coffeeReturn={coffeeReturn}
                        concluidasHandoff={coffeeConcluidasHandoff}
                        onIrParaInput={() => {
                          setInputSub("visao");
                          changeSection("input");
                        }}
                        onIrParaSincronizacao={irParaSincronizacaoCarteira}
                        onClearReturn={() => setCoffeeReturn(null)}
                        onBackToTriagem={() => { setCoffeeSub("verificar"); }} />}
          </React.Suspense>
        </SidebarInset>
      </SidebarProvider>
      <Toaster theme={resolvedTheme} position="bottom-right" richColors closeButton />
    </div>
  );
}

export default function App(): React.JSX.Element {
  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  );
}
