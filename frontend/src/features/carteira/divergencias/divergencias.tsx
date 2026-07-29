import React from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Banner } from '@/components/branded/section';
import { useCarteiraDivergencias } from '../use-carteira-divergencias';

const TIPO_INFO: Record<string, { rotulo: string; variant: 'situCancel' | 'situFora' }> = {
  cancelada: { rotulo: 'Cancelada na origem', variant: 'situCancel' },
  ausente_na_origem: { rotulo: 'Ausente na origem', variant: 'situFora' },
};

export function Divergencias(): React.JSX.Element {
  const { data, isLoading, error } = useCarteiraDivergencias();
  const linhas = data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', padding: 'var(--pad)' }}>
      <p className="edp-sub" style={{ margin: 0 }}>
        Notas no plano que destoam da carteira — canceladas ou ausentes na origem.
        Apenas alerta; nada é alterado automaticamente.
      </p>
      {error && <Banner tipo="err">Não foi possível carregar as divergências: {error instanceof Error ? error.message : String(error)}</Banner>}
      {isLoading && !data && <span className="edp-eyebrow">Carregando…</span>}
      {!isLoading && linhas.length === 0 && (
        <Banner tipo="ok">Nenhuma divergência — plano e carteira estão coerentes.</Banner>
      )}
      {linhas.length > 0 && (
        <div className="carteira-table" style={{ overflowX: 'auto' }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID SAP</TableHead><TableHead>Conjunto</TableHead>
                <TableHead>Regional</TableHead><TableHead>Divergência</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((d) => {
                const info = TIPO_INFO[d.tipo_divergencia];
                return (
                  <TableRow key={d.id_onr}>
                    <TableCell>{d.id_sap ?? '—'}</TableCell>
                    <TableCell>{d.conjunto ?? '—'}</TableCell>
                    <TableCell>{d.regional ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={info.variant}>{info.rotulo}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
