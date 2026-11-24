import {
  ADMIN_LIBRARY_CATEGORIES,
  DEFAULT_ADMIN_SETTINGS,
  clearAdminSession,
  createAdminSession,
  getAdminCategoryByKey,
  getAdminSession,
  loadAdminActivity,
  loadAdminDocuments,
  loadAdminSettings,
  saveAdminActivity,
  saveAdminDocuments,
  saveAdminSettings,
  sortAdminDocumentsForDisplay,
} from "./admin-prototype.js";
import {
  PORTAL_CONFIG,
  addDoc,
  auth,
  collection,
  db,
  deleteDoc,
  doc,
  ensureUserProfile,
  getDocs,
  onAuthStateChanged,
  onSnapshot,
  ref,
  safeFileName,
  serverTimestamp,
  signInWithUsernameAndPassword,
  signOut,
  storage,
  updateDoc,
  uploadBytes,
} from "./firebase-portal.js";

const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 25;
const FIREBASE_OPERATION_TIMEOUT_MS = 20000;

const VIEW_META = {
  overview: {
    breadcrumb: "Overview",
    title: 'Portal <em>Overview</em>',
    copy: "Track live publishing status, recent admin activity, and the health of the legal-library categories from one place.",
  },
  library: {
    breadcrumb: "Legal Library Manager",
    title: 'Legal Library <em>Manager</em>',
    copy: "Open a category drawer to upload files, tune metadata, pin featured documents, and manage public ordering.",
  },
  documents: {
    breadcrumb: "Documents",
    title: 'Document <em>Control</em>',
    copy: "Search across the full prototype archive, refine by category or status, and clean up multiple records at once.",
  },
  settings: {
    breadcrumb: "Settings",
    title: 'Admin <em>Settings</em>',
    copy: "Manage the internal admin identity displayed across the dashboard.",
  },
  clients: {
    breadcrumb: "Client Management",
    title: 'Client <em>Management</em>',
    copy: "Create username-only client accounts, update their portal details, and manage client-only files and passwords from one embedded workspace.",
  },
};

const state = {
  session: getAdminSession(),
  settings: loadAdminSettings(),
  documents: [],
  activity: loadAdminActivity(),
  currentView: "overview",
  selectedCategoryKey: ADMIN_LIBRARY_CATEGORIES[0]?.key || "",
  uploadDraft: null,
  editingDocumentId: null,
  selectedIds: new Set(),
  dragDocumentId: null,
  confirmAction: null,
  firebaseAdmin: null,
  documentsUnsubscribe: null,
  prototypeMigrationChecked: false,
  prototypeMigrationPromise: null,
};

function uid() {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateDisplay(value) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function timeAgo(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "just now";
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function fileSizeLabel(size) {
  if (!Number.isFinite(size) || size <= 0) {
    return "0 KB";
  }
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function parseDateValue(value) {
  if (!value) {
    return null;
  }
  if (typeof value.toDate === "function") {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIsoOrNull(value) {
  const date = parseDateValue(value);
  return date ? date.toISOString() : null;
}

function toTimestamp(value) {
  const date = parseDateValue(value);
  return date ? date.getTime() : 0;
}

function normalizeLiveDocument(documentItem) {
  return {
    ...documentItem,
    visibility: documentItem.visibility || "published",
    titleAr: documentItem.titleAr || documentItem.title_ar || "",
    titleEn: documentItem.titleEn || documentItem.title_en || "",
    documentType: documentItem.documentType || documentItem.document_type || "Law",
    documentDate: documentItem.documentDate || documentItem.document_date || null,
    isPinned: Boolean(documentItem.isPinned ?? documentItem.is_pinned),
    sortIndex: Number.isFinite(documentItem.sortIndex) ? documentItem.sortIndex : (
      Number.isFinite(documentItem.sort_index) ? documentItem.sort_index : null
    ),
    categoryKey: documentItem.categoryKey || documentItem.category_key || "",
    categoryName: documentItem.categoryName || documentItem.category_name || "",
    categorySub: documentItem.categorySub || documentItem.category_sub || "",
    createdAt: toIsoOrNull(documentItem.created_at) || documentItem.createdAt || null,
    updatedAt: toIsoOrNull(documentItem.updated_at) || documentItem.updatedAt || null,
    fileName: documentItem.fileName || documentItem.file_name || documentItem.title || "document",
    fileSize: documentItem.fileSize ?? documentItem.file_size ?? 0,
    mimeType: documentItem.mimeType || documentItem.mime_type || "application/octet-stream",
    fileExtension: documentItem.fileExtension || documentItem.file_extension || String((documentItem.fileName || documentItem.file_name || "").split(".").pop() || "pdf").toUpperCase(),
    fileKind: documentItem.fileKind || documentItem.file_kind || "pdf",
  };
}

function withDatabaseDocumentFields(documentItem = {}) {
  return {
    ...documentItem,
    title_ar: documentItem.titleAr,
    title_en: documentItem.titleEn,
    document_type: documentItem.documentType,
    document_date: documentItem.documentDate,
    is_pinned: documentItem.isPinned,
    sort_index: documentItem.sortIndex,
    category_key: documentItem.categoryKey,
    category_name: documentItem.categoryName,
    category_sub: documentItem.categorySub,
    file_name: documentItem.file_name || documentItem.fileName,
    file_size: documentItem.fileSize,
    mime_type: documentItem.mimeType,
    file_extension: documentItem.fileExtension,
    file_kind: documentItem.fileKind,
  };
}

function isLiveMode() {
  return Boolean(state.firebaseAdmin);
}

function requireLiveMode() {
  if (isLiveMode()) {
    return true;
  }
  showToast("Live access required", "Sign in with the real admin account in this dashboard so uploads become visible site-wide.");
  return false;
}

function getCategoryLabel(category) {
  if (!category) {
    return "Unknown category";
  }
  return `${category.name} / ${category.englishLabel}`;
}

function getDocumentCategory(documentItem) {
  return getAdminCategoryByKey(documentItem?.categoryKey);
}

function getDocumentTitle(documentItem) {
  return documentItem?.titleAr || documentItem?.titleEn || documentItem?.fileName || "Untitled document";
}

function getDocumentSubline(documentItem) {
  const parts = [
    documentItem?.titleEn && documentItem?.titleEn !== documentItem?.titleAr ? documentItem.titleEn : "",
    documentItem?.fileName,
  ].filter(Boolean);
  return parts.join(" • ");
}

function getFileTypeBadge(documentItem) {
  const extension = String(documentItem?.fileExtension || "").toUpperCase();
  if (extension === "PDF") {
    return "PDF";
  }
  if (["PNG", "JPG", "JPEG"].includes(extension)) {
    return "IMG";
  }
  if (["DOC", "DOCX"].includes(extension)) {
    return "DOC";
  }
  return extension || "FILE";
}

function getDocumentsForCategory(categoryKey) {
  return sortAdminDocumentsForDisplay(
    state.documents.filter((documentItem) => documentItem.categoryKey === categoryKey),
  );
}

function getLastUploadDate() {
  const dates = state.documents
    .map((documentItem) => new Date(documentItem.createdAt || documentItem.updatedAt || documentItem.documentDate).getTime())
    .filter((timestamp) => Number.isFinite(timestamp));
  if (!dates.length) {
    return null;
  }
  return new Date(Math.max(...dates)).toISOString();
}

function getStatsCards() {
  const publishedCount = state.documents.filter((item) => item.visibility === "published").length;
  const lastUploadSub = isLiveMode()
    ? "Most recent item saved to the live database for the public legal library"
    : "Connect the live admin account to manage real published documents";
  return [
    {
      label: "Total Documents",
      value: String(state.documents.length),
      sub: `${publishedCount} published live in the legal library`,
    },
    {
      label: "Total Categories",
      value: String(ADMIN_LIBRARY_CATEGORIES.length),
      sub: "ASK core legal-library categories currently managed",
    },
    {
      label: "Last Upload",
      value: state.documents.length ? formatDateDisplay(getLastUploadDate()) : "No uploads",
      sub: state.documents.length ? lastUploadSub : "The dashboard is ready for its first document",
    },
    {
      label: "Pinned Documents",
      value: String(state.documents.filter((item) => item.isPinned).length),
      sub: "Featured items that will always float to the top",
    },
  ];
}

function persistDocuments(nextDocuments) {
  state.documents = nextDocuments;
  saveAdminDocuments(nextDocuments);
  syncSelectedIds();
}

function persistSettings(nextSettings) {
  state.settings = saveAdminSettings(nextSettings);
}

function persistActivity(nextActivity) {
  state.activity = nextActivity.slice(0, 80);
  saveAdminActivity(state.activity);
}

function addActivity(message, detail = "") {
  const nextActivity = [
    {
      id: uid(),
      message,
      detail,
      timestamp: new Date().toISOString(),
    },
    ...state.activity,
  ];
  persistActivity(nextActivity);
}

function syncSelectedIds() {
  const currentIds = new Set(state.documents.map((documentItem) => documentItem.id));
  state.selectedIds = new Set([...state.selectedIds].filter((id) => currentIds.has(id)));
}

function showToast(title, message) {
  const stack = document.getElementById("toast-stack");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<strong>${escapeHtml(title)}</strong>${escapeHtml(message)}`;
  stack.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

function showInlineError(elementId, message) {
  const box = document.getElementById(elementId);
  if (!message) {
    box.textContent = "";
    box.classList.remove("show");
    return;
  }

  box.textContent = message;
  box.classList.add("show");
}

function withTimeout(promise, label, timeoutMs = FIREBASE_OPERATION_TIMEOUT_MS) {
  let timerId = null;

  return Promise.race([
    promise.finally(() => {
      if (timerId) {
        clearTimeout(timerId);
      }
    }),
    new Promise((_, reject) => {
      timerId = window.setTimeout(() => {
        reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds.`));
      }, timeoutMs);
    }),
  ]);
}

function setDocumentActionState(loading, visibility = "draft") {
  const publishButton = document.getElementById("publish-btn");
  const draftButton = document.getElementById("save-draft-btn");
  const publishLoading = loading && visibility === "published";
  const draftLoading = loading && visibility === "draft";

  publishButton.disabled = Boolean(loading);
  draftButton.disabled = Boolean(loading);
  publishButton.textContent = publishLoading ? "Publishing..." : "Publish";
  draftButton.textContent = draftLoading ? "Saving..." : "Save Draft";
}

function openConfirm({ title, copy, onAccept }) {
  state.confirmAction = onAccept;
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-copy").textContent = copy;
  document.getElementById("confirm-modal").classList.remove("hidden");
}

function closeConfirm() {
  state.confirmAction = null;
  document.getElementById("confirm-modal").classList.add("hidden");
}

function resetEditor() {
  state.uploadDraft = null;
  state.editingDocumentId = null;
  document.getElementById("metadata-form").reset();
  document.getElementById("metadata-wrap").classList.add("hidden");
  document.getElementById("staged-file-wrap").classList.add("hidden");
}

function getEditingDocument() {
  return state.documents.find((documentItem) => documentItem.id === state.editingDocumentId) || null;
}

function renderTopbar() {
  const meta = VIEW_META[state.currentView];
  document.getElementById("breadcrumb").innerHTML = `<span>Dashboard</span><span>/</span><span>${escapeHtml(meta.breadcrumb)}</span>`;
  document.getElementById("view-title").innerHTML = meta.title;
  document.getElementById("view-copy").textContent = meta.copy;
  document.getElementById("admin-name").textContent = state.firebaseAdmin?.profile?.full_name || state.session?.displayName || state.settings.displayName;

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.currentView);
  });
  document.querySelectorAll(".content-view").forEach((view) => {
    view.classList.toggle("active", view.id === `view-${state.currentView}`);
  });
}

function renderStats() {
  document.getElementById("stats-row").innerHTML = getStatsCards()
    .map(
      (card) => `
        <article class="stat-card">
          <div class="stat-label">${escapeHtml(card.label)}</div>
          <div class="stat-value">${escapeHtml(card.value)}</div>
          <div class="stat-sub">${escapeHtml(card.sub)}</div>
        </article>`,
    )
    .join("");
}

function renderOverview() {
  const activityList = document.getElementById("activity-list");
  if (!state.activity.length) {
    activityList.innerHTML = '<div class="empty-state"><strong>No activity yet</strong>The first upload, publish, edit, or delete action will appear here.</div>';
  } else {
    activityList.innerHTML = state.activity.slice(0, 8).map((entry) => `
      <article class="activity-item">
        <div class="activity-main">
          <strong>${escapeHtml(entry.message)}</strong>
          <span>${escapeHtml(entry.detail || "Prototype activity recorded locally in this browser.")}</span>
        </div>
        <div class="activity-time">${escapeHtml(timeAgo(entry.timestamp))}</div>
      </article>`).join("");
  }

  const snapshotGrid = document.getElementById("snapshot-grid");
  snapshotGrid.innerHTML = ADMIN_LIBRARY_CATEGORIES.map((category) => {
    const docs = getDocumentsForCategory(category.key);
    const published = docs.filter((item) => item.visibility === "published").length;
    return `
      <article class="snapshot-card">
        <h4>${escapeHtml(category.name)}</h4>
        <p>${escapeHtml(category.englishLabel)}</p>
        <div class="snapshot-item">
          <div class="snapshot-main">
            <strong>${docs.length} document${docs.length === 1 ? "" : "s"}</strong>
            <span>${published} published live, ${docs.length - published} in draft.</span>
          </div>
          <div class="snapshot-count">${String(docs.length).padStart(2, "0")}</div>
        </div>
      </article>`;
  }).join("");
}

function renderCategoryGrid() {
  const grid = document.getElementById("category-grid");
  grid.innerHTML = ADMIN_LIBRARY_CATEGORIES.map((category) => {
    const docs = getDocumentsForCategory(category.key);
    const published = docs.filter((item) => item.visibility === "published").length;
    return `
      <article class="category-card" data-category-key="${escapeHtml(category.key)}">
        <div class="count-badge">${docs.length}</div>
        <h3>${escapeHtml(category.name)}</h3>
        <p>${escapeHtml(category.englishLabel)}. ${published} published item${published === 1 ? "" : "s"} currently live.</p>
        <div class="foot">
          <span>${escapeHtml(category.sub)}</span>
          <span>Open Manager</span>
        </div>
      </article>`;
  }).join("");
}

function getFilteredDocuments() {
  const searchValue = document.getElementById("doc-search").value.trim().toLowerCase();
  const categoryValue = document.getElementById("doc-category-filter").value;
  const statusValue = document.getElementById("doc-status-filter").value;

  return state.documents.filter((documentItem) => {
    const category = getDocumentCategory(documentItem);
    const haystack = [
      documentItem.titleAr,
      documentItem.titleEn,
      documentItem.description,
      documentItem.fileName,
      category?.name,
      category?.englishLabel,
      ...(documentItem.tags || []),
    ].filter(Boolean).join(" ").toLowerCase();

    const searchMatch = !searchValue || haystack.includes(searchValue);
    const categoryMatch = categoryValue === "all" || documentItem.categoryKey === categoryValue;
    const statusMatch = statusValue === "all" || documentItem.visibility === statusValue;
    return searchMatch && categoryMatch && statusMatch;
  }).sort((left, right) => {
    const leftTime = new Date(left.updatedAt || left.createdAt || left.documentDate).getTime();
    const rightTime = new Date(right.updatedAt || right.createdAt || right.documentDate).getTime();
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });
}

function renderDocumentFilters() {
  const filter = document.getElementById("doc-category-filter");
  const currentValue = filter.value || "all";
  filter.innerHTML = [
    '<option value="all">All categories</option>',
    ...ADMIN_LIBRARY_CATEGORIES.map((category) => `<option value="${escapeHtml(category.key)}">${escapeHtml(getCategoryLabel(category))}</option>`),
  ].join("");
  filter.value = ADMIN_LIBRARY_CATEGORIES.some((category) => category.key === currentValue) ? currentValue : "all";
}

function renderDocumentsTable() {
  renderDocumentFilters();
  const documents = getFilteredDocuments();
  const body = document.getElementById("documents-table-body");

  if (!documents.length) {
    body.innerHTML = '<tr><td colspan="7"><div class="empty-state"><strong>No matching documents</strong>Try another search term or category filter.</div></td></tr>';
    document.getElementById("bulk-delete-btn").disabled = true;
    document.getElementById("select-all-docs").checked = false;
    return;
  }

  body.innerHTML = documents.map((documentItem) => {
    const category = getDocumentCategory(documentItem);
    return `
      <tr>
        <td><input class="checkbox row-selector" data-id="${escapeHtml(documentItem.id)}" type="checkbox" ${state.selectedIds.has(documentItem.id) ? "checked" : ""}></td>
        <td>
          <div class="doc-title">
            <strong>${escapeHtml(getDocumentTitle(documentItem))}</strong>
            <span>${escapeHtml(getDocumentSubline(documentItem) || documentItem.description || "No extra metadata added yet.")}</span>
          </div>
        </td>
        <td>${escapeHtml(getCategoryLabel(category))}</td>
        <td>
          <div class="row-actions">
            <span class="pill ${escapeHtml(documentItem.visibility)}">${escapeHtml(documentItem.visibility)}</span>
            ${documentItem.isPinned ? '<span class="pill pinned">Pinned</span>' : ""}
          </div>
        </td>
        <td>
          <div class="row-actions">
            <span class="pill type">${escapeHtml(documentItem.documentType || "General")}</span>
            <span class="pill type">${escapeHtml(getFileTypeBadge(documentItem))}</span>
          </div>
        </td>
        <td>${escapeHtml(formatDateDisplay(documentItem.documentDate || documentItem.createdAt))}</td>
        <td>
          <div class="row-actions">
            <button class="action-btn" data-table-action="edit" data-id="${escapeHtml(documentItem.id)}" type="button">Edit</button>
            <button class="action-btn" data-table-action="open-category" data-id="${escapeHtml(documentItem.id)}" type="button">Category</button>
            <button class="action-btn danger" data-table-action="delete" data-id="${escapeHtml(documentItem.id)}" type="button">Delete</button>
          </div>
        </td>
      </tr>`;
  }).join("");

  document.getElementById("bulk-delete-btn").disabled = state.selectedIds.size === 0;
  document.getElementById("select-all-docs").checked = documents.length > 0 && documents.every((documentItem) => state.selectedIds.has(documentItem.id));
}

function renderSettings() {
  document.getElementById("settings-name").value = state.settings.displayName || "";
}

function renderDrawerHeader() {
  const category = getAdminCategoryByKey(state.selectedCategoryKey);
  if (!category) {
    return;
  }

  document.getElementById("drawer-title").textContent = category.name;
  document.getElementById("drawer-copy").textContent = `${category.englishLabel}. Upload files, manage drafts, and control public ordering.`;
}

function renderStagedFile() {
  const stagedWrap = document.getElementById("staged-file-wrap");
  const stagedFile = document.getElementById("staged-file");
  const editingDocument = getEditingDocument();

  if (state.uploadDraft) {
    stagedWrap.classList.remove("hidden");
    stagedFile.innerHTML = `
      <div>
        <strong>${escapeHtml(state.uploadDraft.fileName)}</strong>
        <span>${escapeHtml(getFileTypeBadge(state.uploadDraft))} • ${escapeHtml(fileSizeLabel(state.uploadDraft.fileSize))}</span>
      </div>
      <button class="action-btn" id="replace-staged-file" type="button">Replace</button>`;
    return;
  }

  if (editingDocument) {
    stagedWrap.classList.remove("hidden");
    stagedFile.innerHTML = `
      <div>
        <strong>${escapeHtml(editingDocument.fileName || getDocumentTitle(editingDocument))}</strong>
        <span>${escapeHtml(getFileTypeBadge(editingDocument))} • ${escapeHtml(fileSizeLabel(editingDocument.fileSize))}</span>
      </div>
      <button class="action-btn" id="replace-staged-file" type="button">Replace File</button>`;
    return;
  }

  stagedWrap.classList.add("hidden");
  stagedFile.innerHTML = "";
}

function openMetadataPanel(title, copy) {
  document.getElementById("metadata-title").textContent = title;
  document.getElementById("metadata-copy").textContent = copy;
  document.getElementById("metadata-wrap").classList.remove("hidden");
}

function fillMetadataForm(documentItem) {
  document.getElementById("meta-title-ar").value = documentItem?.titleAr || "";
  document.getElementById("meta-title-en").value = documentItem?.titleEn || "";
  document.getElementById("meta-date").value = documentItem?.documentDate || new Date().toISOString().slice(0, 10);
  document.getElementById("meta-document-type").value = documentItem?.documentType || "Law";
  document.getElementById("meta-tags").value = (documentItem?.tags || []).join(", ");
  document.getElementById("meta-description").value = documentItem?.description || "";
  document.getElementById("meta-pin").checked = Boolean(documentItem?.isPinned);
}

function renderDrawerList() {
  const documents = getDocumentsForCategory(state.selectedCategoryKey);
  const list = document.getElementById("drawer-document-list");
  document.getElementById("drawer-doc-count").textContent = `${documents.length} document${documents.length === 1 ? "" : "s"}`;

  if (!documents.length) {
    list.innerHTML = '<div class="empty-state"><strong>Empty category</strong>Drop a file above to create the first document in this section.</div>';
    return;
  }

  list.innerHTML = documents.map((documentItem) => `
    <article class="drawer-card" draggable="true" data-id="${escapeHtml(documentItem.id)}">
      <div class="drawer-top">
        <div class="meta">
          <div class="file-icon">${escapeHtml(getFileTypeBadge(documentItem))}</div>
          <div class="file-info">
            <strong>${escapeHtml(getDocumentTitle(documentItem))}</strong>
            <span>${escapeHtml(formatDateDisplay(documentItem.documentDate || documentItem.createdAt))} • ${escapeHtml(documentItem.documentType || "General")} • ${escapeHtml(documentItem.visibility)}</span>
            <span>${escapeHtml(getDocumentSubline(documentItem) || documentItem.description || "No description added yet.")}</span>
          </div>
        </div>
        <div class="drawer-actions">
          ${documentItem.isPinned ? '<span class="pill pinned">Pinned</span>' : ""}
          <span class="pill ${escapeHtml(documentItem.visibility)}">${escapeHtml(documentItem.visibility)}</span>
        </div>
      </div>
      ${(documentItem.tags || []).length ? `<div class="drawer-tags">${documentItem.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      <div class="drawer-actions">
        <button class="action-btn" data-drawer-action="edit" data-id="${escapeHtml(documentItem.id)}" type="button">Edit</button>
        <button class="action-btn ${documentItem.visibility === "published" ? "" : "gold"}" data-drawer-action="toggle-visibility" data-id="${escapeHtml(documentItem.id)}" type="button">${documentItem.visibility === "published" ? "Move to Draft" : "Publish"}</button>
        <button class="action-btn" data-drawer-action="toggle-pin" data-id="${escapeHtml(documentItem.id)}" type="button">${documentItem.isPinned ? "Unpin" : "Pin"}</button>
        <button class="action-btn danger" data-drawer-action="delete" data-id="${escapeHtml(documentItem.id)}" type="button">Delete</button>
      </div>
    </article>`).join("");
}

function renderDrawer() {
  const shell = document.getElementById("drawer-shell");
  if (!shell.classList.contains("open")) {
    return;
  }

  renderDrawerHeader();
  renderStagedFile();
  renderDrawerList();
}

function renderAll() {
  renderTopbar();
  renderStats();
  renderOverview();
  renderCategoryGrid();
  renderDocumentsTable();
  renderSettings();
  renderDrawer();
}

function unsubscribeLiveDocuments() {
  if (typeof state.documentsUnsubscribe === "function") {
    state.documentsUnsubscribe();
    state.documentsUnsubscribe = null;
  }
}

function subscribeLiveDocuments() {
  unsubscribeLiveDocuments();
  state.documentsUnsubscribe = onSnapshot(
    collection(db, PORTAL_CONFIG.collections.legalDocuments, { includeDrafts: true }),
    (snapshot) => {
      state.documents = sortAdminDocumentsForDisplay(
        snapshot.docs.map((item) => normalizeLiveDocument({ id: item.id, ...item.data() })),
      );
      syncSelectedIds();
      renderAll();
    },
    (error) => {
      console.error("Could not subscribe to legal documents.", error);
      showToast("Sync issue", "The dashboard could not read the live legal-library documents.");
    },
  );
}

async function uploadDraftToFirebase(category, uploadDraft) {
  const path = `${PORTAL_CONFIG.storagePaths.legalLibrary}/${category.key}/${Date.now()}-${safeFileName(uploadDraft.fileName)}`;
  await uploadBytes(ref(storage, path), uploadDraft.fileObject, {
    contentType: uploadDraft.mimeType || "application/octet-stream",
  });
  return path;
}

function buildDocumentFingerprint(documentItem) {
  return [
    documentItem?.categoryKey,
    documentItem?.titleAr || documentItem?.title,
    documentItem?.titleEn || "",
    documentItem?.fileName || documentItem?.file_name,
    documentItem?.documentDate || "",
  ].map((value) => String(value || "").trim().toLowerCase()).join("|");
}

async function migratePrototypeDocumentsIfNeeded() {
  if (!isLiveMode()) {
    return null;
  }

  if (state.prototypeMigrationPromise) {
    return state.prototypeMigrationPromise;
  }

  if (state.prototypeMigrationChecked) {
    return null;
  }

  state.prototypeMigrationPromise = (async () => {
    const prototypeDocs = loadAdminDocuments().filter((item) => item?.fileDataUrl);
    state.prototypeMigrationChecked = true;

    if (!prototypeDocs.length) {
      return { importedCount: 0, skippedCount: 0 };
    }

    const liveSnapshot = await getDocs(collection(db, PORTAL_CONFIG.collections.legalDocuments, { includeDrafts: true }));
    const existingFingerprints = new Set(
      liveSnapshot.docs.map((item) => buildDocumentFingerprint(item.data())),
    );

    let importedCount = 0;
    let skippedCount = 0;

    for (const prototypeDoc of prototypeDocs) {
      const fingerprint = buildDocumentFingerprint(prototypeDoc);
      if (existingFingerprints.has(fingerprint)) {
        skippedCount += 1;
        continue;
      }

      const category = getAdminCategoryByKey(prototypeDoc.categoryKey);
      if (!category) {
        skippedCount += 1;
        continue;
      }

      const response = await fetch(prototypeDoc.fileDataUrl);
      const blob = await response.blob();
      const path = `${PORTAL_CONFIG.storagePaths.legalLibrary}/${category.key}/${Date.now()}-${safeFileName(prototypeDoc.fileName)}`;

      await uploadBytes(ref(storage, path), blob, {
        contentType: prototypeDoc.mimeType || blob.type || "application/octet-stream",
      });

      await addDoc(collection(db, PORTAL_CONFIG.collections.legalDocuments), withDatabaseDocumentFields({
        title: prototypeDoc.titleAr || prototypeDoc.titleEn || prototypeDoc.fileName || "Untitled document",
        titleAr: prototypeDoc.titleAr || "",
        titleEn: prototypeDoc.titleEn || "",
        description: prototypeDoc.description || "",
        tags: Array.isArray(prototypeDoc.tags) ? prototypeDoc.tags : [],
        documentType: prototypeDoc.documentType || "Law",
        documentDate: prototypeDoc.documentDate || new Date().toISOString().slice(0, 10),
        visibility: prototypeDoc.visibility || "published",
        isPinned: Boolean(prototypeDoc.isPinned),
        sortIndex: Number.isFinite(prototypeDoc.sortIndex) ? prototypeDoc.sortIndex : null,
        categoryKey: category.key,
        categoryName: category.name,
        categorySub: category.sub,
        category: category.sub ? `${category.name} - ${category.sub}` : category.name,
        path,
        fileName: prototypeDoc.fileName || "document",
        file_name: prototypeDoc.fileName || "document",
        fileSize: prototypeDoc.fileSize || blob.size || 0,
        mimeType: prototypeDoc.mimeType || blob.type || "application/octet-stream",
        fileExtension: prototypeDoc.fileExtension || String((prototypeDoc.fileName || "").split(".").pop() || "pdf").toUpperCase(),
        fileKind: prototypeDoc.fileKind || "pdf",
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      }));

      existingFingerprints.add(fingerprint);
      importedCount += 1;
    }

    saveAdminDocuments([]);

    if (importedCount) {
      addActivity(
        "Migrated prototype uploads",
        `${importedCount} earlier browser-only document${importedCount === 1 ? "" : "s"} were copied into the live database.`,
      );
      showToast("Migration complete", `${importedCount} earlier browser-only document${importedCount === 1 ? "" : "s"} were moved into the live database.`);
    } else if (skippedCount) {
      showToast("Migration checked", "The earlier browser-only uploads were already present in the live database.");
    }

    return { importedCount, skippedCount };
  })().catch((error) => {
    state.prototypeMigrationChecked = false;
    console.error("Prototype migration failed.", error);
    showToast("Migration failed", "Earlier browser-only uploads could not be copied into the live database.");
    return null;
  }).finally(() => {
    state.prototypeMigrationPromise = null;
  });

  return state.prototypeMigrationPromise;
}

function setView(viewKey) {
  if (!VIEW_META[viewKey]) {
    return;
  }
  state.currentView = viewKey;
  renderAll();
}

function openDrawer(categoryKey) {
  state.selectedCategoryKey = categoryKey;
  document.getElementById("drawer-shell").classList.add("open");
  resetEditor();
  renderDrawer();
}

function closeDrawer() {
  document.getElementById("drawer-shell").classList.remove("open");
  resetEditor();
}

function classifyFile(file) {
  const extension = String(file.name.split(".").pop() || "").toUpperCase();
  return {
    fileExtension: extension,
    fileKind: ["PNG", "JPG", "JPEG"].includes(extension) ? "image" : ["DOC", "DOCX"].includes(extension) ? "word" : "pdf",
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("File read failed."));
    reader.readAsDataURL(file);
  });
}

async function stageFile(file) {
  if (!file) {
    return;
  }

  const extension = String(file.name.split(".").pop() || "").toLowerCase();
  if (!["pdf", "png", "jpg", "jpeg", "doc", "docx"].includes(extension)) {
    showToast("Upload blocked", "Only PDF, JPG, PNG, DOC, and DOCX files are supported in this prototype.");
    return;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    showToast("Upload blocked", "Please keep each upload under about 25 MB.");
    return;
  }

  if (file.size <= 0) {
    showToast("Upload blocked", "This file is empty (0 KB). Please choose a real file before publishing.");
    return;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    state.uploadDraft = {
      id: uid(),
      fileObject: file,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      fileDataUrl: dataUrl,
      ...classifyFile(file),
    };

    openMetadataPanel("Publish Document", "Fill in Arabic and English metadata, then publish live or save a private draft.");
    fillMetadataForm();
    renderDrawer();
  } catch (error) {
    console.error("Could not stage the selected file.", error);
    showToast("Upload blocked", "The selected file could not be read in the browser.");
  }
}

async function saveDocumentRecord(visibility) {
  const titleAr = document.getElementById("meta-title-ar").value.trim();
  const titleEn = document.getElementById("meta-title-en").value.trim();
  const documentDate = document.getElementById("meta-date").value;
  const documentType = document.getElementById("meta-document-type").value;
  const tags = document.getElementById("meta-tags").value.split(",").map((item) => item.trim()).filter(Boolean);
  const description = document.getElementById("meta-description").value.trim();
  const isPinned = document.getElementById("meta-pin").checked;

  if (!titleAr && !titleEn) {
    showToast("Missing title", "Add at least one Arabic or English title before saving the document.");
    return;
  }

  if (!documentDate) {
    showToast("Missing date", "Choose the document date before publishing or saving a draft.");
    return;
  }

  const category = getAdminCategoryByKey(state.selectedCategoryKey);
  const editingDocument = getEditingDocument();
  const sourceFile = state.uploadDraft || editingDocument;

  if (!category) {
    showToast("Missing category", "Choose a legal-library category first, then try publishing again.");
    return;
  }

  if (!sourceFile) {
    showToast("No file selected", "Drop a file into the drawer before saving the document.");
    return;
  }

  if (state.uploadDraft?.fileObject && Number(state.uploadDraft.fileSize || 0) <= 0) {
    showToast("Empty file", "This selected file is 0 KB. Replace it with a real file before publishing.");
    return;
  }

  if (!requireLiveMode()) {
    return;
  }

  setDocumentActionState(true, visibility);

  if (isLiveMode()) {
    try {
      let path = editingDocument?.path || "";
      let fileName = editingDocument?.fileName || "";
      let fileSize = editingDocument?.fileSize || 0;
      let mimeType = editingDocument?.mimeType || "";
      let fileExtension = editingDocument?.fileExtension || "";
      let fileKind = editingDocument?.fileKind || "";

      if (state.uploadDraft?.fileObject) {
        path = await withTimeout(
          uploadDraftToFirebase(category, state.uploadDraft),
          "File upload",
        );
        fileName = state.uploadDraft.fileName;
        fileSize = state.uploadDraft.fileSize;
        mimeType = state.uploadDraft.mimeType;
        fileExtension = state.uploadDraft.fileExtension;
        fileKind = state.uploadDraft.fileKind;
      }

      const livePayload = withDatabaseDocumentFields({
        title: titleAr || titleEn,
        titleAr,
        titleEn,
        description,
        tags,
        documentType,
        documentDate,
        visibility,
        isPinned,
        sortIndex: editingDocument?.sortIndex ?? null,
        categoryKey: category.key,
        categoryName: category.name,
        categorySub: category.sub,
        category: category.sub ? `${category.name} - ${category.sub}` : category.name,
        path,
        fileName,
        file_name: fileName,
        fileSize,
        mimeType,
        fileExtension,
        fileKind,
        updated_at: serverTimestamp(),
      });

      if (editingDocument) {
        await withTimeout(
          updateDoc(doc(db, PORTAL_CONFIG.collections.legalDocuments, editingDocument.id), livePayload),
          "Database update",
        );
        state.documents = state.documents.map((documentItem) => (
          documentItem.id === editingDocument.id
            ? normalizeLiveDocument({
              ...documentItem,
              ...livePayload,
              id: editingDocument.id,
              created_at: documentItem.created_at || documentItem.createdAt || new Date(),
            })
            : documentItem
        ));
      } else {
        const createdDocument = await withTimeout(
          addDoc(collection(db, PORTAL_CONFIG.collections.legalDocuments), {
            ...livePayload,
            created_at: serverTimestamp(),
          }),
          "Database create",
        );
        state.documents = sortAdminDocumentsForDisplay([
          normalizeLiveDocument({
            id: createdDocument.id,
            ...livePayload,
            created_at: new Date(),
          }),
          ...state.documents,
        ]);
      }

      addActivity(
        editingDocument ? `Updated ${getDocumentTitle(livePayload)}` : `Uploaded ${getDocumentTitle(livePayload)}`,
        `${visibility === "published" ? "Published" : "Saved as draft"} in ${category.name}.`,
      );
      showToast("Saved", visibility === "published" ? "Document published successfully." : "Draft saved successfully.");
      resetEditor();
      renderAll();
      return;
    } catch (error) {
      console.error("Live document save failed.", error);
      showToast("Save failed", error?.message ? `Database error: ${error.message}` : "The document could not be saved to the live database.");
      return;
    } finally {
      setDocumentActionState(false, visibility);
    }
  }

  try {
    const now = new Date().toISOString();
    const nextRecord = {
      id: editingDocument?.id || uid(),
      categoryKey: category.key,
      categoryName: category.name,
      categorySub: category.sub,
      category: category.sub ? `${category.name} - ${category.sub}` : category.name,
      titleAr,
      titleEn,
      description,
      tags,
      documentType,
      documentDate,
      visibility,
      isPinned,
      sortIndex: editingDocument?.sortIndex ?? null,
      fileName: sourceFile.fileName,
      fileSize: sourceFile.fileSize,
      mimeType: sourceFile.mimeType,
      fileExtension: sourceFile.fileExtension,
      fileKind: sourceFile.fileKind,
      fileDataUrl: sourceFile.fileDataUrl,
      createdAt: editingDocument?.createdAt || now,
      updatedAt: now,
    };

    const nextDocuments = editingDocument
      ? state.documents.map((documentItem) => documentItem.id === editingDocument.id ? nextRecord : documentItem)
      : [nextRecord, ...state.documents];

    persistDocuments(nextDocuments);
    addActivity(
      editingDocument ? `Updated ${getDocumentTitle(nextRecord)}` : `Uploaded ${getDocumentTitle(nextRecord)}`,
      `${visibility === "published" ? "Published" : "Saved as draft"} in ${category.name}.`,
    );
    showToast("Saved", visibility === "published" ? "Document published successfully." : "Draft saved successfully.");
    resetEditor();
    renderAll();
  } catch (error) {
    console.error("Prototype document save failed.", error);
    showToast("Save failed", "The document could not be saved in this browser session.");
  } finally {
    setDocumentActionState(false, visibility);
  }
}

function startEditDocument(documentId) {
  const documentItem = state.documents.find((item) => item.id === documentId);
  if (!documentItem) {
    return;
  }

  state.selectedCategoryKey = documentItem.categoryKey;
  state.editingDocumentId = documentItem.id;
  state.uploadDraft = null;
  document.getElementById("drawer-shell").classList.add("open");
  openMetadataPanel("Edit Document", "Update metadata, replace the file if needed, then save the record.");
  fillMetadataForm(documentItem);
  renderDrawer();
}

async function toggleDocumentVisibility(documentId) {
  const documentItem = state.documents.find((item) => item.id === documentId);
  if (!documentItem) {
    return;
  }

  if (!requireLiveMode()) {
    return;
  }

      const nextVisibility = documentItem.visibility === "published" ? "draft" : "published";
  if (isLiveMode()) {
    try {
      await updateDoc(doc(db, PORTAL_CONFIG.collections.legalDocuments, documentId), withDatabaseDocumentFields({
        visibility: nextVisibility,
        updated_at: serverTimestamp(),
      }));
      addActivity(
        `${nextVisibility === "published" ? "Published" : "Drafted"} ${getDocumentTitle(documentItem)}`,
        `${getDocumentTitle(documentItem)} is now ${nextVisibility}.`,
      );
      showToast("Status updated", `${getDocumentTitle(documentItem)} moved to ${nextVisibility}.`);
      return;
    } catch (error) {
      console.error("Visibility update failed.", error);
      showToast("Update failed", "Could not update the document status.");
      return;
    }
  }

  const nextDocuments = state.documents.map((item) => item.id === documentId ? { ...item, visibility: nextVisibility, updatedAt: new Date().toISOString() } : item);
  persistDocuments(nextDocuments);
  addActivity(
    `${nextVisibility === "published" ? "Published" : "Drafted"} ${getDocumentTitle(documentItem)}`,
    `${getDocumentTitle(documentItem)} is now ${nextVisibility}.`,
  );
  showToast("Status updated", `${getDocumentTitle(documentItem)} moved to ${nextVisibility}.`);
  renderAll();
}

async function toggleDocumentPin(documentId) {
  const documentItem = state.documents.find((item) => item.id === documentId);
  if (!documentItem) {
    return;
  }

  if (!requireLiveMode()) {
    return;
  }

  if (isLiveMode()) {
    try {
      await updateDoc(doc(db, PORTAL_CONFIG.collections.legalDocuments, documentId), withDatabaseDocumentFields({
        isPinned: !documentItem.isPinned,
        updated_at: serverTimestamp(),
      }));
      addActivity(
        `${documentItem.isPinned ? "Unpinned" : "Pinned"} ${getDocumentTitle(documentItem)}`,
        `${getDocumentTitle(documentItem)} ${documentItem.isPinned ? "returned to normal flow" : "was featured at the top"}.`,
      );
      showToast("Pin updated", documentItem.isPinned ? "Document removed from featured position." : "Document pinned to the top.");
      return;
    } catch (error) {
      console.error("Pin update failed.", error);
      showToast("Update failed", "Could not update the document pin status.");
      return;
    }
  }

  const nextDocuments = state.documents.map((item) => item.id === documentId ? { ...item, isPinned: !item.isPinned, updatedAt: new Date().toISOString() } : item);
  persistDocuments(nextDocuments);
  addActivity(
    `${documentItem.isPinned ? "Unpinned" : "Pinned"} ${getDocumentTitle(documentItem)}`,
    `${getDocumentTitle(documentItem)} ${documentItem.isPinned ? "returned to normal flow" : "was featured at the top"}.`,
  );
  showToast("Pin updated", documentItem.isPinned ? "Document removed from featured position." : "Document pinned to the top.");
  renderAll();
}

async function deleteDocuments(documentIds) {
  if (!documentIds.length) {
    return;
  }

  if (!requireLiveMode()) {
    return;
  }

  const titles = state.documents.filter((item) => documentIds.includes(item.id)).map((item) => getDocumentTitle(item));
  if (isLiveMode()) {
    try {
      await Promise.all(documentIds.map((documentId) => deleteDoc(doc(db, PORTAL_CONFIG.collections.legalDocuments, documentId))));
      state.selectedIds = new Set([...state.selectedIds].filter((id) => !documentIds.includes(id)));
      addActivity(
        documentIds.length === 1 ? `Deleted ${titles[0]}` : `Bulk deleted ${documentIds.length} documents`,
        titles.slice(0, 3).join(", "),
      );
      showToast("Deleted", documentIds.length === 1 ? "Document removed from the live database." : `${documentIds.length} documents removed from the live database.`);
      return;
    } catch (error) {
      console.error("Delete failed.", error);
      showToast("Delete failed", "Could not remove one or more documents.");
      return;
    }
  }

  persistDocuments(state.documents.filter((item) => !documentIds.includes(item.id)));
  state.selectedIds = new Set([...state.selectedIds].filter((id) => !documentIds.includes(id)));
  addActivity(
    documentIds.length === 1 ? `Deleted ${titles[0]}` : `Bulk deleted ${documentIds.length} documents`,
    titles.slice(0, 3).join(", "),
  );
  showToast("Deleted", documentIds.length === 1 ? "Document removed from the prototype." : `${documentIds.length} documents removed from the prototype.`);
  renderAll();
}

function requestDeleteDocuments(documentIds) {
  openConfirm({
    title: documentIds.length === 1 ? "Delete document?" : `Delete ${documentIds.length} documents?`,
    copy: isLiveMode()
      ? "This removes the selected records from the live database and from the public legal-library view."
      : "This removes the files and metadata from the browser-stored prototype and from the public legal-library view.",
    onAccept: async () => {
      await deleteDocuments(documentIds);
      closeConfirm();
    },
  });
}

async function reorderCategoryDocuments(draggedId, targetId) {
  if (!draggedId || !targetId || draggedId === targetId) {
    return;
  }

  if (!requireLiveMode()) {
    return;
  }

  const categoryDocs = getDocumentsForCategory(state.selectedCategoryKey);
  const ids = categoryDocs.map((documentItem) => documentItem.id);
  const fromIndex = ids.indexOf(draggedId);
  const toIndex = ids.indexOf(targetId);
  if (fromIndex === -1 || toIndex === -1) {
    return;
  }

  ids.splice(toIndex, 0, ids.splice(fromIndex, 1)[0]);
  if (isLiveMode()) {
    try {
      await Promise.all(ids.map((id, index) => updateDoc(doc(db, PORTAL_CONFIG.collections.legalDocuments, id), withDatabaseDocumentFields({
        sortIndex: index,
        updated_at: serverTimestamp(),
      }))));
      addActivity("Reordered category documents", `${getAdminCategoryByKey(state.selectedCategoryKey)?.name || "Category"} order manually updated.`);
      showToast("Order updated", "Manual document order has been saved for this category.");
      return;
    } catch (error) {
      console.error("Reorder failed.", error);
      showToast("Reorder failed", "Could not save the new document order.");
      return;
    }
  }

  const orderMap = new Map(ids.map((id, index) => [id, index]));
  const nextDocuments = state.documents.map((documentItem) => {
    if (documentItem.categoryKey !== state.selectedCategoryKey) {
      return documentItem;
    }
    return {
      ...documentItem,
      sortIndex: orderMap.get(documentItem.id) ?? documentItem.sortIndex ?? null,
      updatedAt: new Date().toISOString(),
    };
  });

  persistDocuments(nextDocuments);
  addActivity("Reordered category documents", `${getAdminCategoryByKey(state.selectedCategoryKey)?.name || "Category"} order manually updated.`);
  showToast("Order updated", "Manual document order has been saved for this category.");
  renderAll();
}

function restoreLocalDashboardState() {
  unsubscribeLiveDocuments();
  state.firebaseAdmin = null;
  state.documents = [];
  syncSelectedIds();
  state.prototypeMigrationChecked = false;
}

function setAuthButtonState(loading) {
  const button = document.getElementById("auth-submit");
  button.disabled = Boolean(loading);
  button.textContent = loading ? "Connecting..." : "Connect Live Dashboard";
}

function getFriendlyAuthError(error) {
  switch (error?.code) {
    case "functions/not-deployed":
      return "Supabase Edge Function 'portal-api' is not deployed yet. Deploy it, then try again.";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "The admin username or password is incorrect.";
    case "auth/too-many-requests":
      return "Too many sign-in attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Could not reach the live service. Check the internet connection and try again.";
    case "portal/profile-setup-incomplete":
      return "Supabase user profiles are not ready yet. Run the SQL setup and try again.";
    default:
      return "Sign-in failed. Please try again.";
  }
}

function ensureAuthGate(message = "") {
  const gate = document.getElementById("auth-gate");
  const authCopy = document.getElementById("auth-copy");
  const usernameInput = document.getElementById("auth-username");
  const passwordInput = document.getElementById("auth-password");
  const unlocked = Boolean(state.firebaseAdmin);

  if (state.firebaseAdmin?.user?.username && !usernameInput.value) {
    usernameInput.value = state.firebaseAdmin.user.username;
  } else if (auth.currentUser?.username && !usernameInput.value) {
    usernameInput.value = auth.currentUser.username;
  }
  authCopy.textContent = "Sign in with the real admin username and password so the dashboard connects to the live database and storage.";

  if (unlocked) {
    passwordInput.value = "";
    showInlineError("auth-error", "");
  } else if (message) {
    showInlineError("auth-error", message);
  }

  gate.classList.toggle("hidden", unlocked);
  document.getElementById("admin-name").textContent = state.firebaseAdmin?.profile?.full_name || state.session?.displayName || state.settings.displayName;
}

async function applyAuth() {
  const username = document.getElementById("auth-username").value.trim();
  const password = document.getElementById("auth-password").value;

  showInlineError("auth-error", "");

  if (state.firebaseAdmin) {
    state.session = createAdminSession(state.firebaseAdmin.profile?.full_name || state.settings.displayName);
    ensureAuthGate();
    renderAll();
    showToast("Dashboard unlocked", "Live access is already active for this admin account.");
    return;
  }

  if (!username || !password) {
    showInlineError("auth-error", "Enter the admin username and password to connect the live legal library.");
    return;
  }

  setAuthButtonState(true);

  try {
    const credentials = await signInWithUsernameAndPassword(auth, username, password);
    const profile = await ensureUserProfile(credentials.user);

    if (profile.role !== "admin") {
      await signOut(auth);
      showInlineError("auth-error", "This account is not an ASK admin account.");
      return;
    }

    state.firebaseAdmin = { user: credentials.user, profile };
    state.session = createAdminSession(profile.full_name || state.settings.displayName);
    document.getElementById("auth-password").value = "";
    ensureAuthGate();
    subscribeLiveDocuments();
    await migratePrototypeDocumentsIfNeeded();
    renderAll();
    showToast("Live dashboard ready", "Uploads from this dashboard now sync through the live database for the public legal library.");
  } catch (error) {
    console.error("Admin sign-in failed.", error);
    showInlineError("auth-error", getFriendlyAuthError(error));
  } finally {
    setAuthButtonState(false);
  }
}

function resetPrototype() {
  if (isLiveMode()) {
    saveAdminDocuments([]);
  } else {
    persistDocuments([]);
  }
  persistActivity([]);
  persistSettings(DEFAULT_ADMIN_SETTINGS);
  state.session = createAdminSession(DEFAULT_ADMIN_SETTINGS.displayName);
  state.selectedIds = new Set();
  state.currentView = "overview";
  closeDrawer();
  renderAll();
  showToast("Dashboard reset", isLiveMode()
    ? "Local dashboard settings and activity were reset. Live documents were left untouched."
    : "Documents, activity, and local dashboard settings were reset to their defaults.");
}

document.querySelectorAll(".nav-btn").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  clearAdminSession();
  state.session = null;
  restoreLocalDashboardState();
  try {
    await signOut(auth);
  } catch (error) {
    console.warn("Admin dashboard sign out failed.", error);
  }
  ensureAuthGate();
  renderAll();
  showToast("Logged out", "Admin session closed.");
});

document.getElementById("auth-submit").addEventListener("click", applyAuth);
["auth-username", "auth-password"].forEach((elementId) => {
  document.getElementById(elementId).addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      applyAuth();
    }
  });
});

document.getElementById("category-grid").addEventListener("click", (event) => {
  const card = event.target.closest("[data-category-key]");
  if (!card) {
    return;
  }
  openDrawer(card.dataset.categoryKey);
});

document.getElementById("drawer-close").addEventListener("click", closeDrawer);
document.getElementById("drawer-shell").addEventListener("click", (event) => {
  if (event.target.id === "drawer-shell") {
    closeDrawer();
  }
});

document.getElementById("browse-files-btn").addEventListener("click", () => document.getElementById("upload-input").click());
document.getElementById("upload-zone").addEventListener("click", () => document.getElementById("upload-input").click());
document.getElementById("upload-input").addEventListener("change", async (event) => {
  const [file] = event.target.files || [];
  await stageFile(file);
  event.target.value = "";
});

const uploadZone = document.getElementById("upload-zone");
["dragenter", "dragover"].forEach((eventName) => uploadZone.addEventListener(eventName, (event) => {
  event.preventDefault();
  uploadZone.classList.add("dragover");
}));
["dragleave", "drop"].forEach((eventName) => uploadZone.addEventListener(eventName, (event) => {
  event.preventDefault();
  uploadZone.classList.remove("dragover");
}));
uploadZone.addEventListener("drop", async (event) => {
  const [file] = event.dataTransfer?.files || [];
  await stageFile(file);
});

document.getElementById("save-draft-btn").addEventListener("click", () => saveDocumentRecord("draft"));
document.getElementById("publish-btn").addEventListener("click", () => saveDocumentRecord("published"));

document.getElementById("drawer-document-list").addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-drawer-action]");
  if (!actionButton) {
    return;
  }

  const { drawerAction, id } = actionButton.dataset;
  if (drawerAction === "edit") {
    startEditDocument(id);
  } else if (drawerAction === "toggle-visibility") {
    toggleDocumentVisibility(id);
  } else if (drawerAction === "toggle-pin") {
    toggleDocumentPin(id);
  } else if (drawerAction === "delete") {
    requestDeleteDocuments([id]);
  }
});

document.getElementById("drawer-document-list").addEventListener("dragstart", (event) => {
  const card = event.target.closest(".drawer-card");
  if (!card) {
    return;
  }
  state.dragDocumentId = card.dataset.id;
  card.classList.add("dragging");
});

document.getElementById("drawer-document-list").addEventListener("dragend", (event) => {
  const card = event.target.closest(".drawer-card");
  if (card) {
    card.classList.remove("dragging");
  }
});

document.getElementById("drawer-document-list").addEventListener("dragover", (event) => {
  event.preventDefault();
});

document.getElementById("drawer-document-list").addEventListener("drop", (event) => {
  event.preventDefault();
  const card = event.target.closest(".drawer-card");
  if (!card) {
    return;
  }
  reorderCategoryDocuments(state.dragDocumentId, card.dataset.id);
  state.dragDocumentId = null;
});

document.getElementById("documents-table-body").addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-table-action]");
  if (actionButton) {
    const { tableAction, id } = actionButton.dataset;
    const documentItem = state.documents.find((item) => item.id === id);
    if (!documentItem) {
      return;
    }

    if (tableAction === "edit") {
      startEditDocument(id);
    } else if (tableAction === "open-category") {
      openDrawer(documentItem.categoryKey);
    } else if (tableAction === "delete") {
      requestDeleteDocuments([id]);
    }
    return;
  }

  const selector = event.target.closest(".row-selector");
  if (selector) {
    if (selector.checked) {
      state.selectedIds.add(selector.dataset.id);
    } else {
      state.selectedIds.delete(selector.dataset.id);
    }
    renderDocumentsTable();
  }
});

document.getElementById("select-all-docs").addEventListener("change", (event) => {
  const documents = getFilteredDocuments();
  if (event.target.checked) {
    documents.forEach((documentItem) => state.selectedIds.add(documentItem.id));
  } else {
    documents.forEach((documentItem) => state.selectedIds.delete(documentItem.id));
  }
  renderDocumentsTable();
});

document.getElementById("doc-search").addEventListener("input", renderDocumentsTable);
document.getElementById("doc-category-filter").addEventListener("change", renderDocumentsTable);
document.getElementById("doc-status-filter").addEventListener("change", renderDocumentsTable);
document.getElementById("clear-doc-filters").addEventListener("click", () => {
  document.getElementById("doc-search").value = "";
  document.getElementById("doc-category-filter").value = "all";
  document.getElementById("doc-status-filter").value = "all";
  renderDocumentsTable();
});

document.getElementById("bulk-delete-btn").addEventListener("click", () => {
  requestDeleteDocuments([...state.selectedIds]);
});

document.getElementById("settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const displayName = document.getElementById("settings-name").value.trim() || DEFAULT_ADMIN_SETTINGS.displayName;
  persistSettings({ displayName });
  state.session = createAdminSession(displayName);
  addActivity("Updated admin settings", "Dashboard display name was changed.");
  showToast("Settings saved", "Admin identity has been updated.");
  renderAll();
});

document.getElementById("reset-prototype-btn").addEventListener("click", () => {
  openConfirm({
    title: "Reset local dashboard data?",
    copy: isLiveMode()
      ? "This clears local dashboard settings, browser-stored preview documents, and activity only. Live legal-library records will stay untouched."
      : "This clears all locally stored documents and activity, then restores the default admin dashboard settings.",
    onAccept: () => {
      resetPrototype();
      closeConfirm();
    },
  });
});

document.getElementById("confirm-cancel").addEventListener("click", closeConfirm);
document.getElementById("confirm-accept").addEventListener("click", () => {
  if (typeof state.confirmAction === "function") {
    state.confirmAction();
  }
});

window.addEventListener("storage", () => {
  state.settings = loadAdminSettings();
  state.activity = loadAdminActivity();
  state.session = getAdminSession();
  if (!isLiveMode()) {
    state.documents = [];
    syncSelectedIds();
  }
  ensureAuthGate();
  renderAll();
});

document.addEventListener("click", (event) => {
  if (event.target.id === "replace-staged-file") {
    document.getElementById("upload-input").click();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!document.getElementById("confirm-modal").classList.contains("hidden")) {
      closeConfirm();
      return;
    }
    if (document.getElementById("drawer-shell").classList.contains("open")) {
      closeDrawer();
    }
  }
});

ensureAuthGate();
renderAll();
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    restoreLocalDashboardState();
    ensureAuthGate();
    renderAll();
    return;
  }

  try {
    const profile = await ensureUserProfile(user);
    if (profile?.role === "admin") {
      state.firebaseAdmin = { user, profile };
      subscribeLiveDocuments();
      await migratePrototypeDocumentsIfNeeded();
    } else {
      restoreLocalDashboardState();
      ensureAuthGate("This session is not an ASK admin account. Sign in with the real admin credentials.");
      renderAll();
      return;
    }
  } catch (error) {
    console.error("Could not verify the admin profile.", error);
    restoreLocalDashboardState();
    ensureAuthGate("Could not verify the admin profile. Re-run supabase/schema.sql, deploy the portal-api function, then sign in again.");
    renderAll();
    return;
  }

  ensureAuthGate();
  renderAll();
});
