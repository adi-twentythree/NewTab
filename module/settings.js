/* ── Add Favorite ────────────────────────────────────────────────────────── */

const nameInput       = document.getElementById("name");
const urlInput        = document.getElementById("url");
const colorInput      = document.getElementById("color");
const textColorInput  = document.getElementById("text-color");   // FIX #3
const iconInput       = document.getElementById("icon");
const addBtn          = document.getElementById("add-btn");
const colorPreview    = document.querySelector("#color + span");
const textColorPreview = document.querySelector("#text-color + span");

const bgInput       = document.getElementById("bg-input");
const bgLabelText   = document.getElementById("bg-label-text");
const bgUploadLabel = document.getElementById("bg-upload-label");
const bgUploadIcon  = document.getElementById("bg-upload-icon");
const resetBgBtn    = document.getElementById("reset-bg-btn");
const applyBgBtn    = document.getElementById("apply-bg-btn");

const apiKeyInput = document.getElementById("api-key-input");
const saveApiBtn  = document.getElementById("save-api-btn");

const DEFAULT_COLOR      = "#1a1a1a";
const DEFAULT_TEXT_COLOR = "#ffffff";

/* ─── FIX #4: auto-prepend https:// ─────────────────────────────────────── */

function ensureHttps(url) {
    if (!url) return url;
    if (!/^https?:\/\//i.test(url)) return "https://" + url;
    return url;
}

/* ─── Color previews ────────────────────────────────────────────────────── */

colorInput.addEventListener("input", () => {
    colorPreview.style.background = colorInput.value;
});

textColorInput.addEventListener("input", () => {                  // FIX #3
    textColorPreview.style.background = textColorInput.value;
});

/* ─── Add Favorite ──────────────────────────────────────────────────────── */

addBtn.addEventListener("click", async () => {
    const name      = nameInput.value.trim();
    const rawUrl    = urlInput.value.trim();
    const color     = colorInput.value;
    const textColor = textColorInput.value;                        // FIX #3
    const file      = iconInput.files[0];

    if (!name || !rawUrl) return;

    const url  = ensureHttps(rawUrl);                             // FIX #4
    let   icon = null;
    if (file) icon = await fileToBase64(file);

    chrome.storage.sync.get(["links"], result => {
        const links = result.links || [];
        const newId = crypto.randomUUID();
        links.push({ id: newId, name, url, color, textColor });   // FIX #3

        chrome.storage.sync.set({ links }, () => {
            if (icon) chrome.storage.local.set({ [`icon_${newId}`]: icon });

            nameInput.value              = "";
            urlInput.value               = "";
            iconInput.value              = "";
            colorInput.value             = DEFAULT_COLOR;
            textColorInput.value         = DEFAULT_TEXT_COLOR;
            colorPreview.style.background    = DEFAULT_COLOR;
            textColorPreview.style.background = DEFAULT_TEXT_COLOR;
        });
    });
});

function fileToBase64(file) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
    });
}

/* ─── FIX #1: Quick Tools — add only (edit/remove via right-click on page) ── */

const toolNameInput = document.getElementById("tool-name");
const toolUrlInput  = document.getElementById("tool-url");
const addToolBtn    = document.getElementById("add-tool-btn");

const defaultQuickTools = [
    { id: crypto.randomUUID(), name: "ChatGPT",   url: "https://chat.openai.com" },
    { id: crypto.randomUUID(), name: "Gemini",    url: "https://gemini.google.com" },
    { id: crypto.randomUUID(), name: "itch jams", url: "https://itch.io/jams/" },
    { id: crypto.randomUUID(), name: "I❤️PDF",    url: "https://www.ilovepdf.com/" },
    { id: crypto.randomUUID(), name: "RSI",       url: "https://robertsspaceindustries.com/en/" },
];

addToolBtn.addEventListener("click", () => {
    const name   = toolNameInput.value.trim();
    const rawUrl = toolUrlInput.value.trim();
    if (!name || !rawUrl) return;
    const url = ensureHttps(rawUrl);

    chrome.storage.sync.get(["quickTools"], result => {
        const tools = result.quickTools || defaultQuickTools;
        tools.push({ id: crypto.randomUUID(), name, url });
        chrome.storage.sync.set({ quickTools: tools }, () => {
            toolNameInput.value = "";
            toolUrlInput.value  = "";
        });
    });
});

/* ─── Search Engine ─────────────────────────────────────────────────────── */

const engineRadios = document.querySelectorAll("input[name='engine']");

chrome.storage.sync.get(["searchEngine"], res => {
    const saved = res.searchEngine || "google";
    engineRadios.forEach(r => { r.checked = r.value === saved; });
});

engineRadios.forEach(radio => {
    radio.addEventListener("change", () => {
        if (radio.checked) chrome.storage.sync.set({ searchEngine: radio.value });
    });
});

/* ─── IndexedDB helpers ─────────────────────────────────────────────────── */

function openBgDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open("newtab_bg_db", 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore("bg");
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = () => reject(req.error);
    });
}

async function saveBgToIDB(file) {
    const db = await openBgDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("bg", "readwrite");
        tx.objectStore("bg").put(file, "custom_bg");
        tx.oncomplete = resolve;
        tx.onerror    = () => reject(tx.error);
    });
}

async function deleteBgFromIDB() {
    const db = await openBgDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("bg", "readwrite");
        tx.objectStore("bg").delete("custom_bg");
        tx.oncomplete = resolve;
        tx.onerror    = () => reject(tx.error);
    });
}

/* ─── Background ────────────────────────────────────────────────────────── */

bgInput.addEventListener("change", () => {
    const file = bgInput.files[0];
    if (!file) return;
    bgLabelText.textContent = file.name;
    bgUploadLabel.classList.add("has-file");
    bgUploadIcon.textContent = file.type.startsWith("video") ? "🎬" : "🖼";
    applyBgBtn.disabled = false;
});

applyBgBtn.addEventListener("click", async () => {
    const file = bgInput.files[0];
    if (!file) return;
    applyBgBtn.textContent = "Saving…";
    applyBgBtn.disabled    = true;
    await saveBgToIDB(file);
    window.parent.postMessage({ type: "apply-background" }, chrome.runtime.getURL("").slice(0, -1));
    applyBgBtn.textContent = "Applied ✓";
    setTimeout(() => { applyBgBtn.textContent = "Apply"; applyBgBtn.disabled = false; }, 1800);
});

resetBgBtn.addEventListener("click", async () => {
    await deleteBgFromIDB();
    window.parent.postMessage({ type: "reset-background" }, chrome.runtime.getURL("").slice(0, -1));
    bgLabelText.textContent = "Choose image or video…";
    bgUploadLabel.classList.remove("has-file");
    bgUploadIcon.textContent = "🖼";
    bgInput.value            = "";
    applyBgBtn.disabled      = true;
    applyBgBtn.textContent   = "Apply";
});

// Reflect existing bg on open
(async () => {
    try {
        const db   = await openBgDB();
        const file = await new Promise((resolve, reject) => {
            const tx  = db.transaction("bg", "readonly");
            const req = tx.objectStore("bg").get("custom_bg");
            req.onsuccess = () => resolve(req.result || null);
            req.onerror   = () => reject(req.error);
        });
        if (file) {
            bgLabelText.textContent = file.name || "Custom background set";
            bgUploadLabel.classList.add("has-file");
            bgUploadIcon.textContent = file.type?.startsWith("video") ? "🎬" : "🖼";
        }
    } catch (_) { /* no existing bg */ }
})();

/* ─── API Key ────────────────────────────────────────────────────────────── */

chrome.storage.sync.get(["weatherApiKey"], res => {
    if (res.weatherApiKey) {
        const key = res.weatherApiKey;
        apiKeyInput.placeholder = "••••••••••••••••••••" + key.slice(-4);
    }
});

saveApiBtn.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    if (!key) return;
    chrome.storage.sync.set({ weatherApiKey: key }, () => {
        saveApiBtn.textContent  = "Saved ✓";
        apiKeyInput.value       = "";
        apiKeyInput.placeholder = "••••••••••••••••••••" + key.slice(-4);
        setTimeout(() => { saveApiBtn.textContent = "Save Key"; }, 1800);
    });
});