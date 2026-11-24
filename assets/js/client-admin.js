import {
  PORTAL_CONFIG,
  addDoc,
  auth,
  changePassword,
  collection,
  createManagedUser,
  db,
  deleteDoc,
  deleteStorageFile,
  doc,
  downloadStorageFile,
  ensureUserProfile,
  formatPortalDate,
  normalizeUsername,
  onAuthStateChanged,
  onSnapshot,
  ref,
  safeFileName,
  serverTimestamp,
  signOut,
  sortByCreatedAtDesc,
  storage,
  subscribeClientProfiles,
  subscribeUserProfile,
  updateDoc,
  updateUserProfile,
  uploadBytes,
} from "./firebase-portal.js";
import {
  getPublicHomeUrl,
  getClientPortalUrl,
  hasHiddenAdminAccess,
  navigateApp,
  revokeHiddenAdminAccess,
} from "./admin-access.js";

const state = {
  allClients: [],
  allDocuments: [],
  selectedClientId: null,
  clientsUnsubscribe: null,
  documentsUnsubscribe: null,
  adminUnsubscribe: null,
  pendingReplaceDocumentId: null,
  uploadingClientId: null,
  replacingDocumentId: null,
  deletingDocumentId: null,
};

function currentLang() {
  return document.documentElement.lang === "en" ? "en" : "ar";
}

function t(arabic, english) {
  return currentLang() === "en" ? english : arabic;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showMessage(id, type, message) {
  const box = document.getElementById(id);
  if (!box) {
    return;
  }

  box.className = "msg";
  if (!message) {
    box.textContent = "";
    return;
  }

  box.textContent = message;
  box.classList.add("show", type);
}

function showToast(type, title, message) {
  const stack = document.getElementById("toast-stack");
  if (!stack) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`;
  stack.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3600);
}

function getSyncErrorMessage(error) {
  const message = String(error?.message || error?.original?.message || "").trim();
  const lowered = message.toLowerCase();

  if (
    lowered.includes("row-level security")
    || lowered.includes("permission denied")
    || lowered.includes("not allowed")
  ) {
    return t(
      "ØªÙ… ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„ ÙƒØ¥Ø¯Ø§Ø±Ø©ØŒ Ù„ÙƒÙ† Supabase ÙŠÙ…Ù†Ø¹ Ù‚Ø±Ø§Ø¡Ø© Ø¬Ø¯ÙˆÙ„ Ø§Ù„Ù…Ù„ÙØ§Øª. Ø£Ø¹Ø¯ ØªØ´ØºÙŠÙ„ schema.sql ÙˆØªØ£ÙƒØ¯ Ø£Ù† Ø­Ø³Ø§Ø¨Ùƒ ÙÙŠ public.accounts Ù„Ø¯ÙŠÙ‡ role = admin.",
      "You are signed in as admin, but Supabase is still blocking reads on the documents table. Re-run schema.sql and confirm your row in public.accounts has role = admin.",
    );
  }

  if (
    lowered.includes("column")
    || lowered.includes("relation")
    || lowered.includes("schema cache")
    || lowered.includes("does not exist")
  ) {
    return t(
      "Ù‡ÙŠÙƒÙ„ Ø¬Ø¯ÙˆÙ„ Ø§Ù„Ù…Ù„ÙØ§Øª ÙÙŠ Supabase Ù„Ø§ ÙŠØ·Ø§Ø¨Ù‚ Ø§Ù„ÙƒÙˆØ¯ Ø§Ù„Ø­Ø§Ù„ÙŠ. Ø£Ø¹Ø¯ ØªØ´ØºÙŠÙ„ schema.sql Ø¨Ø§Ù„ÙƒØ§Ù…Ù„ Ø«Ù… Ø³Ø¬Ù‘Ù„ Ø§Ù„Ø®Ø±ÙˆØ¬ ÙˆØ§Ù„Ø¯Ø®ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.",
      "The documents schema in Supabase does not match the current code. Re-run the full schema.sql, then sign out and back in.",
    );
  }

  return message || t(
    "ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ« Ù…Ù„ÙØ§Øª Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ Ø§Ù„Ø­ÙŠØ© Ø§Ù„Ø¢Ù†.",
    "Live client file syncing is unavailable right now.",
  );
}

function getSyncFallbackMessage() {
  return t(
    "Ø§Ù†Ù‚Ø·Ø¹ Ø§Ù„Ø§ØªØµØ§Ù„ Ø§Ù„Ù…Ø¨Ø§Ø´Ø± Ø¨Ù…Ù„ÙØ§Øª Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡. Ø³ÙŠØ³ØªÙ…Ø± Ø§Ù„ØªØ­Ø¯ÙŠØ« Ø§Ù„ØªÙ„Ù‚Ø§Ø¦ÙŠ ÙƒÙ„ Ø¨Ø¶Ø¹ Ø«ÙˆØ§Ù†Ù ÙƒØ­Ù„ Ø¨Ø¯ÙŠÙ„.",
    "Live client file sync disconnected. Automatic refresh is still running as a fallback.",
  );
}

function goToLogin() {
  navigateApp(getPublicHomeUrl());
}

function goToClientPortal() {
  navigateApp(getClientPortalUrl());
}

function statusLabel(status) {
  if (currentLang() === "en") {
    return status === "inactive" ? "On Hold" : status === "closed" ? "Closed" : "Active";
  }
  return status === "inactive" ? "Ù…ÙˆÙ‚ÙˆÙ" : status === "closed" ? "Ù…ØºÙ„Ù‚" : "Ù†Ø´Ø·";
}

function statusBadgeClass(status) {
  return status === "inactive" ? "s-inactive" : status === "closed" ? "s-closed" : "s-active";
}

function getClientUsername(client) {
  return client?.username || client?.full_name || t("Ø¹Ù…ÙŠÙ„", "Client");
}

function clientPrimaryLabel(client) {
  return getClientUsername(client);
}

function getClientPhone(client) {
  return client?.phone || t("ØºÙŠØ± Ù…Ø³Ø¬Ù„", "Not provided");
}

function getFilteredClients() {
  const queryText = document.getElementById("search-inp").value.trim().toLowerCase();
  if (!queryText) {
    return state.allClients;
  }

  return state.allClients.filter((client) =>
    [client.username, client.full_name, client.id, client.phone, client.client_number, client.case_type]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(queryText)),
  );
}

function normalizeDocument(documentItem) {
  return {
    ...documentItem,
    direction: documentItem.direction || "admin_to_client",
    uploaded_by: documentItem.uploaded_by || "admin",
    is_locked: Boolean(documentItem.is_locked),
    file_name: documentItem.file_name || documentItem.name || "document",
    file_size: Number(documentItem.file_size || 0),
    mime_type: documentItem.mime_type || "application/octet-stream",
  };
}

function getClientDocuments(clientId, direction) {
  return sortByCreatedAtDesc(
    state.allDocuments.filter((documentItem) =>
      documentItem.client_id === clientId && (!direction || documentItem.direction === direction)),
  );
}

function getSelectedClient() {
  return state.allClients.find((client) => client.id === state.selectedClientId) || null;
}

function setSelectedClient(clientId) {
  state.selectedClientId = clientId || null;
  renderWorkspace();
}

function ensureSelectedClient() {
  if (!state.allClients.length) {
    state.selectedClientId = null;
    return;
  }

  if (!state.selectedClientId || !state.allClients.some((client) => client.id === state.selectedClientId)) {
    state.selectedClientId = state.allClients[0].id;
  }
}

function formatFileSize(size) {
  if (!Number.isFinite(size) || size <= 0) {
    return "0 KB";
  }
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function getDocumentDownloadName(documentItem) {
  const name = documentItem.file_name || documentItem.name || "document";
  return /\.[a-z0-9]+$/i.test(name)
    ? name
    : `${name}.${String(documentItem.mime_type || "application/octet-stream").split("/").pop() || "bin"}`;
}

function getDocumentStorageFolder(documentItem) {
  return documentItem.direction === "client_to_admin" ? "client-to-admin" : "admin-to-client";
}

function makeStableKey(value, prefix = "key") {
  const text = String(value || "").trim();
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return `${prefix}-${Math.abs(hash)}`;
}

function updateSearchMeta() {
  const meta = document.getElementById("client-search-meta");
  if (!meta) {
    return;
  }

  if (!state.allClients.length) {
    meta.textContent = t("Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ø¹Ù…Ù„Ø§Ø¡ Ø¨Ø¹Ø¯.", "No clients yet.");
    return;
  }

  const visibleCount = getFilteredClients().length;
  meta.textContent = currentLang() === "en"
    ? `${visibleCount} of ${state.allClients.length} clients`
    : `${visibleCount} Ù…Ù† ${state.allClients.length} Ø¹Ù…ÙŠÙ„`;
}

function renderClientSelectors() {
  const options = state.allClients.map((client) => `
    <option value="${escapeHtml(client.id)}">
      ${escapeHtml(clientPrimaryLabel(client))} - ${escapeHtml(client.id)}
    </option>
  `).join("");

  const fallbackOption = `<option value="">${escapeHtml(t("Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ø¹Ù…Ù„Ø§Ø¡", "No clients available"))}</option>`;
  const selects = [document.getElementById("upd-client"), document.getElementById("doc-client")];

  selects.forEach((select) => {
    if (!select) {
      return;
    }

    select.innerHTML = options || fallbackOption;
    if (state.selectedClientId && state.allClients.some((client) => client.id === state.selectedClientId)) {
      select.value = state.selectedClientId;
    }
  });
}

function renderClientList() {
  const container = document.getElementById("client-list");
  if (!container) {
    return;
  }

  const filteredClients = getFilteredClients();
  updateSearchMeta();

  if (!filteredClients.length) {
    container.innerHTML = `
      <div class="workspace-empty">
        <strong>${escapeHtml(t("Ù„Ø§ ØªÙˆØ¬Ø¯ Ù†ØªØ§Ø¦Ø¬", "No Matches"))}</strong>
        <span>${escapeHtml(t("Ø¬Ø±Ù‘Ø¨ Ø§Ù„Ø¨Ø­Ø« Ø¨Ø§Ø³Ù… Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø£Ùˆ Ù…Ø¹Ø±Ù‘Ù Ø§Ù„Ø¹Ù…ÙŠÙ„.", "Try searching by username or portal ID."))}</span>
      </div>
    `;
    return;
  }

  container.innerHTML = filteredClients.map((client) => {
    const sentCount = getClientDocuments(client.id, "admin_to_client").length;
    const submittedCount = getClientDocuments(client.id, "client_to_admin").length;
    return `
      <button class="client-card ${client.id === state.selectedClientId ? "active" : ""}" type="button" data-client-id="${escapeHtml(client.id)}">
        <div class="client-card-top">
          <div class="client-card-username">${escapeHtml(getClientUsername(client))}</div>
          <div class="client-card-id">${escapeHtml(client.id.slice(0, 8))}</div>
        </div>
        <div class="client-card-meta">
          <span><strong>${escapeHtml(t("Ø§Ù„Ù‡Ø§ØªÙ", "Phone"))}:</strong> ${escapeHtml(getClientPhone(client))}</span>
          <span><strong>${escapeHtml(t("Ø§Ù„Ø­Ø§Ù„Ø©", "Status"))}:</strong> ${escapeHtml(statusLabel(client.status || "active"))}</span>
          <span><strong>ID:</strong> ${escapeHtml(client.id)}</span>
        </div>
        <div class="client-card-stats">
          <span class="meta-chip">${escapeHtml(currentLang() === "en" ? `${sentCount} sent` : `${sentCount} Ù…Ø±Ø³Ù„`)}</span>
          <span class="meta-chip">${escapeHtml(currentLang() === "en" ? `${submittedCount} submitted` : `${submittedCount} Ù…Ø±ÙÙˆØ¹`)}</span>
        </div>
      </button>
    `;
  }).join("");
}

function renderFileCards(items, kind) {
  if (!items.length) {
    return `
      <div class="workspace-empty">
        <strong>${escapeHtml(kind === "admin" ? t("Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ù„ÙØ§Øª Ù…Ø±Ø³Ù„Ø©", "No Sent Files Yet") : t("Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ù„ÙØ§Øª Ù…Ø±ÙÙˆØ¹Ø©", "No Submitted Files Yet"))}</strong>
        <span>${escapeHtml(kind === "admin"
          ? t("ÙŠÙ…ÙƒÙ†Ùƒ Ø±ÙØ¹ Ø£ÙˆÙ„ Ù…Ù„Ù Ù„Ù‡Ø°Ø§ Ø§Ù„Ø¹Ù…ÙŠÙ„ Ù…Ù† Ù…Ø³Ø§Ø­Ø© Ø§Ù„Ø±ÙØ¹ Ø£Ø¹Ù„Ø§Ù‡.", "Use the upload area above to send the first file to this client.")
          : t("Ø¹Ù†Ø¯Ù…Ø§ ÙŠØ±ÙØ¹ Ø§Ù„Ø¹Ù…ÙŠÙ„ Ù…Ù„ÙØ§Ù‹ Ø³ÙŠØ¸Ù‡Ø± Ù‡Ù†Ø§ Ù…Ø¨Ø§Ø´Ø±Ø© Ø¨Ø¹Ù„Ø§Ù…Ø© Ø§Ù„Ù‚ÙÙ„.", "Client uploads will appear here automatically with a locked status badge."))}</span>
      </div>
    `;
  }

  return items.map((documentItem) => {
    const isReplacing = state.replacingDocumentId === documentItem.id;
    const isDeleting = state.deletingDocumentId === documentItem.id;
    const uploadedAt = formatPortalDate(documentItem.created_at, currentLang());
    const displayName = documentItem.file_name || documentItem.name || t("Ù…Ù„Ù", "File");

    return `
      <article class="file-card">
        <div class="file-card-main">
          <div class="file-card-title">${escapeHtml(displayName)}</div>
          <div class="file-card-sub">${escapeHtml(uploadedAt)} - ${escapeHtml(formatFileSize(documentItem.file_size))}</div>
          <div class="file-card-meta">
            <span class="file-badge">${escapeHtml(kind === "admin" ? t("Ù…Ù† Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©", "From Admin") : t("Ù…Ù† Ø§Ù„Ø¹Ù…ÙŠÙ„", "From Client"))}</span>
            ${kind === "client" ? `<span class="file-badge locked">${escapeHtml(t("Ù…Ù‚ÙÙ„ / Submitted", "Locked / Submitted"))}</span>` : ""}
          </div>
        </div>
        <div class="file-card-actions">
          <button class="btn btn-outline btn-sm" type="button" data-action="download-doc" data-doc-id="${escapeHtml(documentItem.id)}">
            ${escapeHtml(t("ØªØ­Ù…ÙŠÙ„", "Download"))}
          </button>
          <button class="btn btn-outline btn-sm" type="button" data-action="replace-doc" data-doc-id="${escapeHtml(documentItem.id)}" ${isReplacing || isDeleting ? "disabled" : ""}>
            ${escapeHtml(isReplacing ? t("???????? ??????????????????...", "Replacing...") : t("??????????????", "Replace"))}
          </button>
          <button class="btn btn-outline btn-sm" type="button" data-action="delete-doc" data-doc-id="${escapeHtml(documentItem.id)}" ${isReplacing || isDeleting ? "disabled" : ""}>
            ${escapeHtml(isDeleting ? t("???????? ??????????...", "Deleting...") : t("??????", "Delete"))}
          </button>
        </div>
      </article>
    `;
  }).join("");
}

function renderSelectedClientDetail() {
  const container = document.getElementById("selected-client-detail");
  if (!container) {
    return;
  }

  const client = getSelectedClient();
  if (!client) {
    container.innerHTML = `
      <div class="workspace-empty">
        <strong>${escapeHtml(t("Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ø¹Ù…ÙŠÙ„ Ù…Ø­Ø¯Ø¯", "No Client Selected"))}</strong>
        <span>${escapeHtml(t("Ø§Ø®ØªØ± Ø¹Ù…ÙŠÙ„Ø§Ù‹ Ù…Ù† Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ù„ÙØªØ­ Ù…Ø³Ø§Ø­Ø© Ø§Ù„Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø®Ø§ØµØ© Ø¨Ù‡.", "Choose a client from the list to open their admin workspace."))}</span>
      </div>
    `;
    return;
  }

  const adminFiles = getClientDocuments(client.id, "admin_to_client");
  const clientFiles = getClientDocuments(client.id, "client_to_admin");
  const isUploading = state.uploadingClientId === client.id;

  container.innerHTML = `
    <div class="detail-head">
      <div>
        <div class="detail-id">CLIENT ID - ${escapeHtml(client.id)}</div>
        <div class="detail-title">${escapeHtml(getClientUsername(client))}</div>
        <div class="detail-copy">
          ${escapeHtml(t(
            "Ù‡Ø°Ø§ Ø§Ù„Ø¹Ø±Ø¶ Ø®Ø§Øµ Ø¨Ù‡Ø°Ø§ Ø§Ù„Ø¹Ù…ÙŠÙ„ ÙÙ‚Ø·. Ø§Ù„Ù…Ù„ÙØ§Øª Ø§Ù„ØªÙŠ ÙŠØ±ÙØ¹Ù‡Ø§ ØªØ¨Ù‚Ù‰ Ù…Ù‚ÙÙ„Ø© ÙˆÙ„Ø§ ÙŠÙ…ÙƒÙ† ØªØ¹Ø¯ÙŠÙ„Ù‡Ø§ Ù…Ù† Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©.",
            "This workspace is isolated to this client only. Admin can now review client-submitted files and replace or delete them when needed.",
          ))}
        </div>
      </div>

      <div class="detail-actions">
        <button class="btn btn-outline btn-sm" type="button" data-action="status-client" data-client-id="${escapeHtml(client.id)}">
          ${escapeHtml(t("ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø­Ø§Ù„Ø©", "Update Status"))}
        </button>
        <button class="btn btn-outline btn-sm" type="button" data-action="edit-client" data-client-id="${escapeHtml(client.id)}">
          ${escapeHtml(t("ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø¹Ù…ÙŠÙ„", "Edit Client"))}
        </button>
        <button class="btn btn-outline btn-sm" type="button" data-action="password-client" data-client-id="${escapeHtml(client.id)}">
          ${escapeHtml(t("ØªØºÙŠÙŠØ± ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±", "Change Password"))}
        </button>
        <button class="btn btn-outline btn-sm" type="button" data-action="delete-client" data-client-id="${escapeHtml(client.id)}">
          ${escapeHtml(t("Ø­Ø°Ù Ø§Ù„Ø¹Ù…ÙŠÙ„", "Delete Client"))}
        </button>
      </div>
    </div>

    <div class="detail-body">
      <div class="detail-summary">
        <article class="summary-card">
          <div class="summary-label">${escapeHtml(t("Ø§Ù„Ø§Ø³Ù… Ø§Ù„ÙƒØ§Ù…Ù„", "Full Name"))}</div>
          <div class="summary-value">${escapeHtml(client.full_name || t("ØºÙŠØ± Ù…ØªØ§Ø­", "Unavailable"))}</div>
        </article>
        <article class="summary-card">
          <div class="summary-label">${escapeHtml(t("Ø§Ø³Ù… Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…", "Username"))}</div>
          <div class="summary-value">${escapeHtml(client.username || t("ØºÙŠØ± Ù…ØªØ§Ø­", "Unavailable"))}</div>
        </article>
        <article class="summary-card">
          <div class="summary-label">${escapeHtml(t("Ø±Ù‚Ù… Ø§Ù„Ù‡Ø§ØªÙ", "Phone"))}</div>
          <div class="summary-value">${escapeHtml(getClientPhone(client))}</div>
        </article>
        <article class="summary-card">
          <div class="summary-label">${escapeHtml(t("Ø§Ù„Ø­Ø§Ù„Ø©", "Status"))}</div>
          <div class="summary-value">
            <span class="s-badge ${escapeHtml(statusBadgeClass(client.status || "active"))}">${escapeHtml(statusLabel(client.status || "active"))}</span>
          </div>
        </article>
        <article class="summary-card">
          <div class="summary-label">${escapeHtml(t("Ø±Ù‚Ù… Ø§Ù„Ù…Ù„Ù", "Client Number"))}</div>
          <div class="summary-value">${escapeHtml(client.client_number || t("ØºÙŠØ± Ù…ØªØ§Ø­", "Unavailable"))}</div>
        </article>
      </div>

      <section class="file-section">
        <div class="file-section-head">
          <div>
            <div class="file-section-title">${escapeHtml(t("Ù…Ù„ÙØ§Øª Ù…Ù† Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©", "Files From Admin"))}</div>
            <div class="file-section-copy">${escapeHtml(t("ÙŠÙ…ÙƒÙ†Ùƒ Ø¥Ø±Ø³Ø§Ù„ Ù…Ù„ÙØ§Øª Ù„Ù‡Ø°Ø§ Ø§Ù„Ø¹Ù…ÙŠÙ„ Ø«Ù… Ø­Ø°ÙÙ‡Ø§ Ø£Ùˆ Ø§Ø³ØªØ¨Ø¯Ø§Ù„Ù‡Ø§ Ù„Ø§Ø­Ù‚Ø§Ù‹.", "Send files to this client here, then replace or delete only the files you sent."))}</div>
          </div>
          <span class="meta-chip">${escapeHtml(currentLang() === "en" ? `${adminFiles.length} files` : `${adminFiles.length} Ù…Ù„Ù`)}</span>
        </div>

        <label class="upload-zone ${isUploading ? "loading" : ""}" id="workspace-upload-zone">
          <input id="workspace-upload-file" type="file" ${isUploading ? "disabled" : ""}>
          <strong>${escapeHtml(isUploading ? t("Ø¬Ø§Ø±Ù Ø±ÙØ¹ Ø§Ù„Ù…Ù„Ù...", "Uploading File...") : t("Ø§Ø³Ø­Ø¨ Ø§Ù„Ù…Ù„Ù Ù‡Ù†Ø§ Ø£Ùˆ Ø§Ø¶ØºØ· Ù„Ù„Ø§Ø®ØªÙŠØ§Ø±", "Drop a file here or click to choose"))}</strong>
          <span>${escapeHtml(t("Ø³ÙŠØ¸Ù‡Ø± Ø§Ù„Ù…Ù„Ù Ù…Ø¨Ø§Ø´Ø±Ø© Ø¯Ø§Ø®Ù„ Ø¨ÙˆØ§Ø¨Ø© Ø§Ù„Ø¹Ù…ÙŠÙ„ Ø¨Ø¹Ø¯ Ø§ÙƒØªÙ…Ø§Ù„ Ø§Ù„Ø±ÙØ¹.", "The file will appear in the client portal as soon as the upload completes."))}</span>
        </label>

        <div class="file-list">${renderFileCards(adminFiles, "admin")}</div>
      </section>

      <section class="file-section">
        <div class="file-section-head">
          <div>
            <div class="file-section-title">${escapeHtml(t("Ù…Ù„ÙØ§Øª Ø§Ù„Ø¹Ù…ÙŠÙ„ Ø§Ù„Ù…Ø±ÙÙˆØ¹Ø©", "Files From Client"))}</div>
            <div class="file-section-copy">${escapeHtml(t("Ù‡Ø°Ù‡ Ø§Ù„Ù…Ù„ÙØ§Øª Ù„Ù„Ø¹Ø±Ø¶ ÙˆØ§Ù„ØªÙ†Ø²ÙŠÙ„ ÙÙ‚Ø·. ØªØ¨Ù‚Ù‰ Ù…Ù‚ÙÙ„Ø© Ø¨Ø¹Ø¯ Ø§Ù„Ø¥Ø±Ø³Ø§Ù„ ÙˆÙ„Ø§ ÙŠÙ…ÙƒÙ† ØªØ¹Ø¯ÙŠÙ„Ù‡Ø§ Ø£Ùˆ Ø­Ø°ÙÙ‡Ø§.", "These submissions are view-only for admin. Once sent by the client they stay locked and cannot be changed or deleted."))}</div>
          </div>
          <span class="meta-chip">${escapeHtml(currentLang() === "en" ? `${clientFiles.length} files` : `${clientFiles.length} Ù…Ù„Ù`)}</span>
        </div>

        <div class="file-list">${renderFileCards(clientFiles, "client")}</div>
      </section>
    </div>
  `;

  bindWorkspaceDropZone();
}

function renderWorkspace() {
  ensureSelectedClient();
  renderClientSelectors();
  renderClientList();
  renderSelectedClientDetail();
}

function subscribeClients() {
  state.clientsUnsubscribe?.();
  state.clientsUnsubscribe = subscribeClientProfiles(
    (clients) => {
      state.allClients = sortByCreatedAtDesc(clients);
      ensureSelectedClient();
      renderWorkspace();
    },
    (error) => {
      console.error("Could not subscribe to portal users.", error);
      state.allClients = [];
      renderWorkspace();
      showToast("err", t("ØªØ¹Ø°Ø± ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡", "Could Not Load Clients"), t("ÙØ´Ù„Øª Ù‚Ø±Ø§Ø¡Ø© Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ Ù…Ù† Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª.", "The client list could not be loaded from the database."));
    },
  );
}

function subscribeDocuments() {
  state.documentsUnsubscribe?.();
  state.documentsUnsubscribe = onSnapshot(
    collection(db, PORTAL_CONFIG.collections.documents),
    (snapshot) => {
      state.allDocuments = sortByCreatedAtDesc(
        snapshot.docs.map((item) => normalizeDocument({ id: item.id, ...item.data() })),
      );
      renderWorkspace();
    },
    (error) => {
      console.error("Could not subscribe to client documents.", error);
      state.allDocuments = [];
      renderWorkspace();
      showToast("err", t("ØªØ¹Ø°Ø± Ù…Ø²Ø§Ù…Ù†Ø© Ø§Ù„Ù…Ù„ÙØ§Øª", "File Sync Failed"), getSyncErrorMessage(error));
    },
    {
      onTransportIssue() {
        showToast("err", t("ØªØ¹Ø°Ø± Ø§Ù„Ù…Ø²Ø§Ù…Ù†Ø© Ø§Ù„Ù…Ø¨Ø§Ø´Ø±Ø©", "Live Sync Unavailable"), getSyncFallbackMessage());
      },
    },
  );
}

async function createClient() {
  const rawUsername = document.getElementById("n-username").value.trim();
  const password = document.getElementById("n-pass").value;
  const phone = document.getElementById("n-phone").value.trim();
  const clientNumber = `ASK-${Date.now().toString().slice(-8)}`;
  const username = normalizeUsername(rawUsername);

  showMessage("new-msg", "", "");

  if (!username || !password) {
    showMessage("new-msg", "err", t("ÙŠØ±Ø¬Ù‰ Ø¥Ø¯Ø®Ø§Ù„ Ø§Ø³Ù… Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… ÙˆÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±.", "Please enter the username and password."));
    return;
  }

  if (username.length < 3 || username !== rawUsername.trim().toLowerCase()) {
    showMessage("new-msg", "err", t("Ø§Ø³ØªØ®Ø¯Ù… Ø§Ø³Ù… Ù…Ø³ØªØ®Ø¯Ù… Ù…Ù† 3 Ø£Ø­Ø±Ù Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„ ÙˆÙŠØ­ØªÙˆÙŠ ÙÙ‚Ø· Ø¹Ù„Ù‰ Ø§Ù„Ø£Ø­Ø±Ù Ø§Ù„Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠØ© Ø§Ù„ØµØºÙŠØ±Ø© Ø£Ùˆ Ø§Ù„Ø£Ø±Ù‚Ø§Ù… Ø£Ùˆ . Ø£Ùˆ _ Ø£Ùˆ -", "Use a username with at least 3 characters and only lowercase letters, numbers, dots, underscores, or hyphens."));
    return;
  }

  if (password.length < 8) {
    showMessage("new-msg", "err", t("ÙŠØ¬Ø¨ Ø£Ù† ØªØªÙƒÙˆÙ† ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± Ù…Ù† 8 Ø£Ø­Ø±Ù Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„.", "Password must be at least 8 characters."));
    return;
  }

  try {
    const createdUser = await createManagedUser({
      username,
      password,
      full_name: null,
      client_number: clientNumber,
      phone: phone || null,
      case_type: null,
      notes: null,
      status: "active",
    });

    state.selectedClientId = createdUser.id;

    showMessage(
      "new-msg",
      "ok",
      currentLang() === "en"
        ? `Client created successfully. ID: ${createdUser.id}`
        : `ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø¹Ù…ÙŠÙ„ Ø¨Ù†Ø¬Ø§Ø­. Ø§Ù„Ù…Ø¹Ø±Ù‘Ù: ${createdUser.id}`,
    );
    showToast("ok", t("ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø¹Ù…ÙŠÙ„", "Client Created"), currentLang() === "en"
      ? `${username} is ready to sign in.`
      : `ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø­Ø³Ø§Ø¨ ${username} ÙˆÙŠÙ…ÙƒÙ†Ù‡ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ø§Ù„Ø¢Ù†.`);

    document.getElementById("n-username").value = "";
    document.getElementById("n-pass").value = "";
    document.getElementById("n-phone").value = "";

    window.setTimeout(() => closeModal("modal-new"), 1200);
  } catch (error) {
    console.error("Client creation failed.", error);
    showMessage(
      "new-msg",
      "err",
      error.message || t("ØªØ¹Ø°Ø± Ø¥Ù†Ø´Ø§Ø¡ Ø­Ø³Ø§Ø¨ Ø§Ù„Ø¹Ù…ÙŠÙ„.", "Could not create the client account."),
    );
  }
}

function openStatusModal(uid, status) {
  document.getElementById("status-uid").value = uid;
  document.getElementById("status-val").value = status;
  openModal("modal-status");
}

async function updateStatus() {
  const uid = document.getElementById("status-uid").value;
  const status = document.getElementById("status-val").value;

  try {
    await updateUserProfile(uid, { status });
    closeModal("modal-status");
    showToast("ok", t("ØªÙ… ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø­Ø§Ù„Ø©", "Status Updated"), t("ØªÙ… Ø­ÙØ¸ Ø­Ø§Ù„Ø© Ø§Ù„Ø¹Ù…ÙŠÙ„ Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø©.", "The client status was saved successfully."));
  } catch (error) {
    console.error("Status update failed.", error);
    showToast("err", t("ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø­Ø§Ù„Ø©", "Status Update Failed"), t("ØªØ¹Ø°Ø± Ø­ÙØ¸ Ø­Ø§Ù„Ø© Ø§Ù„Ø¹Ù…ÙŠÙ„ Ø§Ù„Ø¢Ù†.", "We could not save the client status right now."));
  }
}

function openEditModal(clientId) {
  const client = state.allClients.find((item) => item.id === clientId);
  if (!client) {
    return;
  }

  document.getElementById("edit-uid").value = client.id;
  document.getElementById("edit-username").value = client.username || "";
  document.getElementById("edit-full-name").value = client.full_name || "";
  document.getElementById("edit-phone").value = client.phone || "";
  document.getElementById("edit-client-number").value = client.client_number || "";
  document.getElementById("edit-case-type").value = client.case_type || "";
  document.getElementById("edit-status").value = client.status || "active";
  document.getElementById("edit-notes").value = client.notes || "";
  showMessage("edit-msg", "", "");
  openModal("modal-edit");
}

async function saveClientEdit() {
  const uid = document.getElementById("edit-uid").value;
  const username = normalizeUsername(document.getElementById("edit-username").value.trim());
  const fullName = document.getElementById("edit-full-name").value.trim();
  const phone = document.getElementById("edit-phone").value.trim();
  const clientNumber = document.getElementById("edit-client-number").value.trim();
  const caseType = document.getElementById("edit-case-type").value.trim();
  const status = document.getElementById("edit-status").value;
  const notes = document.getElementById("edit-notes").value.trim();

  showMessage("edit-msg", "", "");

  if (!uid || !username) {
    showMessage("edit-msg", "err", t("Ø§Ø³Ù… Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ù…Ø·Ù„ÙˆØ¨.", "Username is required."));
    return;
  }

  try {
    await updateUserProfile(uid, {
      username,
      full_name: fullName || null,
      phone: phone || null,
      client_number: clientNumber || null,
      case_type: caseType || null,
      status,
      notes: notes || null,
    });
    closeModal("modal-edit");
    showToast("ok", t("ØªÙ… Ø­ÙØ¸ Ø§Ù„Ø¹Ù…ÙŠÙ„", "Client Saved"), t("ØªÙ… ØªØ­Ø¯ÙŠØ« Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø¹Ù…ÙŠÙ„ Ø¨Ù†Ø¬Ø§Ø­.", "The client profile was updated successfully."));
  } catch (error) {
    console.error("Client update failed.", error);
    showMessage("edit-msg", "err", error.message || t("ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ« Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø¹Ù…ÙŠÙ„.", "Could not update the client profile."));
  }
}

function openPasswordModal(clientId) {
  document.getElementById("password-uid").value = clientId;
  document.getElementById("password-value").value = "";
  showMessage("password-msg", "", "");
  openModal("modal-password");
}

async function saveClientPassword() {
  const uid = document.getElementById("password-uid").value;
  const password = document.getElementById("password-value").value;

  showMessage("password-msg", "", "");

  if (!uid || password.length < 8) {
    showMessage("password-msg", "err", t("ÙŠØ¬Ø¨ Ø£Ù† ØªÙƒÙˆÙ† ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± 8 Ø£Ø­Ø±Ù Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„.", "Password must be at least 8 characters."));
    return;
  }

  try {
    await changePassword(password, uid);
    closeModal("modal-password");
    showToast("ok", t("ØªÙ… ØªØ­Ø¯ÙŠØ« ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±", "Password Updated"), t("ÙŠÙ…ÙƒÙ† Ù„Ù„Ø¹Ù…ÙŠÙ„ Ø§Ø³ØªØ®Ø¯Ø§Ù… ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ± Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© ÙÙˆØ±Ø§Ù‹.", "The client can use the new password immediately."));
  } catch (error) {
    console.error("Client password update failed.", error);
    showMessage("password-msg", "err", error.message || t("ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ« ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±.", "Could not update the password."));
  }
}

async function deleteClientAccount(clientId) {
  const client = state.allClients.find((item) => item.id === clientId);
  if (!client) {
    return;
  }

  const approved = window.confirm(
    currentLang() === "en"
      ? `Delete ${client.username || client.id}?`
      : `Ù‡Ù„ ØªØ±ÙŠØ¯ Ø­Ø°Ù ${client.username || client.id}ØŸ`,
  );
  if (!approved) {
    return;
  }

  try {
    await deleteDoc(doc(db, PORTAL_CONFIG.collections.users, clientId));
    if (state.selectedClientId === clientId) {
      state.selectedClientId = state.allClients.find((item) => item.id !== clientId)?.id || null;
    }
    showToast("ok", t("ØªÙ… Ø­Ø°Ù Ø§Ù„Ø¹Ù…ÙŠÙ„", "Client Deleted"), t("ØªÙ… Ø­Ø°Ù Ø­Ø³Ø§Ø¨ Ø§Ù„Ø¹Ù…ÙŠÙ„ Ù…Ù† Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª.", "The client account was deleted from the database."));
  } catch (error) {
    console.error("Client delete failed.", error);
    showToast("err", t("ØªØ¹Ø°Ø± Ø­Ø°Ù Ø§Ù„Ø¹Ù…ÙŠÙ„", "Delete Failed"), error.message || t("ØªØ¹Ø°Ø± Ø­Ø°Ù Ø§Ù„Ø¹Ù…ÙŠÙ„ Ø§Ù„Ø¢Ù†.", "Could not delete the client right now."));
  }
}

async function addUpdate() {
  const clientId = document.getElementById("upd-client").value;
  const title = document.getElementById("upd-title").value.trim();
  const body = document.getElementById("upd-body").value.trim();

  showMessage("upd-msg", "", "");

  if (!clientId || !title) {
    showMessage("upd-msg", "err", t("ÙŠØ±Ø¬Ù‰ Ø§Ø®ØªÙŠØ§Ø± Ø¹Ù…ÙŠÙ„ ÙˆØ¥Ø¯Ø®Ø§Ù„ Ø¹Ù†ÙˆØ§Ù† Ù„Ù„Ù…Ø³ØªØ¬Ø¯.", "Please choose a client and add an update title."));
    return;
  }

  try {
    await addDoc(collection(db, PORTAL_CONFIG.collections.workUpdates), {
      client_id: clientId,
      title,
      body,
      created_by: auth.currentUser?.uid || null,
      created_at: serverTimestamp(),
    });

    document.getElementById("upd-title").value = "";
    document.getElementById("upd-body").value = "";
    showMessage("upd-msg", "ok", t("ØªÙ… Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ù…Ø³ØªØ¬Ø¯ Ø¨Ù†Ø¬Ø§Ø­.", "Update sent successfully."));
    showToast("ok", t("ØªÙ… Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ù…Ø³ØªØ¬Ø¯", "Update Sent"), t("Ø³ÙŠØ¸Ù‡Ø± Ø§Ù„Ù…Ø³ØªØ¬Ø¯ Ø¯Ø§Ø®Ù„ Ø¨ÙˆØ§Ø¨Ø© Ø§Ù„Ø¹Ù…ÙŠÙ„ Ù…Ø¨Ø§Ø´Ø±Ø©.", "The update will appear in the client portal immediately."));
  } catch (error) {
    console.error("Update creation failed.", error);
    showMessage("upd-msg", "err", error.message || t("ØªØ¹Ø°Ø± Ø­ÙØ¸ Ø§Ù„Ù…Ø³ØªØ¬Ø¯.", "Could not save the update."));
  }
}

async function createAdminDocument(clientId, file, displayName = "") {
  const path = `${PORTAL_CONFIG.storagePaths.clientDocuments}/${clientId}/admin-to-client/${Date.now()}-${safeFileName(file.name)}`;

  await uploadBytes(ref(storage, path), file, {
    contentType: file.type || "application/octet-stream",
  });

  await addDoc(collection(db, PORTAL_CONFIG.collections.documents), {
    client_id: clientId,
    name: displayName || file.name,
    path,
    direction: "admin_to_client",
    uploaded_by: "admin",
    is_locked: false,
    file_name: file.name,
    file_size: file.size || 0,
    mime_type: file.type || "application/octet-stream",
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
}

async function uploadSelectedClientFile(file) {
  const client = getSelectedClient();
  if (!client || !file) {
    return;
  }

  state.uploadingClientId = client.id;
  renderSelectedClientDetail();

  try {
    await createAdminDocument(client.id, file, file.name);
    showToast("ok", t("ØªÙ… Ø±ÙØ¹ Ø§Ù„Ù…Ù„Ù", "File Uploaded"), currentLang() === "en"
      ? `${file.name} was sent to ${client.username || client.full_name || "the client"}.`
      : `ØªÙ… Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ù…Ù„Ù ${file.name} Ø¥Ù„Ù‰ ${client.username || client.full_name || "Ø§Ù„Ø¹Ù…ÙŠÙ„"}.`);
  } catch (error) {
    console.error("Workspace upload failed.", error);
    showToast("err", t("ØªØ¹Ø°Ø± Ø±ÙØ¹ Ø§Ù„Ù…Ù„Ù", "Upload Failed"), error.message || t("ØªØ¹Ø°Ø± Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ù…Ù„Ù Ù„Ù‡Ø°Ø§ Ø§Ù„Ø¹Ù…ÙŠÙ„.", "We could not send the file to this client."));
  } finally {
    state.uploadingClientId = null;
    renderSelectedClientDetail();
  }
}

async function uploadClientDoc() {
  const clientId = document.getElementById("doc-client").value;
  const title = document.getElementById("doc-title").value.trim();
  const file = document.getElementById("doc-file").files[0];

  showMessage("doc-msg", "", "");

  if (!clientId || !file) {
    showMessage("doc-msg", "err", t("ÙŠØ±Ø¬Ù‰ Ø§Ø®ØªÙŠØ§Ø± Ø¹Ù…ÙŠÙ„ ÙˆÙ…Ù„Ù Ù„Ù„Ø±ÙØ¹.", "Please choose a client and file to upload."));
    return;
  }

  try {
    await createAdminDocument(clientId, file, title || file.name);
    document.getElementById("doc-title").value = "";
    document.getElementById("doc-file").value = "";
    showMessage("doc-msg", "ok", t("ØªÙ… Ø±ÙØ¹ Ø§Ù„Ù…Ù„Ù Ø¨Ù†Ø¬Ø§Ø­.", "Document uploaded successfully."));
    showToast("ok", t("ØªÙ…Øª Ø§Ù„Ù…Ø´Ø§Ø±ÙƒØ©", "Shared Successfully"), t("ØªÙ… Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ù…Ù„Ù Ø¥Ù„Ù‰ Ø¨ÙˆØ§Ø¨Ø© Ø§Ù„Ø¹Ù…ÙŠÙ„.", "The file was sent to the client portal."));
  } catch (error) {
    console.error("Quick upload failed.", error);
    showMessage("doc-msg", "err", error.message || t("ØªØ¹Ø°Ø± Ø±ÙØ¹ Ø§Ù„Ù…Ù„Ù.", "Could not upload the document."));
  }
}

async function replaceAdminDocument(documentId, file) {
  const currentDocument = state.allDocuments.find((documentItem) => documentItem.id === documentId);
  if (!currentDocument) {
    return;
  }

  const nextPath = `${PORTAL_CONFIG.storagePaths.clientDocuments}/${currentDocument.client_id}/${getDocumentStorageFolder(currentDocument)}/${Date.now()}-${safeFileName(file.name)}`;
  state.replacingDocumentId = documentId;
  renderSelectedClientDetail();

  try {
    await uploadBytes(ref(storage, nextPath), file, {
      contentType: file.type || "application/octet-stream",
    });

    await updateDoc(doc(db, PORTAL_CONFIG.collections.documents, documentId), {
      name: file.name,
      path: nextPath,
      file_name: file.name,
      file_size: file.size || 0,
      mime_type: file.type || "application/octet-stream",
      updated_at: serverTimestamp(),
    });

    try {
      await deleteStorageFile(currentDocument.path);
    } catch (cleanupError) {
      console.warn("Old admin file cleanup failed.", cleanupError);
    }

    showToast("ok", t("ØªÙ… Ø§Ø³ØªØ¨Ø¯Ø§Ù„ Ø§Ù„Ù…Ù„Ù", "File Replaced"), currentLang() === "en"
      ? `${file.name} replaced the previous file.`
      : `ØªÙ… Ø§Ø³ØªØ¨Ø¯Ø§Ù„ Ø§Ù„Ù…Ù„Ù Ø§Ù„Ø³Ø§Ø¨Ù‚ Ø¨Ø§Ù„Ù…Ù„Ù ${file.name}.`);
  } catch (error) {
    console.error("Admin document replacement failed.", error);
    showToast("err", t("ØªØ¹Ø°Ø± Ø§Ù„Ø§Ø³ØªØ¨Ø¯Ø§Ù„", "Replace Failed"), error.message || t("ØªØ¹Ø°Ø± Ø§Ø³ØªØ¨Ø¯Ø§Ù„ Ø§Ù„Ù…Ù„Ù Ø§Ù„Ø¢Ù†.", "We could not replace the file right now."));
  } finally {
    state.replacingDocumentId = null;
    state.pendingReplaceDocumentId = null;
    const input = document.getElementById("replace-file-input");
    if (input) {
      input.value = "";
    }
    renderSelectedClientDetail();
  }
}

async function deleteAdminDocument(documentId) {
  const documentItem = state.allDocuments.find((item) => item.id === documentId);
  if (!documentItem) {
    return;
  }

  const approved = window.confirm(
    currentLang() === "en"
      ? `Delete ${documentItem.file_name || documentItem.name}?`
      : `Ù‡Ù„ ØªØ±ÙŠØ¯ Ø­Ø°Ù ${documentItem.file_name || documentItem.name}ØŸ`,
  );
  if (!approved) {
    return;
  }

  state.deletingDocumentId = documentId;
  renderSelectedClientDetail();

  try {
    await deleteDoc(doc(db, PORTAL_CONFIG.collections.documents, documentId));

    try {
      await deleteStorageFile(documentItem.path);
    } catch (cleanupError) {
      console.warn("Storage cleanup failed after deleting document row.", cleanupError);
    }

    showToast("ok", t("ØªÙ… Ø­Ø°Ù Ø§Ù„Ù…Ù„Ù", "File Deleted"), currentLang() === "en"
      ? `${documentItem.file_name || documentItem.name} was removed.`
      : `ØªÙ… Ø­Ø°Ù Ø§Ù„Ù…Ù„Ù ${documentItem.file_name || documentItem.name}.`);
  } catch (error) {
    console.error("Admin document delete failed.", error);
    showToast("err", t("ØªØ¹Ø°Ø± Ø­Ø°Ù Ø§Ù„Ù…Ù„Ù", "Delete Failed"), error.message || t("ØªØ¹Ø°Ø± Ø­Ø°Ù Ø§Ù„Ù…Ù„Ù Ø§Ù„Ø¢Ù†.", "We could not delete the file right now."));
  } finally {
    state.deletingDocumentId = null;
    renderSelectedClientDetail();
  }
}

async function downloadDocument(documentId) {
  const documentItem = state.allDocuments.find((item) => item.id === documentId);
  if (!documentItem?.path) {
    showToast("err", t("Ø§Ù„Ù…Ù„Ù ØºÙŠØ± Ù…ØªØ§Ø­", "File Unavailable"), t("Ù‡Ø°Ø§ Ø§Ù„Ù…Ù„Ù ØºÙŠØ± Ø¬Ø§Ù‡Ø² Ù„Ù„ØªÙ†Ø²ÙŠÙ„ Ø­Ø§Ù„ÙŠØ§Ù‹.", "This file is not available for download right now."));
    return;
  }

  try {
    await downloadStorageFile(documentItem.path, getDocumentDownloadName(documentItem));
  } catch (error) {
    console.error("Document download failed.", error);
    showToast("err", t("ØªØ¹Ø°Ø± Ø§Ù„ØªÙ†Ø²ÙŠÙ„", "Download Failed"), t("ØªØ¹Ø°Ø± ØªÙ†Ø²ÙŠÙ„ Ø§Ù„Ù…Ù„Ù Ø§Ù„Ø¢Ù†.", "We could not download the file right now."));
  }
}

async function uploadLibDoc() {
  const title = document.getElementById("lib-title").value.trim();
  const category = document.getElementById("lib-cat").value;
  const file = document.getElementById("lib-file").files[0];

  showMessage("lib-msg", "", "");

  if (!title || !file) {
    showMessage("lib-msg", "err", t("ÙŠØ±Ø¬Ù‰ Ø¥Ø¯Ø®Ø§Ù„ Ø¹Ù†ÙˆØ§Ù† ÙˆØ§Ø®ØªÙŠØ§Ø± Ù…Ù„Ù.", "Please enter a title and choose a file."));
    return;
  }

  const path = `${PORTAL_CONFIG.storagePaths.legalLibrary}/${Date.now()}-${safeFileName(file.name)}`;
  const categoryKey = makeStableKey(category || "general", "legacy");
  const fileExtension = String(file.name.split(".").pop() || "pdf").toUpperCase();

  try {
    await uploadBytes(ref(storage, path), file, { contentType: file.type || "application/pdf" });
    await addDoc(collection(db, PORTAL_CONFIG.collections.legalDocuments), {
      title,
      title_ar: title,
      title_en: title,
      category_key: categoryKey,
      category_name: category,
      category_sub: "",
      category,
      path,
      file_name: file.name,
      file_size: file.size || 0,
      mime_type: file.type || "application/pdf",
      file_extension: fileExtension,
      file_kind: fileExtension.toLowerCase(),
      visibility: "published",
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    document.getElementById("lib-title").value = "";
    document.getElementById("lib-file").value = "";
    showMessage("lib-msg", "ok", t("ØªÙ… Ø±ÙØ¹ Ø§Ù„Ù…Ø³ØªÙ†Ø¯ Ø¨Ù†Ø¬Ø§Ø­.", "Document uploaded successfully."));
  } catch (error) {
    console.error("Library upload failed.", error);
    showMessage("lib-msg", "err", error.message || t("ØªØ¹Ø°Ø± Ø±ÙØ¹ Ø§Ù„Ù…Ø³ØªÙ†Ø¯.", "Could not upload the document."));
  }
}

function filterClients() {
  renderClientList();
}

function exportCSV() {
  const rows = [["Username", "Phone", "Client ID", "Status", "Files Sent", "Files Submitted"]];
  state.allClients.forEach((client) => {
    rows.push([
      client.username || "",
      client.phone || "",
      client.id || "",
      client.status || "active",
      String(getClientDocuments(client.id, "admin_to_client").length),
      String(getClientDocuments(client.id, "client_to_admin").length),
    ]);
  });

  // CSV with BOM for proper UTF-8 encoding in Excel
  const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
  
  // Use Blob to ensure proper UTF-8 encoding
  const BOM = "\uFEFF"; // UTF-8 BOM for Excel compatibility
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.href = url;
  link.download = "clients.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  
  URL.revokeObjectURL(url);
}

function showTab(id, button) {
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
  document.getElementById(`panel-${id}`).classList.add("active");
  if (button) {
    button.classList.add("active");
  }
}

function openModal(id) {
  document.getElementById(id).classList.add("open");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

function bindWorkspaceDropZone() {
  const zone = document.getElementById("workspace-upload-zone");
  if (!zone) {
    return;
  }

  ["dragenter", "dragover"].forEach((eventName) => {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.add("dragover");
    });
  });

  ["dragleave", "dragend", "drop"].forEach((eventName) => {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.remove("dragover");
    });
  });

  zone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      uploadSelectedClientFile(file);
    }
  });
}

async function doLogout() {
  state.clientsUnsubscribe?.();
  state.documentsUnsubscribe?.();
  state.adminUnsubscribe?.();
  revokeHiddenAdminAccess();
  await signOut(auth);
  goToLogin();
}

function setLang(language) {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  document.getElementById("btn-ar").classList.toggle("active", language === "ar");
  document.getElementById("btn-en").classList.toggle("active", language === "en");
  localStorage.setItem("ask-lang", language);
  renderWorkspace();
}

document.querySelectorAll(".overlay").forEach((overlay) => {
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      overlay.classList.remove("open");
    }
  });
});

document.getElementById("client-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-client-id]");
  if (!button) {
    return;
  }

  setSelectedClient(button.dataset.clientId);
});

document.getElementById("selected-client-detail").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const documentId = button.dataset.docId;
  const client = getSelectedClient();

  if (action === "download-doc" && documentId) {
    downloadDocument(documentId);
    return;
  }

  if (action === "replace-doc" && documentId) {
    state.pendingReplaceDocumentId = documentId;
    document.getElementById("replace-file-input").click();
    return;
  }

  if (action === "delete-doc" && documentId) {
    deleteAdminDocument(documentId);
    return;
  }

  if (action === "status-client" && client) {
    openStatusModal(client.id, client.status || "active");
    return;
  }

  if (action === "edit-client" && client) {
    openEditModal(client.id);
    return;
  }

  if (action === "password-client" && client) {
    openPasswordModal(client.id);
    return;
  }

  if (action === "delete-client" && client) {
    deleteClientAccount(client.id);
  }

});

document.getElementById("selected-client-detail").addEventListener("change", (event) => {
  if (event.target.id !== "workspace-upload-file") {
    return;
  }

  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  uploadSelectedClientFile(file);
  event.target.value = "";
});

document.getElementById("replace-file-input").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  const documentId = state.pendingReplaceDocumentId;
  if (!file || !documentId) {
    event.target.value = "";
    return;
  }

  replaceAdminDocument(documentId, file);
});

window.addUpdate = addUpdate;
window.closeModal = closeModal;
window.createClient = createClient;
window.doLogout = doLogout;
window.exportCSV = exportCSV;
window.filterClients = filterClients;
window.openModal = openModal;
window.openEditModal = openEditModal;
window.openPasswordModal = openPasswordModal;
window.openStatusModal = openStatusModal;
window.saveClientEdit = saveClientEdit;
window.saveClientPassword = saveClientPassword;
window.setLang = setLang;
window.showTab = showTab;
window.updateStatus = updateStatus;
window.uploadClientDoc = uploadClientDoc;
window.uploadLibDoc = uploadLibDoc;

try {
  setLang(localStorage.getItem("ask-lang") || "ar");
} catch (error) {
  setLang("ar");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    goToLogin();
    return;
  }

  if (!hasHiddenAdminAccess()) {
    goToLogin();
    return;
  }

  state.adminUnsubscribe?.();

  try {
    const profile = await ensureUserProfile(user);
    if (profile.role !== "admin") {
      goToClientPortal();
      return;
    }
  } catch (error) {
    console.error("Could not verify the admin profile.", error);
    goToLogin();
    return;
  }

  state.adminUnsubscribe = subscribeUserProfile(
    user.uid,
    (profile) => {
      if (!profile) {
        goToLogin();
        return;
      }

      if (profile.role !== "admin") {
        goToClientPortal();
        return;
      }

      subscribeClients();
      subscribeDocuments();
    },
    (error) => {
      console.error("Could not subscribe to the admin user profile.", error);
      goToLogin();
    },
  );
});
