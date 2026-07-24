import React from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export interface ParsedIds {
  ids: number[];
  invalidos: string[];
  repetidos: number;
}

export function parseCoffeeIds(value: string): ParsedIds {
  const tokens = value.split(/[\s,;]+/).filter(Boolean);
  const validos = tokens
    .filter((token) => /^\d+$/.test(token) && Number(token) > 0)
    .map(Number);
  const ids = [...new Set(validos)];

  return {
    ids,
    invalidos: tokens.filter(
      (token) => !/^\d+$/.test(token) || Number(token) <= 0,
    ),
    repetidos: validos.length - ids.length,
  };
}

interface OperacaoComposerProps {
  pending: boolean;
  onConsultar: (ids: number[]) => void;
}

export function OperacaoComposer({
  pending,
  onConsultar,
}: OperacaoComposerProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState('');
  const parsed = React.useMemo(() => parseCoffeeIds(value), [value]);

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus /> Adicionar notas
      </Button>
    );
  }

  return (
    <section className="rounded-[11px] border border-line bg-surface p-4">
      <label htmlFor="coffee-operation-ids" className="edp-eyebrow">
        IDs COFFEE
      </label>
      <Textarea
        id="coffee-operation-ids"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Cole IDs separados por espaço, vírgula ou linha"
        className="mt-2 min-h-24 font-mono"
        disabled={pending}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-text-mute">
        <span>{parsed.ids.length} válidos</span>
        <span>{parsed.repetidos} repetidos</span>
        <span>{parsed.invalidos.length} inválidos</span>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button
          size="sm"
          disabled={parsed.ids.length === 0 || pending}
          onClick={() => {
            onConsultar(parsed.ids);
            setValue('');
            setOpen(false);
          }}
        >
          <Search /> Consultar
        </Button>
      </div>
    </section>
  );
}
