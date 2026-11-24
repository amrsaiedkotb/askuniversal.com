import { PORTAL_CONFIG } from "./client-portal-config.js";

const SNAPSHOT_FALLBACK_INTERVAL_MS = 10000;
const SESSION_STORAGE_KEY = "ask-portal-custom-session-v1";
const FUNCTION_BASE_URL = `${PORTAL_CONFIG.supabase.url}/functions/v1/${PORTAL_CONFIG.supabase.functionsPath || "portal-api"}`;
const USER_PROFILE_FIELDS = [
  "role",
  "username",
  "createdAt",
  "full_name",
  "client_number",
  "phone",
  "case_type",
  "notes",
  "status",
];
const FIELD_NAME_MAP = {
  createdAt: "created_at",
  updatedAt: "updated_at",
  titleAr: "title_ar",
  titleEn: "title_en",
  documentType: "document_type",
  documentDate: "document_date",
  isPinned: "is_pinned",
  sortIndex: "sort_index",
  categoryKey: "category_key",
  categoryName: "category_name",
  categorySub: "category_sub",
  fileName: "file_name",
  fileSize: "file_size",
  mimeType: "mime_type",
  fileExtension: "file_extension",
  fileKind: "file_kind",
};
const INVERSE_FIELD_NAME_MAP = Object.fromEntries(
  Object.entries(FIELD_NAME_MAP).map(([key, value]) => [value, key]),
);

const db = {};
const storage = {};
const authListeners = new Set();
const authState = {
  initialized: false,
  initializing: null,
  session: null,
};

const auth = {
  currentUser: null,
  client: {
    auth: {
      async updateUser({ password }) {
        return {
          data: await changePassword(password),
          error: null,
        };
      },
    },
  },
};

function loadStoredSession() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

function saveStoredSession(session) {
  authState.session = session;
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (session) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch (_error) {
    // Ignore storage failures.
  }
}

function normalizeAuthUser(user) {
  if (!user) {
    return null;
  }

  return {
    ...user,
    id: user.id || user.uid,
    uid: user.id || user.uid,
    username: user.username || "",
  };
}

function setCurrentUser(user) {
  auth.currentUser = normalizeAuthUser(user);
  return auth.currentUser;
}

function emitAuthState() {
  authListeners.forEach((listener) => {
    try {
      listener(auth.currentUser);
    } catch (error) {
      console.error("Auth listener failed.", error);
    }
  });
}

function normalizeUsername(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");
}

function toPortalError(error, fallbackMessage = "Portal request failed.") {
  const message = String(error?.message || error?.error?.message || fallbackMessage);
  const portalError = new Error(message);
  portalError.code = error?.code || error?.error?.code || "portal/error";
  portalError.status = error?.status || 0;
  return portalError;
}

function getFunctionUrl(path = "") {
  return `${FUNCTION_BASE_URL}${path ? `/${String(path).replace(/^\/+/, "")}` : ""}`;
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const session = authState.session || loadStoredSession();
  const token = options.authToken ?? session?.token;
  const publishableKey = PORTAL_CONFIG?.supabase?.publishableKey || "";

  if (publishableKey && !headers.has("apikey")) {
    headers.set("apikey", publishableKey);
  }

  if (options.auth !== false && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let body = options.body;
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  }

  let response;
  try {
    response = await fetch(getFunctionUrl(path), {
      method: options.method || (body ? "POST" : "GET"),
      headers,
      body,
    });
  } catch (error) {
    throw toPortalError({ message: "Network request failed.", code: "auth/network-request-failed" });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (_error) {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw toPortalError({
        message: "Supabase Edge Function 'portal-api' was not found. Deploy the function, then try again.",
        code: "functions/not-deployed",
        status: response.status,
      });
    }

    throw toPortalError(payload?.error || payload || { message: "Request failed.", code: "portal/error", status: response.status });
  }

  return payload;
}

async function hydrateAuthState() {
  if (authState.initialized) {
    return auth.currentUser;
  }

  if (authState.initializing) {
    return authState.initializing;
  }

  authState.initializing = (async () => {
    const stored = loadStoredSession();
    if (!stored?.token) {
      saveStoredSession(null);
      setCurrentUser(null);
      authState.initialized = true;
      emitAuthState();
      return null;
    }

    try {
      const payload = await apiRequest("auth/me", {
        method: "GET",
        authToken: stored.token,
      });
      saveStoredSession({
        token: stored.token,
        expiresAt: payload?.session?.expiresAt || stored.expiresAt || null,
      });
      setCurrentUser(payload?.user || null);
    } catch (_error) {
      saveStoredSession(null);
      setCurrentUser(null);
    }

    authState.initialized = true;
    emitAuthState();
    return auth.currentUser;
  })().finally(() => {
    authState.initializing = null;
  });

  return authState.initializing;
}

function serverTimestamp() {
  return new Date().toISOString();
}

function timestampToDate(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value.toDate === "function") {
    return value.toDate();
  }
  if (typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sortByCreatedAtDesc(items) {
  return [...items].sort((left, right) => {
    const leftDate = timestampToDate(left.createdAt || left.created_at);
    const rightDate = timestampToDate(right.createdAt || right.created_at);
    return (rightDate?.getTime() || 0) - (leftDate?.getTime() || 0);
  });
}

function formatPortalDate(value, lang) {
  const dateValue = timestampToDate(value);
  if (!dateValue) {
    return lang === "en" ? "Date unavailable" : "التاريخ غير متاح";
  }

  return dateValue.toLocaleDateString(lang === "en" ? "en-GB" : "ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function safeFileName(fileName) {
  const cleaned = String(fileName || "file")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "file";
}

function mapFieldName(fieldName) {
  return FIELD_NAME_MAP[fieldName] || fieldName;
}

function mapOutboundData(data = {}) {
  const output = {};
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    output[mapFieldName(key)] = value;
  });
  return output;
}

function normalizeRecord(record) {
  if (!record) {
    return null;
  }

  const output = { ...record };
  Object.entries(INVERSE_FIELD_NAME_MAP).forEach(([sourceField, targetField]) => {
    if (output[sourceField] !== undefined && output[targetField] === undefined) {
      output[targetField] = output[sourceField];
    }
  });

  return output;
}

function collection(_db, table, options = {}) {
  return { kind: "collection", table, options };
}

function doc(_db, table, id) {
  return { kind: "doc", table, id };
}

function where(field, operator, value) {
  return { field, operator, value };
}

function query(collectionRef, ...constraints) {
  return { kind: "query", table: collectionRef.table, constraints, options: collectionRef.options || {} };
}

function createDocSnapshot(table, row, forcedId = null) {
  const normalizedRow = row ? normalizeRecord(row) : null;
  const snapshotId = forcedId ?? normalizedRow?.id ?? null;
  return {
    id: snapshotId,
    exists() {
      return Boolean(normalizedRow);
    },
    data() {
      return normalizedRow;
    },
    __hash: normalizedRow ? JSON.stringify({ id: snapshotId, ...normalizedRow }) : "null",
    __table: table,
  };
}

function createQuerySnapshot(table, rows) {
  const normalizedRows = rows.map((row) => normalizeRecord(row));
  return {
    docs: normalizedRows.map((row) => ({
      id: row.id,
      data() {
        return row;
      },
    })),
    __hash: JSON.stringify(normalizedRows.map((row) => ({ id: row.id, ...row }))),
    __table: table,
  };
}

async function getDoc(docRef) {
  const payload = await apiRequest("db/get-doc", {
    json: {
      table: docRef.table,
      id: docRef.id,
      options: docRef.options || {},
    },
    auth: docRef.table !== PORTAL_CONFIG.collections.contactMessages,
  });
  return createDocSnapshot(docRef.table, payload?.data || null, docRef.id);
}

async function getDocs(sourceRef) {
  if (sourceRef.kind === "doc") {
    return getDoc(sourceRef);
  }

  const payload = await apiRequest("db/get-docs", {
    json: {
      table: sourceRef.table,
      constraints: sourceRef.constraints || [],
      options: sourceRef.options || {},
    },
    auth: sourceRef.table !== PORTAL_CONFIG.collections.contactMessages,
  });
  return createQuerySnapshot(sourceRef.table, payload?.data || []);
}

async function addDoc(collectionRef, data) {
  const payload = await apiRequest("db/add-doc", {
    json: {
      table: collectionRef.table,
      data: mapOutboundData(data),
    },
    auth: collectionRef.table !== PORTAL_CONFIG.collections.contactMessages,
  });
  return {
    id: payload?.data?.id,
    data() {
      return normalizeRecord(payload?.data || null);
    },
  };
}

async function setDoc(docRef, data) {
  await apiRequest("db/set-doc", {
    json: {
      table: docRef.table,
      id: docRef.id,
      data: mapOutboundData(data),
    },
  });
}

async function updateDoc(docRef, data) {
  const payload = await apiRequest("db/update-doc", {
    json: {
      table: docRef.table,
      id: docRef.id,
      data: mapOutboundData(data),
    },
  });
  return normalizeRecord(payload?.data || null);
}

async function deleteDoc(docRef) {
  await apiRequest("db/delete-doc", {
    json: {
      table: docRef.table,
      id: docRef.id,
    },
  });
}

function onSnapshot(sourceRef, onNext, onError, options = {}) {
  let lastHash = null;
  let stopped = false;
  let transportIssueRaised = false;

  const pump = async () => {
    if (stopped) {
      return;
    }

    try {
      const snapshot = await getDocs(sourceRef);
      if (snapshot.__hash !== lastHash) {
        lastHash = snapshot.__hash;
        onNext(snapshot);
      }
      transportIssueRaised = false;
    } catch (error) {
      onError?.(error);
      if (!transportIssueRaised) {
        transportIssueRaised = true;
        options.onTransportIssue?.(error);
      }
    }
  };

  pump();
  const timerId = window.setInterval(pump, SNAPSHOT_FALLBACK_INTERVAL_MS);
  return () => {
    stopped = true;
    window.clearInterval(timerId);
  };
}

function sanitizeUserProfileData(profileData = {}, options = {}) {
  const output = {};
  USER_PROFILE_FIELDS.forEach((field) => {
    if (profileData[field] !== undefined) {
      output[field] = profileData[field];
    }
  });

  if (options.withCreatedAt && output.createdAt === undefined) {
    output.createdAt = serverTimestamp();
  }

  if (options.withStatus && output.status === undefined) {
    output.status = "active";
  }

  return output;
}

function normalizeProfile(uid, profileData) {
  if (!profileData) {
    return null;
  }

  const record = normalizeRecord(profileData);
  return {
    id: uid,
    uid,
    ...record,
    username: record.username || "",
  };
}

function userProfileRef(uid) {
  return doc(db, PORTAL_CONFIG.collections.users, uid);
}

async function getProfile(uid) {
  const snapshot = await getDoc(userProfileRef(uid));
  return snapshot.exists() ? normalizeProfile(uid, snapshot.data()) : null;
}

async function setUserProfile(uid, profileData) {
  await setDoc(userProfileRef(uid), sanitizeUserProfileData(profileData, {
    withCreatedAt: true,
    withStatus: true,
  }));
  return getProfile(uid);
}

async function updateUserProfile(uid, profileData) {
  await updateDoc(userProfileRef(uid), sanitizeUserProfileData(profileData));
  return getProfile(uid);
}

async function ensureUserProfile(user) {
  const normalizedUser = normalizeAuthUser(user || auth.currentUser);
  if (!normalizedUser?.uid) {
    throw toPortalError({ message: "Missing authenticated user.", code: "auth/required" });
  }

  const profile = await getProfile(normalizedUser.uid);
  if (!profile) {
    const setupError = new Error("The ASK portal profile is missing from the database.");
    setupError.code = "portal/profile-setup-incomplete";
    throw setupError;
  }

  return profile;
}

function subscribeUserProfile(uid, onNext, onError) {
  return onSnapshot(
    userProfileRef(uid),
    (snapshot) => onNext(snapshot.exists() ? normalizeProfile(uid, snapshot.data()) : null),
    onError,
  );
}

function subscribeClientProfiles(onNext, onError) {
  return onSnapshot(
    query(collection(db, PORTAL_CONFIG.collections.users), where("role", "==", "user")),
    (snapshot) => {
      onNext(sortByCreatedAtDesc(snapshot.docs.map((item) => normalizeProfile(item.id, item.data()))));
    },
    onError,
  );
}

function ref(_storage, path) {
  return { path };
}

async function uploadBytes(storageRef, file, options = {}) {
  const formData = new FormData();
  formData.append("path", storageRef.path);
  formData.append("file", file);
  formData.append("upsert", String(Boolean(options.upsert)));
  formData.append("contentType", options.contentType || file?.type || "application/octet-stream");
  return apiRequest("storage/upload", {
    body: formData,
  });
}

async function deleteStorageFile(path) {
  await apiRequest("storage/delete", {
    json: { path },
  });
}

async function downloadStorageFile(path, downloadName) {
  const payload = await apiRequest("storage/download-url", {
    json: { path },
    auth: !String(path || "").startsWith(`${PORTAL_CONFIG.storagePaths.legalLibrary}/`),
  });

  const response = await fetch(payload.url);
  if (!response.ok) {
    throw new Error("Could not download the file.");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = downloadName || "download";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function storeAuthSession(payload) {
  saveStoredSession({
    token: payload?.session?.token || null,
    expiresAt: payload?.session?.expiresAt || null,
  });
  setCurrentUser(payload?.user || null);
  authState.initialized = true;
  emitAuthState();
  return {
    user: auth.currentUser,
    session: payload?.session || null,
  };
}

async function signUpWithUsernameAndPassword(_authRef, username, password, profileData = {}) {
  const payload = await apiRequest("auth/signup", {
    json: {
      username: normalizeUsername(username),
      password,
      ...mapOutboundData(profileData),
    },
    auth: false,
  });
  return storeAuthSession(payload);
}

async function createManagedUser(profileData = {}) {
  const payload = await apiRequest("admin/create-user", {
    json: {
      ...mapOutboundData(profileData),
      username: normalizeUsername(profileData.username),
      password: profileData.password,
    },
  });
  return normalizeAuthUser(payload?.user || null);
}

async function signInWithIdentifierAndPassword(_authRef, identifier, password) {
  const payload = await apiRequest("auth/login", {
    json: {
      username: normalizeUsername(identifier),
      password,
    },
    auth: false,
  });
  return storeAuthSession(payload);
}

async function signInWithUsernameAndPassword(authRef, username, password) {
  return signInWithIdentifierAndPassword(authRef, username, password);
}

async function changePassword(password, accountId = null) {
  await apiRequest("auth/password", {
    json: {
      password,
      ...(accountId ? { accountId } : {}),
    },
  });
  return { ok: true };
}

function makeSecondaryAuth() {
  return {
    auth,
    async cleanup() {},
  };
}

async function signOut() {
  try {
    await apiRequest("auth/logout", {
      json: {},
    });
  } catch (_error) {
    // Ignore logout network errors and clear locally anyway.
  }
  saveStoredSession(null);
  setCurrentUser(null);
  authState.initialized = true;
  emitAuthState();
}

function onAuthStateChanged(_authRef, callback) {
  authListeners.add(callback);
  if (authState.initialized) {
    callback(auth.currentUser);
  } else {
    hydrateAuthState();
  }
  return () => authListeners.delete(callback);
}

const writeBatch = {
  update() {
    throw new Error("writeBatch is not implemented in the static portal client.");
  },
  delete() {
    throw new Error("writeBatch is not implemented in the static portal client.");
  },
  set() {
    throw new Error("writeBatch is not implemented in the static portal client.");
  },
  commit() {
    throw new Error("writeBatch is not implemented in the static portal client.");
  },
};

export {
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
  getDoc,
  getDocs,
  getProfile,
  makeSecondaryAuth,
  normalizeUsername,
  onAuthStateChanged,
  onSnapshot,
  query,
  ref,
  safeFileName,
  serverTimestamp,
  setDoc,
  setUserProfile,
  signInWithIdentifierAndPassword,
  signInWithUsernameAndPassword,
  signOut,
  signUpWithUsernameAndPassword,
  sortByCreatedAtDesc,
  storage,
  subscribeClientProfiles,
  subscribeUserProfile,
  updateDoc,
  updateUserProfile,
  uploadBytes,
  where,
  writeBatch,
};
