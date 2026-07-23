import React from 'react';
import type { CarteiraSubPage } from '../../types';
import { PageHeader, SegTabs } from '@/components/branded/section';
import { CARTEIRA_SUBS } from './subs';
import { Explorador } from './explorador/explorador';
import { Sincronizacao } from './sincronizacao/sincronizacao';
import { Divergencias } from './divergencias/divergencias';

export function CarteiraSection({ sub, setSub, handoff }: {
  sub: CarteiraSubPage;
  setSub: (s: CarteiraSubPage) => void;
  handoff?: { situacao: string; id: number } | null;
}): React.JSX.Element {
  return (
    <div className="edp-page carteira-scope" style={{ height: '100%', overflow: 'auto' }}>
      <PageHeader
        eyebrow="Databricks · base COFFEE"
        title="Carteira de Notas"
        subtitle="Toda a carteira disponível — dentro ou fora do plano."
        action={<SegTabs tabs={CARTEIRA_SUBS} value={sub} onChange={setSub} ariaLabel="Abas da carteira" />}
      />
      {sub === 'explorador' ? <Explorador handoff={handoff} />
        : sub === 'divergencias' ? <Divergencias />
        : <Sincronizacao />}
    </div>
  );
}
