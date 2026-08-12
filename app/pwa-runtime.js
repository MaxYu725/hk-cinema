(() => {
  const state = {
    registration: null,
    waitingWorker: null,
    error: null,
    ready: false,
    updateReady: false,
    online: navigator.onLine,
    noticeKind: null,
    reloading: false,
    immersiveAttempted: false,
    immersiveActive: false,
    immersiveError: null
  };

  let networkNoticeTimer = null;
  let immersiveArmed = false;
  const watchedWorkers = new WeakSet();

  function ensureNotice() {
    let notice = document.querySelector("#pwaNotice");
    if (notice) return notice;

    notice = document.createElement("aside");
    notice.id = "pwaNotice";
    notice.className = "pwa-notice";
    notice.hidden = true;
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    notice.innerHTML = `
      <div class="pwa-notice-copy">
        <strong data-pwa-notice-title></strong>
        <span data-pwa-notice-detail></span>
      </div>
      <button type="button" data-pwa-update-action hidden>重新載入</button>
    `;
    document.body.append(notice);

    notice.querySelector("[data-pwa-update-action]")?.addEventListener("click", () => {
      applyUpdate();
    });
    return notice;
  }

  function renderNotice(kind, title, detail, { action = false, autoHide = 0 } = {}) {
    if (state.noticeKind === "offline" && kind !== "offline") return false;

    const notice = ensureNotice();
    clearTimeout(networkNoticeTimer);
    state.noticeKind = kind;
    notice.dataset.kind = kind;
    notice.querySelector("[data-pwa-notice-title]").textContent = title;
    notice.querySelector("[data-pwa-notice-detail]").textContent = detail;
    const button = notice.querySelector("[data-pwa-update-action]");
    if (button) button.hidden = !action;
    notice.hidden = false;

    if (autoHide > 0) {
      networkNoticeTimer = setTimeout(() => {
        if (state.updateReady || !state.online || state.noticeKind !== kind) return;
        state.noticeKind = null;
        notice.hidden = true;
      }, autoHide);
    }
    return true;
  }

  function renderUpdateNotice() {
    if (!state.updateReady || !state.online || !navigator.onLine || state.noticeKind === "offline") return false;
    return renderNotice(
      "update",
      "新版 HK Cinema 已準備好",
      "重新載入後套用新版；目前操作不會被自動中斷。",
      { action: true }
    );
  }

  function showUpdate(worker) {
    if (!worker || !navigator.serviceWorker.controller) return;
    state.waitingWorker = worker;
    state.updateReady = true;
    renderUpdateNotice();
    window.dispatchEvent(new CustomEvent("hkcinema:pwa-update-ready"));
  }

  function watchInstalling(registration) {
    const worker = registration.installing;
    if (!worker || watchedWorkers.has(worker)) return;
    watchedWorkers.add(worker);

    const handleInstalled = () => {
      if (worker.state !== "installed") return;
      const waiting = registration.waiting || worker;
      if (navigator.serviceWorker.controller) showUpdate(waiting);
    };

    worker.addEventListener("statechange", handleInstalled);
    handleInstalled();
  }

  function applyUpdate() {
    const worker = state.waitingWorker || state.registration?.waiting;
    if (!worker) return false;
    state.waitingWorker = worker;
    worker.postMessage({ type: "SKIP_WAITING" });
    return true;
  }

  function onControllerChange() {
    if (!state.updateReady || state.reloading) return;
    state.reloading = true;
    location.reload();
  }

  function setOnline(online) {
    const changed = state.online !== online;
    state.online = online;

    if (!online) {
      renderNotice(
        "offline",
        "目前離線",
        "App 外框仍可使用；電影、場次、票價及座位需恢復網絡後更新。"
      );
      return;
    }

    if (state.noticeKind === "offline") state.noticeKind = null;

    if (state.updateReady) {
      renderUpdateNotice();
      return;
    }

    if (changed) {
      renderNotice("online", "已恢復連線", "最新戲院資料可再次更新。", { autoHide: 2200 });
    }
  }

  function matchesDisplayMode(mode) {
    try {
      return Boolean(window.matchMedia?.(`(display-mode: ${mode})`).matches);
    } catch {
      return false;
    }
  }

  function currentDisplayMode() {
    if (matchesDisplayMode("fullscreen")) return "fullscreen";
    if (matchesDisplayMode("standalone") || navigator.standalone === true) return "standalone";
    if (matchesDisplayMode("minimal-ui")) return "minimal-ui";
    return "browser";
  }

  function canRequestImmersiveFallback() {
    const mode = currentDisplayMode();
    if (mode !== "standalone" && mode !== "minimal-ui") return false;
    if (document.fullscreenElement) return false;
    if (document.fullscreenEnabled === false) return false;
    return typeof document.documentElement?.requestFullscreen === "function";
  }

  function disarmImmersiveFallback() {
    if (!immersiveArmed) return;
    immersiveArmed = false;
    document.removeEventListener("click", handleImmersiveGesture, true);
  }

  async function requestImmersiveMode() {
    if (state.immersiveAttempted || !canRequestImmersiveFallback()) return false;
    state.immersiveAttempted = true;
    state.immersiveError = null;
    disarmImmersiveFallback();

    const root = document.documentElement;
    try {
      await root.requestFullscreen({ navigationUI: "hide" });
    } catch (primaryError) {
      try {
        await root.requestFullscreen();
      } catch (fallbackError) {
        state.immersiveError = fallbackError instanceof Error
          ? fallbackError.message
          : String(fallbackError || primaryError || "Fullscreen request failed");
        state.immersiveActive = false;
        return false;
      }
    }

    state.immersiveActive = Boolean(document.fullscreenElement) || matchesDisplayMode("fullscreen");
    window.dispatchEvent(new CustomEvent("hkcinema:pwa-immersive", {
      detail: { active: state.immersiveActive }
    }));
    return state.immersiveActive;
  }

  function handleImmersiveGesture(event) {
    if (!event.isTrusted || state.immersiveAttempted) return;
    requestImmersiveMode();
  }

  function armImmersiveFallback() {
    state.immersiveActive = Boolean(document.fullscreenElement) || matchesDisplayMode("fullscreen");
    if (state.immersiveActive || state.immersiveAttempted || !canRequestImmersiveFallback()) return false;
    if (immersiveArmed) return true;
    immersiveArmed = true;
    // Fullscreen API requires a user activation. Capture the first normal in-app click
    // only when an installed PWA has fallen back to standalone/minimal-ui presentation.
    document.addEventListener("click", handleImmersiveGesture, true);
    return true;
  }

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

      registration.addEventListener("updatefound", () => watchInstalling(registration));
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

      // register() can resolve after updatefound has already fired. Always inspect the
      // current installing/waiting slots immediately so an in-flight update cannot miss
      // the user-facing reload prompt.
      watchInstalling(registration);
      if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration.waiting);

      // Force a lightweight script revalidation on launch. updateViaCache:none keeps the
      // service-worker script itself fresh without touching cinema/provider data.
      try {
        await registration.update();
      } catch {
        // Registration remains usable even when an explicit update check is offline.
      }

      watchInstalling(registration);
      if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration.waiting);

      armImmersiveFallback();
      window.dispatchEvent(new CustomEvent("hkcinema:pwa-ready", { detail: { scope: registration.scope } }));
      return registration;
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error || "Service Worker registration failed");
      armImmersiveFallback();
      window.dispatchEvent(new CustomEvent("hkcinema:pwa-error", { detail: { message: state.error } }));
      return null;
    }
  }

  document.addEventListener("fullscreenchange", () => {
    state.immersiveActive = Boolean(document.fullscreenElement) || matchesDisplayMode("fullscreen");
  });

  window.HKCinemaPWA = Object.freeze({
    version: "m7g-1",
    register,
    applyUpdate,
    requestImmersiveMode,
    getState() {
      return {
        ready: state.ready,
        error: state.error,
        scope: state.registration?.scope || null,
        updateReady: state.updateReady,
        online: state.online,
        noticeKind: state.noticeKind,
        displayMode: currentDisplayMode(),
        immersiveAttempted: state.immersiveAttempted,
        immersiveActive: state.immersiveActive,
        immersiveError: state.immersiveError
      };
    }
  });

  window.addEventListener("offline", () => setOnline(false));
  window.addEventListener("online", () => setOnline(true));

  armImmersiveFallback();
  if (!navigator.onLine) setOnline(false);

  // The script already runs at the end of <body>. Do not wait for window.load: a slow
  // non-critical asset must not postpone Service Worker recovery/update detection.
  queueMicrotask(register);
})();
