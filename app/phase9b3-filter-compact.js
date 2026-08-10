(() => {
  let activeGroup = null;
  let scheduled = false;
  let applying = false;

  function hongKongDate() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Hong_Kong",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }

  function markToday(root) {
    const today = hongKongDate();
    root.querySelectorAll("[data-provider-compare-date]").forEach(button => {
      const isToday = button.dataset.providerCompareDate === today;
      if (isToday) {
        button.dataset.phase9b3Today = "true";
        const existing = button.getAttribute("aria-label") || button.textContent?.trim() || "";
        if (!existing.startsWith("今日")) button.setAttribute("aria-label", `今日 ${existing}`.trim());
      } else {
        delete button.dataset.phase9b3Today;
      }
    });
  }

  function groupKey(group, index) {
    if (group.matches(".provider-compare-cinema-control")) return "cinema";
    if (group.dataset.metadataFilter) return group.dataset.metadataFilter;
    if (group.classList.contains("phase8c-district-control")) return "district";
    if (group.classList.contains("phase8c-price-control")) return "price";
    if (group.classList.contains("phase8c-seat-control")) return "seats";
    if (group.querySelector("[data-insight-provider]")) return "provider";
    if (group.querySelector("[data-insight-region]")) return "region";
    if (group.querySelector("[data-insight-period]")) return "period";
    if (group.querySelector("[data-insight-sort]")) return "sort";
    return `group-${index}`;
  }

  function groupLabel(group) {
    return Array.from(group.children).find(child => child.tagName === "SPAN")?.textContent?.trim() || "篩選";
  }

  function selectedLabel(container) {
    if (!container) return "全部";
    if (container.closest?.(".provider-compare-cinema-control")) {
      return container.querySelector("select option:checked")?.textContent?.trim() || "全部戲院";
    }
    return container.querySelector("button.active")?.textContent?.trim() || "全部";
  }

  function buildSummary(group, key) {
    const summary = document.createElement("button");
    summary.type = "button";
    summary.className = "phase9b3-filter-group-summary";
    summary.dataset.phase9b3GroupToggle = key;
    summary.setAttribute("aria-expanded", String(activeGroup === key));
    summary.innerHTML = `
      <span class="phase9b3-filter-group-label"></span>
      <strong class="phase9b3-filter-group-value"></strong>
      <em aria-hidden="true">⌄</em>
    `;
    summary.querySelector(".phase9b3-filter-group-label").textContent = groupLabel(group);
    return summary;
  }

  function syncGroup(group) {
    const key = group.dataset.phase9b3Group;
    const open = activeGroup === key;
    group.classList.toggle("phase9b3-open", open);
    const summary = group.querySelector(":scope > .phase9b3-filter-group-summary");
    const body = group.querySelector(":scope > .phase9b3-filter-group-body");
    if (summary) {
      summary.setAttribute("aria-expanded", String(open));
      const value = summary.querySelector(".phase9b3-filter-group-value");
      if (value) value.textContent = selectedLabel(body);
    }
    if (body) body.hidden = !open;
  }

  function decorateGroup(group, index) {
    if (group.dataset.phase9b3Compact === "true") return;
    const key = groupKey(group, index);
    group.dataset.phase9b3Compact = "true";
    group.dataset.phase9b3Group = key;

    const summary = buildSummary(group, key);
    const body = document.createElement("div");
    body.className = "phase9b3-filter-group-body";
    body.dataset.phase9b3GroupBody = key;
    while (group.firstChild) body.appendChild(group.firstChild);
    group.append(summary, body);
    syncGroup(group);
  }

  function decorateFilters(root) {
    const controls = root.querySelector(".phase8c-controls");
    if (!controls || controls.hidden) return;
    const groups = Array.from(controls.children).filter(element => (
      element.matches?.(".provider-compare-control-group, .provider-compare-cinema-control")
    ));
    groups.forEach(decorateGroup);
    groups.forEach(syncGroup);
    controls.dataset.phase9b3Compact = "true";
  }

  function apply() {
    scheduled = false;
    if (applying) return;
    const root = document.querySelector("#providerCompareContent");
    if (!root) return;
    applying = true;
    try {
      markToday(root);
      decorateFilters(root);
    } finally {
      applying = false;
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(apply);
  }

  function handleClick(event) {
    const summary = event.target.closest?.("[data-phase9b3-group-toggle]");
    if (!summary) return;
    event.preventDefault();
    event.stopPropagation();
    const key = summary.dataset.phase9b3GroupToggle;
    activeGroup = activeGroup === key ? null : key;
    document.querySelectorAll("[data-phase9b3-group]").forEach(syncGroup);
  }

  function resetComparison() {
    activeGroup = null;
    schedule();
  }

  function install() {
    document.addEventListener("click", handleClick, true);
    window.addEventListener("hkcinema:provider-compare-open", resetComparison);
    window.addEventListener("hkcinema:provider-compare-lifecycle", schedule);

    const observer = new MutationObserver(records => {
      if (applying) return;
      const relevant = records.some(record => {
        const target = record.target?.nodeType === Node.ELEMENT_NODE
          ? record.target
          : record.target?.parentElement;
        return Boolean(target?.closest?.("#providerCompareContent"));
      });
      if (relevant) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();
  }

  window.HKCinemaPhase9B3FilterUX = Object.freeze({
    version: "9b3-date-filter1",
    refresh: schedule,
    hongKongDate,
    getState() { return { activeGroup }; }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
