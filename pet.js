(() => {
  const shell = document.querySelector(".app-shell");
  const pet = document.querySelector("#lumiere-pet");
  const image = pet?.querySelector("img");
  const label = pet?.querySelector(".lumiere-pet-state");
  const toggle = document.querySelector("#pet-toggle");
  if (!shell || !pet || !image || !toggle) return;

  const assets = {
    idle: "/pet-assets/idle.gif",
    thinking: "/pet-assets/thinking.gif",
    working: "/pet-assets/working.gif",
    happy: "/pet-assets/happy.gif",
    error: "/pet-assets/error.gif",
    sleeping: "/pet-assets/sleeping.gif",
    poke: "/pet-assets/poke.gif"
  };
  const labels = { idle: "", thinking: "正在想…", working: "正在回复…", happy: "", error: "出了点问题", sleeping: "", poke: "" };
  let state = "idle";
  let returnTimer;
  let sleepTimer;
  let drag = null;
  let moved = false;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const savePosition = () => {
    const maxX = Math.max(1, shell.clientWidth - pet.offsetWidth);
    const maxY = Math.max(1, shell.clientHeight - pet.offsetHeight);
    localStorage.setItem("lumiere-pet-position", JSON.stringify({
      x: clamp(pet.offsetLeft / maxX, 0, 1),
      y: clamp(pet.offsetTop / maxY, 0, 1)
    }));
  };
  const restorePosition = () => {
    try {
      const saved = JSON.parse(localStorage.getItem("lumiere-pet-position"));
      if (!Number.isFinite(saved?.x) || !Number.isFinite(saved?.y)) return;
      pet.style.left = `${clamp(saved.x, 0, 1) * Math.max(0, shell.clientWidth - pet.offsetWidth)}px`;
      pet.style.top = `${clamp(saved.y, 0, 1) * Math.max(0, shell.clientHeight - pet.offsetHeight)}px`;
    } catch {}
  };
  const setState = (next, duration = 0) => {
    if (!assets[next] || pet.hidden) return;
    clearTimeout(returnTimer);
    state = next;
    pet.dataset.state = next;
    label.textContent = labels[next];
    image.src = `${assets[next]}?state=${next}&t=${Date.now()}`;
    if (duration) returnTimer = setTimeout(() => setState("idle"), duration);
  };
  const resetSleep = () => {
    clearTimeout(sleepTimer);
    if (state === "sleeping") setState("idle");
    sleepTimer = setTimeout(() => setState("sleeping"), 60_000);
  };
  const setEnabled = (enabled) => {
    pet.hidden = !enabled;
    toggle.checked = enabled;
    localStorage.setItem("lumiere-pet-enabled", enabled ? "1" : "0");
    if (enabled) { restorePosition(); setState("idle"); resetSleep(); }
    else { clearTimeout(sleepTimer); clearTimeout(returnTimer); }
  };

  pet.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    moved = false;
    drag = { x: event.clientX, y: event.clientY, left: pet.offsetLeft, top: pet.offsetTop };
    pet.setPointerCapture(event.pointerId);
    pet.classList.add("dragging");
  });
  pet.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
    pet.style.left = `${clamp(drag.left + dx, 0, shell.clientWidth - pet.offsetWidth)}px`;
    pet.style.top = `${clamp(drag.top + dy, 0, shell.clientHeight - pet.offsetHeight)}px`;
  });
  pet.addEventListener("pointerup", () => {
    if (!drag) return;
    drag = null;
    pet.classList.remove("dragging");
    savePosition();
    if (!moved) setState("poke", 2500);
    resetSleep();
  });
  pet.addEventListener("pointercancel", () => { drag = null; pet.classList.remove("dragging"); });
  toggle.addEventListener("change", () => setEnabled(toggle.checked));
  window.addEventListener("resize", restorePosition);
  window.addEventListener("lumiere:pet-state", (event) => {
    const next = event.detail?.state || "idle";
    const durations = { happy: 4000, error: 5000 };
    setState(next, durations[next] || 0);
    resetSleep();
  });
  ["pointerdown", "keydown"].forEach((name) => document.addEventListener(name, resetSleep, { passive: true }));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    restorePosition();
    resetSleep();
  });
  setEnabled(localStorage.getItem("lumiere-pet-enabled") !== "0");
})();
