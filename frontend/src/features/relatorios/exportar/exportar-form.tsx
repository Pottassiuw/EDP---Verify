import React from 'react';
import { FileDown, Info } from 'lucide-react';
import { toast } from 'sonner';

import { Eyebrow } from '@/components/branded/section';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { MESES_ABREV_PT, fmtQtd } from '../fmt';
import type { PlanoRelatorio } from '../relatorios-data';
import { TituloPainel } from '../relatorios-ui';

type FormatoExportacao = 'xlsx' | 'csv' | 'pdf';
type BlocoExportacao = 'resumo' | 'criticos' | 'detalhamento' | 'regional' | 'mensalizacao' | 'cobertura';

const BLOCOS: Array<{
  id: BlocoExportacao;
  titulo: string;
  detalhe: string;
  indisponivel?: boolean;
}> = [
  { id: 'resumo', titulo: 'Resumo de decisão', detalhe: 'KPIs do escopo' },
  { id: 'criticos', titulo: 'Ações críticas', detalhe: 'Planos abaixo da meta' },
  { id: 'detalhamento', titulo: 'Detalhamento por dispositivo', detalhe: 'Carteira anual' },
  { id: 'regional', titulo: 'Carteira por regional', detalhe: 'Ranking e matriz' },
  { id: 'mensalizacao', titulo: 'Mensalização', detalhe: 'Série de 12 meses' },
  { id: 'cobertura', titulo: 'Notas de cobertura (COFFEE)', detalhe: 'Indisponível pelo contrato atual', indisponivel: true },
];

const BLOCOS_INICIAIS: Record<BlocoExportacao, boolean> = {
  resumo: true,
  criticos: true,
  detalhamento: true,
  regional: true,
  mensalizacao: true,
  cobertura: false,
};

export function ExportarForm({
  ano,
  mes,
  regional,
  busca,
  planos,
}: {
  ano: number;
  mes: number;
  regional: string | null;
  busca: string;
  planos: PlanoRelatorio[];
}): React.JSX.Element {
  const [formato, setFormato] = React.useState<FormatoExportacao>('xlsx');
  const [blocos, setBlocos] = React.useState(BLOCOS_INICIAIS);
  const nomeMes = MESES_ABREV_PT[mes - 1] ?? '';
  const quantidadeBlocos = BLOCOS.filter((bloco) => blocos[bloco.id]).length;
  const planosAbaixo = planos.filter((plano) => plano.deficit > 0).length;
  const nomeArquivo = `recomposicao_${ano}-${String(mes).padStart(2, '0')}_${slugEscopo(regional)}_${quantidadeBlocos}blocos.${formato}`;

  function solicitarExportacao(): void {
    toast.info('A geração do pacote exige o endpoint de exportação de Relatórios.', {
      description: 'O endpoint disponível hoje exporta notas do Input, não o relatório consolidado.',
    });
  }

  return (
    <Card className="flex max-w-3xl flex-col gap-5 p-[var(--pad)]">
      <TituloPainel
        titulo="Gerar pacote de relatórios"
        detalhe="A exportação usa exatamente os filtros ativos no topo."
      />
      <div className="rounded-app border border-line bg-tint-amber p-4">
        <div className="flex gap-3">
          <Info className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden="true" />
          <p className="text-sm leading-5 text-text-dim">
            A geração ainda não está conectada: não há endpoint para um pacote consolidado de Relatórios.
            Nenhum arquivo será criado por esta ação.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Eyebrow>Escopo do arquivo</Eyebrow>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-surface-2 px-3 py-1.5 text-text-dim">{nomeMes} de {ano}</span>
          <span className={`rounded-full px-3 py-1.5 ${regional ? 'bg-tint-blue text-blue' : 'bg-surface-2 text-text-dim'}`}>{regional ?? 'SP (todas)'}</span>
          <span className="rounded-full bg-surface-2 px-3 py-1.5 text-text-dim">{fmtQtd(planos.length)} planos</span>
          <span className="rounded-full bg-tint-red px-3 py-1.5 text-red">{fmtQtd(planosAbaixo)} abaixo da meta</span>
        </div>
        <p className="flex h-[34px] items-center truncate rounded-app-sm border border-line-2 px-[11px] font-mono text-xs">{nomeArquivo}</p>
      </div>

      <div className="flex flex-col gap-3">
        <Eyebrow>Blocos incluídos</Eyebrow>
        <div className="grid gap-3 sm:grid-cols-2">
          {BLOCOS.map((bloco) => {
            const ativo = blocos[bloco.id];
            return (
              <label
                key={bloco.id}
                className={`flex min-h-20 items-start gap-3 rounded-app border p-3 ${
                  bloco.indisponivel
                    ? 'cursor-not-allowed border-line bg-bg-2 opacity-60'
                    : ativo ? 'cursor-pointer border-accent bg-accent-tint' : 'cursor-pointer border-line bg-bg-2 hover:bg-surface-2'
                }`}
              >
                <input
                  type="checkbox"
                  checked={ativo}
                  disabled={bloco.indisponivel}
                  onChange={() => setBlocos((atual) => ({ ...atual, [bloco.id]: !atual[bloco.id] }))}
                  className="mt-0.5 size-4 rounded-app-sm border-line-2 bg-bg-2"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-text">{bloco.titulo}</span>
                  <span className="mt-1 block text-xs text-text-mute">{bloco.detalhe}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Formato">
          <Select value={formato} onValueChange={(valor) => setFormato(valor as FormatoExportacao)}>
            <SelectTrigger aria-label="Selecionar formato de exportação"><SelectValue /></SelectTrigger>
            <SelectContent >
              <SelectItem value="xlsx">Planilha Excel (.xlsx)</SelectItem>
              <SelectItem value="csv">Dados tabulares (.csv)</SelectItem>
              <SelectItem value="pdf">Resumo executivo (.pdf)</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
        <Campo label="Busca"><p className="flex h-[34px] items-center truncate rounded-app-sm border border-line-2 px-[11px] text-[13px]">{busca || 'Sem restrição'}</p></Campo>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <span className="text-xs text-text-mute">{quantidadeBlocos} blocos selecionados · {formato.toUpperCase()}</span>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="border-line-2 bg-bg-2" disabled title="A agenda depende do endpoint de exportação de Relatórios.">
            Agendar envio mensal
          </Button>
          <Button type="button" onClick={solicitarExportacao}>
            <FileDown />
            Gerar arquivo
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Eyebrow>{label}</Eyebrow>
      {children}
    </div>
  );
}

function slugEscopo(regional: string | null): string {
  return (regional ?? 'SP-todas')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .toLocaleLowerCase('pt-BR');
}
