import type { Note } from "../../types";

export interface GrupoNoveExtra {
  localErrado: string;
  localProposto: string;
  notasAfetadas: Note[];
  notasReferencia: Note[];
  ignoradasSemId: number;
}

const TAMANHO_LOCAL_VALIDO = 13;

/** Detecta locais de instalação com um "9" extra no final.
 *
 * Um local válido tem 13 chars (cidade 3 + tipo 2 + número 8). Candidato
 * a correção: 14 chars terminando em "9" cujo prefixo de 13 chars existe
 * em outra nota da planilha (a prova de que o local sem o 9 é real).
 */
export function detectarNoveExtra(notes: Note[]): GrupoNoveExtra[] {
  const porLocal = new Map<string, Note[]>();
  for (const nota of notes) {
    const local = (nota.raw.local_instalacao || "").trim().toUpperCase();
    if (!local || local === "-") continue;
    const lista = porLocal.get(local) ?? [];
    lista.push(nota);
    porLocal.set(local, lista);
  }

  const grupos: GrupoNoveExtra[] = [];
  for (const [local, notas] of porLocal) {
    if (local.length !== TAMANHO_LOCAL_VALIDO + 1 || !local.endsWith("9")) continue;
    const proposto = local.slice(0, TAMANHO_LOCAL_VALIDO);
    const referencia = porLocal.get(proposto);
    if (!referencia?.length) continue;
    // COFFEE é chaveado por id numérico; notas sem id numérico ficam de fora.
    const comId = notas.filter((n) => /^\d+$/.test(n.id.trim()));
    grupos.push({
      localErrado: local,
      localProposto: proposto,
      notasAfetadas: comId,
      notasReferencia: referencia,
      ignoradasSemId: notas.length - comId.length,
    });
  }
  return grupos.sort((a, b) => b.notasAfetadas.length - a.notasAfetadas.length);
}
