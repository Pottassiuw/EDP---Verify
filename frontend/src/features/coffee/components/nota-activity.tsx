import React from 'react';
import { formatRelativeTime } from '../format';
import type { CoffeeLog } from '../types';

interface NotaActivityProps {
  logs: CoffeeLog[];
  loading: boolean;
}

export function NotaActivity({
  logs,
  loading,
}: NotaActivityProps): React.JSX.Element {
  if (loading) {
    return <p className="text-sm text-text-mute">Carregando atividade…</p>;
  }
  if (logs.length === 0) {
    return <p className="text-sm text-text-mute">Sem atividade registrada.</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {logs.slice(0, 8).map((log) => (
        <li key={log.id} className="border-l border-line-2 pl-3">
          <div className="text-sm font-medium">{log.acao.replace(/_/g, ' ')}</div>
          <div className="mt-0.5 text-xs text-text-mute">
            {formatRelativeTime(log.timestamp)}
            {log.usuario ? ` · ${log.usuario}` : ''}
          </div>
        </li>
      ))}
    </ol>
  );
}
