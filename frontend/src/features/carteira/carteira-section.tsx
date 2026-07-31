import React from 'react';
import type { CarteiraSubPage } from '../../types';
import { PageHeader, SectionPage, SegTabs } from '@/components/branded/section';
import type { FiltrosCarteira } from './types';
import { CARTEIRA_SUBS } from './subs';
import { DashboardCarteiraView } from './dashboard/dashboard';
import { Explorador } from './explorador/explorador';
import { Sincronizacao } from './sincronizacao/sincronizacao';
import { Divergencias } from './divergencias/divergencias';

export function CarteiraSection({ sub, setSub, handoff }: {
  sub: CarteiraSubPage;
  setSub: (s: CarteiraSubPage) => void;
  handoff?: { situacao: string; id: number } | null;
}): React.JSX.Element {
  const [drill, setDrill] = React.useState<{ filtro: Partial<FiltrosCarteira>; id: number } | null>(null);

  function aoDrill(filtro: Partial<FiltrosCarteira>): void {
    setDrill((p) => ({ filtro, id: (p?.id ?? 0) + 1 }));
    setSub('explorador');
  }

  return (
    <SectionPage  style={{ height: '100%', overflow: 'auto' }}>
      <PageHeader
        eyebrow="Databricks · base COFFEE"
        title="Carteira de Notas"
        subtitle="Toda a carteira disponível — dentro ou fora do plano."
        action={<SegTabs tabs={CARTEIRA_SUBS} value={sub} onChange={setSub} ariaLabel="Abas da carteira" />}
      />
      {sub === 'dashboard' ? <DashboardCarteiraView onDrill={aoDrill} />
        : sub === 'explorador' ? <Explorador handoff={handoff} drill={drill} />
        : sub === 'divergencias' ? <Divergencias />
        : <Sincronizacao />}
    </SectionPage>
  );
}
