(() => {
  const ALLOWED_SKINS = new Set(["classic", "metro"]);
  const root = document.documentElement;
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("skin");
  const fallback = ALLOWED_SKINS.has(root.dataset.skin) ? root.dataset.skin : "classic";
  const initial = ALLOWED_SKINS.has(requested) ? requested : fallback;

  function themeColorFor(skin) {
    return skin === "metro" ? "#000000" : "#17191d";
  }

  function apply(skin) {
    const next = ALLOWED_SKINS.has(skin) ? skin : "classic";
    root.dataset.skin = next;
    root.style.colorScheme = next === "metro" ? "dark" : "light";

    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.setAttribute("content", themeColorFor(next));

    window.dispatchEvent(new CustomEvent("hkcinema:skin-change", {
      detail: { skin: next }
    }));
    return next;
  }

  apply(initial);

  window.HKCinemaSkin = Object.freeze({
    version: "10a1",
    current() {
      return root.dataset.skin || "classic";
    },
    setPreview(skin) {
      const next = apply(skin);
      const url = new URL(window.location.href);
      if (next === "classic") url.searchParams.delete("skin");
      else url.searchParams.set("skin", next);
      window.history.replaceState(window.history.state, "", url);
      return next;
    }
  });
})();
