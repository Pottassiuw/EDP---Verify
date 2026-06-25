import React from 'react';
import type { Note, TweakState, Source, SetTweak } from '../types';
import { TopBar } from '../components/top-bar';
import { UploadScreen } from '../components/upload-screen';
import { Dashboard } from '../components/dashboard';

export interface TriageHandoff {
  t: TweakState;
  setTweak: SetTweak<TweakState>;
  notes: Note[];
  completed: Set<string>;
  dupResolved: Set<string>;
  source: Source;
  file: string;
  screen: "upload" | "dashboard";
  onToggleComplete: (id: string) => void;
  onMarkMany: (ids: string[], action: "done" | "reopen") => void;
  onMarkDuplicate: (id: string) => void;
  onSendToCoffee: (ids: string[], sourceId?: string) => void;
  onUpload: (file: File) => Promise<void>;
  onDemo: (name?: string) => void;
  onReset: () => void;
}

export function CoffeeVerificar({ triage }: { triage: TriageHandoff }): React.JSX.Element {
  if (triage.screen === "upload") {
    return (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <UploadScreen theme={triage.t.theme} onDemo={triage.onDemo} onUpload={triage.onUpload} />
      </div>
    );
  }
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <TopBar t={triage.t} setTweak={triage.setTweak} file={triage.file}
              source={triage.source} onReset={triage.onReset} />
      <Dashboard t={triage.t} notes={triage.notes} completed={triage.completed} dupResolved={triage.dupResolved}
                 onToggleComplete={triage.onToggleComplete} onMarkMany={triage.onMarkMany}
                 onMarkDuplicate={triage.onMarkDuplicate} onSendToCoffee={triage.onSendToCoffee} />
    </div>
  );
}
