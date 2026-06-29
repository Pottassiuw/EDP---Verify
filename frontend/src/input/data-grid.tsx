import React from "react";
import { DataSheetGrid, keyColumn, type Column } from "react-datasheet-grid";
import "react-datasheet-grid/dist/style.css";
import "./data-grid.css";
import type { Celula, NotaInput } from "./types";
import type { ColunaDef } from "./columns";
import { formatarNumero } from "./lib";

const ALTURA_LINHA = 32;

function textoCelula(v: Celula | undefined, c: ColunaDef): string {
  if (!c.numeric) return String(v ?? "");
  return c.key === "Numero_Nota" || c.key === "ranking"
    ? formatarNumero(v ?? null, 0, false)
    : formatarNumero(v ?? null, 2);
}

/** Célula só-leitura: exibe o valor formatado conforme a ColunaDef. */
function CelulaLeitura({ rowData, columnData }: {
  rowData: Celula | undefined;
  columnData: ColunaDef;
}): React.JSX.Element {
  const texto = textoCelula(rowData, columnData);
  return (
    <div className={"dsg-leitura" + (columnData.numeric ? " is-num" : "")} title={texto}>
      {texto}
    </div>
  );
}

function colunaLeitura(c: ColunaDef): Column<NotaInput> {
  return {
    // keyColumn liga a coluna à chave do registro; o componente recebe rowData = valor da célula.
    ...keyColumn<NotaInput, string>(c.key, {
      component: CelulaLeitura as never,
      columnData: c as never,
      disabled: true,
      // ponytail: copia o valor cru (Excel calcula em cima); o display é que é formatado.
      copyValue: ({ rowData }) => (rowData == null ? "" : String(rowData)),
    }),
    title: c.label,
    minWidth: c.largura ?? 90,
  };
}

export interface DataGridProps {
  registros: NotaInput[];
  colunas: ColunaDef[];
  altura?: number;
}

export function DataGrid({ registros, colunas, altura = 520 }: DataGridProps): React.JSX.Element {
  const cols = React.useMemo(() => colunas.map(colunaLeitura), [colunas]);
  return (
    <DataSheetGrid<NotaInput>
      value={registros}
      onChange={() => { /* read-only: todas as colunas disabled */ }}
      columns={cols}
      height={altura}
      rowHeight={ALTURA_LINHA}
      lockRows
      disableContextMenu
    />
  );
}
