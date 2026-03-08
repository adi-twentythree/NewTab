let activeIndex = null;
let pendingIcon = null;
let isContextMenuOpen = false;

let contextMenu;
let editModal, editName, editUrl, editColor, editTextColor;
let editIconInput, editIconPreview;
let saveEditBtn, cancelEditBtn;

const LINKS_CONTAINER_ID = "links";

/* ─── UTILITIES ─────────────────────────────────────────────────────────── */

function ensureIds(links) {
    let changed = false;
    links.forEach(link => {
        if (!link.id) {
            link.id = crypto.randomUUID();
            changed = true;
        }
    });
    if (changed) chrome.storage.sync.set({ links });
    return links;
}

function getPositions(container) {
    const map = new Map();
    [...container.children].forEach(el =>
        map.set(el, el.getBoundingClientRect())
    );
    return map;
}

function animateReorder(container, oldPos) {
    [...container.children].forEach(el => {
        const newPos = el.getBoundingClientRect();
        const old = oldPos.get(el);
        if (!old) return;

        const dx = old.left - newPos.left;
        const dy = old.top - newPos.top;

        if (dx || dy) {
            el.style.transform = `translate(${dx}px, ${dy}px)`;
            el.style.transition = "none";
            requestAnimationFrame(() => {
                el.style.transform = "";
                el.style.transition = "transform 220ms ease";
            });
        }
    });
}

/* ─── CLOCK ─────────────────────────────────────────────────────────────── */

// FIX: Guard against clock element not yet existing on early calls
function updateClock() {
    const clockEl = document.getElementById("clock");
    if (!clockEl) return;

    clockEl.textContent = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });

    clockEl.classList.add("visible");
}

// FIX: Defer clock start until DOM is ready (handled in DOMContentLoaded below)

/* ─── WEATHER ────────────────────────────────────────────────────────────── */

// NOTE: Move your API key to a backend proxy before publishing publicly
const WEATHER_API_KEY = "90d0362b25a303ce535af33e1e98706e";

async function loadWeather() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
        async pos => {
            const { latitude: lat, longitude: lon } = pos.coords;

            try {
                /* Weather */
                const weatherRes = await fetch(
                    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${WEATHER_API_KEY}`
                );
                const weather = await weatherRes.json();

                document.getElementById("weather-temp").textContent =
                    Math.round(weather.main.temp) + "°";
                document.getElementById("weather-condition").textContent =
                    weather.weather[0].main;
                document.getElementById("weather-location").textContent =
                    weather.name;
                document.getElementById("weather-icon").src =
                    `https://openweathermap.org/img/wn/${weather.weather[0].icon}@2x.png`;

                const cloud = weather.clouds.all;
                document.getElementById("weather-cloud").textContent = cloud + "%";
                document.getElementById("cloud-fill").style.width = cloud + "%";

                /* AQI — FIX: was missing await + .json() parse, aqiData was never defined */
                const aqiRes = await fetch(
                    `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}`
                );
                const aqiData = await aqiRes.json(); // ← was missing entirely

                const aqi = aqiData.list[0].main.aqi;
                const dot = document.getElementById("aqi-dot");

                const aqiMap = {
                    1: { label: "Good", class: "aqi-good" },
                    2: { label: "Fair", class: "aqi-fair" },
                    3: { label: "Moderate", class: "aqi-moderate" },
                    4: { label: "Poor", class: "aqi-poor" },
                    5: { label: "Bad", class: "aqi-bad" }
                };

                document.getElementById("weather-aqi").textContent = aqiMap[aqi].label;
                dot.classList.add(aqiMap[aqi].class);

            } catch (err) {
                console.warn("Weather/AQI fetch failed:", err);
            }
        },
        err => console.warn("Geolocation denied:", err)
    );
}

/* ─── DEFAULT DATA ───────────────────────────────────────────────────────── */

const defaultLinks = [
    { id: crypto.randomUUID(), name: "YouTube", url: "https://youtube.com", color: "#ff0000", textColor: "#ffffff" },
    { id: crypto.randomUUID(), name: "GitHub", url: "https://github.com", color: "#24292e", textColor: "#ffffff" },
    { id: crypto.randomUUID(), name: "Gmail", url: "https://mail.google.com", color: "#ffffff", textColor: "#111111" },
    { id: crypto.randomUUID(), name: "LinkedIn", url: "https://linkedin.com", color: "#0a66c2", textColor: "#ffffff" }
];

/* ─── LOAD FAVORITES ─────────────────────────────────────────────────────── */

function loadLinks() {
    chrome.storage.sync.get(["links"], result => {
        const links = ensureIds(result.links || defaultLinks);
        const container = document.getElementById(LINKS_CONTAINER_ID);
        container.innerHTML = "";

        let dragIndex = null;

        links.forEach((link, index) => {
            const card = document.createElement("a");
            card.className = "favorite-card";
            card.href = link.url;
            card.draggable = true;

            if (link.color) card.style.background = link.color;
            if (link.textColor) card.style.color = link.textColor;

            const img = document.createElement("img");
            const iconKey = `icon_${link.id}`;

            chrome.storage.local.get([iconKey], res => {
                img.src = res[iconKey]
                    || `https://www.google.com/s2/favicons?domain=${new URL(link.url).hostname}&sz=64`;
            });

            const title = document.createElement("span");
            title.textContent = link.name;

            card.append(img, title);
            container.appendChild(card);

            /* Context menu */
            card.addEventListener("contextmenu", e => {
                e.preventDefault();
                activeIndex = index;

                const menuWidth = 180;
                const menuHeight = 120;
                const x = Math.min(e.clientX, window.innerWidth - menuWidth);
                const y = Math.min(e.clientY, window.innerHeight - menuHeight);

                contextMenu.style.left = `${x}px`;
                contextMenu.style.top = `${y}px`;
                contextMenu.style.display = "flex";
                isContextMenuOpen = true;
            });

            /* Drag & reorder */
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

                const oldPos = getPositions(container);
                const updated = [...links];
                const [moved] = updated.splice(dragIndex, 1);
                updated.splice(index, 0, moved);

                // FIX: call loadLinks() after save so DOM stays in sync,
                // then animate based on the freshly rendered positions
                chrome.storage.sync.set({ links: updated }, () => {
                    activeIndex = null;
                    loadLinks();
                    requestAnimationFrame(() => animateReorder(container, oldPos));
                });
            });
        });
    });
}

/* ─── LIVE STORAGE SYNC ──────────────────────────────────────────────────── */

// FIX: Re-render links whenever settings.js (or any other context) saves new data
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.links) {
        loadLinks();
    }
});

/* ─── DOM READY ──────────────────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {

    // FIX: All DOM-dependent init is now safely inside DOMContentLoaded

    /* Grab DOM refs */
    contextMenu = document.getElementById("context-menu");
    editModal = document.getElementById("edit-modal");
    editName = document.getElementById("edit-name");
    editUrl = document.getElementById("edit-url");
    editColor = document.getElementById("edit-color");
    editTextColor = document.getElementById("edit-text-color");
    editIconInput = document.getElementById("edit-icon");
    editIconPreview = document.getElementById("edit-icon-preview");
    saveEditBtn = document.getElementById("save-edit");
    cancelEditBtn = document.getElementById("cancel-edit");

    const settingsBtn = document.getElementById("settings-btn");
    const settingsFrame = document.getElementById("settings-frame");

    /* ── Clock ── */
    updateClock();
    setInterval(updateClock, 1000);

    /* ── Weather ── */
    loadWeather();

    /* ── Initial link load ── */
    chrome.storage.sync.get(["links"], res => {
        if (!res.links) chrome.storage.sync.set({ links: defaultLinks }, loadLinks);
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
        ) {
            closeSettings();
        }

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
            const links = res.links || [];
            const item = links[activeIndex];

            if (btn.dataset.action === "open") {
                window.open(item.url, "_blank");
            }

            if (btn.dataset.action === "remove") {
                const removedId = item.id;
                links.splice(activeIndex, 1);
                chrome.storage.sync.set({ links }, loadLinks); // FIX: refresh after remove
                chrome.storage.local.remove(`icon_${removedId}`);
            }

            if (btn.dataset.action === "edit") {
                editName.value = item.name;
                editUrl.value = item.url;
                editColor.value = item.color || "#000000";
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
        reader.onload = () => {
            pendingIcon = reader.result;
            editIconPreview.src = reader.result;
        };
        reader.readAsDataURL(file);
    });

    /* ── Save edit ── */
    saveEditBtn.addEventListener("click", () => {
        if (!editName.value || !editUrl.value) return;

        chrome.storage.sync.get(["links"], res => {
            const links = res.links || [];
            const item = links[activeIndex];

            Object.assign(item, {
                name: editName.value.trim(),
                url: editUrl.value.trim(),
                color: editColor.value,
                textColor: editTextColor.value
            });

            if (pendingIcon) {
                chrome.storage.local.set({ [`icon_${item.id}`]: pendingIcon });
            }

            chrome.storage.sync.set({ links }, () => {
                editModal.style.display = "none";
                activeIndex = null;
                pendingIcon = null;
                loadLinks(); // FIX: refresh after edit save
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
            activeIndex = null;
            pendingIcon = null;
            return;
        }

        if (settingsFrame.classList.contains("open")) {
            closeSettings();
            return;
        }

        if (isContextMenuOpen) {
            contextMenu.style.display = "none";
            isContextMenuOpen = false;
        }
    });
});