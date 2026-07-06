import React from "react";
import type { UploadScreenProps } from "../types";
import { EDPApi } from "../api";
import LOGO_EXCEL from "../../public/assets/logo_excel.svg";
import { LOGO_DARK, LOGO_LIGHT } from "./shared";
import { Button } from "@/components/ui/button";

export const UploadScreen: React.FC<UploadScreenProps> = ({
  theme = "dark",
  onUpload,
}) => {
  const [drag, setDrag] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [pct, setPct] = React.useState(0);
  const [err, setErr] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function start(file: File): Promise<void> {
    setErr(null);
    setLoading(true);
    setPct(15);
    const tick = window.setTimeout(() => setPct(65), 220);
    try {
      await onUpload(file);
      setPct(100);
    } catch {
      window.clearTimeout(tick);
      setLoading(false);
      setPct(0);
      setErr(
        "Não foi possível conectar ao backend (" +
          EDPApi.BASE +
          "). Verifique se o servidor FastAPI está rodando.",
      );
    }
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const f = e.target.files?.[0];
    if (f) void start(f);
  }
  function onDrop(e: React.DragEvent<HTMLLabelElement>): void {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) void start(f);
  }

  const corners: Array<{ v: "top" | "bottom"; h: "left" | "right" }> = [
    { v: "top", h: "left" },
    { v: "bottom", h: "right" },
  ];

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 34,
        padding: 32,
        position: "relative",
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 720,
          height: 720,
          borderRadius: "50%",
          pointerEvents: "none",
          background:
            "radial-gradient(circle, rgba(107,92,230,0.14), rgba(31,159,214,0.08) 38%, transparent 66%)",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          zIndex: 1,
        }}
      >
        <img
          src={theme === "light" ? LOGO_LIGHT : LOGO_DARK}
          alt="EDP"
          style={{ height: 44, width: "auto" }}
        />
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: 26,
              letterSpacing: "var(--tracking-display)",
            }}
          >
            To De Olho 👀
          </div>
          <div className="edp-eyebrow" style={{ marginTop: 4 }}>
            Verificação de notas SAP
          </div>
        </div>
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 480,
          cursor: "pointer",
          background: "var(--surface)",
          border: "1px solid " + (drag ? "var(--accent)" : "var(--line-2)"),
          boxShadow: drag ? "0 0 0 4px var(--accent-tint)" : "var(--shadow)",
          borderRadius: "var(--r-lg)",
          padding: "44px 40px",
          textAlign: "center",
          transition: "all .16s ease",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={onFile}
          style={{ display: "none" }}
        />
        {corners.map(({ v, h }) => (
          <span
            key={v}
            style={{
              position: "absolute",
              [v]: -1,
              [h]: -1,
              width: 18,
              height: 18,
              borderStyle: "solid",
              borderColor: "var(--accent)",
              borderWidth: 0,
              borderTopWidth: v === "top" ? 2 : 0,
              borderBottomWidth: v === "bottom" ? 2 : 0,
              borderLeftWidth: h === "left" ? 2 : 0,
              borderRightWidth: h === "right" ? 2 : 0,
            }}
          />
        ))}

        <div
          style={{
            width: 60,
            height: 60,
            margin: "0 auto 18px",
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--accent-tint)",
            border: "1px solid var(--accent)",
            color: "var(--accent)",
            fontSize: 26,
          }}
        >
          <img
            src={LOGO_EXCEL}
            alt="EDP"
            style={{ height: 44, width: "auto" }}
          />
        </div>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 19,
            margin: "0 0 6px",
            letterSpacing: "-0.01em",
          }}
        >
          Importar planilha
        </h2>
        <p
          style={{
            color: "var(--text-dim)",
            fontSize: 13.5,
            margin: "0 0 20px",
          }}
        >
          Arraste o arquivo aqui ou clique para selecionar
        </p>
        <Button asChild style={{ padding: "10px 22px" }}>
          <span>Selecionar arquivo</span>
        </Button>

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "center",
            marginTop: 20,
          }}
        >
          {[".xlsx", ".xls", ".csv"].map((f) => (
            <span
              key={f}
              className="edp-mono"
              style={{
                fontSize: 11,
                color: "var(--text-mute)",
                padding: "3px 10px",
                border: "1px solid var(--line-2)",
                borderRadius: 5,
                background: "var(--bg-2)",
              }}
            >
              {f}
            </span>
          ))}
        </div>

        {loading && (
          <div
            style={{
              marginTop: 22,
              height: 3,
              background: "var(--bg-2)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: pct + "%",
                height: "100%",
                background:
                  "linear-gradient(90deg,var(--accent),var(--accent-2))",
                transition: "width .35s ease",
              }}
            />
          </div>
        )}
        {err && (
          <div
            style={{
              marginTop: 18,
              padding: "11px 14px",
              borderRadius: "var(--r-sm)",
              textAlign: "left",
              background: "var(--tint-amber)",
              border: "1px solid rgba(240,169,59,0.35)",
              color: "var(--amber)",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {err}
          </div>
        )}
      </label>
    </div>
  );
};
