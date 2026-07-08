import React from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter,
} from '@/components/ui/alert-dialog';

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
}: ConfirmModalProps): React.JSX.Element {
  const [justificativa, setJustificativa] = React.useState("");

  React.useEffect(() => {
    if (open) setJustificativa("");
  }, [open]);

  const justOk = !requireJustification || justificativa.trim().length > 0;
  const confirmColor = tone === "danger" ? "var(--red)" : "var(--accent)";

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
      <AlertDialogContent className="w-[420px] max-w-[92vw] gap-[12px] p-[20px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="edp-title text-[17px]">{title}</AlertDialogTitle>
          {message && <div className="text-[13px] text-text-mute">{message}</div>}
        </AlertDialogHeader>

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

        <AlertDialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button variant="outline" size="sm" disabled={busy || !justOk}
                  onClick={() => onConfirm(justificativa.trim())}
                  className="font-semibold" style={{ color: confirmColor, borderColor: confirmColor }}>
            {busy ? "..." : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
