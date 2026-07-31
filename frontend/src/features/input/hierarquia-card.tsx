import React from 'react';
import type { HierarquiaInfo, NotaInput } from './types';
import { InputApi } from './api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eyebrow } from '@/components/branded/section';

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
    <Card className="border border-line bg-surface shadow-sm">
      <CardHeader className="pb-3">
        <Eyebrow className="text-xs tracking-wider">Hierarquia Manual</Eyebrow>
        <CardTitle className="text-base font-semibold text-foreground">Vincular Nota-Mãe e Filhas</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3 items-end mb-4 flex-wrap">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hier-nota-mae" className="text-xs text-text-dim">Nota Mãe (ID)</Label>
            <Input
              id="hier-nota-mae"
              value={maeInput}
              placeholder="ex: 100123456"
              onChange={(e) => setMaeInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void buscar(); }}
              className="w-48 h-9 text-xs bg-bg-2 border-line font-mono"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-9 px-3 text-xs"
            disabled={buscando || !maeInput.trim()}
            onClick={() => void buscar()}
          >
            {buscando ? 'Buscando...' : 'Buscar Nota'}
          </Button>
        </div>

        {hierarquia && (
          <div className="flex flex-col gap-3 pt-2 border-t border-line">
            {hierarquia.filhas.length > 0 && (
              <div className="text-xs text-text-dim flex items-center gap-1.5 bg-surface-2 p-2.5 rounded-md border border-line">
                <span className="font-semibold text-foreground">Filhas atuais ({hierarquia.filhas.length}):</span>
                <span className="font-mono text-accent">{hierarquia.filhas.map((f) => f.Numero_Nota).join(', ')}</span>
              </div>
            )}
            {candidatas.length > 0 ? (
              <React.Fragment>
                <span className="text-xs text-text-dim font-medium">
                  {candidatas.length} nota(s) candidata(s) órfãs no mesmo conjunto:
                </span>
                <div className="max-h-48 overflow-y-auto flex flex-col gap-1.5 p-2 bg-bg-2/50 rounded-md border border-line">
                  {candidatas.map((r) => (
                    <label
                      key={r.Numero_Nota}
                      className="flex gap-2.5 items-center text-xs p-1.5 rounded hover:bg-surface transition-colors cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="rounded border-line text-accent focus:ring-accent"
                        checked={filhasSelecionadas.has(r.Numero_Nota)}
                        onChange={() => toggleFilha(r.Numero_Nota)}
                      />
                      <span className="font-mono text-foreground font-semibold">{r.Numero_Nota}</span>
                      <span className="text-text-dim">
                        {String(r['Status_Nota'] ?? '-')} · {String(r['Conjunto'] ?? '-')}
                      </span>
                    </label>
                  ))}
                </div>
                <div>
                  <Button
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    disabled={vinculando || filhasSelecionadas.size === 0}
                    onClick={() => void vincular()}
                  >
                    Vincular Selecionadas ({filhasSelecionadas.size})
                  </Button>
                </div>
              </React.Fragment>
            ) : (
              <p className="text-xs text-text-mute italic m-0">
                Nenhuma nota órfã candidata no mesmo conjunto.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
