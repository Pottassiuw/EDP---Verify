/* Direction C — "Insight Board": organised around the problem itself.
   A breakdown header shows the distribution of SAP blockers; below, notes are
   grouped into collapsible lanes by their primary chk_ failure. */

function DirInsightBoard({ theme = "dark", density = "cozy" }) {
  const { notes, ruleStats, totals, RULES, file } = window.EDP;
  const stats = ruleStats();
  const maxN = Math.max(...Object.values(stats));
  const palette = ["red","amber","blue","indigo","green","red","amber","blue"];
  const W = 1380, H = 904;

  // group notes by their first (primary) blocker
  const groups = {};
  notes.filter(n => n.errors.length).forEach((n) => {
    const k = n.errors[0].rule;
    (groups[k] = groups[k] || []).push(n);
  });
  const ordered = Object.keys(stats).sort((a,b)=>stats[b]-stats[a]).filter(k => groups[k]);

  return (
    <div className="edp dir-c" data-theme={theme} data-density={density}
         style={{ width: W, height: H, background: "var(--bg)", display: "flex",
                  flexDirection: "column", fontFamily: "var(--font-body)", overflow: "hidden" }}>
      <style>{`
        .dir-c .ncard{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);
          padding:13px 15px;cursor:pointer;transition:all .13s;display:flex;flex-direction:column;gap:9px}
        .dir-c .ncard:hover{border-color:var(--line-2);transform:translateY(-1px);box-shadow:var(--shadow)}
        .dir-c .lane-head{display:flex;align-items:center;gap:11px;padding:11px 4px}
      `}</style>

      {/* topbar */}
      <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "0 24px", background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Logo theme={theme} h={24} />
          <span className="edp-mono" style={{ fontSize: 11, color: "var(--text-mute)", background: "var(--bg-2)",
                     padding: "4px 9px", borderRadius: 6, border: "1px solid var(--line)" }}>{file}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...ctrlStyle, width: 230 }} placeholder="Buscar nota, referência…" />
          <div className="edp-seg"><button className="on">Escuro</button><button>Claro</button></div>
        </div>
      </div>

      {/* insight header: summary tiles + breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 1, background: "var(--line)",
                    borderBottom: "1px solid var(--line)" }}>
        <div style={{ background: "var(--surface)", padding: "18px 24px", display: "flex", gap: 30, alignItems: "center" }}>
          <div>
            <div className="edp-eyebrow">Notas bloqueadas no SAP</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 44, lineHeight: 1,
                          color: "var(--red)", letterSpacing: "-0.02em" }}>{totals.err}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 4 }}>
              de {totals.total} · {totals.ok} conformes · {totals.done} concluídas</div>
          </div>
          <div style={{ display: "flex", gap: 22 }}>
            <Donut pct={Math.round(totals.ok/totals.total*100)} size={90} />
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
              {[["Alta urgência", notes.filter(n=>n.prioridade<=2 && n.errors.length).length, "amber"],
                ["Sem coordenada", stats["chk_coordenada"]||0, "blue"]].map(([l,v,c])=>(
                <div key={l}>
                  <div className="edp-eyebrow">{l}</div>
                  <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:22,
                                color:"var(--"+c+")", lineHeight:1 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ background: "var(--surface)", padding: "18px 24px" }}>
          <div className="edp-eyebrow" style={{ marginBottom: 13 }}>Distribuição dos bloqueios</div>
          <RuleBreakdown stats={stats} max={maxN} compact />
        </div>
      </div>

      {/* lanes */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 24px 24px" }}>
        {ordered.map((rule, gi) => {
          const color = "var(--" + palette[gi % palette.length] + ")";
          const list = groups[rule];
          return (
            <div key={rule} style={{ marginTop: 16 }}>
              <div className="lane-head">
                <span style={{ width: 9, height: 9, borderRadius: 3, background: color }} />
                <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, margin: 0 }}>
                  {RULES[rule].label}</h3>
                <span className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)" }}>
                  {list.length} {list.length > 1 ? "notas" : "nota"}</span>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>▾</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--gap)" }}>
                {list.map((n) => {
                  const done = n.id === "104728934";
                  return (
                    <div key={n.id} className="ncard">
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span className="edp-mono" style={{ fontSize: 13, fontWeight: 600 }}>{n.id}</span>
                        <PriorityChip p={n.prioridade} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{n.tipo_nota}</div>
                        <div className="edp-mono" style={{ fontSize: 11, color: "var(--text-mute)", marginTop: 2 }}>
                          {n.referencia}</div>
                      </div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {n.errors.map((e) => <RuleTag key={e.rule} rule={e.rule} />)}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                                    paddingTop: 9, borderTop: "1px solid var(--line)" }}>
                        <span style={{ fontSize: 11, color: "var(--text-mute)" }}>{n.uf} · {n.setor}</span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="edp-btn coffee sm" style={{ padding: "4px 8px", fontSize: 11 }}>☕</button>
                          <button className={"edp-btn sm" + (done ? " primary" : "")}
                                  style={{ padding: "4px 9px", fontSize: 11 }}>{done ? "✓" : "Marcar"}</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
window.DirInsightBoard = DirInsightBoard;
