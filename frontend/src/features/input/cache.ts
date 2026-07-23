import Dexie, { type Table } from 'dexie';

export const SNAPSHOT_INPUT = 'input-dados';
export const SNAPSHOT_RAMAL = 'ramal-dados';
export const SNAPSHOT_CARTEIRA_RESUMO = 'carteira-resumo';

export interface Snapshot {
  chave: string;
  versao: string | null;
  salvoEm: string; // Date.toISOString()
  dados: unknown;
}

class EdpVerifyCache extends Dexie {
  snapshots!: Table<Snapshot, string>;

  constructor() {
    super('edp-verify');
    this.version(1).stores({ snapshots: 'chave' });
  }
}

const db = new EdpVerifyCache();

/** Cache é camada opcional: IndexedDB indisponível (modo privado, quota,
 *  browser antigo) equivale a cache vazio — nunca propaga erro pro fluxo
 *  principal, que degrada para o fetch direto. */
export async function lerSnapshot(chave: string): Promise<Snapshot | null> {
  try {
    const snap = await db.snapshots.get(chave);
    if (!snap || typeof snap.salvoEm !== 'string' || snap.dados === undefined) {
      if (snap) await db.snapshots.delete(chave); // estrutura antiga: descarta
      return null;
    }
    return snap;
  } catch {
    return null;
  }
}

export async function gravarSnapshot(
  chave: string,
  versao: string | null,
  dados: unknown,
): Promise<void> {
  try {
    await db.snapshots.put({ chave, versao, salvoEm: new Date().toISOString(), dados });
  } catch { /* mesma regra do lerSnapshot: cache é best-effort */ }
}
