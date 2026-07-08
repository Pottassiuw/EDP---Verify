import React from 'react';
import type { HierarquiaInfo, NotaInput } from './types';
import { InputApi } from './api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface HierarquiaCardProps {
  registros: NotaInput[];
  recarregar: () => Promise<void>;
}

export function HierarquiaCard({ registros, recarregar }: HierarquiaCardProps): React.JSX.Element {
  const [maeInput, setMaeInput] = React.useState('');
  const [hierarquia, setHierarquia] = React.useState<HierarquiaInfo | null>(null);
  const [buscando, setBuscando] = React.useState(false);
  const [filhasSelecionadas, setFilhasSelecionadas] = React.useState<Set<number>>(new Set());
  const [vinculando, setVinculando] = React.useState(false);

  const candidatas = React.useMemo(() => {
    if (!hierarquia) return [];
    const maenota = registros.find((r) => r.Numero_Nota === Number(maeInput));
    if (!maenota) return [];
    const conjMae = String(maenota['Conjunto'] ?? '').trim().toUpperCase();
    return registros.filter((r) => {
      const mae = String(r['Nota_Mae'] ?? '-').trim();
      return (mae === '-' || mae === '' || mae === 'None')
        && Number(r['Planejado_DDPM']) === 0
        && String(r['Conjunto'] ?? '').trim().toUpperCase() === conjMae
        && r.Numero_Nota !== Number(maeInput);
    });
  }, [registros, hierarquia, maeInput]);

  async function buscar(): Promise<void> {
    const n = Number(maeInput.trim());
    if (!n) return;
    setBuscando(true);
    try {
      setHierarquia(await InputApi.obterHierarquia(n));
      setFilhasSelecionadas(new Set());
    } catch (e) {
      toast.error('Nota não encontrada', { description: e instanceof Error ? e.message : String(e) });
      setHierarquia(null);
    } finally {
      setBuscando(false);
    }
  }

  async function vincular(): Promise<void> {
    if (filhasSelecionadas.size === 0) return;
    setVinculando(true);
    try {
      const { atualizadas } = await InputApi.vincularHierarquia({
        [maeInput]: [...filhasSelecionadas],
      });
      toast.success(`${atualizadas} vínculo(s) aplicado(s).`);
      setFilhasSelecionadas(new Set());
      await recarregar();
      setHierarquia(await InputApi.obterHierarquia(Number(maeInput)));
    } catch (e) {
      toast.error('Falha ao vincular', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setVinculando(false);
    }
  }

  function toggleFilha(numero: number): void {
    setFilhasSelecionadas((prev) => {
      const s = new Set(prev);
      if (s.has(numero)) s.delete(numero); else s.add(numero);
      return s;
    });
  }

  return (
    <Card>
      <CardHeader>
        <span className="edp-eyebrow">Hierarquia manual</span>
        <CardTitle className="edp-title text-[15px]">Vincular nota-mãe</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-[10px] items-end mb-[14px]">
          <div className="flex flex-col gap-[4px]">
            <Label htmlFor="hier-nota-mae">Nota Mãe</Label>
            <Input id="hier-nota-mae" value={maeInput} placeholder="ex: 100123456"
                   onChange={(e) => setMaeInput(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') void buscar(); }}
                   className="w-[180px]" />
          </div>
          <Button size="sm" variant="outline" disabled={buscando || !maeInput.trim()}
                  onClick={() => void buscar()}>
            {buscando ? 'Buscando…' : 'Buscar'}
          </Button>
        </div>

        {hierarquia && (
          <div className="flex flex-col gap-[10px]">
            {hierarquia.filhas.length > 0 && (
              <p className="text-[12.5px] text-text-dim m-[0px]">
                Filhas atuais: {hierarquia.filhas.map((f) => f.Numero_Nota).join(', ')}
              </p>
            )}
            {candidatas.length > 0 ? (
              <React.Fragment>
                <span className="text-[12.5px]">
                  {candidatas.length} candidata(s) — mesmo conjunto, órfãs:
                </span>
                <div className="max-h-[200px] overflow-y-auto flex flex-col gap-[4px]">
                  {candidatas.map((r) => (
                    <label key={r.Numero_Nota}
                           className="flex gap-[8px] items-center text-[12.5px] cursor-pointer">
                      <input type="checkbox" checked={filhasSelecionadas.has(r.Numero_Nota)}
                             onChange={() => toggleFilha(r.Numero_Nota)} />
                      <span className="edp-mono">{r.Numero_Nota}</span>
                      <span className="text-text-dim">
                        {String(r['Status_Nota'] ?? '-')} · {String(r['Conjunto'] ?? '-')}
                      </span>
                    </label>
                  ))}
                </div>
                <div>
                  <Button size="sm" disabled={vinculando || filhasSelecionadas.size === 0}
                          onClick={() => void vincular()}>
                    🔗 Vincular selecionadas ({filhasSelecionadas.size})
                  </Button>
                </div>
              </React.Fragment>
            ) : (
              <p className="text-[12.5px] text-text-dim m-[0px]">
                Nenhuma nota órfã candidata no mesmo conjunto.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
