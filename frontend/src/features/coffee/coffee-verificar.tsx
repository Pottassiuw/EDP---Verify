import React from 'react';
import type { Note, Source, TriageSourceInfo } from '../../types';
import { Dashboard } from '../verificar/dashboard';
import { SourceScreen } from '../verificar/source-screen';

export interface TriageHandoff {
  resolvedTheme: "dark" | "light";
  showKpis: boolean;
  notes: Note[];
  completed: Set<string>;
  dupResolved: Set<string>;
  source: Source;
  fonte: TriageSourceInfo | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: unknown;
  onRetry: () => void;
  onToggleComplete: (id: string) => void;
  onMarkMany: (ids: string[], action: "done" | "reopen") => void;
  onMarkDuplicate: (id: string) => void;
  onSendToCoffee: (ids: string[], sourceId?: string) => void;
}

export function CoffeeVerificar({ triage }: { triage: TriageHandoff }): React.JSX.Element {
  if (triage.isLoading || triage.error) {
    return (
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <SourceScreen error={triage.error} onRetry={triage.onRetry} />
      </div>
    );
  }
  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <Dashboard showKpis={triage.showKpis} notes={triage.notes} completed={triage.completed}
                 dupResolved={triage.dupResolved}
                 onToggleComplete={triage.onToggleComplete} onMarkMany={triage.onMarkMany}
                 onMarkDuplicate={triage.onMarkDuplicate} onSendToCoffee={triage.onSendToCoffee} />
    </div>
  );
}
