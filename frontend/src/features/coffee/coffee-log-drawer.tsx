import React from 'react';
import { useCoffeeLogs } from './use-coffee-logs';
import { LogTable, PASSOS } from './coffee-log-table';
import { SegTabs } from '@/components/branded/section';
import { Sheet, SheetContent } from '@/components/ui/sheet';

interface LogDrawerProps {
  notaPk: number;
  open: boolean;
  onClose: () => void;
}

export function LogDrawer({ notaPk, open, onClose }: LogDrawerProps): React.JSX.Element {
  const [passo, setPasso] = React.useState("");
  const { logs, loading, refresh } = useCoffeeLogs({
    nota_pk: notaPk,
    limit: 50,
  });

  React.useEffect(() => {
    if (open) refresh();
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="right" className="w-[360px] sm:max-w-[360px] gap-0 p-0">
        {/* header */}
        <div className="h-[48px] shrink-0 flex items-center py-0 pl-[16px] pr-[40px] border-b border-b-line gap-[8px]">
          <span className="flex-1 font-bold text-[14px]">
            Logs — Nota <span className="edp-mono">#{notaPk}</span>
          </span>
        </div>

        {/* filtro de passo */}
        <div className="shrink-0 pt-[10px] px-[16px] pb-[6px] flex flex-wrap">
          <SegTabs tabs={PASSOS.map((p) => ({ id: p.value, rotulo: p.label }))}
                   value={passo} onChange={setPasso} ariaLabel="Filtrar por passo" />
        </div>

        {/* table */}
        <LogTable logs={logs} loading={loading} compact passo={passo} />
      </SheetContent>
    </Sheet>
  );
}
