import React from 'react';
import { setUsuario } from './api';

interface IdentityModalProps {
  aberto: boolean;
  onConfirmado: () => void;
  onCancelar: () => void;
}

export function IdentityModal({ aberto, onConfirmado, onCancelar }: IdentityModalProps): React.JSX.Element | null {
  const [nome, setNome] = React.useState('');
  if (!aberto) return null;
  function confirmar(): void {
    if (!nome.trim()) return;
    setUsuario(nome);
    onConfirmado();
  }
  return (
    <div role="dialog" aria-modal="true"
         style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 60,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)',
                    borderRadius: 12, padding: 24, width: 380 }}>
        <h3 style={{ margin: '0 0 6px' }}>Quem é você?</h3>
        <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: '0 0 14px' }}>
          Seu nome identifica suas alterações no log de auditoria. Pode ser trocado depois nas Configurações.
        </p>
        <input autoFocus value={nome} placeholder="Seu nome" onChange={(e) => setNome(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') confirmar(); }}
               style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 7,
                        border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--text)' }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="edp-btn ghost sm" onClick={onCancelar}>Cancelar</button>
          <button className="edp-btn sm" disabled={!nome.trim()} onClick={confirmar}
                  style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
