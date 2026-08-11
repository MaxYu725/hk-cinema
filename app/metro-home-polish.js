(() => {
  if (document.documentElement.dataset.skin !== "metro") return;

  const SORTS = ["default", "release", "title"];

  function releaseLabel() {
    return document.querySelector(".tab.active")?.dataset.tab === "coming"
      ? "最快上映"
      : "最新上映";
  }

  function labelFor(value) {
    if (value === "release") return releaseLabel();
    if (value === "title") return "片名";
    return "原有排序";
  }

  function syncCommand() {
    const tools = document.querySelector("#homeLibraryTools");
    const select = tools?.querySelector("[data-home-movie-sort]");
    if (!tools || !select) return;

    let command = tools.querySelector("[data-metro-sort-command]");
    if (!command) {
      command = document.createElement("button");
      command.type = "button";
      command.className = "metro-sort-command";
      command.dataset.metroSortCommand = "true";
      command.setAttribute("aria-label", "切換電影排序");
      tools.querySelector(".home-library-primary")?.append(command);
    }

    const label = labelFor(select.value);
    if (command.dataset.sort === select.value && command.dataset.label === label) return;
    command.innerHTML = `<span>排序</span><strong>${label}</strong>`;
    command.dataset.sort = select.value;
    command.dataset.label = label;
  }

  function cycleSort() {
    const select = document.querySelector("[data-home-movie-sort]");
    if (!select) return;
    const current = SORTS.indexOf(select.value);
    select.value = SORTS[(current + 1) % SORTS.length];
    select.dispatchEvent(new Event("change", { bubbles: true }));
    syncCommand();
  }

  document.addEventListener("click", event => {
    if (!event.target.closest?.("[data-metro-sort-command]")) return;
    event.preventDefault();
    cycleSort();
  });

  document.addEventListener("change", event => {
    if (event.target.matches?.("[data-home-movie-sort]")) syncCommand();
  });

  window.addEventListener("hkcinema:home-tab", () => requestAnimationFrame(syncCommand));
  window.addEventListener("hkcinema:provider-matches", () => requestAnimationFrame(syncCommand));

  syncCommand();
})();