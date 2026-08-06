import React from 'react';

import { farol, fmtPct } from './fmt';

const CLASSE_FAROL = {
  verde: 'bg-tint-green text-green',
  ambar: 'bg-tint-amber text-amber',
  vermelho: 'bg-tint-red text-red',
};

export function TituloPainel({
  titulo,
  detalhe,
  acao,
}: {
  titulo: string;
  detalhe?: React.ReactNode;
  acao?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-text">{titulo}</h3>
        {detalhe && <p className="mt-1 text-xs text-text-mute">{detalhe}</p>}
      </div>
      {acao}
    </div>
  );
}

export function BadgeDisponibilidade({ pct }: { pct: number | null }): React.JSX.Element {
  const cor = farol(pct);
  if (!cor) {
    return <span className="font-mono text-xs text-text-mute">—</span>;
  }

  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${CLASSE_FAROL[cor]}`}>
      {fmtPct(pct)}
    </span>
  );
}

export function BarraDisponibilidade({
  pct,
  label,
}: {
  pct: number | null;
  label: string;
}): React.JSX.Element {
  const cor = farol(pct) ?? 'ambar';
  const valor = pct === null ? 0 : Math.max(0, Math.min(pct, 1)) * 100;

  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-surface-3"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(valor)}
    >
      <div
        className={`h-full rounded-full ${classeBarra(cor)}`}
        style={{ width: `${valor}%` }}
      />
    </div>
  );
}

export function EstadoVazio({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="py-8 text-center text-sm text-text-mute">{children}</p>;
}

function classeBarra(cor: 'verde' | 'ambar' | 'vermelho'): string {
  if (cor === 'verde') return 'bg-green';
  if (cor === 'vermelho') return 'bg-red';
  return 'bg-amber';
}
