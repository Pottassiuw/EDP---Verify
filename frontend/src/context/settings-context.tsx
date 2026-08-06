import React from 'react';
import type { Theme, Density, Accent } from '../types';

export interface Settings {
  theme: Theme;
  density: Density;
  accent: Accent;
  showKpis: boolean;
  devLogs: boolean;
}

export interface SettingsContextValue {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  resolvedTheme: "light" | "dark";
}

/** Acentos oferecidos em Configurações. O primeiro é o padrão.
 *  Só valores do DESIGN.md: esmeralda da marca, accent-indigo e
 *  accent-violet. Os hexes EDP legados (verde #00a859, ciano #1f9fd6,
 *  índigo #6b5ce6) saíram na fundação 4c-0. */
export const ACCENT_PRESETS: Accent[] = [
  ["#3ecf8e", "#24b47e", "rgba(62,207,142,0.12)", "#171717"],
  ["#054cff", "#3a6dff", "rgba(5,76,255,0.12)", "#ffffff"],
  ["#644fc1", "#8272d4", "rgba(100,79,193,0.12)", "#ffffff"],
];

const DEFAULTS: Settings = {
  theme: "system",
  density: "cozy",
  accent: ACCENT_PRESETS[0],
  showKpis: true,
  devLogs: false,
};

const STORAGE_KEY = "edp_settings";

function accentConhecido(accent: unknown): accent is Accent {
  return Array.isArray(accent)
    && ACCENT_PRESETS.some((p) => p[0] === accent[0]);
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const salvo = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
    // Accent gravado antes da 4c-0 aponta para a paleta EDP legada. Estilo
    // inline vence :root, então sem esta guarda o app inteiro continuaria com
    // a marca antiga sobre o canvas Supabaze.
    if (!accentConhecido(salvo.accent)) salvo.accent = DEFAULTS.accent;
    return salvo;
  } catch { /* ignore */ }
  return DEFAULTS;
}

function saveSettings(s: Settings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function getSystemTheme(): "dark" | "light" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const SettingsContext = React.createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [settings, setSettings] = React.useState<Settings>(loadSettings);
  const [systemTheme, setSystemTheme] = React.useState<"dark" | "light">(getSystemTheme);

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent): void => setSystemTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const resolvedTheme: "dark" | "light" =
    settings.theme === "system" ? systemTheme : settings.theme;

  // Tema, densidade e accent vivem no <html>, não no container do App:
  // conteúdo portalizado pelo Radix (Select, Sheet, Dialog, Tooltip, Sonner)
  // renderiza no <body>, fora da árvore do App, e só alcança os tokens de
  // :root. Ver o bloco de tokens em app.css.
  React.useEffect(() => {
    const raiz = document.documentElement;
    raiz.dataset.theme = resolvedTheme;
    raiz.dataset.density = settings.density;
    raiz.style.setProperty("--accent", settings.accent[0]);
    raiz.style.setProperty("--accent-2", settings.accent[1]);
    raiz.style.setProperty("--accent-tint", settings.accent[2]);
    raiz.style.setProperty("--accent-fg", settings.accent[3]);
  }, [resolvedTheme, settings.density, settings.accent]);

  function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }

  return (
    <SettingsContext.Provider value={{ settings, setSetting, resolvedTheme }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = React.useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
