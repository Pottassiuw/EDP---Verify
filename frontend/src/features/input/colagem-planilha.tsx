import React from 'react';
import type { ColunaDef } from './columns';
import type { NotaInput } from './types';
import { NotesTable } from './notes-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface ColagemPlanilhaProps {
  titulo: string;
  colunasColagem: string[];
  colunasPreview: ColunaDef[];
  rotulos: Record<string, string>;
  texto: string;
  setTexto: (v: string) => void;
  preview: Array<Partial<NotaInput>>;
  salvando: boolean;
  rotuloSalvar: string;
  onSalvar: () => void;
}

export function ColagemPlanilha({
  titulo, colunasColagem, colunasPreview, rotulos, texto, setTexto,
  preview, salvando, rotuloSalvar, onSalvar,
}: ColagemPlanilhaProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader><CardTitle>{titulo}</CardTitle></CardHeader>
      <CardContent>
        <p className="text-[12.5px] text-text-dim mt-[0px] mx-[0px] mb-[10px]">
          Cole as linhas copiadas do Excel (sem cabeçalho), na ordem das colunas abaixo.
        </p>

        <div className="rounded-[8px] border border-line overflow-hidden">
          <div className="flex bg-[var(--surface-2)] border-b border-line">
            {colunasColagem.map((c) => (
              <span key={c}
                    className="flex-1 min-w-0 px-[10px] py-[6px] font-mono text-[10px] font-medium
                               tracking-[0.14em] uppercase text-text-mute border-r border-line
                               last:border-r-0 whitespace-nowrap overflow-hidden text-ellipsis">
                {rotulos[c] ?? c}
              </span>
            ))}
          </div>
          <Textarea value={texto} rows={8} placeholder="Ctrl+V com as linhas do Excel…"
                    onChange={(e) => setTexto(e.target.value)}
                    className="border-0 rounded-none font-mono text-[12px] focus-visible:ring-0" />
        </div>

        {preview.length > 0 && (
          <div className="mt-[12px] flex flex-col gap-[10px]">
            <span className="text-[12.5px]">
              {preview.length} linha(s) reconhecida(s) — confira antes de salvar:
            </span>
            <NotesTable colunas={colunasPreview}
                        registros={preview.map((r, i) => ({
                          ...r, Numero_Nota: Number(r.Numero_Nota) || -(i + 1),
                        })) as unknown as NotaInput[]}
                        altura={240} />
            <div>
              <Button disabled={salvando} onClick={onSalvar}>💾 {rotuloSalvar}</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
