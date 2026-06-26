import React from 'react';
import { useSettings } from '../context/settings-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const ACCENT_PRESETS: [string, string, string][] = [
  ["#00a859", "#1dbd6e", "rgba(0,168,89,0.13)"],
  ["#1f9fd6", "#46b6e3", "rgba(31,159,214,0.14)"],
  ["#6b5ce6", "#8576ec", "rgba(107,92,230,0.15)"],
];

export function ConfiguracoesPage(): React.JSX.Element {
  const { settings, setSetting } = useSettings();

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 24px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
          Configurações
        </h1>

        <Card>
          <CardHeader>
            <CardTitle>Aparência</CardTitle>
          </CardHeader>
          <CardContent style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13.5, color: "var(--text-dim)" }}>Tema</span>
              <ToggleGroup
                type="single"
                value={settings.theme}
                onValueChange={(v) => { if (v) setSetting("theme", v as typeof settings.theme); }}
              >
                <ToggleGroupItem value="system" aria-label="Sistema">Sistema</ToggleGroupItem>
                <ToggleGroupItem value="light"  aria-label="Claro">Claro</ToggleGroupItem>
                <ToggleGroupItem value="dark"   aria-label="Escuro">Escuro</ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13.5, color: "var(--text-dim)" }}>Densidade</span>
              <ToggleGroup
                type="single"
                value={settings.density}
                onValueChange={(v) => { if (v) setSetting("density", v as typeof settings.density); }}
              >
                <ToggleGroupItem value="compact" aria-label="Compacto">Compacto</ToggleGroupItem>
                <ToggleGroupItem value="cozy"    aria-label="Confortável">Confortável</ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13.5, color: "var(--text-dim)" }}>Cor de destaque</span>
              <div style={{ display: "flex", gap: 8 }}>
                {ACCENT_PRESETS.map((preset) => {
                  const isActive = settings.accent[0] === preset[0];
                  return (
                    <button
                      key={preset[0]}
                      aria-label={`Cor de destaque ${preset[0]}`}
                      onClick={() => setSetting("accent", preset)}
                      style={{
                        width: 28, height: 28, borderRadius: "50%", border: "none",
                        background: preset[0], cursor: "pointer",
                        outline: isActive ? `2px solid ${preset[0]}` : "none",
                        outlineOffset: 2,
                        boxShadow: isActive ? "0 0 0 4px var(--bg)" : "none",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Exibição</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label htmlFor="show-kpis" style={{ fontSize: 13.5, color: "var(--text-dim)", cursor: "pointer" }}>
                Mostrar KPIs
              </label>
              <Switch
                id="show-kpis"
                checked={settings.showKpis}
                onCheckedChange={(v) => setSetting("showKpis", v)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Seção COFFEE</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13.5, color: "var(--text-dim)" }}>Layout</span>
              <ToggleGroup
                type="single"
                value={settings.coffeeLayout}
                onValueChange={(v) => { if (v) setSetting("coffeeLayout", v as typeof settings.coffeeLayout); }}
              >
                <ToggleGroupItem value="composer" aria-label="Composer">Composer</ToggleGroupItem>
                <ToggleGroupItem value="split"    aria-label="Split">Split</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
