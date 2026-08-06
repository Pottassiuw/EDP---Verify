import React from 'react';
import {
  flexRender, getCoreRowModel, useReactTable,
  type RowSelectionState, type OnChangeFn,
} from '@tanstack/react-table';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/branded/section';
import { colunasCarteira } from './colunas';
import type { NotaCarteira } from '../types';

export function TabelaCarteira({
  registros, total, page, size, onPagina, onAbrir,
  rowSelection, onRowSelectionChange,
}: {
  registros: NotaCarteira[];
  total: number;
  page: number;
  size: number;
  onPagina: (p: number) => void;
  onAbrir: (idOnr: number) => void;
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
}): React.JSX.Element {
  const tabela = useReactTable({
    data: registros,
    columns: colunasCarteira,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    enableRowSelection: true,
    getRowId: (row) => String(row.id_onr),
    state: { rowSelection },
    onRowSelectionChange,
  });
  const ultimaPagina = Math.max(1, Math.ceil(total / size));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div style={{ overflowX: 'auto' }}>
        <Table>
          <TableHeader>
            {tabela.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                <TableHead style={{ width: 36 }}>
                  <input type="checkbox" aria-label="Selecionar página"
                         checked={tabela.getIsAllRowsSelected()}
                         ref={(el) => { if (el) el.indeterminate = tabela.getIsSomeRowsSelected(); }}
                         onChange={tabela.getToggleAllRowsSelectedHandler()}
                         style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
                </TableHead>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {tabela.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="cursor-pointer"
                        data-state={row.getIsSelected() ? 'selected' : undefined}
                        onClick={() => onAbrir(row.original.id_onr)}>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label={`Selecionar nota ${row.original.id_onr}`}
                         checked={row.getIsSelected()}
                         onChange={row.getToggleSelectedHandler()}
                         style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
                </TableCell>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap)', justifyContent: 'flex-end' }}>
        <Eyebrow>{total} nota(s) · pág. {page}/{ultimaPagina}</Eyebrow>
        <Button variant="outline" size="sm" disabled={page <= 1}
                onClick={() => onPagina(page - 1)} aria-label="Página anterior">
          Anterior
        </Button>
        <Button variant="outline" size="sm" disabled={page >= ultimaPagina}
                onClick={() => onPagina(page + 1)} aria-label="Próxima página">
          Próxima
        </Button>
      </div>
    </div>
  );
}
