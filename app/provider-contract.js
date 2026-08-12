(() => {
  const registry = window.HKCinemaProviderRegistry;

  const AVAILABILITY = Object.freeze({
    AVAILABLE: "available",
    UNKNOWN: "unknown",
    UNSUPPORTED: "unsupported"
  });

  const SUPPORT = Object.freeze({
    SUPPORTED: "supported",
    UNSUPPORTED: "unsupported",
    UNKNOWN: "unknown"
  });

  const contracts = Object.freeze({
    catalogueEntry: Object.freeze({
      capability: "catalogue",
      required: Object.freeze(["sourceId", "title"]),
      optional: Object.freeze([
        "status",
        "posterUrl",
        "releaseDate",
        "durationMinutes",
        "classification",
        "languages",
        "subtitles",
        "formats",
        "bookingUrl"
      ])
    }),
    movieAggregate: Object.freeze({
      capability: "catalogue",
      required: Object.freeze(["key", "title", "providers"]),
      optional: Object.freeze([
        "posterUrl",
        "releaseDate",
        "durationMinutes",
        "classification",
        "languages",
        "subtitles",
        "formats"
      ])
    }),
    showtime: Object.freeze({
      capability: "showtimes",
      required: Object.freeze(["sourceId", "cinema", "date", "time"]),
      optional: Object.freeze([
        "house",
        "startAt",
        "endAt",
        "formats",
        "languages",
        "subtitles",
        "price",
        "seatSummary",
        "bookingUrl"
      ])
    }),
    price: Object.freeze({
      capability: "prices",
      required: Object.freeze([]),
      optional: Object.freeze([
        "currency",
        "display",
        "adult",
        "student",
        "child",
        "senior",
        "face",
        "lowest",
        "serviceFee",
        "ticketTypes",
        "updatedAt"
      ])
    }),
    seatSummary: Object.freeze({
      capability: "seatSummary",
      required: Object.freeze([]),
      optional: Object.freeze([
        "quality",
        "total",
        "available",
        "held",
        "sold",
        "blocked",
        "unavailable",
        "unknown",
        "accessibleAvailable",
        "occupiedPercent",
        "updatedAt"
      ])
    }),
    seatMap: Object.freeze({
      capability: "seatMap",
      required: Object.freeze([]),
      optional: Object.freeze(["request", "layoutMode", "rows", "areas", "seats"])
    }),
    booking: Object.freeze({
      capability: "booking",
      required: Object.freeze([]),
      optional: Object.freeze(["bookingUrl"])
    })
  });

  function descriptor(providerOrId) {
    if (providerOrId && typeof providerOrId === "object") return providerOrId;
    return registry?.get?.(providerOrId) || null;
  }

  function capabilityState(providerOrId, capability) {
    const provider = descriptor(providerOrId);
    if (!provider || !registry?.capabilityKeys?.includes?.(capability)) return SUPPORT.UNKNOWN;
    if (provider.capabilities?.[capability] === true) return SUPPORT.SUPPORTED;
    if (provider.capabilities?.[capability] === false) return SUPPORT.UNSUPPORTED;
    return SUPPORT.UNKNOWN;
  }

  function hasValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  function optionalCapability(providerOrId, capability, value) {
    const support = capabilityState(providerOrId, capability);
    if (support === SUPPORT.UNSUPPORTED) {
      return Object.freeze({
        support,
        availability: AVAILABILITY.UNSUPPORTED,
        value: null
      });
    }

    if (support === SUPPORT.SUPPORTED && hasValue(value)) {
      return Object.freeze({
        support,
        availability: AVAILABILITY.AVAILABLE,
        value
      });
    }

    return Object.freeze({
      support,
      availability: AVAILABILITY.UNKNOWN,
      value: hasValue(value) ? value : null
    });
  }

  function missingRequired(surface, value = {}) {
    const contract = contracts[surface];
    if (!contract) return Object.freeze([]);
    return Object.freeze(contract.required.filter(field => !hasValue(value?.[field])));
  }

  window.HKCinemaProviderContract = Object.freeze({
    version: "m6c-2",
    support: SUPPORT,
    availability: AVAILABILITY,
    contracts,
    capabilityState,
    optionalCapability,
    missingRequired
  });
})();
