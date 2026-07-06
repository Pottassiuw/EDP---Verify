import React from "react";
import type { Celula, NotaInput } from "./types";
import type { ColunaDef } from "./columns";
import { compararDatas, formatarNumero } from "./lib";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

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

const HEADER_STICKY: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  background: "var(--surface)",
  boxShadow: "inset 0 -1px 0 var(--line)",
};

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
  const espacoTopo = inicio * ALTURA_LINHA;
  const espacoFundo = Math.max(
    0,
    (ordenados.length - inicio - fatia.length) * ALTURA_LINHA,
  );
  const totalColunas = colunas.length + (selecionados ? 1 : 0);

  function valor(r: NotaInput, campo: string): Celula {
    const pendente = edicoes?.get(r.Numero_Nota);
    if (pendente && campo in pendente) return pendente[campo] ?? null;
    return r[campo] ?? null;
  }

  function cabecalho(c: ColunaDef): React.JSX.Element {
    const ativa = ordem?.campo === c.key;
    return (
      <TableHead
        key={c.key}
        onClick={() =>
          setOrdem({ campo: c.key, asc: ativa ? !ordem!.asc : true })
        }
        style={{
          ...HEADER_STICKY,
          cursor: "pointer",
          whiteSpace: "nowrap",
          minWidth: c.largura ?? 90,
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: ativa ? "var(--accent)" : "var(--text-mute)",
        }}
      >
        {c.label}
        {ativa ? (ordem!.asc ? " ↑" : " ↓") : ""}
      </TableHead>
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
        <TableCell key={c.key} style={{ padding: 0, height: ALTURA_LINHA }}>
          {opcoes ? (
            <select
              autoFocus
              defaultValue={String(v ?? "")}
              aria-label={`Editar ${c.label}`}
              className="edp-field"
              onChange={(e) => confirmar(e.target.value)}
              onBlur={() => setEditando(null)}
              style={{ width: "100%", height: ALTURA_LINHA - 4, fontSize: 12.5 }}
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
              aria-label={`Editar ${c.label}`}
              className="edp-field"
              onBlur={(e) => confirmar(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  confirmar((e.target as HTMLInputElement).value);
                if (e.key === "Escape") setEditando(null);
              }}
              style={{
                width: "100%",
                height: ALTURA_LINHA - 4,
                fontSize: 12.5,
                boxSizing: "border-box",
              }}
            />
          )}
        </TableCell>
      );
    }
    return (
      <TableCell
        key={c.key}
        title={editavel ? "Duplo clique para editar" : undefined}
        onDoubleClick={
          editavel
            ? () => setEditando({ numero: r.Numero_Nota, campo: c.key })
            : undefined
        }
        style={{
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 320,
          height: ALTURA_LINHA,
          fontSize: 12.5,
          cursor: editavel ? "cell" : "default",
          color: alterada ? "var(--accent)" : undefined,
          fontWeight: alterada ? 600 : undefined,
          borderBottom: "1px solid var(--line)",
        }}
      >
        {c.numeric
          ? c.key === "Numero_Nota" || c.key === "ranking"
            ? formatarNumero(v, 0, false) // IDs/ranking: inteiro puro, sem separador de milhar
            : formatarNumero(v, 2)
          : String(v ?? "")}
      </TableCell>
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
      <Table style={{ borderCollapse: "collapse" }}>
        <TableHeader>
          <TableRow>
            {selecionados && (
              <TableHead style={{ ...HEADER_STICKY, width: 36, textAlign: "center" }}>
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
              </TableHead>
            )}
            {colunas.map(cabecalho)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {espacoTopo > 0 && (
            <tr style={{ height: espacoTopo }}>
              <td colSpan={totalColunas} style={{ padding: 0, border: 0 }} />
            </tr>
          )}
          {fatia.map((r) => (
            <TableRow
              key={r.Numero_Nota}
              style={{
                background: selecionados?.has(r.Numero_Nota)
                  ? "var(--accent-tint)"
                  : undefined,
              }}
            >
              {selecionados && (
                <TableCell style={{ textAlign: "center", height: ALTURA_LINHA, borderBottom: "1px solid var(--line)" }}>
                  <input
                    type="checkbox"
                    checked={selecionados.has(r.Numero_Nota)}
                    onChange={() => onToggleSelecionado?.(r.Numero_Nota)}
                  />
                </TableCell>
              )}
              {colunas.map((c) => celula(r, c))}
            </TableRow>
          ))}
          {espacoFundo > 0 && (
            <tr style={{ height: espacoFundo }}>
              <td colSpan={totalColunas} style={{ padding: 0, border: 0 }} />
            </tr>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
