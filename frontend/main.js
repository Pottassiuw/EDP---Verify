const API = "http://localhost:8000/api";
const IGNORED_RULES = ["trafo", "chk_trafo"];

const FIELD_GROUPS = {
  "Identificação": ["id", "tipo_nota", "referencia_fisica", "referencia_eletrica", "prioridade", "setor"],
  "Localização":   ["uf", "local_instalacao", "alimentador", "conjunto", "latitude", "longitude", "precisao"],
  "Equipe":        ["centro", "centro_trab", "colaborador", "executor"],
  "Imagens":       ["imagens_totais", "imagens_recebidas"],
  "Observações":   ["observacoes", "id_sap"],
};

const FIELD_LABELS = {
  id: "ID / Nota",
  tipo_nota: "Tipo de Nota",
  referencia_fisica: "Referência Física",
  referencia_eletrica: "Referência Elétrica",
  prioridade: "Prioridade",
  local_instalacao: "Local de Instalação",
  alimentador: "Alimentador",
  conjunto: "Conjunto",
  latitude: "Latitude",
  longitude: "Longitude",
  precisao: "Precisão",
  centro: "Centro",
  centro_trab: "Centro de Trabalho",
  colaborador: "Colaborador",
  executor: "Executor",
  imagens_totais: "Imagens Totais",
  imagens_recebidas: "Imagens Recebidas",
  observacoes: "Observações",
  id_sap: "ID SAP",
  uf: "Estado (UF)",
  setor: "Setor",
};

const GROUPED_KEYS = new Set(Object.values(FIELD_GROUPS).flat());

let data = [];
let completed = new Set(
  JSON.parse(localStorage.getItem("completedNotes") || "[]"),
);
let activeRules = new Set();
let selected = new Set();
let coffeeWarned = false;
let activeUf = "all";
let activeSetor = "all";

/* ── Debounce ── */
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ── Tema ── */
const LOGO_DARK = "assets/RGB/Dark/Regular/NEG/EDP_Group_MasterLogo_RGB_Dark_NEG.svg";
const LOGO_LIGHT = "assets/RGB/Light/Regular/POS/EDP_Group_MasterLogo_RGB_Light_POS.svg";

function applyLogoTheme(theme) {
  const src = theme === "light" ? LOGO_LIGHT : LOGO_DARK;
  ["logo-upload", "logo-sidebar"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.src = src;
  });
}

function toggleTheme() {
  const isLight = document.documentElement.dataset.theme === "light";
  const next = isLight ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("edp-theme", next);
  document.getElementById("theme-icon").textContent = isLight ? "☀" : "🌙";
  applyLogoTheme(next);
}

function initTheme() {
  const saved = localStorage.getItem("edp-theme") || "dark";
  document.documentElement.dataset.theme = saved;
  const icon = document.getElementById("theme-icon");
  if (icon) icon.textContent = saved === "light" ? "🌙" : "☀";
  applyLogoTheme(saved);
}
initTheme();

const tbody = document.getElementById("tbody");
const cardList = document.getElementById("card-list");

/* ── Helpers ── */
const isIgnoredRule = (r) =>
  IGNORED_RULES.some((i) => r.toLowerCase().includes(i.toLowerCase()));
const filterErrors = (errs) => errs.filter((e) => !isIgnoredRule(e.rule));
const isMobile = () => window.innerWidth <= 600;
const hasCoords = (r) => r.latitude != null && r.longitude != null;
const mapsUrl = (lat, lon) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
const coffeeUrl = (id) =>
  `https://coffee.edp.gpti.com.br/7ff2b230b16cbe2ecdde87a58AppDeOlhoNaRede2/informativo/${id}/change/`;
const ruleLabel = (rule) => rule.replace(/^chk_/i, "").replace(/_/g, " ");
const fieldLabel = (key) => FIELD_LABELS[key] || key.replace(/_/g, " ");
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );

function priorityClass(p) {
  if (p <= 2) return "p-high";
  if (p <= 4) return "p-medium";
  return "p-low";
}

/* ── Sidebar ── */
function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("sidebar-overlay").classList.add("show");
  document.body.style.overflow = "hidden";
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("show");
  document.body.style.overflow = "";
}

/* ── Upload ── */
async function handleFile(file) {
  const loader = document.getElementById("loader");
  loader.style.display = "block";
  loader.querySelector("span").style.width = "35%";

  const fd = new FormData();
  fd.append("file", file);

  try {
    const res = await fetch(`${API}/upload`, { method: "POST", body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert("Erro ao enviar planilha: " + (err.detail || res.status));
      loader.style.display = "none";
      return;
    }
    loader.querySelector("span").style.width = "75%";
    await loadData();
    loader.querySelector("span").style.width = "100%";
    localStorage.setItem("lastUploadedFile", file.name);
    document.getElementById("file-badge").textContent = file.name;
    setTimeout(() => {
      document.getElementById("upload-screen").style.display = "none";
      document.getElementById("dashboard-screen").style.display = "block";
    }, 300);
  } catch (err) {
    alert(
      "Não foi possível conectar à API. Verifique se o servidor está rodando.",
    );
    loader.style.display = "none";
  }
}

async function loadData() {
  const res = await fetch(`${API}/data`);
  const json = await res.json();
  data = json.records;
  completed = new Set(json.completed);
  JSON.parse(localStorage.getItem("completedNotes") || "[]").forEach((id) =>
    completed.add(id),
  );
  renderRules(json.rule_stats);
  populateSelect("f-uf", json.uf_options || [], "Todos os estados");
  populateSelect("f-setor", json.setor_options || [], "Todos os setores");
  renderTable();
  updateStats();
}

/* Ao abrir a página: restaura dashboard se o backend já tem dados */
async function autoRestore() {
  try {
    const res = await fetch(`${API}/data`);
    if (!res.ok) return;
    const json = await res.json();
    if (!json.records || json.records.length === 0) return;

    data = json.records;
    completed = new Set(json.completed);
    JSON.parse(localStorage.getItem("completedNotes") || "[]").forEach((id) =>
      completed.add(id),
    );

    const savedFile = localStorage.getItem("lastUploadedFile") || "planilha carregada";
    document.getElementById("file-badge").textContent = savedFile;

    renderRules(json.rule_stats);
    populateSelect("f-uf", json.uf_options || [], "Todos os estados");
    populateSelect("f-setor", json.setor_options || [], "Todos os setores");
    renderTable();
    updateStats();

    document.getElementById("upload-screen").style.display = "none";
    document.getElementById("dashboard-screen").style.display = "block";
  } catch {
    /* servidor offline — fica na tela de upload normalmente */
  }
}
autoRestore();

function populateSelect(id, options, placeholder) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = `<option value="all">${placeholder}</option>`;
  options.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  });
  /* hide the filter wrapper if no options available */
  const wrapper = sel.closest(".filter");
  if (wrapper) wrapper.style.display = options.length ? "" : "none";
}

function resetToUpload() {
  document.getElementById("dashboard-screen").style.display = "none";
  document.getElementById("upload-screen").style.display = "flex";
  document.getElementById("loader").style.display = "none";
  document.getElementById("loader").querySelector("span").style.width = "0%";
  document.getElementById("file-input").value = "";
  localStorage.removeItem("lastUploadedFile");
  activeRules.clear();
  selected.clear();
  activeUf = "all";
  activeSetor = "all";
  const fUf = document.getElementById("f-uf");
  if (fUf) fUf.value = "all";
  const fSetor = document.getElementById("f-setor");
  if (fSetor) fSetor.value = "all";
  closeSidebar();
}

/* ── Sidebar rules (multi-select) ── */
function renderRules(stats) {
  const list = document.getElementById("rule-list");
  list.innerHTML = "";

  Object.entries(stats)
    .filter(([rule]) => !isIgnoredRule(rule))
    .sort((a, b) => b[1] - a[1])
    .forEach(([rule, count]) => {
      const b = document.createElement("button");
      b.className = "rule-btn" + (activeRules.has(rule) ? " active" : "");
      b.dataset.rule = rule;
      b.innerHTML = `<span>${ruleLabel(rule)}</span><strong>${count}</strong>`;
      b.onclick = () => {
        if (activeRules.has(rule)) activeRules.delete(rule);
        else activeRules.add(rule);
        b.classList.toggle("active");
        renderTable();
      };
      list.appendChild(b);
    });

  updateClearRulesBtn();
}

function updateClearRulesBtn() {
  const btn = document.getElementById("clear-rules-btn");
  if (!btn) return;
  btn.style.display = activeRules.size > 0 ? "block" : "none";
  btn.textContent = `Limpar regras (${activeRules.size})`;
}

function clearRules() {
  activeRules.clear();
  document
    .querySelectorAll(".rule-btn")
    .forEach((b) => b.classList.remove("active"));
  renderTable();
}

/* ── Busca / filtros ── */
function searchTerms() {
  const raw = document.getElementById("f-search").value.toLowerCase().trim();
  return raw ? raw.split(/[\s,;\n]+/).filter(Boolean) : [];
}

function getFiltered() {
  const terms = searchTerms();
  const status = document.getElementById("f-status").value;
  const priority = document.getElementById("f-priority").value;
  const doneF = document.getElementById("f-done").value;
  activeUf = document.getElementById("f-uf")?.value ?? "all";
  activeSetor = document.getElementById("f-setor")?.value ?? "all";

  return data.filter((r) => {
    const errors = filterErrors(r.errors);
    const realStatus = errors.length ? "erro" : "ok";

    if (activeRules.size > 0 && !errors.some((e) => activeRules.has(e.rule)))
      return false;
    if (priority === "high" && r.prioridade > 2) return false;
    if (priority === "medium" && (r.prioridade < 3 || r.prioridade > 4))
      return false;
    if (priority === "low" && r.prioridade < 5) return false;
    if (status !== "all" && realStatus !== status) return false;

    const done = completed.has(r.id);
    if (doneF === "pending" && done) return false;
    if (doneF === "done" && !done) return false;

    if (activeUf !== "all" && r.uf !== activeUf) return false;
    if (activeSetor !== "all" && r.setor !== activeSetor) return false;

    if (terms.length) {
      const hay = `${r.id} ${r.referencia} ${r.tipo_nota}`.toLowerCase();
      if (!terms.some((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

function hasActiveFilters() {
  return (
    activeRules.size > 0 ||
    searchTerms().length > 0 ||
    document.getElementById("f-status").value !== "all" ||
    document.getElementById("f-priority").value !== "all" ||
    document.getElementById("f-done").value !== "all" ||
    (document.getElementById("f-uf")?.value ?? "all") !== "all" ||
    (document.getElementById("f-setor")?.value ?? "all") !== "all"
  );
}

function clearAllFilters() {
  activeRules.clear();
  document.getElementById("f-search").value = "";
  document.getElementById("f-status").value = "all";
  document.getElementById("f-priority").value = "all";
  document.getElementById("f-done").value = "all";
  const fUf = document.getElementById("f-uf");
  if (fUf) fUf.value = "all";
  const fSetor = document.getElementById("f-setor");
  if (fSetor) fSetor.value = "all";
  document
    .querySelectorAll(".rule-btn")
    .forEach((b) => b.classList.remove("active"));
  renderTable();
}

function renderActiveChips() {
  const bar = document.getElementById("chips-bar");
  bar.innerHTML = "";

  const chips = [];

  activeRules.forEach((rule) =>
    chips.push({
      label: `Regra: ${ruleLabel(rule)}`,
      clear: () => {
        activeRules.delete(rule);
        const btn = document.querySelector(`.rule-btn[data-rule="${rule}"]`);
        if (btn) btn.classList.remove("active");
      },
    }),
  );

  const status = document.getElementById("f-status").value;
  if (status !== "all")
    chips.push({
      label: `Status: ${status === "ok" ? "Conforme" : "Com erro"}`,
      clear: () => {
        document.getElementById("f-status").value = "all";
      },
    });

  const priority = document.getElementById("f-priority").value;
  const pLabels = { high: "Alta (1–2)", medium: "Média (3–4)", low: "Baixa (5+)" };
  if (priority !== "all")
    chips.push({
      label: `Urgência: ${pLabels[priority]}`,
      clear: () => {
        document.getElementById("f-priority").value = "all";
      },
    });

  const doneF = document.getElementById("f-done").value;
  if (doneF !== "all")
    chips.push({
      label: `Situação: ${doneF === "pending" ? "Pendentes" : "Concluídas"}`,
      clear: () => {
        document.getElementById("f-done").value = "all";
      },
    });

  const ufVal = document.getElementById("f-uf")?.value ?? "all";
  if (ufVal !== "all")
    chips.push({
      label: `Estado: ${ufVal}`,
      clear: () => {
        const el = document.getElementById("f-uf");
        if (el) el.value = "all";
      },
    });

  const setorVal = document.getElementById("f-setor")?.value ?? "all";
  if (setorVal !== "all")
    chips.push({
      label: `Setor: ${setorVal}`,
      clear: () => {
        const el = document.getElementById("f-setor");
        if (el) el.value = "all";
      },
    });

  searchTerms().forEach((term) =>
    chips.push({
      label: `Busca: ${term}`,
      clear: () => {
        const el = document.getElementById("f-search");
        const remaining = el.value
          .split(/[\s,;\n]+/)
          .filter((s) => s && s.toLowerCase() !== term);
        el.value = remaining.join(", ");
      },
    }),
  );

  if (chips.length === 0) {
    bar.style.display = "none";
    return;
  }
  bar.style.display = "flex";

  chips.forEach(({ label, clear }) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.innerHTML = `<span>${escapeHtml(label)}</span><span class="chip-close">×</span>`;
    chip.onclick = () => {
      clear();
      renderTable();
    };
    bar.appendChild(chip);
  });

  const clearAll = document.createElement("button");
  clearAll.className = "chip chip-clear-all";
  clearAll.textContent = "Limpar tudo";
  clearAll.onclick = clearAllFilters;
  bar.appendChild(clearAll);
}

/* ── Render: linha e card ── */
function renderRow(r, errors, realStatus, done, pCls, pLabel) {
  const sel = selected.has(r.id);
  const coordsBtn = hasCoords(r)
    ? `<a class="coord-pin" target="_blank" href="${mapsUrl(r.latitude, r.longitude)}" onclick="event.stopPropagation()" title="Abrir no Google Maps">📍</a>`
    : "";

  const tr = document.createElement("tr");
  if (done) tr.classList.add("completed");
  if (sel) tr.classList.add("selected");
  tr.onclick = () => showDetail(r);
  tr.innerHTML = `
    <td onclick="event.stopPropagation()" class="td-check">
      <input type="checkbox" class="row-check" ${sel ? "checked" : ""}
             onchange="toggleSelect('${escapeHtml(r.id)}')">
    </td>
    <td data-label="ID"><span class="cell-id">${escapeHtml(r.id)}</span></td>
    <td data-label="Urgência"><span class="priority-badge ${pCls}">${pLabel}</span></td>
    <td data-label="Tipo" style="color:var(--text-dim)">${escapeHtml(r.tipo_nota)}</td>
    <td data-label="Referência" class="td-ref">
      <span class="ref-text">${escapeHtml(r.referencia)}</span>
      ${coordsBtn}
    </td>
    <td data-label="Falhas">
      ${
        errors.length
          ? errors
              .map(
                (e) => `<span class="error-pill">${escapeHtml(e.rule_name)}</span>`,
              )
              .join("")
          : `<span class="tag tag-ok">Conforme</span>`
      }
    </td>
    <td data-label="Status">
      <span class="tag ${realStatus === "ok" ? "tag-ok" : "tag-err"}">${realStatus === "ok" ? "OK" : "ERRO"}</span>
    </td>
    <td>
      <div class="actions" onclick="event.stopPropagation()">
        <a class="btn btn-coffee" target="_blank" href="${coffeeUrl(r.id)}">☕ COFFEE</a>
        <button class="btn btn-complete ${done ? "done" : ""}"
                onclick="toggleComplete('${escapeHtml(r.id)}')">
          ${done ? "✓ Concluído" : "Marcar"}
        </button>
      </div>
    </td>`;
  return tr;
}

function renderCard(r, errors, realStatus, done, pCls, pLabel) {
  const sel = selected.has(r.id);
  const coordsBtn = hasCoords(r)
    ? `<a class="btn btn-map" target="_blank" href="${mapsUrl(r.latitude, r.longitude)}" onclick="event.stopPropagation()">📍 Mapa</a>`
    : "";

  const card = document.createElement("div");
  card.className =
    "note-card" + (done ? " completed" : "") + (sel ? " selected" : "");
  card.onclick = () => showDetail(r);
  card.innerHTML = `
    <div class="note-card-header">
      <input type="checkbox" class="card-check" ${sel ? "checked" : ""}
             onclick="event.stopPropagation()"
             onchange="toggleSelect('${escapeHtml(r.id)}')">
      <span class="note-card-id">${escapeHtml(r.id)}</span>
      <div class="note-card-badges">
        <span class="priority-badge ${pCls}" style="width:24px;height:24px;font-size:.72rem;">${pLabel}</span>
        <span class="tag ${realStatus === "ok" ? "tag-ok" : "tag-err"}">${realStatus === "ok" ? "OK" : "ERRO"}</span>
      </div>
    </div>
    <div class="note-card-meta">
      <div class="note-card-meta-item">
        <span class="note-card-meta-label">Tipo</span>
        <span class="note-card-meta-val">${escapeHtml(r.tipo_nota)}</span>
      </div>
      <div class="note-card-meta-item">
        <span class="note-card-meta-label">Referência</span>
        <span class="note-card-meta-val" style="font-family:var(--font-mono);font-size:.75rem">${escapeHtml(r.referencia)}</span>
      </div>
    </div>
    ${errors.length ? `<div class="note-card-errors">${errors.map((e) => `<span class="error-pill">${escapeHtml(e.rule_name)}</span>`).join("")}</div>` : ""}
    <div class="note-card-actions" onclick="event.stopPropagation()">
      <a class="btn btn-coffee" target="_blank" href="${coffeeUrl(r.id)}">☕ COFFEE</a>
      ${coordsBtn}
      <button class="btn btn-complete ${done ? "done" : ""}"
              onclick="toggleComplete('${escapeHtml(r.id)}')">
        ${done ? "✓ Concluído" : "Marcar"}
      </button>
    </div>`;
  return card;
}

function renderEmpty() {
  const active = hasActiveFilters();
  const msg = active
    ? "Nenhuma ocorrência com os filtros aplicados."
    : "Nenhuma nota carregada.";
  const btn = active
    ? `<button class="btn btn-clear-empty" onclick="clearAllFilters()">Limpar filtros</button>`
    : "";

  const tr = document.createElement("tr");
  tr.className = "empty-row";
  tr.innerHTML = `<td colspan="8"><div class="empty-msg">${msg}${btn}</div></td>`;
  tbody.appendChild(tr);

  const empty = document.createElement("div");
  empty.className = "empty-card";
  empty.innerHTML = `<div class="empty-msg">${msg}${btn}</div>`;
  cardList.appendChild(empty);
}

function renderTable() {
  tbody.innerHTML = "";
  cardList.innerHTML = "";

  const filtered = getFiltered();

  if (filtered.length === 0) {
    renderEmpty();
  } else {
    filtered.forEach((r) => {
      const errors = filterErrors(r.errors);
      const realStatus = errors.length ? "erro" : "ok";
      const done = completed.has(r.id);
      const pCls = priorityClass(r.prioridade);
      const pLabel = r.prioridade >= 99 ? "—" : r.prioridade;

      tbody.appendChild(renderRow(r, errors, realStatus, done, pCls, pLabel));
      cardList.appendChild(renderCard(r, errors, realStatus, done, pCls, pLabel));
    });
  }

  document.getElementById("s-show").textContent = filtered.length;
  renderActiveChips();
  renderSelectionToolbar();
  updateSelectAllCheckbox(filtered);
  updateClearRulesBtn();
}

/* ── Seleção em lote ── */
function toggleSelect(id) {
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  renderTable();
}

function updateSelectAllCheckbox(filtered) {
  const cb = document.getElementById("select-all");
  if (!cb) return;
  if (filtered.length === 0) {
    cb.checked = false;
    cb.indeterminate = false;
    return;
  }
  const visIds = filtered.map((r) => r.id);
  const allSel = visIds.every((id) => selected.has(id));
  const someSel = visIds.some((id) => selected.has(id));
  cb.checked = allSel;
  cb.indeterminate = !allSel && someSel;
}

function toggleSelectAll() {
  const filtered = getFiltered();
  const visIds = filtered.map((r) => r.id);
  const allSel = visIds.length > 0 && visIds.every((id) => selected.has(id));
  if (allSel) visIds.forEach((id) => selected.delete(id));
  else visIds.forEach((id) => selected.add(id));
  renderTable();
}

function renderSelectionToolbar() {
  const tb = document.getElementById("selection-toolbar");
  if (!tb) return;
  if (selected.size === 0) {
    tb.classList.remove("show");
    return;
  }
  tb.classList.add("show");
  document.getElementById("sel-count").textContent = selected.size;
}

async function bulkComplete() {
  const ids = [...selected];
  for (const id of ids) {
    await fetch(`${API}/complete/${id}`, { method: "POST" });
    completed.add(id);
  }
  localStorage.setItem("completedNotes", JSON.stringify([...completed]));
  selected.clear();
  renderTable();
  updateStats();
}

function bulkCoffee() {
  const ids = [...selected];
  if (ids.length > 3 && !coffeeWarned) {
    coffeeWarned = true;
    alert(
      `Vamos abrir ${ids.length} abas no COFFEE. Se o navegador bloquear, permita popups para este site e tente de novo.`,
    );
  }
  ids.forEach((id, i) => {
    setTimeout(() => window.open(coffeeUrl(id), "_blank", "noopener"), i * 250);
  });
}

function clearSelection() {
  selected.clear();
  renderTable();
}

/* ── Concluir individual ── */
async function toggleComplete(id) {
  await fetch(`${API}/complete/${id}`, { method: "POST" });
  if (completed.has(id)) completed.delete(id);
  else completed.add(id);
  localStorage.setItem("completedNotes", JSON.stringify([...completed]));
  renderTable();
  updateStats();
}

/* ── Stats ── */
function updateStats() {
  document.getElementById("s-total").textContent = data.length;
  document.getElementById("s-ok").textContent = data.filter(
    (r) => filterErrors(r.errors).length === 0,
  ).length;
  document.getElementById("s-err").textContent = data.filter(
    (r) => filterErrors(r.errors).length > 0,
  ).length;
  const done = document.getElementById("s-done");
  if (done)
    done.textContent = data.filter((r) => completed.has(r.id)).length;
}

/* ── Modal por seções ── */
function renderGroupSection(title, keys, raw, r) {
  const items = keys
    .map((k) => {
      const val = raw[k];
      const has = val != null && val !== "" && val !== "-";
      return has ? { k, val } : null;
    })
    .filter(Boolean);

  if (items.length === 0) return "";

  const mapsBtn =
    title === "Localização" && hasCoords(r)
      ? `<a class="btn btn-map btn-map-lg" target="_blank" href="${mapsUrl(r.latitude, r.longitude)}">📍 Abrir no Google Maps</a>`
      : "";

  return `
    <section class="modal-section">
      <div class="modal-section-title">${title}</div>
      <div class="detail-grid">
        ${items
          .map(
            ({ k, val }) => `
          <div class="detail-item">
            <small>${escapeHtml(fieldLabel(k))}</small>
            <div>${escapeHtml(val)}</div>
          </div>`,
          )
          .join("")}
      </div>
      ${mapsBtn}
    </section>`;
}

function showDetail(r) {
  const errors = filterErrors(r.errors);

  document.getElementById("m-title").textContent = `Nota ${r.id}`;
  document.getElementById("m-subtitle").textContent =
    `Tipo: ${r.tipo_nota} · Ref: ${r.referencia} · Prioridade: ${r.prioridade >= 99 ? "—" : r.prioridade}`;

  let html = "";

  if (errors.length) {
    html += `
      <section class="modal-section">
        <div class="modal-section-title">⚠ Falhas Encontradas (${errors.length})</div>
        <div class="error-cards">
          ${errors
            .map(
              (e) => `
            <div class="error-card">
              <div class="error-card-rule">${escapeHtml(e.rule)}</div>
              <div class="error-card-name">${escapeHtml(e.rule_name)}</div>
              <div class="error-card-val">Valor: ${escapeHtml(e.value)}</div>
            </div>`,
            )
            .join("")}
        </div>
      </section>`;
  } else {
    html += `
      <section class="modal-section">
        <div class="modal-section-title">Status</div>
        <span class="tag tag-ok">✓ Conforme — nenhuma falha encontrada</span>
      </section>`;
  }

  Object.entries(FIELD_GROUPS).forEach(([title, keys]) => {
    html += renderGroupSection(title, keys, r.raw, r);
  });

  const otherEntries = Object.entries(r.raw).filter(([k, v]) => {
    if (GROUPED_KEYS.has(k)) return false;
    if (isIgnoredRule(k)) return false;
    if (/^chk_/i.test(k)) return false;
    if (v == null || v === "" || v === "-") return false;
    return true;
  });

  if (otherEntries.length > 0) {
    html += `
      <details class="modal-collapsible">
        <summary>Outros campos (${otherEntries.length})</summary>
        <div class="detail-grid">
          ${otherEntries
            .map(
              ([k, v]) => `
            <div class="detail-item">
              <small>${escapeHtml(k)}</small>
              <div>${escapeHtml(v)}</div>
            </div>`,
            )
            .join("")}
        </div>
      </details>`;
  }

  document.getElementById("m-content").innerHTML = html;
  document.getElementById("modal").classList.add("show");
}

function closeModal() {
  document.getElementById("modal").classList.remove("show");
}

/* ── Eventos ── */
document.getElementById("file-input").addEventListener("change", (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

const debouncedRender = debounce(renderTable, 80);
["f-search", "f-status", "f-priority", "f-done", "f-uf", "f-setor"].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener(
    id === "f-search" ? "input" : "change",
    id === "f-search" ? debouncedRender : renderTable,
  );
});

document.getElementById("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

/* Drag-and-drop */
const uploadBox = document.getElementById("upload-box");
uploadBox.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadBox.classList.add("drag-over");
});
uploadBox.addEventListener("dragleave", () =>
  uploadBox.classList.remove("drag-over"),
);
uploadBox.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadBox.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 960) closeSidebar();
});
