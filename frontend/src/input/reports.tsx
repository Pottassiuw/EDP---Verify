import React from 'react';
import type { Celula, InputDataset, NotaInput } from './types';
import { InputApi, baixarBlob } from './api';
import { valoresUnicos } from './lib';
import type { ColunaDef } from './columns';
import { NotesTable } from './notes-table';

/** Cores do "semáforo" (porte de Input/app.py:1132-1139). */
const CORES_AUDITORIA: Record<string, string> = {
  '🟢 Adiantado': '#28a745', '🔵 No Prazo': '#007bff', '🔴 Com Atraso': '#dc3545',
  '🟣 Fora do Plano': '#6f42c1', '⚠️ Passível de Encerramento': '#ffc107',
  '⚪ Em Andamento (No Prazo)': '#585c5d', '⚪ Sem Planejamento': '#6c757d',
  '⏳Sem Data SAP': '#410707', '⚠️ Data SAP Inválida': '#343a40',
  '⚠️ Sem Mês Planejado Válido': '#fd7e14', '⚠️ Erro na Análise': '#000000',
};

const COLUNAS_AUDITORIA: ColunaDef[] = [
  { key: 'Numero_Nota', label: 'Nº Nota', numeric: true },
  { key: 'Conjunto', label: 'Conjunto' },
  { key: 'Status_Nota', label: 'Status Nota', largura: 170 },
  { key: 'Status_Final', label: 'Status Final' },
  { key: 'Ordem_Executada', label: 'Ordem Exec.' },
  { key: 'Encerram.por data', label: 'Data Encerramento SAP' },
  { key: 'Mes_Execucao_Planejado', label: 'Mês Planejado' },
  { key: 'Auditoria_Cronograma', label: 'Resultado da Auditoria', largura: 220 },
  { key: 'Regional', label: 'Regional' },
  { key: 'Centro_Responsavel', label: 'Centro Responsável' },
];

const FILTROS_RAPIDOS = ['(Nenhum)', 'Passíveis de Encerramento', 'Em Andamento',
  'Encerradas', 'Ordem Executada (SAP)'] as const;

function anoEncerramento(v: Celula | undefined): number | null {
  if (v === null || v === undefined || v === '-' || v === '') return null;
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.getFullYear();
}

interface FatiaRosca { rotulo: string; qtd: number; cor: string; }

function Rosca({ fatias }: { fatias: FatiaRosca[] }): React.JSX.Element {
  const total = fatias.reduce((a, f) => a + f.qtd, 0) || 1;
  const R = 70; const C = 2 * Math.PI * R;
  let acumulado = 0;
  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="Distribuição por status de prazo">
        {fatias.map((f) => {
          const frac = f.qtd / total;
          const offset = acumulado; acumulado += frac;
          return (
            <circle key={f.rotulo} cx="90" cy="90" r={R} fill="none" stroke={f.cor} strokeWidth="34"
                    strokeDasharray={`${frac * C} ${C}`} strokeDashoffset={-offset * C}
                    transform="rotate(-90 90 90)" />
          );
        })}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        {fatias.map((f) => (
          <span key={f.rotulo}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2,
                           background: f.cor, marginRight: 6 }} />
            {f.rotulo}: <strong className="edp-mono">{f.qtd}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Reports({ dados }: { dados: InputDataset }): React.JSX.Element {
  const [rapido, setRapido] = React.useState<(typeof FILTROS_RAPIDOS)[number]>('(Nenhum)');
  const [fAnos, setFAnos] = React.useState<string[]>([]);
  const [fStatus, setFStatus] = React.useState<string[]>([]);
  const [fRegional, setFRegional] = React.useState<string[]>([]);
  const [exportando, setExportando] = React.useState(false);

  const auditadas = React.useMemo(() => {
    let r: NotaInput[] = dados.registros;
    if (rapido === 'Passíveis de Encerramento') {
      r = r.filter((n) => n.Status_Nota !== '99 Encerrado' && n.Ordem_Executada === 'SIM');
    } else if (rapido === 'Em Andamento') {
      r = r.filter((n) => n.Status_Nota !== '99 Encerrado');
    } else if (rapido === 'Encerradas') {
      r = r.filter((n) => n.Status_Nota === '99 Encerrado');
    } else if (rapido === 'Ordem Executada (SAP)') {
      r = r.filter((n) => n.Ordem_Executada === 'SIM');
    }
    if (fAnos.length) r = r.filter((n) => fAnos.includes(String(anoEncerramento(n['Encerram.por data']) ?? '')));
    if (fStatus.length) r = r.filter((n) => fStatus.includes(String(n.Auditoria_Cronograma ?? '')));
    if (fRegional.length) r = r.filter((n) => fRegional.includes(String(n.Regional ?? '')));
    return r;
  }, [dados.registros, rapido, fAnos, fStatus, fRegional]);

  const contagens = React.useMemo(() => {
    const mapa = new Map<string, number>();
    auditadas.forEach((n) => {
      const k = String(n.Auditoria_Cronograma ?? '—');
      mapa.set(k, (mapa.get(k) ?? 0) + 1);
    });
    return mapa;
  }, [auditadas]);

  const anosDisponiveis = React.useMemo(() => {
    const anos = new Set<string>();
    dados.registros.forEach((n) => { const a = anoEncerramento(n['Encerram.por data']); if (a) anos.add(String(a)); });
    return [...anos].sort().reverse();
  }, [dados.registros]);

  const kpis: { rotulo: string; valor: number }[] = [
    { rotulo: 'Total Auditadas', valor: auditadas.length },
    { rotulo: 'No Prazo', valor: contagens.get('🔵 No Prazo') ?? 0 },
    { rotulo: 'Antecipadas', valor: contagens.get('🟢 Adiantado') ?? 0 },
    { rotulo: 'Com Atraso', valor: contagens.get('🔴 Com Atraso') ?? 0 },
    { rotulo: 'Fora do Plano', valor: contagens.get('🟣 Fora do Plano') ?? 0 },
    { rotulo: 'Passíveis Encerram.', valor: contagens.get('⚠️ Passível de Encerramento') ?? 0 },
  ];

  const fatias: FatiaRosca[] = [...contagens.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([rotulo, qtd]) => ({ rotulo, qtd, cor: CORES_AUDITORIA[rotulo] ?? '#888' }));

  async function exportar(): Promise<void> {
    setExportando(true);
    try {
      const blob = await InputApi.exportar(
        auditadas.map((n) => n.Numero_Nota), COLUNAS_AUDITORIA.map((c) => c.key));
      baixarBlob(blob, `Auditoria_Prazos_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExportando(false);
    }
  }

  function multi(rotulo: string, opcoes: string[], valores: string[], setValores: (v: string[]) => void): React.JSX.Element {
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
        <span style={{ color: 'var(--text-dim)' }}>{rotulo}</span>
        <select multiple size={4} value={valores} style={{ minWidth: 180 }}
                onChange={(e) => setValores([...e.target.selectedOptions].map((o) => o.value))}>
          {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, padding: 18, overflow: 'auto' }}>
      <h3 style={{ margin: 0 }}>Auditoria de Prazos (DDPM vs SAP)</h3>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div className="edp-seg">
          {FILTROS_RAPIDOS.map((f) => (
            <button key={f} className={rapido === f ? 'on' : ''} onClick={() => setRapido(f)}>{f}</button>
          ))}
        </div>
        {multi('Ano Encerramento (SAP)', anosDisponiveis, fAnos, setFAnos)}
        {multi('Status de Prazo', valoresUnicos(dados.registros, 'Auditoria_Cronograma'), fStatus, setFStatus)}
        {multi('Regional', valoresUnicos(dados.registros, 'Regional'), fRegional, setFRegional)}
        <button className="edp-btn sm" disabled={exportando || auditadas.length === 0}
                onClick={() => { void exportar(); }}>⬇ Baixar relatório</button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {kpis.map((k) => (
          <div key={k.rotulo} style={{ border: '1px solid var(--line)', borderRadius: 8,
                                       padding: '10px 16px', minWidth: 120 }}>
            <div style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase' }}>{k.rotulo}</div>
            <div className="edp-mono" style={{ fontSize: 22 }}>{k.valor}</div>
          </div>
        ))}
      </div>

      <NotesTable registros={auditadas} colunas={COLUNAS_AUDITORIA} altura={420} />
      {fatias.length > 0 && <Rosca fatias={fatias} />}
    </div>
  );
}
