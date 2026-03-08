const nameInput = document.getElementById("name");
const urlInput = document.getElementById("url");
const colorInput = document.getElementById("color");
const iconInput = document.getElementById("icon");
const addBtn = document.getElementById("add-btn");
const colorPreview = document.querySelector(".color-pill span");

const bgInput = document.getElementById("bg-input");
const bgLabelText = document.getElementById("bg-label-text");
const bgUploadLabel = document.getElementById("bg-upload-label");
const bgUploadIcon = document.getElementById("bg-upload-icon");
const resetBgBtn = document.getElementById("reset-bg-btn");
const applyBgBtn = document.getElementById("apply-bg-btn");

/* ─── Color preview ─────────────────────────────────────────────────────── */

colorInput.addEventListener("input", () => {
  colorPreview.style.background = colorInput.value;
});

/* ─── Add Favorite ──────────────────────────────────────────────────────── */

addBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  const url = urlInput.value.trim();
  const color = colorInput.value;
  const file = iconInput.files[0];

  if (!name || !url) return;

  let icon = null;
  if (file) icon = await fileToBase64(file);

  chrome.storage.sync.get(["links"], result => {
    const links = result.links || [];
    links.push({ id: crypto.randomUUID(), name, url, color, textColor: "#ffffff" });

    chrome.storage.sync.set({ links }, () => {
      if (icon) {
        chrome.storage.local.set({ [`icon_${links[links.length - 1].id}`]: icon });
      }
      nameInput.value = "";
      urlInput.value = "";
      iconInput.value = "";
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

/* ─── IndexedDB helpers ─────────────────────────────────────────────────── */

function openBgDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("newtab_bg_db", 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore("bg");
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveBgToIDB(file) {
  const db = await openBgDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("bg", "readwrite");
    tx.objectStore("bg").put(file, "custom_bg");
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteBgFromIDB() {
  const db = await openBgDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("bg", "readwrite");
    tx.objectStore("bg").delete("custom_bg");
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/* ─── Background: file picker ───────────────────────────────────────────── */

bgInput.addEventListener("change", () => {
  const file = bgInput.files[0];
  if (!file) return;

  bgLabelText.textContent = file.name;
  bgUploadLabel.classList.add("has-file");
  bgUploadIcon.textContent = file.type.startsWith("video") ? "🎬" : "🖼";
  applyBgBtn.disabled = false;
});

/* ─── Background: Apply ─────────────────────────────────────────────────── */

applyBgBtn.addEventListener("click", async () => {
  const file = bgInput.files[0];
  if (!file) return;

  applyBgBtn.textContent = "Saving…";
  applyBgBtn.disabled = true;

  await saveBgToIDB(file);

  // Tell the parent tab to apply the new background immediately
  window.parent.postMessage({ type: "apply-background" }, "*");

  applyBgBtn.textContent = "Applied ✓";
  setTimeout(() => {
    applyBgBtn.textContent = "Apply";
    applyBgBtn.disabled = false;
  }, 1800);
});

/* ─── Background: Reset ─────────────────────────────────────────────────── */

resetBgBtn.addEventListener("click", async () => {
  await deleteBgFromIDB();
  window.parent.postMessage({ type: "reset-background" }, "*");

  bgLabelText.textContent = "Choose image or video…";
  bgUploadLabel.classList.remove("has-file");
  bgUploadIcon.textContent = "🖼";
  bgInput.value = "";
  applyBgBtn.disabled = true;
  applyBgBtn.textContent = "Apply";
});

/* ─── Reflect existing bg on panel open ────────────────────────────────── */

(async () => {
  try {
    const db = await openBgDB();
    const file = await new Promise((resolve, reject) => {
      const tx = db.transaction("bg", "readonly");
      const req = tx.objectStore("bg").get("custom_bg");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });

    if (file) {
      bgLabelText.textContent = file.name || "Custom background set";
      bgUploadLabel.classList.add("has-file");
      bgUploadIcon.textContent = file.type && file.type.startsWith("video") ? "🎬" : "🖼";
      // Don't enable Apply — no new file selected yet
    }
  } catch (_) { /* no existing bg */ }
})();