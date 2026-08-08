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
    if (dates.length) return { status: "ready", label: "正常", detail: `${dates.length} 個可售日期` };
    if (loading) return { status: "loading", label: "更新中", detail: "正在取得可售日期及場次" };
    return { status: "empty", label: "暫無場次", detail: "目前未取得可售日期" };
  }

  function overallState(snapshot, loading, providers) {
    const errors = providers.filter(provider => snapshot?.errors?.[provider.key]);
    if (errors.length === providers.length) {
      return {
        status: "error",
        label: "資料暫不可用",
        detail: `${providers.length} 個院線來源目前都未能更新`
      };
    }
    if (errors.length) {
      return {
        status: "partial",
        label: "部分資料",
        detail: `目前有 ${providers.length - errors.length}/${providers.length} 個院線資料可用`
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
    const partial = providers.some(provider => Boolean(snapshot.errors?.[provider.key]));

    overlay.classList.toggle("provider-compare-is-partial", partial);
    overlay.dataset.compareDataState = overall.status;

    panel.innerHTML = `
      <div class="provider-resilience-heading">
        <div>
          <span>DATA STATUS</span>
          <strong>${escapeHtml(overall.label)}</strong>
        </div>
        <small>${escapeHtml(overall.detail)}</small>
      </div>
      <div class="provider-resilience-sources provider-count-${providers.length}">
        ${providers.map(provider => providerHtml(provider, states[provider.key])).join("")}
      </div>
      ${partial ? `
        <p class="provider-resilience-partial-note">
          全院線摘要及 Smart Picks 已暫停；時間線及篩選仍可使用目前成功載入的院線資料。
        </p>
      ` : ""}
    `;
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
      if (!content || content.dataset.resilienceObservedV3 === "true") {
        schedule();
        return;
      }
      content.dataset.resilienceObservedV3 = "true";
      const contentObserver = new MutationObserver(schedule);
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