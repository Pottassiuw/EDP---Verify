import React from 'react';
import { useCoffeeLogs } from './use-coffee-logs';
import { LogTable, PASSOS } from './coffee-log-table';
import { SegTabs } from '@/components/branded/section';

interface LogDrawerProps {
  notaPk: number;
  open: boolean;
  onClose: () => void;
}

export function LogDrawer({ notaPk, open, onClose }: LogDrawerProps): React.JSX.Element | null {
  const [passo, setPasso] = React.useState("");
  const { logs, loading, refresh } = useCoffeeLogs({
    nota_pk: notaPk,
    limit: 50,
  });

  React.useEffect(() => {
    if (open) refresh();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* overlay */}
      <div onClick={onClose}
           className="fixed inset-0 z-[200]" style={{ background: "rgba(0,0,0,0.3)" }} />

      {/* panel */}
      <div className="fixed top-0 right-0 w-[360px] h-[100vh] bg-surface border-l border-l-line
                      z-[201] flex flex-col [animation:clog-slide-in_150ms_ease]">
        <style>{`@keyframes clog-slide-in{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

        {/* header */}
        <div className="h-[48px] shrink-0 flex items-center py-0 px-[16px] border-b border-b-line gap-[8px]">
          <span className="flex-1 font-bold text-[14px]">
            Logs — Nota <span className="edp-mono">#{notaPk}</span>
          </span>
          <button aria-label="Fechar" onClick={onClose}
                  className="w-[28px] h-[28px] border-0 rounded-[6px] cursor-pointer
                             bg-surface-2 text-text-mute text-[14px]">
            ✕
          </button>
        </div>

        {/* filtro de passo */}
        <div className="shrink-0 pt-[10px] px-[16px] pb-[6px] flex flex-wrap">
          <SegTabs tabs={PASSOS.map((p) => ({ id: p.value, rotulo: p.label }))}
                   value={passo} onChange={setPasso} ariaLabel="Filtrar por passo" />
        </div>

        {/* table */}
        <LogTable logs={logs} loading={loading} compact passo={passo} />
      </div>
    </>
  );
}
