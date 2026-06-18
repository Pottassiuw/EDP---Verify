import React from 'react';

interface CoffeePlaceholderProps {
  titulo: string;
  descricao: string;
}

export function CoffeePlaceholder({ titulo, descricao }: CoffeePlaceholderProps): React.JSX.Element {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: 12, padding: 32, color: "var(--text-mute)" }}>
      <span style={{ fontSize: 36 }}>🚧</span>
      <strong style={{ fontSize: 16, color: "var(--text)" }}>{titulo}</strong>
      <span style={{ fontSize: 13, maxWidth: 400, textAlign: "center" }}>{descricao}</span>
      <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: ".04em",
                     padding: "4px 10px", borderRadius: 999, background: "var(--bg-2)",
                     border: "1px solid var(--line)" }}>Em breve</span>
    </div>
  );
}
