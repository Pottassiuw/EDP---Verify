import type { Note } from "../../types";

export interface GrupoNoveExtra {
  localErrado: string;
  localProposto: string;
  notasAfetadas: Note[];
  ignoradasSemId: number;
}

const TAMANHO_LOCAL_VALIDO = 13;

/** Detecta locais de instalação com um "9" extra no final.
 *
 * O formato válido é fixo em 13 chars (cidade 3 + tipo 2 + número 8), então
 * um local de 14 chars terminando em "9" é provadamente um dígito a mais —
 * a correção é sempre remover o "9" final. O backend re-confirma cada nota no
 * COFFEE antes de alterar (só altera se o local lá for exatamente
 * `proposto + "9"`), então a validação de segurança não depende desta tela.
 */
export function detectarNoveExtra(notes: Note[]): GrupoNoveExtra[] {
  const porLocalErrado = new Map<string, Note[]>();
  for (const nota of notes) {
    // Assume que o tipo_local_instalacao do COFFEE é convencionalmente maiúsculo
    // (compor_local_instalacao, no backend, não normaliza esse componente). Se um
    // local vier minúsculo por algum motivo, o agrupamento falha e a nota é apenas
    // ignorada — nunca alterada incorretamente (falha segura).
    const local = (nota.raw?.local_instalacao || "").trim().toUpperCase();
    if (local.length !== TAMANHO_LOCAL_VALIDO + 1 || !local.endsWith("9")) continue;
    const lista = porLocalErrado.get(local) ?? [];
    lista.push(nota);
    porLocalErrado.set(local, lista);
  }

  const grupos: GrupoNoveExtra[] = [];
  for (const [local, notas] of porLocalErrado) {
    // COFFEE é chaveado por id numérico; notas sem id numérico ficam de fora.
    const comId = notas.filter((n) => /^\d+$/.test(n.id.trim()));
    if (comId.length === 0) continue;
    grupos.push({
      localErrado: local,
      localProposto: local.slice(0, TAMANHO_LOCAL_VALIDO),
      notasAfetadas: comId,
      ignoradasSemId: notas.length - comId.length,
    });
  }
  return grupos.sort((a, b) => b.notasAfetadas.length - a.notasAfetadas.length);
}
