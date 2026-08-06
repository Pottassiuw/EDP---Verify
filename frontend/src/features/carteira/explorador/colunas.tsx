import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { SITUACAO_INFO } from '../situacao';
import type { NotaCarteira } from '../types';

export const colunasCarteira: ColumnDef<NotaCarteira>[] = [
  { accessorKey: 'id_sap', header: 'ID SAP',
    cell: ({ row }) => row.original.id_sap ?? '—' },
  { accessorKey: 'conjunto', header: 'Conjunto',
    cell: ({ row }) => row.original.conjunto ?? '—' },
  { accessorKey: 'regional', header: 'Regional',
    cell: ({ row }) => row.original.regional ?? '—' },
  { accessorKey: 'quantidade', header: 'Qtd',
    cell: ({ row }) => (
      <span className="tabular-nums text-right">
        {row.original.quantidade_valida ? row.original.quantidade : '—'}
      </span>
    ) },
  { accessorKey: 'status_sap', header: 'Status',
    cell: ({ row }) => row.original.status_sap ?? '—' },
  { id: 'situacao', header: 'Situação',
    cell: ({ row }) => {
      const info = SITUACAO_INFO[row.original.situacao];
      return <Badge variant={info.variant}>{info.rotulo}</Badge>;
    } },
];
