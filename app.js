const $ = (sel) => document.querySelector(sel);

const STORAGE_KEYS = {
  visited: "sfsuTour.visitedStopIds",
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
  $("#statusBar").textContent = msg || "";
}

function normalize(str) {
  return (str || "").toString().trim().toLowerCase();
}

function buildStopNavUrl(stop) {
  if (typeof stop.lat === "number" && typeof stop.lng === "number") {
    return `https://www.google.com/maps/search/?api=1&query=${stop.lat},${stop.lng}`;
  }
  const q = encodeURIComponent(stop.address || stop.title || "SFSU");
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function buildMultiStopRouteUrl(stops, travelmode = "walking") {
  const clean = [...stops].filter(Boolean).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  if (clean.length === 0) return "https://www.google.com/maps";
  if (clean.length === 1) return buildStopNavUrl(clean[0]);

  const toPoint = (s) => {
    if (typeof s.lat === "number" && typeof s.lng === "number") return `${s.lat},${s.lng}`;
    return s.address || s.title || "SFSU";
  };

  const origin = encodeURIComponent(toPoint(clean[0]));
  const destination = encodeURIComponent(toPoint(clean[clean.length - 1]));
  const waypointPoints = clean.slice(1, -1).map(toPoint);
  const waypoints = encodeURIComponent(waypointPoints.join("|"));
  const mode = encodeURIComponent(travelmode);

  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${mode}`;
  if (waypointPoints.length) url += `&waypoints=${waypoints}`;
  return url;
}

function renderStops({ data, visitedSet, hideVisited, query }) {
  const grid = $("#stopsGrid");
  grid.innerHTML = "";

  const template = $("#stopCardTemplate");
  const stops = (data.stops || []).slice().sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
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

    img.src = stop.photo || "";
    img.alt = stop.title ? `${stop.title} photo` : "Stop photo";
    img.onerror = () => {
      img.style.display = "none";
      const media = node.querySelector(".card__media");
      media.style.aspectRatio = "auto";
      media.style.padding = "10px";
      media.textContent = "Photo unavailable";
    };

    title.textContent = stop.title || "Tour Stop";
    subtitle.textContent = stop.subtitle || stop.address || "";
    desc.textContent = stop.description || "";

    nav.href = buildStopNavUrl(stop);

    badge.hidden = !isVisited;

    visitedBtn.textContent = isVisited ? "Visited ✓" : "Mark visited";
    visitedBtn.addEventListener("click", () => {
      if (!stop.id) return;
      if (visitedSet.has(stop.id)) visitedSet.delete(stop.id);
      else visitedSet.add(stop.id);

      saveVisitedSet(visitedSet);
      renderStops({
        data,
        visitedSet,
        hideVisited: $("#hideVisitedToggle").checked,
        query: $("#searchInput").value
      });
    });

    grid.appendChild(node);
  }
}

let deferredInstallPrompt = null;

function setupInstallUI() {
  const installBtn = $("#installBtn");

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    installBtn.hidden = false;
  });

  installBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    setStatus(choice?.outcome === "accepted" ? "Installed!" : "Install dismissed.");
    deferredInstallPrompt = null;
    installBtn.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    setStatus("App installed.");
    installBtn.hidden = true;
  });
}

function setupShare() {
  $("#shareBtn").addEventListener("click", async () => {
    const shareData = { title: document.title, text: "SFSU Self-Guided Tour", url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(window.location.href);
        setStatus("Link copied to clipboard.");
      }
    } catch {}
  });
}

function setOnlineUI() {
  const dot = $("#onlineDot");
  const txt = $("#onlineText");
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

async function main() {
  setOnlineUI();
  setupInstallUI();
  setupShare();

  $("#reloadBtn").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.reload();
  });

  const visitedSet = loadVisitedSet();

  try {
    setStatus("Loading stops…");
    const data = await loadTourData();

    $("#tourTitle").textContent = data.tourName || "Campus Tour";
    $("#tourMeta").textContent = data.tourSubtitle || "Self-guided tour";
    $("#tourDesc").textContent = data.tourDescription || "Explore stops at your own pace.";

    const routeBtn = $("#openRouteBtn");
    const computedRoute = buildMultiStopRouteUrl(data.stops || [], "walking");
    routeBtn.href = data.routeUrl && data.routeUrl.startsWith("http") ? data.routeUrl : computedRoute;

    $("#hideVisitedToggle").addEventListener("change", () => {
      renderStops({ data, visitedSet, hideVisited: $("#hideVisitedToggle").checked, query: $("#searchInput").value });
    });

    $("#resetVisitedBtn").addEventListener("click", () => {
      visitedSet.clear();
      saveVisitedSet(visitedSet);
      renderStops({ data, visitedSet, hideVisited: $("#hideVisitedToggle").checked, query: $("#searchInput").value });
      setStatus("Visited status reset.");
    });

    $("#searchInput").addEventListener("input", () => {
      renderStops({ data, visitedSet, hideVisited: $("#hideVisitedToggle").checked, query: $("#searchInput").value });
    });

    renderStops({ data, visitedSet, hideVisited: false, query: "" });
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus("Could not load tour stops. Check stops.json and try reloading.");
  }

  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./service-worker.js"); }
    catch (e) { console.warn("SW registration failed", e); }
  }
}

document.addEventListener("DOMContentLoaded", main);
