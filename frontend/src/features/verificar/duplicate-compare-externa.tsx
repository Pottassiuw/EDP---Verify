import React from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { DuplicateCandidate, DuplicateField, Note } from '../../types';
import { EDPApi } from '../../api';
import { Button } from '@/components/ui/button';
import { CompareRow, dupcEq } from './duplicate-compare';

interface KeyFieldDef { key: DuplicateField; label: string; }
interface CtxFieldDef { label: string; get: (c: DuplicateCandidate) => string; }

const CHAVE_BASE: KeyFieldDef[] = [
  { key: 'local_instalacao', label: 'Local instal.' },
  { key: 'problema', label: 'Problema' },
];
const CHAVE_EXTRA: KeyFieldDef[] = [
  { key: 'poste', label: 'Poste(s)' },
  { key: 'referencia', label: 'Referência' },
];
const CONTEXTO: CtxFieldDef[] = [
  { label: 'Status SAP', get: (c) => c.status_sap ?? '' },
  { label: 'Prioridade SAP', get: (c) => (c.prioridade_sap != null ? String(c.prioridade_sap) : '') },
  { label: 'Conjunto', get: (c) => c.conjunto ?? '' },
];

export interface CamposBuscados {
  poste: string | null;
  referencia: string | null;
}

/** Funde poste/referência buscados ao vivo no COFFEE na candidata da Carteira. Pura — sem I/O. */
export function mergeConsultaCampos(
  candidate: DuplicateCandidate,
  consulta: CamposBuscados,
): DuplicateCandidate {
  return {
    ...candidate,
    poste: consulta.poste ?? candidate.poste ?? '',
    referencia: consulta.referencia ?? candidate.referencia ?? '',
  };
}

interface ExternalCandidateCardProps {
  note: Note;
  candidate: DuplicateCandidate;
}

export function ExternalCandidateCard({ note, candidate }: ExternalCandidateCardProps): React.JSX.Element {
  const [buscados, setBuscados] = React.useState<CamposBuscados | null>(null);
  const buscar = useMutation({
    mutationFn: () => EDPApi.consultarNota(Number(candidate.id)),
    onSuccess: (resposta) => {
      setBuscados({ poste: resposta.poste, referencia: resposta.referencia });
    },
    onError: (error: unknown) => {
      toast.error(`Não foi possível consultar a nota ${candidate.id} no COFFEE`, {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const display = buscados ? mergeConsultaCampos(candidate, buscados) : candidate;
  const chave = buscados ? [...CHAVE_BASE, ...CHAVE_EXTRA] : CHAVE_BASE;

  const botaoBuscar = (
    <Button
      variant="outline" size="sm"
      disabled={buscar.isPending}
      onClick={() => buscar.mutate()}
    >
      ⌕ {buscar.isPending ? 'Buscando…' : 'Buscar poste/referência no COFFEE'}
    </Button>
  );

  if (!candidate.carteira_match) {
    return (
      <div className="py-[14px] px-[16px]">
        <div className="dupc-ext">
          <span className="text-[16px] shrink-0 leading-none">⧉</span>
          <div>
            <strong className="text-text">Não encontrada na Carteira de Notas</strong><br />
            Essa candidata não está no espelho local da base COFFEE — pode não ter sido
            sincronizada ainda. {buscados ? 'Dados abaixo vieram direto do COFFEE.' : 'Busque direto no COFFEE para conferir.'}
          </div>
        </div>
        <div className="mt-[10px]">{botaoBuscar}</div>
        {buscados && (
          <div className="dupc-grid mt-[10px]">
            <div className="dupc-colh" />
            <div className="dupc-colh">Esta nota · {note.id}</div>
            <div className="dupc-colh">Candidata · {candidate.id}</div>
            {CHAVE_EXTRA.map((f) => (
              <CompareRow key={f.key} label={f.label} open={note[f.key]} cand={display[f.key]} keyField={true} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const matches = chave.filter((f) => dupcEq(note[f.key], display[f.key])).length;
  const strong = matches === chave.length;

  return (
    <React.Fragment>
      {candidate.carteira_ausente_em && (
        <div className="dupc-warn">
          ⚠ Ausente da Carteira desde {candidate.carteira_ausente_em} — dados podem estar desatualizados.
        </div>
      )}
      <div className="flex items-center justify-end gap-[8px] px-[14px] py-[8px] border-b border-line">
        <span className="dupc-badge" style={{
          color: strong ? "var(--green)" : "var(--amber)",
          background: strong ? "var(--tint-green)" : "var(--tint-amber)",
          border: "1px solid " + (strong ? "rgba(0,168,89,.3)" : "rgba(240,169,59,.3)"),
        }}>
          {strong ? "●" : "◐"} {matches}/{chave.length} campos-chave · Carteira
        </span>
      </div>
      <div className="dupc-grid">
        <div className="dupc-colh" />
        <div className="dupc-colh">Esta nota · {note.id}</div>
        <div className="dupc-colh">Candidata · {candidate.id}</div>
        {chave.map((f) => (
          <CompareRow key={f.key} label={f.label} open={note[f.key]} cand={display[f.key]} keyField={true} />
        ))}
        {CONTEXTO.map((f) => (
          <CompareRow key={f.label} label={f.label} open="" cand={f.get(display)} keyField={false} />
        ))}
      </div>
      {!buscados && <div className="px-[14px] py-[10px]">{botaoBuscar}</div>}
    </React.Fragment>
  );
}
