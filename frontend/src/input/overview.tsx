import React from 'react';
import type { InputDataset, NotaInput } from './types';
import { InputApi, baixarBlob } from './api';
import { toast } from 'sonner';
import { aplicarFiltros, parseBuscaGlobal } from './lib';
import { COLUNAS } from './columns';
import { Filters, FILTROS_INICIAIS, type FiltersState } from './filters';
import { DataGrid } from './data-grid';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

interface SugestaoDetetive {
  Nota_Filha_Orfa: number;
  Possivel_Nota_Mae: string;
}

const PALAVRAS_PROIBIDAS = ['SUBSTITUIDA', 'SUBSTITUÍDA', 'SUBST.', 'SUBST ', 'CANCELADA'];

function varrerVinculos(registros: NotaInput[]): SugestaoDetetive[] {
  const dictConj: Record<string, string> = {};
  for (const r of registros) {
    dictConj[String(r.Numero_Nota)] = String(r['Conjunto'] ?? '').trim().toUpperCase();
  }
  const orfas = registros.filter((r) => {
    const mae = String(r['Nota_Mae'] ?? '-').trim();
    return (mae === '-' || mae === '' || mae === 'None') && Number(r['Planejado_DDPM']) === 0;
  });
  const seen = new Set<number>();
  const sugestoes: SugestaoDetetive[] = [];
  for (const row of orfas) {
    const texto = `${String(row['Status_Obra'] ?? '')} ${String(row['Observacao'] ?? '')}`.toUpperCase();
    if (PALAVRAS_PROIBIDAS.some((p) => texto.includes(p))) continue;
    const nums = [...texto.matchAll(/\b\d{6,9}\b/g)].map((m) => m[0]);
    const conjOrfa = String(row['Conjunto'] ?? '').trim().toUpperCase();
    for (const num of nums) {
      if (num in dictConj && num !== String(row.Numero_Nota) && dictConj[num] === conjOrfa) {
        if (!seen.has(row.Numero_Nota)) {
          seen.add(row.Numero_Nota);
          sugestoes.push({ Nota_Filha_Orfa: row.Numero_Nota, Possivel_Nota_Mae: num });
        }
        break;
      }
    }
  }
  return sugestoes;
}

export function filtrarRegistros(registros: NotaInput[], estado: FiltersState): NotaInput[] {
  let resultado = registros;
  const numeros = parseBuscaGlobal(estado.busca);
  if (estado.busca.trim() !== '') {
    resultado = numeros.length ? resultado.filter((r) => numeros.includes(r.Numero_Nota)) : [];
  }
  return aplicarFiltros(resultado, estado.filtros);
}

export function Overview({ dados }: { dados: InputDataset }): React.JSX.Element {
  const [estado, setEstado] = React.useState<FiltersState>(FILTROS_INICIAIS);
  const [exportando, setExportando] = React.useState(false);
  const [sugestoes, setSugestoes] = React.useState<SugestaoDetetive[] | null>(null);
  const [rodando, setRodando] = React.useState(false);
  const [aplicando, setAplicando] = React.useState(false);
  const filtrados = React.useMemo(
    () => filtrarRegistros(dados.registros, estado), [dados.registros, estado]);

  function iniciarDetetive(): void {
    setRodando(true);
    setSugestoes(null);
    setTimeout(() => {
      setSugestoes(varrerVinculos(dados.registros));
      setRodando(false);
    }, 0);
  }

  function aplicarSugestoes(lista: SugestaoDetetive[]): void {
    const acao = () => {
      const payload: Record<string, number[]> = {};
      for (const s of lista) {
        if (!payload[s.Possivel_Nota_Mae]) payload[s.Possivel_Nota_Mae] = [];
        payload[s.Possivel_Nota_Mae].push(s.Nota_Filha_Orfa);
      }
      setAplicando(true);
      InputApi.vincularHierarquia(payload)
        .then(() => {
          toast.success(`${lista.length} vínculo(s) aplicado(s).`);
          setSugestoes(null);
        })
        .catch((e: unknown) => {
          toast.error('Falha ao vincular', { description: e instanceof Error ? e.message : String(e) });
        })
        .finally(() => setAplicando(false));
    };
    acao();
  }

  async function exportar(): Promise<void> {
    setExportando(true);
    try {
      const blob = await InputApi.exportar(
        filtrados.map((r) => r.Numero_Nota), COLUNAS.map((c) => c.key));
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
      baixarBlob(blob, `export_notas_${stamp}.xlsx`);
      toast.success('Exportação concluída');
    } catch (e) {
      toast.error('Falha na exportação', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setExportando(false);
    }
  }

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: 18, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
          Total de registros: <strong className="edp-mono">{filtrados.length}</strong>
          {filtrados.length !== dados.registros.length ? ` de ${dados.registros.length}` : ''}
        </span>
        <Button variant="outline" size="sm" disabled={exportando || filtrados.length === 0} onClick={() => { void exportar(); }}>
          {exportando ? 'Gerando…' : '⬇ Exportar Excel'}
        </Button>
      </div>
      <Filters registros={dados.registros} estado={estado} setEstado={setEstado} />
      <DataGrid registros={filtrados} colunas={COLUNAS} />

      {/* Detetive de Vínculos */}
      <Card>
        <CardHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <CardTitle style={{ fontSize: 14 }}>🕵️ Detetive de Vínculos</CardTitle>
            <Button size="sm" variant="outline" disabled={rodando} onClick={iniciarDetetive}>
              {rodando ? 'Analisando…' : '🔎 Iniciar Varredura'}
            </Button>
          </div>
        </CardHeader>
        {sugestoes !== null && (
          <CardContent>
            {sugestoes.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: 0 }}>
                Nenhuma sugestão encontrada.
              </p>
            ) : (() => {
              const agrupado = sugestoes.reduce<Record<string, number[]>>((acc, s) => {
                if (!acc[s.Possivel_Nota_Mae]) acc[s.Possivel_Nota_Mae] = [];
                acc[s.Possivel_Nota_Mae].push(s.Nota_Filha_Orfa);
                return acc;
              }, {});
              const textoCopia = Object.entries(agrupado)
                .map(([mae, filhas]) => `MÃE: ${mae}\nFILHAS: ${filhas.join(', ')}\n${'-'.repeat(30)}`)
                .join('\n');
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={{ fontSize: 12.5 }}>
                    <strong>{sugestoes.length}</strong> sugestão(ões) encontrada(s):
                  </span>
                  <Textarea
                    readOnly
                    value={textoCopia}
                    rows={Math.min(12, Object.keys(agrupado).length * 3 + 2)}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                  />
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Button size="sm" disabled={aplicando} onClick={() => aplicarSugestoes(sugestoes)}>
                      🔗 Aplicar todos os vínculos ({sugestoes.length})
                    </Button>
                    <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
                      Define Nota_Mae nas filhas via /api/input/hierarquia
                    </span>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        )}
      </Card>

    </div>
  );
}
