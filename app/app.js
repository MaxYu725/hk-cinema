const state = {
  tab: "now",
  movies: []
};

const elements = {
  tabs: document.querySelectorAll(".tab"),
  sectionTitle: document.querySelector("#sectionTitle"),
  movieCount: document.querySelector("#movieCount"),
  movieGrid: document.querySelector("#movieGrid"),
  refreshButton: document.querySelector("#refreshButton")
};

function renderEmptyState() {
  const message =
    state.tab === "now"
      ? {
          title: "電影資料尚未接入",
          text: "下一階段會先接入 Broadway 電影資料。"
        }
      : {
          title: "即將上映資料尚未接入",
          text: "之後會整合各院線的上映日期。"
        };

  elements.movieGrid.innerHTML = `
    <div class="empty-state">
      <strong>${message.title}</strong>
      <span>${message.text}</span>
    </div>
  `;
}

function render() {
  elements.sectionTitle.textContent =
    state.tab === "now"
      ? "現正上映"
      : "即將上映";

  elements.movieCount.textContent =
    `${state.movies.length} 部`;

  if (state.movies.length === 0) {
    renderEmptyState();
    return;
  }
}

function setTab(tab) {
  state.tab = tab;
  state.movies = [];

  elements.tabs.forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.tab === tab
    );
  });

  render();
}

elements.tabs.forEach((button) => {
  button.addEventListener("click", () => {
    setTab(button.dataset.tab);
  });
});

elements.refreshButton.addEventListener(
  "click",
  () => {
    render();
  }
);

render();
