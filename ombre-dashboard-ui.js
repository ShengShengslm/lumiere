(() => {
  const root = document.querySelector("#ob-dashboard");
  if (!root) return;
  const list = document.querySelector("#ob-list");
  const search = document.querySelector("#ob-search");
  const dialog = document.querySelector("#ob-detail");
  const filters = [
    { key: "all", label: "全部" },
    { key: "dynamic", label: "动态", type: "dynamic" },
    { key: "permanent", label: "永久", type: "permanent" },
    { key: "archived", label: "归档", type: "archived" },
    { key: "pinned", label: "钉选", state: "pinned" }
  ];
  let filter = "all";
  let timer;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const time = (value) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "";
  const importance = (value) => "●".repeat(Math.max(0, Math.min(10, Math.round(Number(value) || 0)))) + "○".repeat(10 - Math.max(0, Math.min(10, Math.round(Number(value) || 0))));
  const tags = (item) => [...(item.domains || []), ...(item.tags || [])];

  function renderFilters() {
    document.querySelector("#ob-filters").innerHTML = filters.map((item) => `<button type="button" class="ob-filter${item.key === filter ? " active" : ""}" data-ob-filter="${item.key}">${item.label}</button>`).join("");
  }
  function renderStatus(status) {
    const live = document.querySelector("#ob-live");
    live.classList.toggle("online", Boolean(status?.available));
    live.querySelector("span").textContent = status?.available ? (status.fallback ? "Vault 已连接" : "OB 在线") : "OB 暂时离线";
    [["total", status?.total], ["dynamic", status?.dynamic], ["permanent", status?.permanent], ["archived", status?.archived]].forEach(([key, value]) => {
      document.querySelector(`[data-ob-stat="${key}"] b`).textContent = Number(value || 0);
    });
  }
  function renderItems(items, failed = false) {
    if (failed) return list.innerHTML = `<div class="glass ob-empty">Ombre 正在休息，记忆仍然安全。<br><button type="button" class="ob-retry" id="ob-retry">重新连接</button></div>`;
    if (!items.length) return list.innerHTML = `<div class="glass ob-empty">${search.value.trim() ? "没有找到相关记忆" : "这里还没有 OB 记忆"}</div>`;
    list.innerHTML = items.map((item) => `<button type="button" class="ob-card" data-ob-id="${esc(item.id)}"><div class="ob-card-top"><span class="ob-type">${esc(item.type || "memory")}</span><span class="ob-time">${esc(time(item.lastActiveAt || item.createdAt))}</span></div><h3>${esc(item.name || "未命名记忆")}</h3><p>${esc(item.contentPreview || "(empty)")}</p><div class="ob-card-bottom"><span class="ob-importance">${importance(item.importance)}</span><span class="ob-tags">${tags(item).slice(0, 3).map((tag) => `<span class="ob-tag">${esc(tag)}</span>`).join("")}</span></div>${item.pinned ? '<span class="ob-pin">◆</span>' : ""}</button>`).join("");
  }
  async function load() {
    list.innerHTML = '<div class="glass ob-empty">正在整理他的记忆…</div>';
    const selected = filters.find((item) => item.key === filter) || filters[0];
    const query = search.value.trim();
    const params = new URLSearchParams();
    if (selected.type) params.set("type", selected.type);
    if (selected.state) params.set("state", selected.state);
    try {
      const [status, data] = await Promise.all([
        window.LumiereAPI.request("/ombre-dashboard/status").catch(() => ({ available: false })),
        window.LumiereAPI.request(query ? `/ombre-dashboard/search?q=${encodeURIComponent(query)}` : `/ombre-dashboard/buckets?${params}`)
      ]);
      renderStatus(status);
      renderItems(Array.isArray(data.items) ? data.items : []);
    } catch { renderStatus({ available: false }); renderItems([], true); }
  }
  const fullDate = (value) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString("zh-CN", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
  async function openDetail(id) {
    dialog.querySelector(".ob-sheet-wrap").innerHTML = '<button class="ob-sheet-handle" data-ob-close></button><div class="ob-empty">正在打开记忆…</div>';
    dialog.showModal();
    try {
      const item = await window.LumiereAPI.request(`/ombre-dashboard/buckets/${encodeURIComponent(id)}`);
      dialog.querySelector(".ob-sheet-wrap").innerHTML = `<button class="ob-sheet-handle" data-ob-close aria-label="关闭"></button><span class="ob-sheet-kicker">OMBRE BRAIN · ${esc(item.type)}</span><h2>${esc(item.name)}</h2><div class="ob-sheet-meta">${item.pinned ? "已钉选 · " : ""}${item.resolved ? "已解决 · " : ""}被想起 ${Number(item.activationCount || 0)} 次</div><div class="ob-sheet-content">${esc(item.content || "(empty)")}</div><div class="ob-sheet-grid"><div class="ob-sheet-row"><span>重要度</span><b class="ob-importance">${importance(item.importance)}</b></div><div class="ob-sheet-row"><span>创建于</span><b>${esc(fullDate(item.createdAt))}</b></div><div class="ob-sheet-row"><span>最近激活</span><b>${esc(fullDate(item.lastActiveAt))}</b></div>${item.valence !== null ? `<div class="ob-sheet-row"><span>Valence</span><b>${esc(item.valence)}</b></div>` : ""}${item.arousal !== null ? `<div class="ob-sheet-row"><span>Arousal</span><b>${esc(item.arousal)}</b></div>` : ""}</div><div class="ob-sheet-tags">${tags(item).map((tag) => `<span class="ob-tag">${esc(tag)}</span>`).join("")}</div><button type="button" class="ob-sheet-close" data-ob-close>收起记忆</button>`;
    } catch { dialog.querySelector(".ob-sheet-wrap").innerHTML = '<button class="ob-sheet-handle" data-ob-close></button><div class="ob-empty">这条记忆暂时没有回应</div>'; }
  }
  root.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-ob-filter]");
    if (chip) { filter = chip.dataset.obFilter; renderFilters(); load(); return; }
    const card = event.target.closest("[data-ob-id]");
    if (card) openDetail(card.dataset.obId);
    if (event.target.closest("#ob-retry")) load();
  });
  dialog.addEventListener("click", (event) => { if (event.target === dialog || event.target.closest("[data-ob-close]")) dialog.close(); });
  search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(load, 300); });
  document.querySelector('[data-target="memory"]').addEventListener("click", load);
  renderFilters();
  window.addEventListener("lumiere:ready", load);
})();
