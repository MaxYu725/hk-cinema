(() => {
  let scheduled = false;

  function providerSet() {
    const timeline = document.querySelector("#providerCompareContent .provider-compare-timeline");
    if (!timeline) return new Set();
    const set = new Set();
    timeline.querySelectorAll(".provider-compare-source").forEach(source => {
      if (source.classList.contains("emperor")) set.add("emperor");
      else if (source.classList.contains("mcl")) set.add("mcl");
      else if (source.classList.contains("broadway")) set.add("broadway");
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

  function install() {
    const bodyObserver = new MutationObserver(() => {
      const content = document.querySelector("#providerCompareContent");
      if (!content || content.dataset.providerGuardObserved === "true") {
        schedule();
        return;
      }
      content.dataset.providerGuardObserved = "true";
      const observer = new MutationObserver(schedule);
      observer.observe(content, { childList: true, subtree: true });
      schedule();
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
    schedule();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();