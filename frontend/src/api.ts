import type {
  RuleKey,
  RuleMeta,
  FetchResult,
  Note,
  NoteError,
  NoteRaw,
  NoteStatus,
  DuplicateCandidate,
  UploadResult,
  ToggleResult,
  DuplicateResult,
} from "./types";
export const BASE: string = localStorage.getItem("edp_api") || "/api";
const hash_api_url = import.meta.env.VITE_HASH_API_URL;
const COFFEE_BASE = `https://coffee.edp.gpti.com.br/${hash_api_url}/informativo/`;
export const coffeeUrl = (id: string): string =>
  COFFEE_BASE + encodeURIComponent(id) + "/change/";
export const mapsUrl = (lat: string, lon: string): string =>
  "https://www.google.com/maps/search/?api=1&query=" + lat + "," + lon;

let coffeeWarned = false;
export function openCoffee(ids: string | string[]): void {
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length > 3 && !coffeeWarned) {
    coffeeWarned = true;
    window.alert(
      "Vamos abrir " +
        list.length +
        " abas no COFFEE. Se o navegador bloquear, " +
        "permita popups para este site e tente de novo.",
    );
  }
  list.forEach((id, i) => {
    window.setTimeout(
      () => window.open(coffeeUrl(id), "_blank", "noopener"),
      i * 250,
    );
  });
}

const NICE: Record<RuleKey, string> = {
  chk_coordenada: "Coordenada",
  chk_referencia: "Referência",
  chk_imagens: "Imagens",
  chk_executor: "Executor",
  chk_local_instal: "Local Instalação",
  chk_local_instalacao: "Local Instalação",
  chk_tipo_nota: "Tipo de Nota",
  chk_id_sap: "ID SAP",
  chk_setor: "Setor",
  chk_prioridade: "Prioridade",
  chk_duplicata: "Duplicata",
};
function titleize(s: string): string {
  return String(s)
    .replace(/^chk_/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
export function ruleMeta(rule: RuleKey): RuleMeta {
  const label = NICE[rule] ?? titleize(rule);
  return { label, short: label };
}

interface ApiRecord {
  id: string;
  prioridade: number;
  tipo_nota: string;
  referencia: string;
  uf: string;
  setor: string;
  latitude?: string | null;
  longitude?: string | null;
  colaborador?: string | null;
  imagens_totais?: number | null;
  imagens_recebidas?: number | null;
  local_instalacao?: string;
  poste?: string;
  problema?: string;
  id_sap?: string;
  descricao?: string;
  errors: NoteError[];
  status: NoteStatus;
  duplicates?: DuplicateCandidate[];
  raw?: Partial<NoteRaw> & Record<string, unknown>;
}
interface ApiData {
  records?: ApiRecord[];
  completed?: string[];
}

function str(v: unknown, fb = ""): string {
  return v == null ? fb : String(v);
}
function num(v: unknown): number | null {
  return v == null || v === "" ? null : Number(v);
}

function normalize(j: ApiData): FetchResult {
  const records = j.records ?? [];
  const notes: Note[] = records.map((r): Note => {
    const raw = (r.raw ?? {}) as Partial<NoteRaw> & Record<string, unknown>;
    const ref = r.referencia;
    const local = r.local_instalacao ?? str(raw.local_instalacao);
    return {
      id: r.id,
      prioridade: r.prioridade,
      tipo_nota: r.tipo_nota,
      referencia: ref,
      uf: r.uf,
      setor: r.setor,
      local_instalacao: local || ref,
      poste: r.poste ?? str(raw.postes ?? raw.poste),
      problema: r.problema ?? str(raw.problema, ""),
      // kept for Detail display only
      id_sap: r.id_sap ?? str(raw.id_sap, "-"),
      descricao: r.descricao ?? str(raw.descricao, ""),
      latitude:
        r.latitude ?? (raw.latitude != null ? String(raw.latitude) : null),
      longitude:
        r.longitude ?? (raw.longitude != null ? String(raw.longitude) : null),
      colaborador: r.colaborador ?? (str(raw.colaborador) || null),
      imagens_totais: r.imagens_totais ?? num(raw.imagens_totais),
      imagens_recebidas: r.imagens_recebidas ?? num(raw.imagens_recebidas),
      errors: r.errors ?? [],
      status: r.status,
      duplicates: (r.duplicates ?? []).map((d) => ({
        ...d,
        in_sheet: d.in_sheet ?? false,
      })),
      raw: raw as NoteRaw,
    };
  });
  return { notes, completed: new Set(j.completed ?? []), source: "api" };
}

export async function fetchData(): Promise<FetchResult> {
  const res = await fetch(BASE + "/data", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("GET /data -> " + res.status);
  return normalize((await res.json()) as ApiData);
}

export async function upload(file: File): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(BASE + "/upload", { method: "POST", body: fd });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(e.detail ?? "POST /upload -> " + res.status);
  }
  return res.json() as Promise<UploadResult>;
}

export async function toggleComplete(id: string): Promise<ToggleResult> {
  const res = await fetch(BASE + "/complete/" + encodeURIComponent(id), {
    method: "POST",
  });
  if (!res.ok) throw new Error("POST /complete -> " + res.status);
  return res.json() as Promise<ToggleResult>;
}

export async function markDuplicate(id: string): Promise<DuplicateResult> {
  const res = await fetch(BASE + "/duplicata/" + encodeURIComponent(id), {
    method: "POST",
  });
  if (!res.ok) throw new Error("POST /duplicata -> " + res.status);
  return res.json() as Promise<DuplicateResult>;
}

export async function marcarGerar(id: string, aGerar: boolean): Promise<void> {
  const res = await fetch(BASE + "/coffee/marcar-gerar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: Number(id), a_gerar: aGerar }),
  });
  if (!res.ok) throw new Error("POST /marcar-gerar -> " + res.status);
}

export async function consultarNota(
  id: number,
): Promise<import("./features/coffee/types").CoffeeConsulta> {
  const res = await fetch(BASE + "/coffee/consultar/" + id, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("GET /consultar -> " + res.status);
  return res.json();
}

export const EDPApi = {
  BASE,
  fetchData,
  upload,
  toggleComplete,
  markDuplicate,
  marcarGerar,
  consultarNota,
  coffeeUrl,
  mapsUrl,
  openCoffee,
};
