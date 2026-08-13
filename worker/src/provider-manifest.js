const entries = [
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
  }
];

export const PROVIDER_MANIFEST = Object.freeze(entries.map(entry => Object.freeze({ ...entry })));
export const WORKER_PROVIDER_IDS = Object.freeze(PROVIDER_MANIFEST.map(entry => entry.id));

const byId = new Map(PROVIDER_MANIFEST.map(entry => [entry.id, entry]));

export function workerProvider(id) {
  return byId.get(String(id || "").trim().toLowerCase()) || null;
}

export function providerHealthMap() {
  return Object.fromEntries(PROVIDER_MANIFEST.map(entry => [entry.id, entry.service]));
}
