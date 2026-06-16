import React from "react";
import type { Celula, NotaInput } from "./types";
import type { ColunaDef } from "./columns";
import { compararDatas, formatarNumero } from "./lib";

const ALTURA_LINHA = 32;

export interface NotesTableProps {
  registros: NotaInput[];
  colunas: ColunaDef[];
  altura?: number;
  /** Seleção por checkbox (edição em lote / exclusão). Ausente = sem coluna de seleção. */
  selecionados?: Set<number>;
  onToggleSelecionado?: (numero: number) => void;
  onToggleTodos?: (numeros: number[], marcar: boolean) => void;
  /** Edições pendentes (sobrepõem o valor exibido). Presente = células editáveis. */
  edicoes?: Map<number, Partial<NotaInput>>;
  onEditar?: (numero: number, campo: string, valor: Celula) => void;
  statusOpcoes?: string[];
  prioridadeOpcoes?: string[];
}

interface CelulaEditando {
  numero: number;
  campo: string;
}

export function NotesTable(props: NotesTableProps): React.JSX.Element {
  const {
    registros,
    colunas,
    altura = 520,
    selecionados,
    onToggleSelecionado,
    edicoes,
    onEditar,
    statusOpcoes = [],
    prioridadeOpcoes = [],
  } = props;
  const [scrollTop, setScrollTop] = React.useState(0);
  const [ordem, setOrdem] = React.useState<{
    campo: string;
    asc: boolean;
  } | null>(null);
  const [editando, setEditando] = React.useState<CelulaEditando | null>(null);

  const ordenados = React.useMemo(() => {
    if (!ordem) return registros;
    const fator = ordem.asc ? 1 : -1;
    const copia = [...registros];
    if (ordem.campo === "Mes_Execucao_Planejado") {
      copia.sort(
        (a, b) =>
          fator * compararDatas(a[ordem.campo] ?? null, b[ordem.campo] ?? null),
      );
    } else {
      copia.sort((a, b) => {
        const va = a[ordem.campo];
        const vb = b[ordem.campo];
        const na = Number(va);
        const nb = Number(vb);
        if (Number.isFinite(na) && Number.isFinite(nb))
          return fator * (na - nb);
        return (
          fator * String(va ?? "").localeCompare(String(vb ?? ""), "pt-BR")
        );
      });
    }
    return copia;
  }, [registros, ordem]);

  const inicio = Math.max(0, Math.floor(scrollTop / ALTURA_LINHA) - 5);
  const qtdVisiveis = Math.ceil(altura / ALTURA_LINHA) + 10;
  const fatia = ordenados.slice(inicio, inicio + qtdVisiveis);

  function valor(r: NotaInput, campo: string): Celula {
    const pendente = edicoes?.get(r.Numero_Nota);
    if (pendente && campo in pendente) return pendente[campo] ?? null;
    return r[campo] ?? null;
  }

  function cabecalho(c: ColunaDef): React.JSX.Element {
    const ativa = ordem?.campo === c.key;
    return (
      <th
        key={c.key}
        onClick={() =>
          setOrdem({ campo: c.key, asc: ativa ? !ordem!.asc : true })
        }
        style={{
          position: "sticky",
          top: 0,
          zIndex: 1,
          background: "var(--surface)",
          borderBottom: "1px solid var(--line)",
          padding: "6px 10px",
          textAlign: "left",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: ".05em",
          color: ativa ? "var(--accent)" : "var(--text-mute)",
          cursor: "pointer",
          whiteSpace: "nowrap",
          minWidth: c.largura ?? 90,
        }}
      >
        {c.label}
        {ativa ? (ordem!.asc ? " ↑" : " ↓") : ""}
      </th>
    );
  }

  function celula(r: NotaInput, c: ColunaDef): React.JSX.Element {
    const v = valor(r, c.key);
    const editavel = Boolean(onEditar && c.editavel);
    const emEdicao =
      editando && editando.numero === r.Numero_Nota && editando.campo === c.key;
    const alterada = Boolean(
      edicoes?.get(r.Numero_Nota) &&
      c.key in (edicoes.get(r.Numero_Nota) ?? {}),
    );

    if (emEdicao && onEditar) {
      const confirmar = (novo: string): void => {
        onEditar(r.Numero_Nota, c.key, novo);
        setEditando(null);
      };
      const opcoes =
        c.opcoes === "status"
          ? statusOpcoes
          : c.opcoes === "prioridade"
            ? prioridadeOpcoes
            : null;
      return (
        <td key={c.key} style={{ padding: 0 }}>
          {opcoes ? (
            <select
              autoFocus
              defaultValue={String(v ?? "")}
              onChange={(e) => confirmar(e.target.value)}
              onBlur={() => setEditando(null)}
              style={{ width: "100%", height: ALTURA_LINHA - 4 }}
            >
              {opcoes.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              autoFocus
              defaultValue={String(v ?? "")}
              onBlur={(e) => confirmar(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  confirmar((e.target as HTMLInputElement).value);
                if (e.key === "Escape") setEditando(null);
              }}
              style={{
                width: "100%",
                height: ALTURA_LINHA - 4,
                boxSizing: "border-box",
              }}
            />
          )}
        </td>
      );
    }
    return (
      <td
        key={c.key}
        title={editavel ? "Duplo clique para editar" : undefined}
        onDoubleClick={
          editavel
            ? () => setEditando({ numero: r.Numero_Nota, campo: c.key })
            : undefined
        }
        style={{
          padding: "0 10px",
          borderBottom: "1px solid var(--line)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 320,
          height: ALTURA_LINHA,
          fontSize: 12.5,
          cursor: editavel ? "cell" : "default",
          color: alterada ? "var(--accent)" : "var(--text)",
          fontWeight: alterada ? 600 : 400,
        }}
      >
        {c.numeric
          ? formatarNumero(
              v,
              c.key === "Numero_Nota" || c.key === "ranking" ? 0 : 2,
            )
          : String(v ?? "")}
      </td>
    );
  }

  const numerosFatia = fatia.map((r) => r.Numero_Nota);
  return (
    <div
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      style={{
        height: altura,
        overflow: "auto",
        border: "1px solid var(--line)",
        borderRadius: 8,
      }}
    >
      <div
        style={{
          height: ordenados.length * ALTURA_LINHA + ALTURA_LINHA,
          position: "relative",
        }}
      >
        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            position: "absolute",
            top: 0,
            transform: `translateY(${inicio * ALTURA_LINHA}px)`,
          }}
        >
          <thead>
            <tr>
              {selecionados && (
                <th
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    background: "var(--surface)",
                    borderBottom: "1px solid var(--line)",
                    width: 36,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={
                      numerosFatia.length > 0 &&
                      numerosFatia.every((n) => selecionados.has(n))
                    }
                    onChange={(e) =>
                      props.onToggleTodos?.(numerosFatia, e.target.checked)
                    }
                  />
                </th>
              )}
              {colunas.map(cabecalho)}
            </tr>
          </thead>
          <tbody>
            {fatia.map((r) => (
              <tr
                key={r.Numero_Nota}
                style={{
                  background: selecionados?.has(r.Numero_Nota)
                    ? "var(--accent-tint)"
                    : "transparent",
                }}
              >
                {selecionados && (
                  <td
                    style={{
                      textAlign: "center",
                      borderBottom: "1px solid var(--line)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selecionados.has(r.Numero_Nota)}
                      onChange={() => onToggleSelecionado?.(r.Numero_Nota)}
                    />
                  </td>
                )}
                {colunas.map((c) => celula(r, c))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
