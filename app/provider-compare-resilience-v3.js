(() => {
  let scheduled = false;

  const PROVIDERS = [
    { key: "broadway", label: "Broadway" },
    { key: "mcl", label: "MCL" },
    { key: "emperor", label: "Emperor" }
  ];

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function activeProviders(snapshot) {
    return PROVIDERS.filter(provider => Boolean(snapshot?.match?.[provider.key]));
  }

  function ensurePanel() {
    const sheet = document.querySelector("#providerCompareOverlay .provider-compare-sheet");
    if (!sheet) return null;
    let panel = sheet.querySelector("[data-provider-resilience]");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.className = "provider-compare-resilience";
    panel.dataset.providerResilience = "true";
    panel.setAttribute("aria-live", "polite");
    const content = sheet.querySelector("#providerCompareContent");
    if (content) content.insertAdjacentElement("beforebegin", panel);
    else sheet.appendChild(panel);
    return panel;
  }

  function isLoadingView() {
    return Boolean(document.querySelector("#providerCompareContent .provider-compare-loading"));
  }

  function providerState(snapshot, provider, loading) {
    const error = snapshot?.errors?.[provider] || null;
    const dates = snapshot?.availableDates?.[provider] || [];
    if (error) return { status: "error", label: "暫時失敗", detail: error };
    if (dates.length) {
      const freshness = snapshot?.freshness?.[provider] || {};
      const health = window.HKCinemaDataHealth?.classify?.({
        status: "fresh",
        source: freshness.source || "network",
        updatedAt: freshness.updatedAt
      });
      const age = freshness.updatedAt
        ? window.HKCinemaDataHealth?.formatAge?.(freshness.updatedAt)
        : null;
      if (health?.level === "stale") {
        return { status: "stale", label: "資料過期", detail: `${dates.length} 個可售日期 · ${age || "較早更新"}` };
      }
      if (["aging", "degraded"].includes(health?.level)) {
        return { status: "degraded", label: "較早資料", detail: `${dates.length} 個可售日期 · ${age || "較早更新"}` };
      }
      return { status: "ready", label: age || "正常", detail: `${dates.length} 個可售日期${age ? ` · ${age}更新` : ""}` };
    }
    if (loading) return { status: "loading", label: "更新中", detail: "正在取得可售日期及場次" };
    return { status: "empty", label: "暫無場次", detail: "目前未取得可售日期" };
  }

  function overallState(snapshot, loading, providers) {
    const errors = providers.filter(provider => snapshot?.errors?.[provider.key]);
    const stale = providers.filter(provider => {
      const freshness = snapshot?.freshness?.[provider.key] || {};
      return window.HKCinemaDataHealth?.classify?.({
        status: "fresh",
        source: freshness.source || "network",
        updatedAt: freshness.updatedAt
      })?.level === "stale";
    });
    if (errors.length === providers.length) {
      return {
        status: "error",
        label: "資料暫不可用",
        detail: `${providers.length} 個院線來源目前都未能更新`
      };
    }
    if (errors.length || stale.length) {
      return {
        status: "partial",
        label: errors.length ? "部分資料" : "部分資料已過期",
        detail: errors.length
          ? `目前有 ${providers.length - errors.length}/${providers.length} 個院線資料可用`
          : `${stale.length} 個院線資料超過 2 小時未更新`
      };
    }
    if (loading) {
      return { status: "loading", label: "更新中", detail: "正在更新院線場次" };
    }

    const hasAnyDates = providers.some(provider => (snapshot?.availableDates?.[provider.key] || []).length);
    if (!hasAnyDates) {
      return {
        status: "empty",
        label: "暫無場次",
        detail: `${providers.length} 個院線目前均未有可售日期`
      };
    }

    return {
      status: "ready",
      label: "資料完整",
      detail: `${providers.map(provider => provider.label).join("、")} 均已完成更新`
    };
  }

  function providerHtml(provider, state) {
    const retry = state.status === "error"
      ? `<button type="button" data-provider-recovery-retry="${provider.key}">重試 ${provider.label}</button>`
      : "";
    return `
      <div class="provider-resilience-source ${state.status}">
        <div class="provider-resilience-source-main">
          <strong>${escapeHtml(provider.label)}</strong>
          <span class="provider-resilience-badge">${escapeHtml(state.label)}</span>
        </div>
        <small>${escapeHtml(state.detail)}</small>
        ${retry}
      </div>
    `;
  }

  function providerDot(provider, state) {
    return `<span class="provider-resilience-mini-dot ${escapeHtml(state.status)}" role="img" aria-label="${escapeHtml(`${provider.label}：${state.label}`)}"></span>`;
  }

  function update() {
    scheduled = false;
    const compare = window.HKCinemaProviderCompare;
    const overlay = document.querySelector("#providerCompareOverlay");
    if (!compare?.getState || !overlay) return;

    const snapshot = compare.getState();
    if (!snapshot?.match) return;
    const providers = activeProviders(snapshot);
    if (!providers.length) return;

    const panel = ensurePanel();
    if (!panel) return;
    const loading = isLoadingView();
    const overall = overallState(snapshot, loading, providers);
    const states = Object.fromEntries(
      providers.map(provider => [provider.key, providerState(snapshot, provider.key, loading)])
    );
    const partial = providers.some(provider => {
      if (snapshot.errors?.[provider.key]) return true;
      const freshness = snapshot?.freshness?.[provider.key] || {};
      return window.HKCinemaDataHealth?.classify?.({
        status: "fresh",
        source: freshness.source || "network",
        updatedAt: freshness.updatedAt
      })?.level === "stale";
    });

    overlay.classList.toggle("provider-compare-is-partial", partial);
    overlay.dataset.compareDataState = overall.status;

    const disclosureOpen = Boolean(panel.querySelector(".provider-resilience-disclosure")?.open);
    panel.innerHTML = `
      <details class="provider-resilience-disclosure">
        <summary class="provider-resilience-compact ${escapeHtml(overall.status)}">
          <span class="provider-resilience-overall-dot" aria-hidden="true"></span>
          <strong>${escapeHtml(overall.label)}</strong>
          <span class="provider-resilience-mini-dots">
            ${providers.map(provider => providerDot(provider, states[provider.key])).join("")}
          </span>
          <small>${escapeHtml(overall.detail)}</small>
          <em aria-hidden="true">⌄</em>
        </summary>
        <div class="provider-resilience-detail">
          <div class="provider-resilience-sources provider-count-${providers.length}">
            ${providers.map(provider => providerHtml(provider, states[provider.key])).join("")}
          </div>
          ${partial ? `
            <p class="provider-resilience-partial-note">
              摘要及推薦暫停；時間線仍會使用成功載入的院線資料。
            </p>
          ` : ""}
        </div>
      </details>
    `;
    const disclosure = panel.querySelector(".provider-resilience-disclosure");
    if (disclosure) disclosure.open = disclosureOpen;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  }

  function retryProvider(provider) {
    if (!PROVIDERS.some(entry => entry.key === provider)) return;
    const compare = window.HKCinemaProviderCompare;
    const snapshot = compare?.getState?.();
    const matchId = snapshot?.match?.id;
    if (!matchId) return;
    window.HKCinemaProviderCompareMainCache?.clearProvider?.(provider);
    compare.open(matchId);
  }

  document.addEventListener("click", event => {
    const button = event.target.closest?.("[data-provider-recovery-retry]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    retryProvider(button.dataset.providerRecoveryRetry);
  }, true);

  function install() {
    const bodyObserver = new MutationObserver(() => {
      const content = document.querySelector("#providerCompareContent");
      if (!content || content.dataset.resilienceObservedV3 === "true") return;

      content.dataset.resilienceObservedV3 = "true";
      const contentObserver = new MutationObserver(records => {
        const relevant = records.some(record => {
          const target = record.target?.nodeType === Node.ELEMENT_NODE
            ? record.target
            : record.target?.parentElement;
          return !target?.closest?.("[data-provider-resilience]");
        });
        if (relevant) schedule();
      });
      contentObserver.observe(content, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["hidden"]
      });
      schedule();
    });

    bodyObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("hkcinema:provider-compare-lifecycle", schedule);
    schedule();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
