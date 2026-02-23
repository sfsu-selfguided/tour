const $ = (sel) => document.querySelector(sel);

const STORAGE_KEYS = {
  visited: "sfsuTour.visitedStopIds",
  activeTour: "sfsuTour.activeTourId",
};

const THEME_KEY = "sfsuTour.theme"; // "light" | "dark" | "system"

function getSystemTheme() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
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
    const current = document.documentElement.dataset.theme || getSystemTheme();
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });

  if (saved === "system" && window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      const now = localStorage.getItem(THEME_KEY) || "system";
      if (now === "system") applyTheme("system");
    });
  }
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
  localStorage.setItem(STORAGE_KEYS.visited, JSON.stringify([...set]));
}

function setStatus(msg) {
  const el = $("#statusBar");
  if (el) el.textContent = msg || "";
}

function normalize(str) {
  return (str || "").toString().trim().toLowerCase();
}

/* Navigation URL: prefer stop.navUrl */
function buildStopNavUrl(stop) {
  if (stop && typeof stop.navUrl === "string" && stop.navUrl.trim()) {
    return stop.navUrl.trim();
  }
  if (typeof stop.lat === "number" && typeof stop.lng === "number") {
    return `https://www.google.com/maps/search/?api=1&query=${stop.lat},${stop.lng}`;
  }
  const q = encodeURIComponent(stop.address || stop.title || "San Francisco State University");
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/* Callout renderer */
function renderCallout(mountSelector, callout, { calloutStyleClass = "" } = {}) {
  const mount = $(mountSelector);
  if (!mount) return;

  if (!callout) {
    mount.innerHTML = "";
    return;
  }

  const imgs = Array.isArray(callout.images) ? callout.images : [];
  const firstImg = imgs[0];

  const overlay = firstImg
    ? `
      <div class="mediaOverlay">
        <h3 class="mediaOverlay__title">${callout.title || ""}</h3>
        <p class="mediaOverlay__text">${callout.text || ""}</p>
      </div>
    `
    : "";

  mount.innerHTML = `
    <div class="card ${calloutStyleClass}">
      <div class="card__media" style="${firstImg ? "" : "display:none;"}">
        ${firstImg ? `<img class="card__img" src="${firstImg}" alt="${callout.title || "Callout"}" loading="lazy" />` : ""}
        ${overlay}
      </div>
      <div class="card__body" style="${firstImg ? "padding-top:12px;" : ""}">
        ${firstImg ? "" : `<h2 class="card__title">${callout.title || ""}</h2>`}
        ${firstImg ? "" : `<p class="card__desc" style="margin-top:10px;">${callout.text || ""}</p>`}
        ${
          callout.linkUrl
            ? `<div class="card__actions">
                 <a class="btn btn--secondary" href="${callout.linkUrl}" target="_blank" rel="noopener">
                   ${callout.linkText || "Learn more"}
                 </a>
               </div>`
            : ""
        }
      </div>
    </div>
  `;
}

function renderIntroCallout(data) {
  renderCallout("#introCallout", data?.pageSections?.introCallout, { calloutStyleClass: "card--callout" });
}

/* Hidden gators (small thumbnails) */
function renderHiddenGators(data) {
  const mount = $("#hiddenGators");
  if (!mount) return;

  const g = data?.pageSections?.hiddenGators;
  if (!g) {
    mount.innerHTML = "";
    return;
  }

  const imgs = Array.isArray(g.images) ? g.images : [];
  const thumbs = imgs
    .slice(0, 3)
    .map((src) => `<div class="gators__thumb"><img src="${src}" alt="Hidden gator" loading="lazy" /></div>`)
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

/* Next steps accordion at end */
function renderNextSteps(data) {
  const mount = $("#nextSteps");
  if (!mount) return;

  const ns = data?.pageSections?.nextSteps;
  if (!ns) {
    mount.innerHTML = "";
    return;
  }

  const links = Array.isArray(ns.links) ? ns.links : [];

  const items = links
    .map(
      (l) => `
      <a class="linkItem" href="${l.url}" target="_blank" rel="noopener">
        ${l.text}
      </a>`
    )
    .join("");

  mount.innerHTML = `
    <div class="card nextStepsCard">
      <div class="card__body">
        <button class="accordion__btn" id="nextStepsBtn" type="button" aria-expanded="false">
          <span>${ns.title || "Ready for next steps?"}</span>
          <span aria-hidden="true">▾</span>
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
      const isOpen = panel.style.display === "block";
      panel.style.display = isOpen ? "none" : "block";
      btn.setAttribute("aria-expanded", isOpen ? "false" : "true");
    });
  }
}

function renderStops({ tour, visitedSet, hideVisited, query }) {
  const grid = $("#stopsGrid");
  const template = $("#stopCardTemplate");
  if (!grid || !template) return;

  grid.innerHTML = "";

  const stops = (tour.stops || []).slice().sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const q = normalize(query);

  const filtered = stops.filter((s) => {
    const isVisited = visitedSet.has(s.id);
    if (hideVisited && isVisited) return false;
    if (!q) return true;
    const hay = normalize([s.title, s.subtitle, s.description, s.address].join(" "));
    return hay.includes(q);
  });

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "card";
    empty.innerHTML = `
      <div class="card__body">
        <h2 class="card__title">No stops found</h2>
        <p class="card__desc">Try a different search, or disable “Hide visited”.</p>
      </div>
    `;
    grid.appendChild(empty);
    return;
  }

  for (const stop of filtered) {
    const node = template.content.cloneNode(true);

    const img = node.querySelector(".card__img");
    const badge = node.querySelector(".card__badge");
    const title = node.querySelector(".card__title");
    const subtitle = node.querySelector(".card__subtitle");
    const desc = node.querySelector(".card__desc");
    const nav = node.querySelector(".card__nav");
    const visitedBtn = node.querySelector(".card__visitedBtn");

    const isVisited = visitedSet.has(stop.id);

    if (img) {
      img.src = stop.photo || "";
      img.alt = stop.title ? `${stop.title} photo` : "Stop photo";
      img.onerror = () => {
        img.style.display = "none";
        const media = node.querySelector(".card__media");
        if (media) {
          media.style.aspectRatio = "auto";
          media.style.padding = "10px";
          media.textContent = "Photo unavailable";
        }
      };
    }

    if (title) title.textContent = stop.title || "Tour Stop";
    if (subtitle) subtitle.textContent = stop.subtitle || stop.address || "";
    if (desc) desc.textContent = stop.description || "";

    if (nav) nav.href = buildStopNavUrl(stop);

    if (badge) badge.hidden = !isVisited;

    if (visitedBtn) {
      visitedBtn.textContent = isVisited ? "Visited ✓" : "Mark visited";
      visitedBtn.addEventListener("click", () => {
        if (!stop.id) return;
        if (visitedSet.has(stop.id)) visitedSet.delete(stop.id);
        else visitedSet.add(stop.id);

        saveVisitedSet(visitedSet);
        renderStops({
          tour,
          visitedSet,
          hideVisited: $("#hideVisitedToggle")?.checked,
          query: $("#searchInput")?.value,
        });
      });
    }

    grid.appendChild(node);
  }
}

/* Online status */
function setOnlineUI() {
  const dot = $("#onlineDot");
  const txt = $("#onlineText");
  if (!dot || !txt) return;

  const online = navigator.onLine;
  dot.style.background = online ? "#39d98a" : "#ff6b6b";
  txt.textContent = online ? "Online" : "Offline (showing cached content if available)";
}
window.addEventListener("online", setOnlineUI);
window.addEventListener("offline", setOnlineUI);

/* Data load */
async function loadTourData() {
  const res = await fetch("./stops.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load stops.json");
  return res.json();
}
function getToursFromData(data) {
  if (Array.isArray(data.tours) && data.tours.length) return data.tours;
  if (Array.isArray(data.stops)) {
    return [{
      id: "default",
      name: data.tourSubtitle || "Campus Tour",
      description: data.tourDescription || "",
      routeUrl: data.routeUrl || "",
      stops: data.stops
    }];
  }
  return [];
}

function setHeaderFromTour(tour) {
  const metaEl = $("#tourMeta");
  if (metaEl) metaEl.textContent = tour.name || "Self-guided tour";
}

async function main() {
  setupThemeToggle();
  setOnlineUI();

  $("#reloadBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.location.reload();
  });

  const visitedSet = loadVisitedSet();

  try {
    setStatus("Loading…");
    const data = await loadTourData();

    renderIntroCallout(data);

    const tours = getToursFromData(data);
    if (!tours.length) throw new Error("No tours found in stops.json");

    const tourSelect = $("#tourSelect");
    const savedTourId = localStorage.getItem(STORAGE_KEYS.activeTour);
    let activeTour = tours.find((t) => t.id === savedTourId) || tours[0];

    // Populate dropdown with the names you want
    if (tourSelect) {
      tourSelect.innerHTML = "";
      for (const t of tours) {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = t.id === "full" ? "With Housing" : "Without Housing";
        if (t.id === activeTour.id) opt.selected = true;
        tourSelect.appendChild(opt);
      }

      tourSelect.addEventListener("change", () => {
        const id = tourSelect.value;
        const next = tours.find((t) => t.id === id) || tours[0];
        activeTour = next;
        localStorage.setItem(STORAGE_KEYS.activeTour, activeTour.id);
        updateForTour(activeTour);
      });
    }

    function updateForTour(tour) {
      setHeaderFromTour(tour);

      // Map link directly under tour type
      const mapWrap = $("#mapLinkWrap");
      const mapLink = $("#campusMapLink");
      if (mapWrap && mapLink) {
        // Use your plain map (one version for both tours)
        mapLink.href = "assets/maps/campus-map.pdf";
        mapWrap.hidden = false;
      }

      // Render stops
      renderStops({
        tour,
        visitedSet,
        hideVisited: $("#hideVisitedToggle")?.checked,
        query: $("#searchInput")?.value,
      });

      // End-of-tour sections (always after stops)
      renderHiddenGators(data);
      renderNextSteps(data);
    }

    $("#hideVisitedToggle")?.addEventListener("change", () => updateForTour(activeTour));

    $("#resetVisitedBtn")?.addEventListener("click", () => {
      visitedSet.clear();
      saveVisitedSet(visitedSet);
      updateForTour(activeTour);
      setStatus("Visited status reset.");
    });

    $("#searchInput")?.addEventListener("input", () => updateForTour(activeTour));

    updateForTour(activeTour);
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus("Could not load tour content. Check stops.json and reload.");
  }

  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./service-worker.js");
    } catch (e) {
      console.warn("SW registration failed", e);
    }
  }
}

document.addEventListener("DOMContentLoaded", main);
