import React from "react";
import type { FieldProps, NoteStatus } from "../types";

export const LOGO_DARK =
  "/assets/RGB/Dark/Regular/NEG/EDP_Group_MasterLogo_RGB_Dark_NEG.png";
export const LOGO_LIGHT =
  "/assets/RGB/Light/Regular/POS/EDP_Group_MasterLogo_RRGB_Light_POS.png";

function prioMeta(p: number): [string, string | number] {
  if (p >= 99) return ["none", "—"];
  if (p <= 2) return ["high", p];
  if (p <= 4) return ["med", p];
  return ["low", p];
}

export const PriorityChip: React.FC<{ p: number }> = ({ p }) => {
  const [cls, label] = prioMeta(p);
  return <span className={"edp-prio " + cls}>{label}</span>;
};

export const StatusTag: React.FC<{
  status: NoteStatus;
  done: boolean;
  dup?: boolean;
}> = ({ status, done, dup }) => {
  if (dup)
    return (
      <span className="edp-tag dup">
        <span className="edp-dot" />
        Duplicata
      </span>
    );
  if (done)
    return (
      <span className="edp-tag done">
        <span className="edp-dot" />
        Concluída
      </span>
    );
  return status === "ok" ? (
    <span className="edp-tag ok">
      <span className="edp-dot" />
      Conforme
    </span>
  ) : (
    <span className="edp-tag err">
      <span className="edp-dot" />
      Com erro
    </span>
  );
};

export const Field: React.FC<FieldProps> = ({
  label,
  accent,
  children,
  grow,
}) => (
  <label
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 5,
      flex: grow ? 1 : "none",
      minWidth: grow ? 150 : 0,
    }}
  >
    <span
      className="edp-eyebrow"
      style={{ color: accent ? "var(--green)" : "var(--text-mute)" }}
    >
      {label}
    </span>
    {children}
  </label>
);

export const ctrlStyle: React.CSSProperties = {
  background: "var(--bg-2)",
  border: "1px solid var(--line-2)",
  color: "var(--text)",
  padding: "8px 11px",
  borderRadius: "var(--r-sm)",
  fontSize: 13,
  fontFamily: "var(--font-body)",
  outline: "none",
  width: "100%",
};
