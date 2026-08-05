import React from 'react';
import type { DuplicateCompareProps, DuplicateField, ComparableFields } from '../../types';
import { EDPApi } from '../../api';
import { Eyebrow } from '@/components/branded/section';
import { Button } from '@/components/ui/button';
import { Coffee } from 'lucide-react';
import { ExternalCandidateCard } from './duplicate-compare-externa';

const DUPC_STYLE = `
  .dupc-card{background:var(--surface);border:1px solid var(--line-2);border-radius:var(--r-md);overflow:hidden}
  .dupc-card+.dupc-card{margin-top:12px}
  .dupc-hd{display:flex;align-items:center;justify-content:space-between;gap:12px;
    padding:11px 14px;background:var(--bg-2);border-bottom:1px solid var(--line)}
  .dupc-grid{display:grid;grid-template-columns:118px 1fr 1fr}
  .dupc-grid>div{padding:9px 13px;border-bottom:1px solid var(--line);min-width:0}
  .dupc-grid>div:nth-child(3n+1){background:var(--bg-2)}
  .dupc-colh{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.1em;
    text-transform:uppercase;color:var(--text-mute);background:var(--surface-2)!important}
  .dupc-lbl{font-family:var(--font-mono);font-size:10px;letter-spacing:.06em;
    text-transform:uppercase;color:var(--text-mute);display:flex;align-items:center}
  .dupc-val{font-size:13px;color:var(--text);word-break:break-word;display:flex;
    align-items:center;gap:7px;line-height:1.35}
  .dupc-val.same{box-shadow:inset 3px 0 0 var(--green)}
  .dupc-val.diff{box-shadow:inset 3px 0 0 var(--amber)}
  .dupc-mk{font-family:var(--font-mono);font-size:11px;font-weight:600;flex-shrink:0}
  .dupc-mk.same{color:var(--green)}
  .dupc-mk.diff{color:var(--amber)}
  .dupc-badge{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-mono);
    font-size:11px;font-weight:600;padding:4px 10px;border-radius:999px;white-space:nowrap}
  .dupc-ext{display:flex;align-items:flex-start;gap:10px;padding:14px 16px;
    background:var(--tint-amber);border:1px solid rgba(240,169,59,.25);
    border-radius:var(--r-sm);font-size:12.5px;color:var(--text-dim);line-height:1.5}
  .dupc-warn{display:flex;align-items:center;gap:8px;padding:8px 14px;
    background:var(--tint-amber);border-bottom:1px solid rgba(240,169,59,.25);
    font-size:12px;color:var(--text-dim)}
`;

interface KeyFieldDef { key: DuplicateField; label: string; }
interface CtxFieldDef { label: string; get: (x: ComparableFields) => string; }

const DUPC_KEYS: KeyFieldDef[] = [
  { key: "local_instalacao", label: "Local instal." },
  { key: "poste",            label: "Poste(s)"      },
  { key: "referencia",       label: "Referência"    },
  { key: "problema",         label: "Problema"      },
];
const DUPC_CTX: CtxFieldDef[] = [
  { label: "Tipo de nota", get: (x) => x.tipo_nota },
  { label: "Setor · UF",   get: (x) => x.setor + " · " + x.uf },
];

export const dupcNorm = (s: string): string => String(s ?? "").trim().toLowerCase();
export const dupcEq = (a: string, b: string): boolean => dupcNorm(a) !== "" && dupcNorm(a) === dupcNorm(b);

export function CompareRow({ label, open, cand, keyField }: {
  label: string; open: string; cand: string; keyField: boolean;
}): React.JSX.Element {
  const same = keyField ? dupcEq(open, cand) : false;
  const cls = keyField ? (same ? " same" : " diff") : "";
  return (
    <React.Fragment>
      <div className="dupc-lbl">{label}</div>
      <div className="dupc-val">{open || "—"}</div>
      <div className={"dupc-val" + cls}>
        {keyField && <span className={"dupc-mk" + (same ? " same" : " diff")}>{same ? "✓" : "≠"}</span>}
        {cand || "—"}
      </div>
    </React.Fragment>
  );
}

export const DuplicateCompare: React.FC<DuplicateCompareProps> = ({ note, resolved, onMarkDuplicate, onSendToCoffee }) => {
  const cands = note.duplicates;
  if (!cands.length) return null;
  const api = EDPApi;
  const allIds = cands.map((c) => c.id);

  return (
    <section>
      <style>{DUPC_STYLE}</style>
      <div className="flex items-start justify-between gap-[14px] flex-wrap mb-[12px]">
        <div>
          <Eyebrow asChild className="text-indigo"><div>
            ⚠ Possível duplicata · {cands.length} {cands.length === 1 ? "candidata" : "candidatas"}
          </div></Eyebrow>
          <div className="text-[12.5px] text-text-dim mt-[5px] max-w-[440px]">
            Compare cada candidata com a nota aberta e confirme direto no COFFEE antes de marcar.
          </div>
        </div>
        <div className="flex gap-[8px] shrink-0 flex-wrap">
          <Button size="sm" onClick={() => api.openCoffee(allIds)}><Coffee /> Abrir todas no COFFEE</Button>
          {onSendToCoffee && (
            <Button variant="outline" size="sm" className="text-amber" style={{ borderColor: "rgba(240,169,59,.4)" }}
                    onClick={() => onSendToCoffee(allIds, note.id)} title="Adiciona as candidatas à fila do COFFEE e navega para lá">
              → Fila COFFEE
            </Button>
          )}
          <Button variant={resolved ? "outline" : "default"} size="sm"
                  style={resolved ? undefined : { background: "var(--indigo)", borderColor: "var(--indigo)", color: "#fff" }}
                  onClick={() => onMarkDuplicate(note.id)}>
            {resolved ? "↺ Reabrir" : "⧉ Marcar como duplicata"}
          </Button>
        </div>
      </div>

      {cands.map((c) => {
        const inSheet = c.in_sheet === true;
        const matches = inSheet
          ? DUPC_KEYS.filter((f) => dupcEq(note[f.key], c[f.key])).length
          : 0;
        const strong = inSheet && matches === DUPC_KEYS.length;

        return (
          <div key={c.id} className="dupc-card">
            <div className="dupc-hd">
              <div className="flex items-center gap-[10px] min-w-0">
                <span className="font-mono text-[13px] font-semibold">{c.id}</span>
                {inSheet ? (
                  <span className="dupc-badge" style={{
                    color: strong ? "var(--green)" : "var(--amber)",
                    background: strong ? "var(--tint-green)" : "var(--tint-amber)",
                    border: "1px solid " + (strong ? "rgba(0,168,89,.3)" : "rgba(240,169,59,.3)"),
                  }}>
                    {strong ? "●" : "◐"} {matches}/{DUPC_KEYS.length} campos-chave
                  </span>
                ) : (
                  <span className="dupc-badge text-amber bg-tint-amber" style={{ border: "1px solid rgba(240,169,59,.3)" }}>
                    ⧉ Externo
                  </span>
                )}
              </div>
              <div className="flex gap-[8px] shrink-0">
                {c.latitude && c.longitude && (
                  <Button asChild variant="outline" size="sm" className="text-blue" style={{ borderColor: "rgba(31,159,214,0.4)" }}>
                    <a target="_blank" rel="noopener" href={api.mapsUrl(String(c.latitude), String(c.longitude))}>◎ Mapa</a>
                  </Button>
                )}
                <Button asChild size="sm">
                  <a target="_blank" rel="noopener" href={api.coffeeUrl(c.id)}><Coffee /> COFFEE</a>
                </Button>
              </div>
            </div>

            {inSheet ? (
              <div className="dupc-grid">
                <div className="dupc-colh" />
                <div className="dupc-colh">Esta nota · {note.id}</div>
                <div className="dupc-colh">Candidata · {c.id}</div>
                {DUPC_KEYS.map((f) => (
                  <CompareRow key={f.key} label={f.label} open={note[f.key]} cand={c[f.key]} keyField={true} />
                ))}
                {DUPC_CTX.map((f) => (
                  <CompareRow key={f.label} label={f.label} open={f.get(note)} cand={f.get(c)} keyField={false} />
                ))}
              </div>
            ) : (
              <ExternalCandidateCard note={note} candidate={c} />
            )}
          </div>
        );
      })}
    </section>
  );
};
