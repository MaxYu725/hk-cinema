(() => {
  let observer = null;
  let scheduled = false;

  function closeMenus(except = null) {
    document
      .querySelectorAll("[data-cinema-menu]")
      .forEach(menu => {
        if (menu === except) return;
        const panel = menu.querySelector("[data-cinema-menu-panel]");
        const trigger = menu.querySelector("[data-cinema-menu-trigger]");
        if (panel) panel.hidden = true;
        if (trigger) trigger.setAttribute("aria-expanded", "false");
      });
  }

  function buildMenu(select) {
    if (!select || select.dataset.customCinemaMenu === "1") return;

    const nativeControl = select.closest(".provider-compare-cinema-control");
    if (!nativeControl) return;

    select.dataset.customCinemaMenu = "1";

    const options = Array.from(select.options);
    const selected = options.find(option => option.selected) || options[0];

    const menu = document.createElement("div");
    menu.className = "provider-compare-cinema-menu";
    menu.dataset.cinemaMenu = "true";

    const label = document.createElement("span");
    label.className = "provider-compare-cinema-menu-label";
    label.textContent = "戲院";

    const control = document.createElement("div");
    control.className = "provider-compare-cinema-menu-control";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "provider-compare-cinema-menu-trigger";
    trigger.dataset.cinemaMenuTrigger = "true";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");

    const triggerText = document.createElement("span");
    triggerText.textContent = selected?.textContent?.trim() || "全部戲院";

    const arrow = document.createElement("span");
    arrow.className = "provider-compare-cinema-menu-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "⌄";

    trigger.append(triggerText, arrow);

    const panel = document.createElement("div");
    panel.className = "provider-compare-cinema-menu-panel";
    panel.dataset.cinemaMenuPanel = "true";
    panel.setAttribute("role", "listbox");
    panel.hidden = true;

    for (const option of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "provider-compare-cinema-menu-option";
      button.dataset.cinemaMenuValue = option.value;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", option.selected ? "true" : "false");
      button.textContent = option.textContent?.trim() || option.value;

      if (option.selected) {
        button.classList.add("active");
      }

      panel.appendChild(button);
    }

    control.append(trigger, panel);
    menu.append(label, control);

    nativeControl.classList.add("provider-compare-native-cinema-hidden");
    nativeControl.insertAdjacentElement("afterend", menu);

    trigger.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      const willOpen = panel.hidden;
      closeMenus(menu);
      panel.hidden = !willOpen;
      trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");

      if (willOpen) {
        panel.querySelector(".active")?.scrollIntoView({
          block: "nearest"
        });
      }
    });

    panel.addEventListener("click", event => {
      const optionButton = event.target.closest("[data-cinema-menu-value]");
      if (!optionButton) return;

      event.preventDefault();
      event.stopPropagation();

      const value = optionButton.dataset.cinemaMenuValue || "all";
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function enhance() {
    scheduled = false;
    document
      .querySelectorAll("select[data-insight-cinema]")
      .forEach(buildMenu);
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  function install() {
    enhance();

    observer = new MutationObserver(() => {
      scheduleEnhance();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  document.addEventListener("click", event => {
    if (!event.target.closest("[data-cinema-menu]")) {
      closeMenus();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeMenus();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
