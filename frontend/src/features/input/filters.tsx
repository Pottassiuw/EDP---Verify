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
import { CLASSE_SELECT_MONO } from "./ui";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  return (
    <div className="flex flex-col gap-[4px]">
      <div className="flex gap-[8px] items-center flex-wrap">
        <input
          value={estado.busca}
          placeholder="Buscar notas: 12345, 54321; 678"
          onChange={(e) => setEstado({ ...estado, busca: e.target.value })}
          className="edp-field w-[260px]"
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
        <div className="border border-line rounded-[8px] p-[12px] bg-surface mt-[8px]">
          <Select
            onValueChange={(v) => {
              setEstado({
                ...estado,
                filtros: [
                  ...estado.filtros,
                  { campo: v, tipo: tipoDoCampo(v) },
                ],
              });
            }}
          >
            <SelectTrigger aria-label="Adicionar campo de filtro" className="edp-field mb-[10px] w-full">
              <SelectValue placeholder="+ Adicionar campo de filtro…" />
            </SelectTrigger>
            <SelectContent className={CLASSE_SELECT_MONO}>
              {camposDisponiveis.map((c) => (
                <SelectItem key={c} value={c}>
                  {ROTULOS[c] ?? c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {estado.filtros.map((f, i) => (
            <div
              key={f.campo}
              className="flex gap-[8px] items-center mb-[8px]"
            >
              <span className="min-w-[160px] text-[12px] text-text-dim">
                {ROTULOS[f.campo] ?? f.campo}
              </span>
              {f.tipo === "texto" && (
                <input
                  value={f.texto ?? ""}
                  placeholder="Contém…"
                  aria-label={`Filtro de texto: ${ROTULOS[f.campo] ?? f.campo}`}
                  className="edp-field"
                  onChange={(e) =>
                    atualizarFiltro(i, { texto: e.target.value })
                  }
                />
              )}
              {f.tipo === "faixa" && (
                <React.Fragment>
                  <input
                    type="number"
                    placeholder="mín"
                    value={f.min ?? ""}
                    aria-label={`Mínimo: ${ROTULOS[f.campo] ?? f.campo}`}
                    className="edp-field w-[90px]"
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
                    aria-label={`Máximo: ${ROTULOS[f.campo] ?? f.campo}`}
                    className="edp-field w-[90px]"
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
                  aria-label={`Valores de ${ROTULOS[f.campo] ?? f.campo}`}
                  className="edp-field min-w-[220px]"
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
            <div className="text-[12px] text-text-mute">
              Nenhum filtro ativo.
            </div>
          )}
        </div>
      )}

    </div>
  );
}
