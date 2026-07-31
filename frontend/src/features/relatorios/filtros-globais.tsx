import React from 'react';
import { CalendarDays, Search, X } from 'lucide-react';

import { Eyebrow } from '@/components/branded/section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { MESES_ABREV_PT } from './fmt';

const TODAS_AS_REGIONAIS = 'todas';

export interface FiltrosGlobaisProps {
  ano: number;
  mes: number;
  regional: string | null;
  busca: string;
  regionais: string[];
  onMesChange: (mes: number) => void;
  onRegionalChange: (regional: string | null) => void;
  onBuscaChange: (busca: string) => void;
}

export function FiltrosGlobais({
  ano,
  mes,
  regional,
  busca,
  regionais,
  onMesChange,
  onRegionalChange,
  onBuscaChange,
}: FiltrosGlobaisProps): React.JSX.Element {

  return (
    <Card className="flex flex-wrap items-center gap-3 p-[var(--pad)] py-3">
      <Eyebrow className="shrink-0">Filtros globais</Eyebrow>

      <Select value={String(mes)} onValueChange={(valor) => onMesChange(Number(valor))}>
        <SelectTrigger className="w-44" aria-label="Selecionar mês de referência">
          <CalendarDays />
          <SelectValue />
        </SelectTrigger>
        <SelectContent >
          {MESES_ABREV_PT.map((nome, indice) => (
            <SelectItem key={nome} value={String(indice + 1)}>
              {nomeMes(nome)} de {ano}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="shrink-0 font-mono text-xs text-text-mute" aria-label={`Ano de referência: ${ano}`}>
        Ano {ano}
      </span>

      <Select
        value={regional ?? TODAS_AS_REGIONAIS}
        onValueChange={(valor) => onRegionalChange(valor === TODAS_AS_REGIONAIS ? null : valor)}
      >
        <SelectTrigger className="w-48" aria-label="Filtrar por regional">
          <SelectValue />
        </SelectTrigger>
        <SelectContent >
          <SelectItem value={TODAS_AS_REGIONAIS}>SP (todas)</SelectItem>
          {regionais.map((nome) => <SelectItem key={nome} value={nome}>{nome}</SelectItem>)}
        </SelectContent>
      </Select>

      <div className="relative min-w-52 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-mute" aria-hidden="true" />
        <Input
          value={busca}
          onChange={(event) => onBuscaChange(event.target.value)}
          placeholder="Buscar plano, área ou regional"
          aria-label="Buscar plano, área ou regional"
          className="border-line-2 bg-bg-2 pl-9 pr-9 text-text"
        />
        {busca && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => onBuscaChange('')}
            className="absolute top-1/2 right-1 -translate-y-1/2"
            aria-label="Limpar busca"
          >
            <X />
          </Button>
        )}
      </div>
    </Card>
  );
}

function nomeMes(nome: string): string {
  return `${nome.slice(0, 1).toUpperCase()}${nome.slice(1)}`;
}
