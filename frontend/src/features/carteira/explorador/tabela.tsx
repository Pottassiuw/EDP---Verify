import React from 'react';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { colunasCarteira } from './colunas';
import type { NotaCarteira } from '../types';

export function TabelaCarteira({
  registros, total, page, size, onPagina, onAbrir,
}: {
  registros: NotaCarteira[];
  total: number;
  page: number;
  size: number;
  onPagina: (p: number) => void;
  onAbrir: (idOnr: number) => void;
}): React.JSX.Element {
  const tabela = useReactTable({
    data: registros,
    columns: colunasCarteira,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });
  const ultimaPagina = Math.max(1, Math.ceil(total / size));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="carteira-table" style={{ overflowX: 'auto' }}>
        <Table>
          <TableHeader>
            {tabela.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
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
                        onClick={() => onAbrir(row.original.id_onr)}>
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
        <span className="edp-eyebrow">{total} nota(s) · pág. {page}/{ultimaPagina}</span>
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
