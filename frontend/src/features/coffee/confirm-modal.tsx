import React from 'react';
import { Button } from '@/components/ui/button';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  tone?: "default" | "danger";
  requireJustification?: boolean;
  busy?: boolean;
  onConfirm: (justificativa: string) => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open, title, message, confirmLabel = "Confirmar", tone = "default",
  requireJustification = false, busy = false, onConfirm, onCancel,
}: ConfirmModalProps): React.JSX.Element | null {
  const [justificativa, setJustificativa] = React.useState("");

  React.useEffect(() => {
    if (open) setJustificativa("");
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void { if (e.key === "Escape") onCancel(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const justOk = !requireJustification || justificativa.trim().length > 0;
  const confirmColor = tone === "danger" ? "var(--red)" : "var(--accent)";

  return (
    <>
      <div onClick={busy ? undefined : onCancel}
           className="fixed inset-0 z-[300]" style={{ background: "rgba(0,0,0,0.4)" }} />
      <div role="dialog" aria-modal="true"
           className="fixed top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[92vw]
                      bg-surface border border-line rounded-[12px] z-[301] flex flex-col gap-[12px] p-[20px]"
           style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}>
        <span className="edp-title text-[17px]">{title}</span>
        {message && <div className="text-[13px] text-text-mute">{message}</div>}

        <label className="text-[12px] text-text-dim">
          Justificativa{requireJustification ? " (obrigatória)" : " (opcional)"}
        </label>
        <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
                  rows={3} autoFocus disabled={busy}
                  placeholder={requireJustification
                    ? "Explique o motivo desta acao..."
                    : "Opcional: registre um motivo..."}
                  className="resize-y py-[8px] px-[10px] rounded-[8px] border border-line bg-surface-2
                             text-text text-[13px] [font-family:inherit]" />

        <div className="flex justify-end gap-[8px] mt-[4px]">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button variant="outline" size="sm" disabled={busy || !justOk}
                  onClick={() => onConfirm(justificativa.trim())}
                  className="font-semibold" style={{ color: confirmColor, borderColor: confirmColor }}>
            {busy ? "..." : confirmLabel}
          </Button>
        </div>
      </div>
    </>
  );
}
