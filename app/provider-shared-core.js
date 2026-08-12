(() => {
  const FALLBACK_PROVIDERS = Object.freeze([
    Object.freeze({ key: "broadway", label: "Broadway", descriptor: null }),
    Object.freeze({ key: "mcl", label: "MCL", descriptor: null }),
    Object.freeze({ key: "emperor", label: "Emperor", descriptor: null })
  ]);

  function registry() {
    return window.HKCinemaProviderRegistry || null;
  }

  function contract() {
    return window.HKCinemaProviderContract || null;
  }

  function providers() {
    const registered = registry()?.providers || [];
    if (!registered.length) return [...FALLBACK_PROVIDERS];
    return registered.map(descriptor => ({
      key: descriptor.id,
      label: descriptor.displayName || descriptor.healthLabel || descriptor.id,
      descriptor
    }));
  }

  function providerIds() {
    return providers().map(provider => provider.key);
  }

  function providerMap(factory = () => null) {
    return Object.fromEntries(providers().map(provider => [
      provider.key,
      factory(provider.key, provider.descriptor)
    ]));
  }

  function descriptor(providerOrId) {
    if (providerOrId && typeof providerOrId === "object") return providerOrId;
    return registry()?.get?.(providerOrId) || null;
  }

  function label(providerOrId) {
    const provider = descriptor(providerOrId);
    if (provider) return provider.displayName || provider.healthLabel || provider.id;
    const id = typeof providerOrId === "string" ? providerOrId.trim() : "";
    return id || "院線";
  }

  function normalizeSourceId(provider, value) {
    return String(value || "").replace(new RegExp(`^${provider}:`), "").trim();
  }

  function aggregateSourceIds(aggregate, provider) {
    return Array.from(new Set((aggregate?.sources?.[provider] || [])
      .map(value => normalizeSourceId(provider, value))
      .filter(Boolean)));
  }

  function activeProvidersForAggregate(aggregate) {
    return providers().filter(provider => aggregateSourceIds(aggregate, provider.key).length > 0);
  }

  function unknownCapability(value = null) {
    return Object.freeze({
      support: "unknown",
      availability: "unknown",
      value: value ?? null
    });
  }

  function optionalCapability(providerOrId, capability, value) {
    return contract()?.optionalCapability?.(providerOrId, capability, value) || unknownCapability(value);
  }

  function showtimeCapabilities(providerOrId, item = {}) {
    const pricePayload = item.pricePayload ?? (
      Number.isFinite(item.price) ? { display: item.price } : null
    );
    const seatPayload = item.seatSummary ?? (
      Number.isFinite(item.seatAvailable) || Number.isFinite(item.seatTotal)
        ? { available: item.seatAvailable, total: item.seatTotal }
        : null
    );
    return Object.freeze({
      price: optionalCapability(providerOrId, "prices", pricePayload),
      seatSummary: optionalCapability(providerOrId, "seatSummary", seatPayload),
      booking: optionalCapability(providerOrId, "booking", item.bookingUrl || null)
    });
  }

  function allProviderLabel(count) {
    if (count === 2) return "兩院線";
    if (count === 3) return "三院線";
    return `${count} 院線`;
  }

  window.HKCinemaProviderSharedCore = Object.freeze({
    version: "m6c-3",
    providers,
    providerIds,
    providerMap,
    descriptor,
    label,
    normalizeSourceId,
    aggregateSourceIds,
    activeProvidersForAggregate,
    optionalCapability,
    showtimeCapabilities,
    allProviderLabel
  });
})();
