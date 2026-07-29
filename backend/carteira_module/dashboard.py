"""Agregacao do dashboard da Carteira: reusa montar_dashboard (Relatorios) e
adiciona a camada 'base disponivel' (fora do plano). Funcao pura, sem I/O."""
from carteira_module import config


def converter_ddpm(quantidade: float, unidade: str | None) -> float:
    q = float(quantidade or 0)
    return q / 1000 if (unidade or "").strip().upper() == "KM" else q


def _pct(numerador: float, meta: float) -> float | None:
    return None if meta == 0 else numerador / meta


def montar(dash: dict, base_bruta: list[dict], unidade_por_plano: dict,
           nome_area_por_plano: dict) -> dict:
    """Superset do contrato de Relatorios: preserva o payload do
    montar_dashboard e funde a camada base disponivel (DDPM) dentro de
    visao_anual/regionais. Funcao pura, sem I/O."""
    # base convertida a DDPM, agregada por plano e por (regional, plano)
    base_por_plano: dict[str, float] = {}
    base_por_reg_plano: dict[tuple, float] = {}
    for linha in base_bruta:
        plano = linha["plano"]
        ddpm = converter_ddpm(linha["quantidade_bruta"], unidade_por_plano.get(plano))
        regional = config.normalizar_regional_dashboard(linha["regional"])
        base_por_plano[plano] = base_por_plano.get(plano, 0.0) + ddpm
        chave = (regional, plano)
        base_por_reg_plano[chave] = base_por_reg_plano.get(chave, 0.0) + ddpm

    # Split preservado da Fase 3: base entra na linha/cobertura só de planos
    # com meta > 0 (alvos reais). Conjuntos com meta 0 — OPEX (poda/manut) ou
    # sem meta no ano — vão só para base_por_plano_sem_meta; misturá-los
    # inflaria a cobertura (base OPEX é enorme).
    planos_com_meta = {l["plano"] for l in dash.get("visao_anual", [])
                       if float(l["meta"]) > 0}

    visao_anual = []
    for l in dash.get("visao_anual", []):
        meta, planejado = float(l["meta"]), float(l["carteira"])
        base = base_por_plano.get(l["plano"], 0.0) if meta > 0 else 0.0
        visao_anual.append({
            **l,
            "base_disponivel": base,
            "cobertura_pct": _pct(planejado + base, meta),
            "suficiente": base >= max(0.0, meta - planejado),
        })

    regionais = []
    for r in dash.get("regionais", []):
        meta, planejado = float(r["meta"]), float(r["carteira"])
        # só a base de conjuntos com meta entra na cobertura da regional
        # (senão a base OPEX domina e a % perde o sentido).
        base = sum(v for (reg, pl), v in base_por_reg_plano.items()
                   if reg == r["regional"] and pl in planos_com_meta)
        regionais.append({
            **r,
            "base_disponivel": base,
            "cobertura_pct": _pct(planejado + base, meta),
        })

    base_sem_meta = []
    for plano, base in base_por_plano.items():
        if plano in planos_com_meta:
            continue
        nome, area = nome_area_por_plano.get(plano, (plano, "Outros"))
        base_sem_meta.append({"plano": plano, "nome_curto": nome,
                              "area": area, "base_disponivel": base})
    base_sem_meta.sort(key=lambda x: -x["base_disponivel"])

    return {
        "ano": dash.get("ano"),
        "mes_referencia": dash.get("mes_referencia"),
        "regional": dash.get("regional"),
        "regionais_disponiveis": dash.get("regionais_disponiveis", []),
        "hero": dash.get("hero", {}),
        "visao_anual": visao_anual,
        "mensalizacao": dash.get("mensalizacao", []),
        "regionais": regionais,
        "financeiro_ano": dash.get("financeiro_ano", {}),
        "avisos": dash.get("avisos", {"executadas_sem_data": 0}),
        "base_por_plano_sem_meta": base_sem_meta,
    }
