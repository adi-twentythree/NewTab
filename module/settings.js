const nameInput   = document.getElementById("name");
const urlInput    = document.getElementById("url");
const colorInput  = document.getElementById("color");
const iconInput   = document.getElementById("icon");
const addBtn      = document.getElementById("add-btn");
const colorPreview = document.querySelector(".color-pill span");

/* Color preview */
colorInput.addEventListener("input", () => {
    colorPreview.style.background = colorInput.value;
});

/* Add Favorite */
addBtn.addEventListener("click", async () => {
    const name  = nameInput.value.trim();
    const url   = urlInput.value.trim();
    const color = colorInput.value;
    const file  = iconInput.files[0];

    if (!name || !url) return;

    let icon = null;
    if (file) {
        icon = await fileToBase64(file);
    }

    chrome.storage.sync.get(["links"], result => {
        const links = result.links || [];

        // FIX: capture the new link object before the async set call so the
        // icon storage callback always references the correct ID, regardless
        // of any mutations to the links array that could happen between the
        // push and the chrome.storage callback firing
        const newLink = {
            id:        crypto.randomUUID(),
            name,
            url,
            color,
            textColor: "#ffffff"
        };

        links.push(newLink);

        chrome.storage.sync.set({ links }, () => {
            if (icon) {
                // FIX: uses captured newLink.id — safe even if links mutates
                chrome.storage.local.set({ [`icon_${newLink.id}`]: icon });
            }

            // Clear inputs after successful save
            nameInput.value  = "";
            urlInput.value   = "";
            iconInput.value  = "";
            colorPreview.style.background = "#ffffff";
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
