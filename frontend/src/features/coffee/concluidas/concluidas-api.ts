import { BASE } from '../../../api';
import type { CoffeeNota } from '../types';

export async function fetchCoffeeConcluidas(): Promise<CoffeeNota[]> {
  const response = await fetch(
    `${BASE}/coffee/notas?status=concluida`,
    { headers: { Accept: 'application/json' } },
  );
  if (!response.ok) {
    throw new Error(`GET /coffee/notas?status=concluida -> ${response.status}`);
  }
  const body = await response.json() as { registros: CoffeeNota[] };
  return body.registros;
}
