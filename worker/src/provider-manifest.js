function normalizeEntry(entry = {}) {
  const id = String(entry.id || "").trim().toLowerCase();
  if (!id) throw new Error("Worker provider manifest entry requires id");
  return Object.freeze({
    id,
    service: String(entry.service || "registered").trim() || "registered"
  });
}

export function createProviderManifest(entries = []) {
  const normalized = entries.map(normalizeEntry);
  const ids = normalized.map(entry => entry.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Worker provider manifest contains duplicate provider ids");
  }
  return Object.freeze(normalized);
}

export const PROVIDER_MANIFEST = createProviderManifest([
  {
    id: "broadway",
    service: "catalogue-shows-seats"
  },
  {
    id: "mcl",
    service: "ticketing-seats"
  },
  {
    id: "emperor",
    service: "catalogue-shows-seats"
  },
  {
    id: "cineart",
    service: "catalogue-showtimes-production-detail-candidate-readonly"
  }
]);

export const WORKER_PROVIDER_IDS = Object.freeze(PROVIDER_MANIFEST.map(entry => entry.id));

const byId = new Map(PROVIDER_MANIFEST.map(entry => [entry.id, entry]));

export function workerProvider(id) {
  return byId.get(String(id || "").trim().toLowerCase()) || null;
}

export function providerHealthMap(manifest = PROVIDER_MANIFEST) {
  return Object.fromEntries(manifest.map(entry => [entry.id, entry.service]));
}