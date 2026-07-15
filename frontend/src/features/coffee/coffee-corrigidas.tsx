import React from 'react';
import { useCoffeeNotas } from './use-coffee-notas';
import { CoffeeNotasTable, AbrirCoffeeBtn, LogsBtn, RevisarNotaBtn } from './coffee-notas-table';
import { LogDrawer } from './coffee-log-drawer';
import { RevisarNotaSheet } from './revisar-nota-sheet';
import { MoverPlanoModal, type MoverAlvo } from './mover-plano-modal';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';

export function CoffeeCorrigidas({ onIrParaInput }: { onIrParaInput?: () => void }): React.JSX.Element {
  const { notas, isLoading, error, refetch } = useCoffeeNotas("corrigida");
  const [drawerPk, setDrawerPk] = React.useState<number | null>(null);
  const [busca, setBusca] = React.useState("");
  const [revisaoPk, setRevisaoPk] = React.useState<number | null>(null);
  const [moverAlvo, setMoverAlvo] = React.useState<MoverAlvo | null>(null);
  const [selecionadas, setSelecionadas] = React.useState<Set<number>>(new Set());

  const filtradas = React.useMemo(() => {
    const q = busca.trim();
    if (!q) return notas;
    return notas.filter((n) => String(n.pk).includes(q) || String(n.id_sap).includes(q));
  }, [notas, busca]);

  async function copiarIds(): Promise<void> {
    try {
      await navigator.clipboard.writeText(filtradas.map((n) => n.pk).join("\n"));
      toast.success(`${filtradas.length} ID(s) copiado(s)`);
    } catch {
      toast.error("Não foi possível copiar automaticamente");
    }
  }

  if (error) {
    return (
      <div className="p-[24px] flex flex-col items-center gap-[12px] text-text-mute">
        <span className="text-red">Erro ao carregar notas: {error}</span>
        <Button variant="outline" size="sm" onClick={refetch}>Tentar de novo</Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 py-[14px] px-[22px] flex items-center gap-[12px] flex-wrap">
        <span className="edp-title text-[16px]">Notas Corrigidas</span>
        {!isLoading && (
          <span className="edp-mono text-[12px] text-text-mute">
            {filtradas.length}{busca.trim() ? ` de ${notas.length}` : ""} nota{filtradas.length !== 1 ? "s" : ""}
          </span>
        )}
        <div className="flex-1" />
        <input className="edp-field edp-mono w-[180px] h-[30px] text-[12px]" value={busca} placeholder="Buscar ID ou SAP…"
               onChange={(e) => setBusca(e.target.value)} />
        <Button variant="outline" size="sm" disabled={filtradas.length === 0} onClick={() => void copiarIds()}>
          <Copy /> Copiar IDs
        </Button>
        <Button size="sm" disabled={selecionadas.size === 0}
                onClick={() => setMoverAlvo({ pks: [...selecionadas], revisao: null })}>
          Mover p/ Plano ({selecionadas.size})
        </Button>
      </div>
      <div className="shrink-0 pt-0 px-[22px] pb-[10px] text-[12px] text-text-dim">
        Notas que transitaram de pendente para SAP real. Na próxima busca, passam para Geradas.
      </div>
      <CoffeeNotasTable
        notas={filtradas}
        isLoading={isLoading}
        emptyMessage={busca.trim()
          ? "Nenhuma nota corrigida bate com a busca."
          : "Nenhuma nota corrigida no momento. Notas aparecem aqui quando transitam de SAP pendente para SAP real."}
        selectable
        selectedPks={selecionadas}
        onToggleSelect={(pk) => setSelecionadas((s) => { const n = new Set(s); if (n.has(pk)) n.delete(pk); else n.add(pk); return n; })}
        onToggleAll={() => setSelecionadas((s) => s.size === filtradas.length ? new Set() : new Set(filtradas.map((n) => n.pk)))}
        actionColumn={(nota) => (
          <>
            <AbrirCoffeeBtn pk={nota.pk} />
            <RevisarNotaBtn pk={nota.pk} onClick={() => setRevisaoPk(nota.pk)} />
            <LogsBtn pk={nota.pk} onClick={() => setDrawerPk(nota.pk)} />
          </>
        )}
      />
      {drawerPk !== null && (
        <LogDrawer notaPk={drawerPk} open onClose={() => setDrawerPk(null)} />
      )}
      <RevisarNotaSheet pk={revisaoPk} onClose={() => setRevisaoPk(null)}
                        onMover={(revisao) => { setRevisaoPk(null); setMoverAlvo({ pks: [revisao.coffee.pk], revisao }); }} />
      <MoverPlanoModal alvo={moverAlvo} onClose={() => setMoverAlvo(null)}
                       onSucesso={() => setSelecionadas(new Set())}
                       onIrParaInput={onIrParaInput} />
    </div>
  );
}
