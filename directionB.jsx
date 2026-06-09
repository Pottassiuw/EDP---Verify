/* Direction B — "Triage Workspace": work the queue note-by-note.
   Compact KPI strip + donut on top, a scannable queue on the left, and a
   persistent detail panel on the right (no modal). Built for flow. */

function DirTriage({ theme = "dark", density = "cozy" }) {
  const { notes, totals, RULES, file } = window.EDP;
  const [selId, setSelId] = React.useState("104728842");
  const sel = notes.find((n) => n.id === selId);
  const pct = Math.round((totals.ok / totals.total) * 100);
  const W = 1380, H = 904;

  return (
    <div className="edp dir-b" data-theme={theme} data-density={density}
         style={{ width: W, height: H, background: "var(--bg)", display: "flex",
                  flexDirection: "column", fontFamily: "var(--font-body)", overflow: "hidden" }}>
      <style>{`
        .dir-b .q{display:flex;align-items:center;gap:12px;padding:11px 16px;cursor:pointer;
          border-bottom:1px solid var(--line);border-left:3px solid transparent;transition:background .1s}
        .dir-b .q:hover{background:var(--surface-2)}
        .dir-b .q.on{background:var(--surface-2);border-left-color:var(--green)}
        .dir-b .kv{display:flex;flex-direction:column;gap:3px}
        .dir-b .kv small{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.1em;
          text-transform:uppercase;color:var(--text-mute)}
        .dir-b .kv div{font-size:13px;color:var(--text)}
      `}</style>

      {/* topbar */}
      <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "0 22px", background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
        <Logo theme={theme} h={24} />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="edp-mono" style={{ fontSize: 11, color: "var(--text-mute)" }}>{file}</span>
          <div className="edp-seg"><button className="on">Escuro</button><button>Claro</button></div>
        </div>
      </div>

      {/* KPI strip with donut */}
      <div style={{ display: "flex", alignItems: "stretch", gap: 1, background: "var(--line)",
                    borderBottom: "1px solid var(--line)" }}>
        <div style={{ background: "var(--surface)", padding: "16px 26px", display: "flex",
                      alignItems: "center", gap: 18 }}>
          <Donut pct={pct} size={86} />
          <div>
            <div className="edp-eyebrow">Conformidade</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, lineHeight: 1.1 }}>
              {totals.ok} / {totals.total}</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>notas prontas para o SAP</div>
          </div>
        </div>
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: "var(--line)" }}>
          <StatTile label="Total" value={totals.total} accent="neutral" />
          <StatTile label="Com erro" value={totals.err} accent="red" />
          <StatTile label="Alta urgência" value={notes.filter(n=>n.prioridade<=2).length} accent="amber" />
          <StatTile label="Concluídas" value={totals.done} accent="indigo" />
        </div>
      </div>

      {/* body: queue + detail */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "minmax(420px,1fr) 1.25fr", overflow: "hidden" }}>
        {/* queue */}
        <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid var(--line)", overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 9, alignItems: "center", padding: "11px 16px",
                        borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
            <input style={{ ...ctrlStyle, flex: 1 }} placeholder="Buscar nota, referência…" />
            <select style={{ ...ctrlStyle, width: 120 }}><option>Urgência</option></select>
          </div>
          <div style={{ flex: 1, overflow: "auto", background: "var(--surface)" }}>
            {notes.filter(n=>n.errors.length).map((n) => (
              <div key={n.id} className={"q" + (n.id === selId ? " on" : "")} onClick={() => setSelId(n.id)}>
                <PriorityChip p={n.prioridade} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="edp-mono" style={{ fontSize: 13, fontWeight: 600 }}>{n.id}</span>
                    <span style={{ fontSize: 11, color: "var(--text-mute)" }}>· {n.setor}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-dim)", whiteSpace: "nowrap",
                                overflow: "hidden", textOverflow: "ellipsis" }}>{n.tipo_nota}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="edp-mono" style={{ fontSize: 11, color: "var(--red)", fontWeight: 600 }}>
                    {n.errors.length} {n.errors.length > 1 ? "falhas" : "falha"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* detail panel */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-2)" }}>
          <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--line)", background: "var(--surface)",
                        display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, margin: 0 }}>
                  Nota {sel.id}</h2>
                <PriorityChip p={sel.prioridade} />
                <StatusTag status={sel.status} />
              </div>
              <div className="edp-mono" style={{ fontSize: 12, color: "var(--text-mute)", marginTop: 5 }}>
                {sel.tipo_nota} · {sel.referencia} · {sel.uf}/{sel.setor}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="edp-btn coffee sm">☕ COFFEE</button>
              <button className="edp-btn primary sm">✓ Concluir</button>
            </div>
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 22 }}>
            {/* failures */}
            <section>
              <div className="edp-eyebrow" style={{ marginBottom: 11 }}>⚠ Falhas encontradas ({sel.errors.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sel.errors.map((e) => (
                  <div key={e.rule} style={{ background: "var(--tint-red)", border: "1px solid rgba(240,85,92,0.25)",
                       borderLeft: "3px solid var(--red)", borderRadius: "var(--r-sm)", padding: "11px 14px" }}>
                    <div className="edp-mono" style={{ fontSize: 10.5, color: "var(--red)", letterSpacing: ".08em" }}>{e.rule}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginTop: 2 }}>{e.rule_name}</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 2 }}>Valor: {e.value}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* fields grid */}
            <section>
              <div className="edp-eyebrow" style={{ marginBottom: 11 }}>Identificação & localização</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1,
                            background: "var(--line)", borderRadius: "var(--r-sm)", overflow: "hidden",
                            border: "1px solid var(--line)" }}>
                {[["Tipo de nota", sel.tipo_nota], ["Referência", sel.referencia], ["Colaborador", sel.colaborador],
                  ["Estado", sel.uf], ["Setor", sel.setor], ["Local instal.", sel.raw.local_instalacao],
                  ["Imagens", sel.imagens_recebidas + " / " + sel.imagens_totais],
                  ["Latitude", sel.latitude || "—"], ["Longitude", sel.longitude || "—"]].map(([k, v]) => (
                  <div key={k} className="kv" style={{ background: "var(--surface)", padding: "11px 14px" }}>
                    <small>{k}</small><div className="edp-mono" style={{ fontSize: 12.5 }}>{v}</div>
                  </div>
                ))}
              </div>
              {sel.latitude && <button className="edp-btn sm" style={{ marginTop: 12, color: "var(--blue)",
                borderColor: "rgba(31,159,214,0.4)" }}>◎ Abrir no Google Maps</button>}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
window.DirTriage = DirTriage;
