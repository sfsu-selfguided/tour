const $ = (sel) => document.querySelector(sel);

const STORAGE_KEYS = {
  visited: "sfsuTour.visitedStopIds",
  activeTour: "sfsuTour.activeTourId",
};

const THEME_KEY = "sfsuTour.theme";

function getSystemTheme() {
  return window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
function renderThanksBlurb(data) {
  const mount = $("#hiddenGators");
  if (!mount) return;

  const tb = data?.pageSections?.thanksBlurb;
  if (!tb) return;

  // Append under the gators card
  const card = mount.querySelector(".card");
  if (!card) return;

  const body = card.querySelector(".card__body");
  if (!body) return;

  body.insertAdjacentHTML(
    "beforeend",
    `
      <p class="gators__thanksTitle">${tb.title || ""}</p>
      <p class="gators__thanksText">${tb.text || ""}</p>
    `
  );
}

function applyTheme(theme) {
  const t = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.dataset.theme = t;

  const btn = $("#themeToggle");
  if (btn) {
    btn.textContent = t === "dark" ? "🌙 Dark mode" : "☀️ Light mode";
    btn.setAttribute("aria-label", `Theme: ${t}. Tap to toggle.`);
  }

  const logo = $("#brandLogo");
  if (logo) logo.src = t === "dark" ? "logo-white.png" : "logo-purple.png";
}

function setupThemeToggle() {
  const saved = localStorage.getItem(THEME_KEY) || "system";
  applyTheme(saved);

  const btn = $("#themeToggle");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const current =
      document.documentElement.dataset.theme || getSystemTheme();
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
}

function loadVisitedSet() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.visited);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveVisitedSet(set) {
  localStorage.setItem(
    STORAGE_KEYS.visited,
    JSON.stringify([...set])
  );
}

function setStatus(msg) {
  const el = $("#statusBar");
  if (el) el.textContent = msg || "";
}

function normalize(str) {
  return (str || "").toString().trim().toLowerCase();
}

/* Navigation URL */
function buildStopNavUrl(stop) {
  if (stop?.navUrl) return stop.navUrl;
  const q = encodeURIComponent(
    stop.address || stop.title || "San Francisco State University"
  );
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/* Hidden Gators */
function renderHiddenGators(data) {
  const mount = $("#hiddenGators");
  if (!mount) return;

  const g = data?.pageSections?.hiddenGators;
  if (!g) {
    mount.innerHTML = "";
    return;
  }

  const thumbs = (g.images || [])
    .slice(0, 3)
    .map(
      (src) =>
        `<div class="gators__thumb"><img src="${src}" alt="Hidden gator" loading="lazy" /></div>`
    )
    .join("");

  mount.innerHTML = `
    <div class="card">
      <div class="card__body gators">
        <h2 class="gators__title">${g.title || "Hidden gators"}</h2>
        <p class="gators__text">${g.text || ""}</p>
        <div class="gators__strip">${thumbs}</div>
      </div>
    </div>
  `;
}

/* Next Steps */
function renderNextSteps(data) {
  const mount = $("#nextSteps");
  if (!mount) return;

  const ns = data?.pageSections?.nextSteps;
  if (!ns) {
    mount.innerHTML = "";
    return;
  }

  const items = (ns.links || [])
    .map(
      (l) =>
        `<a class="linkItem" href="${l.url}" target="_blank" rel="noopener">${l.text}</a>`
    )
    .join("");

  mount.innerHTML = `
    <div class="card nextStepsCard">
      <div class="card__body">
        <button class="accordion__btn" id="nextStepsBtn" type="button">
          <span>${ns.title || "Ready for next steps?"}</span>
          <span>▾</span>
        </button>
        <div class="accordion__panel" id="nextStepsPanel">
          ${items}
        </div>
      </div>
    </div>
  `;

  const btn = $("#nextStepsBtn");
  const panel = $("#nextStepsPanel");
  if (btn && panel) {
    btn.addEventListener("click", () => {
      const open = panel.style.display === "block";
      panel.style.display = open ? "none" : "block";
    });
  }
}

/* Stops */
function renderStops({ tour, visitedSet, hideVisited, query }) {
  const grid = $("#stopsGrid");
  const template = $("#stopCardTemplate");
  if (!grid || !template) return;

  grid.innerHTML = "";

  const stops = (tour.stops || []).slice().sort(
    (a, b) => (a.order ?? 999) - (b.order ?? 999)
  );

  const q = normalize(query);

  const filtered = stops.filter((s) => {
    if (hideVisited && visitedSet.has(s.id)) return false;
    if (!q) return true;
    return normalize(
      [s.title, s.subtitle, s.description, s.address].join(" ")
    ).includes(q);
  });

  for (const stop of filtered) {
    const node = template.content.cloneNode(true);

    node.querySelector(".card__img").src = stop.photo || "";
    node.querySelector(".card__title").textContent =
      stop.title || "";
    node.querySelector(".card__subtitle").textContent =
      stop.subtitle || stop.address || "";
    node.querySelector(".card__desc").textContent =
      stop.description || "";
    node.querySelector(".card__nav").href =
      buildStopNavUrl(stop);

    const visitedBtn = node.querySelector(".card__visitedBtn");
    const isVisited = visitedSet.has(stop.id);
    visitedBtn.textContent = isVisited
      ? "Visited ✓"
      : "Mark visited";

    visitedBtn.addEventListener("click", () => {
      if (visitedSet.has(stop.id))
        visitedSet.delete(stop.id);
      else visitedSet.add(stop.id);

      saveVisitedSet(visitedSet);
      renderStops({
        tour,
        visitedSet,
        hideVisited,
        query,
      });
    });

    grid.appendChild(node);
  }
}

/* Data Load */
async function loadTourData() {
  const res = await fetch("./stops.json", {
    cache: "no-store",
  });
  if (!res.ok)
    throw new Error("Could not load stops.json");
  return res.json();
}

function getToursFromData(data) {
  return data.tours || [];
}

function setHeaderFromTour(tour) {
  const metaEl = $("#tourMeta");
  if (metaEl)
    metaEl.textContent = tour.name || "";
}

/* Main */
async function main() {
  setupThemeToggle();

  const visitedSet = loadVisitedSet();

  try {
    const data = await loadTourData();
    const tours = getToursFromData(data);
    const tourSelect = $("#tourSelect");

   const savedTourId = localStorage.getItem(STORAGE_KEYS.activeTour);
let activeTour = tours.find((t) => t.id === savedTourId) || tours[0];

function getTourLabel(t) {
  const id = (t?.id || "").toLowerCase();

  // ✅ exact ids only (no substring guessing)
  if (id === "with-housing") return "With Housing";
  if (id === "without-housing") return "Without Housing";

  // fallback (just in case)
  return t?.name || t?.id || "Tour";
}

if (tourSelect) {
  tourSelect.innerHTML = "";

  for (const t of tours) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = getTourLabel(t);
    if (t.id === activeTour.id) opt.selected = true;
    tourSelect.appendChild(opt);
  }

  tourSelect.addEventListener("change", () => {
    const next = tours.find((t) => t.id === tourSelect.value) || tours[0];
    activeTour = next;
    localStorage.setItem(STORAGE_KEYS.activeTour, activeTour.id);
    updateForTour(activeTour);
  });
}

    function updateForTour(tour) {
      setHeaderFromTour(tour);

      renderStops({
        tour,
        visitedSet,
        hideVisited:
          $("#hideVisitedToggle")?.checked,
        query: $("#searchInput")?.value,
      });

      renderHiddenGators(data);
      renderNextSteps(data);

      const mapWrap = $("#mapLinkWrap");
      const mapLink = $("#campusMapLink");
      if (mapWrap && mapLink) {
        mapLink.href = "assets/maps/campus-map.pdf";
        mapWrap.hidden = false;
      }
    }

    updateForTour(activeTour);
  } catch (err) {
    console.error(err);
    setStatus(
      "Could not load tour content. Check stops.json."
    );
  }
}

document.addEventListener("DOMContentLoaded", main);
