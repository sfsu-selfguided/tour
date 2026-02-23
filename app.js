const $ = (sel) => document.querySelector(sel);

const STORAGE_KEYS = {
  visited: "sfsuTour.visitedStopIds",
  activeTour: "sfsuTour.activeTourId"
};

/* =========
   Theme toggle (light/dark) + logo swap
   ========= */
const THEME_KEY = "sfsuTour.theme"; // "light" | "dark" | "system"

function getSystemTheme() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function setLogoForTheme(t) {
  const logo = $("#brandLogo");
  if (!logo) return;

  // Your files are in repo root:
  // - logo-purple.png (light)
  // - logo-white.png  (dark)
  logo.src = t === "dark" ? "logo-white.png" : "logo-purple.png";
}

function applyTheme(theme) {
  const t = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.dataset.theme = t;

  setLogoForTheme(t);

  const btn = $("#themeToggle");
  if (btn) {
    btn.textContent = t === "dark" ? "☀️ Light mode" : "🌙 Dark mode";
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
   Navigation URL (precise links if provided)
   ========= */
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

/* =========
   Callouts + end sections
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

  const overlay = firstImg
    ? `
      <div class="mediaOverlay">
        <h3 class="mediaOverlay__title">${callout.title || ""}</h3>
        <p class="mediaOverlay__text">${callout.text || ""}</p>
      </div>
    `
    : "";

  mount.innerHTML = `
    <div class="card">
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

function renderOutro(data) {
  const out = $("#outroCallout");
  if (!out) return;

  const o = data?.pageSections?.outroCallout;
  if (!o) {
    out.innerHTML = "";
    return;
  }

  const imgs = Array.isArray(o.images) ? o.images : [];
  out.innerHTML = `
    <details class="accordion">
      <summary>${o.title || "Hidden gators"}</summary>
      <div class="accordion__body">
        <p style="margin:0; color:var(--muted); line-height:1.4;">
          ${o.text || ""}
        </p>
        <div class="gatorsRow">
          ${imgs.map((src) => `<img class="gatorThumb" src="${src}" alt="Hidden gator" loading="lazy" />`).join("")}
        </div>
      </div>
    </details>
  `;
}

function renderNextSteps(data) {
  const mount = $("#nextSteps");
  if (!mount) return;

  const s = data?.pageSections?.nextSteps;
  if (!s) {
    mount.innerHTML = "";
    return;
  }

  const links = Array.isArray(s.links) ? s.links : [];
  mount.innerHTML = `
    <details class="accordion">
      <summary>${s.title || "Ready for next steps?"}</summary>
      <div class="accordion__body">
        <p style="margin:0; color:var(--muted); line-height:1.4;">
          ${s.text || ""}
        </p>
        <div class="linkList">
          ${links.map((l) => `
            <div class="linkItem">
              <div>
                <div style="font-weight:900;">${l.label || "Link"}</div>
                ${l.subtext ? `<div style="color:var(--muted); font-size:13px; margin-top:3px;">${l.subtext}</div>` : ""}
              </div>
              <a class="link" href="${l.url}" target="_blank" rel="noopener">Open</a>
            </div>
          `).join("")}
        </div>
      </div>
    </details>
  `;
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
    return [{
      id: "default",
      name: "Without Housing",
      description: data.tourDescription || "",
      routeUrl: data.routeUrl || "",
      stops: data.stops
    }];
  }
  return [];
}

function setHeaderFromTour(data, tour) {
  const titleEl = $("#tourTitle");
  const metaEl = $("#tourMeta");
  if (titleEl) titleEl.textContent = data.appName || "SFSU Self-Guided Campus Tour";
  if (metaEl) metaEl.textContent = `SFSU Self-Guided Campus Tour — ${tour.name || "Tour"}`;
}

function setMapLinkForTour(data, tour) {
  const row = $("#mapLinkRow");
  const a = $("#mapLink");
  if (!row || !a) return;

  // One map for both tours (your preference)
  const url = data?.pageSections?.mapLink?.url;
  if (url) {
    a.href = url;
    a.textContent = data?.pageSections?.mapLink?.label || "View campus map";
    row.hidden = false;
  } else {
    row.hidden = true;
  }
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
    renderOutro(data);
    renderNextSteps(data);

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
      setMapLinkForTour(data, tour);

      const routeBtn = $("#openRouteBtn");
      if (routeBtn) {
        routeBtn.href = tour.routeUrl || "https://www.google.com/maps";
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
