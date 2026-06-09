/* Direction A — "Refined Ledger": the familiar table, modernized.
   Keeps every affordance they have (rule filter, stats, batch, COFFEE, modal)
   but with cleaner hierarchy, calmer type, and the full brand spectrum. */

function DirRefinedLedger({ theme = "dark", density = "cozy" }) {
  const { notes, ruleStats, totals, RULES, file } = window.EDP;
  const [active, setActive] = React.useState("chk_coordenada");
  const [sel, setSel] = React.useState(() => new Set(["104728815", "104728842"]));
  const stats = ruleStats();
  const W = 1380, H = 904;

  return (
    <div className="edp dir-a" data-theme={theme} data-density={density}
         style={{ width: W, height: H, background: "var(--bg)", display: "grid",
                  gridTemplateColumns: "248px 1fr", fontFamily: "var(--font-body)", overflow: "hidden" }}>
      <style>{`
        .dir-a .ruleitem{display:flex;align-items:center;justify-content:space-between;gap:10px;
          padding:9px 11px;border-radius:7px;cursor:pointer;color:var(--text-dim);font-size:13px;transition:all .12s}
        .dir-a .ruleitem:hover{background:var(--surface-2);color:var(--text)}
        .dir-a .ruleitem.on{background:var(--tint-green);color:var(--green);box-shadow:inset 2px 0 0 var(--green)}
        .dir-a .ruleitem .n{font-family:var(--font-mono);font-size:12px;font-weight:600;opacity:.85}
        .dir-a tbody tr{transition:background .1s}
        .dir-a tbody tr:hover td{background:var(--surface-2)}
        .dir-a tbody tr.selrow td{background:var(--tint-green)}
        .dir-a td,.dir-a th{padding:var(--row-py) 16px;text-align:left;border-bottom:1px solid var(--line)}
        .dir-a th{font-family:var(--font-mono);font-size:10px;letter-spacing:.13em;text-transform:uppercase;
          color:var(--text-mute);font-weight:500;background:var(--surface);position:sticky;top:0;z-index:2}
        .dir-a .pin{display:inline-flex;width:22px;height:22px;align-items:center;justify-content:center;
          border-radius:6px;background:var(--tint-blue);color:var(--blue);font-size:12px;margin-left:6px}
      `}</style>

      {/* sidebar */}
      <aside style={{ background: "var(--surface)", borderRight: "1px solid var(--line)",
                      display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 16px", borderBottom: "1px solid var(--line)", background: "var(--bg-2)" }}>
          <Logo theme={theme} h={24} />
        </div>
        <div style={{ padding: "16px 14px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="edp-eyebrow">Filtro por regra</span>
          <span className="edp-eyebrow" style={{ color: "var(--red)" }}>{Object.keys(stats).length}</span>
        </div>
        <div style={{ padding: "0 8px", display: "flex", flexDirection: "column", gap: 2, overflow: "auto", flex: 1 }}>
          {Object.entries(stats).sort((a,b)=>b[1]-a[1]).map(([rule, n]) => (
            <div key={rule} className={"ruleitem" + (active === rule ? " on" : "")}
                 onClick={() => setActive(active === rule ? null : rule)}>
              <span>{RULES[rule].label}</span><span className="n">{n}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: 14, borderTop: "1px solid var(--line)" }}>
          <button className="edp-btn" style={{ width: "100%", justifyContent: "center" }}>↑ Nova planilha</button>
        </div>
      </aside>

      {/* main */}
      <main style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-2)" }}>
        {/* topbar */}
        <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "0 22px", background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, margin: 0,
                         letterSpacing: "-0.01em" }}>Painel de verificação</h1>
            <span className="edp-mono" style={{ fontSize: 11, color: "var(--text-mute)", background: "var(--bg-2)",
                       padding: "4px 9px", borderRadius: 6, border: "1px solid var(--line)" }}>{file}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="edp-seg"><button className="on">Escuro</button><button>Claro</button></div>
            <div className="edp-seg"><button>Compacto</button><button className="on">Confortável</button></div>
          </div>
        </div>

        {/* stat band */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 1, background: "var(--line)",
                      borderBottom: "1px solid var(--line)" }}>
          <StatTile label="Total de notas" value={totals.total} accent="neutral" sub="no arquivo" />
          <StatTile label="Conformes" value={totals.ok} accent="green" sub="prontas p/ SAP" />
          <StatTile label="Com erro" value={totals.err} accent="red" sub="bloqueadas" />
          <StatTile label="Visíveis" value={totals.err} accent="blue" sub="filtro atual" />
          <StatTile label="Concluídas" value={totals.done} accent="indigo" sub="tratadas" />
        </div>

        {/* filter toolbar */}
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", padding: "13px 22px",
                      background: "var(--surface)", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
          <Field label="Buscar · ID, referência, tipo" grow>
            <input style={ctrlStyle} placeholder="Ex.: 104728801, VIX-04…" />
          </Field>
          <Field label="Estado (UF)" accent>
            <select style={ctrlStyle}><option>Todos os estados</option><option>ES</option><option>SP</option></select>
          </Field>
          <Field label="Setor" accent>
            <select style={ctrlStyle}><option>Todos os setores</option></select>
          </Field>
          <Field label="Urgência">
            <select style={ctrlStyle}><option>Todas</option><option>Alta (1–2)</option></select>
          </Field>
          <Field label="Situação">
            <select style={ctrlStyle}><option>Todas</option><option>Pendentes</option></select>
          </Field>
        </div>

        {/* table */}
        <div style={{ flex: 1, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead>
              <tr>
                <th style={{ width: 38 }}><input type="checkbox" /></th>
                <th>ID / Nota</th><th style={{ width: 78 }}>Urg.</th><th>Tipo</th>
                <th>Referência</th><th>Falhas encontradas</th><th style={{ width: 120 }}>Status</th>
                <th style={{ width: 180 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((n) => {
                const isSel = sel.has(n.id);
                const done = n.id === "104728860" || n.id === "104728934";
                return (
                  <tr key={n.id} className={isSel ? "selrow" : ""}>
                    <td><input type="checkbox" checked={isSel} readOnly /></td>
                    <td><span className="edp-mono" style={{ fontSize: 13, fontWeight: 600 }}>{n.id}</span></td>
                    <td><PriorityChip p={n.prioridade} /></td>
                    <td style={{ color: "var(--text-dim)", fontSize: 13 }}>{n.tipo_nota}</td>
                    <td><span className="edp-mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>{n.referencia}</span>
                      {n.latitude && <span className="pin">◎</span>}</td>
                    <td><div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {n.errors.length ? n.errors.map((e) => <RuleTag key={e.rule} rule={e.rule} />)
                        : <span className="edp-tag ok"><span className="edp-dot" />Conforme</span>}
                    </div></td>
                    <td><StatusTag status={n.status} done={done} /></td>
                    <td><div style={{ display: "flex", gap: 6 }}>
                      <button className="edp-btn coffee sm">☕ COFFEE</button>
                      <button className={"edp-btn sm" + (done ? " primary" : "")}>{done ? "✓" : "Marcar"}</button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* selection bar */}
        <div style={{ height: 52, display: "flex", alignItems: "center", gap: 14, padding: "0 22px",
                      background: "var(--surface)", borderTop: "1px solid var(--line)" }}>
          <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
            <strong style={{ color: "var(--green)", fontFamily: "var(--font-display)", fontSize: 15 }}>{sel.size}</strong> selecionadas
          </span>
          <div style={{ width: 1, height: 22, background: "var(--line-2)" }} />
          <button className="edp-btn primary sm">✓ Marcar concluídas</button>
          <button className="edp-btn coffee sm">☕ Abrir no COFFEE</button>
          <button className="edp-btn ghost sm">Limpar seleção</button>
        </div>
      </main>
    </div>
  );
}
window.DirRefinedLedger = DirRefinedLedger;
