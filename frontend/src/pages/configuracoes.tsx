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

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function ConfiguracoesPage(): React.JSX.Element {
  const { settings, setSetting } = useSettings();

  return (
    <div className="ui-reset h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-6 py-8 md:px-8">
        <header className="mb-6">
          <h1 className="text-xl font-bold text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground">Aparência e preferências do EDP Verify.</p>
        </header>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Aparência</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <Row label="Tema">
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={settings.theme}
                  onValueChange={(v) => { if (v) setSetting("theme", v as typeof settings.theme); }}
                >
                  <ToggleGroupItem value="system" aria-label="Sistema">Sistema</ToggleGroupItem>
                  <ToggleGroupItem value="light"  aria-label="Claro">Claro</ToggleGroupItem>
                  <ToggleGroupItem value="dark"   aria-label="Escuro">Escuro</ToggleGroupItem>
                </ToggleGroup>
              </Row>

              <Row label="Densidade">
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={settings.density}
                  onValueChange={(v) => { if (v) setSetting("density", v as typeof settings.density); }}
                >
                  <ToggleGroupItem value="compact" aria-label="Compacto">Compacto</ToggleGroupItem>
                  <ToggleGroupItem value="cozy"    aria-label="Confortável">Confortável</ToggleGroupItem>
                </ToggleGroup>
              </Row>

              <Row label="Cor de destaque">
                <div className="flex gap-2">
                  {ACCENT_PRESETS.map((preset) => {
                    const isActive = settings.accent[0] === preset[0];
                    return (
                      <button
                        type="button"
                        key={preset[0]}
                        aria-label={`Cor de destaque ${preset[0]}`}
                        onClick={() => setSetting("accent", preset)}
                        className="size-7 rounded-full transition-transform hover:scale-110"
                        style={{
                          background: preset[0],
                          outline: isActive ? `2px solid ${preset[0]}` : "none",
                          outlineOffset: 2,
                          boxShadow: isActive ? "0 0 0 4px var(--background)" : "none",
                        }}
                      />
                    );
                  })}
                </div>
              </Row>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Exibição</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <label htmlFor="show-kpis" className="cursor-pointer text-sm text-muted-foreground">
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
              <Row label="Layout">
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={settings.coffeeLayout}
                  onValueChange={(v) => { if (v) setSetting("coffeeLayout", v as typeof settings.coffeeLayout); }}
                >
                  <ToggleGroupItem value="composer" aria-label="Composer">Composer</ToggleGroupItem>
                  <ToggleGroupItem value="split"    aria-label="Split">Split</ToggleGroupItem>
                </ToggleGroup>
              </Row>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <label htmlFor="dev-logs" className="cursor-pointer text-sm text-muted-foreground">
                  Habilitar logs de Dev
                </label>
                <Switch
                  id="dev-logs"
                  checked={settings.devLogs}
                  onCheckedChange={(v) => setSetting("devLogs", v)}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
