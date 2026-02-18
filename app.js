const $ = (sel) => document.querySelector(sel);

const STORAGE_KEYS = {
  visited: "sfsuTour.visitedStopIds",
  activeTour: "sfsuTour.activeTourId"
};

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

function buildStopNavUrl(stop) {
  // Prefer lat/lng if present; fallback to address/title query.
  if (typeof stop.lat === "number" && typeof stop.lng === "number") {
    return `https://www.google.com/maps/search/?api=1&query=${stop.lat},${stop.lng}`;
  }
  const q = encodeURIComponent(stop.address || stop.title || "San Francisco State University");
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function renderIntroCallout(data) {
  const mount = $("#introCallout");
  if (!mount) return;

  const c = data?.pageSections?.introCallout;
  if (!c) {
    mount.innerHTML = "";
    return;
  }

  const imgs = Array.isArray(c.images) ? c.images : [];
  const firstImg = imgs[0];

  mount.innerHTML = `
    <div class="card" style="margin: 10px 0 0;">
      <div class="card__media" style="${firstImg ? "" : "display:none;"}">
        ${firstImg ? `<img class="card__img" src="${firstImg}" alt="${c.title || "Safety"}" loading="lazy" />` : ""}
      </div>
      <div class="card__body">
        <h2 class="card__title">${c.title || "Safety"}</h2>
        <p class="card__desc" style="margin-top:10px;">${c.text || ""}</p>
        ${
          c.linkUrl
            ? `<div class="card__actions">
                 <a class="btn btn--secondary" href="${c.linkUrl}" target="_blank" rel="noopener">
                   ${c.linkText || "Learn more"}
                 </a>
               </div>`
            : ""
        }
      </div>
    </div>
  `;
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
          query: $("#searchInput")?.value
        });
      });
    }

    grid.appendChild(node);
  }
}

function setupShare() {
  const btn = $("#shareBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const shareData = {
      title: document.title,
      text: "SFSU Self-Guided Tour",
      url: window.location.href
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setStatus("Link copied to clipboard.");
      }
    } catch {
      // user cancelled or share not available
    }
  });
}

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

async function loadTourData() {
  const res = await fetch("./stops.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load stops.json");
  return res.json();
}

function getToursFromData(data) {
  if (Array.isArray(data.tours) && data.tours.length) return data.tours;

  // Backwards compatible old format
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

function setHeaderFromTour(data, tour) {
  const titleEl = $("#tourTitle");
  const metaEl = $("#tourMeta");
  const descEl = $("#tourDesc");

  if (titleEl) titleEl.textContent = data.appName || data.tourName || "Campus Tour";
  if (metaEl) metaEl.textContent = tour.name || data.tourSubtitle || "Self-guided tour";
  if (descEl) descEl.textContent = tour.description || data.tourDescription || "Explore stops at your own pace.";
}

async function main() {
  setOnlineUI();
  setupShare();

  const reloadBtn = $("#reloadBtn");
  if (reloadBtn) {
    reloadBtn.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.reload();
    });
  }

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

    // Populate dropdown
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

      // Route button
      const routeBtn = $("#openRouteBtn");
      if (routeBtn) {
        routeBtn.href = tour.routeUrl || "https://www.google.com/maps";
        routeBtn.textContent = "Open Full Route in Google Maps";
      }

      // Render stops
      renderStops({
        tour,
        visitedSet,
        hideVisited: $("#hideVisitedToggle")?.checked,
        query: $("#searchInput")?.value
      });
    }

    // Controls
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

  // SW registration (keep for offline caching)
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./service-worker.js");
    } catch (e) {
      console.warn("SW registration failed", e);
    }
  }
}

document.addEventListener("DOMContentLoaded", main);
