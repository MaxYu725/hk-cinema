(() => {
  const PROVIDERS = [
    { key: "broadway", label: "Broadway" },
    { key: "mcl", label: "MCL" },
    { key: "emperor", label: "Emperor" }
  ];
  const FRESH_MAX_AGE_MS = 15 * 60 * 1000;
  const AGING_MAX_AGE_MS = 2 * 60 * 60 * 1000;

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

  function ensurePanel() {
    let panel = document.querySelector("#dataHealth");
    if (panel) return panel;
    const broadwayStatus = document.querySelector("#systemStatus");
    if (!broadwayStatus) return null;
    panel = document.createElement("section");
    panel.id = "dataHealth";
    panel.className = "data-health";
    panel.setAttribute("aria-live", "polite");
    broadwayStatus.insertAdjacentElement("beforebegin", panel);
    return panel;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function render() {
    if (typeof document === "undefined") return;
    const panel = ensurePanel();
    if (!panel) return;
    const summary = summarize();
    panel.dataset.status = summary.level;
    panel.innerHTML = `
      <div class="data-health-heading">
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
            </div>
          </div>
        `).join("")}
      </div>
    `;
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
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", render, { once: true });
    } else {
      render();
    }
  }
})();
