// ── Domínio ──────────────────────────────────────────────────────────────
export type RuleKey = string;
export type NoteStatus = "erro" | "ok";
export type Theme = "dark" | "light";
export type Density = "compact" | "cozy";
export type UrgBand = "high" | "med" | "low";
export type Source = "demo" | "api";
export type AppSection = "triagem" | "coffee";
export type CoffeeLayout = "composer" | "split";
export type CoffeeOpenMode = "all" | "block" | "links";

export interface NoteError {
  rule: RuleKey;
  rule_name: string;
  value: string;
}

// Fields used for side-by-side duplicate comparison
export type DuplicateField = "local_instalacao" | "poste" | "referencia" | "problema";

export interface ComparableFields {
  local_instalacao: string;
  poste: string;
  referencia: string;
  problema: string;
  tipo_nota: string;
  setor: string;
  uf: string;
  prioridade: number;
}

export interface DuplicateCandidate extends ComparableFields {
  id: string;
  in_sheet: boolean;
  match: DuplicateField[];
  latitude: string | null;
  longitude: string | null;
}

export interface NoteRaw {
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

export interface Note extends ComparableFields {
  id: string;
  latitude: string | null;
  longitude: string | null;
  colaborador: string | null;
  imagens_totais: number | null;
  imagens_recebidas: number | null;
  // kept for Detail view display; not comparison keys
  id_sap?: string;
  descricao?: string;
  errors: NoteError[];
  status: NoteStatus;
  duplicates: DuplicateCandidate[];
  raw: NoteRaw;
}

export interface RuleDef {
  label: string;
  short: string;
  field?: string;
}
export interface RuleMeta {
  label: string;
  short: string;
}

// ── Estado de Tweaks ─────────────────────────────────────────────────────
export type Accent = [string, string, string];
export interface TweakState {
  theme: Theme;
  density: Density;
  accent: Accent;
  showKpis: boolean;
  coffeeLayout: CoffeeLayout;
}
export type SetTweak<T> = {
  <K extends keyof T>(key: K, value: T[K]): void;
  (edits: Partial<T>): void;
};

// ── Camada de dados / API ────────────────────────────────────────────────
export interface EdpDemo {
  notes: Note[];
  file: string;
  defaultDone: string[];
  defaultDup: string[];
}
export interface FetchResult {
  notes: Note[];
  completed: Set<string>;
  source: Source;
}
export interface UploadResult {
  status: string;
  total: number;
}
export interface ToggleResult {
  status: string;
  completed: boolean;
}
export interface DuplicateResult {
  status: string;
}

// ── Props dos componentes ────────────────────────────────────────────────
export interface LogoProps {
  theme?: Theme;
  h?: number;
}
export interface FieldProps {
  label: string;
  accent?: boolean;
  children?: React.ReactNode;
  grow?: boolean;
}
export interface UploadScreenProps {
  theme?: Theme;
  onUpload: (file: File) => Promise<void>;
  onDemo: (name?: string) => void;
}
export interface DuplicateCompareProps {
  note: Note;
  resolved: boolean;
  onMarkDuplicate: (id: string) => void;
  onSendToCoffee?: (ids: string[], sourceId?: string) => void;
}
export interface CoffeeSectionProps {
  notes: Note[];
  layout: CoffeeLayout;
}

export type TweakOption<T> = T | { value: T; label: string };
export interface TweaksPanelProps {
  title?: string;
  children?: React.ReactNode;
}
export interface TweakSectionProps {
  label: string;
  children?: React.ReactNode;
}
export interface TweakRadioProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<TweakOption<T>>;
  onChange: (v: T) => void;
}
export interface TweakToggleProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}
export type ColorValue = string | string[];
export interface TweakColorProps {
  label: string;
  value: ColorValue;
  options?: ReadonlyArray<ColorValue>;
  onChange: (v: ColorValue) => void;
}
