import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CamposManuais, NotaRevisao } from './types';
import { EDPApi } from '../../api';
import { REVISAO_KEY } from './use-nota-revisao';
import { INPUT_DADOS_KEY } from '../input/use-input-data';
import { MesExecucaoPicker } from '@/components/branded/mes-execucao-picker';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface MoverAlvo {
  pks: number[];
  /** null = fluxo em lote (sem prefill por nota) */
  revisao: NotaRevisao | null;
}

interface MoverPlanoModalProps {
  alvo: MoverAlvo | null;
  onClose: () => void;
  onSucesso: () => void;
  onIrParaInput?: () => void;
}

function camposIniciais(revisao: NotaRevisao | null): CamposManuais {
  if (revisao?.ja_no_plano && revisao.plano) {
    return {
      Mes_Execucao_Planejado: String(revisao.plano.Mes_Execucao_Planejado ?? '-'),
      Status_Obra: String(revisao.plano.Status_Obra ?? '-'),
      Observacao: String(revisao.plano.Observacao ?? ''),
      Check: String(revisao.plano.Check ?? '-'),
    };
  }
  return {
    Mes_Execucao_Planejado: '-',
    Status_Obra: '-',
    Observacao: revisao?.proposta.Observacao ?? '',
    Check: '-',
  };
}

export function MoverPlanoModal({ alvo, onClose, onSucesso, onIrParaInput }: MoverPlanoModalProps): React.JSX.Element {
  const qc = useQueryClient();
  const [campos, setCampos] = React.useState<CamposManuais>(() => camposIniciais(alvo?.revisao ?? null));
  React.useEffect(() => { setCampos(camposIniciais(alvo?.revisao ?? null)); }, [alvo]);
  const setCampo = (campo: keyof CamposManuais) => (v: string) =>
    setCampos((c) => ({ ...c, [campo]: v }));

  const atualizar = alvo?.revisao?.ja_no_plano === true;
  const emLote = (alvo?.pks.length ?? 0) > 1;

  const mutacao = useMutation({
    mutationFn: () => EDPApi.moverParaPlano(alvo!.pks, campos, atualizar),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: INPUT_DADOS_KEY });
      alvo!.pks.forEach((pk) => void qc.invalidateQueries({ queryKey: REVISAO_KEY(pk) }));
      toast.success(
        atualizar ? 'Dados atualizados no plano' : `${r.inseridas} nota(s) movida(s) para o plano`,
        onIrParaInput ? { action: { label: 'Ver no plano', onClick: onIrParaInput } } : undefined,
      );
      onSucesso();
      onClose();
    },
    onError: (e: unknown) => {
      toast.error(atualizar ? 'Falha ao atualizar' : 'Falha ao mover para o plano', {
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });

  const proposta = alvo?.revisao?.proposta;

  return (
    <Dialog open={alvo !== null} onOpenChange={(next) => { if (!next && !mutacao.isPending) onClose(); }}>
      <DialogContent className="w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {atualizar ? 'Atualizar dados no plano' : emLote
              ? `Mover ${alvo?.pks.length} notas para o Plano`
              : 'Mover para o Plano'}
          </DialogTitle>
          <DialogDescription>
            {emLote
              ? 'Os campos abaixo serão aplicados a todas as notas selecionadas.'
              : 'Campos automáticos vêm do COFFEE; preencha só o restante.'}
          </DialogDescription>
        </DialogHeader>

        {proposta && !emLote && (
          <div className="rounded-[8px] border border-line bg-surface-2 p-[10px] flex flex-col gap-[4px] text-[12.5px]">
            <div><span className="text-text-mute">Nº Nota </span><span className="edp-mono">{proposta.Numero_Nota}</span></div>
            <div><span className="text-text-mute">Local </span><span className="edp-mono">{proposta.Local_Instalacao}</span></div>
            <div><span className="text-text-mute">Circuito </span><span className="edp-mono">{proposta.Circuito}</span></div>
            <div><span className="text-text-mute">Prioridade </span>{proposta.Prioridade_Nota}</div>
            <div><span className="text-text-mute">Planejado </span><span className="edp-mono">
              {proposta.Planejado_DDPM}{proposta.Planejado_Unidade ? ` ${proposta.Planejado_Unidade}` : ''}
            </span></div>
          </div>
        )}

        <div className="flex flex-col gap-[12px]">
          <div className="flex flex-col gap-[4px]">
            <Label htmlFor="mp-mes">Data de execução planejada</Label>
            <MesExecucaoPicker id="mp-mes" value={campos.Mes_Execucao_Planejado}
                               onChange={setCampo('Mes_Execucao_Planejado')}
                               valorNeutro="-" rotuloNeutro="Sem planejamento" />
          </div>
          <div className="flex flex-col gap-[4px]">
            <Label htmlFor="mp-obra">Status da obra</Label>
            <Input id="mp-obra" value={campos.Status_Obra}
                   onChange={(e) => setCampo('Status_Obra')(e.target.value)} />
          </div>
          <div className="flex flex-col gap-[4px]">
            <Label htmlFor="mp-obs">Observação</Label>
            <Textarea id="mp-obs" rows={3} value={campos.Observacao}
                      onChange={(e) => setCampo('Observacao')(e.target.value)} />
          </div>
          <div className="flex flex-col gap-[4px]">
            <Label htmlFor="mp-check">Check</Label>
            <Input id="mp-check" value={campos.Check}
                   onChange={(e) => setCampo('Check')(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" disabled={mutacao.isPending} onClick={onClose}>Cancelar</Button>
          <Button size="sm" disabled={mutacao.isPending} onClick={() => mutacao.mutate()}>
            {mutacao.isPending ? 'Enviando…' : atualizar ? 'Atualizar dados' : 'Mover para o Plano'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
