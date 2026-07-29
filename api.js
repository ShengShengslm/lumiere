(() => {
  const API = (window.LUMIERE_CONFIG?.API_BASE_URL || "/api").replace(/\/$/, "");
  const state = { sessionId: Number(localStorage.getItem("lumiere-session-id")) || null, sessions: [], busy: false, lastMessageId: 0 };
  const conversation = document.querySelector("#conversation");
  const history = document.querySelector("#conversation-history");
  const modelSelect = document.querySelector("#model-select");
  const temporaryToggle = document.querySelector("#temporary-chat-toggle");
  const thinkingToggle = document.querySelector("#thinking-toggle");

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const formatMessageTime = (value) => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "";
    const part = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}/${part(date.getMonth() + 1)}/${part(date.getDate())}/${part(date.getHours())}:${part(date.getMinutes())}`;
  };
  const scrollConversationToEnd = (behavior = "auto") => requestAnimationFrame(() => conversation.scrollTo({ top: conversation.scrollHeight, behavior }));
  window.LumiereChatScrollToEnd = scrollConversationToEnd;
  async function request(path, options = {}, retried = false) {
    const token = localStorage.getItem("lumiere-access-token") || "";
    const response = await fetch(`${API}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
    if (response.status === 401 && !retried) {
      const entered = window.prompt("请输入 Lumière 访问令牌（只保存在此浏览器）");
      if (entered) { localStorage.setItem("lumiere-access-token", entered); return request(path, options, true); }
    }
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `请求失败 (${response.status})`);
    return data;
  }
  window.LumiereAPI = { request };
  const assistantParagraphs = (value) => {
    const parts = String(value || "").split(/\n[ \t]*\n+/).map((part) => part.trim()).filter(Boolean);
    return parts.length ? parts : [""];
  };
  const timestampMarkup = (value) => value ? `<time class="message-timestamp">${escapeHtml(formatMessageTime(value))}</time>` : "";
  const voiceWaveMarkup = () => `<span class="voice-waveform" aria-hidden="true">${[7,12,18,10,23,15,28,19,12,25,17,29,20,11,24,16,10,7].map((height, index) => `<i style="--wave-h:${height}px;--wave-delay:${index * -0.045}s"></i>`).join("")}</span>`;
  const assistantBubbleMarkup = (value, placeholder = false, timestamp = "") => {
    let source = String(value || "");
    if (placeholder) source = source.replace(/\[\[voice:[\s\S]*$/i, "");
    const tokens = [];
    const pattern = /\[\[voice:([\s\S]*?)\|\|([\s\S]*?)\]\]/gi;
    let cursor = 0;
    for (const match of source.matchAll(pattern)) {
      assistantParagraphs(source.slice(cursor, match.index)).filter(Boolean).forEach((text) => tokens.push({ type: "text", text }));
      tokens.push({ type: "voice", spoken: match[1].trim(), translation: match[2].trim() });
      cursor = match.index + match[0].length;
    }
    assistantParagraphs(source.slice(cursor)).filter(Boolean).forEach((text) => tokens.push({ type: "text", text }));
    if (!tokens.length) tokens.push({ type: "text", text: placeholder ? "正在想…" : "" });
    return tokens.map((token, index) => {
      const finalTime = index === tokens.length - 1 ? timestampMarkup(timestamp) : "";
      if (token.type === "voice") return `<div class="message-row incoming-row voice-message-row"><div class="chat-avatar bot">L</div><div class="message-stack"><button type="button" class="voice-note ai-voice-note" data-tts="${escapeHtml(token.spoken)}" aria-label="播放顾克的语音"><span class="voice-play-icon"><svg viewBox="0 0 24 24"><path d="M9 7.5v9l7-4.5z"/></svg></span>${voiceWaveMarkup()}<b>语音</b></button><div class="voice-translation">${escapeHtml(token.translation)}</div>${finalTime}</div></div>`;
      if (/^📞\s*(?:与顾克通话|未接来电)/.test(token.text)) return `<div class="message-row incoming-row call-record-row"><div class="chat-avatar bot">L</div><div class="message-stack"><div class="call-record-card"><span><svg viewBox="0 0 24 24"><path d="M7.2 3.8 10 8 8.1 10c1.1 2.4 3 4.3 5.4 5.4l2-1.9 4.2 2.8-.8 3.1c-.2.8-1 1.4-1.9 1.3C9.6 20 4 14.4 3.3 7c-.1-.9.5-1.7 1.3-1.9z"/></svg></span><div><small>VOICE CALL</small><strong>${escapeHtml(token.text.replace(/^📞\s*/, ""))}</strong></div></div>${finalTime}</div></div>`;
      return `<div class="message-row incoming-row"><div class="chat-avatar bot">L</div><div class="message-stack"><div class="message incoming">${escapeHtml(token.text).replace(/\n/g, "<br>")}</div>${finalTime}</div></div>`;
    }).join("");
  };
  const setStatus = (text, online) => {
    let element = document.querySelector("#api-status");
    if (element) { element.textContent = text; element.className = `api-status ${online ? "online" : "offline"}`; }
  };
  const appendMessage = (message, pending = false, shouldScroll = true) => {
    const outgoing = message.role === "user";
    const row = document.createElement("div");
    row.className = outgoing ? "message-row outgoing-row" : "assistant-turn";
    if (pending) row.classList.add("pending");
    const reasoning = !outgoing && message.reasoning_content ? `<details class="thought-inline"><summary>思路摘要 · 点击展开<i>⌄</i></summary><div><p>${escapeHtml(message.reasoning_content)}</p></div></details>` : "";
    const timestamp = message.created_at || new Date().toISOString();
    const messageRow = `<div class="message-row outgoing-row"><div class="message-stack"><div class="message outgoing">${escapeHtml(message.content)}</div>${timestampMarkup(timestamp)}</div><div class="chat-avatar user">Y</div></div>`;
    if (outgoing) row.innerHTML = messageRow;
    else row.innerHTML = reasoning + `<div class="assistant-bubbles">${assistantBubbleMarkup(message.content, pending, timestamp)}</div>`;
    conversation.append(row); if (shouldScroll) scrollConversationToEnd("smooth"); return row;
  };
  async function loadMessages() {
    if (!state.sessionId) return;
    const messages = await request(`/sessions/${state.sessionId}/messages`);
    conversation.innerHTML = "";
    if (!messages.length) appendMessage({ role: "assistant", content: "新的对话开始了。今天想聊些什么？" }, false, false);
    else messages.forEach((message) => appendMessage(message, false, false));
    state.lastMessageId = Number(messages.at(-1)?.id || 0);
    scrollConversationToEnd();
  }
  async function pollMessages() {
    if (state.busy || !state.sessionId || document.hidden) return;
    try {
      const messages = await request(`/sessions/${state.sessionId}/messages`);
      const fresh = messages.filter((message) => Number(message.id) > state.lastMessageId);
      fresh.forEach((message) => appendMessage(message));
      if (messages.length) state.lastMessageId = Number(messages.at(-1).id);
    } catch { /* the normal health UI handles connection errors */ }
  }
  function renderSessions() {
    history.innerHTML = '<div class="history-group"><span>全部对话</span></div>';
    const group = history.firstElementChild;
    state.sessions.forEach((session) => {
      const button = document.createElement("button"); button.className = `history-chat${session.id === state.sessionId ? " active" : ""}`; button.dataset.sessionId = session.id;
      button.innerHTML = `<b>${escapeHtml(session.name)}</b><small>${new Date(session.updated_at).toLocaleDateString("zh-CN")}</small><span class="rename-chat" role="button" aria-label="重命名对话">✎</span>`;
      let holdTimer;
      const cancelHold = () => { clearTimeout(holdTimer); button.classList.remove("long-pressing"); };
      button.addEventListener("pointerdown", (event) => { if (event.target.closest(".rename-chat")) return; button.classList.add("long-pressing"); holdTimer = setTimeout(async () => { button.dataset.suppressClick = "1"; button.classList.remove("long-pressing"); if (!confirm(`删除对话“${session.name}”？此操作无法撤销。`)) return; await request(`/sessions/${session.id}`, { method: "DELETE" }); if (state.sessionId === session.id) state.sessionId = null; await loadSessions(); await loadMessages(); }, 650); });
      ["pointerup", "pointercancel", "pointerleave"].forEach((name) => button.addEventListener(name, cancelHold));
      group.append(button);
    });
  }
  async function loadSessions(createIfEmpty = true) {
    state.sessions = await request("/sessions");
    if (!state.sessions.length && createIfEmpty) { const created = await request("/sessions", { method: "POST", body: JSON.stringify({ name: "新的对话" }) }); state.sessions = [created]; }
    if (!state.sessions.some((item) => item.id === state.sessionId)) state.sessionId = state.sessions[0]?.id || null;
    localStorage.setItem("lumiere-session-id", state.sessionId || ""); renderSessions();
    window.dispatchEvent(new CustomEvent("lumiere:sessions", { detail: { count: state.sessions.length } }));
  }
  async function loadModels() {
    const catalog = await request("/models");
    const saved = localStorage.getItem("lumiere-model");
    modelSelect.innerHTML = "";
    catalog.forEach((provider) => {
      const group = document.createElement("optgroup");
      group.label = provider.configured ? provider.label : `${provider.label}（未配置）`;
      group.disabled = !provider.configured;
      provider.models.forEach((model) => {
        const option = document.createElement("option");
        option.value = `${provider.id}:${model.id}`; option.textContent = `${provider.label} · ${model.label}`; group.append(option);
      });
      modelSelect.append(group);
    });
    const available = [...modelSelect.options].filter((option) => !option.parentElement.disabled);
    const selected = available.find((option) => option.value === saved) || available[0];
    if (selected) { modelSelect.value = selected.value; document.querySelector("#header-model-name").textContent = selected.textContent; }
    else { const option = document.createElement("option"); option.textContent = "请先配置 AI API"; option.value = ""; modelSelect.replaceChildren(option); }
  }
  async function createSession() {
    const session = await request("/sessions", { method: "POST", body: JSON.stringify({ name: "新的对话" }) }); state.sessionId = session.id; await loadSessions(false); await loadMessages(); toggleChatDrawer(false); showToast("已新建对话");
  }
  async function openChatStream(payload, retried = false) {
    const token = localStorage.getItem("lumiere-access-token") || "";
    const response = await fetch(`${API}/sessions/${state.sessionId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ ...payload, stream: true })
    });
    if (response.status === 401 && !retried) {
      const entered = window.prompt("请输入 Lumière 访问令牌（只保存在此浏览器）");
      if (entered) { localStorage.setItem("lumiere-access-token", entered); return openChatStream(payload, true); }
    }
    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || `请求失败 (${response.status})`);
    }
    return response;
  }
  function streamRenderer(row) {
    const bubbles = row.querySelector(".assistant-bubbles");
    let text = "";
    let queuedText = "";
    let reasoning = "";
    let streamError = "";
    let finished = false;
    let pauseUntil = 0;
    let finishResolve;
    const finishedPromise = new Promise((resolve) => { finishResolve = resolve; });
    let timestamp = new Date().toISOString();
    const renderText = () => { bubbles.innerHTML = assistantBubbleMarkup(text, true, timestamp); scrollConversationToEnd(); };
    const timer = setInterval(() => {
      if (queuedText && Date.now() >= pauseUntil) {
        let take = queuedText.length > 160 ? 5 : queuedText.length > 60 ? 3 : 1;
        const sample = queuedText.slice(0, take);
        const prefix = text.match(/\n[ \t]*$/)?.[0] || "";
        const boundary = (prefix + sample).match(/\n[ \t]*\n/);
        if (boundary) {
          take = Math.max(1, boundary.index + boundary[0].length - prefix.length);
          pauseUntil = Date.now() + 300 + Math.floor(Math.random() * 601);
        }
        text += queuedText.slice(0, take);
        queuedText = queuedText.slice(take);
        renderText();
      }
      if (finished && !queuedText) {
        clearInterval(timer);
        row.classList.remove("pending");
        if (streamError) {
          text = text ? `${text}\n\n${streamError}` : streamError;
          renderText();
        }
        finishResolve();
      }
    }, 24);
    const renderReasoning = () => {
      let details = row.querySelector(".thought-inline");
      if (!details) {
        details = document.createElement("details");
        details.className = "thought-inline";
        details.innerHTML = "<summary>Claude 思考摘要 · 点击展开<i>⌄</i></summary><div><p></p></div>";
        row.prepend(details);
      }
      details.querySelector("p").textContent = reasoning;
    };
    renderText();
    return {
      handle(event) {
        if (event.type === "text") queuedText += event.content || "";
        if (event.type === "reasoning") { reasoning += event.content || ""; renderReasoning(); }
        if (event.type === "error") streamError = event.content || "连接中断了";
        if (event.type === "done" && event.assistant) {
          const finalText = event.assistant.content || "";
          const receivedText = text + queuedText;
          if (finalText.startsWith(receivedText)) queuedText += finalText.slice(receivedText.length);
          timestamp = event.assistant.created_at || timestamp;
          reasoning = event.assistant.reasoning_content || reasoning;
          if (reasoning) renderReasoning();
          state.lastMessageId = Number(event.assistant.id || state.lastMessageId);
        }
      },
      finish() {
        finished = true;
        return finishedPromise;
      },
      fail(message) {
        clearInterval(timer);
        row.classList.remove("pending");
        text = text ? `${text}\n\n${message}` : message;
        renderText();
        finishResolve();
      }
    };
  }
  async function consumeSse(response, renderer) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw) continue;
        try { renderer.handle(JSON.parse(raw)); } catch { /* wait for the next complete SSE line */ }
      }
    }
    await renderer.finish();
  }
  window.LumiereAPI.generateTemporary = async (content, options = {}) => {
    const response = await openChatStream({
      content,
      attachments: [],
      model: options.model || modelSelect.value,
      temporary: true,
      thinking: false
    });
    let streamed = "";
    let finalText = "";
    let streamError = "";
    await consumeSse(response, {
      handle(event) {
        if (event.type === "text") streamed += event.content || "";
        if (event.type === "error") streamError = event.content || "连接中断了";
        if (event.type === "done" && event.assistant) finalText = event.assistant.content || "";
      },
      finish() {
        if (streamError) throw new Error(streamError);
        return Promise.resolve();
      }
    });
    return String(finalText || streamed).trim();
  };
  async function sendMessage(content, attachments = []) {
    if (state.busy) return; state.busy = true;
    window.dispatchEvent(new CustomEvent("lumiere:pet-state", { detail: { state: "thinking" } }));
    const visibleContent = (content || "请查看这个附件") + (attachments.length ? `\n\n${attachments.map((item) => `[附件：${item.name}]`).join("\n")}` : "");
    appendMessage({ role: "user", content: visibleContent });
    const pending = appendMessage({ role: "assistant", content: "" }, true);
    const renderer = streamRenderer(pending);
    try {
      const response = await openChatStream({ content, attachments, model: modelSelect.value, temporary: temporaryToggle.checked, thinking: thinkingToggle.checked });
      window.dispatchEvent(new CustomEvent("lumiere:pet-state", { detail: { state: "working" } }));
      await consumeSse(response, renderer);
      await loadSessions(false); setStatus("已连接", true);
      window.dispatchEvent(new CustomEvent("lumiere:pet-state", { detail: { state: "happy" } }));
    } catch (error) { renderer.fail(`暂时没有连上服务：${error.message}`); setStatus(error.message, false); window.dispatchEvent(new CustomEvent("lumiere:pet-state", { detail: { state: "error" } })); }
    finally { state.busy = false; }
  }
  function installSettings() {
    const page = document.querySelector('[data-page="settings"]');
    const form = document.createElement("form"); form.className = "glass cloud-settings"; form.id = "cloud-settings";
    form.innerHTML = '<h2>AI 与长期记忆</h2><p class="provider-note">模型 API 在服务端安全配置，聊天页可直接切换已连接的平台。</p><label><span>系统提示词</span><textarea name="system_prompt"></textarea></label><div class="settings-grid"><label><span>温度</span><input name="temperature" type="number" min="0" max="2" step="0.1"></label><label><span>上下文轮数</span><input name="max_context_rounds" type="number" min="1"></label><label><span>压缩阈值（token）</span><input name="compress_threshold" type="number" min="500"></label><label><span>压缩后保留轮数</span><input name="compress_keep_rounds" type="number" min="1"></label><label><span>最大回复 token</span><input name="max_reply_tokens" type="number" min="64"></label></div><button type="submit">保存 AI 设置</button><a class="claude-handoff" href="https://claude.ai/" target="_blank" rel="noopener noreferrer">打开 Claude 官方订阅 ↗</a><small class="subscription-note">Claude.ai 订阅不能作为本平台 API 使用；此入口仅打开官方 Claude。</small>';
    form.querySelector(".subscription-note").textContent = "个人部署可通过后端 Claude Code 使用官方订阅；需要先在服务端配置 OAuth Token。";
    page.querySelector(".version").before(form);
    request("/settings").then((settings) => Object.entries(settings).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value; })).catch(() => {});
    form.addEventListener("submit", async (event) => { event.preventDefault(); const body = Object.fromEntries(new FormData(form)); ["temperature", "max_context_rounds", "compress_threshold", "compress_keep_rounds", "max_reply_tokens"].forEach((key) => body[key] = Number(body[key])); try { await request("/settings", { method: "PUT", body: JSON.stringify(body) }); showToast("AI 设置已保存"); } catch (error) { showToast(error.message); } });
  }

  document.addEventListener("submit", (event) => { if (event.target.id !== "chat-form") return; event.preventDefault(); event.stopImmediatePropagation(); const input = document.querySelector("#chat-input"); const value = input.value.trim(); const attachments=window.LumiereAttachments?.take()||[]; if (!value&&!attachments.length) return; input.value = ""; sendMessage(value,attachments); }, true);
  document.addEventListener("click", async (event) => {
    if (event.target.closest("#new-chat-button")) { event.preventDefault(); event.stopImmediatePropagation(); return createSession().catch((error) => showToast(error.message)); }
    const renameButton = event.target.closest(".rename-chat"); const sessionButton = event.target.closest("[data-session-id]");
    if (renameButton && sessionButton) { event.preventDefault(); event.stopImmediatePropagation(); const session=state.sessions.find(item=>item.id===Number(sessionButton.dataset.sessionId)); const name=prompt("给这段对话重新命名：",session?.name||""); if(!name?.trim())return; await request(`/sessions/${sessionButton.dataset.sessionId}`,{method:"PATCH",body:JSON.stringify({name:name.trim()})}); await loadSessions(false); return; }
    if (sessionButton) { event.preventDefault(); if(sessionButton.dataset.suppressClick==="1"){delete sessionButton.dataset.suppressClick;return} state.sessionId = Number(sessionButton.dataset.sessionId); localStorage.setItem("lumiere-session-id", state.sessionId); renderSessions(); await loadMessages(); toggleChatDrawer(false); return; }
    if (event.target.closest("#clear-context-button")) { event.preventDefault(); event.stopImmediatePropagation(); if (!state.sessionId || !confirm("清空当前会话的可见上下文？")) return; await request(`/sessions/${state.sessionId}/clear`, { method: "POST" }); await loadMessages(); toggleChatDrawer(false); }
  }, true);
  modelSelect.addEventListener("change", () => { localStorage.setItem("lumiere-model", modelSelect.value); document.querySelector("#header-model-name").textContent = modelSelect.selectedOptions[0]?.textContent || "AI"; window.dispatchEvent(new CustomEvent("lumiere:model-changed")); });
  thinkingToggle.checked = localStorage.getItem("lumiere-thinking") === "1";
  document.querySelector("#thinking-status").textContent = thinkingToggle.checked ? "思考开启" : "思考关闭";
  thinkingToggle.addEventListener("change", () => { localStorage.setItem("lumiere-thinking", thinkingToggle.checked ? "1" : "0"); document.querySelector("#thinking-status").textContent = thinkingToggle.checked ? "思考开启" : "思考关闭"; showToast(thinkingToggle.checked ? "后续回复将显示思路摘要" : "思路摘要已关闭"); });
  installSettings();
  setInterval(pollMessages, 30000);
  window.addEventListener("lumiere:call-recorded", () => pollMessages());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pollMessages(); });
  request("/health").then(async (health) => { setStatus(health.modelConfigured ? "云端已连接" : "服务已启动，请配置模型 API Key", health.modelConfigured); await loadModels(); await loadSessions(); await loadMessages(); window.dispatchEvent(new CustomEvent("lumiere:ready", { detail: health })); window.dispatchEvent(new CustomEvent("lumiere:pet-state", { detail: { state: "idle" } })); }).catch((error) => { setStatus(error.message, false); window.dispatchEvent(new CustomEvent("lumiere:offline", { detail: { message: error.message } })); window.dispatchEvent(new CustomEvent("lumiere:pet-state", { detail: { state: "error" } })); });
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/service-worker.js").catch(() => {}));
})();
