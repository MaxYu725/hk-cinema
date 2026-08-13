(() => {
  let scheduled = false;
  const sharedCore = window.HKCinemaProviderSharedCore || null;

  function providerSet() {
    const timeline = document.querySelector("#providerCompareContent .provider-compare-timeline");
    if (!timeline) return new Set();
    const set = new Set();
    timeline.querySelectorAll(".provider-compare-source").forEach(source => {
      const provider = sharedCore?.providerFromNode?.(source) ||
        sharedCore?.registeredProviderId?.(source.closest?.("[data-provider]")?.dataset?.provider);
      if (provider) set.add(provider);
    });
    return set;
  }

  function sync() {
    scheduled = false;
    const content = document.querySelector("#providerCompareContent");
    if (!content) return;
    const providers = providerSet();
    if (!providers.size) return;

    content.querySelectorAll("[data-insight-provider]").forEach(button => {
      const value = button.dataset.insightProvider || "all";
      button.hidden = value !== "all" && !providers.has(value);
    });

    const filters = window.HKCinemaProviderCompareFilters;
    const current = filters?.getState?.()?.provider || "all";
    if (current !== "all" && !providers.has(current)) {
      content.querySelector('[data-insight-provider="all"]')?.click();
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  }

  function relevantMutation(record) {
    const target = record.target?.nodeType === Node.ELEMENT_NODE
      ? record.target
      : record.target?.parentElement;
    return Boolean(
      target?.closest?.("#providerCompareContent") ||
      Array.from(record.addedNodes || []).some(node => (
        node?.nodeType === Node.ELEMENT_NODE &&
        (node.matches?.("#providerCompareOverlay, #providerCompareContent") ||
          node.querySelector?.("#providerCompareContent"))
      ))
    );
  }

  function install() {
    const observer = new MutationObserver(records => {
      if (records.some(relevantMutation)) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("hkcinema:provider-compare-open", schedule);
    window.addEventListener("hkcinema:provider-compare-lifecycle", schedule);
    schedule();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
