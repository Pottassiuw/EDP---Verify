import type { CoffeeNota } from '../types';

export function completionDate(nota: CoffeeNota): string {
  return nota.classificacao_em ?? nota.buscado_em;
}

export function notaMatches(nota: CoffeeNota, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  if (!normalizedQuery) return true;

  const fields = nota.dados_json ?? {};
  const local = [
    fields.cidade,
    fields.tipo_local_instalacao,
    fields.local_instalacao_numero,
  ]
    .filter((value) => value != null)
    .join('');

  return [nota.pk, nota.id_sap, local].some((value) => (
    String(value).toLocaleLowerCase('pt-BR').includes(normalizedQuery)
  ));
}
