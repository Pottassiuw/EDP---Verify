import React from 'react';
import { StatTile } from '@/components/branded/section';
import { useCarteiraResumo } from '../use-carteira-resumo';

export function KpisCarteira(): React.JSX.Element {
  const { data } = useCarteiraResumo();
  const s = data?.por_situacao ?? {};
  return (
    <div className="edp-stats-row" style={{ display: 'flex', gap: 'var(--gap)', flexWrap: 'wrap' }}>
      <StatTile label="Total na carteira" value={data?.total ?? '—'} />
      <StatTile label="Fora do plano" value={s['fora_do_plano'] ?? '—'} />
      <StatTile label="No plano" value={s['no_plano'] ?? '—'} />
      <StatTile label="Executadas" value={s['executada'] ?? '—'} />
    </div>
  );
}
