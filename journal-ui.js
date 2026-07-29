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
      <div class="journal-botanical journal-botanical-home" aria-hidden="true"></div>
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
    `,
    moments: `
      <aside class="journal-page-folio" aria-hidden="true">
        <span>FILM & FRAGMENTS</span><b>PERSONAL COLLECTION</b>
      </aside>
    `,
    settings: `
      <aside class="journal-page-folio" aria-hidden="true">
        <span>OWNER'S FILE</span><b>PERSONAL JOURNAL</b>
      </aside>
      <div class="journal-botanical journal-botanical-settings" aria-hidden="true"></div>
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
