(() => {
  const providerIds = () => (window.HKCinemaProviderRegistry?.providers || [])
    .map(provider => String(provider?.id || "").trim().toLowerCase())
    .filter(Boolean);
  const records = new Map(providerIds().map(provider => [provider, {
    provider,
    catalogue: null,
    status: "loading",
    source: "network",
    updatedAt: null,
    error: null,
    meta: {},
    revision: 0
  }]));
  let revision = 0;

  function registeredProviderId(value) {
    const id = String(value || "").trim().toLowerCase();
    return window.HKCinemaProviderRegistry?.get?.(id)?.id || null;
  }

  function validCatalogue(value) {
    return Boolean(value && typeof value === "object" && ["now", "coming", "festival"].some(
      section => Array.isArray(value?.[section])
    ));
  }

  function current(providerOrId) {
    const provider = registeredProviderId(
      typeof providerOrId === "object" ? providerOrId?.id : providerOrId
    );
    return provider ? records.get(provider) || null : null;
  }

  function emit(provider, type) {
    if (typeof window?.dispatchEvent !== "function" || typeof CustomEvent !== "function") return;
    const record = current(provider);
    window.dispatchEvent(new CustomEvent("hkcinema:catalogue-store", {
      detail: { provider, type, revision, record }
    }));
  }

  function publish(providerOrId, catalogue, meta = {}) {
    const provider = registeredProviderId(
      typeof providerOrId === "object" ? providerOrId?.id : providerOrId
    );
    if (!provider || !validCatalogue(catalogue)) return false;

    const previous = records.get(provider) || { provider };
    revision += 1;
    records.set(provider, {
      ...previous,
      provider,
      catalogue,
      status: catalogue.meta?.partial || catalogue.meta?.stale ? "degraded" : "ready",
      source: catalogue.meta?.cache ? "cache" : previous.source || "network",
      updatedAt: catalogue.meta?.updatedAt || catalogue.meta?.cacheSavedAt || previous.updatedAt || null,
      error: null,
      meta: { ...(previous.meta || {}), ...meta },
      revision
    });
    emit(provider, "publish");

    if (typeof window?.dispatchEvent === "function" && typeof CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent("hkcinema:provider-catalogue", {
        detail: { provider, catalogue, meta: { ...meta }, revision }
      }));
    }
    return true;
  }

  function report(providerOrId, next = {}) {
    const provider = registeredProviderId(
      typeof providerOrId === "object" ? providerOrId?.id : providerOrId
    );
    if (!provider) return false;
    const previous = records.get(provider) || { provider, catalogue: null, meta: {} };
    const status = next.status || previous.status || "loading";
    revision += 1;
    records.set(provider, {
      ...previous,
      status,
      source: next.source || previous.source || "network",
      updatedAt: next.updatedAt ?? previous.updatedAt ?? null,
      error: next.error ?? (status === "error" ? next.detail || "Catalogue unavailable" : null),
      meta: { ...(previous.meta || {}), ...(next.meta || {}) },
      revision
    });
    emit(provider, "status");
    return true;
  }

  function catalogue(providerOrId) {
    return current(providerOrId)?.catalogue || null;
  }

  function catalogueMap() {
    return Object.fromEntries(providerIds().map(provider => [provider, catalogue(provider)]));
  }

  function all() {
    return providerIds().map(provider => current(provider));
  }

  function sectionState(providerOrId, section) {
    const record = current(providerOrId);
    const value = record?.catalogue;
    const movies = Array.isArray(value?.[section]) ? value[section] : [];
    const error = value?.meta?.errors?.[section] || null;
    const fallback = Boolean(value?.meta?.fallbackSections?.[section]);
    const usable = Boolean(value) && (!error || fallback);
    return {
      provider: record?.provider || registeredProviderId(providerOrId),
      section,
      movies: usable ? movies : [],
      usable,
      failed: (!usable && record?.status === "error") || (Boolean(error) && !fallback),
      loading: !usable && record?.status !== "error",
      fallback,
      error,
      record
    };
  }

  function entries(section) {
    return providerIds().flatMap(provider => {
      const state = sectionState(provider, section);
      return state.movies.map((movie, index) => ({ provider, movie, index, state }));
    });
  }

  function summary(section) {
    const states = providerIds().map(provider => sectionState(provider, section));
    return {
      section,
      total: states.length,
      usable: states.filter(state => state.usable).length,
      failed: states.filter(state => state.failed).length,
      loading: states.filter(state => state.loading).length,
      fallback: states.filter(state => state.fallback).length,
      states
    };
  }

  window.HKCinemaCatalogueStore = Object.freeze({
    version: "c3-1",
    publish,
    report,
    current,
    all,
    catalogue,
    catalogueMap,
    sectionState,
    entries,
    summary,
    validCatalogue
  });
})();
