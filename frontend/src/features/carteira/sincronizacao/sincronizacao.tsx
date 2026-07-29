import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { StatTile } from '@/components/branded/section';
import { useCarteiraSync } from '../use-carteira-sync';

export function Sincronizacao(): React.JSX.Element {
  const { estado, sincronizar, sincronizando } = useCarteiraSync();
  const execucoes = estado.data?.execucoes ?? [];
  const ultima = execucoes[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', padding: 'var(--pad)' }}>
      <div style={{ display: 'flex', gap: 'var(--gap)', flexWrap: 'wrap', alignItems: 'center' }}>
        <StatTile
          label="Último refresh (origem)"
          value={(
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span className="carteira-sync-dot"
                    data-estado={sincronizando ? 'sincronizando' : 'ok'}
                    aria-hidden="true" />
              {estado.data?.ultimo_refresh_marker ?? '—'}
            </span>
          )}
        />
        <StatTile label="Última estratégia" value={ultima?.estrategia ?? '—'} />
        <Button onClick={sincronizar} disabled={sincronizando}
                style={{ marginLeft: 'auto' }}>
          {sincronizando ? 'Sincronizando…' : 'Sincronizar agora'}
        </Button>
      </div>
      <div className="carteira-table" style={{ overflowX: 'auto' }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Início</TableHead><TableHead>Estratégia</TableHead>
              <TableHead>Status</TableHead><TableHead>Novas</TableHead>
              <TableHead>Atualizadas</TableHead><TableHead>Ausentes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {execucoes.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.iniciado_em ?? '—'}</TableCell>
                <TableCell>{e.estrategia}</TableCell>
                <TableCell>
                  <Badge variant={e.status === 'ok' ? 'situPlano' : e.status === 'erro' ? 'situCancel' : 'situFora'}>
                    {e.status}
                  </Badge>
                </TableCell>
                <TableCell>{e.novas}</TableCell>
                <TableCell>{e.atualizadas}</TableCell>
                <TableCell>{e.ausentes}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
