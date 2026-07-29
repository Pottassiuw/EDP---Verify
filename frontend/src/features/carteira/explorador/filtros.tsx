import React from 'react';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SITUACAO_INFO } from '../situacao';
import type { FiltrosCarteira, SituacaoCarteira } from '../types';

const REGIONAIS = ['GUARATINGUETÁ', 'SÃO JOSÉ DOS CAMPOS', 'GUARULHOS',
  'Poá-Suzano', 'MOGI DAS CRUZES', 'Litoral Norte'];
const TODOS = '__todos';

export function FiltrosCarteiraBar({ filtros, onChange }: {
  filtros: FiltrosCarteira;
  onChange: (f: FiltrosCarteira) => void;
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 'var(--gap)', flexWrap: 'wrap', alignItems: 'center' }}>
      <Input placeholder="Buscar (SAP, conjunto, local)…"
             defaultValue={filtros.q ?? ''}
             onChange={(e) => onChange({ ...filtros, q: e.target.value || undefined })}
             style={{ maxWidth: 280 }} />
      <Select value={filtros.regional ?? TODOS}
              onValueChange={(v) => onChange({ ...filtros, regional: v === TODOS ? undefined : v })}>
        <SelectTrigger className="edp" style={{ width: 200 }}>
          <SelectValue placeholder="Regional" />
        </SelectTrigger>
        <SelectContent className="edp carteira-scope">
          <SelectItem value={TODOS}>Todas as regionais</SelectItem>
          {REGIONAIS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filtros.situacao ?? TODOS}
              onValueChange={(v) => onChange({ ...filtros, situacao: v === TODOS ? undefined : (v as SituacaoCarteira) })}>
        <SelectTrigger className="edp" style={{ width: 180 }}>
          <SelectValue placeholder="Situação" />
        </SelectTrigger>
        <SelectContent className="edp carteira-scope">
          <SelectItem value={TODOS}>Todas as situações</SelectItem>
          {Object.entries(SITUACAO_INFO).map(([id, info]) =>
            <SelectItem key={id} value={id}>{info.rotulo}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
