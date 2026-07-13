import React from 'react';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectSeparator, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CLASSE_SELECT_MONO } from './ui';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
               'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;

interface Opcao { value: string; rotulo: string; }

/** Monta as opções do picker a partir do ano atual.
 *  Ex. anoAtual=2026 →
 *    meses:   jan-2026 (Jan) … dez-2026 (Dez)
 *    futuros: jan-2027 (2027), jan-2050 (2050) */
export function construirOpcoesMes(anoAtual: number): { meses: Opcao[]; futuros: Opcao[] } {
  const meses = MESES.map((m) => ({
    value: `${m}-${anoAtual}`,
    rotulo: m.charAt(0).toUpperCase() + m.slice(1),
  }));
  const futuros: Opcao[] = [
    { value: `jan-${anoAtual + 1}`, rotulo: String(anoAtual + 1) },
    { value: 'jan-2050', rotulo: '2050' },
  ];
  return { meses, futuros };
}

const SENTINELA_NEUTRO = '__neutro';

interface MesExecucaoPickerProps {
  value: string;
  onChange: (v: string) => void;
  valorNeutro: string;
  rotuloNeutro: string;
  id?: string;
  className?: string;
}

export function MesExecucaoPicker({
  value, onChange, valorNeutro, rotuloNeutro, id, className,
}: MesExecucaoPickerProps): React.JSX.Element {
  const anoAtual = new Date().getFullYear();
  const { meses, futuros } = construirOpcoesMes(anoAtual);

  const valorSelect = value === valorNeutro ? SENTINELA_NEUTRO : (value || undefined);
  const aoMudar = (v: string): void => onChange(v === SENTINELA_NEUTRO ? valorNeutro : v);

  return (
    <Select value={valorSelect} onValueChange={aoMudar}>
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder={rotuloNeutro} />
      </SelectTrigger>
      <SelectContent className={CLASSE_SELECT_MONO}>
        <SelectItem value={SENTINELA_NEUTRO}>{rotuloNeutro}</SelectItem>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>{anoAtual}</SelectLabel>
          {meses.map((o) => <SelectItem key={o.value} value={o.value}>{o.rotulo}</SelectItem>)}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Futuro (janeiro)</SelectLabel>
          {futuros.map((o) => <SelectItem key={o.value} value={o.value}>{o.rotulo}</SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
