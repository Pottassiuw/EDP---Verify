const API = "http://localhost:8000/api";
const IGNORED_RULES = ["trafo", "chk_trafo"];

let data = [];
let completed = new Set(
  JSON.parse(localStorage.getItem("completedNotes") || "[]"),
);
let activeRule = "all";

const tbody = document.getElementById("tbody");
const cardList = document.getElementById("card-list");

/* ── Helpers ── */
const isIgnoredRule = (r) =>
  IGNORED_RULES.some((i) => r.toLowerCase().includes(i.toLowerCase()));
const filterErrors = (errs) => errs.filter((e) => !isIgnoredRule(e.rule));
const isMobile = () => window.innerWidth <= 600;

function priorityClass(p) {
  if (p <= 2) return "p-high";
  if (p <= 4) return "p-medium";
  if (p <= 99) return "p-low";
  return "p-none";
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
  renderTable();
  updateStats();
}

function resetToUpload() {
  document.getElementById("dashboard-screen").style.display = "none";
  document.getElementById("upload-screen").style.display = "flex";
  document.getElementById("loader").style.display = "none";
  document.getElementById("loader").querySelector("span").style.width = "0%";
  document.getElementById("file-input").value = "";
  activeRule = "all";
  closeSidebar();
}

/* ── Sidebar rules ── */
function renderRules(stats) {
  const list = document.getElementById("rule-list");
  list.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.className = "rule-btn active";
  allBtn.innerHTML = `<span>Todas as Notas</span><strong>${data.length}</strong>`;
  allBtn.onclick = () => {
    activeRule = "all";
    document
      .querySelectorAll(".rule-btn")
      .forEach((b) => b.classList.remove("active"));
    allBtn.classList.add("active");
    renderTable();
    if (isMobile()) closeSidebar();
  };
  list.appendChild(allBtn);

  Object.entries(stats)
    .filter(([rule]) => !isIgnoredRule(rule))
    .sort((a, b) => b[1] - a[1])
    .forEach(([rule, count]) => {
      const b = document.createElement("button");
      b.className = "rule-btn";
      const label = rule.replace(/^chk_/i, "").replace(/_/g, " ");
      b.innerHTML = `<span>${label}</span><strong>${count}</strong>`;
      b.onclick = () => {
        activeRule = rule;
        document
          .querySelectorAll(".rule-btn")
          .forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        renderTable();
        if (isMobile()) closeSidebar();
      };
      list.appendChild(b);
    });
}

/* ── Filtro comum ── */
function getFiltered() {
  const search = document.getElementById("f-search").value.toLowerCase().trim();
  const status = document.getElementById("f-status").value;
  const priority = document.getElementById("f-priority").value;
  const doneF = document.getElementById("f-done").value;

  return data.filter((r) => {
    const errors = filterErrors(r.errors);
    const realStatus = errors.length ? "erro" : "ok";

    if (activeRule !== "all" && !errors.some((e) => e.rule === activeRule))
      return false;
    if (priority === "high" && r.prioridade > 2) return false;
    if (priority === "medium" && (r.prioridade < 3 || r.prioridade > 4))
      return false;
    if (priority === "low" && r.prioridade < 5) return false;
    if (status !== "all" && realStatus !== status) return false;

    const done = completed.has(r.id);
    if (doneF === "pending" && done) return false;
    if (doneF === "done" && !done) return false;

    if (search) {
      if (
        !`${r.id} ${r.referencia} ${r.tipo_nota}`.toLowerCase().includes(search)
      )
        return false;
    }
    return true;
  });
}

/* ── Render (tabela + cards) ── */
function renderTable() {
  tbody.innerHTML = "";
  cardList.innerHTML = "";

  const filtered = getFiltered();

  /* Tabela (desktop/tablet) */
  if (filtered.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    tr.innerHTML = `<td colspan="7">Nenhuma ocorrência com os filtros aplicados.</td>`;
    tbody.appendChild(tr);
  }

  filtered.forEach((r) => {
    const errors = filterErrors(r.errors);
    const realStatus = errors.length ? "erro" : "ok";
    const done = completed.has(r.id);
    const pCls = priorityClass(r.prioridade);
    const pLabel = r.prioridade >= 99 ? "—" : r.prioridade;

    /* ── Linha da tabela ── */
    const tr = document.createElement("tr");
    tr.onclick = () => showDetail(r);
    if (done) tr.classList.add("completed");

    tr.innerHTML = `
            <td data-label="ID"><span class="cell-id">${r.id}</span></td>
            <td data-label="Urgência"><span class="priority-badge ${pCls}">${pLabel}</span></td>
            <td data-label="Tipo" style="color:var(--text-dim)">${r.tipo_nota}</td>
            <td data-label="Referência" style="font-family:var(--font-mono);font-size:.78rem;color:var(--text-dim)">${r.referencia}</td>
            <td data-label="Falhas">
              ${
                errors.length
                  ? errors
                      .map(
                        (e) => `<span class="error-pill">${e.rule_name}</span>`,
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
                <a class="btn btn-coffee" target="_blank"
                   href="https://coffee.edp.gpti.com.br/7ff2b230b16cbe2ecdde87a58AppDeOlhoNaRede2/informativo/${r.id}/change/">
                  ☕ COFFEE
                </a>
                <button class="btn btn-complete ${done ? "done" : ""}"
                        onclick="toggleComplete('${r.id}')">
                  ${done ? "✓ Concluído" : "Marcar"}
                </button>
              </div>
            </td>`;
    tbody.appendChild(tr);

    /* ── Card mobile ── */
    const card = document.createElement("div");
    card.className = "note-card" + (done ? " completed" : "");
    card.onclick = () => showDetail(r);

    card.innerHTML = `
            <div class="note-card-header">
              <span class="note-card-id">${r.id}</span>
              <div class="note-card-badges">
                <span class="priority-badge ${pCls}" style="width:24px;height:24px;font-size:.72rem;">${pLabel}</span>
                <span class="tag ${realStatus === "ok" ? "tag-ok" : "tag-err"}">${realStatus === "ok" ? "OK" : "ERRO"}</span>
              </div>
            </div>

            <div class="note-card-meta">
              <div class="note-card-meta-item">
                <span class="note-card-meta-label">Tipo</span>
                <span class="note-card-meta-val">${r.tipo_nota}</span>
              </div>
              <div class="note-card-meta-item">
                <span class="note-card-meta-label">Referência</span>
                <span class="note-card-meta-val" style="font-family:var(--font-mono);font-size:.75rem">${r.referencia}</span>
              </div>
            </div>

            ${errors.length ? `<div class="note-card-errors">${errors.map((e) => `<span class="error-pill">${e.rule_name}</span>`).join("")}</div>` : ""}

            <div class="note-card-actions" onclick="event.stopPropagation()">
              <a class="btn btn-coffee" target="_blank"
                 href="https://coffee.edp.gpti.com.br/7ff2b230b16cbe2ecdde87a58AppDeOlhoNaRede2/informativo/${r.id}/change/">
                ☕ COFFEE
              </a>
              <button class="btn btn-complete ${done ? "done" : ""}"
                      onclick="toggleComplete('${r.id}')">
                ${done ? "✓ Concluído" : "Marcar"}
              </button>
            </div>`;
    cardList.appendChild(card);
  });

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText =
      "padding:3rem;text-align:center;color:var(--text-mute);font-size:.85rem;background:var(--surface);width:100%";
    empty.textContent = "Nenhuma ocorrência com os filtros aplicados.";
    cardList.appendChild(empty);
  }

  document.getElementById("s-show").textContent = filtered.length;
}

/* ── Toggle concluída ── */
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
}

/* ── Modal ── */
function showDetail(r) {
  const errors = filterErrors(r.errors);
  const errorRules = new Set(errors.map((e) => e.rule));

  document.getElementById("m-title").textContent = `Nota ${r.id}`;
  document.getElementById("m-subtitle").textContent =
    `Tipo: ${r.tipo_nota} · Ref: ${r.referencia} · Prioridade: ${r.prioridade >= 99 ? "—" : r.prioridade}`;

  let html = "";

  if (errors.length) {
    html += `<div>
            <div class="modal-section-title">⚠ Falhas Encontradas (${errors.length})</div>
            <div class="error-cards">
              ${errors
                .map(
                  (e) => `
                <div class="error-card">
                  <div class="error-card-rule">${e.rule}</div>
                  <div class="error-card-name">${e.rule_name}</div>
                  <div class="error-card-val">Valor: ${e.value}</div>
                </div>`,
                )
                .join("")}
            </div>
          </div>`;
  } else {
    html += `<div>
            <div class="modal-section-title">Status</div>
            <span class="tag tag-ok">✓ Conforme — nenhuma falha encontrada</span>
          </div>`;
  }

  html += `<div>
          <div class="modal-section-title">Todos os Campos da Planilha</div>
          <div class="detail-grid">
            ${Object.entries(r.raw)
              .filter(([k]) => !isIgnoredRule(k))
              .map(
                ([k, v]) => `
                <div class="detail-item ${errorRules.has(k) ? "is-error" : ""}">
                  <small>${k}</small>
                  <div>${v}</div>
                </div>`,
              )
              .join("")}
          </div>
        </div>`;

  document.getElementById("m-content").innerHTML = html;
  document.getElementById("modal").classList.add("show");
}

function closeModal() {
  document.getElementById("modal").classList.remove("show");
}

/* ── Events ── */
document.getElementById("file-input").addEventListener("change", (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

["f-search", "f-status", "f-priority", "f-done"].forEach((id) => {
  const el = document.getElementById(id);
  el.addEventListener(id === "f-search" ? "input" : "change", renderTable);
});

document.getElementById("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
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

/* Fecha sidebar ao redimensionar para desktop */
window.addEventListener("resize", () => {
  if (window.innerWidth > 960) closeSidebar();
});
