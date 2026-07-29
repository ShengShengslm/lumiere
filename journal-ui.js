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
      <div class="journal-collage-piece journal-collage-home" aria-hidden="true">
        <img src="/journal-assets/archive-botanical.webp" alt="">
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
      <div class="journal-star-field" aria-hidden="true"></div>
    `,
    memory: `
      <aside class="journal-page-folio" aria-hidden="true">
        <span>MEMORY ARCHIVE</span><b>CATALOGUE · L</b>
      </aside>
      <div class="journal-postmark journal-postmark-memory" aria-hidden="true"></div>
      <div class="journal-lace-artifact journal-lace-memory" aria-hidden="true">
        <img src="/journal-assets/archive-lace-frame.webp" alt="">
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
      <div class="journal-collage-piece journal-collage-moments" aria-hidden="true">
        <img src="/journal-assets/archive-botanical.webp" alt="">
      </div>
    `,
    settings: `
      <aside class="journal-page-folio" aria-hidden="true">
        <span>OWNER'S FILE</span><b>PERSONAL JOURNAL</b>
      </aside>
      <div class="journal-collage-piece journal-collage-settings" aria-hidden="true">
        <img src="/journal-assets/archive-botanical.webp" alt="">
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
    <div class="journal-hero-collage" aria-hidden="true">
      <figure class="journal-polaroid">
        <span class="journal-polaroid-photo avatar-preview-lumi">L</span>
        <figcaption>photograph no. 01</figcaption>
      </figure>
      <span class="journal-specimen"></span>
      <span class="journal-collage-stars">✦　·　✧</span>
      <span class="journal-hero-coordinate">64.9631° N<br>19.0208° W<br>ARCHIVE · L/01</span>
      <span class="journal-hero-postmark"></span>
    </div>
    <div class="journal-note-paper" aria-hidden="true"></div>
    <div class="journal-note-meta" aria-hidden="true">
      <span>TODAY'S NOTE</span><time>${noteDate}</time>
    </div>
    <span class="journal-hand-note" aria-hidden="true">saved by Lumière.</span>
  `);

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
