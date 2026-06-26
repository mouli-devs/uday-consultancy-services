const loginForm = document.querySelector("[data-login-form]");
const updateForm = document.querySelector("[data-update-form]");
const statusPanel = document.querySelector("[data-admin-status]");
const listPanel = document.querySelector("[data-admin-list-panel]");
const updatesList = document.querySelector("[data-admin-updates-list]");
const logoutButton = document.querySelector("[data-logout]");
const updateType = document.querySelector("[data-update-type]");
const mediaInput = document.querySelector("[data-media-input]");
const tokenKey = "ucs_updates_admin_token";

let adminToken = localStorage.getItem(tokenKey) || "";

lockAdmin("Enter the admin password to unlock posting.");
verifyStoredSession();
syncMediaRequirement();

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Checking password...");

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: new FormData(loginForm).get("password") }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Login failed.");

    adminToken = result.token;
    localStorage.setItem(tokenKey, adminToken);
    loginForm.reset();
    unlockAdmin();
    setStatus("Posting unlocked. You can add a new update.");
  } catch (error) {
    setStatus(error.message);
  }
});

updateForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Posting update...");

  try {
    const response = await fetch("/api/admin/updates", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: new FormData(updateForm),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to post update.");

    updateForm.reset();
    syncMediaRequirement();
    setStatus("Update posted successfully.");
    await loadAdminUpdates();
  } catch (error) {
    setStatus(error.message);
    if (/login|required|unauthorized/i.test(error.message)) logout();
  }
});

logoutButton?.addEventListener("click", logout);
updateType?.addEventListener("change", syncMediaRequirement);

function unlockAdmin() {
  loginForm.hidden = true;
  updateForm.hidden = false;
  listPanel.hidden = false;
  loadAdminUpdates();
}

function lockAdmin(message = "Logged out.") {
  loginForm.hidden = false;
  updateForm.hidden = true;
  listPanel.hidden = true;
  setStatus(message);
}

function logout() {
  adminToken = "";
  localStorage.removeItem(tokenKey);
  lockAdmin();
}

async function verifyStoredSession() {
  if (!adminToken) return;
  setStatus("Checking saved login...");

  try {
    const response = await fetch("/api/admin/session", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!response.ok) throw new Error("Saved login expired.");
    unlockAdmin();
    setStatus("Posting unlocked. You can add a new update.");
  } catch (_error) {
    logout();
  }
}

async function loadAdminUpdates() {
  try {
    const response = await fetch("/api/updates");
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to load updates.");
    renderAdminUpdates(result.updates || []);
  } catch (error) {
    updatesList.textContent = error.message;
  }
}

function renderAdminUpdates(updates) {
  updatesList.innerHTML = "";
  if (!updates.length) {
    updatesList.textContent = "No updates posted yet.";
    return;
  }

  updates.forEach((update) => {
    const item = document.createElement("div");
    item.className = "admin-update-row";

    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = update.title;
    const meta = document.createElement("span");
    meta.textContent = `${update.displayDate || ""} / ${update.type || "update"}`;
    info.append(title, meta);

    const remove = document.createElement("button");
    remove.className = "btn secondary";
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => deleteUpdate(update.id));

    item.append(info, remove);
    updatesList.appendChild(item);
  });
}

async function deleteUpdate(id) {
  if (!confirm("Delete this update?")) return;
  setStatus("Deleting update...");

  try {
    const response = await fetch(`/api/admin/updates/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to delete update.");
    setStatus("Update deleted.");
    await loadAdminUpdates();
  } catch (error) {
    setStatus(error.message);
  }
}

function syncMediaRequirement() {
  if (!mediaInput || !updateType) return;
  const needsMedia = updateType.value === "photo" || updateType.value === "video";
  mediaInput.required = needsMedia;
}

function setStatus(message) {
  const statusText = statusPanel?.querySelector("p");
  if (statusText) statusText.textContent = message;
}
