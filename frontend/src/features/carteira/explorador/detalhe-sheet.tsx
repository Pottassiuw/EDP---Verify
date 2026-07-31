import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Eyebrow } from '@/components/branded/section';
import { CarteiraApi } from '../api';
import { SITUACAO_INFO } from '../situacao';

const CAMPOS: { chave: keyof import('../types').NotaCarteira; rotulo: string }[] = [
  { chave: 'id_sap', rotulo: 'ID SAP' },
  { chave: 'conjunto', rotulo: 'Conjunto' },
  { chave: 'descricao_conjunto', rotulo: 'Descrição do conjunto' },
  { chave: 'regional', rotulo: 'Regional' },
  { chave: 'quantidade', rotulo: 'Quantidade' },
  { chave: 'status_sap', rotulo: 'Status SAP' },
  { chave: 'data_encerramento_exec', rotulo: 'Encerramento' },
  { chave: 'local_instalacao', rotulo: 'Local de instalação' },
  { chave: 'alimentador', rotulo: 'Alimentador' },
  { chave: 'executor', rotulo: 'Executor' },
];

export function DetalheSheet({ idOnr, onClose }: {
  idOnr: number | null;
  onClose: () => void;
}): React.JSX.Element {
  const { data } = useQuery({
    queryKey: ['carteira', 'detalhe', idOnr],
    queryFn: () => CarteiraApi.detalhe(idOnr as number),
    enabled: idOnr !== null,
  });
  const info = data ? SITUACAO_INFO[data.situacao] : null;
  return (
    <Sheet open={idOnr !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent >
        <SheetHeader>
          <SheetTitle>Nota ONR {idOnr}</SheetTitle>
        </SheetHeader>
        {data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', padding: 'var(--pad)' }}>
            {info && <Badge variant={info.variant}>{info.rotulo}</Badge>}
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px' }}>
              {CAMPOS.map(({ chave, rotulo }) => (
                <React.Fragment key={chave}>
                  <Eyebrow asChild><dt>{rotulo}</dt></Eyebrow>
                  <dd style={{ margin: 0 }}>{String(data[chave] ?? '—')}</dd>
                </React.Fragment>
              ))}
            </dl>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
