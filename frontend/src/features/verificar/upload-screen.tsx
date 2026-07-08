import React from "react";
import type { UploadScreenProps } from "../../types";
import { EDPApi } from "../../api";
import LOGO_EXCEL from "../../../public/assets/logo_excel.svg";
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
      className="flex-1 flex flex-col items-center justify-center gap-[34px] overflow-hidden bg-bg"
      style={{
        padding: 32,
        position: "relative",
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
        className="flex flex-col items-center gap-[14px]"
        style={{ zIndex: 1 }}
      >
        <img
          src={theme === "light" ? LOGO_LIGHT : LOGO_DARK}
          alt="EDP"
          style={{ height: 44, width: "auto" }}
        />
        <div style={{ textAlign: "center" }}>
          <div
            className="font-semibold text-[26px] tracking-display"
            style={{ fontFamily: "var(--font-display)" }}
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
        className="bg-surface rounded-edp-lg py-[44px] px-[40px]"
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 480,
          cursor: "pointer",
          border: "1px solid " + (drag ? "var(--accent)" : "var(--line-2)"),
          boxShadow: drag ? "0 0 0 4px var(--accent-tint)" : "var(--shadow)",
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
          className="flex items-center justify-center text-[26px]"
          style={{
            width: 60,
            height: 60,
            margin: "0 auto 18px",
            borderRadius: 16,
            background: "var(--accent-tint)",
            border: "1px solid var(--accent)",
            color: "var(--accent)",
          }}
        >
          <img
            src={LOGO_EXCEL}
            alt="EDP"
            style={{ height: 44, width: "auto" }}
          />
        </div>
        <h2
          className="font-semibold text-[19px]"
          style={{
            fontFamily: "var(--font-display)",
            margin: "0 0 6px",
            letterSpacing: "-0.01em",
          }}
        >
          Importar planilha
        </h2>
        <p
          className="text-text-dim text-[13.5px]"
          style={{ margin: "0 0 20px" }}
        >
          Arraste o arquivo aqui ou clique para selecionar
        </p>
        <Button asChild className="py-[10px] px-[22px]">
          <span>Selecionar arquivo</span>
        </Button>

        <div
          className="flex gap-[8px] justify-center"
          style={{ marginTop: 20 }}
        >
          {[".xlsx", ".xls", ".csv"].map((f) => (
            <span
              key={f}
              className="edp-mono text-[11px] text-text-mute py-[3px] px-[10px] border border-line-2 bg-bg-2"
              style={{ borderRadius: 5 }}
            >
              {f}
            </span>
          ))}
        </div>

        {loading && (
          <div
            className="bg-bg-2 overflow-hidden"
            style={{
              marginTop: 22,
              height: 3,
              borderRadius: 3,
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
            className="py-[11px] px-[14px] rounded-edp-sm bg-tint-amber text-amber text-[12px]"
            style={{
              marginTop: 18,
              textAlign: "left",
              border: "1px solid rgba(240,169,59,0.35)",
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
