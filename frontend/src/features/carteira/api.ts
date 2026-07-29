import { getUsuario } from '../input/api';
import type {
  DashboardCarteira, Divergencia, EstadoSync, ExecucaoSync, FiltrosCarteira, MoverPedido,
  MoverResultado, Movimentacao, NotaCarteira, PaginaNotas, PreviewItem,
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
  moverPreview: (idOnrs: number[]) =>
    req<PreviewItem[]>('/mover/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_onrs: idOnrs }),
    }),
  mover: (pedido: MoverPedido) => {
    const usuario = getUsuario();
    return req<MoverResultado>('/mover-para-plano', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(usuario ? { 'X-User': usuario } : {}),
      },
      body: JSON.stringify(pedido),
    });
  },
  movimentacoes: (idOnr?: number) =>
    req<Movimentacao[]>(`/movimentacoes${idOnr ? `?id_onr=${idOnr}` : ''}`),
  divergencias: () => req<Divergencia[]>('/divergencias'),
  dashboard: (params: { ano?: number; mes?: number; regional?: string } = {}) => {
    const sp = new URLSearchParams();
    if (params.ano) sp.set('ano', String(params.ano));
    if (params.mes) sp.set('mes', String(params.mes));
    if (params.regional) sp.set('regional', params.regional);
    const qs = sp.toString();
    return req<DashboardCarteira>(`/dashboard${qs ? `?${qs}` : ''}`);
  },
};
