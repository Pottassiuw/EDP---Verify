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
           style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 300 }} />
      <div role="dialog" aria-modal="true"
           style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
                    width: 420, maxWidth: "92vw", background: "var(--surface)",
                    border: "1px solid var(--line)", borderRadius: 12, zIndex: 301,
                    display: "flex", flexDirection: "column", gap: 12, padding: 20,
                    boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
        {message && <div style={{ fontSize: 13, color: "var(--text-mute)" }}>{message}</div>}

        <label style={{ fontSize: 12, color: "var(--text-mute)" }}>
          Justificativa{requireJustification ? " (obrigatoria)" : " (opcional)"}
        </label>
        <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
                  rows={3} autoFocus disabled={busy}
                  placeholder={requireJustification
                    ? "Explique o motivo desta acao..."
                    : "Opcional: registre um motivo..."}
                  style={{ resize: "vertical", padding: "8px 10px", borderRadius: 8,
                           border: "1px solid var(--line)", background: "var(--surface-2)",
                           color: "var(--text)", fontSize: 13, fontFamily: "inherit" }} />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button variant="outline" size="sm" disabled={busy || !justOk}
                  onClick={() => onConfirm(justificativa.trim())}
                  style={{ fontWeight: 600, color: confirmColor, borderColor: confirmColor }}>
            {busy ? "..." : confirmLabel}
          </Button>
        </div>
      </div>
    </>
  );
}
