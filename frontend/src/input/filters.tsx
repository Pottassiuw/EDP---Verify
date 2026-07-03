import React from "react";
import type { NotaInput } from "./types";
import type { Filtro } from "./lib";
import { valoresUnicos } from "./lib";
import {
  FILTROS_FAIXA,
  FILTROS_MULTI,
  FILTROS_TEXTO,
  ROTULOS,
} from "./columns";
import { Button } from "@/components/ui/button";

export interface FiltersState {
  busca: string;
  filtros: Filtro[];
}

export const FILTROS_INICIAIS: FiltersState = {
  busca: "",
  filtros: [],
};

interface FiltersProps {
  registros: NotaInput[];
  estado: FiltersState;
  setEstado: (e: FiltersState) => void;
}

function tipoDoCampo(campo: string): Filtro["tipo"] {
  if (FILTROS_TEXTO.includes(campo)) return "texto";
  if (FILTROS_FAIXA.includes(campo)) return "faixa";
  return "multi";
}

export function Filters({
  registros,
  estado,
  setEstado,
}: FiltersProps): React.JSX.Element {
  const [aberto, setAberto] = React.useState(false);
  const camposDisponiveis = [
    ...FILTROS_MULTI,
    ...FILTROS_TEXTO,
    ...FILTROS_FAIXA,
  ].filter((c) => !estado.filtros.some((f) => f.campo === c));

  function atualizarFiltro(i: number, mudanca: Partial<Filtro>): void {
    const filtros = estado.filtros.map((f, j) =>
      j === i ? { ...f, ...mudanca } : f,
    );
    setEstado({ ...estado, filtros });
  }

  const estiloPainel: React.CSSProperties = {
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: 12,
    background: "var(--surface)",
    marginTop: 8,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          value={estado.busca}
          placeholder="Buscar notas: 12345, 54321; 678"
          onChange={(e) => setEstado({ ...estado, busca: e.target.value })}
          className="edp-field"
          style={{ width: 260 }}
        />
        <Button variant="outline" size="sm" onClick={() => setAberto(!aberto)}>
          🔎 Filtros avançados
          {estado.filtros.length ? ` (${estado.filtros.length})` : ""}
        </Button>
        {(estado.filtros.length > 0 || estado.busca) && (
          <Button variant="ghost" size="sm"
            onClick={() => setEstado({ ...estado, busca: "", filtros: [] })}>
            🧹 Limpar
          </Button>
        )}
      </div>

      {aberto && (
        <div style={estiloPainel}>
          <select
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              setEstado({
                ...estado,
                filtros: [
                  ...estado.filtros,
                  { campo: e.target.value, tipo: tipoDoCampo(e.target.value) },
                ],
              });
            }}
            style={{ marginBottom: 10, padding: 6 }}
          >
            <option value="">+ Adicionar campo de filtro…</option>
            {camposDisponiveis.map((c) => (
              <option key={c} value={c}>
                {ROTULOS[c] ?? c}
              </option>
            ))}
          </select>
          {estado.filtros.map((f, i) => (
            <div
              key={f.campo}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  minWidth: 160,
                  fontSize: 12,
                  color: "var(--text-dim)",
                }}
              >
                {ROTULOS[f.campo] ?? f.campo}
              </span>
              {f.tipo === "texto" && (
                <input
                  value={f.texto ?? ""}
                  placeholder="Contém…"
                  onChange={(e) =>
                    atualizarFiltro(i, { texto: e.target.value })
                  }
                  style={{ padding: 5 }}
                />
              )}
              {f.tipo === "faixa" && (
                <React.Fragment>
                  <input
                    type="number"
                    placeholder="mín"
                    value={f.min ?? ""}
                    style={{ width: 90, padding: 5 }}
                    onChange={(e) =>
                      atualizarFiltro(i, {
                        min:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                  />
                  <input
                    type="number"
                    placeholder="máx"
                    value={f.max ?? ""}
                    style={{ width: 90, padding: 5 }}
                    onChange={(e) =>
                      atualizarFiltro(i, {
                        max:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                  />
                </React.Fragment>
              )}
              {f.tipo === "multi" && (
                <select
                  multiple
                  value={f.valores ?? []}
                  size={4}
                  style={{ minWidth: 220 }}
                  onChange={(e) =>
                    atualizarFiltro(i, {
                      valores: [...e.target.selectedOptions].map(
                        (o) => o.value,
                      ),
                    })
                  }
                >
                  {valoresUnicos(registros, f.campo).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              )}
              <Button variant="ghost" size="sm"
                onClick={() =>
                  setEstado({
                    ...estado,
                    filtros: estado.filtros.filter((_, j) => j !== i),
                  })
                }
              >
                ×
              </Button>
            </div>
          ))}
          {estado.filtros.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-mute)" }}>
              Nenhum filtro ativo.
            </div>
          )}
        </div>
      )}

    </div>
  );
}
