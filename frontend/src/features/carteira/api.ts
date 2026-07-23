import type {
  EstadoSync, ExecucaoSync, FiltrosCarteira, NotaCarteira, PaginaNotas,
  ResumoCarteira,
} from './types';

const base = (): string => localStorage.getItem('edp_api') ?? '/api';

async function req<T>(caminho: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${base()}/carteira${caminho}`, init);
  if (!r.ok) {
    const corpo = await r.text();
    let detalhe = corpo;
    try { detalhe = (JSON.parse(corpo) as { detail?: string }).detail ?? corpo; } catch { /* texto */ }
    throw new Error(detalhe || `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

export interface ParamsNotas extends FiltrosCarteira {
  page: number;
  size: number;
  ordenar_por: string;
  ordem: 'asc' | 'desc';
}

function querystring(params: ParamsNotas): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([chave, valor]) => {
    if (valor !== undefined && valor !== '' && valor !== null) {
      sp.set(chave, String(valor));
    }
  });
  return sp.toString();
}

export const CarteiraApi = {
  notas: (params: ParamsNotas) => req<PaginaNotas>(`/notas?${querystring(params)}`),
  detalhe: (idOnr: number) => req<NotaCarteira>(`/notas/${idOnr}`),
  resumo: () => req<ResumoCarteira>('/resumo'),
  sincronizacao: () => req<EstadoSync>('/sincronizacao'),
  sincronizar: () => req<ExecucaoSync>('/sincronizar', { method: 'POST' }),
};
