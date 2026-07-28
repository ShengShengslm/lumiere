(() => {
  const root = document.querySelector("#ob-dashboard");
  if (!root) return;
  const list = document.querySelector("#ob-list");
  const search = document.querySelector("#ob-search");
  const dialog = document.querySelector("#ob-detail");
  const browser = document.querySelector("#ob-browser");
  const entry = document.querySelector("#ob-entry");
  const filters = [
    { key: "all", label: "全部" },
    { key: "dynamic", label: "动态", type: "dynamic" },
    { key: "permanent", label: "永久", type: "permanent" },
    { key: "archived", label: "归档", type: "archived" },
    { key: "pinned", label: "钉选", state: "pinned" }
  ];
  let filter = "all";
  let timer;
  const bindSwipeClose = (target, close, ignoredSelector = "input,textarea,select") => {
    let swipe = null;
    target.addEventListener("touchstart", (event) => {
      if (event.touches.length !== 1 || event.target.closest(ignoredSelector)) {
        swipe = null;
        return;
      }
      const touch = event.touches[0];
      swipe = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    }, { passive: true });
    target.addEventListener("touchmove", (event) => {
      if (!swipe || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - swipe.x;
      const dy = touch.clientY - swipe.y;
      if (dx > 10 && dx > Math.abs(dy) * 1.2) event.preventDefault();
    }, { passive: false });
    target.addEventListener("touchend", (event) => {
      if (!swipe) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - swipe.x;
      const dy = touch.clientY - swipe.y;
      const elapsed = Date.now() - swipe.time;
      swipe = null;
      if (dx > 85 && Math.abs(dy) < 55 && dx > Math.abs(dy) * 1.5 && elapsed < 900) close();
    }, { passive: true });
  };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const time = (value) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "";
  const importance = (value) => "●".repeat(Math.max(0, Math.min(10, Math.round(Number(value) || 0)))) + "○".repeat(10 - Math.max(0, Math.min(10, Math.round(Number(value) || 0))));
  const tags = (item) => [...(item.domains || []), ...(item.tags || [])];

  function renderFilters() {
    document.querySelector("#ob-filters").innerHTML = filters.map((item) => `<button type="button" class="ob-filter${item.key === filter ? " active" : ""}" data-ob-filter="${item.key}">${item.label}</button>`).join("");
  }
  function renderStatus(status) {
    const live = document.querySelector("#ob-live");
    const entryLive = document.querySelector("#ob-entry-live");
    const total = Number(status?.total || 0);
    live.classList.toggle("online", Boolean(status?.available));
    live.querySelector("span").textContent = status?.available ? (status.fallback ? "Vault 已连接" : "OB 在线") : "OB 暂时离线";
    entry.classList.toggle("online", Boolean(status?.available));
    entryLive.textContent = status?.available ? (status.fallback ? "Vault 已连接" : "OB 在线") : "暂时离线";
    document.querySelector("#ob-entry-total").textContent = total ? `${total} 条记忆` : "还没有记忆";
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
      dialog.querySelector(".ob-sheet-wrap").innerHTML = `<button class="ob-sheet-handle" data-ob-close aria-label="关闭"></button><span class="ob-sheet-kicker">OMBRE BRAIN · ${esc(item.type)}</span><h2>${esc(item.name)}</h2><div class="ob-sheet-meta">${item.pinned ? "已固定 · " : ""}${item.resolved ? "已解决 · " : ""}被想起 ${Number(item.activationCount || 0)} 次</div><form class="ob-edit-form" data-ob-edit="${esc(item.id)}"><label>记忆标题<input name="name" maxlength="160" value="${esc(item.name)}" required></label><label>记忆内容<textarea name="content" maxlength="50000" required>${esc(item.content || "")}</textarea></label><div class="ob-edit-footer"><span class="ob-edit-status" aria-live="polite"></span><button type="submit">保存修改</button></div></form><div class="ob-memory-actions"><button type="button" data-ob-action="pin" data-ob-id="${esc(item.id)}">⌖ 固定</button><button type="button" data-ob-action="important" data-ob-id="${esc(item.id)}">☆ 重要</button><button type="button" data-ob-action="noise" data-ob-id="${esc(item.id)}">▧ 噪声</button><button type="button" class="danger" data-ob-action="delete" data-ob-id="${esc(item.id)}">× 删除到档案</button></div><div class="ob-sheet-grid"><div class="ob-sheet-row"><span>重要度</span><b class="ob-importance">${importance(item.importance)}</b></div><div class="ob-sheet-row"><span>创建于</span><b>${esc(fullDate(item.createdAt))}</b></div><div class="ob-sheet-row"><span>最近激活</span><b>${esc(fullDate(item.lastActiveAt))}</b></div>${item.valence !== null ? `<div class="ob-sheet-row"><span>Valence</span><b>${esc(item.valence)}</b></div>` : ""}${item.arousal !== null ? `<div class="ob-sheet-row"><span>Arousal</span><b>${esc(item.arousal)}</b></div>` : ""}</div><div class="ob-sheet-tags">${tags(item).map((tag) => `<span class="ob-tag">${esc(tag)}</span>`).join("")}</div><button type="button" class="ob-sheet-close" data-ob-close>收起记忆</button>`;
    } catch { dialog.querySelector(".ob-sheet-wrap").innerHTML = '<button class="ob-sheet-handle" data-ob-close></button><div class="ob-empty">这条记忆暂时没有回应</div>'; }
  }
  root.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-ob-filter]");
    if (chip) { filter = chip.dataset.obFilter; renderFilters(); load(); return; }
    const card = event.target.closest("[data-ob-id]");
    if (card) openDetail(card.dataset.obId);
    if (event.target.closest("#ob-retry")) load();
  });
  entry.addEventListener("click", () => {
    if (!browser.open) browser.showModal();
    load();
  });
  browser.addEventListener("click", (event) => {
    if (event.target === browser || event.target.closest("[data-ob-browser-close]")) browser.close();
  });
  bindSwipeClose(browser, () => browser.close(), "input,textarea,select,.ob-filters");
  dialog.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-ob-edit]");
    if (!form) return;
    event.preventDefault();
    const status = form.querySelector(".ob-edit-status");
    const submit = form.querySelector('[type="submit"]');
    status.textContent = "正在保存…";
    submit.disabled = true;
    try {
      const data = new FormData(form);
      await window.LumiereAPI.request(`/ombre-dashboard/buckets/${encodeURIComponent(form.dataset.obEdit)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: data.get("name"), content: data.get("content") })
      });
      status.textContent = "已保存";
      await load();
    } catch (error) {
      status.textContent = error.message || "保存失败";
    } finally { submit.disabled = false; }
  });
  dialog.addEventListener("click", async (event) => {
    if (event.target === dialog || event.target.closest("[data-ob-close]")) { dialog.close(); return; }
    const button = event.target.closest("[data-ob-action]");
    if (!button) return;
    const action = button.dataset.obAction;
    const warnings = {
      noise: "标为噪声后，这条记忆会被解决并淡出日常记忆。继续吗？",
      delete: "这会把记忆移入删除档案并从日常界面隐藏，但不会直接销毁文件。继续吗？"
    };
    if (warnings[action] && !window.confirm(warnings[action])) return;
    button.disabled = true;
    try {
      await window.LumiereAPI.request(`/ombre-dashboard/buckets/${encodeURIComponent(button.dataset.obId)}/actions`, {
        method: "POST",
        body: JSON.stringify({ action })
      });
      dialog.close();
      await load();
    } catch (error) {
      window.alert(error.message || "操作失败");
      button.disabled = false;
    }
  });
  bindSwipeClose(dialog, () => dialog.close(), "input,textarea,select,.ob-memory-actions,.ob-edit-footer");
  search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(load, 300); });
  document.querySelector('[data-target="memory"]').addEventListener("click", load);
  renderFilters();
  window.addEventListener("lumiere:ready", load);
})();
