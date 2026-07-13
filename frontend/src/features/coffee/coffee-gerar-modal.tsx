import React from 'react';
import type { CoffeeJob } from './types';
import { EDPApi, BASE } from '../../api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, Pencil, RefreshCw, Trash2, X } from 'lucide-react';

// ponytail: máscara 3-2-resto; aperta a regra se o formato do local for fixo
function maskLocal(v: string): string {
  const c = v.toUpperCase().replace(/[^0-9A-Z]/g, "");
  const a = c.slice(0, 3), b = c.slice(3, 5), rest = c.slice(5);
  return [a, b, rest].filter(Boolean).join("-");
}
function unmaskLocal(v: string): string {
  return v.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

const STORAGE_ROWS = "edp_coffee_gerar_rows";
function lerRows(): Row[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_ROWS);
    return raw ? (JSON.parse(raw) as Row[]) : [];
  } catch { return []; }
}
function gravarRows(rows: Row[]): void {
  try { sessionStorage.setItem(STORAGE_ROWS, JSON.stringify(rows)); } catch { /* ignore */ }
}

interface Row {
  id: number;
  estado: "consultando" | "ok" | "erro";
  pk?: number;
  idSap?: number | null;
  classificacao?: string;
  arquivado?: boolean | null;
  localAtual?: string;          // sem máscara (como veio do backend)
  localEditado?: string;        // mascarado, no input
  salvandoLocal?: boolean;
  editando?: boolean;
  erro?: string;
}

function parseIds(texto: string): number[] {
  return [...new Set(
    texto.split(/[\s,;]+/).map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
  )];
}

const STATUS_COR: Record<string, string> = {
  gerada: "var(--green)", corrigida: "var(--blue)",
  pendente: "var(--amber)", nao_gerada: "var(--text-mute)",
};

const TH_STICK: React.CSSProperties = { position: "sticky", top: 0, zIndex: 1 };

export function CoffeeGerarModal({ open, idsIniciais, onClose, onChanged }: {
  open: boolean;
  idsIniciais?: number[];
  onClose: () => void;
  onChanged: () => void;
}): React.JSX.Element | null {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [input, setInput] = React.useState("");
  const [gerando, setGerando] = React.useState<{ rodando: boolean; feitas: number; total: number }>(
    { rodando: false, feitas: 0, total: 0 });

  const consultar = React.useCallback((id: number): void => {
    setRows((rs) => rs.some((r) => r.id === id)
      ? rs.map((r) => r.id === id ? { ...r, estado: "consultando", erro: undefined } : r)
      : [...rs, { id, estado: "consultando" }]);
    EDPApi.consultarNota(id)
      .then((c) => setRows((rs) => rs.map((r) => r.id === id ? {
        ...r, estado: "ok", pk: c.pk, idSap: c.id_sap, classificacao: c.classificacao,
        arquivado: c.arquivado,
        localAtual: c.local_instalacao ?? "",
        localEditado: c.local_instalacao ? maskLocal(c.local_instalacao) : "",
      } : r)))
      .catch((e: unknown) => setRows((rs) => rs.map((r) => r.id === id ? {
        ...r, estado: "erro", erro: e instanceof Error ? e.message : String(e),
      } : r)));
  }, []);

  // Ao abrir: hidrata da sessão, re-consulta linhas interrompidas e soma a fila.
  React.useEffect(() => {
    if (!open) return;
    setInput(""); setGerando({ rodando: false, feitas: 0, total: 0 });
    const salvas = lerRows().map((r) => ({ ...r, salvandoLocal: false }));
    setRows(salvas);
    salvas.filter((r) => r.estado === "consultando").forEach((r) => consultar(r.id));
    const existentes = new Set(salvas.map((r) => r.id));
    (idsIniciais ?? []).filter((id) => !existentes.has(id)).forEach(consultar);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persiste a lista em sessão a cada mudança (enquanto o modal está aberto).
  React.useEffect(() => {
    if (open) gravarRows(rows);
  }, [rows, open]);

  function adicionar(): void {
    parseIds(input).forEach(consultar);
    setInput("");
  }

  function reconsultarTodas(): void {
    rows.forEach((r) => consultar(r.id));
    toast.info("Reconsultando notas…");
  }

  function removerLinha(id: number): void {
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  function limpar(): void {
    setRows([]);
    try { sessionStorage.removeItem(STORAGE_ROWS); } catch { /* ignore */ }
  }

  function iniciarEdicao(row: Row): void {
    setRows((rs) => rs.map((r) => r.id === row.id
      ? { ...r, editando: true, localEditado: r.localAtual ? maskLocal(r.localAtual) : "" }
      : r));
  }

  function cancelarEdicao(id: number): void {
    setRows((rs) => rs.map((r) => r.id === id
      ? { ...r, editando: false, localEditado: r.localAtual ? maskLocal(r.localAtual) : "" }
      : r));
  }

  function salvarLocal(row: Row): void {
    const local = unmaskLocal(row.localEditado ?? "");
    setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, salvandoLocal: true } : r));
    fetch(`${BASE}/coffee/local-instalacao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, local }),
    })
      .then((res) => { if (!res.ok) throw new Error(`POST /local-instalacao -> ${res.status}`); })
      .then(() => {
        setRows((rs) => rs.map((r) => r.id === row.id
          ? { ...r, salvandoLocal: false, editando: false, localAtual: local } : r));
        toast.success("Local de instalação atualizado");
      })
      .catch((e: unknown) => {
        setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, salvandoLocal: false } : r));
        toast.error("Falha ao salvar local", { description: e instanceof Error ? e.message : String(e) });
      });
  }

  function pollJob(jobId: string): Promise<CoffeeJob> {
    return new Promise<CoffeeJob>((resolve, reject) => {
      let falhas = 0;
      const tick = (): void => {
        fetch(`${BASE}/coffee/job/${jobId}`, { headers: { Accept: "application/json" } })
          .then((r) => { if (!r.ok) throw new Error(`GET /job -> ${r.status}`); return r.json(); })
          .then((j: CoffeeJob) => {
            falhas = 0;
            setGerando({ rodando: true, feitas: j.feitas, total: j.total });
            if (j.estado === "concluido") resolve(j);
            else window.setTimeout(tick, 600);
          })
          .catch((e: unknown) => {
            if (++falhas >= 10) reject(e instanceof Error ? e : new Error(String(e)));
            else window.setTimeout(tick, 600);
          });
      };
      tick();
    });
  }

  function gerar(): void {
    const ids = rows.filter((r) => r.estado === "ok").map((r) => r.id);
    if (ids.length === 0) { toast.info("Nenhuma nota consultada para gerar"); return; }
    setGerando({ rodando: true, feitas: 0, total: ids.length });
    fetch(`${BASE}/coffee/gerar-lote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, justificativa: null }),
    })
      .then((res) => { if (!res.ok) throw new Error(`POST /gerar-lote -> ${res.status}`); return res.json(); })
      .then((data: { job_id: string }) => pollJob(data.job_id))
      .then((job: CoffeeJob) => {
        setGerando({ rodando: false, feitas: 0, total: 0 });
        rows.forEach((r) => consultar(r.id));
        onChanged();
        const nErros = job.erros?.length ?? 0;
        const nArq = job.arquivadas?.length ?? 0;
        if (nErros > 0) {
          toast.error(`${nErros} de ${ids.length} nota(s) falharam`,
            { description: nArq ? `${nArq} já gerada(s) e arquivada(s), pulada(s)` : undefined });
        } else if (nArq > 0) {
          toast.success(`${ids.length - nArq} gerada(s), ${nArq} já gerada(s) e arquivada(s), pulada(s)`);
        } else {
          toast.success(`${ids.length} nota(s) processada(s)`);
        }
      })
      .catch((e: unknown) => {
        setGerando({ rodando: false, feitas: 0, total: 0 });
        toast.error("Falha ao gerar", { description: e instanceof Error ? e.message : String(e) });
      });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !gerando.rodando) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        aria-label="Gerar ou consultar notas"
        className="w-[clamp(560px,72vw,1120px)] max-w-[94vw] sm:max-w-[94vw] max-h-[88vh] gap-[12px] p-[20px]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Gerar ou consultar notas</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-[8px]">
          <span className="edp-title text-[17px] flex-1">Gerar / Consultar notas</span>
          <Button variant="ghost" size="icon-sm" onClick={onClose} disabled={gerando.rodando}
                  aria-label="Fechar" title="Fechar (Esc)">
            <X />
          </Button>
        </div>

        <div className="flex gap-[8px]">
          <input value={input} onChange={(e) => setInput(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") adicionar(); }}
                 placeholder="Cole ids (espaço, vírgula ou linha)"
                 aria-label="IDs das notas para consultar"
                 disabled={gerando.rodando}
                 className="edp-field edp-mono flex-1 text-[13px]" />
          <Button variant="outline" size="sm" onClick={adicionar} disabled={!input.trim() || gerando.rodando}
                  className="font-semibold">Adicionar</Button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto border border-line rounded-[8px]">
          <table className="edp-table">
            <thead>
              <tr>
                <th style={TH_STICK}>ID COFFEE</th>
                <th style={TH_STICK}>ID SAP</th>
                <th style={TH_STICK}>Local de instalação</th>
                <th style={TH_STICK}>Status</th>
                <th style={TH_STICK}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className="text-text-mute text-center p-[24px]">
                  Adicione ids para consultar.
                </td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><span className="edp-mono font-semibold">{r.pk ?? r.id}</span></td>
                  <td>
                    {r.estado === "consultando" ? "…"
                     : r.estado === "erro" ? <span className="text-red">erro</span>
                     : <span className="edp-mono">{r.idSap ?? "—"}</span>}
                  </td>
                  <td>
                    {r.editando ? (
                      <input value={r.localEditado ?? ""} autoFocus
                             aria-label={`Local de instalação da nota ${r.pk ?? r.id}`}
                             className="edp-field edp-mono w-[150px] h-[26px] text-[12px]"
                             onChange={(e) => {
                               const m = maskLocal(e.target.value);
                               setRows((rs) => rs.map((x) => x.id === r.id ? { ...x, localEditado: m } : x));
                             }}
                             onKeyDown={(e) => {
                               if (e.key === "Enter") salvarLocal(r);
                               if (e.key === "Escape") cancelarEdicao(r.id);
                             }} />
                    ) : r.estado === "ok" ? (
                      <span className="edp-mono">{r.localAtual ? maskLocal(r.localAtual) : "—"}</span>
                    ) : (
                      <span className="text-text-mute">{r.estado === "consultando" ? "…" : "—"}</span>
                    )}
                  </td>
                  <td>
                    {r.estado === "erro"
                      ? <span className="text-red text-[11px]">{r.erro}</span>
                      : r.classificacao
                        ? <span className="edp-mono font-semibold" style={{ color: STATUS_COR[r.classificacao] ?? "var(--text-mute)" }}>
                            {r.arquivado ? "arquivada" : r.classificacao}
                          </span>
                        : null}
                  </td>
                  <td>
                    <div className="flex gap-[4px] items-center">
                      {r.estado === "ok" && !r.editando && (
                        <Button variant="ghost" size="icon-xs" onClick={() => iniciarEdicao(r)}
                                aria-label={`Alterar local de instalação da nota ${r.pk ?? r.id}`}
                                title="Alterar local de instalação">
                          <Pencil />
                        </Button>
                      )}
                      {r.editando && (
                        <>
                          <Button variant="ghost" size="icon-xs"
                                  disabled={r.salvandoLocal || unmaskLocal(r.localEditado ?? "") === (r.localAtual ?? "")}
                                  onClick={() => salvarLocal(r)}
                                  aria-label="Salvar local de instalação"
                                  title="Salvar"
                                  className="text-[var(--accent)]">
                            <Check />
                          </Button>
                          <Button variant="ghost" size="icon-xs" disabled={r.salvandoLocal}
                                  onClick={() => cancelarEdicao(r.id)}
                                  aria-label="Cancelar edição do local" title="Cancelar">
                            <X />
                          </Button>
                        </>
                      )}
                      {!r.editando && (
                        <Button variant="ghost" size="icon-xs" onClick={() => removerLinha(r.id)}
                                aria-label={`Remover nota ${r.pk ?? r.id} da lista`}
                                title="Remover da lista"
                                className="text-red">
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {gerando.rodando && (
          <span className="edp-mono text-[12px] text-text-mute">
            Gerando {gerando.feitas}/{gerando.total}…
          </span>
        )}

        <div className="flex items-center gap-[8px]">
          <Button variant="ghost" size="sm" onClick={limpar}
                  disabled={rows.length === 0 || gerando.rodando}>Limpar lista</Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={reconsultarTodas}
                  disabled={rows.length === 0 || gerando.rodando}>
            <RefreshCw /> Reconsultar
          </Button>
          <Button size="sm" onClick={gerar}
                  disabled={rows.length === 0 || gerando.rodando}>
            Gerar ({rows.length})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
