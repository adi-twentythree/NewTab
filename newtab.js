let activeIndex = null;
let pendingIcon = null;
let isContextMenuOpen = false;
let contextMenuMode = "link"; // "link" | "tool"
let activeToolId = null;

let contextMenu;
let editModal, editName, editUrl, editColor, editTextColor;
let editIconInput, editIconPreview;
let saveEditBtn, cancelEditBtn;

let editToolModal, editToolName, editToolUrl;
let saveToolEditBtn, cancelToolEditBtn;

const LINKS_CONTAINER_ID = "links";

/* ─── Search engine state ─────────────────────────────────────────────────── */

let currentEngine = "google";

const SEARCH_ENGINES = {
    google:     q => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    duckduckgo: q => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
    bing:       q => `https://www.bing.com/search?q=${encodeURIComponent(q)}`
};

/* ─── UTILITIES ──────────────────────────────────────────────────────────── */

function ensureIds(links) {
    let changed = false;
    links.forEach(link => {
        if (!link.id) { link.id = crypto.randomUUID(); changed = true; }
    });
    if (changed) chrome.storage.sync.set({ links });
    return links;
}

// FIX #4 — auto-prepend https:// if missing
function ensureHttps(url) {
    if (!url) return url;
    if (!/^https?:\/\//i.test(url)) return "https://" + url;
    return url;
}

function getPositions(container) {
    const map = new Map();
    [...container.children].forEach(el =>
        map.set(el.dataset.id, el.getBoundingClientRect())
    );
    return map;
}

function animateReorder(container, oldPos) {
    [...container.children].forEach(el => {
        const old = oldPos.get(el.dataset.id);
        if (!old) return;
        const newPos = el.getBoundingClientRect();
        const dx = old.left - newPos.left;
        const dy = old.top  - newPos.top;
        if (dx || dy) {
            el.style.transform  = `translate(${dx}px, ${dy}px)`;
            el.style.transition = "none";
            requestAnimationFrame(() => {
                el.style.transform  = "";
                el.style.transition = "transform 220ms ease";
            });
        }
    });
}

/* ─── FIX #5: Greeting — re-evaluated every minute ──────────────────────── */

function initGreeting() {
    const el = document.getElementById("greeting");
    if (!el) return;
    const h    = new Date().getHours();
    const part = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
    const text = `Good ${part} ✦`;
    if (el.textContent !== text) {
        el.textContent = text;
        if (!el.classList.contains("visible")) {
            requestAnimationFrame(() => el.classList.add("visible"));
        }
    }
}

/* ─── Clock with date ────────────────────────────────────────────────────── */

function updateClock() {
    const clockEl = document.getElementById("clock");
    if (!clockEl) return;
    const now  = new Date();
    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const date = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

    const timeEl = clockEl.querySelector(".clock-time");
    const dateEl = clockEl.querySelector(".clock-date");
    if (timeEl) timeEl.textContent = time;
    if (dateEl) dateEl.textContent = date;
    clockEl.classList.add("visible");
}

/* ─── WEATHER ────────────────────────────────────────────────────────────── */

async function getApiKey() {
    return new Promise(resolve => {
        chrome.storage.sync.get(["weatherApiKey"], res => {
            resolve(res.weatherApiKey || null);
        });
    });
}

// FIX #2 — called on load AND on 30-min interval
async function loadWeather() {
    const apiKey = await getApiKey();
    const widget = document.getElementById("weather-widget");

    if (!apiKey) { widget?.style.setProperty("display", "none"); return; }
    if (!navigator.geolocation) { widget?.style.setProperty("display", "none"); return; }

    navigator.geolocation.getCurrentPosition(
        async pos => {
            const { latitude: lat, longitude: lon } = pos.coords;
            try {
                const weatherRes = await fetch(
                    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`
                );
                const weather = await weatherRes.json();
                if (weather.cod && weather.cod !== 200) {
                    widget?.style.setProperty("display", "none");
                    return;
                }

                const forecastRes = await fetch(
                    `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&cnt=8&units=metric&appid=${apiKey}`
                );
                const forecast = await forecastRes.json();

                const uviRes  = await fetch(
                    `https://api.openweathermap.org/data/2.5/uvi?lat=${lat}&lon=${lon}&appid=${apiKey}`
                );
                const uviData = await uviRes.json();

                document.getElementById("weather-location").textContent  = weather.name;
                document.getElementById("weather-temp").textContent      = Math.round(weather.main.temp);
                document.getElementById("weather-condition").textContent = weather.weather[0].main;

                if (forecast?.list?.length) {
                    const temps = forecast.list.map(f => f.main.temp);
                    document.getElementById("weather-high-low").textContent =
                        `H:${Math.round(Math.max(...temps))}° L:${Math.round(Math.min(...temps))}°`;
                    const pop = Math.round((forecast.list[0].pop || 0) * 100);
                    document.getElementById("weather-rain").textContent = `${pop}%`;
                }

                document.getElementById("weather-wind").textContent     = `${Math.round(weather.wind.speed * 3.6)} km/h`;
                document.getElementById("weather-humidity").textContent = `${weather.main.humidity}%`;

                const uvi      = Math.round(uviData.value ?? 0);
                const uviLabel = uvi <= 2 ? "Low" : uvi <= 5 ? "Moderate" : uvi <= 7 ? "High" : uvi <= 10 ? "Very High" : "Extreme";
                document.getElementById("weather-uv").textContent       = uvi;
                document.getElementById("weather-uv-label").textContent = uviLabel;

                widget?.classList.add("visible");
            } catch (err) {
                console.warn("Weather fetch failed:", err);
                widget?.style.setProperty("display", "none");
            }
        },
        () => document.getElementById("weather-widget")?.style.setProperty("display", "none")
    );
}

/* ─── FIX #1: Quick tools — dynamic, loaded from storage ────────────────── */

const defaultQuickTools = [
    { id: crypto.randomUUID(), name: "ChatGPT",   url: "https://chat.openai.com" },
    { id: crypto.randomUUID(), name: "Gemini",    url: "https://gemini.google.com" },
    { id: crypto.randomUUID(), name: "itch jams", url: "https://itch.io/jams/" },
    { id: crypto.randomUUID(), name: "I❤️PDF",    url: "https://www.ilovepdf.com/" },
    { id: crypto.randomUUID(), name: "RSI",       url: "https://robertsspaceindustries.com/en/" },
];

function loadQuickTools() {
    chrome.storage.sync.get(["quickTools"], result => {
        const tools     = result.quickTools || defaultQuickTools;
        const container = document.getElementById("quick-tools");
        if (!container) return;
        container.innerHTML = "";

        tools.forEach(tool => {
            const a     = document.createElement("a");
            a.className = "tool-item";
            a.href      = tool.url;
            a.target    = "_blank";
            a.rel       = "noopener noreferrer";

            // FIX #9 — favicon fade-in on quick tools
            const img            = document.createElement("img");
            img.alt              = tool.name;
            img.style.opacity    = "0";
            img.style.transition = "opacity 0.3s ease";
            const reveal = () => { img.style.opacity = "1"; };
            img.addEventListener("load",  reveal);
            img.addEventListener("error", reveal);
            try {
                img.src = `https://www.google.com/s2/favicons?domain=${new URL(tool.url).hostname}&sz=32`;
            } catch {
                img.src = ""; reveal();
            }

            const span       = document.createElement("span");
            span.textContent = tool.name;
            a.append(img, span);
            container.appendChild(a);

            // Right-click context menu on quick tools
            a.addEventListener("contextmenu", e => {
                e.preventDefault();
                contextMenuMode = "tool";
                activeToolId    = tool.id;
                const x = Math.min(e.clientX, window.innerWidth  - 180);
                const y = Math.min(e.clientY, window.innerHeight - 120);
                contextMenu.style.left    = `${x}px`;
                contextMenu.style.top     = `${y}px`;
                contextMenu.style.display = "flex";
                isContextMenuOpen = true;
            });
        });
    });
}

/* ─── FIX #11: Adaptive grid columns ────────────────────────────────────── */

function updateGridCols(count) {
    const container = document.getElementById(LINKS_CONTAINER_ID);
    if (!container) return;
    const cols = count > 0 ? Math.min(count, 4) : 4;
    container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
}

/* ─── CUSTOM BACKGROUND (IndexedDB) ─────────────────────────────────────── */

function openBgDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open("newtab_bg_db", 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore("bg");
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = () => reject(req.error);
    });
}

async function loadCustomBackground() {
    try {
        const db   = await openBgDB();
        const file = await new Promise((resolve, reject) => {
            const tx  = db.transaction("bg", "readonly");
            const req = tx.objectStore("bg").get("custom_bg");
            req.onsuccess = () => resolve(req.result || null);
            req.onerror   = () => reject(req.error);
        });
        if (!file) return;
        const url     = URL.createObjectURL(file);
        const videoEl = document.getElementById("bg-video");
        const isVideo = file.type?.startsWith("video");
        if (videoEl._customUrl) URL.revokeObjectURL(videoEl._customUrl);
        videoEl._customUrl = url;
        if (isVideo) {
            videoEl.style.display = "block";
            while (videoEl.firstChild) videoEl.removeChild(videoEl.firstChild);
            videoEl.src = url;
            videoEl.load();
            document.body.style.backgroundImage = "";
        } else {
            videoEl.style.display = "none";
            document.body.style.backgroundImage    = `url(${url})`;
            document.body.style.backgroundSize     = "cover";
            document.body.style.backgroundPosition = "center";
            document.body.style.backgroundRepeat   = "no-repeat";
        }
    } catch (err) {
        console.warn("Custom background load failed:", err);
    }
}

function clearCustomBackground() {
    const videoEl = document.getElementById("bg-video");
    if (videoEl._customUrl) { URL.revokeObjectURL(videoEl._customUrl); videoEl._customUrl = null; }
    videoEl.removeAttribute("src");
    while (videoEl.firstChild) videoEl.removeChild(videoEl.firstChild);
    const source = document.createElement("source");
    source.src  = "assets/video.mp4";
    source.type = "video/mp4";
    videoEl.appendChild(source);
    videoEl.style.display = "block";
    videoEl.load();
    document.body.style.backgroundImage    = "";
    document.body.style.backgroundSize     = "";
    document.body.style.backgroundPosition = "";
    document.body.style.backgroundRepeat   = "";
}

/* ─── DEFAULT DATA ───────────────────────────────────────────────────────── */

const defaultLinks = [
    { id: crypto.randomUUID(), name: "YouTube",  url: "https://youtube.com",     color: "#ff0000", textColor: "#ffffff" },
    { id: crypto.randomUUID(), name: "GitHub",   url: "https://github.com",      color: "#24292e", textColor: "#ffffff" },
    { id: crypto.randomUUID(), name: "Gmail",    url: "https://mail.google.com", color: "#ffffff", textColor: "#111111" },
    { id: crypto.randomUUID(), name: "LinkedIn", url: "https://linkedin.com",    color: "#0a66c2", textColor: "#ffffff" }
];

/* ─── LOAD FAVORITES ─────────────────────────────────────────────────────── */

function loadLinks(afterRender) {
    chrome.storage.sync.get(["links"], result => {
        const links     = ensureIds(result.links || defaultLinks);
        const container = document.getElementById(LINKS_CONTAINER_ID);
        container.innerHTML = "";

        updateGridCols(links.length); // FIX #11

        if (links.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            empty.innerHTML = `
                <span class="empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                    </svg>
                </span>
                <span class="empty-text">No favorites yet</span>
                <span class="empty-sub">Add one via Settings</span>
            `;
            container.appendChild(empty);
            if (typeof afterRender === "function") afterRender(container);
            return;
        }

        let dragIndex = null;

        links.forEach((link, index) => {
            const card      = document.createElement("a");
            card.className  = "favorite-card";
            card.href       = link.url;
            card.draggable  = true;
            card.dataset.id = link.id;

            if (link.color)     card.style.background = link.color;
            if (link.textColor) card.style.color      = link.textColor;

            const img     = document.createElement("img");
            const iconKey = `icon_${link.id}`;
            img.style.opacity    = "0";
            img.style.transition = "opacity 0.3s ease";
            const revealImg = () => { img.style.opacity = "1"; };
            img.addEventListener("load",  revealImg);
            img.addEventListener("error", revealImg);
            chrome.storage.local.get([iconKey], res => {
                img.src = res[iconKey]
                    || `https://www.google.com/s2/favicons?domain=${new URL(link.url).hostname}&sz=64`;
            });

            const title       = document.createElement("span");
            title.textContent = link.name;
            card.append(img, title);
            container.appendChild(card);

            card.addEventListener("contextmenu", e => {
                e.preventDefault();
                contextMenuMode = "link";
                activeIndex = link.id;
                const x = Math.min(e.clientX, window.innerWidth  - 180);
                const y = Math.min(e.clientY, window.innerHeight - 120);
                contextMenu.style.left    = `${x}px`;
                contextMenu.style.top     = `${y}px`;
                contextMenu.style.display = "flex";
                isContextMenuOpen = true;
            });

            card.addEventListener("dragstart", () => { dragIndex = index; card.classList.add("dragging"); });
            card.addEventListener("dragend",   () => { card.classList.remove("dragging"); dragIndex = null; });
            card.addEventListener("dragover",  e => { e.preventDefault(); card.classList.add("drag-over"); });
            card.addEventListener("dragleave", () => { card.classList.remove("drag-over"); });
            card.addEventListener("drop", e => {
                e.preventDefault();
                card.classList.remove("drag-over");
                if (dragIndex === null || dragIndex === index) return;
                const oldPos  = getPositions(container);
                const updated = [...links];
                const [moved] = updated.splice(dragIndex, 1);
                updated.splice(index, 0, moved);
                chrome.storage.sync.set({ links: updated }, () => {
                    activeIndex = null;
                    pendingAnimateOldPos = oldPos;
                });
            });
        });

        if (typeof afterRender === "function") afterRender(container);
    });
}

/* ─── PENDING ANIMATE STATE ──────────────────────────────────────────────── */

let pendingAnimateOldPos = null;

/* ─── LIVE STORAGE SYNC ──────────────────────────────────────────────────── */

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.links) {
        if (pendingAnimateOldPos) {
            const snapshot = pendingAnimateOldPos;
            pendingAnimateOldPos = null;
            loadLinks(container => { requestAnimationFrame(() => animateReorder(container, snapshot)); });
        } else {
            loadLinks();
        }
    }
    if (changes.quickTools)    loadQuickTools();                                  // FIX #1
    if (changes.searchEngine)  currentEngine = changes.searchEngine.newValue || "google";
    if (changes.weatherApiKey) loadWeather();                                     // reload on key save
});

/* ─── POSTMESSAGE ────────────────────────────────────────────────────────── */

window.addEventListener("message", e => {
    const ownOrigin = chrome.runtime.getURL("").slice(0, -1);
    if (e.origin !== ownOrigin) return;
    if (!e.data || typeof e.data.type !== "string") return;
    if (e.data.type === "apply-background") loadCustomBackground();
    if (e.data.type === "reset-background") clearCustomBackground();
});

/* ─── DOM READY ──────────────────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {

    loadCustomBackground();

    contextMenu     = document.getElementById("context-menu");
    editModal       = document.getElementById("edit-modal");
    editName        = document.getElementById("edit-name");
    editUrl         = document.getElementById("edit-url");
    editColor       = document.getElementById("edit-color");
    editTextColor   = document.getElementById("edit-text-color");
    editIconInput   = document.getElementById("edit-icon");
    editIconPreview = document.getElementById("edit-icon-preview");
    saveEditBtn     = document.getElementById("save-edit");
    cancelEditBtn   = document.getElementById("cancel-edit");

    editToolModal      = document.getElementById("edit-tool-modal");
    editToolName       = document.getElementById("edit-tool-name");
    editToolUrl        = document.getElementById("edit-tool-url");
    saveToolEditBtn    = document.getElementById("save-tool-edit");
    cancelToolEditBtn  = document.getElementById("cancel-tool-edit");

    const settingsBtn   = document.getElementById("settings-btn");
    const settingsFrame = document.getElementById("settings-frame");

    initGreeting();
    setInterval(initGreeting, 60_000); // FIX #5 — stays correct all day

    updateClock();
    setInterval(updateClock, 1000);

    chrome.storage.sync.get(["searchEngine"], res => { currentEngine = res.searchEngine || "google"; });

    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        searchInput.addEventListener("keydown", e => {
            if (e.key !== "Enter") return;
            const q = searchInput.value.trim();
            if (!q) return;
            window.location.href = SEARCH_ENGINES[currentEngine](q);
        });
    }

    loadWeather();
    setInterval(loadWeather, 30 * 60 * 1000); // FIX #2 — 30-min refresh

    loadQuickTools(); // FIX #1

    chrome.storage.sync.get(["links"], res => {
        if (!res.links) chrome.storage.sync.set({ links: defaultLinks });
        else loadLinks();
    });

    /* ── Settings panel — FIX #8: gear rotates when active ── */
    function openSettings() {
        settingsFrame.style.display = "block";
        settingsBtn.classList.add("active");
        requestAnimationFrame(() => settingsFrame.classList.add("open"));
    }
    function closeSettings() {
        settingsFrame.classList.remove("open");
        settingsBtn.classList.remove("active");
        setTimeout(() => { settingsFrame.style.display = "none"; }, 200);
    }

    settingsBtn.addEventListener("click", e => {
        e.stopPropagation();
        settingsFrame.classList.contains("open") ? closeSettings() : openSettings();
    });

    document.addEventListener("click", e => {
        if (settingsFrame.classList.contains("open") && !settingsFrame.contains(e.target) && !settingsBtn.contains(e.target))
            closeSettings();
        if (isContextMenuOpen && contextMenu && !contextMenu.contains(e.target)) {
            contextMenu.style.display = "none";
            isContextMenuOpen = false;
        }
    });

    const cardPreview = document.querySelector("#edit-color + .color-preview");
    const textPreview = document.querySelector("#edit-text-color + .color-preview");
    function syncColorPreviews() {
        if (cardPreview) cardPreview.style.setProperty("--color", editColor.value);
        if (textPreview) textPreview.style.setProperty("--color", editTextColor.value);
    }
    editColor.addEventListener("input", syncColorPreviews);
    editTextColor.addEventListener("input", syncColorPreviews);

    contextMenu.addEventListener("click", e => {
        const btn = e.target.closest("button");
        if (!btn) return;
        contextMenu.style.display = "none";
        isContextMenuOpen = false;

        /* ── Quick Tool actions ── */
        if (contextMenuMode === "tool") {
            if (!activeToolId) return;
            const id = activeToolId;

            if (btn.dataset.action === "open") {
                chrome.storage.sync.get(["quickTools"], res => {
                    const tools = res.quickTools || defaultQuickTools;
                    const tool  = tools.find(t => t.id === id);
                    if (tool) window.open(tool.url, "_blank");
                });
            }

            if (btn.dataset.action === "edit") {
                chrome.storage.sync.get(["quickTools"], res => {
                    const tools = res.quickTools || defaultQuickTools;
                    const tool  = tools.find(t => t.id === id);
                    if (!tool) return;
                    editToolName.value = tool.name;
                    editToolUrl.value  = tool.url;
                    editToolModal.style.display = "flex";
                });
            }

            if (btn.dataset.action === "remove") {
                chrome.storage.sync.get(["quickTools"], res => {
                    const tools   = res.quickTools || defaultQuickTools;
                    const updated = tools.filter(t => t.id !== id);
                    chrome.storage.sync.set({ quickTools: updated });
                });
            }

            activeToolId = null;
            return;
        }

        /* ── Favorite Link actions ── */
        if (activeIndex === null) return;
        chrome.storage.sync.get(["links"], res => {
            const links     = res.links || [];
            const itemIndex = links.findIndex(l => l.id === activeIndex);
            if (itemIndex === -1) return;
            const item = links[itemIndex];
            if (btn.dataset.action === "open") window.open(item.url, "_blank");
            if (btn.dataset.action === "remove") {
                links.splice(itemIndex, 1);
                chrome.storage.sync.set({ links });
                chrome.storage.local.remove(`icon_${item.id}`);
            }
            if (btn.dataset.action === "edit") {
                editName.value      = item.name;
                editUrl.value       = item.url;
                editColor.value     = item.color     || "#000000";
                editTextColor.value = item.textColor || "#ffffff";
                chrome.storage.local.get([`icon_${item.id}`], r => {
                    editIconPreview.src = r[`icon_${item.id}`]
                        || `https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=64`;
                });
                pendingIcon = null;
                syncColorPreviews();
                editModal.style.display = "flex";
            }
        });
    });

    editIconInput.addEventListener("change", () => {
        const file = editIconInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { pendingIcon = reader.result; editIconPreview.src = reader.result; };
        reader.readAsDataURL(file);
    });

    /* ── Save edit — FIX #4: URL gets https:// if missing ── */
    saveEditBtn.addEventListener("click", () => {
        if (!editName.value || !editUrl.value) return;
        chrome.storage.sync.get(["links"], res => {
            const links     = res.links || [];
            const itemIndex = links.findIndex(l => l.id === activeIndex);
            if (itemIndex === -1) return;
            const item = links[itemIndex];
            Object.assign(item, {
                name:      editName.value.trim(),
                url:       ensureHttps(editUrl.value.trim()),
                color:     editColor.value,
                textColor: editTextColor.value
            });
            if (pendingIcon) chrome.storage.local.set({ [`icon_${item.id}`]: pendingIcon });
            chrome.storage.sync.set({ links }, () => {
                editModal.style.display = "none";
                activeIndex = null;
                pendingIcon = null;
            });
        });
    });

    cancelEditBtn.addEventListener("click", () => {
        editModal.style.display = "none";
        activeIndex = null;
        pendingIcon = null;
    });

    /* ── Tool edit modal ── */
    saveToolEditBtn.addEventListener("click", () => {
        if (!editToolName.value || !editToolUrl.value) return;
        const id = activeToolId;
        chrome.storage.sync.get(["quickTools"], res => {
            const tools = res.quickTools || defaultQuickTools;
            const idx   = tools.findIndex(t => t.id === id);
            if (idx === -1) return;
            tools[idx].name = editToolName.value.trim();
            tools[idx].url  = ensureHttps(editToolUrl.value.trim());
            chrome.storage.sync.set({ quickTools: tools }, () => {
                editToolModal.style.display = "none";
                activeToolId = null;
            });
        });
    });

    cancelToolEditBtn.addEventListener("click", () => {
        editToolModal.style.display = "none";
        activeToolId = null;
    });

    document.addEventListener("keydown", e => {
        if (e.key !== "Escape") return;
        if (editModal.style.display === "flex") {
            editModal.style.display = "none"; activeIndex = null; pendingIcon = null; return;
        }
        if (editToolModal.style.display === "flex") {
            editToolModal.style.display = "none"; activeToolId = null; return;
        }
        if (settingsFrame.classList.contains("open")) { closeSettings(); return; }
        if (isContextMenuOpen) { contextMenu.style.display = "none"; isContextMenuOpen = false; }
    });
});