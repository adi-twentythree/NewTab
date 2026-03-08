const nameInput = document.getElementById("name");
const urlInput = document.getElementById("url");
const colorInput = document.getElementById("color");
const iconInput = document.getElementById("icon");
const addBtn = document.getElementById("add-btn");
const colorPreview = document.querySelector(".color-pill span");

/* Color preview */
colorInput.addEventListener("input", () => {
  colorPreview.style.background = colorInput.value;
});

/* Add Favorite */
addBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  const url = urlInput.value.trim();
  const color = colorInput.value;
  const file = iconInput.files[0];

  if (!name || !url) return;

  let icon = null;
  if (file) {
    icon = await fileToBase64(file);
  }

  chrome.storage.sync.get(["links"], result => {
    const links = result.links || [];

    links.push({
      id: crypto.randomUUID(),
      name,
      url,
      color,
      textColor: "#ffffff"
    });

    chrome.storage.sync.set({ links }, () => {
      if (icon) {
        chrome.storage.local.set({
          [`icon_${links[links.length - 1].id}`]: icon
        });
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

