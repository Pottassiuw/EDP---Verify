/* EDP Verify — dataset de demonstração (sem backend), tipado.
   Espelha o formato do registro do FastAPI:
   id, prioridade, tipo_nota, referencia, uf, setor, errors[], status, raw{},
   + campos comparáveis (local_instalacao, id_sap, descricao, poste) e
   duplicates[] quando a regra chk_duplicata dispara. */
(function () {
  // Catálogo das regras chk_, com rótulo + campo do raw que falhou.
  const RULES: Record<RuleKey, RuleDef> = {
    chk_coordenada:   { label: "Coordenada",       short: "Coordenada",  field: "latitude" },
    chk_referencia:   { label: "Referência",       short: "Referência",  field: "referencia_fisica" },
    chk_imagens:      { label: "Imagens",          short: "Imagens",     field: "imagens_recebidas" },
    chk_executor:     { label: "Executor",         short: "Executor",    field: "executor" },
    chk_local_instal: { label: "Local Instalação", short: "Local",       field: "local_instalacao" },
    chk_tipo_nota:    { label: "Tipo de Nota",     short: "Tipo",        field: "tipo_nota" },
    chk_id_sap:       { label: "ID SAP",           short: "ID SAP",      field: "id_sap" },
    chk_setor:        { label: "Setor",            short: "Setor",       field: "setor" },
    chk_duplicata:    { label: "Duplicata",        short: "Duplicata",   field: "id" },
  };

  const TIPOS = ["Manutenção Corretiva", "Inspeção Termográfica", "Poda de Árvore", "Religamento",
    "Vistoria Técnica", "Troca de Poste", "Substituição de Cruzeta", "Inspeção de Linha"];

  // Descrição típica por tipo de nota (usada na comparação de duplicata).
  const DESCR = ["Troca de condutor rompido em BT", "Ponto quente em conexão de MT",
    "Vegetação em contato com a rede primária", "Religamento pós-desligamento programado",
    "Vistoria de conformidade de ramal", "Substituição de poste danificado",
    "Cruzeta de madeira deteriorada", "Inspeção de linha de distribuição rural"];

  const SETORES = ["Vitória", "Cariacica", "Serra", "Linhares", "Colatina", "São José dos Campos", "Mogi das Cruzes", "Taubaté"];
  const UF_OF: Record<string, string> = { "Vitória": "ES", "Cariacica": "ES", "Serra": "ES", "Linhares": "ES", "Colatina": "ES",
    "São José dos Campos": "SP", "Mogi das Cruzes": "SP", "Taubaté": "SP" };

  const COLAB = ["A. Ferreira", "R. Costa", "M. Oliveira", "J. Santos", "P. Almeida", "L. Rocha", "C. Nunes", "D. Pereira"];

  type RawRow = [string, number, number, number, string, RuleKey[], boolean, number, number, number];
  // [id, prio, tipoIdx, setorIdx, ref, errs[], hasCoord, colabIdx, imgTot, imgRec]
  const RAW: RawRow[] = [
    ["104728801", 1, 0, 0, "VIX-04 · P-2231", ["chk_coordenada", "chk_imagens"], false, 0, 6, 2],
    ["104728815", 2, 1, 2, "SER-11 · TR-088", ["chk_executor"], true, 1, 4, 4],
    ["104728842", 1, 5, 1, "CAR-02 · P-1190", ["chk_coordenada", "chk_referencia", "chk_local_instal"], false, 2, 8, 0],
    ["104728860", 4, 3, 3, "LIN-07 · CH-4521", [], true, 3, 3, 3],
    ["104728877", 2, 2, 0, "VIX-09 · P-3340", ["chk_imagens"], true, 4, 5, 1],
    ["104728889", 3, 4, 4, "COL-03 · P-0771", ["chk_setor"], true, 5, 2, 2],
    ["104728901", 1, 7, 5, "SJC-21 · LT-1180", ["chk_coordenada", "chk_id_sap"], false, 6, 7, 3],
    ["104728934", 5, 6, 2, "SER-04 · CZ-9921", [], true, 7, 4, 4],
    ["104728948", 2, 0, 6, "MOG-15 · P-2208", ["chk_referencia"], true, 0, 6, 6],
    ["104728955", 1, 1, 7, "TAU-08 · TR-3310", ["chk_tipo_nota", "chk_imagens", "chk_executor"], true, 1, 5, 1],
    ["104728967", 3, 5, 1, "CAR-06 · P-4419", ["chk_local_instal"], true, 2, 3, 3],
    ["104728972", 4, 3, 3, "LIN-02 · CH-7740", [], true, 3, 2, 2],
    ["104728988", 1, 2, 0, "VIX-12 · P-5567", ["chk_coordenada"], false, 4, 9, 4],
    ["104729003", 2, 7, 4, "COL-08 · LT-2031", ["chk_id_sap"], true, 5, 4, 4],
    ["104729019", 6, 4, 5, "SJC-03 · P-6612", [], true, 6, 1, 1],
    ["104729024", 1, 6, 2, "SER-19 · CZ-0042", ["chk_imagens", "chk_setor"], true, 7, 6, 2],
    ["104729038", 3, 0, 6, "MOG-22 · P-8890", ["chk_referencia", "chk_executor"], true, 0, 5, 5],
    ["104729045", 2, 1, 7, "TAU-14 · TR-1209", ["chk_coordenada"], false, 1, 4, 1],
    ["104729051", 5, 3, 0, "VIX-07 · CH-3318", [], true, 2, 3, 3],
    ["104729066", 1, 5, 1, "CAR-11 · P-7723", ["chk_imagens", "chk_referencia"], true, 3, 8, 3],
  ];

  function sapFor(id: string, missing: boolean): string {
    return missing ? "-" : "45" + id.slice(2, 8);
  }
  function localOf(ref: string): string { return ref.split(" · ")[0]; }
  function posteOf(ref: string): string { return ref.split(" · ")[1]; }

  function sampleValue(k: RuleKey, ctx: { imgT: number; imgR: number }): string {
    switch (k) {
      case "chk_coordenada":   return "vazio";
      case "chk_imagens":      return ctx.imgR + " de " + ctx.imgT;
      case "chk_referencia":   return "não localizada";
      case "chk_executor":     return "não atribuído";
      case "chk_local_instal": return "divergente";
      case "chk_tipo_nota":    return "inválido";
      case "chk_id_sap":       return "vazio";
      case "chk_setor":        return "fora da malha";
      default:                 return "-";
    }
  }

  const notes: Note[] = RAW.map((r): Note => {
    const [id, prio, ti, si, ref, errKeys, coord, ci, imgT, imgR] = r;
    const setor = SETORES[si];
    const uf = UF_OF[setor];
    const errors: NoteError[] = errKeys.map((k) => ({
      rule: k, rule_name: RULES[k].label, value: sampleValue(k, { imgT, imgR }),
    }));
    const lat = coord ? "-" + (20 + Math.random() * 3).toFixed(5) : null;
    const lon = coord ? "-" + (40 + Math.random() * 3).toFixed(5) : null;
    const id_sap = sapFor(id, errKeys.includes("chk_id_sap"));
    const descricao = DESCR[ti];
    return {
      id, prioridade: prio, tipo_nota: TIPOS[ti], referencia: ref, uf, setor,
      local_instalacao: localOf(ref), poste: posteOf(ref), id_sap, descricao,
      latitude: lat, longitude: lon,
      colaborador: COLAB[ci], imagens_totais: imgT, imagens_recebidas: imgR,
      errors, status: errors.length ? "erro" : "ok", duplicates: [],
      raw: {
        id, tipo_nota: TIPOS[ti], referencia_fisica: ref, prioridade: prio,
        setor, uf, local_instalacao: localOf(ref), alimentador: localOf(ref),
        colaborador: COLAB[ci], executor: COLAB[(ci + 3) % COLAB.length],
        imagens_totais: imgT, imagens_recebidas: imgR,
        latitude: lat ?? "-", longitude: lon ?? "-", id_sap, descricao, poste: posteOf(ref),
      },
    };
  });

  // ── Clusters de duplicata ────────────────────────────────────────────────
  // Cada candidata reproduz os campos-chave da nota aberta que estão em `match`
  // e diverge nos demais — exatamente o que a triagem precisa confirmar no COFFEE.
  interface DupCfg { id: string; match: DuplicateField[]; }
  const DUPES: Record<string, DupCfg[]> = {
    // Falhou na geração E é suspeita de duplicata (todos os 4 campos batem).
    "104728815": [
      { id: "104726640", match: ["local_instalacao", "id_sap", "descricao", "poste"] },
      { id: "104719002", match: ["local_instalacao", "descricao", "poste"] },
    ],
    "104728889": [
      { id: "104727118", match: ["local_instalacao", "id_sap", "descricao", "poste"] },
    ],
    "104728948": [
      { id: "104728990", match: ["local_instalacao", "id_sap", "descricao"] },
      { id: "104715551", match: ["local_instalacao", "id_sap", "descricao", "poste"] },
      { id: "104701277", match: ["descricao", "poste"] },
    ],
    // Caso "puro": só não gerou por ser duplicata.
    "104729019": [
      { id: "104728610", match: ["local_instalacao", "id_sap", "descricao", "poste"] },
    ],
  };

  const altLocal = (base: Note): string => {
    const [p, n] = base.local_instalacao.split("-");
    return p + "-" + String((Number(n) + 13) % 90 + 1).padStart(2, "0");
  };
  const altPoste = (base: Note): string => {
    const [p, n] = base.poste.split("-");
    return p + "-" + String((Number(n) + 9) % 9000).padStart(n.length, "0");
  };
  const altSap = (cand: string): string => "45" + cand.slice(2, 8);
  const altDescr = (base: Note): string => base.descricao + " (2ª via)";

  function buildCandidate(base: Note, cfg: DupCfg): DuplicateCandidate {
    const has = (f: DuplicateField): boolean => cfg.match.includes(f);
    return {
      id: cfg.id,
      match: cfg.match,
      local_instalacao: has("local_instalacao") ? base.local_instalacao : altLocal(base),
      id_sap: has("id_sap") ? base.id_sap : altSap(cfg.id),
      descricao: has("descricao") ? base.descricao : altDescr(base),
      poste: has("poste") ? base.poste : altPoste(base),
      tipo_nota: base.tipo_nota, setor: base.setor, uf: base.uf, prioridade: base.prioridade,
      latitude: base.latitude, longitude: base.longitude,
    };
  }

  notes.forEach((n) => {
    const cfgs = DUPES[n.id];
    if (!cfgs) return;
    n.duplicates = cfgs.map((c) => buildCandidate(n, c));
    if (!n.errors.some((e) => e.rule === "chk_duplicata")) {
      n.errors.push({
        rule: "chk_duplicata", rule_name: RULES.chk_duplicata.label,
        value: cfgs.length + (cfgs.length === 1 ? " candidata" : " candidatas"),
      });
    }
    n.status = "erro";
  });

  function ruleStats(): Record<RuleKey, number> {
    const s: Record<RuleKey, number> = {};
    notes.forEach((n) => n.errors.forEach((e) => { s[e.rule] = (s[e.rule] || 0) + 1; }));
    return s;
  }

  const totals: Totals = {
    total: notes.length,
    ok: notes.filter((n) => n.errors.length === 0).length,
    err: notes.filter((n) => n.errors.length > 0).length,
    done: 4,
  };

  window.EDP = { RULES, notes, ruleStats, totals, file: "Verificar_2026-06-02.xlsx" };
  window.EDP_DEMO = {
    notes, file: "Verificar_2026-06-02.xlsx",
    defaultDone: ["104728860", "104728934", "104728972", "104729051"],
    defaultDup: [],
  };
})();
