/* EDP Verify — camada de integração com o backend FastAPI (TypeScript).
   Endpoints (backend/main.py):
     GET  /api/data              -> { records, completed, rule_stats, uf_options, setor_options }
     POST /api/upload  (file)    -> { status, total }
     POST /api/complete/{id}     -> { status, completed }
     POST /api/duplicata/{id}    -> { status }   (marca a nota como duplicata)
   Base configurável: localStorage.setItem('edp_api','http://SEU_HOST:8000/api') */
(function () {
  const BASE: string = localStorage.getItem("edp_api") || "http://localhost:8000/api";

  // URL do COFFEE (mesmo padrão do app original "De olho na Rede").
  const COFFEE_BASE = "https://coffee.edp.gpti.com.br/7ff2b230b16cbe2ecdde87a58AppDeOlhoNaRede2/informativo/";
  const coffeeUrl = (id: string): string => COFFEE_BASE + encodeURIComponent(id) + "/change/";
  const mapsUrl = (lat: string, lon: string): string =>
    "https://www.google.com/maps/search/?api=1&query=" + lat + "," + lon;

  let coffeeWarned = false;
  function openCoffee(ids: string | string[]): void {
    const list = Array.isArray(ids) ? ids : [ids];
    if (list.length > 3 && !coffeeWarned) {
      coffeeWarned = true;
      window.alert(
        "Vamos abrir " + list.length + " abas no COFFEE. Se o navegador bloquear, " +
        "permita popups para este site e tente de novo.",
      );
    }
    list.forEach((id, i) => {
      window.setTimeout(() => window.open(coffeeUrl(id), "_blank", "noopener"), i * 250);
    });
  }

  // Rótulos PT-BR para as regras chk_ conhecidas; o resto deriva do nome.
  const NICE: Record<RuleKey, string> = {
    chk_coordenada: "Coordenada", chk_referencia: "Referência", chk_imagens: "Imagens",
    chk_executor: "Executor", chk_local_instal: "Local Instalação", chk_local_instalacao: "Local Instalação",
    chk_tipo_nota: "Tipo de Nota", chk_id_sap: "ID SAP", chk_setor: "Setor", chk_prioridade: "Prioridade",
    chk_duplicata: "Duplicata",
  };
  function titleize(s: string): string {
    return String(s).replace(/^chk_/i, "").replace(/_/g, " ")
      .replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  // Global usado pelos componentes para rotular qualquer regra (mock OU backend).
  window.ruleMeta = function (rule: RuleKey): RuleMeta {
    const label = NICE[rule] || titleize(rule);
    return { label, short: label };
  };

  // Formato cru vindo do backend (campos opcionais — caímos no raw quando faltam).
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
    id_sap?: string;
    descricao?: string;
    poste?: string;
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
    const records = j.records || [];
    const notes: Note[] = records.map((r): Note => {
      const raw = (r.raw || {}) as Partial<NoteRaw> & Record<string, unknown>;
      const ref = r.referencia;
      const local = r.local_instalacao ?? str(raw.local_instalacao) ?? "";
      return {
        id: r.id,
        prioridade: r.prioridade,
        tipo_nota: r.tipo_nota,
        referencia: ref,
        uf: r.uf,
        setor: r.setor,
        local_instalacao: local || ref,
        id_sap: r.id_sap ?? str(raw.id_sap, "-"),
        descricao: r.descricao ?? str(raw.descricao, "—"),
        poste: r.poste ?? str(raw.poste),
        latitude: r.latitude ?? (raw.latitude != null ? String(raw.latitude) : null),
        longitude: r.longitude ?? (raw.longitude != null ? String(raw.longitude) : null),
        colaborador: r.colaborador ?? str(raw.colaborador) ?? null,
        imagens_totais: r.imagens_totais ?? num(raw.imagens_totais),
        imagens_recebidas: r.imagens_recebidas ?? num(raw.imagens_recebidas),
        errors: r.errors || [],
        status: r.status,
        duplicates: r.duplicates || [],
        raw: raw as NoteRaw,
      };
    });
    return { notes, completed: new Set(j.completed || []), source: "api" };
  }

  async function fetchData(): Promise<FetchResult> {
    const res = await fetch(BASE + "/data", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("GET /data -> " + res.status);
    return normalize(await res.json() as ApiData);
  }

  async function upload(file: File): Promise<UploadResult> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(BASE + "/upload", { method: "POST", body: fd });
    if (!res.ok) {
      const e = await res.json().catch(() => ({})) as { detail?: string };
      throw new Error(e.detail || ("POST /upload -> " + res.status));
    }
    return res.json() as Promise<UploadResult>;
  }

  async function toggleComplete(id: string): Promise<ToggleResult> {
    const res = await fetch(BASE + "/complete/" + encodeURIComponent(id), { method: "POST" });
    if (!res.ok) throw new Error("POST /complete -> " + res.status);
    return res.json() as Promise<ToggleResult>;
  }

  async function markDuplicate(id: string): Promise<DuplicateResult> {
    const res = await fetch(BASE + "/duplicata/" + encodeURIComponent(id), { method: "POST" });
    if (!res.ok) throw new Error("POST /duplicata -> " + res.status);
    return res.json() as Promise<DuplicateResult>;
  }

  window.EDPApi = { BASE, fetchData, upload, toggleComplete, markDuplicate, coffeeUrl, mapsUrl, openCoffee };
})();
