import React from 'react';
import type { CoffeeNota } from './types';

const SAP_PENDENTE = 10000000;

const TABLE_STYLE = `
  .cnt-wrap{flex:1;min-height:0;overflow:auto;padding:0 22px 24px}
  .cnt-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}
  .cnt-tbl th{position:sticky;top:0;background:var(--surface);text-align:left;padding:10px 12px;
    font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-mute);
    border-bottom:2px solid var(--line)}
  .cnt-tbl td{padding:10px 12px;border-bottom:1px solid var(--line);color:var(--text)}
  .cnt-tbl tr:hover td{background:var(--surface-2)}
  .cnt-tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:.03em}
  .cnt-tag.gerada{background:var(--tint-green);color:var(--green)}
  .cnt-tag.corrigida{background:rgba(31,159,214,0.14);color:#1f9fd6}
  .cnt-tag.pendente{background:var(--tint-amber);color:var(--amber)}
  .cnt-tag.nao_gerada{background:rgba(148,163,184,0.16);color:#94a3b8}
`;

export function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `ha ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `ha ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "ontem";
  if (days < 30) return `ha ${days}d`;
  return d.toLocaleDateString("pt-BR");
}

interface CoffeeNotasTableProps {
  notas: CoffeeNota[];
  isLoading: boolean;
  emptyMessage?: string;
  actionColumn?: (nota: CoffeeNota) => React.ReactNode;
}

export function CoffeeNotasTable({ notas, isLoading, emptyMessage, actionColumn }: CoffeeNotasTableProps): React.JSX.Element {
  if (isLoading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--text-mute)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
        Carregando notas...
      </div>
    );
  }

  if (notas.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--text-mute)", fontSize: 13, textAlign: "center", padding: 32 }}>
        {emptyMessage ?? "Nenhuma nota encontrada."}
      </div>
    );
  }

  return (
    <div className="cnt-wrap">
      <style>{TABLE_STYLE}</style>
      <table className="cnt-tbl">
        <thead>
          <tr>
            <th>ID</th>
            <th>SAP</th>
            <th>Status</th>
            <th>Ultima busca</th>
            {actionColumn && <th>Acoes</th>}
          </tr>
        </thead>
        <tbody>
          {notas.map((n) => (
            <tr key={n.pk}>
              <td><span className="edp-mono" style={{ fontWeight: 600 }}>{n.pk}</span></td>
              <td>
                <span className="edp-mono">{n.id_sap}</span>
                {n.id_sap === SAP_PENDENTE && (
                  <span className="cnt-tag pendente" style={{ marginLeft: 8 }}>Pendente</span>
                )}
              </td>
              <td><span className={`cnt-tag ${n.classificacao}`}>{n.classificacao}</span></td>
              <td style={{ color: "var(--text-mute)", fontSize: 12 }}>
                {n.buscado_em ? formatRelativeTime(n.buscado_em) : "—"}
              </td>
              {actionColumn && <td>{actionColumn(n)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
