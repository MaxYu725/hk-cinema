(() => {
  const state = { registration: null, error: null, ready: false };

  async function register() {
    if (!("serviceWorker" in navigator)) return null;
    if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return null;

    try {
      const registration = await navigator.serviceWorker.register("./sw.js", {
        scope: "./",
        updateViaCache: "none"
      });
      state.registration = registration;
      state.error = null;
      state.ready = true;
      registration.update().catch(() => {});
      window.dispatchEvent(new CustomEvent("hkcinema:pwa-ready", { detail: { scope: registration.scope } }));
      return registration;
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error || "Service Worker registration failed");
      window.dispatchEvent(new CustomEvent("hkcinema:pwa-error", { detail: { message: state.error } }));
      return null;
    }
  }

  window.HKCinemaPWA = Object.freeze({
    version: "9c1-1",
    register,
    getState() {
      return {
        ready: state.ready,
        error: state.error,
        scope: state.registration?.scope || null
      };
    }
  });

  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
})();
