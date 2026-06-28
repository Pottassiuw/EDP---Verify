import React from 'react';
import type { Theme, Density, CoffeeLayout, Accent } from '../types';

export interface Settings {
  theme: Theme;
  density: Density;
  accent: Accent;
  showKpis: boolean;
  coffeeLayout: CoffeeLayout;
  devLogs: boolean;
}

export interface SettingsContextValue {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  resolvedTheme: "light" | "dark";
}

const DEFAULTS: Settings = {
  theme: "system",
  density: "cozy",
  accent: ["#00a859", "#1dbd6e", "rgba(0,168,89,0.13)"],
  showKpis: true,
  coffeeLayout: "composer",
  devLogs: false,
};

const STORAGE_KEY = "edp_settings";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
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
