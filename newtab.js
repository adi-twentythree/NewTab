let activeIndex = null;
let pendingIcon = null;
let isContextMenuOpen = false;

let contextMenu;
let editModal, editName, editUrl, editColor, editTextColor;
let editIconInput, editIconPreview;
let saveEditBtn, cancelEditBtn;

const LINKS_CONTAINER_ID = "links";

/* ─── IMPROVEMENT 2: Search engine state ────────────────────────────────── */

let currentEngine = "google";

const SEARCH_ENGINES = {
    google:     q => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    duckduckgo: q => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
    bing:       q => `https://www.bing.com/search?q=${encodeURIComponent(q)}`
};

/* ─── UTILITIES ─────────────────────────────────────────────────────────── */

function ensureIds(links) {
    let changed = false;
    links.forEach(link => {
        if (!link.id) { link.id = crypto.randomUUID(); changed = true; }
    });
    if (changed) chrome.storage.sync.set({ links });
    return links;
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

/* ─── IMPROVEMENT 1: Greeting ────────────────────────────────────────────── */

function initGreeting() {
    const el = document.getElementById("greeting");
    if (!el) return;
    const h = new Date().getHours();
    const part = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
    el.textContent = `Good ${part} ✦`;
    requestAnimationFrame(() => el.classList.add("visible"));
}

/* ─── IMPROVEMENT 5: Clock with date ────────────────────────────────────── */

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

async function loadWeather() {
    const apiKey = await getApiKey();

    if (!apiKey) {
        document.querySelector(".weather-widget")?.style.setProperty("display", "none");
        return;
    }

    if (!navigator.geolocation) {
        document.querySelector(".weather-widget")?.style.setProperty("display", "none");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async pos => {
            const { latitude: lat, longitude: lon } = pos.coords;
            try {
                const weatherRes = await fetch(
                    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`
                );
                const weather = await weatherRes.json();

                if (weather.cod && weather.cod !== 200) {
                    console.warn("Weather API error:", weather.message);
                    document.querySelector(".weather-widget")?.style.setProperty("display", "none");
                    return;
                }

                document.getElementById("weather-temp").textContent      = Math.round(weather.main.temp) + "°";
                document.getElementById("weather-condition").textContent  = weather.weather[0].main;
                document.getElementById("weather-location").textContent   = weather.name;
                document.getElementById("weather-icon").src               = `https://openweathermap.org/img/wn/${weather.weather[0].icon}@2x.png`;

                const cloud = weather.clouds.all;
                document.getElementById("weather-cloud").textContent = cloud + "%";
                document.getElementById("cloud-fill").style.width    = cloud + "%";

                const aqiRes  = await fetch(
                    `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`
                );
                const aqiData = await aqiRes.json();
                const aqi     = aqiData.list[0].main.aqi;
                const dot     = document.getElementById("aqi-dot");

                const aqiMap = {
                    1: { label: "Good",     cls: "aqi-good"     },
                    2: { label: "Fair",     cls: "aqi-fair"     },
                    3: { label: "Moderate", cls: "aqi-moderate" },
                    4: { label: "Poor",     cls: "aqi-poor"     },
                    5: { label: "Bad",      cls: "aqi-bad"      }
                };

                document.getElementById("weather-aqi").textContent = aqiMap[aqi].label;
                dot.className = `aqi-dot ${aqiMap[aqi].cls}`;

                // IMPROVEMENT 6: .visible removes shimmer skeleton
                document.querySelector(".weather-widget")?.classList.add("visible");

            } catch (err) {
                console.warn("Weather/AQI fetch failed:", err);
                document.querySelector(".weather-widget")?.style.setProperty("display", "none");
            }
        },
        () => document.querySelector(".weather-widget")?.style.setProperty("display", "none")
    );
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
    if (videoEl._customUrl) {
        URL.revokeObjectURL(videoEl._customUrl);
        videoEl._customUrl = null;
    }
    videoEl.removeAttribute("src");
    while (videoEl.firstChild) videoEl.removeChild(videoEl.firstChild);
    const source = document.createElement("source");
    source.src   = "assets/video.mp4";
    source.type  = "video/mp4";
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

        if (links.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            empty.innerHTML = `
                <span class="empty-icon">🔖</span>
                <span class="empty-text">No favorites yet</span>
                <span class="empty-sub">Add one via ⚙ Settings</span>
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
                activeIndex = link.id;
                const menuWidth = 180, menuHeight = 120;
                const x = Math.min(e.clientX, window.innerWidth  - menuWidth);
                const y = Math.min(e.clientY, window.innerHeight - menuHeight);
                contextMenu.style.left    = `${x}px`;
                contextMenu.style.top     = `${y}px`;
                contextMenu.style.display = "flex";
                isContextMenuOpen = true;
            });

            card.addEventListener("dragstart", () => {
                dragIndex = index;
                card.classList.add("dragging");
            });
            card.addEventListener("dragend", () => {
                card.classList.remove("dragging");
                dragIndex = null;
            });
            card.addEventListener("dragover", e => {
                e.preventDefault();
                card.classList.add("drag-over");
            });
            card.addEventListener("dragleave", () => {
                card.classList.remove("drag-over");
            });
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
    if (area !== "sync" || !changes.links) return;
    if (pendingAnimateOldPos) {
        const snapshot = pendingAnimateOldPos;
        pendingAnimateOldPos = null;
        loadLinks(container => {
            requestAnimationFrame(() => animateReorder(container, snapshot));
        });
    } else {
        loadLinks();
    }
});

/* ─── POSTMESSAGE: live bg apply from settings iframe ────────────────────── */

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

    const settingsBtn   = document.getElementById("settings-btn");
    const settingsFrame = document.getElementById("settings-frame");

    /* ── IMPROVEMENT 1: Greeting ── */
    initGreeting();

    /* ── IMPROVEMENT 5: Clock with date ── */
    updateClock();
    setInterval(updateClock, 1000);

    /* ── IMPROVEMENT 2: Engine switcher ── */
    function updateEngineBtns() {
        document.querySelectorAll(".engine-btn").forEach(b => {
            b.classList.toggle("active", b.dataset.engine === currentEngine);
        });
    }

    chrome.storage.sync.get(["searchEngine"], res => {
        currentEngine = res.searchEngine || "google";
        updateEngineBtns();
    });

    document.querySelectorAll(".engine-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            currentEngine = btn.dataset.engine;
            chrome.storage.sync.set({ searchEngine: currentEngine });
            updateEngineBtns();
        });
    });

    /* ── Search (fires on Enter, uses selected engine) ── */
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        searchInput.addEventListener("keydown", e => {
            if (e.key !== "Enter") return;
            const q = searchInput.value.trim();
            if (!q) return;
            window.location.href = SEARCH_ENGINES[currentEngine](q);
        });
    }

    /* ── Weather (IMPROVEMENT 6 skeleton is in CSS) ── */
    loadWeather();

    /* ── Initial link load ── */
    chrome.storage.sync.get(["links"], res => {
        if (!res.links) chrome.storage.sync.set({ links: defaultLinks });
        else loadLinks();
    });

    /* ── Settings panel ── */
    function openSettings() {
        settingsFrame.style.display = "block";
        requestAnimationFrame(() => settingsFrame.classList.add("open"));
    }
    function closeSettings() {
        settingsFrame.classList.remove("open");
        setTimeout(() => { settingsFrame.style.display = "none"; }, 200);
    }

    settingsBtn.addEventListener("click", e => {
        e.stopPropagation();
        settingsFrame.classList.contains("open") ? closeSettings() : openSettings();
    });

    document.addEventListener("click", e => {
        if (
            settingsFrame.classList.contains("open") &&
            !settingsFrame.contains(e.target) &&
            !settingsBtn.contains(e.target)
        ) closeSettings();

        if (isContextMenuOpen && contextMenu && !contextMenu.contains(e.target)) {
            contextMenu.style.display = "none";
            isContextMenuOpen = false;
        }
    });

    /* ── Color preview sync ── */
    const cardPreview = document.querySelector("#edit-color + .color-preview");
    const textPreview = document.querySelector("#edit-text-color + .color-preview");

    function syncColorPreviews() {
        if (cardPreview) cardPreview.style.setProperty("--color", editColor.value);
        if (textPreview) textPreview.style.setProperty("--color", editTextColor.value);
    }
    editColor.addEventListener("input", syncColorPreviews);
    editTextColor.addEventListener("input", syncColorPreviews);

    /* ── Context menu actions ── */
    contextMenu.addEventListener("click", e => {
        const btn = e.target.closest("button");
        if (!btn || activeIndex === null) return;

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

            contextMenu.style.display = "none";
            isContextMenuOpen = false;
        });
    });

    /* ── Icon upload ── */
    editIconInput.addEventListener("change", () => {
        const file = editIconInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { pendingIcon = reader.result; editIconPreview.src = reader.result; };
        reader.readAsDataURL(file);
    });

    /* ── Save edit ── */
    saveEditBtn.addEventListener("click", () => {
        if (!editName.value || !editUrl.value) return;
        chrome.storage.sync.get(["links"], res => {
            const links     = res.links || [];
            const itemIndex = links.findIndex(l => l.id === activeIndex);
            if (itemIndex === -1) return;
            const item = links[itemIndex];
            Object.assign(item, {
                name:      editName.value.trim(),
                url:       editUrl.value.trim(),
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

    /* ── Cancel edit ── */
    cancelEditBtn.addEventListener("click", () => {
        editModal.style.display = "none";
        activeIndex = null;
        pendingIcon = null;
    });

    /* ── Keyboard shortcuts ── */
    document.addEventListener("keydown", e => {
        if (e.key !== "Escape") return;
        if (editModal.style.display === "flex") {
            editModal.style.display = "none";
            activeIndex = null; pendingIcon = null;
            return;
        }
        if (settingsFrame.classList.contains("open")) { closeSettings(); return; }
        if (isContextMenuOpen) {
            contextMenu.style.display = "none";
            isContextMenuOpen = false;
        }
    });
});