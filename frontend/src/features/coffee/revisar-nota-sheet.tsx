import React from 'react';
import type { NotaRevisao } from './types';
import { useNotaRevisao } from './use-nota-revisao';
import { formatRelativeTime } from './coffee-notas-table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-[6px]">
      <span className="edp-eyebrow">{titulo}</span>
      {children}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-[10px] text-[12.5px]">
      <span className="w-[168px] shrink-0 text-text-mute">{rotulo}</span>
      <span className="edp-mono break-all">{valor ?? '—'}</span>
    </div>
  );
}

/** Campos do dados_json com tratamento curado; o resto vai na lista genérica. */
const CAMPOS_CURADOS = new Set([
  'observacoes', 'sintoma', 'prioridade', 'alimentador', 'cidade',
  'tipo_local_instalacao', 'local_instalacao_numero', 'id_sap', 'arquivado',
]);

interface RevisarNotaSheetProps {
  pk: number | null;
  onClose: () => void;
  onMover: (revisao: NotaRevisao) => void;
}

export function RevisarNotaSheet({ pk, onClose, onMover }: RevisarNotaSheetProps): React.JSX.Element {
  const { data: revisao, isLoading, error } = useNotaRevisao(pk);
  const fields = (revisao?.coffee.dados_json ?? {}) as Record<string, unknown>;
  const restantes = Object.entries(fields).filter(([chave]) => !CAMPOS_CURADOS.has(chave));

  return (
    <Sheet open={pk !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="right" className="w-[520px] sm:max-w-[520px] gap-0 p-0 flex flex-col">
        <SheetHeader className="sr-only">
          <SheetTitle>Revisar nota #{pk}</SheetTitle>
        </SheetHeader>
        <div className="h-[48px] shrink-0 flex items-center pl-[16px] pr-[40px] border-b border-b-line">
          <span className="flex-1 font-bold text-[14px]">
            Revisar nota <span className="edp-mono">#{pk}</span>
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-[16px] flex flex-col gap-[16px]">
          {isLoading && <div className="text-text-mute text-[13px]">Carregando…</div>}
          {error != null && (
            <div className="text-red text-[13px]">
              {error instanceof Error ? error.message : String(error)}
            </div>
          )}
          {revisao && (
            <>
              <Secao titulo="Identificação">
                <Linha rotulo="ID COFFEE" valor={revisao.coffee.pk} />
                <Linha rotulo="ID SAP" valor={revisao.coffee.id_sap} />
                <Linha rotulo="Classificação" valor={revisao.coffee.classificacao} />
                <Linha rotulo="Última busca" valor={formatRelativeTime(revisao.coffee.buscado_em)} />
              </Secao>
              <Separator />
              <Secao titulo="Proposta para o plano">
                <Linha rotulo="Nº Nota" valor={revisao.proposta.Numero_Nota} />
                <Linha rotulo="Local de instalação" valor={revisao.proposta.Local_Instalacao} />
                <Linha rotulo="Circuito" valor={revisao.proposta.Circuito} />
                <Linha rotulo="Prioridade" valor={revisao.proposta.Prioridade_Nota} />
                <Linha rotulo="Status inicial" valor={revisao.proposta.Status_Nota} />
                <Linha rotulo="Planejado" valor={
                  `${revisao.proposta.Planejado_DDPM}${revisao.proposta.Planejado_Unidade ? ` ${revisao.proposta.Planejado_Unidade}` : ''}`
                } />
                <Linha rotulo="Observação (prefill)" valor={revisao.proposta.Observacao || '—'} />
                {revisao.avisos.map((aviso) => (
                  <div key={aviso} className="text-[12px] text-amber">{aviso}</div>
                ))}
              </Secao>
              <Separator />
              <Secao titulo={`Dados SAP (IW28)${revisao.iw28_extraida_em ? ` — extração ${formatRelativeTime(revisao.iw28_extraida_em)}` : ''}`}>
                {revisao.iw28 ? (
                  Object.entries(revisao.iw28).map(([chave, valor]) => (
                    <Linha key={chave} rotulo={chave} valor={valor as React.ReactNode} />
                  ))
                ) : (
                  <div className="text-[12.5px] text-text-mute">Nota ainda não consta na extração IW28.</div>
                )}
              </Secao>
              <Separator />
              <Secao titulo="Dados do COFFEE">
                <Linha rotulo="Sintoma" valor={String(fields.sintoma ?? '—')} />
                <Linha rotulo="Observações" valor={String(fields.observacoes ?? '—')} />
                <Linha rotulo="Prioridade (código)" valor={String(fields.prioridade ?? '—')} />
                <Linha rotulo="Alimentador" valor={String(fields.alimentador ?? '—')} />
                {restantes.map(([chave, valor]) => (
                  <Linha key={chave} rotulo={chave} valor={valor === null ? '—' : String(valor)} />
                ))}
              </Secao>
            </>
          )}
        </div>

        {revisao && (
          <div className="shrink-0 border-t border-t-line p-[12px] flex items-center gap-[10px]">
            {revisao.ja_no_plano && (
              <span className="text-[12px] text-amber">Nota já está no plano.</span>
            )}
            {!revisao.pode_mover && revisao.motivo_bloqueio && (
              <span className="text-[12px] text-text-mute flex-1">{revisao.motivo_bloqueio}</span>
            )}
            <div className="flex-1" />
            <Button size="sm" disabled={!revisao.pode_mover} onClick={() => onMover(revisao)}
                    title={revisao.motivo_bloqueio ?? undefined}>
              {revisao.ja_no_plano ? 'Atualizar dados' : 'Mover para o Plano'}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
