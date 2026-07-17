import React from 'react';
import type { InputDataset, NotaInput } from './types';
import { InputApi } from './api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SegTabs } from '@/components/branded/section';

interface RateioProps {
  dados: InputDataset;
  recarregar: () => Promise<void>;
}

function ehNotaAtiva(status: string | number | null | undefined): boolean {
  if (status === null || status === undefined) return false;
  const stUpper = String(status).trim().toUpperCase();
  const blacklist = ["ENCE CANC", "SUPR CANC", "ENCE EXEC", "SUPR", "999", "998", "997", "55", "99"];
  if (blacklist.includes(stUpper)) return false;
  if (stUpper.startsWith("55") || stUpper.startsWith("99")) return false;
  return true;
}

function ehNotaMaeValida(val: string | number | null | undefined): boolean {
  if (val === null || val === undefined) return false;
  const valStr = String(val).trim();
  if (/^\d+$/.test(valStr)) {
    return parseInt(valStr, 10) > 0;
  }
  return false;
}

function limparNotaMae(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  try {
    const parsed = parseFloat(String(val).trim());
    return Number.isNaN(parsed) ? '' : String(Math.floor(parsed));
  } catch {
    return '';
  }
}

function extrairValorUnidadeMedida(medida: string | null | undefined): [number, 'km' | 'un' | null] {
  if (!medida || medida === '-') return [0, null];
  const medLower = medida.toLowerCase().replace(',', '.');
  if (medLower.includes('km')) {
    const match = medLower.match(/([\d.]+)\s*km/);
    if (match) return [parseFloat(match[1]), 'km'];
  }
  if (medLower.includes('un')) {
    const match = medLower.match(/([\d.]+)\s*un/);
    if (match) return [parseFloat(match[1]), 'un'];
  }
  return [0, null];
}

interface RelatorioItem {
  Nota: number;
  Status: 'OK' | 'ERRO' | 'TESTE';
  Mensagem: string;
}

export function Rateio({ dados, recarregar }: RateioProps): React.JSX.Element {
  // SAP GUI Credentials State
  const [loginSap, setLoginSap] = React.useState('');
  const [senhaSap, setSenhaSap] = React.useState('');
  const [modoTeste, setModoTeste] = React.useState(true);
  const [forcarValidacao, setForcarValidacao] = React.useState(false);
  const [loadingRobot, setLoadingRobot] = React.useState(false);

  // Tabs navigation: 'hierarquico' | 'individual'
  const [subTab, setSubTab] = React.useState<'hierarquico' | 'individual'>('hierarquico');

  // Relatório de execução
  const [relatorio, setRelatorio] = React.useState<RelatorioItem[] | null>(null);

  // 1. FILTERING FOR MOTHER-DAUGHTER VÍNCULOS
  const ativas = React.useMemo(() => dados.registros.filter((r) => ehNotaAtiva(r.Status_Nota)), [dados.registros]);

  const dfComMae = React.useMemo(() => {
    return ativas
      .map((r): NotaInput & { Nota_Mae_Limpa: string } => ({ ...r, Nota_Mae_Limpa: limparNotaMae(r['Nota_Mae']) }))
      .filter((r) => ehNotaMaeValida(r.Nota_Mae_Limpa) && r.Nota_Mae_Limpa !== '');
  }, [ativas]);

  // Status mapping for mother active check
  const statusMap = React.useMemo(() => {
    const map = new Map<string, string>();
    dados.registros.forEach((r) => {
      map.set(String(r.Numero_Nota), String(r.Status_Nota ?? '-'));
    });
    return map;
  }, [dados.registros]);

  const ativasComMae = React.useMemo(() => {
    return dfComMae.filter((r) => {
      const stMae = statusMap.get(r.Nota_Mae_Limpa) ?? '-';
      return ehNotaAtiva(stMae);
    });
  }, [dfComMae, statusMap]);

  // Unique mother notes that have some planning discrepancy in them or in their daughters
  const notasMaesUnicas = React.useMemo(() => {
    const maes = new Set<string>();
    const uniqueMaes = Array.from(new Set(ativasComMae.map((r) => r.Nota_Mae_Limpa)));

    uniqueMaes.forEach((maeId) => {
      const maeRow = dados.registros.find((r) => String(r.Numero_Nota) === maeId);
      const maeDiv = maeRow?.['Medida_vs_Planejado'] === 'Não';

      const filhas = ativasComMae.filter((r) => r.Nota_Mae_Limpa === maeId);
      const filhasDiv = filhas.some((r) => r['Medida_vs_Planejado'] === 'Não');

      if (maeDiv || filhasDiv) {
        maes.add(maeId);
      }
    });

    return Array.from(maes).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [ativasComMae, dados.registros]);

  // --- STATE FOR HIERARCHICAL TABS ---
  const [maeSelecionada, setMaeSelecionada] = React.useState('');
  const [novasMedidasHier, setNovasMedidasHier] = React.useState<Record<number, number>>({});

  // Reset hierarchical input measures when selecting a mother note
  React.useEffect(() => {
    if (!maeSelecionada) return;
    const maeRow = dados.registros.find((r) => String(r.Numero_Nota) === maeSelecionada);
    const filhas = ativasComMae.filter((r) => r.Nota_Mae_Limpa === maeSelecionada);
    const initial: Record<number, number> = {};
    if (maeRow) {
      initial[maeRow.Numero_Nota] = Number(maeRow['Planejado_DDPM'] ?? 0);
    }
    filhas.forEach((f) => {
      initial[f.Numero_Nota] = Number(f['Planejado_DDPM'] ?? 0);
    });
    setNovasMedidasHier(initial);
    setRelatorio(null);
  }, [maeSelecionada, ativasComMae, dados.registros]);

  // Mother details calculations
  const maeRowDetails = React.useMemo(() => {
    return dados.registros.find((r) => String(r.Numero_Nota) === maeSelecionada);
  }, [maeSelecionada, dados.registros]);

  const filhasDaMae = React.useMemo(() => {
    return ativasComMae.filter((r) => r.Nota_Mae_Limpa === maeSelecionada);
  }, [maeSelecionada, ativasComMae]);

  const undMae = React.useMemo(() => {
    if (!maeRowDetails) return 'km';
    const [, und] = extrairValorUnidadeMedida(maeRowDetails['Medida_SAP'] as string);
    if (und) return und;
    const valMae = Number(maeRowDetails['Planejado_DDPM'] ?? 0.0);
    return Number.isInteger(valMae) && valMae <= 50 ? 'un' : 'km';
  }, [maeRowDetails]);

  // Metrics for Hierarchical Rateio
  const valMaeTarget = React.useMemo(() => {
    if (!maeRowDetails) return 0;
    const valMae = Number(maeRowDetails['Planejado_DDPM'] ?? 0.0);
    const valPlanFilhas = filhasDaMae.reduce((acc, f) => acc + Number(f['Planejado_DDPM'] ?? 0.0), 0);
    return valMae + valPlanFilhas;
  }, [maeRowDetails, filhasDaMae]);

  const somaFilhas = React.useMemo(() => {
    return Object.values(novasMedidasHier).reduce((acc, v) => acc + v, 0);
  }, [novasMedidasHier]);

  const diferenca = valMaeTarget - somaFilhas;
  const tolerancia = undMae === 'km' ? 0.010 : 0.0;
  const somaFechada = forcarValidacao ? true : Math.abs(diferenca) <= (tolerancia + 1e-7);

  // Validate integer check for "un" unit
  const unidadeCorreta = React.useMemo(() => {
    if (undMae !== 'un') return true;
    return Object.values(novasMedidasHier).every((val) => Number.isInteger(val));
  }, [novasMedidasHier, undMae]);

  // --- STATE FOR INDIVIDUAL TAB ---
  const dfDivergentes = React.useMemo(() => {
    return dados.registros.filter((r) => r['Medida_vs_Planejado'] === 'Não' && ehNotaAtiva(r['Status_Nota']));
  }, [dados.registros]);

  const [selecionadasInd, setSelecionadasInd] = React.useState<Set<number>>(new Set());
  const [novasMedidasInd, setNovasMedidasInd] = React.useState<Record<number, number>>({});
  const [unidadesInd, setUnidadesInd] = React.useState<Record<number, 'km' | 'un'>>({});

  // Reset individual state when the component mounts or list changes
  React.useEffect(() => {
    const sel = new Set<number>();
    const measures: Record<number, number> = {};
    const units: Record<number, 'km' | 'un'> = {};

    dfDivergentes.forEach((r) => {
      sel.add(r.Numero_Nota);
      measures[r.Numero_Nota] = Number(r['Planejado_DDPM'] ?? 0);
      const [, und] = extrairValorUnidadeMedida(r['Medida_SAP'] as string);
      if (und) {
        units[r.Numero_Nota] = und;
      } else {
        const valPlan = Number(r['Planejado_DDPM'] ?? 0.0);
        units[r.Numero_Nota] = Number.isInteger(valPlan) && valPlan <= 50 ? 'un' : 'km';
      }
    });

    setSelecionadasInd(sel);
    setNovasMedidasInd(measures);
    setUnidadesInd(units);
    setRelatorio(null);
  }, [dfDivergentes]);

  // Validate Individual unit inputs
  const individualValido = React.useMemo(() => {
    let ok = true;
    dfDivergentes.forEach((r) => {
      if (!selecionadasInd.has(r.Numero_Nota)) return;
      const val = novasMedidasInd[r.Numero_Nota] ?? 0;
      const unit = unidadesInd[r.Numero_Nota] ?? 'km';
      if (unit === 'un' && !Number.isInteger(val)) {
        ok = false;
      }
    });
    return ok;
  }, [dfDivergentes, selecionadasInd, novasMedidasInd, unidadesInd]);

  // --- ACTIONS ---

  async function executarNoSap(): Promise<void> {
    if (loadingRobot) return;
    setRelatorio(null);

    const correcoes: Array<{ nota: number; quantidade: number; unidade: string }> = [];

    if (subTab === 'hierarquico') {
      if (!maeSelecionada) return;
      if (!somaFechada || !unidadeCorreta) {
        toast.error('O robô não pode ser executado devido a pendências de validação.');
        return;
      }
      // Adds mother and daughters
      const rows = [maeRowDetails!, ...filhasDaMae];
      rows.forEach((r) => {
        correcoes.push({
          nota: r.Numero_Nota,
          quantidade: novasMedidasHier[r.Numero_Nota] ?? 0,
          unidade: undMae,
        });
      });
    } else {
      if (selecionadasInd.size === 0) {
        toast.warning('Nenhuma nota selecionada para correção.');
        return;
      }
      if (!individualValido) {
        toast.error('Erro de validação: valores decimais em unidades do tipo "un" (Equipamento).');
        return;
      }

      dfDivergentes.forEach((r) => {
        if (!selecionadasInd.has(r.Numero_Nota)) return;
        correcoes.push({
          nota: r.Numero_Nota,
          quantidade: novasMedidasInd[r.Numero_Nota] ?? 0,
          unidade: unidadesInd[r.Numero_Nota] ?? 'km',
        });
      });
    }

    setLoadingRobot(true);
    const p = InputApi.executarRateio(correcoes, loginSap.trim() || undefined, senhaSap.trim() || undefined, modoTeste);

    toast.promise(p, {
      loading: `Disparando robô SAP para ajustar ${correcoes.length} notas... 🤖`,
      success: (res) => {
        setRelatorio(res.relatorio);
        void recarregar();
        return modoTeste
          ? 'Simulação do Robô SAP executada com sucesso!'
          : 'Gravação Real concluída! Planilha IW66 e banco de dados atualizados.';
      },
      error: (e: unknown) => {
        return `Falha no Robô SAP: ${e instanceof Error ? e.message : String(e)}`;
      },
    });

    try {
      await p;
    } catch {
      // Ignora erro aqui, tratado pelo toast.promise
    } finally {
      setLoadingRobot(false);
    }
  }

  function handleIndCheckboxToggle(nota: number): void {
    setSelecionadasInd((prev) => {
      const next = new Set(prev);
      if (next.has(nota)) next.delete(nota); else next.add(nota);
      return next;
    });
  }

  return (
    <div className="edp-page overflow-y-auto">
      <div className="mb-[24px]">
        <span className="edp-eyebrow">Rateio de Medidas</span>
        <h2 className="edp-title text-[18px]">Ajuste e Rateio de Medidas SAP</h2>
        <p className="text-[12.5px] text-text-mute mt-[4px]">
          Distribua ou corrija as medidas físicas de suas notas diretamente no SAP GUI de forma estruturada e validada.
        </p>
      </div>

      {/* SAP GUI CREDENTIALS CARD */}
      <Card className="mb-[24px] border-line">
        <CardHeader className="pb-[12px]">
          <CardTitle className="text-[14px] font-semibold flex items-center gap-[8px]">
            🤖 Autenticação SAP GUI
          </CardTitle>
          <p className="text-[11.5px] text-text-mute m-0">
            Se você já estiver com o SAP GUI aberto e logado, o robô utilizará sua sessão ativa e não precisará do usuário/senha abaixo.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex gap-[16px] flex-wrap items-end">
            <div className="flex flex-col gap-[6px] w-[180px]">
              <Label htmlFor="sap-usr" className="text-[12px] text-text-mute">Usuário SAP (Opcional)</Label>
              <Input id="sap-usr" value={loginSap} onChange={(e) => setLoginSap(e.target.value)}
                     className="h-[32px] text-[13px]" placeholder="Ex: C123456" />
            </div>
            <div className="flex flex-col gap-[6px] w-[180px]">
              <Label htmlFor="sap-pwd" className="text-[12px] text-text-mute">Senha SAP (Opcional)</Label>
              <Input id="sap-pwd" type="password" value={senhaSap} onChange={(e) => setSenhaSap(e.target.value)}
                     className="h-[32px] text-[13px]" placeholder="••••••••" />
            </div>
            <div className="flex items-center gap-[8px] h-[32px]">
              <Switch checked={!modoTeste} onCheckedChange={(val) => setModoTeste(!val)} id="modo-real" />
              <Label htmlFor="modo-real" className="text-[12.5px] font-medium cursor-pointer">
                {!modoTeste ? '🔴 Gravar no SAP (Modo Real)' : '🟡 Apenas Simular (Modo Teste)'}
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* TABS SELECT */}
      <div className="border-b border-line mb-[20px]">
        <SegTabs
          tabs={[
            { id: 'hierarquico', rotulo: 'Rateio Hierárquico (Mãe/Filhas)' },
            { id: 'individual', rotulo: 'Referência Individual (Divergências)' },
          ]}
          value={subTab}
          onChange={(val) => {
            setSubTab(val as 'hierarquico' | 'individual');
            setRelatorio(null);
          }}
          ariaLabel="Abas do Rateio de Medidas"
        />
      </div>

      {subTab === 'hierarquico' ? (
        // --- RATEIO HIERÁRQUICO VIEW ---
        <div className="flex flex-col gap-[20px]">
          {notasMaesUnicas.length === 0 ? (
            <div className="p-[24px] text-center border border-dashed border-line rounded-[8px] text-text-mute text-[13px]">
              Nenhum vínculo de hierarquia (Notas Filhas com Nota Mãe) com divergências de medição no banco atualmente.
            </div>
          ) : (
            <div className="flex flex-col gap-[16px]">
              {/* Select Mother Note */}
              <div className="flex flex-col gap-[6px] w-[340px]">
                <Label htmlFor="select-mae" className="text-[12.5px] font-medium">Selecione a Nota Mãe:</Label>
                <select
                  id="select-mae"
                  value={maeSelecionada}
                  onChange={(e) => setMaeSelecionada(e.target.value)}
                  className="h-[34px] rounded-[6px] border border-line bg-surface px-[10px] text-[13px] outline-none"
                >
                  <option value="">Selecione...</option>
                  {notasMaesUnicas.map((maeId) => {
                    const maeRow = dados.registros.find((r) => String(r.Numero_Nota) === maeId);
                    const plan = maeRow?.Planejado_DDPM ?? 0;
                    const sap = maeRow?.Medida_SAP ?? '-';
                    const conj = maeRow?.Conjunto ?? '-';
                    const label = `Nota ${maeId} | ${conj} (Plan: ${plan} | SAP: ${sap})`;
                    return (
                      <option key={maeId} value={maeId}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>

              {maeRowDetails && (
                <div className="flex flex-col gap-[16px]">
                  {/* Mother Details Card */}
                  <Card className="bg-surface-2 border-line">
                    <CardContent className="pt-[16px] pb-[16px]">
                      <h4 className="text-[13px] font-semibold mb-[10px] text-text-mute">📌 Detalhes da Nota Mãe `{maeSelecionada}`</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-[16px] text-[12.5px]">
                        <div>
                          <div><span className="text-text-mute">Conjunto:</span> <strong>{maeRowDetails.Conjunto}</strong></div>
                          <div><span className="text-text-mute">Regional:</span> <strong>{maeRowDetails.Regional}</strong></div>
                        </div>
                        <div>
                          <div><span className="text-text-mute">Local Instalação:</span> <span className="edp-mono font-medium">{maeRowDetails.Local_Instalacao}</span></div>
                          <div><span className="text-text-mute">Status Nota:</span> <strong>{maeRowDetails.Status_Nota}</strong></div>
                        </div>
                        <div>
                          <div><span className="text-text-mute">Medida Correta (Planejado):</span> <strong>{maeRowDetails.Planejado_DDPM} {undMae}</strong></div>
                          <div><span className="text-text-mute">Medida Atual no SAP:</span> <strong>{maeRowDetails.Medida_SAP}</strong></div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Distribution Table */}
                  <div className="border border-line rounded-[8px] overflow-hidden bg-surface">
                    <table className="w-full border-collapse text-[12.5px] text-left">
                      <thead>
                        <tr className="bg-surface-2 border-b border-b-line text-text-mute">
                          <th className="py-[10px] px-[12px] font-medium">Tipo</th>
                          <th className="py-[10px] px-[12px] font-medium">Nº Nota</th>
                          <th className="py-[10px] px-[12px] font-medium">Local Instalação</th>
                          <th className="py-[10px] px-[12px] font-medium text-right">Planejado DDPM</th>
                          <th className="py-[10px] px-[12px] font-medium">Medida SAP Atual</th>
                          <th className="py-[10px] px-[12px] font-medium text-center">Medida vs Plan</th>
                          <th className="py-[10px] px-[12px] font-medium w-[150px]">Nova Medida ({undMae})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Mother row */}
                        <tr className="border-b border-b-line hover:bg-surface-2 font-semibold">
                          <td className="py-[10px] px-[12px] text-indigo">MÃE</td>
                          <td className="py-[10px] px-[12px] edp-mono">{maeRowDetails.Numero_Nota}</td>
                          <td className="py-[10px] px-[12px] edp-mono">{maeRowDetails.Local_Instalacao}</td>
                          <td className="py-[10px] px-[12px] text-right">{maeRowDetails.Planejado_DDPM}</td>
                          <td className="py-[10px] px-[12px]">{maeRowDetails.Medida_SAP}</td>
                          <td className="py-[10px] px-[12px] text-center">{maeRowDetails.Medida_vs_Planejado}</td>
                          <td className="py-[8px] px-[12px]">
                            <Input
                              type="number"
                              step={undMae === 'un' ? '1' : '0.001'}
                              value={novasMedidasHier[maeRowDetails.Numero_Nota] ?? 0}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value) || 0;
                                setNovasMedidasHier((prev) => ({ ...prev, [maeRowDetails.Numero_Nota]: v }));
                              }}
                              className="h-[28px] py-0 px-[6px] text-right text-[12.5px] border-line"
                            />
                          </td>
                        </tr>
                        {/* Daughters rows */}
                        {filhasDaMae.map((f) => (
                          <tr key={f.Numero_Nota} className="border-b border-b-line hover:bg-surface-2">
                            <td className="py-[10px] px-[12px] text-text-mute">FILHA</td>
                            <td className="py-[10px] px-[12px] edp-mono">{f.Numero_Nota}</td>
                            <td className="py-[10px] px-[12px] edp-mono">{f['Local_Instalacao']}</td>
                            <td className="py-[10px] px-[12px] text-right">{f['Planejado_DDPM']}</td>
                            <td className="py-[10px] px-[12px]">{f['Medida_SAP']}</td>
                            <td className="py-[10px] px-[12px] text-center">{f['Medida_vs_Planejado']}</td>
                            <td className="py-[8px] px-[12px]">
                              <Input
                                type="number"
                                step={undMae === 'un' ? '1' : '0.001'}
                                value={novasMedidasHier[f.Numero_Nota] ?? 0}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value) || 0;
                                  setNovasMedidasHier((prev) => ({ ...prev, [f.Numero_Nota]: v }));
                                }}
                                className="h-[28px] py-0 px-[6px] text-right text-[12.5px] border-line"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Hierarchical Metrics Panel */}
                  <div className="flex gap-[16px] flex-wrap items-stretch">
                    <Card className="flex-1 min-w-[200px] border-line bg-surface">
                      <CardContent className="pt-[14px] pb-[14px]">
                        <span className="text-[11.5px] text-text-mute uppercase tracking-[.04em]">Total Planejado (DDPM)</span>
                        <div className="text-[18px] font-bold mt-[4px]">
                          {valMaeTarget.toFixed(3)} {undMae}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="flex-1 min-w-[200px] border-line bg-surface">
                      <CardContent className="pt-[14px] pb-[14px]">
                        <span className="text-[11.5px] text-text-mute uppercase tracking-[.04em]">Soma Medidas Distribuídas</span>
                        <div className="text-[18px] font-bold mt-[4px]">
                          {somaFilhas.toFixed(3)} {undMae}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className={`flex-1 min-w-[200px] border ${somaFechada ? 'border-line' : 'border-red-400 bg-red-50/20'} bg-surface`}>
                      <CardContent className="pt-[14px] pb-[14px]">
                        <span className="text-[11.5px] text-text-mute uppercase tracking-[.04em]">Diferença Restante</span>
                        <div className={`text-[18px] font-bold mt-[4px] ${somaFechada ? 'text-green' : 'text-red'}`}>
                          {diferenca > 0 ? `+${diferenca.toFixed(3)}` : diferenca.toFixed(3)} {undMae}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Warnings & Force Overwrite */}
                  <div className="flex flex-col gap-[10px]">
                    {!somaFechada && (
                      <div className="p-[12px] bg-red-500/10 border border-red-500/20 text-red text-[12.5px] rounded-[6px]">
                        ⚠️ <strong>Bloqueio de Execução:</strong> A diferença restante ({Math.abs(diferenca).toFixed(3)} {undMae}) supera a tolerância de {tolerancia * 1000} metros/unidades.
                      </div>
                    )}
                    {somaFechada && Math.abs(diferenca) > 1e-5 && (
                      <div className="p-[12px] bg-amber-500/10 border border-amber-500/20 text-amber text-[12.5px] rounded-[6px]">
                        💡 <strong>Diferença Aceitável:</strong> Há uma pequena diferença de {Math.round(Math.abs(diferenca) * 1000)} mm/un que está dentro da tolerância de {tolerancia * 1000} metros.
                      </div>
                    )}
                    {undMae === 'un' && !unidadeCorreta && (
                      <div className="p-[12px] bg-red-500/10 border border-red-500/20 text-red text-[12.5px] rounded-[6px]">
                        ❌ <strong>Erro de Validação:</strong> Para a unidade &quot;un&quot; (Equipamentos), todas as medidas devem ser números inteiros. Valores decimais não são aceitos.
                      </div>
                    )}

                    <div className="flex gap-[16px] items-center flex-wrap mt-[6px]">
                      <div className="flex items-center gap-[8px]">
                        <input
                          type="checkbox"
                          id="forcar-val"
                          checked={forcarValidacao}
                          onChange={(e) => setForcarValidacao(e.target.checked)}
                          className="w-[15px] h-[15px]"
                        />
                        <Label htmlFor="forcar-val" className="text-[12.5px] cursor-pointer text-text-mute">
                          ⚠️ Forçar Execução (Ignorar Validação matemática)
                        </Label>
                      </div>
                      <Button
                        variant="default"
                        onClick={executarNoSap}
                        disabled={loadingRobot || (!somaFechada && !forcarValidacao) || (undMae === 'un' && !unidadeCorreta)}
                        className="ml-auto"
                      >
                        {loadingRobot ? 'Processando SAP...' : '🚀 Executar no SAP'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        // --- CORREÇÕES INDIVIDUAIS VIEW ---
        <div className="flex flex-col gap-[16px]">
          {dfDivergentes.length === 0 ? (
            <div className="p-[24px] text-center border border-dashed border-line rounded-[8px] text-text-mute text-[13px]">
              🎉 Nenhuma nota ativa com divergência de medição física encontrada no banco.
            </div>
          ) : (
            <div className="flex flex-col gap-[16px]">
              <p className="text-[12px] text-text-mute">
                Abaixo estão listadas todas as notas ativas cuja medição no SAP difere do planejado no DDPM. Selecione e ajuste os novos valores.
              </p>

              {/* Table */}
              <div className="border border-line rounded-[8px] overflow-hidden bg-surface max-h-[460px] overflow-y-auto">
                <table className="w-full border-collapse text-[12.5px] text-left">
                  <thead>
                    <tr className="bg-surface-2 border-b border-b-line text-text-mute sticky top-0">
                      <th className="py-[10px] px-[12px] font-medium w-[60px] text-center">Corrigir?</th>
                      <th className="py-[10px] px-[12px] font-medium">Nº Nota</th>
                      <th className="py-[10px] px-[12px] font-medium">Conjunto</th>
                      <th className="py-[10px] px-[12px] font-medium">Local Instalação</th>
                      <th className="py-[10px] px-[12px] font-medium text-right">Planejado DDPM</th>
                      <th className="py-[10px] px-[12px] font-medium">Medida SAP Atual</th>
                      <th className="py-[10px] px-[12px] font-medium">Nota Mãe</th>
                      <th className="py-[10px] px-[12px] font-medium w-[90px]">Unidade</th>
                      <th className="py-[10px] px-[12px] font-medium w-[140px]">Nova Medida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dfDivergentes.map((r) => {
                      const num = r.Numero_Nota;
                      const selected = selecionadasInd.has(num);
                      const unit = unidadesInd[num] ?? 'km';
                      const val = novasMedidasInd[num] ?? 0;
                      const isUnValError = unit === 'un' && !Number.isInteger(val) && selected;

                      return (
                        <tr key={num} className={`border-b border-b-line hover:bg-surface-2 ${isUnValError ? 'bg-red-500/5' : ''}`}>
                          <td className="py-[10px] px-[12px] text-center">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => handleIndCheckboxToggle(num)}
                              className="w-[15px] h-[15px]"
                            />
                          </td>
                          <td className="py-[10px] px-[12px] edp-mono">{num}</td>
                          <td className="py-[10px] px-[12px]">{r.Conjunto}</td>
                          <td className="py-[10px] px-[12px] edp-mono">{r.Local_Instalacao}</td>
                          <td className="py-[10px] px-[12px] text-right">{r.Planejado_DDPM}</td>
                          <td className="py-[10px] px-[12px]">{r.Medida_SAP}</td>
                          <td className="py-[10px] px-[12px] edp-mono">{r.Nota_Mae}</td>
                          <td className="py-[8px] px-[12px]">
                            <select
                              value={unit}
                              onChange={(e) => setUnidadesInd((prev) => ({ ...prev, [num]: e.target.value as 'km' | 'un' }))}
                              className="h-[28px] w-full rounded-[4px] border border-line bg-surface text-[12px]"
                            >
                              <option value="km">km</option>
                              <option value="un">un</option>
                            </select>
                          </td>
                          <td className="py-[8px] px-[12px]">
                            <Input
                              type="number"
                              step={unit === 'un' ? '1' : '0.001'}
                              value={val}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value) || 0;
                                setNovasMedidasInd((prev) => ({ ...prev, [num]: v }));
                              }}
                              className={`h-[28px] py-0 px-[6px] text-right text-[12.5px] ${isUnValError ? 'border-red' : 'border-line'}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Individual Warnings & execution */}
              <div className="flex flex-col gap-[10px]">
                {!individualValido && (
                  <div className="p-[12px] bg-red-500/10 border border-red-500/20 text-red text-[12.5px] rounded-[6px]">
                    ❌ <strong>Erro de Validação:</strong> Algumas notas selecionadas possuem unidade &quot;un&quot; mas seus novos valores não são inteiros.
                  </div>
                )}
                {selecionadasInd.size === 0 && (
                  <div className="p-[12px] bg-amber-500/10 border border-amber-500/20 text-amber text-[12.5px] rounded-[6px]">
                    ⚠️ Nenhuma nota selecionada para envio. Marque a caixa de seleção &quot;Corrigir?&quot; de pelo menos uma nota.
                  </div>
                )}

                <div className="flex items-center justify-between mt-[10px]">
                  <span className="text-[12.5px] text-text-mute">
                    Selecionadas para envio: <strong>{selecionadasInd.size}</strong> nota(s)
                  </span>
                  <Button
                    variant="default"
                    onClick={executarNoSap}
                    disabled={loadingRobot || selecionadasInd.size === 0 || !individualValido}
                  >
                    {loadingRobot ? 'Processando SAP...' : '🚀 Corrigir Selecionadas no SAP'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* RELATÓRIO DE EXECUÇÃO */}
      {relatorio && (
        <Card className="mt-[24px] border-line bg-surface">
          <CardHeader className="pb-[10px] border-b border-line">
            <CardTitle className="text-[14px] font-semibold">📋 Relatório de Execução do Robô SAP</CardTitle>
          </CardHeader>
          <CardContent className="pt-[12px]">
            <div className="border border-line rounded-[6px] overflow-hidden max-h-[220px] overflow-y-auto">
              <table className="w-full border-collapse text-[12px] text-left">
                <thead>
                  <tr className="bg-surface-2 text-text-mute font-medium border-b border-line">
                    <th className="py-[8px] px-[12px]">Nota</th>
                    <th className="py-[8px] px-[12px] w-[90px] text-center">Status</th>
                    <th className="py-[8px] px-[12px]">Mensagem</th>
                  </tr>
                </thead>
                <tbody>
                  {relatorio.map((r, i) => (
                    <tr key={i} className="border-b border-line hover:bg-surface-2">
                      <td className="py-[8px] px-[12px] edp-mono">{r.Nota}</td>
                      <td className="py-[8px] px-[12px] text-center">
                        <span
                          className={`inline-block py-[2px] px-[6px] rounded-[4px] font-semibold text-[10px] uppercase ${
                            r.Status === 'OK'
                              ? 'bg-green-100 text-green-800'
                              : r.Status === 'TESTE'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {r.Status}
                        </span>
                      </td>
                      <td className="py-[8px] px-[12px] text-text-mute">{r.Mensagem}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
