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
  hero?.insertAdjacentHTML("afterbegin", `
    <div class="journal-hero-label" aria-hidden="true">
      <span>TOGETHER SINCE</span><small>every day with you</small>
    </div>
    <span class="journal-paperclip" aria-hidden="true"></span>
    <span class="journal-hand-note" aria-hidden="true">a life, kept softly.</span>
  `);

  document.querySelector(".tasks-card")?.insertAdjacentHTML("afterbegin", `
    <div class="journal-card-caption" aria-hidden="true">
      <span>TODAY'S NOTE</span><b>things worth remembering</b>
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
