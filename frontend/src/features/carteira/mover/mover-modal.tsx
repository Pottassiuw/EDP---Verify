import React from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { MesExecucaoPicker } from '@/components/branded/mes-execucao-picker';
import { useMoverParaPlano, useMoverPreview } from '../use-carteira-mover';

export function MoverModal({ aberto, idOnrs, onClose, onSucesso }: {
  aberto: boolean;
  idOnrs: number[];
  onClose: () => void;
  onSucesso: () => void;
}): React.JSX.Element {
  const [mes, setMes] = React.useState('-');
  const [statusObra, setStatusObra] = React.useState('-');
  const preview = useMoverPreview(idOnrs, aberto);
  const mover = useMoverParaPlano();

  const itens = preview.data ?? [];
  const bloqueadas = itens.filter((i) => !i.movivel);
  const podeMover = itens.length > 0 && bloqueadas.length === 0
    && mes !== '-' && !mover.isPending;

  function confirmar(): void {
    mover.mutate(
      { id_onrs: idOnrs, mes_execucao: mes, status_obra: statusObra },
      { onSuccess: () => { onSucesso(); onClose(); } },
    );
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !mover.isPending) onClose(); }}>
      <DialogContent className="edp carteira-scope w-[520px]">
        <DialogHeader>
          <DialogTitle>Mover {idOnrs.length} nota(s) para o plano</DialogTitle>
          <DialogDescription>
            Mês e status abaixo são aplicados a todas as selecionadas.
          </DialogDescription>
        </DialogHeader>

        {preview.isLoading && <span className="edp-eyebrow">Validando seleção…</span>}
        {bloqueadas.length > 0 && (
          <div className="edp-banner err">
            {bloqueadas.length} nota(s) não podem ser movidas — ajuste a seleção:
            <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
              {bloqueadas.slice(0, 5).map((b) => (
                <li key={b.id_onr} className="edp-eyebrow" style={{ textTransform: 'none' }}>
                  {b.id_onr}: {b.motivo_bloqueio}
                </li>
              ))}
            </ul>
          </div>
        )}
        {itens.some((i) => i.avisos.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Array.from(new Set(itens.flatMap((i) => i.avisos))).slice(0, 4).map((a) => (
              <Badge key={a} variant="situFora">{a}</Badge>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Label htmlFor="mv-mes">Mês de execução planejado</Label>
            <MesExecucaoPicker id="mv-mes" value={mes} onChange={setMes}
                               valorNeutro="-" rotuloNeutro="Escolha o mês"
                               className="edp carteira-scope" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Label htmlFor="mv-obra">Status da obra</Label>
            <Input id="mv-obra" value={statusObra}
                   onChange={(e) => setStatusObra(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" disabled={mover.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" disabled={!podeMover} onClick={confirmar}>
            {mover.isPending ? 'Movendo…' : 'Mover para o plano'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
