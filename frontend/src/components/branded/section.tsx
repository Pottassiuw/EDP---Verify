import React from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/** Cabeçalho de seção: eyebrow técnico + título display + subtítulo + ação. */
export function PageHeader({ eyebrow, title, subtitle, action }: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="edp-head">
      <div className="edp-head-main">
        {eyebrow && <span className="edp-eyebrow">{eyebrow}</span>}
        <h2 className="edp-title">{title}</h2>
        {subtitle && <p className="edp-sub">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Tile de KPI: rótulo mono + número display tabular. */
export function StatTile({ label, value }: {
  label: string;
  value: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="edp-stat">
      <span className="edp-eyebrow">{label}</span>
      <span className="edp-num">{value}</span>
    </div>
  );
}

/** Banner de status inline (sucesso/erro). */
export function Banner({ tipo, children }: {
  tipo: 'ok' | 'err';
  children: React.ReactNode;
}): React.JSX.Element {
  return <div className={`edp-banner ${tipo}`} role="status">{children}</div>;
}

export interface SegTab<T extends string> {
  id: T;
  rotulo: string;
}

/** Abas segmentadas com sublinhado. Envolve o ToggleGroup do shadcn para
 *  preservar a acessibilidade Radix (roving tabindex, navegação por setas). */
export function SegTabs<T extends string>({ tabs, value, onChange, ariaLabel }: {
  tabs: SegTab<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}): React.JSX.Element {
  return (
    <ToggleGroup
      type="single"
      value={value}
      variant="outline"
      className="edp-segtabs"
      aria-label={ariaLabel}
      onValueChange={(v) => { if (v) onChange(v as T); }}
    >
      {tabs.map((t) => (
        <ToggleGroupItem key={t.id} value={t.id}>{t.rotulo}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
