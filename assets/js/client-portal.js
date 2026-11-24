import {
  PORTAL_CONFIG,
  addDoc,
  auth,
  collection,
  db,
  downloadStorageFile,
  ensureUserProfile,
  formatPortalDate,
  onAuthStateChanged,
  onSnapshot,
  query,
  ref,
  safeFileName,
  serverTimestamp,
  signOut,
  sortByCreatedAtDesc,
  storage,
  subscribeUserProfile,
  uploadBytes,
  where,
} from "./firebase-portal.js";
import {
  getAdminPortalUrl,
  getPublicHomeUrl,
  hasHiddenAdminAccess,
  navigateApp,
  revokeHiddenAdminAccess,
} from "./admin-access.js";

const state = {
  profile: null,
  adminFiles: [],
  clientUploads: [],
  workUpdates: [],
  unsubscribers: [],
  uploading: false,
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

function safeText(value, fallback = "—") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function setText(id, value, fallback = "—") {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = safeText(value, fallback);
  }
}

function showState(stateName, errorMessage = "") {
  const loading = document.getElementById("loading");
  const error = document.getElementById("error-state");
  const content = document.getElementById("content");

  loading.classList.toggle("show", stateName === "loading");
  error.classList.toggle("show", stateName === "error");
  content.classList.toggle("show", stateName === "content");

  if (stateName === "error" && errorMessage) {
    document.getElementById("error-copy").textContent = errorMessage;
  }
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

function statusCopy(status) {
  if (status === "inactive") {
    return {
      className: "status-badge status-inactive",
      text: t("● قيد الانتظار", "● On Hold"),
    };
  }

  if (status === "closed") {
    return {
      className: "status-badge status-closed",
      text: t("● مغلق", "● Closed"),
    };
  }

  return {
    className: "status-badge status-active",
    text: t("● نشط", "● Active"),
  };
}

function renderStatus(status) {
  const badge = document.getElementById("status-badge");
  const statusView = statusCopy(status);
  badge.className = statusView.className;
  badge.textContent = statusView.text;
}

function getDocumentName(documentItem) {
  return documentItem.file_name || documentItem.name || t("ملف", "File");
}

function getDownloadName(documentItem) {
  const name = getDocumentName(documentItem);
  return /\.[a-z0-9]+$/i.test(name)
    ? name
    : `${name}.${String(documentItem.mime_type || "application/octet-stream").split("/").pop() || "bin"}`;
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

function renderCounts() {
  const adminCount = state.adminFiles.length;
  const uploadsCount = state.clientUploads.length;
  const updatesCount = state.workUpdates.length;
  const latestUpdate = state.workUpdates[0];

  setText("c-admin-files", String(adminCount), "0");
  setText("c-client-files", String(uploadsCount), "0");
  setText("c-updates", String(updatesCount), "0");
  setText(
    "c-last-update",
    latestUpdate ? formatPortalDate(latestUpdate.created_at, currentLang()) : t("لا يوجد بعد", "No updates yet"),
    t("لا يوجد بعد", "No updates yet"),
  );

  const adminPill = document.getElementById("admin-files-count-pill");
  if (adminPill) {
    adminPill.textContent = currentLang() === "en"
      ? `${adminCount} File${adminCount === 1 ? "" : "s"}`
      : `${adminCount} ملف`;
  }

  const uploadsPill = document.getElementById("client-uploads-count-pill");
  if (uploadsPill) {
    uploadsPill.textContent = currentLang() === "en"
      ? `${uploadsCount} Upload${uploadsCount === 1 ? "" : "s"}`
      : `${uploadsCount} مرفوع`;
  }

  const updatesPill = document.getElementById("updates-count-pill");
  if (updatesPill) {
    updatesPill.textContent = currentLang() === "en"
      ? `${updatesCount} Update${updatesCount === 1 ? "" : "s"}`
      : `${updatesCount} مستجد`;
  }
}

function renderProfile(profile) {
  state.profile = profile;
  const username = profile.username || "";
  const idValue = profile.id || auth.currentUser?.uid || "";
  const displayName = profile.full_name || username || t("العميل", "Client");

  setText("nav-name", displayName, t("العميل", "Client"));
  setText("nav-num", profile.client_number || idValue.slice(0, 8), t("بدون معرف", "No ID"));
  setText("c-name", displayName, t("غير محدد", "Not provided"));
  setText("c-id", idValue, t("غير متاح", "Unavailable"));
  setText("c-phone", profile.phone, t("غير محدد", "Not provided"));
  setText("c-username", username, t("غير متاح", "Unavailable"));
  setText("c-case-type", profile.case_type, t("لم يحدد بعد", "Not assigned yet"));

  renderStatus(profile.status || "active");
  renderCounts();
  showState("content");
}

function fileCardHtml(documentItem, locked) {
  const extension = safeText(String(getDocumentName(documentItem)).split(".").pop() || "FILE", "FILE").slice(0, 4).toUpperCase();
  return `
    <article class="doc-item">
      <div class="doc-main">
        <div class="doc-icon">${escapeHtml(extension)}</div>
        <div class="doc-text">
          <div class="doc-name">${escapeHtml(safeText(getDocumentName(documentItem), t("بدون عنوان", "Untitled file")))}</div>
          <div class="doc-date">${escapeHtml(formatPortalDate(documentItem.created_at, currentLang()))}</div>
        </div>
      </div>
      <div class="doc-actions">
        ${locked ? `<span class="doc-badge locked">${escapeHtml(t("تم الرفع", "Submitted"))}</span>` : ""}
        <button class="btn-dl" type="button" data-doc-id="${documentItem.id}">
          <span class="ar-txt">تحميل</span><span class="en-txt">Download</span>
        </button>
      </div>
    </article>
  `;
}

function renderAdminFiles() {
  const list = document.getElementById("admin-files-list");
  if (!list) {
    return;
  }

  if (!state.adminFiles.length) {
    list.innerHTML = `<div class="empty">${t("لا توجد ملفات مرسلة إليك حتى الآن.", "No files have been sent to you yet.")}</div>`;
    renderCounts();
    return;
  }

  list.innerHTML = state.adminFiles.map((documentItem) => fileCardHtml(documentItem, false)).join("");
  renderCounts();
}

function renderClientUploads() {
  const list = document.getElementById("client-uploads-list");
  if (!list) {
    return;
  }

  if (!state.clientUploads.length) {
    list.innerHTML = `<div class="empty">${t("لم تقم برفع أي ملفات بعد.", "You have not uploaded any files yet.")}</div>`;
    renderCounts();
    return;
  }

  list.innerHTML = state.clientUploads.map((documentItem) => fileCardHtml(documentItem, true)).join("");
  renderCounts();
}

function renderWorkUpdates() {
  const list = document.getElementById("updates-list");
  if (!list) {
    renderCounts();
    return;
  }

  if (!state.workUpdates.length) {
    list.innerHTML = `<div class="empty">${t("لا توجد مستجدات على القضية حتى الآن.", "No case updates have been added yet.")}</div>`;
    renderCounts();
    return;
  }

  list.innerHTML = state.workUpdates.map((updateItem) => `
    <article class="update-item">
      <div class="update-title">${escapeHtml(safeText(updateItem.title, t("مستجد جديد", "New Update")))}</div>
      <div class="update-body">${escapeHtml(safeText(updateItem.body, t("تمت إضافة مستجد جديد على ملفك.", "A new update was added to your file.")))}</div>
      <div class="update-date">${escapeHtml(formatPortalDate(updateItem.created_at, currentLang()))}</div>
    </article>
  `).join("");

  renderCounts();
}

function setUploadZoneLoading(loading) {
  state.uploading = Boolean(loading);
  const zone = document.getElementById("client-upload-zone");
  const input = document.getElementById("client-upload-input");
  zone.classList.toggle("loading", state.uploading);
  input.disabled = state.uploading;
}

function cleanupSubscriptions() {
  state.unsubscribers.forEach((unsubscribe) => unsubscribe());
  state.unsubscribers = [];
}

function handlePortalError(message) {
  console.error("Client portal error:", message);
  showState("error", message);
}

function goToLogin() {
  navigateApp(getPublicHomeUrl());
}

function goToAdminPortal() {
  navigateApp(getAdminPortalUrl());
}

function getSyncFallbackMessage() {
  return t(
    "انقطع الاتصال المباشر مؤقتًا. سنواصل التحديث التلقائي كل بضع ثوان.",
    "Live sync is temporarily unavailable. Automatic refresh will continue every few seconds.",
  );
}

function subscribeToClientData(uid) {
  cleanupSubscriptions();

  state.unsubscribers.push(
    subscribeUserProfile(
      uid,
      (profile) => {
        if (!profile) {
          handlePortalError(t("لم يتم العثور على ملف حسابك. يرجى التواصل مع فريق ASK.", "Your portal profile could not be found. Please contact ASK."));
          return;
        }

        if (profile.role === "admin") {
          if (hasHiddenAdminAccess()) {
            goToAdminPortal();
          } else {
            goToLogin();
          }
          return;
        }

        renderProfile(profile);
      },
      () => handlePortalError(t("تعذر تحميل بيانات حسابك.", "We could not load your account profile.")),
    ),
  );

  const documentsQuery = query(
    collection(db, PORTAL_CONFIG.collections.documents),
    where("client_id", "==", uid),
  );

  state.unsubscribers.push(
    onSnapshot(
      documentsQuery,
      (snapshot) => {
        const documents = sortByCreatedAtDesc(snapshot.docs.map((item) => normalizeDocument({ id: item.id, ...item.data() })));
        state.adminFiles = documents.filter((documentItem) => documentItem.direction === "admin_to_client");
        state.clientUploads = documents.filter((documentItem) => documentItem.direction === "client_to_admin");
        renderAdminFiles();
        renderClientUploads();
      },
      () => handlePortalError(t("تعذر تحميل ملفات البوابة.", "We could not load your file exchange records.")),
      {
        onTransportIssue() {
          showToast("err", t("تعذر التزامن المباشر", "Live Sync Unavailable"), getSyncFallbackMessage());
        },
      },
    ),
  );

  const updatesQuery = query(
    collection(db, PORTAL_CONFIG.collections.workUpdates),
    where("client_id", "==", uid),
  );

  state.unsubscribers.push(
    onSnapshot(
      updatesQuery,
      (snapshot) => {
        state.workUpdates = sortByCreatedAtDesc(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        renderWorkUpdates();
      },
      () => handlePortalError(t("تعذر تحميل مستجدات القضية.", "We could not load your case updates.")),
      {
        onTransportIssue() {
          showToast("err", t("تعذر التزامن المباشر", "Live Sync Unavailable"), getSyncFallbackMessage());
        },
      },
    ),
  );
}

async function downloadDocument(documentId) {
  const documentItem = [...state.adminFiles, ...state.clientUploads].find((item) => item.id === documentId);
  if (!documentItem?.path) {
    showToast("err", t("الملف غير متاح", "File Unavailable"), t("هذا الملف غير جاهز للتنزيل الآن.", "This file is not available for download right now."));
    return;
  }

  try {
    await downloadStorageFile(documentItem.path, getDownloadName(documentItem));
  } catch (error) {
    console.error("Document download failed.", error);
    showToast("err", t("تعذر التنزيل", "Download Failed"), t("تعذر تنزيل الملف الآن.", "We could not download the file right now."));
  }
}

async function uploadClientFile(file) {
  if (!auth.currentUser?.uid || !file) {
    goToLogin();
    return;
  }

  if (state.clientUploads.some((documentItem) => documentItem.file_name === file.name)) {
    showToast(
      "err",
      t("تم إرسال هذا الملف مسبقًا", "File Already Submitted"),
      currentLang() === "en"
        ? "A file with the same name has already been submitted and is locked."
        : "يوجد ملف بنفس الاسم تم إرساله مسبقًا وهو مقفل الآن.",
    );
    document.getElementById("client-upload-input").value = "";
    return;
  }

  setUploadZoneLoading(true);
  const clientId = auth.currentUser.uid;
  const path = `${PORTAL_CONFIG.storagePaths.clientDocuments}/${clientId}/client-to-admin/${Date.now()}-${safeFileName(file.name)}`;

  try {
    await uploadBytes(ref(storage, path), file, {
      contentType: file.type || "application/octet-stream",
    });

    await addDoc(collection(db, PORTAL_CONFIG.collections.documents), {
      client_id: clientId,
      name: file.name,
      path,
      direction: "client_to_admin",
      uploaded_by: "client",
      is_locked: true,
      file_name: file.name,
      file_size: file.size || 0,
      mime_type: file.type || "application/octet-stream",
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    showToast(
      "ok",
      t("تم رفع الملف", "File Submitted"),
      currentLang() === "en"
        ? `${file.name} was submitted successfully.`
        : `تم إرسال الملف ${file.name} بنجاح.`,
    );
  } catch (error) {
    console.error("Client upload failed.", error);
    showToast("err", t("تعذر رفع الملف", "Upload Failed"), error.message || t("تعذر إرسال الملف الآن.", "We could not send your file right now."));
  } finally {
    document.getElementById("client-upload-input").value = "";
    setUploadZoneLoading(false);
  }
}

async function doLogout() {
  cleanupSubscriptions();
  revokeHiddenAdminAccess();
  try {
    await signOut(auth);
  } catch (error) {
    console.warn("Sign out failed.", error);
  }
  goToLogin();
}

function setLang(language) {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  document.getElementById("btn-ar").classList.toggle("active", language === "ar");
  document.getElementById("btn-en").classList.toggle("active", language === "en");

  try {
    localStorage.setItem("ask-lang", language);
  } catch (error) {
    // Ignore storage failures.
  }

  if (state.profile) {
    renderProfile(state.profile);
  } else {
    renderCounts();
  }
  renderWorkUpdates();
  renderAdminFiles();
  renderClientUploads();
}

document.getElementById("admin-files-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-doc-id]");
  if (button) {
    downloadDocument(button.dataset.docId);
  }
});

document.getElementById("client-uploads-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-doc-id]");
  if (button) {
    downloadDocument(button.dataset.docId);
  }
});

document.getElementById("client-upload-input").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) {
    uploadClientFile(file);
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  document.getElementById("client-upload-zone").addEventListener(eventName, (event) => {
    event.preventDefault();
    if (!state.uploading) {
      document.getElementById("client-upload-zone").classList.add("dragover");
    }
  });
});

["dragleave", "dragend", "drop"].forEach((eventName) => {
  document.getElementById("client-upload-zone").addEventListener(eventName, (event) => {
    event.preventDefault();
    document.getElementById("client-upload-zone").classList.remove("dragover");
  });
});

document.getElementById("client-upload-zone").addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    uploadClientFile(file);
  }
});

window.doLogout = doLogout;
window.setLang = setLang;

try {
  setLang(localStorage.getItem("ask-lang") || "ar");
} catch (error) {
  setLang("ar");
}

setUploadZoneLoading(false);
showState("loading");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    cleanupSubscriptions();
    goToLogin();
    return;
  }

  showState("loading");

  try {
    const profile = await ensureUserProfile(user);
    if (profile.role === "admin") {
      if (hasHiddenAdminAccess()) {
        goToAdminPortal();
      } else {
        goToLogin();
      }
      return;
    }
  } catch (error) {
    console.error("Could not ensure the portal user profile.", error);
    handlePortalError(t("تعذر إنشاء ملف حسابك في قاعدة البيانات.", "We could not create your database profile."));
    return;
  }

  subscribeToClientData(user.uid);
});
