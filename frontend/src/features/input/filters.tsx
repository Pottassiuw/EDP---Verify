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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Search, X, ChevronDown, Filter, Check } from "lucide-react";
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
  somente2026: boolean;
}

export const FILTROS_INICIAIS: FiltersState = {
  busca: "",
  filtros: [],
  somente2026: false,
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

/** Componente Premium de Multi-Seleção (Dropdown com Checkboxes e Busca Interna) */
interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
  placeholder: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
}: MultiSelectProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = React.useMemo(() => {
    const q = search.trim();
    if (!q) return options;
    if (q.startsWith("*") && q.endsWith("*") && q.length > 2) {
      const exclude = q.slice(1, -1).toLowerCase();
      return options.filter((opt) => !String(opt).toLowerCase().includes(exclude));
    }
    return options.filter((opt) =>
      String(opt).toLowerCase().includes(q.toLowerCase())
    );
  }, [options, search]);

  const toggle = (val: string): void => {
    if (selected.includes(val)) {
      onChange(selected.filter((v) => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const selectAll = (): void => {
    const newSelected = Array.from(new Set([...selected, ...filtered]));
    onChange(newSelected);
  };

  const deselectAll = (): void => {
    const newSelected = selected.filter((v) => !filtered.includes(v));
    onChange(newSelected);
  };

  return (
    <div className="relative inline-block w-full text-left" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-[32px] w-full items-center justify-between gap-[8px] rounded-[6px] border border-line-2 bg-bg-2 px-[10px] text-[12px] text-text hover:bg-surface-3 transition-colors outline-none focus-visible:border-primary"
      >
        <span className="truncate max-w-[90%]">
          {selected.length === 0
            ? placeholder
            : `${selected.length} selecionado(s)`}
        </span>
        <ChevronDown size={12} className="text-text-mute shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 mt-[4px] z-50 w-full min-w-[220px] max-w-[280px] rounded-[8px] border border-line-2 bg-surface shadow-lg p-[6px] flex flex-col gap-[6px] max-h-[260px]">
          <div className="relative flex items-center shrink-0">
            <Search size={12} className="absolute left-[8px] text-text-mute" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="h-[28px] w-full pl-[26px] pr-[8px] text-[12px] rounded-[4px] border border-line bg-bg-2 text-text outline-none focus:border-primary font-sans"
            />
          </div>
          <div className="flex gap-[6px] px-[6px] py-[2px] border-b border-line shrink-0 text-[10.5px]">
            <button
              type="button"
              onClick={selectAll}
              className="font-semibold text-primary hover:opacity-80 cursor-pointer transition-opacity"
            >
              Selecionar tudo ({filtered.length})
            </button>
            <div className="text-text-mute">|</div>
            <button
              type="button"
              onClick={deselectAll}
              className="font-semibold text-text-mute hover:text-text cursor-pointer transition-colors"
            >
              Limpar filtro
            </button>
          </div>
          <div className="overflow-y-auto flex-1 flex flex-col gap-[2px] pr-[2px]">
            {filtered.map((opt) => {
              const isChecked = selected.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(opt)}
                  className="flex items-center gap-[8px] w-full text-left px-[8px] py-[6px] rounded-[4px] hover:bg-surface-2 text-[12px] cursor-pointer transition-colors group"
                >
                  <div className={`flex items-center justify-center size-[14px] rounded border transition-colors ${
                    isChecked
                      ? 'border-primary bg-primary text-white'
                      : 'border-line-2 bg-bg-2 group-hover:border-text-dim'
                  }`}>
                    {isChecked && <Check size={10} strokeWidth={3} />}
                  </div>
                  <span className="truncate text-text font-mono">{opt}</span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="py-[12px] text-center text-text-mute text-[11px] font-sans">
                Sem resultados
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Filters({
  registros,
  estado,
  setEstado,
}: FiltersProps): React.JSX.Element {
  const [aberto, setAberto] = React.useState(false);
  const camposDisponiveis = React.useMemo(() => {
    return [
      ...FILTROS_MULTI,
      ...FILTROS_TEXTO,
      ...FILTROS_FAIXA,
    ].filter((c) => !estado.filtros.some((f) => f.campo === c));
  }, [estado.filtros]);

  function atualizarFiltro(i: number, mudanca: Partial<Filtro>): void {
    const filtros = estado.filtros.map((f, j) =>
      j === i ? { ...f, ...mudanca } : f
    );
    setEstado({ ...estado, filtros });
  }

  function removerFiltro(i: number): void {
    setEstado({
      ...estado,
      filtros: estado.filtros.filter((_, j) => j !== i),
    });
  }

  const temFiltrosAtivos = estado.filtros.length > 0 || estado.busca || estado.somente2026;

  return (
    <div className="flex flex-col gap-[10px]">
      {/* Barra Principal de Filtros */}
      <div className="flex gap-[12px] items-center flex-wrap">
        {/* Campo de Busca Global */}
        <div className="relative flex items-center w-[280px]">
          <Search size={14} className="absolute left-[11px] text-text-mute" />
          <input
            value={estado.busca}
            placeholder="Buscar notas: 12345, 54321..."
            onChange={(e) => setEstado({ ...estado, busca: e.target.value })}
            className="edp-field pl-[32px] pr-[28px] w-full"
          />
          {estado.busca && (
            <button
              onClick={() => setEstado({ ...estado, busca: "" })}
              className="absolute right-[10px] text-text-mute hover:text-text cursor-pointer transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Seletor On/Off para Mês Planejado de 2026 */}
        <div className="flex items-center gap-[8px] bg-bg-2 border border-line-2 px-[12px] h-[34px] rounded-sm select-none">
          <Switch
            id="switch-2026"
            checked={estado.somente2026}
            onCheckedChange={(checked) => setEstado({ ...estado, somente2026: checked })}
            size="sm"
          />
          <Label htmlFor="switch-2026" className="text-[12.5px] font-medium text-text-dim cursor-pointer">
            Planejado 2026
          </Label>
        </div>

        {/* Botão de Filtros Avançados */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAberto(!aberto)}
          className={`h-[34px] px-[12px] gap-[6px] ${
            aberto || estado.filtros.length > 0 ? "border-primary text-primary bg-accent-tint" : ""
          }`}
        >
          <Filter size={13} />
          <span>Filtros avançados</span>
          {estado.filtros.length > 0 && (
            <span className="ml-[2px] bg-primary text-white size-[16px] text-[10px] font-bold rounded-full flex items-center justify-center">
              {estado.filtros.length}
            </span>
          )}
        </Button>

        {/* Botão Limpar Tudo */}
        {temFiltrosAtivos && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEstado({ busca: "", filtros: [], somente2026: false })}
            className="h-[34px] text-text-mute hover:text-text cursor-pointer"
          >
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Painel de Adicionar Filtro Avançado */}
      {aberto && (
        <div className="border border-line rounded-md p-[14px] bg-bg-2/30 flex flex-col gap-[10px] animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-[10px] w-full sm:w-[320px]">
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
              <SelectTrigger aria-label="Adicionar campo de filtro" className="h-[32px] bg-surface border-line-2">
                <SelectValue placeholder="+ Adicionar filtro avançado..." />
              </SelectTrigger>
              <SelectContent className={CLASSE_SELECT_MONO}>
                {camposDisponiveis.map((c) => (
                  <SelectItem key={c} value={c}>
                    {ROTULOS[c] ?? c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lista Horizontal/Grid de Filtros Ativos */}
          {estado.filtros.length > 0 ? (
            <div className="flex flex-wrap gap-[10px] mt-[4px]">
              {estado.filtros.map((f, i) => (
                <div
                  key={f.campo}
                  className="flex flex-col gap-[6px] p-[10px] bg-surface border border-line-2 rounded-[8px] w-full sm:w-[240px] shadow-sm relative group/card hover:border-line-2/80 transition-colors"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-text-mute uppercase tracking-wider font-sans">
                      {ROTULOS[f.campo] ?? f.campo}
                    </span>
                    <button
                      type="button"
                      onClick={() => removerFiltro(i)}
                      className="text-text-mute hover:text-red cursor-pointer transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>

                  <div className="flex items-center w-full min-h-[32px]">
                    {f.tipo === "texto" && (
                      <input
                        value={f.texto ?? ""}
                        placeholder="Contém..."
                        aria-label={`Filtro de texto: ${ROTULOS[f.campo] ?? f.campo}`}
                        className="h-[32px] px-[8px] rounded-[6px] border border-line-2 bg-bg-2 text-[12px] w-full outline-none focus:border-primary"
                        onChange={(e) =>
                          atualizarFiltro(i, { texto: e.target.value })
                        }
                      />
                    )}

                    {f.tipo === "faixa" && (
                      <div className="flex gap-[6px] w-full">
                        <input
                          type="number"
                          placeholder="mín"
                          value={f.min ?? ""}
                          aria-label={`Mínimo: ${ROTULOS[f.campo] ?? f.campo}`}
                          className="h-[32px] px-[8px] rounded-[6px] border border-line-2 bg-bg-2 text-[12px] w-1/2 outline-none focus:border-primary text-right"
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
                          className="h-[32px] px-[8px] rounded-[6px] border border-line-2 bg-bg-2 text-[12px] w-1/2 outline-none focus:border-primary text-right"
                          onChange={(e) =>
                            atualizarFiltro(i, {
                              max:
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    )}

                    {f.tipo === "multi" && (
                      <MultiSelect
                        options={valoresUnicos(registros, f.campo)}
                        selected={f.valores ?? []}
                        onChange={(vals) => atualizarFiltro(i, { valores: vals })}
                        placeholder="Selecionar..."
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11.5px] text-text-mute italic mt-[4px]">
              Nenhum filtro avançado adicionado ainda.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
