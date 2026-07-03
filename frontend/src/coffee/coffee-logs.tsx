import React from 'react';
import { useCoffeeLogs } from './use-coffee-logs';
import { LogTable, PASSOS } from './coffee-log-table';
import { BASE as API_BASE } from '../api';
import { SegTabs } from '@/components/branded/section';

const LIMITES = [50, 100, 500] as const;

export function CoffeeLogs(): React.JSX.Element {
  const [passo, setPasso] = React.useState("");
  const [notaPk, setNotaPk] = React.useState("");
  const [limit, setLimit] = React.useState<number>(100);
  const [usuario, setUsuario] = React.useState("");
  const [usuarios, setUsuarios] = React.useState<string[]>([]);

  React.useEffect(() => {
    fetch(`${API_BASE}/coffee/logs/usuarios`, { headers: { Accept: "application/json" } })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: { usuarios: string[] }) => setUsuarios(data.usuarios))
      .catch(() => {});
  }, []);

  const parsedPk = notaPk.trim() ? Number(notaPk) : undefined;
  const pkValido = Number.isFinite(parsedPk) ? parsedPk : undefined;
  const { logs, loading } = useCoffeeLogs({
    nota_pk: pkValido,
    usuario: usuario || undefined,
    limit,
  });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flexShrink: 0, padding: "14px 22px 10px", display: "flex", alignItems: "center",
                    gap: 14, flexWrap: "wrap" }}>
        <SegTabs tabs={PASSOS.map((p) => ({ id: p.value, rotulo: p.label }))}
                 value={passo} onChange={setPasso} ariaLabel="Filtrar por passo" />

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 12, color: "var(--text-mute)" }}>Nota:</label>
          <input type="number" placeholder="PK" value={notaPk} className="edp-field edp-mono"
                 onChange={(e) => setNotaPk(e.target.value)}
                 style={{ width: 90, height: 30, fontSize: 12 }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 12, color: "var(--text-mute)" }}>Usuario:</label>
          <select value={usuario} onChange={(e) => setUsuario(e.target.value)}
                  className="edp-field edp-mono" style={{ height: 30, fontSize: 12 }}>
            <option value="">Todos</option>
            {usuarios.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 12, color: "var(--text-mute)" }}>Limite:</label>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}
                  className="edp-field" style={{ height: 30, fontSize: 12 }}>
            {LIMITES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      <LogTable logs={logs} loading={loading} passo={passo} notaRoot={pkValido}
                onClickNota={(pk) => setNotaPk(String(pk))} />
    </div>
  );
}
