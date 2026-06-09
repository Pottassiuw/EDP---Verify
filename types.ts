/* EDP Verify — tipos compartilhados (TypeScript, escopo global / script).
   Carregado antes dos demais. Em runtime o Babel remove todos os tipos:
   este arquivo compila para vazio. No seu repo (tsc), estas interfaces ficam
   ambientes e tipam os globais expostos em window — sem nenhum `any`. */

// ── Domínio ──────────────────────────────────────────────────────────────
type RuleKey = string; // ex.: "chk_coordenada", "chk_duplicata"
type NoteStatus = "erro" | "ok";
type Theme = "dark" | "light";
type Density = "compact" | "cozy";
type UrgBand = "high" | "med" | "low";
type Source = "demo" | "api";
type AppSection = "triagem" | "coffee";
type CoffeeLayout = "composer" | "split";
type CoffeeOpenMode = "all" | "block" | "links";

interface NoteError {
  rule: RuleKey;
  rule_name: string;
  value: string;
}

/** Campos usados na análise de duplicata (local + ID SAP + descrição + poste). */
interface ComparableFields {
  local_instalacao: string;
  id_sap: string;
  descricao: string;
  poste: string;
  tipo_nota: string;
  setor: string;
  uf: string;
  prioridade: number;
}

/** Campos-chave que definem uma duplicata, na ordem de exibição. */
type DuplicateField = "local_instalacao" | "id_sap" | "descricao" | "poste";

/** Uma nota-candidata a duplicata. Pode existir só no SAP/COFFEE (não na fila),
 *  por isso carrega seu próprio retrato dos campos comparáveis. */
interface DuplicateCandidate extends ComparableFields {
  id: string;
  /** Quais campos-chave coincidem com a nota aberta. */
  match: DuplicateField[];
  latitude: string | null;
  longitude: string | null;
}

interface NoteRaw {
  id: string;
  tipo_nota: string;
  referencia_fisica: string;
  prioridade: number;
  setor: string;
  uf: string;
  local_instalacao: string;
  alimentador: string;
  colaborador: string;
  executor: string;
  imagens_totais: number;
  imagens_recebidas: number;
  latitude: string;
  longitude: string;
  id_sap: string;
  descricao: string;
  poste: string;
}

interface Note extends ComparableFields {
  id: string;
  prioridade: number;
  referencia: string;
  latitude: string | null;
  longitude: string | null;
  colaborador: string | null;
  imagens_totais: number | null;
  imagens_recebidas: number | null;
  errors: NoteError[];
  status: NoteStatus;
  /** Vazio quando não há chk_duplicata. */
  duplicates: DuplicateCandidate[];
  raw: NoteRaw;
}

interface RuleDef {
  label: string;
  short: string;
  field?: string;
}
interface RuleMeta {
  label: string;
  short: string;
}

interface Totals {
  total: number;
  ok: number;
  err: number;
  done: number;
}

// ── Estado de Tweaks ─────────────────────────────────────────────────────
type Accent = [string, string, string];
interface TweakState {
  theme: Theme;
  density: Density;
  accent: Accent;
  showKpis: boolean;
  coffeeLayout: CoffeeLayout;
}
type SetTweak<T> = {
  <K extends keyof T>(key: K, value: T[K]): void;
  (edits: Partial<T>): void;
};

// ── Camada de dados / API ────────────────────────────────────────────────
interface EdpData {
  RULES: Record<RuleKey, RuleDef>;
  notes: Note[];
  ruleStats: () => Record<RuleKey, number>;
  totals: Totals;
  file: string;
}
interface EdpDemo {
  notes: Note[];
  file: string;
  defaultDone: string[];
  defaultDup: string[];
}
interface FetchResult {
  notes: Note[];
  completed: Set<string>;
  source: Source;
}
interface UploadResult {
  status: string;
  total: number;
}
interface ToggleResult {
  status: string;
  completed: boolean;
}
interface DuplicateResult {
  status: string;
}
interface EdpApi {
  BASE: string;
  fetchData: () => Promise<FetchResult>;
  upload: (file: File) => Promise<UploadResult>;
  toggleComplete: (id: string) => Promise<ToggleResult>;
  /** Marca a nota como duplicata no backend (POST /api/duplicata/{id}). */
  markDuplicate: (id: string) => Promise<DuplicateResult>;
  coffeeUrl: (id: string) => string;
  mapsUrl: (lat: string, lon: string) => string;
  /** Abre uma ou várias notas no COFFEE (uma aba por id, com aviso de popup). */
  openCoffee: (ids: string | string[]) => void;
}

// ── Props dos componentes (React via UMD global) ─────────────────────────
interface LogoProps {
  theme?: Theme;
  h?: number;
}
interface StatTileProps {
  label: string;
  value: React.ReactNode;
  accent?: string;
  sub?: React.ReactNode;
  big?: boolean;
}
interface DonutProps {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
}
interface RuleBreakdownProps {
  stats: Record<RuleKey, number>;
  max: number;
  compact?: boolean;
}
interface FieldProps {
  label: string;
  accent?: boolean;
  children?: React.ReactNode;
  grow?: boolean;
}
interface UploadScreenProps {
  theme?: Theme;
  onUpload: (file: File) => Promise<void>;
  onDemo: (name?: string) => void;
}
interface DuplicateCompareProps {
  note: Note;
  resolved: boolean;
  onMarkDuplicate: (id: string) => void;
}
interface CoffeeSectionProps {
  notes: Note[];
  layout: CoffeeLayout;
}

// Controles de Tweaks usados no app.
type TweakOption<T> = T | { value: T; label: string };
interface TweaksPanelProps {
  title?: string;
  children?: React.ReactNode;
}
interface TweakSectionProps {
  label: string;
  children?: React.ReactNode;
}
interface TweakRadioProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<TweakOption<T>>;
  onChange: (v: T) => void;
}
interface TweakToggleProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}
type ColorValue = string | string[];
interface TweakColorProps {
  label: string;
  value: ColorValue;
  options?: ReadonlyArray<ColorValue>;
  onChange: (v: ColorValue) => void;
}

// ── Globais expostos em window ───────────────────────────────────────────
interface Window {
  EDP: EdpData;
  EDP_DEMO: EdpDemo;
  EDPApi: EdpApi;
  ruleMeta: (rule: RuleKey) => RuleMeta;

  Logo: React.FC<LogoProps>;
  PriorityChip: React.FC<{ p: number }>;
  StatusTag: React.FC<{ status: NoteStatus; done: boolean; dup?: boolean }>;
  RuleTag: React.FC<{ rule: RuleKey }>;
  StatTile: React.FC<StatTileProps>;
  Donut: React.FC<DonutProps>;
  RuleBreakdown: React.FC<RuleBreakdownProps>;
  Field: React.FC<FieldProps>;
  ctrlStyle: React.CSSProperties;
  prioMeta: (p: number) => [string, string | number];

  UploadScreen: React.FC<UploadScreenProps>;
  DuplicateCompare: React.FC<DuplicateCompareProps>;
  CoffeeSection: React.FC<CoffeeSectionProps>;

  useTweaks: <T extends object>(defaults: T) => [T, SetTweak<T>];
  TweaksPanel: React.FC<TweaksPanelProps>;
  TweakSection: React.FC<TweakSectionProps>;
  TweakRadio: <T extends string>(props: TweakRadioProps<T>) => JSX.Element;
  TweakToggle: React.FC<TweakToggleProps>;
  TweakColor: React.FC<TweakColorProps>;
}
