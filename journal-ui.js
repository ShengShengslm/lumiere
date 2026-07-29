(() => {
  const shell = document.querySelector(".app-shell");
  if (!shell || shell.querySelector(".journal-atmosphere")) return;

  shell.insertAdjacentHTML("afterbegin", `
    <div class="journal-atmosphere" aria-hidden="true">
      <span class="journal-fiber journal-fiber-a"></span>
      <span class="journal-fiber journal-fiber-b"></span>
    </div>
  `);

  const pageDecor = {
    home: `
      <aside class="journal-page-folio" aria-hidden="true">
        <span>PRIVATE ARCHIVE</span><b>NO. 0627</b>
      </aside>
      <div class="journal-found-collage journal-found-home" aria-hidden="true">
        <span class="found-material found-home-lotus"><img src="/journal-assets/botanical-lotus-specimen-v2.png" alt=""></span>
        <span class="found-material found-home-lily"><img src="/journal-assets/botanical-rose-cutout.png" alt=""></span>
        <span class="journal-coordinate">64.9631° N<br>19.0208° W<br>ARCHIVE · 0627</span>
      </div>
      <aside class="journal-index-slip journal-index-slip-home" aria-hidden="true">
        <small>COLLECTION NOTE</small>
        <b>Save what was<br>almost forgotten.</b>
        <span>LUMIÈRE / PERSONAL ARCHIVE</span>
      </aside>
    `,
    chat: `
      <aside class="journal-letterhead" aria-hidden="true">
        <span>PRIVATE LETTERS</span><b>FROM LUMIÈRE, WITH CARE</b>
      </aside>
      <div class="journal-found-collage journal-found-chat" aria-hidden="true">
        <span class="found-material found-chat-letter"><img src="/journal-assets/burnt-letter-diagonal.png" alt=""></span>
        <span class="found-material found-chat-lilies"><img src="/journal-assets/botanical-rose-cutout.png" alt=""></span>
        <span class="found-material found-chat-butterfly"><img src="/journal-assets/botanical-moth-cutout.png" alt=""></span>
        <span class="found-material found-chat-lotus"><img src="/journal-assets/botanical-lotus-specimen-v2.png" alt=""></span>
      </div>
    `,
    memory: `
      <aside class="journal-page-folio" aria-hidden="true">
        <span>MEMORY ARCHIVE</span><b>CATALOGUE · L</b>
      </aside>
      <div class="journal-postmark journal-postmark-memory" aria-hidden="true"></div>
      <div class="journal-found-collage journal-found-memory" aria-hidden="true">
        <span class="found-material found-memory-letter"><img src="/journal-assets/burnt-letter-botanical.png" alt=""></span>
        <span class="found-material found-memory-print"><img src="/journal-assets/botanical-moth-cutout.png" alt=""></span>
        <span class="found-material found-memory-lace"><img src="/journal-assets/archive-lace-frame.webp" alt=""></span>
        <span class="found-material found-memory-lotus"><img src="/journal-assets/botanical-rose-cutout.png" alt=""></span>
      </div>
      <aside class="journal-index-slip journal-memory-slip" aria-hidden="true">
        <small>MEMORY FRAGMENT</small>
        <b>2026 · PRIVATE COLLECTION</b>
        <span>SAVED BY LUMIÈRE</span>
      </aside>
    `,
    moments: `
      <aside class="journal-page-folio" aria-hidden="true">
        <span>FILM & FRAGMENTS</span><b>PERSONAL COLLECTION</b>
      </aside>
      <div class="journal-found-collage journal-found-moments" aria-hidden="true">
        <span class="found-material found-moments-letter"><img src="/journal-assets/burnt-letter-folded.png" alt=""></span>
        <span class="found-material found-moments-moth"><img src="/journal-assets/botanical-moth-cutout.png" alt=""></span>
        <span class="found-material found-moments-ephemera"><img src="/journal-assets/archive-botanical.webp" alt=""></span>
        <span class="found-material found-moments-lotus"><img src="/journal-assets/botanical-lotus-specimen-v2.png" alt=""></span>
      </div>
    `,
    settings: `
      <aside class="journal-page-folio" aria-hidden="true">
        <span>OWNER'S FILE</span><b>PERSONAL JOURNAL</b>
      </aside>
      <div class="journal-found-collage journal-found-settings" aria-hidden="true">
        <span class="found-material found-settings-letter"><img src="/journal-assets/burnt-letter-botanical.png" alt=""></span>
        <span class="found-material found-settings-candelabra"><img src="/journal-assets/botanical-lotus-specimen-v2.png" alt=""></span>
        <span class="found-material found-settings-lily"><img src="/journal-assets/botanical-rosemary-cutout.png" alt=""></span>
        <span class="found-material found-settings-lace"><img src="/journal-assets/archive-lace-frame.webp" alt=""></span>
      </div>
    `
  };

  Object.entries(pageDecor).forEach(([pageName, markup]) => {
    document.querySelector(`[data-page="${pageName}"]`)?.insertAdjacentHTML("afterbegin", markup);
  });

  const hero = document.querySelector(".hero-card");
  const noteDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit"
  }).format(new Date()).replace(" ", ". ").toUpperCase();
  hero?.insertAdjacentHTML("afterbegin", `
    <div class="journal-hero-label" aria-hidden="true">
      <span>TOGETHER SINCE</span><small>PRIVATE LOVE ARCHIVE · 01</small>
    </div>
    <span class="journal-paperclip" aria-hidden="true"></span>
    <div class="journal-hero-collage">
      <figure class="journal-polaroid">
        <button type="button" class="journal-polaroid-photo" aria-label="更换首页收藏照片">
          <span>点击更换<br>收藏照片</span>
        </button>
        <input class="journal-photo-input" type="file" accept="image/*" hidden>
        <figcaption>private photograph · tap to replace</figcaption>
      </figure>
      <span class="journal-pressed-flower" aria-hidden="true"><img src="/journal-assets/botanical-rosemary-cutout.png" alt=""></span>
      <span class="journal-collage-stars">✦　·　✧</span>
      <span class="journal-hero-coordinate">64.9631° N<br>19.0208° W<br>ARCHIVE · L/01</span>
      <span class="journal-hero-postmark"></span>
    </div>
    <div class="journal-note-paper" aria-hidden="true"></div>
    <div class="journal-note-meta" aria-hidden="true">
      <span>TODAY'S NOTE</span><time>${noteDate}</time>
    </div>
    <p class="journal-note-content" id="journal-note-content"></p>
    <div class="journal-note-actions">
      <button type="button" class="journal-note-edit" aria-label="编辑首页留言">✎ <span>EDIT</span></button>
      <button type="button" class="journal-note-ai" aria-label="让顾克写一段留言">AI <span>让顾克写一段</span></button>
    </div>
    <form class="journal-note-editor" hidden>
      <label for="journal-note-input">一整封留言</label>
      <textarea id="journal-note-input" maxlength="180" rows="5"></textarea>
      <div>
        <button type="button" data-note-cancel>取消</button>
        <button type="submit">保存留言</button>
      </div>
    </form>
    <span class="journal-hand-note" aria-hidden="true">saved by Lumière.</span>
  `);

  const notify = (message) => window.LumiereShowToast?.(message);
  const editNote = hero?.querySelector(".journal-note-edit");
  const aiNote = hero?.querySelector(".journal-note-ai");
  const noteContent = hero?.querySelector("#journal-note-content");
  const noteEditor = hero?.querySelector(".journal-note-editor");
  const noteInput = hero?.querySelector("#journal-note-input");
  const heroTitle = document.querySelector("#hero-title");
  const heroSubtitle = document.querySelector("#hero-subtitle");
  const noteDefault = [heroTitle?.textContent, heroSubtitle?.textContent].filter(Boolean).join("，");
  const saveNote = (value) => {
    const text = String(value || "").trim() || noteDefault;
    noteContent.textContent = text;
    localStorage.setItem("lumiere-journal-note", text);
    return text;
  };
  saveNote(localStorage.getItem("lumiere-journal-note") || noteDefault);
  const toggleNoteEditor = (open) => {
    noteEditor.hidden = !open;
    if (open) {
      noteInput.value = noteContent.textContent;
      requestAnimationFrame(() => noteInput.focus());
    }
  };
  editNote?.addEventListener("click", () => toggleNoteEditor(true));
  noteContent?.addEventListener("dblclick", () => toggleNoteEditor(true));
  noteEditor?.querySelector("[data-note-cancel]")?.addEventListener("click", () => toggleNoteEditor(false));
  noteEditor?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveNote(noteInput.value);
    toggleNoteEditor(false);
    notify("首页留言已保存");
  });

  aiNote?.addEventListener("click", async () => {
    const sessionId = Number(localStorage.getItem("lumiere-session-id"));
    if (!sessionId || !window.LumiereAPI?.generateTemporary) return notify("先和顾克聊几句，他才有东西写给你");
    aiNote.disabled = true;
    aiNote.classList.add("is-writing");
    aiNote.querySelector("span").textContent = "正在写留言…";
    try {
      const model = document.querySelector("#model-select")?.value || "";
      const prompt = "请根据我们最近的真实对话，以顾克的口吻给我写一段今天放在私人手账首页的留言。只输出留言正文，不要标题、引号、解释或列表；中文 35 到 90 字，亲密、自然、有具体感，不要像文案模板。";
      const result = await window.LumiereAPI.generateTemporary(prompt, { model });
      const text = String(result || "")
        .replace(/^[“"'「『]+|[”"'」』]+$/g, "")
        .trim()
        .slice(0, 180);
      if (!text) throw new Error("没有生成留言");
      saveNote(text);
      notify("顾克把留言留在首页了");
    } catch (error) {
      notify(`暂时没写好：${error.message}`);
    } finally {
      aiNote.disabled = false;
      aiNote.classList.remove("is-writing");
      aiNote.querySelector("span").textContent = "让顾克写一段";
    }
  });

  const photoButton = hero?.querySelector(".journal-polaroid-photo");
  const photoInput = hero?.querySelector(".journal-photo-input");
  photoButton?.addEventListener("click", () => photoInput.click());
  photoInput?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return notify("请选择图片文件");
    const reader = new FileReader();
    reader.onload = async () => {
      window.LumiereApplyHomePhoto?.(reader.result);
      try {
        await window.LumierePersonalAssets?.set("journal-home-photo", reader.result);
        notify("首页收藏照片已更换");
      } catch {
        notify("照片已更换，但浏览器未能保存");
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  });

  document.querySelector(".drives-card")?.insertAdjacentHTML("afterbegin", `
    <div class="journal-mood-specimen" aria-hidden="true">
      <span>INNER WEATHER</span><i></i><b>情绪标本 · 01</b>
    </div>
  `);

  document.querySelector(".tasks-card")?.insertAdjacentHTML("afterbegin", `
    <div class="journal-card-caption" aria-hidden="true">
      <span>DAILY INDEX</span><b>things worth returning to</b>
    </div>
  `);

  document.querySelector(".calendar-card")?.insertAdjacentHTML("afterbegin", `
    <div class="journal-card-caption journal-card-caption-archive" aria-hidden="true">
      <span>ARCHIVE INDEX</span><b>recorded in quiet detail</b>
    </div>
  `);

  document.querySelector(".profile-card")?.insertAdjacentHTML("beforeend", `
    <span class="journal-profile-stamp" aria-hidden="true">CONFIDENTIAL<br>PERSONAL FILE</span>
  `);
})();
