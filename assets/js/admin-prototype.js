const STORAGE_KEYS = {
  session: "ask_admin_dashboard_session_v1",
  settings: "ask_admin_dashboard_settings_v1",
  documents: "ask_admin_dashboard_documents_v1",
  activity: "ask_admin_dashboard_activity_v1",
};

const DEFAULT_ADMIN_SETTINGS = {
  displayName: "Amr Saied Kotb",
};

// Keep these 8 categories' `name` values in exact sync with the
// openCat('...') calls in legal-library.html — the public library page
// matches uploaded documents to categories by this exact string.
const ADMIN_LIBRARY_CATEGORIES = [
  {
    key: "egyptian-laws",
    name: "القوانين المصرية",
    sub: "",
    englishLabel: "Egyptian Laws",
  },
  {
    key: "cassation",
    name: "أحكام محكمة النقض",
    sub: "",
    englishLabel: "Court of Cassation",
  },
  {
    key: "administrative",
    name: "القضاء الإداري",
    sub: "",
    englishLabel: "Administrative Court",
  },
  {
    key: "constitutional",
    name: "أحكام المحكمة الدستورية",
    sub: "",
    englishLabel: "Constitutional Court",
  },
  {
    key: "principles",
    name: "المبادئ القانونية",
    sub: "",
    englishLabel: "Legal Principles",
  },
  {
    key: "official-gazette",
    name: "الجريدة الرسمية والوقائع",
    sub: "",
    englishLabel: "Official Gazette",
  },
  {
    key: "contract-templates",
    name: "صيغ العقود",
    sub: "",
    englishLabel: "Contract Templates",
  },
  {
    key: "lawsuit-templates",
    name: "صيغ الدعاوى",
    sub: "",
    englishLabel: "Lawsuit Templates",
  },
];

const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

function readJson(key, fallback) {
  try {
    const rawValue = localStorage.getItem(key);
    if (!rawValue) {
      return fallback;
    }
    return JSON.parse(rawValue);
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeSettings(value) {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_ADMIN_SETTINGS };
  }

  return {
    ...DEFAULT_ADMIN_SETTINGS,
    displayName: String(value.displayName ?? DEFAULT_ADMIN_SETTINGS.displayName).trim() || DEFAULT_ADMIN_SETTINGS.displayName,
  };
}

function loadAdminSettings() {
  return normalizeSettings(readJson(STORAGE_KEYS.settings, DEFAULT_ADMIN_SETTINGS));
}

function saveAdminSettings(settings) {
  const normalized = normalizeSettings(settings);
  writeJson(STORAGE_KEYS.settings, normalized);
  return normalized;
}

function getAdminSession() {
  const session = readJson(STORAGE_KEYS.session, null);
  if (!session || typeof session !== "object") {
    return null;
  }

  if (typeof session.expiresAt !== "number" || session.expiresAt < Date.now()) {
    clearAdminSession();
    return null;
  }

  return session;
}

function saveAdminSession(session) {
  writeJson(STORAGE_KEYS.session, session);
  return session;
}

function getAdminCategoryByKey(categoryKey) {
  return ADMIN_LIBRARY_CATEGORIES.find((item) => item.key === categoryKey) || null;
}

function createAdminSession(displayName) {
  const settings = loadAdminSettings();
  const session = {
    displayName: String(displayName || settings.displayName || DEFAULT_ADMIN_SETTINGS.displayName).trim() || DEFAULT_ADMIN_SETTINGS.displayName,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  };

  return saveAdminSession(session);
}

function clearAdminSession() {
  localStorage.removeItem(STORAGE_KEYS.session);
}

function loadAdminDocuments() {
  const documents = readJson(STORAGE_KEYS.documents, []);
  return Array.isArray(documents) ? documents : [];
}

function saveAdminDocuments(documents) {
  writeJson(STORAGE_KEYS.documents, Array.isArray(documents) ? documents : []);
}

function loadAdminActivity() {
  const activity = readJson(STORAGE_KEYS.activity, []);
  return Array.isArray(activity) ? activity : [];
}

function saveAdminActivity(activity) {
  writeJson(STORAGE_KEYS.activity, Array.isArray(activity) ? activity : []);
}

function pushAdminActivity(entry) {
  const activity = loadAdminActivity();
  activity.unshift(entry);
  saveAdminActivity(activity.slice(0, 80));
}

function resolveDocumentTime(documentItem) {
  if (!documentItem) {
    return 0;
  }

  const value = documentItem.documentDate || documentItem.createdAt || documentItem.updatedAt;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortAdminDocumentsForDisplay(documents) {
  return [...documents].sort((left, right) => {
    if (Boolean(left?.isPinned) !== Boolean(right?.isPinned)) {
      return left?.isPinned ? -1 : 1;
    }

    const leftHasManualOrder = Number.isFinite(left?.sortIndex);
    const rightHasManualOrder = Number.isFinite(right?.sortIndex);

    if (leftHasManualOrder && rightHasManualOrder && left.sortIndex !== right.sortIndex) {
      return left.sortIndex - right.sortIndex;
    }

    if (leftHasManualOrder !== rightHasManualOrder) {
      return leftHasManualOrder ? -1 : 1;
    }

    return resolveDocumentTime(right) - resolveDocumentTime(left);
  });
}

function getPublishedAdminDocuments() {
  return sortAdminDocumentsForDisplay(
    loadAdminDocuments().filter((documentItem) => documentItem.visibility === "published"),
  );
}

export {
  ADMIN_LIBRARY_CATEGORIES,
  DEFAULT_ADMIN_SETTINGS,
  STORAGE_KEYS,
  clearAdminSession,
  createAdminSession,
  getAdminCategoryByKey,
  getAdminSession,
  getPublishedAdminDocuments,
  loadAdminActivity,
  loadAdminDocuments,
  loadAdminSettings,
  pushAdminActivity,
  saveAdminActivity,
  saveAdminDocuments,
  saveAdminSession,
  saveAdminSettings,
  sortAdminDocumentsForDisplay,
};
