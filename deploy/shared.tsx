/* EDP Verify — átomos compartilhados (React, expostos em window), tipados. */

const LOGO_DARK = "frontend/assets/RGB/Dark/Regular/NEG/EDP_Group_MasterLogo_RGB_Dark_NEG.png";
const LOGO_LIGHT = "frontend/assets/RGB/Light/Regular/POS/EDP_Group_MasterLogo_RRGB_Light_POS.png";

const Logo: React.FC<LogoProps> = ({ theme = "dark", h = 24 }) => {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <img src={theme === "light" ? LOGO_LIGHT : LOGO_DARK} alt="EDP"
           style={{ height: h, width: "auto", display: "block" }} />
      <div style={{ width: 1, height: h - 4, background: "var(--line-2)" }} />
      <div style={{ lineHeight: 1.05 }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14.5,
                      letterSpacing: "-0.01em", color: "var(--text)" }}>Verify</div>
        <div className="edp-eyebrow" style={{ fontSize: 8.5, marginTop: 2 }}>De olho no problema</div>
      </div>
    </div>
  );
};

function prioMeta(p: number): [string, string | number] {
  if (p >= 99) return ["none", "—"];
  if (p <= 2) return ["high", p];
  if (p <= 4) return ["med", p];
  return ["low", p];
}
const PriorityChip: React.FC<{ p: number }> = ({ p }) => {
  const [cls, label] = prioMeta(p);
  return <span className={"edp-prio " + cls}>{label}</span>;
};

const StatusTag: React.FC<{ status: NoteStatus; done: boolean; dup?: boolean }> = ({ status, done, dup }) => {
  if (dup) return <span className="edp-tag dup"><span className="edp-dot" />Duplicata</span>;
  if (done) return <span className="edp-tag done"><span className="edp-dot" />Concluída</span>;
  return status === "ok"
    ? <span className="edp-tag ok"><span className="edp-dot" />Conforme</span>
    : <span className="edp-tag err"><span className="edp-dot" />Com erro</span>;
};

const RuleTag: React.FC<{ rule: RuleKey }> = ({ rule }) => {
  const meta = window.ruleMeta ? window.ruleMeta(rule) : { label: rule, short: rule };
  return <span className="edp-rule">{meta.short}</span>;
};

/* Stat tile — rótulo, número grande, sublinhado de destaque, sub opcional */
const StatTile: React.FC<StatTileProps> = ({ label, value, accent = "green", sub, big }) => {
  const color = "var(--" + accent + ")";
  return (
    <div style={{
      background: "var(--surface)", padding: "var(--tile-py) var(--pad)",
      display: "flex", flexDirection: "column", gap: 6, position: "relative",
      overflow: "hidden", minWidth: 0,
    }}>
      <div className="edp-eyebrow">{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 800,
                    fontSize: big ? 40 : 30, lineHeight: 1, letterSpacing: "-0.02em",
                    color: accent === "neutral" ? "var(--text)" : color }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{sub}</div>}
      <div style={{ position: "absolute", left: 0, bottom: 0, height: 3, width: "100%",
                    background: accent === "neutral" ? "var(--line-2)" : color, opacity: .9 }} />
    </div>
  );
};

/* Donut da taxa de conformidade (só o círculo) */
const Donut: React.FC<DonutProps> = ({ pct, size = 92, stroke = 11, color = "var(--green)" }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
              strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
              transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="49%" textAnchor="middle" dominantBaseline="middle"
            style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: size * 0.26, fill: "var(--text)" }}>
        {pct}%
      </text>
      <text x="50%" y="65%" textAnchor="middle" dominantBaseline="middle"
            style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: ".1em", fill: "var(--text-mute)" }}>
        OK
      </text>
    </svg>
  );
};

/* Barra horizontal de distribuição dos bloqueios chk_ */
const RuleBreakdown: React.FC<RuleBreakdownProps> = ({ stats, max, compact }) => {
  const palette = ["red", "amber", "blue", "indigo", "green"];
  const entries = Object.entries(stats).sort((a, b) => b[1] - a[1]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 7 : 10 }}>
      {entries.map(([rule, n], i) => {
        const meta = window.EDP.RULES[rule] || { label: rule };
        const color = "var(--" + palette[i % palette.length] + ")";
        return (
          <div key={rule} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 116, flexShrink: 0, fontSize: 12, color: "var(--text-dim)",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta.label}</div>
            <div style={{ flex: 1, height: 8, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: (n / max * 100) + "%", height: "100%", background: color, borderRadius: 999 }} />
            </div>
            <div className="edp-mono" style={{ width: 22, textAlign: "right", fontSize: 12.5,
                          fontWeight: 600, color: "var(--text)" }}>{n}</div>
          </div>
        );
      })}
    </div>
  );
};

/* Controle de filtro rotulado (select/search) */
const Field: React.FC<FieldProps> = ({ label, accent, children, grow }) => {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: grow ? 1 : "none", minWidth: grow ? 150 : 0 }}>
      <span className="edp-eyebrow" style={{ color: accent ? "var(--green)" : "var(--text-mute)" }}>{label}</span>
      {children}
    </label>
  );
};
const ctrlStyle: React.CSSProperties = {
  background: "var(--bg-2)", border: "1px solid var(--line-2)", color: "var(--text)",
  padding: "8px 11px", borderRadius: "var(--r-sm)", fontSize: 13, fontFamily: "var(--font-body)",
  outline: "none", width: "100%",
};

Object.assign(window, { Logo, PriorityChip, StatusTag, RuleTag, StatTile, Donut, RuleBreakdown, Field, ctrlStyle, prioMeta });
