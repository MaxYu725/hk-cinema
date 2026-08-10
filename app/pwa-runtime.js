(() => {
  const state = {
    registration: null,
    waitingWorker: null,
    error: null,
    ready: false,
    updateReady: false,
    online: navigator.onLine,
    noticeKind: null,
    reloading: false
  };

  let networkNoticeTimer = null;

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
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state !== "installed") return;
      const waiting = registration.waiting || worker;
      if (navigator.serviceWorker.controller) showUpdate(waiting);
    });
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

      if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration.waiting);
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
    version: "9c3-1",
    register,
    applyUpdate,
    getState() {
      return {
        ready: state.ready,
        error: state.error,
        scope: state.registration?.scope || null,
        updateReady: state.updateReady,
        online: state.online,
        noticeKind: state.noticeKind
      };
    }
  });

  window.addEventListener("offline", () => setOnline(false));
  window.addEventListener("online", () => setOnline(true));

  if (!navigator.onLine) setOnline(false);
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
})();
