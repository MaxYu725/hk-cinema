(() => {
  const CAPABILITY_KEYS = Object.freeze([
    "catalogue",
    "showtimes",
    "prices",
    "seatSummary",
    "seatMap",
    "booking"
  ]);

  function freezeCapabilities(capabilities = {}) {
    return Object.freeze(Object.fromEntries(
      CAPABILITY_KEYS.map(key => [key, Boolean(capabilities[key])])
    ));
  }

  function descriptor({ id, displayName, healthLabel, capabilities }) {
    return Object.freeze({
      id,
      displayName,
      healthLabel: healthLabel || displayName,
      capabilities: freezeCapabilities(capabilities)
    });
  }

  const providers = Object.freeze([
    descriptor({
      id: "broadway",
      displayName: "Broadway",
      healthLabel: "Broadway",
      capabilities: {
        catalogue: true,
        showtimes: true,
        prices: true,
        seatSummary: true,
        seatMap: true,
        booking: true
      }
    }),
    descriptor({
      id: "mcl",
      displayName: "MCL",
      healthLabel: "MCL",
      capabilities: {
        catalogue: true,
        showtimes: true,
        prices: true,
        seatSummary: true,
        seatMap: true,
        booking: true
      }
    }),
    descriptor({
      id: "emperor",
      displayName: "Emperor",
      healthLabel: "Emperor",
      capabilities: {
        catalogue: true,
        showtimes: true,
        prices: true,
        seatSummary: true,
        seatMap: true,
        booking: true
      }
    }),
    descriptor({
      id: "cineart",
      displayName: "CineArt",
      healthLabel: "CineArt",
      capabilities: {
        catalogue: true,
        showtimes: false,
        prices: false,
        seatSummary: false,
        seatMap: false,
        booking: false
      }
    })
  ]);

  const byId = new Map(providers.map(provider => [provider.id, provider]));

  function get(id) {
    return byId.get(String(id || "").toLowerCase()) || null;
  }

  function hasCapability(id, capability) {
    const provider = get(id);
    return Boolean(provider?.capabilities?.[capability]);
  }

  window.HKCinemaProviderRegistry = Object.freeze({
    version: "m7p1c-1",
    capabilityKeys: CAPABILITY_KEYS,
    providers,
    get,
    hasCapability
  });
})();
