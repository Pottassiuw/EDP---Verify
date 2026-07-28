import React from 'react';
import { ChevronRight } from 'lucide-react';

import { fmtPct, fmtQtd } from '../fmt';
import { BarraDisponibilidade, BadgeDisponibilidade, EstadoVazio, TituloPainel } from '../relatorios-ui';
import type { ResumoRegionalDetalhado } from '../use-relatorios-data';

export function SaldoRegionalResumo({
  regionais,
  regionalSelecionada,
  onSelecionarRegional,
}: {
  regionais: ResumoRegionalDetalhado[];
  regionalSelecionada: string | null;
  onSelecionarRegional: (regional: string | null) => void;
}): React.JSX.Element {
  const ordenadas = React.useMemo(
    () => [...regionais].sort((primeira, segunda) => disponibilidade(primeira) - disponibilidade(segunda)),
    [regionais],
  );

  return (
    <section className="edp-panel flex flex-col gap-4">
      <TituloPainel
        titulo="Saldo por regional"
        detalhe="Clique em uma regional para aplicar o filtro global."
      />
      {ordenadas.length === 0 ? (
        <EstadoVazio>Aguardando o detalhamento do recorte por regional.</EstadoVazio>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ordenadas.map((regional) => {
          const ativa = regionalSelecionada === regional.regional;
          return (
            <button
              key={regional.regional}
              type="button"
              onClick={() => onSelecionarRegional(ativa ? null : regional.regional)}
              aria-pressed={ativa}
              className={`rounded-edp border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                ativa ? 'border-accent bg-accent-tint' : 'border-line bg-bg-2 hover:bg-surface-2'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-text">{regional.regional}</span>
                <BadgeDisponibilidade pct={regional.pctDisp} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Info label="Meta" valor={fmtQtd(regional.meta)} />
                <Info label="Carteira" valor={fmtQtd(regional.carteira)} />
                <Info label="Saldo" valor={fmtQtd(regional.saldo)} tom={regional.saldo < 0 ? 'text-red' : 'text-green'} />
              </div>
              <div className="mt-4"><BarraDisponibilidade pct={regional.pctDisp} label={`Disponibilidade da regional ${regional.regional}`} /></div>
              <div className="mt-3 flex items-center justify-between text-xs text-text-mute">
                <span>{fmtPct(regional.pctDisp)} disponível</span>
                <ChevronRight className="size-4" aria-hidden="true" />
              </div>
            </button>
          );
          })}
        </div>
      )}
    </section>
  );
}

function Info({ label, valor, tom = 'text-text' }: { label: string; valor: string; tom?: string }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <p className="edp-eyebrow truncate">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold ${tom}`}>{valor}</p>
    </div>
  );
}

function disponibilidade(regional: ResumoRegionalDetalhado): number {
  return regional.pctDisp ?? Number.POSITIVE_INFINITY;
}
