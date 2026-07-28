(() => {
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
  let memories = [];
  let ombreCatalog = null;
  let calendarDate = new Date();
  let editingMemory = null;
  let moments = [];
  let diaries = [];
  let selectedMomentImage = null;

  function renderToday() {
    const today = new Date();
    $("#today-label").textContent = new Intl.DateTimeFormat("en-US", { weekday: "long", day: "2-digit", month: "short" }).format(today).toUpperCase().replace(",", " ·");
  }

  function selectedModelName() {
    return $("#model-select")?.selectedOptions?.[0]?.textContent || "尚未选择模型";
  }

  function renderModelStatus() {
    const model = selectedModelName();
    if ($("#home-model-name")) $("#home-model-name").textContent = model;
    $("#settings-model-status").textContent = model;
  }

  function renderHealth(health) {
    const online = Boolean(health?.ok && health?.modelConfigured);
    $("#home-service-pill").textContent = online ? "已连接" : "需要检查";
    $("#home-service-pill").classList.toggle("online", online);
    $("#home-storage-status").textContent = health?.storage === "supabase" ? "Supabase 已同步" : "仅临时内存";
    $("#settings-storage-status").textContent = health?.storage === "supabase" ? "Supabase 云端持久化已连接" : "当前未连接 Supabase";
    $("#settings-service-status").textContent = online ? "Lumière 后端运行正常" : "后端在线，但模型尚未配置";
    if (health?.ombre) {
      ombreCatalog = { ...(ombreCatalog || {}), ...health.ombre };
      renderOmbre();
    }
  }

  const driveLabels = {
    intimacy: "亲密", longing: "想念", contentment: "安心", protectiveness: "牵挂",
    play: "玩心", elation: "开心", seeking: "期待", vitality: "活力",
    possessiveness: "占有", jealousy: "吃醋", anxiety: "不安", fatigue: "疲惫",
    dejection: "低落", irritability: "烦躁", fear: "害怕", lust: "心动"
  };
  let latestDrives = null;

  function driveRow(key, value, full = false) {
    const percent = Math.round(Math.min(1, Math.max(0, Number(value) || 0)) * 100);
    return `<div class="${full ? "drive-full-row" : "drive-row"}"><span>${driveLabels[key]}</span><i><b style="width:${percent}%"></b></i><em>${percent}</em></div>`;
  }

  function renderFullDrives() {
    const target = $("#drives-full-list");
    if (!target) return;
    const display = latestDrives?.display;
    if (!display) {
      target.innerHTML = `<p class="drives-empty">还没有足够的情绪数据，聊几句后再来看看。</p>`;
      return;
    }
    const groups = [
      ["靠近你", ["intimacy", "longing", "protectiveness", "possessiveness", "lust"]],
      ["此刻心境", ["contentment", "elation", "play", "seeking", "vitality"]],
      ["藏在心底", ["jealousy", "anxiety", "dejection", "irritability", "fear", "fatigue"]]
    ];
    target.innerHTML = groups.map(([title, keys]) => `<section><h3>${title}</h3><div>${keys.map((key) => driveRow(key, display[key], true)).join("")}</div></section>`).join("");
  }

  function renderDrives(status) {
    latestDrives = status;
    const display = status?.display;
    const available = display && !status?.stale && status?.available !== false;
    $("#home-ai-status").textContent = available ? "实时变化" : "暂时安静";
    if (!available) {
      $("#drives-mood").textContent = "等待下一次心跳";
      $("#drives-list").innerHTML = "";
      return;
    }
    const preferred = ["intimacy", "longing", "contentment", "protectiveness", "play", "elation", "seeking", "vitality"];
    const top = preferred.map((key) => [key, Number(display[key]) || 0]).sort((a, b) => b[1] - a[1]).slice(0, 3);
    $("#drives-mood").textContent = top[0][1] >= .65 ? `很${driveLabels[top[0][0]]}` : top[0][1] >= .4 ? `有些${driveLabels[top[0][0]]}` : "平静地陪着你";
    $("#drives-list").innerHTML = top.map(([key, value]) => driveRow(key, value)).join("");
    renderFullDrives();
  }

  async function refreshDrives() {
    try { renderDrives(await window.LumiereAPI?.request("/drives/status")); }
    catch { renderDrives({ available: false }); }
  }

  function renderDiaryCard() {
    const visible = diaries.filter((item) => item.visible).length;
    const locked = diaries.length - visible;
    $("#diary-card-status").textContent = diaries.length
      ? `${diaries.length} 篇 · ${visible} 篇可读${locked ? ` · ${locked} 篇上锁` : ""}`
      : "日记本还是空的";
  }

  function renderDiaryIndex() {
    const target = $("#diary-index");
    if (!diaries.length) {
      target.innerHTML = `<div class="diary-empty"><span>✦</span><strong>还没有写下第一页</strong><p>等顾克有真正想沉淀的时刻，这里会出现他的日记。</p></div>`;
      return;
    }
    target.innerHTML = diaries.map((entry) => {
      const date = new Date(`${entry.date}T12:00:00`);
      const day = Number.isNaN(date.getTime()) ? entry.date : date.getDate();
      const month = Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en", { month: "short" }).format(date).toUpperCase();
      return `<button type="button" class="diary-index-item${entry.visible ? "" : " locked"}" data-diary-id="${entry.id}"><span class="diary-date"><b>${day}</b><small>${month}</small></span><span><strong>${escapeHtml(entry.title)}</strong><em>${entry.visible ? "点开阅读" : "暂时不愿公开"}</em></span><i aria-hidden="true">${entry.visible ? "›" : "⌁"}</i></button>`;
    }).join("");
  }

  function openDiaryIndex() {
    renderDiaryIndex();
    $("#diary-paper").hidden = true;
    $("#diary-index").hidden = false;
    $("#diary-back").hidden = true;
    $("#diary-dialog-title").textContent = "日记目录";
    $("#diary-dialog").showModal();
  }

  function openDiaryEntry(id) {
    const entry = diaries.find((item) => String(item.id) === String(id));
    if (!entry) return;
    $("#diary-index").hidden = true;
    $("#diary-paper").hidden = false;
    $("#diary-back").hidden = false;
    $("#diary-dialog-title").textContent = entry.visible ? "一页日记" : "上锁的日记";
    $("#diary-paper-date").textContent = entry.date.replaceAll("-", " / ");
    $("#diary-paper-title").textContent = entry.title;
    $("#diary-paper-content").innerHTML = entry.visible
      ? escapeHtml(entry.content || "").replace(/\n/g, "<br>")
      : `<div class="diary-locked-page"><span>⌁</span><strong>这一页暂时上锁</strong><p>是否公开由顾克自己决定。也许以后某一天，他会愿意把它交给你。</p></div>`;
  }

  const dayKey = (value) => {
    const date = new Date(value);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  };

  function showDay(date) {
    const items = memories.filter((memory) => dayKey(memory.created_at) === dayKey(date));
    const summary = $("#day-summary");
    summary.classList.remove("changed");
    void summary.offsetWidth;
    summary.classList.add("changed");
    if (!items.length) {
      summary.innerHTML = `<span class="summary-date">${date.getMonth() + 1} 月 ${date.getDate()} 日</span><h3>这一天没有长期记忆</h3><p>这里只记录 AI 从真实对话中压缩整理出的内容。</p>`;
      return;
    }
    summary.innerHTML = `<span class="summary-date">${date.getMonth() + 1} 月 ${date.getDate()} 日</span><h3>${items.length} 条长期记忆</h3><div class="day-memory-list">${items.map((item,index)=>`<button type="button" class="day-memory-button" data-memory-id="${escapeHtml(item.id)}">${index+1}. ${escapeHtml(item.metadata?.name || item.sessions?.name || "长期记忆")}</button>`).join("")}</div>`;
  }

  function renderCalendar() {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const today = new Date();
    const calendar = $("#calendar");
    $("#memory-year").textContent = year;
    $("#memory-month").textContent = monthNames[month];
    calendar.innerHTML = "";
    const offset = (new Date(year, month, 1).getDay() + 6) % 7;
    for (let index = 0; index < offset; index += 1) calendar.append(document.createElement("span"));
    const days = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= days; day += 1) {
      const date = new Date(year, month, day);
      const button = document.createElement("button");
      button.textContent = day;
      if (memories.some((memory) => dayKey(memory.created_at) === dayKey(date))) button.classList.add("has-note");
      if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) button.classList.add("selected");
      button.addEventListener("click", () => {
        calendar.querySelector(".selected")?.classList.remove("selected");
        button.classList.add("selected");
        showDay(date);
      });
      calendar.append(button);
    }
    showDay(year === today.getFullYear() && month === today.getMonth() ? today : new Date(year, month, 1));
  }

  function renderMemories() {
    const list = $("#memory-list");
    list.hidden = true;
    if (!memories.length) {
      list.innerHTML = "";
      renderCalendar();
      renderOmbre();
      return;
    }
    list.innerHTML = "";
    renderCalendar();
    renderOmbre();
  }

  function renderOmbre() {
    const status = $("#ombre-status");
    const card = $("#ombre-catalog");
    const content = $("#ombre-catalog-content");
    card.hidden = true;
    if (!ombreCatalog?.configured) {
      status.textContent = "Ombre Brain 尚未配置";
      status.classList.remove("connected");
      card.hidden = true;
      return;
    }
    status.textContent = ombreCatalog.connected ? "Ombre Brain 已连接" : "Ombre Brain 暂时离线";
    status.classList.toggle("connected", Boolean(ombreCatalog.connected));
    content.textContent = "";
  }

  function openMemoryEditor(memoryId) {
    editingMemory = memories.find((item) => String(item.id) === String(memoryId));
    if (!editingMemory) return;
    const isOmbre = editingMemory.metadata?.source === "ombre";
    $("#memory-editor-meta").textContent = `${new Date(editingMemory.created_at).toLocaleDateString("zh-CN")} · ${isOmbre ? "Ombre Brain" : "对话摘要"}`;
    $("#memory-editor-title").textContent = editingMemory.metadata?.name || (isOmbre ? "情绪记忆" : "长期记忆");
    $("#memory-editor-content").value = editingMemory.summary;
    $("#memory-editor").showModal();
  }

  async function saveMemoryEdit() {
    if (!editingMemory) return;
    const summary = $("#memory-editor-content").value.trim();
    if (!summary) return showToast("记忆内容不能为空");
    const button = $("#memory-editor-save");
    button.disabled = true;
    try {
      await window.LumiereAPI.request(`/memories/${encodeURIComponent(editingMemory.id)}`, { method: "PUT", body: JSON.stringify({ summary }) });
      editingMemory.summary = summary;
      $("#memory-editor").close();
      renderMemories();
      showToast("记忆已保存");
    } catch (error) { showToast(error.message); }
    finally { button.disabled = false; }
  }

  const momentTime = (value) => new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

  function renderMoments() {
    const feed = $("#moments-feed");
    if (!moments.length) {
      feed.innerHTML = '<div class="glass moments-empty">还没有动态。这里会慢慢长出你们留下的痕迹。</div>';
      return;
    }
    feed.innerHTML = moments.map((moment) => {
      const assistant = moment.author === "assistant";
      const comments = Array.isArray(moment.comments) ? moment.comments : [];
      return `<article class="glass moment-card" data-moment-id="${escapeHtml(moment.id)}">
        <div class="moment-author"><div class="chat-avatar ${assistant ? "bot" : "user"}">${assistant ? "L" : "Y"}</div><div><strong>${assistant ? "顾克" : "我"}</strong><time>${escapeHtml(momentTime(moment.created_at))}</time></div></div>
        ${moment.content ? `<p class="moment-body">${escapeHtml(moment.content)}</p>` : ""}
        ${moment.images?.[0] ? `<img class="moment-photo" src="${escapeHtml(moment.images[0])}" alt="朋友圈图片">` : ""}
        ${moment.reply_content ? `<div class="moment-reaction"><b>顾克：</b>${escapeHtml(moment.reply_content)}${moment.liked ? "　♥" : ""}</div>` : ""}
        ${moment.reply_status === "pending" ? '<div class="moment-reaction moment-pending">顾克还没有路过这里。</div>' : ""}
        <div class="moment-actions">${assistant ? `<button type="button" class="moment-like ${moment.user_liked ? "liked" : ""}">${moment.user_liked ? "♥ 已赞" : "♡ 点赞"}</button>` : ""}<button type="button" class="moment-comment-toggle">评论</button></div>
        <div class="moment-comments">${comments.map((comment) => `<div class="moment-comment"><b>${comment.author === "assistant" ? "顾克" : "我"}：</b>${escapeHtml(comment.content)}${comment.reply_status === "pending" ? "　…" : ""}</div>`).join("")}</div>
        <form class="moment-comment-form" hidden><input maxlength="1000" placeholder="留一句评论……"><button type="submit">发送</button></form>
      </article>`;
    }).join("");
  }

  async function refreshMoments() {
    try {
      const data = await window.LumiereAPI.request("/moments");
      moments = Array.isArray(data?.entries) ? data.entries : [];
      renderMoments();
    } catch (error) {
      $("#moments-feed").innerHTML = `<div class="glass moments-empty">${escapeHtml(error.message)}</div>`;
    }
  }

  async function compressMomentImage(file) {
    if (!file) return null;
    if (!/^image\/(?:jpeg|png|webp)$/i.test(file.type)) throw new Error("请选择 JPG、PNG 或 WebP 图片");
    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = source;
    });
    const scale = Math.min(1, 1440 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
  }

  async function postMoment(event) {
    event.preventDefault();
    const content = $("#moment-content").value.trim();
    if (!content && !selectedMomentImage) return showToast("写点什么或选一张图片");
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await window.LumiereAPI.request("/moments", { method: "POST", body: JSON.stringify({ content, images: selectedMomentImage ? [selectedMomentImage] : [] }) });
      $("#moment-content").value = "";
      $("#moment-image").value = "";
      $("#moment-image-name").textContent = "";
      selectedMomentImage = null;
      await refreshMoments();
      showToast("动态已发布");
    } catch (error) { showToast(error.message); }
    finally { button.disabled = false; }
  }

  async function refreshRealData(health) {
    const request = window.LumiereAPI?.request;
    if (!request) return;
    try {
      const [resolvedHealth, sessions, realMemories, driveStatus, diaryData] = await Promise.all([
        health || request("/health"),
        request("/sessions"),
        request("/memories"),
        request("/drives/status").catch(() => ({ available: false })),
        request("/diary").catch(() => ({ entries: [] }))
      ]);
      $("#home-session-count").textContent = sessions.length;
      memories = Array.isArray(realMemories) ? realMemories : [];
      diaries = Array.isArray(diaryData?.entries) ? diaryData.entries : [];
      renderHealth(resolvedHealth);
      renderDrives(driveStatus);
      renderDiaryCard();
      renderModelStatus();
      renderMemories();
      await refreshMoments();
    } catch (error) {
      $("#home-service-pill").textContent = "连接失败";
      $("#home-ai-status").textContent = "暂不可用";
      $("#settings-service-status").textContent = error.message;
    }
  }

  renderToday();
  const openDrives = () => {
    renderFullDrives();
    $("#drives-dialog").hidden = false;
    document.body.classList.add("drives-dialog-open");
  };
  const closeDrives = () => {
    $("#drives-dialog").hidden = true;
    document.body.classList.remove("drives-dialog-open");
  };
  let drivesSwipe = null;
  $("#drives-dialog")?.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1 || event.target.closest("button,input,textarea,select,a")) {
      drivesSwipe = null;
      return;
    }
    const touch = event.touches[0];
    drivesSwipe = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, { passive: true });
  $("#drives-dialog")?.addEventListener("touchend", (event) => {
    if (!drivesSwipe) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - drivesSwipe.x;
    const dy = touch.clientY - drivesSwipe.y;
    const elapsed = Date.now() - drivesSwipe.time;
    drivesSwipe = null;
    if (dx > 85 && Math.abs(dy) < 55 && dx > Math.abs(dy) * 1.5 && elapsed < 900) closeDrives();
  }, { passive: true });
  $("#drives-card")?.addEventListener("click", openDrives);
  $("#drives-card")?.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDrives(); } });
  $("#drives-dialog-close")?.addEventListener("click", closeDrives);
  $("#drives-dialog")?.addEventListener("click", (event) => { if (event.target === $("#drives-dialog")) closeDrives(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !$("#drives-dialog")?.hidden) closeDrives(); });
  setInterval(renderToday, 60000);
  setInterval(refreshDrives, 30000);
  $("#today-button").addEventListener("click", () => { calendarDate = new Date(); renderCalendar(); });
  $("#day-summary").addEventListener("click", (event) => { const item=event.target.closest("[data-memory-id]"); if(item)openMemoryEditor(item.dataset.memoryId); });
  $("#memory-editor-save").addEventListener("click", saveMemoryEdit);
  $("#diary-card")?.addEventListener("click", openDiaryIndex);
  $("#diary-close")?.addEventListener("click", () => $("#diary-dialog").close());
  $("#diary-back")?.addEventListener("click", openDiaryIndex);
  $("#diary-index")?.addEventListener("click", (event) => { const item = event.target.closest("[data-diary-id]"); if (item) openDiaryEntry(item.dataset.diaryId); });
  $("#moment-form").addEventListener("submit", postMoment);
  $("#moment-image").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    try {
      selectedMomentImage = await compressMomentImage(file);
      $("#moment-image-name").textContent = file?.name || "";
    } catch (error) {
      selectedMomentImage = null;
      event.target.value = "";
      showToast(error.message);
    }
  });
  $("#moments-refresh").addEventListener("click", refreshMoments);
  $("#moments-feed").addEventListener("click", async (event) => {
    const card = event.target.closest("[data-moment-id]");
    if (!card) return;
    if (event.target.closest(".moment-comment-toggle")) {
      const form = card.querySelector(".moment-comment-form");
      form.hidden = !form.hidden;
      if (!form.hidden) form.querySelector("input").focus();
    }
    if (event.target.closest(".moment-like")) {
      const item = moments.find((moment) => moment.id === card.dataset.momentId);
      if (!item) return;
      await window.LumiereAPI.request(`/moments/${encodeURIComponent(item.id)}/like`, { method: "POST", body: JSON.stringify({ liked: !item.user_liked }) });
      await refreshMoments();
    }
  });
  $("#moments-feed").addEventListener("submit", async (event) => {
    const form = event.target.closest(".moment-comment-form");
    if (!form) return;
    event.preventDefault();
    const card = form.closest("[data-moment-id]");
    const input = form.querySelector("input");
    const content = input.value.trim();
    if (!content) return;
    await window.LumiereAPI.request(`/moments/${encodeURIComponent(card.dataset.momentId)}/comments`, { method: "POST", body: JSON.stringify({ content }) });
    input.value = "";
    await refreshMoments();
  });
  $("#model-select").addEventListener("change", renderModelStatus);
  window.addEventListener("lumiere:sessions", (event) => { $("#home-session-count").textContent = event.detail.count; });
  window.addEventListener("lumiere:model-changed", renderModelStatus);
  window.addEventListener("lumiere:ready", (event) => refreshRealData(event.detail));
  window.addEventListener("lumiere:offline", (event) => renderHealth({ ok: false, modelConfigured: false, message: event.detail.message }));
  document.querySelector('[data-target="memory"]').addEventListener("click", () => refreshRealData());
  document.querySelector('[data-target="moments"]').addEventListener("click", refreshMoments);
})();
