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
      className="flex-1 flex flex-col items-center justify-center gap-[34px] overflow-hidden bg-bg p-[32px] relative"
    >
      <div
        className="absolute w-[720px] h-[720px] rounded-[50%] pointer-events-none bg-[radial-gradient(circle,rgba(107,92,230,0.14),rgba(31,159,214,0.08)_38%,transparent_66%)]"
      />

      <div
        className="flex flex-col items-center gap-[14px] z-[1]"
      >
        <img
          src={theme === "light" ? LOGO_LIGHT : LOGO_DARK}
          alt="EDP"
          className="h-[44px] w-auto"
        />
        <div className="text-center">
          <div
            className="font-semibold text-[26px] tracking-display [font-family:var(--font-display)]"
          >
            To De Olho 👀
          </div>
          <div className="edp-eyebrow mt-[4px]">
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
        className="bg-surface rounded-edp-lg py-[44px] px-[40px] relative z-[1] w-full max-w-[480px] cursor-pointer text-center [transition:all_.16s_ease]"
        style={{
          border: "1px solid " + (drag ? "var(--accent)" : "var(--line-2)"),
          boxShadow: drag ? "0 0 0 4px var(--accent-tint)" : "var(--shadow)",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={onFile}
          className="hidden"
        />
        {corners.map(({ v, h }) => (
          <span
            key={v}
            className="absolute w-[18px] h-[18px] border-solid border-[var(--accent)] border-0"
            style={{
              [v]: -1,
              [h]: -1,
              borderTopWidth: v === "top" ? 2 : 0,
              borderBottomWidth: v === "bottom" ? 2 : 0,
              borderLeftWidth: h === "left" ? 2 : 0,
              borderRightWidth: h === "right" ? 2 : 0,
            }}
          />
        ))}

        <div
          className="flex items-center justify-center text-[26px] w-[60px] h-[60px] mt-0 mx-auto mb-[18px] rounded-[16px] bg-accent-tint border border-[var(--accent)] text-[var(--accent)]"
        >
          <img
            src={LOGO_EXCEL}
            alt="EDP"
            className="h-[44px] w-auto"
          />
        </div>
        <h2
          className="font-semibold text-[19px] [font-family:var(--font-display)] mt-0 mx-0 mb-[6px] tracking-[-0.01em]"
        >
          Importar planilha
        </h2>
        <p
          className="text-text-dim text-[13.5px] mt-0 mx-0 mb-[20px]"
        >
          Arraste o arquivo aqui ou clique para selecionar
        </p>
        <Button asChild className="py-[10px] px-[22px]">
          <span>Selecionar arquivo</span>
        </Button>

        <div
          className="flex gap-[8px] justify-center mt-[20px]"
        >
          {[".xlsx", ".xls", ".csv"].map((f) => (
            <span
              key={f}
              className="edp-mono text-[11px] text-text-mute py-[3px] px-[10px] border border-line-2 bg-bg-2 rounded-[5px]"
            >
              {f}
            </span>
          ))}
        </div>

        {loading && (
          <div
            className="bg-bg-2 overflow-hidden mt-[22px] h-[3px] rounded-[3px]"
          >
            <div
              className="h-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))] [transition:width_.35s_ease]"
              style={{
                width: pct + "%",
              }}
            />
          </div>
        )}
        {err && (
          <div
            className="py-[11px] px-[14px] rounded-edp-sm bg-tint-amber text-amber text-[12px] mt-[18px] text-left border border-[rgba(240,169,59,0.35)] leading-normal"
          >
            {err}
          </div>
        )}
      </label>
    </div>
  );
};
