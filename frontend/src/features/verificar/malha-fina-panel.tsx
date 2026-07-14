import * as React from "react";

import { ChevronDown, ChevronRight, Wrench } from "lucide-react";
import { toast } from "sonner";

import { BASE, corrigirLocalLote } from "../../api";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Progress } from "../../components/ui/progress";
import { Switch } from "../../components/ui/switch";
import type { CoffeeJob } from "../coffee/types";
import type { GrupoNoveExtra } from "./malha-fina";

interface MalhaFinaPanelProps {
  grupos: GrupoNoveExtra[];
}

type FaseJob =
  | { fase: "ocioso" }
  | { fase: "rodando"; job: CoffeeJob | null }
  | { fase: "concluido"; job: CoffeeJob };

function pollJob(jobId: string, onTick: (job: CoffeeJob) => void): Promise<CoffeeJob> {
  return new Promise((resolve, reject) => {
    let falhas = 0;
    const tick = (): void => {
      fetch(`${BASE}/coffee/job/${jobId}`, { headers: { Accept: "application/json" } })
        .then((r) => { if (!r.ok) throw new Error(`GET /job -> ${r.status}`); return r.json() as Promise<CoffeeJob>; })
        .then((job) => {
          falhas = 0;
          onTick(job);
          if (job.estado === "concluido") resolve(job); else setTimeout(tick, 900);
        })
        .catch((e: unknown) => {
          // Tolera falhas transitorias de rede: o job continua rodando no backend.
          if (++falhas >= 10) reject(e instanceof Error ? e : new Error(String(e)));
          else setTimeout(tick, 900);
        });
    };
    tick();
  });
}

export function MalhaFinaPanel({ grupos }: MalhaFinaPanelProps): React.JSX.Element {
  const [aberto, setAberto] = React.useState(false);
  const [selecionados, setSelecionados] = React.useState<Set<string>>(() => new Set());
  const [gerarApos, setGerarApos] = React.useState(false);
  const [expandido, setExpandido] = React.useState<string | null>(null);
  const [fase, setFase] = React.useState<FaseJob>({ fase: "ocioso" });
  const [tratados, setTratados] = React.useState<Set<string>>(() => new Set());

  const visiveis = grupos.filter((g) => !tratados.has(g.localErrado));
  const gruposSel = visiveis.filter((g) => selecionados.has(g.localErrado));
  const totalNotas = gruposSel.reduce((acc, g) => acc + g.notasAfetadas.length, 0);
  const rodando = fase.fase === "rodando";

  if (visiveis.length === 0) return <React.Fragment />;

  function toggleGrupo(local: string): void {
    setSelecionados((s) => {
      const novo = new Set(s);
      if (novo.has(local)) novo.delete(local); else novo.add(local);
      return novo;
    });
  }

  function toggleTodos(): void {
    setSelecionados((s) =>
      s.size === visiveis.length ? new Set() : new Set(visiveis.map((g) => g.localErrado)));
  }

  function corrigir(): void {
    const itens = gruposSel.flatMap((g) =>
      g.notasAfetadas.map((n) => ({ id: Number(n.id), local: g.localProposto })));
    setFase({ fase: "rodando", job: null });
    corrigirLocalLote(itens, gerarApos)
      .then(({ job_id }) =>
        pollJob(job_id, (job) =>
          setFase((f) => (f.fase === "rodando" ? { fase: "rodando", job } : f))))
      .then((job) => {
        setFase({ fase: "concluido", job });
        setTratados((t) => new Set([...t, ...gruposSel.map((g) => g.localErrado)]));
        setSelecionados(() => new Set());
        const nErros = job.erros?.length ?? 0;
        if (nErros > 0) toast.warning(`Correção concluída com ${nErros} erro${nErros > 1 ? "s" : ""}.`);
        else toast.success("Correção concluída.");
      })
      .catch((e: Error) => {
        setFase({ fase: "ocioso" });
        toast.error(e.message);
      });
  }

  const totalAfetadas = visiveis.reduce((acc, g) => acc + g.notasAfetadas.length, 0);

  return (
    <div className="shrink-0 bg-surface border-b-[1px] border-b-line px-[22px] py-[10px]">
      <button type="button" onClick={() => setAberto((a) => !a)}
              aria-expanded={aberto}
              className="flex items-center gap-[9px] w-full text-left bg-transparent border-0 cursor-pointer p-0">
        {aberto ? <ChevronDown className="size-[14px] text-text-mute" />
                : <ChevronRight className="size-[14px] text-text-mute" />}
        <Wrench className="size-[13px] text-[var(--accent)]" />
        <span className="edp-eyebrow">
          Malha fina · {visiveis.length} grupo{visiveis.length !== 1 ? "s" : ""} / {totalAfetadas} nota{totalAfetadas !== 1 ? "s" : ""} com 9 extra
        </span>
      </button>

      {aberto && (
        <div className="mt-[10px] flex flex-col gap-[8px]">
          <div className="flex items-center gap-[14px] flex-wrap">
            <Button variant="outline" size="sm" onClick={toggleTodos} disabled={rodando}>
              {selecionados.size === visiveis.length ? "Limpar seleção" : "Selecionar tudo"}
            </Button>
            <div className="flex items-center gap-[7px]">
              <Switch id="malha-gerar-apos" checked={gerarApos}
                      onCheckedChange={setGerarApos} disabled={rodando} />
              <Label htmlFor="malha-gerar-apos" className="text-[12px] text-text-dim">
                Gerar após corrigir
              </Label>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={totalNotas === 0 || rodando}>
                  Corrigir selecionadas ({totalNotas})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Corrigir locais em massa?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {totalNotas} nota{totalNotas !== 1 ? "s" : ""} em {gruposSel.length} grupo{gruposSel.length !== 1 ? "s" : ""} terão
                    o "9" final removido do local de instalação no COFFEE.
                    {gerarApos ? " As corrigidas com sucesso serão geradas em seguida." : ""}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={corrigir}>Corrigir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {fase.fase === "rodando" && (
            <div className="flex items-center gap-[10px]">
              <Progress className="max-w-[260px]"
                        value={fase.job ? (fase.job.feitas / Math.max(fase.job.total, 1)) * 100 : 0} />
              <span className="edp-mono text-[11px] text-text-mute">
                {fase.job ? `${fase.job.feitas}/${fase.job.total}` : "iniciando…"}
              </span>
            </div>
          )}

          {fase.fase === "concluido" && (
            <div className="flex items-center gap-[8px] flex-wrap edp-mono text-[11px]">
              <span className="text-[var(--accent)]">corrigidas {fase.job.corrigidas?.length ?? 0}</span>
              <span className="text-text-mute">já corrigidas {fase.job.ja_corrigidas?.length ?? 0}</span>
              <span className="text-text-mute">divergentes {fase.job.divergentes?.length ?? 0}</span>
              {gerarApos && <span className="text-[var(--accent)]">geradas {fase.job.geradas?.length ?? 0}</span>}
              <span className={(fase.job.erros?.length ?? 0) > 0 ? "text-red" : "text-text-mute"}>
                erros {fase.job.erros?.length ?? 0}
              </span>
            </div>
          )}

          <div className="flex flex-col">
            {visiveis.map((g) => {
              const sel = selecionados.has(g.localErrado);
              const exp = expandido === g.localErrado;
              return (
                <div key={g.localErrado} className="border-b-[1px] border-b-line py-[6px]">
                  <div className="flex items-center gap-[10px]">
                    <input type="checkbox" checked={sel} disabled={rodando}
                           onChange={() => toggleGrupo(g.localErrado)}
                           aria-label={`Selecionar grupo ${g.localErrado}`}
                           className="shrink-0 w-[16px] h-[16px] [accent-color:var(--accent)] cursor-pointer" />
                    <span className="edp-mono text-[12px] text-red line-through">{g.localErrado}</span>
                    <span className="text-text-mute text-[12px]">→</span>
                    <span className="edp-mono text-[12px] text-[var(--accent)]">{g.localProposto}</span>
                    <span className="text-[11.5px] text-text-dim">
                      {g.notasAfetadas.length} nota{g.notasAfetadas.length !== 1 ? "s" : ""} ·
                      {" "}{g.notasReferencia.length} referência{g.notasReferencia.length !== 1 ? "s" : ""}
                      {g.ignoradasSemId > 0 ? ` · ${g.ignoradasSemId} sem id (ignorada${g.ignoradasSemId !== 1 ? "s" : ""})` : ""}
                    </span>
                    <button type="button"
                            className="bg-transparent border-0 cursor-pointer text-[11px] text-text-mute p-0 ml-auto hover:text-text-dim"
                            onClick={() => setExpandido(exp ? null : g.localErrado)}
                            aria-expanded={exp}>
                      {exp ? "ocultar ids" : "ver ids"}
                    </button>
                  </div>
                  {exp && (
                    <div className="edp-mono text-[11px] text-text-dim pl-[26px] pt-[4px]">
                      <div>afetadas: {g.notasAfetadas.map((n) => n.id).join(", ")}</div>
                      <div>referência: {g.notasReferencia.map((n) => n.id).join(", ")}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
