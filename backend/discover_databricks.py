"""Descoberta do schema da base COFFEE no Databricks (execucao manual).

Uso (a partir de backend/):
    venv/Scripts/python discover_databricks.py --schema SCHEMA [--catalogo CAT] [--amostra N]

Conecta no SQL Warehouse (credenciais de backend/.env), lista as tabelas do
schema alvo e, para cada uma, coleta colunas/tipos, contagem e uma amostra;
grava um relatorio em docs/dev/databricks-schema-discovery.md.
"""
import argparse
from pathlib import Path

from databricks_module import config, schema

_RELATORIO = (
    Path(__file__).resolve().parent.parent
    / "docs" / "dev" / "databricks-schema-discovery.md"
)


def _coluna_nome_tabela(df):
    """SHOW TABLES devolve colunas diferentes conforme o runtime; acha a certa."""
    for candidato in ("tableName", "table_name", "tab_name"):
        if candidato in df.columns:
            return candidato
    return df.columns[-1]


def _linhas_descricao(df):
    """DESCRIBE TABLE: pega (col_name, data_type) ate a linha em branco/particao."""
    pares = []
    for _, linha in df.iterrows():
        nome = str(linha.get("col_name", "")).strip()
        tipo = str(linha.get("data_type", "")).strip()
        if not nome or nome.startswith("#"):
            break
        pares.append((nome, tipo))
    return pares


def _ofuscar(valor, limite=40):
    texto = "" if valor is None else str(valor)
    return texto if len(texto) <= limite else texto[:limite] + "…"


def descobrir(catalogo: str, schema_alvo: str, amostra: int) -> str:
    partes = [
        "# Descoberta de Schema — Base COFFEE (Databricks)",
        "",
        f"- Catálogo: `{catalogo}`",
        f"- Schema: `{schema_alvo}`",
        f"- Server: `{config.server_hostname()}`",
        "",
    ]
    tabelas_df = schema.listar_tabelas(catalogo=catalogo, schema=schema_alvo)
    coluna_nome = _coluna_nome_tabela(tabelas_df)
    nomes = [str(v) for v in tabelas_df[coluna_nome].tolist()]
    partes.append(f"## Tabelas encontradas ({len(nomes)})\n")
    partes.append("\n".join(f"- `{n}`" for n in nomes) + "\n")

    for nome in nomes:
        partes.append(f"\n---\n\n## `{nome}`\n")
        try:
            desc = schema.descrever_tabela(nome, catalogo=catalogo, schema=schema_alvo)
            colunas = _linhas_descricao(desc)
            total = schema.contar(nome, catalogo=catalogo, schema=schema_alvo)
            col_atualizacao = schema.detectar_coluna_atualizacao(
                [c for c, _ in colunas]
            )
            partes.append(f"- Linhas: **{total}**")
            partes.append(
                f"- Coluna de última atualização detectada: "
                f"**{col_atualizacao or 'nenhuma (só sync completa)'}**\n"
            )
            partes.append("| Coluna | Tipo |")
            partes.append("|---|---|")
            for col, tipo in colunas:
                partes.append(f"| `{col}` | {tipo} |")

            amostra_df = schema.amostrar(
                nome, n=amostra, catalogo=catalogo, schema=schema_alvo
            )
            partes.append(f"\n### Amostra ({len(amostra_df)} linhas)\n")
            cols = list(amostra_df.columns)
            partes.append("| " + " | ".join(cols) + " |")
            partes.append("|" + "|".join(["---"] * len(cols)) + "|")
            for _, linha in amostra_df.iterrows():
                partes.append(
                    "| " + " | ".join(_ofuscar(linha[c]) for c in cols) + " |"
                )
        except Exception as exc:  # noqa: BLE001
            partes.append(f"\n> ERRO ao inspecionar `{nome}`: {exc}\n")

    return "\n".join(partes) + "\n"


def main():
    parser = argparse.ArgumentParser(description="Descoberta de schema Databricks")
    parser.add_argument("--catalogo", default=config.catalogo())
    parser.add_argument("--schema", default=config.schema_padrao())
    parser.add_argument("--amostra", type=int, default=10)
    args = parser.parse_args()

    conteudo = descobrir(args.catalogo, args.schema, args.amostra)
    _RELATORIO.parent.mkdir(parents=True, exist_ok=True)
    _RELATORIO.write_text(conteudo, encoding="utf-8")
    print(f"Relatorio gravado em {_RELATORIO}")


if __name__ == "__main__":
    main()
