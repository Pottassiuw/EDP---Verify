import type {
  BackupInfo, BaseStatus, EdicaoResultado, HierarquiaInfo, InputDataset, LogArquivo,
  LogRegistro, NotaInput, NotaRamal, RamalDataset,
} from './types';

const base = (): string => localStorage.getItem('edp_api') ?? '/api';

export function getUsuario(): string | null {
  return localStorage.getItem('edp_input_user');
}
export function setUsuario(nome: string): void {
  localStorage.setItem('edp_input_user', nome.trim());
}

async function req<T>(caminho: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${base()}/input${caminho}`, init);
  if (!r.ok) {
    const corpo = await r.text();
    let detalhe = corpo;
    try { detalhe = (JSON.parse(corpo) as { detail?: string }).detail ?? corpo; } catch { /* texto puro */ }
    throw new Error(detalhe || `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

function escrita(method: string, corpo?: unknown): RequestInit {
  const usuario = getUsuario();
  return {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(usuario ? { 'X-User': usuario } : {}),
    },
    ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
  };
}

export const InputApi = {
  me: () => req<{ usuario: string }>('/me'),
  dados: () => req<InputDataset>('/notas'),
  sync: () => req<{ ultima_alteracao: string | null; versao: string }>('/sync'),

  editar: (linhas: Partial<NotaInput>[]) =>
    req<EdicaoResultado>('/notas', escrita('PATCH', { linhas })),
  criar: (nota: Partial<NotaInput>) =>
    req<{ inseridas: number }>('/notas', escrita('POST', nota)),
  criarLote: (notas: Partial<NotaInput>[]) =>
    req<{ inseridas: number }>('/notas/bulk', escrita('POST', { notas })),
  excluir: (numeros: number[]) =>
    req<{ excluidas: number }>('/notas', escrita('DELETE', { numeros })),
  desfazer: () =>
    req<{ ok: boolean; mensagem: string }>('/desfazer', escrita('POST', {})),

  logs: () => req<{ registros: LogRegistro[] }>('/logs'),
  logsArquivos: () => req<{ registros: LogArquivo[] }>('/logs/arquivos'),
  timeline: (numero: number) => req<{ registros: LogRegistro[] }>(`/logs/nota/${numero}`),

  responsaveis: () => req<Record<string, string>>('/responsaveis'),
  salvarResponsaveis: (mapa: Record<string, string>) =>
    req<{ ok: boolean }>('/responsaveis', escrita('PUT', mapa)),

  bases: () => req<{ bases: BaseStatus[] }>('/bases'),
  syncSap: () => req<{ mensagem: string }>('/bases/sync-sap', escrita('POST')),
  urlDownloadBase: (arquivo: string) => `${base()}/input/bases/${encodeURIComponent(arquivo)}/download`,
  substituirBase: async (arquivo: string, f: File): Promise<void> => {
    const usuario = getUsuario();
    const fd = new FormData();
    fd.append('arquivo', f);
    const r = await fetch(`${base()}/input/bases/${encodeURIComponent(arquivo)}`, {
      method: 'POST', headers: usuario ? { 'X-User': usuario } : {}, body: fd,
    });
    if (!r.ok) throw new Error(await r.text());
  },

  backups: () => req<{ backups: BackupInfo[] }>('/backups'),
  urlDownloadBackup: (nome: string) => `${base()}/input/backups/${encodeURIComponent(nome)}/download`,

  migrar: () => req<{ resultado: string }>('/migrar', escrita('POST')),

  dashboardRelatorios: (regional?: string) =>
    req<import('../relatorios/types').DashboardRelatorios>(
      `/relatorios/dashboard${regional ? `?regional=${encodeURIComponent(regional)}` : ''}`),
  sincronizarMetas: () =>
    req<import('../relatorios/types').MetasInfo & { sincronizou: boolean }>(
      '/metas/sincronizar', escrita('POST')),

  ramal: () => req<RamalDataset>('/ramal'),
  importarRamal: (notas: Partial<NotaRamal>[]) =>
    req<{ inseridas: number }>('/ramal/bulk', escrita('POST', { notas })),
  excluirRamal: (numeros: number[]) =>
    req<{ excluidas: number }>('/ramal', escrita('DELETE', { numeros })),
  vincularHierarquia: (dados: Record<string, number[]>) =>
    req<{ atualizadas: number }>('/hierarquia', escrita('POST', { dados })),
  obterHierarquia: (numero: number) =>
    req<HierarquiaInfo>(`/hierarquia/${numero}`),

  exportar: async (numeros: number[], colunas: string[]): Promise<Blob> => {
    const r = await fetch(`${base()}/input/export`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numeros, colunas }),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.blob();
  },
};

export function baixarBlob(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
