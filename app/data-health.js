(() => {
  const PROVIDERS = [
    { key: "broadway", label: "Broadway" },
    { key: "mcl", label: "MCL" },
    { key: "emperor", label: "Emperor" }
  ];
  const FRESH_MAX_AGE_MS = 15 * 60 * 1000;
  const AGING_MAX_AGE_MS = 2 * 60 * 60 * 1000;
  const REFRESH_BUSY_MAX_MS = 35 * 1000;
  const OPEN_PREFERENCE_KEY = "hkcinema:data-health-open:v3";

  const state = {
    online: typeof navigator === "undefined" || navigator.onLine !== false,
    records: Object.fromEntries(PROVIDERS.map(provider => [
      provider.key,
      {
        status: "loading",
        source: "network",
        updatedAt: null,
        detail: "正在連接"
      }
    ]))
  };
  let refreshWasLoading = true;
  let refreshCompleteTimer = null;
  let refreshHoldUntil = 0;
  let refreshHoldTimer = null;
  let refreshCycleStartedAt = Date.now();
  let refreshSafetyTimer = null;

  function timestamp(value) {
    if (value instanceof Date) return value.getTime();
    if (Number.isFinite(value)) return value;
    if (!value) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function ageMs(updatedAt, now = Date.now()) {
    const value = timestamp(updatedAt);
    if (!Number.isFinite(value)) return null;
    return Math.max(0, now - value);
  }

  function formatAge(updatedAt, now = Date.now()) {
    const age = ageMs(updatedAt, now);
    if (!Number.isFinite(age)) return "尚未更新";
    const minutes = Math.floor(age / 60000);
    if (minutes < 1) return "剛剛";
    if (minutes < 60) return `${minutes} 分鐘前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小時前`;
    return `${Math.floor(hours / 24)} 日前`;
  }

  function classify(record = {}, now = Date.now()) {
    const age = ageMs(record.updatedAt, now);
    if (record.status === "error" && !Number.isFinite(age)) {
      return { level: "error", label: "暫時失效", age };
    }
    if (!Number.isFinite(age)) {
      if (record.status === "error") {
        return { level: "error", label: "暫時失效", age };
      }
      return { level: "loading", label: "連接中", age };
    }
    if (age > AGING_MAX_AGE_MS) {
      return { level: "stale", label: "資料過期", age };
    }
    if (record.status === "degraded" || record.status === "error" || record.source === "cache") {
      return { level: "degraded", label: "備用資料", age };
    }
    if (record.status === "loading") {
      return { level: "degraded", label: "更新中", age };
    }
    if (age > FRESH_MAX_AGE_MS) {
      return { level: "aging", label: "較早資料", age };
    }
    return { level: "fresh", label: "最新", age };
  }

  function summarize(records = state.records, options = {}) {
    const now = options.now ?? Date.now();
    const online = options.online ?? state.online;
    const values = PROVIDERS.map(provider => ({
      provider,
      record: records[provider.key] || {},
      health: classify(records[provider.key] || {}, now)
    }));
    const usable = values.filter(item => Number.isFinite(item.health.age)).length;
    const errors = values.filter(item => item.health.level === "error").length;
    const stale = values.filter(item => item.health.level === "stale").length;
    const degraded = values.filter(item => ["aging", "degraded"].includes(item.health.level)).length;
    const loading = values.filter(item => item.health.level === "loading").length;

    if (!online) {
      return {
        level: usable ? "degraded" : "error",
        label: "離線模式",
        detail: usable ? `顯示已儲存資料 · ${usable}/${values.length} 個來源可用` : "重新連線後會自動更新",
        usable,
        total: values.length,
        values
      };
    }
    if (errors === values.length) {
      return { level: "error", label: "資料暫不可用", detail: "三個院線來源目前均未能更新", usable, total: values.length, values };
    }
    if (errors || stale || degraded) {
      return {
        level: "degraded",
        label: errors ? "部分資料可用" : stale ? "部分資料已過期" : "使用備用資料",
        detail: `${usable}/${values.length} 個來源有可用資料`,
        usable,
        total: values.length,
        values
      };
    }
    if (loading) {
      return { level: "loading", label: "正在更新", detail: `${usable}/${values.length} 個來源已載入`, usable, total: values.length, values };
    }
    return { level: "fresh", label: "三院線資料最新", detail: `${values.length}/${values.length} 個來源已完成更新`, usable, total: values.length, values };
  }

  function ensurePanel(defaultOpen = false) {
    let panel = document.querySelector("#dataHealth");
    if (panel) return panel;
    const topbarActions = document.querySelector("#topbarActions");
    const broadwayStatus = document.querySelector("#systemStatus");
    if (!topbarActions && !broadwayStatus) return null;
    panel = document.createElement("details");
    panel.id = "dataHealth";
    panel.className = "data-health";
    panel.setAttribute("aria-live", "polite");
    try {
      const preference = localStorage.getItem(OPEN_PREFERENCE_KEY);
      panel.open = preference === null ? defaultOpen : preference === "open";
    } catch {
      panel.open = defaultOpen;
    }
    panel.addEventListener("toggle", () => {
      try {
        localStorage.setItem(OPEN_PREFERENCE_KEY, panel.open ? "open" : "closed");
      } catch {
        // Storage can be unavailable in restricted/private contexts.
      }
    });
    if (topbarActions) {
      topbarActions.insertBefore(panel, document.querySelector("#refreshButton"));
    } else {
      broadwayStatus.insertAdjacentElement("beforebegin", panel);
    }
    document.body.classList.add("has-data-health");
    document.addEventListener("click", event => {
      if (panel.open && !panel.contains(event.target)) panel.open = false;
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && panel.open) panel.open = false;
    });
    return panel;
  }

  function compactLabel(level) {
    if (level === "fresh") return "資料正常";
    if (level === "loading") return "更新中";
    if (level === "error") return "資料離線";
    return "部分異常";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function syncRefreshButton() {
    const button = document.querySelector("#refreshButton");
    if (!button) return;
    const records = Object.values(state.records);
    const rawLoading = records.some(record => record.status === "loading");
    const loading = (
      rawLoading && Date.now() - refreshCycleStartedAt < REFRESH_BUSY_MAX_MS
    ) || Date.now() < refreshHoldUntil;
    const completed = records.every(record => record.updatedAt || record.status === "error");
    button.disabled = loading;
    button.classList.toggle("is-loading", loading);
    button.setAttribute("aria-busy", String(loading));
    button.setAttribute("aria-label", loading ? "正在更新三院線資料" : "重新整理三院線資料");
    button.title = loading ? "正在更新" : "重新整理";

    if (refreshWasLoading && !loading && completed) {
      button.classList.add("is-complete");
      clearTimeout(refreshCompleteTimer);
      refreshCompleteTimer = setTimeout(() => button.classList.remove("is-complete"), 1400);
    }
    refreshWasLoading = loading;
  }

  function render() {
    if (typeof document === "undefined") return;
    const summary = summarize();
    const panel = ensurePanel(false);
    if (!panel) return;
    panel.dataset.status = summary.level;
    panel.innerHTML = `
      <summary class="data-health-heading">
        <div class="data-health-lights" aria-label="三院線資料狀態">
          ${summary.values.map(({ provider, health }) => `
            <span
              class="data-health-light ${escapeHtml(health.level)}"
              role="img"
              aria-label="${escapeHtml(provider.label)}：${escapeHtml(health.label)}"
              title="${escapeHtml(provider.label)}：${escapeHtml(health.label)}"
            ></span>
          `).join("")}
        </div>
        <span class="data-health-compact">
          <strong>${escapeHtml(compactLabel(summary.level))}</strong>
          <small>${summary.usable}/${summary.total}</small>
        </span>
        <span class="data-health-chevron" aria-hidden="true"></span>
      </summary>
      <div class="data-health-body">
        <div class="data-health-body-heading">
          <div>
            <span>資料狀態</span>
            <strong>${escapeHtml(summary.label)}</strong>
          </div>
          <small>${escapeHtml(summary.detail)}</small>
        </div>
        <div class="data-health-sources">
          ${summary.values.map(({ provider, record, health }) => `
            <div class="data-health-source ${escapeHtml(health.level)}" data-data-health-provider="${provider.key}">
              <span class="data-health-source-dot" aria-hidden="true"></span>
              <div>
                <strong>${escapeHtml(provider.label)}</strong>
                <small>${escapeHtml(health.label)}${Number.isFinite(health.age) ? ` · ${escapeHtml(formatAge(record.updatedAt))}` : ""}</small>
                ${record.detail ? `<span class="data-health-source-detail">${escapeHtml(record.detail)}</span>` : ""}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
    syncRefreshButton();
  }

  function report(provider, next = {}) {
    if (!PROVIDERS.some(item => item.key === provider)) return;
    state.records[provider] = {
      ...state.records[provider],
      ...next
    };
    render();
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("hkcinema:data-health", {
        detail: { provider, record: { ...state.records[provider] }, summary: summarize() }
      }));
    }
  }

  function setOnline(online) {
    state.online = Boolean(online);
    render();
  }

  const api = {
    report,
    render,
    classify,
    summarize,
    formatAge,
    setOnline,
    constants: { FRESH_MAX_AGE_MS, AGING_MAX_AGE_MS },
    getState() {
      return {
        online: state.online,
        records: Object.fromEntries(Object.entries(state.records).map(([key, value]) => [key, { ...value }]))
      };
    }
  };

  if (typeof window !== "undefined") {
    window.HKCinemaDataHealth = api;
    window.addEventListener("online", () => setOnline(true));
    window.addEventListener("offline", () => setOnline(false));
    window.setInterval(render, 60000);
  }

  if (typeof document !== "undefined") {
    if (typeof setTimeout === "function") {
      refreshSafetyTimer = setTimeout(syncRefreshButton, REFRESH_BUSY_MAX_MS + 50);
    }
    document.addEventListener("click", event => {
      if (!event.target.closest?.("#refreshButton")) return;
      refreshCycleStartedAt = Date.now();
      refreshHoldUntil = Date.now() + 700;
      clearTimeout(refreshHoldTimer);
      clearTimeout(refreshSafetyTimer);
      refreshHoldTimer = setTimeout(syncRefreshButton, 710);
      refreshSafetyTimer = setTimeout(syncRefreshButton, REFRESH_BUSY_MAX_MS + 50);
      syncRefreshButton();
    });
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", render, { once: true });
    } else {
      render();
    }
  }
})();
