const $ = (sel) => document.querySelector(sel);

const STORAGE_KEYS = {
  visited: "sfsuTour.visitedStopIds",
  activeTour: "sfsuTour.activeTourId"
};

/* =========
   Theme toggle (light/dark)
   ========= */
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

/* =========
   Visited state
   ========= */
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

/* =========
   Navigation URL (fix multi-options)
   ========= */
function buildStopNavUrl(stop) {
  // 1) If stop.navUrl is provided, use it (best / most precise).
  if (stop && typeof stop.navUrl === "string" && stop.navUrl.trim()) {
    return stop.navUrl.trim();
  }

  // 2) Otherwise use lat/lng (if you add later).
  if (typeof stop.lat === "number" && typeof stop.lng === "number") {
    return `https://www.google.com/maps/search/?api=1&query=${stop.lat},${stop.lng}`;
  }

  // 3) Fallback: address/title search.
  const q = encodeURIComponent(stop.address || stop.title || "San Francisco State University");
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/* =========
   Callouts
   ========= */
function renderCallout(mountSelector, callout) {
  const mount = $(mountSelector);
  if (!mount) return;

  if (!callout) {
    mount.innerHTML = "";
    return;
  }

  const imgs = Array.isArray(callout.images) ? callout.images : [];
  const firstImg = imgs[0];

  // If image exists, put title/text OVER the image.
  const overlay = firstImg
    ? `
      <div class="mediaOverlay">
        <h3 class="mediaOverlay__title">${callout.title || ""}</h3>
        <p class="mediaOverlay__text">${callout.text || ""}</p>
      </div>
    `
    : "";

  mount.innerHTML = `
    <div class="card" style="margin-top:14px;">
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
  renderCallout("#introCallout", data?.pageSections?.introCallout);
}

function renderOutroCallout(data) {
  renderCallout("#outroCallout", data?.pageSections?.outroCallout);
}

/* =========
   Stops rendering
   ========= */
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
          query: $("#searchInput")?.value
        });
      });
    }

    grid.appendChild(node);
  }
}

/* =========
   Online status
   ========= */
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

/* =========
   Data loading
   ========= */
async function loadTourData() {
  const res = await fetch("./stops.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load stops.json");
  return res.json();
}

function getToursFromData(data) {
  if (Array.isArray(data.tours) && data.tours.length) return data.tours;

  if (Array.isArray(data.stops)) {
    return [
      {
        id: "default",
        name: data.tourSubtitle || "Campus Tour",
        description: data.tourDescription || "",
        routeUrl: data.routeUrl || "",
        stops: data.stops
      }
    ];
  }
  return [];
}

function setHeaderFromTour(_data, tour) {
  const metaEl = $("#tourMeta");
  if (metaEl) metaEl.textContent = tour.name || "Self-guided tour";
}

/* =========
   Main
   ========= */
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
    renderOutroCallout(data);

    const tours = getToursFromData(data);
    if (!tours.length) throw new Error("No tours found in stops.json");

    const tourSelect = $("#tourSelect");
    const savedTourId = localStorage.getItem(STORAGE_KEYS.activeTour);
    let activeTour = tours.find((t) => t.id === savedTourId) || tours[0];

    if (tourSelect) {
      tourSelect.innerHTML = "";
      for (const t of tours) {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = t.name || t.id;
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
      setHeaderFromTour(data, tour);

      const routeBtn = $("#openRouteBtn");
      if (routeBtn) {
        routeBtn.href = tour.routeUrl || "https://www.google.com/maps";
        routeBtn.textContent = "Open Full Route in Google Maps";
      }

      renderStops({
        tour,
        visitedSet,
        hideVisited: $("#hideVisitedToggle")?.checked,
        query: $("#searchInput")?.value
      });
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
