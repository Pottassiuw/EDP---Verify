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
        <CardTitle style={{ fontSize: 14 }}>🔗 Hierarquia Manual</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Label>Nota Mãe</Label>
            <Input value={maeInput} placeholder="ex: 100123456"
                   onChange={(e) => setMaeInput(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') void buscar(); }}
                   style={{ width: 180 }} />
          </div>
          <Button size="sm" variant="outline" disabled={buscando || !maeInput.trim()}
                  onClick={() => void buscar()}>
            {buscando ? 'Buscando…' : 'Buscar'}
          </Button>
        </div>

        {hierarquia && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {hierarquia.filhas.length > 0 && (
              <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: 0 }}>
                Filhas atuais: {hierarquia.filhas.map((f) => f.Numero_Nota).join(', ')}
              </p>
            )}
            {candidatas.length > 0 ? (
              <React.Fragment>
                <span style={{ fontSize: 12.5 }}>
                  {candidatas.length} candidata(s) — mesmo conjunto, órfãs:
                </span>
                <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {candidatas.map((r) => (
                    <label key={r.Numero_Nota}
                           style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, cursor: 'pointer' }}>
                      <input type="checkbox" checked={filhasSelecionadas.has(r.Numero_Nota)}
                             onChange={() => toggleFilha(r.Numero_Nota)} />
                      <span className="edp-mono">{r.Numero_Nota}</span>
                      <span style={{ color: 'var(--text-dim)' }}>
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
              <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: 0 }}>
                Nenhuma nota órfã candidata no mesmo conjunto.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
