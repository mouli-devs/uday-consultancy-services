const nav = document.querySelector("[data-nav]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const backToTop = document.querySelector("[data-back-to-top]");
const secretAdminTrigger = document.querySelector("[data-secret-admin-trigger]");
const updatesList = document.querySelector("[data-updates-list]");
let secretClickCount = 0;
let secretClickTimer = null;

menuToggle?.addEventListener("click", () => {
  const isOpen = nav?.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(Boolean(isOpen)));
});

backToTop?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

secretAdminTrigger?.addEventListener("click", () => {
  secretClickCount += 1;
  window.clearTimeout(secretClickTimer);

  if (secretClickCount >= 4) {
    secretClickCount = 0;
    window.open("admin-updates.html", "_blank", "noopener,noreferrer");
    return;
  }

  secretClickTimer = window.setTimeout(() => {
    secretClickCount = 0;
  }, 2500);
});

window.addEventListener("scroll", () => {
  backToTop?.classList.toggle("visible", window.scrollY > 500);
}, { passive: true });

loadUpdates();

async function loadUpdates() {
  try {
    const response = await fetch("/api/updates");
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to load updates.");
    renderUpdates(result.updates || []);
  } catch (error) {
    updatesList.innerHTML = "";
    updatesList.appendChild(emptyState(error.message));
  }
}

function renderUpdates(updates) {
  updatesList.innerHTML = "";
  if (!updates.length) {
    updatesList.appendChild(emptyState("No updates have been posted yet."));
    return;
  }

  updates.forEach((update) => {
    updatesList.appendChild(updateCard(update));
  });
}

function updateCard(update) {
  const article = document.createElement("article");
  article.className = "update-card";

  if (update.mediaUrl && update.mediaType === "photo") {
    const img = document.createElement("img");
    img.src = update.mediaUrl;
    img.alt = update.title || "Uday Consultancy Services update";
    article.appendChild(img);
  }

  if (update.mediaUrl && update.mediaType === "video") {
    const video = document.createElement("video");
    video.src = update.mediaUrl;
    video.controls = true;
    video.playsInline = true;
    article.appendChild(video);
  }

  const content = document.createElement("div");
  content.className = "update-content";

  const meta = document.createElement("p");
  meta.className = "update-meta";
  meta.textContent = `${update.displayDate || ""} / ${update.type || "update"}`;

  const title = document.createElement("h2");
  title.textContent = update.title || "Uday Consultancy Services Update";

  const body = document.createElement("p");
  body.textContent = update.body || "";

  content.append(meta, title, body);
  article.appendChild(content);
  return article;
}

function emptyState(message) {
  const empty = document.createElement("p");
  empty.className = "updates-empty";
  empty.textContent = message;
  return empty;
}
