import React from 'react';
import { useCoffeeNotas } from './use-coffee-notas';
import { CoffeeNotasTable, AbrirCoffeeBtn } from './coffee-notas-table';
import { LogDrawer } from './coffee-log-drawer';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';

export function CoffeeCorrigidas(): React.JSX.Element {
  const { notas, isLoading, error, refetch } = useCoffeeNotas("corrigida");
  const [drawerPk, setDrawerPk] = React.useState<number | null>(null);
  const [busca, setBusca] = React.useState("");

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
      <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "var(--text-mute)" }}>
        <span style={{ color: "var(--red)" }}>Erro ao carregar notas: {error}</span>
        <Button variant="outline" size="sm" onClick={refetch}>Tentar de novo</Button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flexShrink: 0, padding: "14px 22px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className="edp-title" style={{ fontSize: 16 }}>Notas Corrigidas</span>
        {!isLoading && (
          <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)" }}>
            {filtradas.length}{busca.trim() ? ` de ${notas.length}` : ""} nota{filtradas.length !== 1 ? "s" : ""}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <input className="edp-field edp-mono" value={busca} placeholder="Buscar ID ou SAP…"
               style={{ width: 180, height: 30, fontSize: 12 }}
               onChange={(e) => setBusca(e.target.value)} />
        <Button variant="outline" size="sm" disabled={filtradas.length === 0} onClick={() => void copiarIds()}>
          <Copy /> Copiar IDs
        </Button>
      </div>
      <div style={{ flexShrink: 0, padding: "0 22px 10px", fontSize: 12, color: "var(--text-dim)" }}>
        Notas que transitaram de pendente para SAP real. Na próxima busca, passam para Geradas.
      </div>
      <CoffeeNotasTable
        notas={filtradas}
        isLoading={isLoading}
        emptyMessage={busca.trim()
          ? "Nenhuma nota corrigida bate com a busca."
          : "Nenhuma nota corrigida no momento. Notas aparecem aqui quando transitam de SAP pendente para SAP real."}
        actionColumn={(nota) => (
          <>
            <AbrirCoffeeBtn pk={nota.pk} />
            <Button variant="ghost" size="sm" onClick={() => setDrawerPk(nota.pk)} title="Ver logs">
              Logs
            </Button>
          </>
        )}
      />
      {drawerPk !== null && (
        <LogDrawer notaPk={drawerPk} open onClose={() => setDrawerPk(null)} />
      )}
    </div>
  );
}
