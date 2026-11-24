import {
  PORTAL_CONFIG,
  auth,
  collection,
  db,
  downloadStorageFile,
  formatPortalDate,
  onAuthStateChanged,
  onSnapshot,
  sortByCreatedAtDesc,
} from "./firebase-portal.js";

const state = {
  allDocs: [],
  firebaseDocs: [],
  currentUser: null,
  view: {
    mode: "grid",
    name: "",
    sub: "",
    query: "",
  },
};

// Define Arabic strings using Hex to avoid encoding issues
const STR_LAWS = String.fromCharCode(0x0627,0x0644,0x0642,0x0648,0x0627,0x0646,0x064a,0x0646,0x0020,0x0627,0x0644,0x0645,0x0635,0x0631,0x064a,0x0629);
const STR_CASSATION = String.fromCharCode(0x0623,0x062d,0x0643,0x0627,0x0645,0x0020,0x0645,0x062d,0x0643,0x0645,0x0629,0x0020,0x0627,0x0644,0x0646,0x0642,0x0636);
const STR_ADMINISTRATIVE = String.fromCharCode(0x0627,0x0644,0x0642,0x0636,0x0627,0x0621,0x0020,0x0627,0x0644,0x0625,0x062f,0x0627,0x0631,0x064a);
const STR_CONSTITUTIONAL = String.fromCharCode(0x0623,0x062d,0x0643,0x0627,0x0645,0x0020,0x0627,0x0644,0x0645,0x062d,0x0643,0x0645,0x0629,0x0020,0x0627,0x0644,0x062f,0x0633,0x062a,0x0648,0x0631,0x064a,0x0629);
const STR_PRINCIPLES = String.fromCharCode(0x0627,0x0644,0x0645,0x0628,0x0627,0x062f,0x0626,0x0020,0x0627,0x0644,0x0642,0x0627,0x0646,0x0648,0x0646,0x064a,0x0629);
const STR_GAZETTE = String.fromCharCode(0x0627,0x0644,0x062c,0x0631,0x064a,0x062f,0x0629,0x0020,0x0627,0x0644,0x0631,0x0633,0x0645,0x064a,0x0629);
const STR_CONTRACTS = String.fromCharCode(0x0635,0x064a,0x063a,0x0020,0x0627,0x0644,0x0639,0x0642,0x0648,0x062f);
const STR_LAWSUITS = String.fromCharCode(0x0635,0x064a,0x063a,0x0020,0x0627,0x0644,0x062f,0x0639,0x0627,0x0648,0x0649);

const CATS = [
  { 
    name: STR_LAWS, 
    sub: "Laws",
    icon: '<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>'
  },
  { 
    name: STR_CASSATION, 
    sub: "Cassation", 
    icon: '<svg viewBox="0 0 24 24"><path d="M14.5 2L3.5 13l3 3 11-11z"/><path d="M9.5 7L2 14.5l3 3 7.5-7.5z"/><path d="M2 22l5-5"/><path d="M11 2h11v11"/></svg>' 
  },
  { 
    name: STR_ADMINISTRATIVE, 
    sub: "Administrative", 
    icon: '<svg viewBox="0 0 24 24"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/><path d="M12 7v4"/><path d="M9 11h6"/></svg>' 
  },
  { 
    name: STR_CONSTITUTIONAL, 
    sub: "Constitutional", 
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4"/><path d="M12 11v10"/><path d="M8 21h8"/><path d="M16 8l3 4"/><path d="M8 8l-3 4"/><path d="M19 12a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3"/></svg>' 
  },
  { 
    name: STR_PRINCIPLES, 
    sub: "Principles", 
    icon: '<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/><path d="M12 6v6l4 2"/></svg>' 
  },
  { 
    name: STR_GAZETTE, 
    sub: "Official Gazette", 
    icon: '<svg viewBox="0 0 24 24"><path d="M4 21h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z"/><path d="M6 7h12"/><path d="M6 11h12"/><path d="M6 15h8"/></svg>' 
  },
  { 
    name: STR_CONTRACTS, 
    sub: "Contracts", 
    icon: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>' 
  },
  { 
    name: STR_LAWSUITS, 
    sub: "Lawsuits", 
    icon: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M23 11l-8.5 8.5L11 16l1.5-1.5 2 1.5 7-7L23 11z"/></svg>' 
  },
];

function currentLang() {
  return document.documentElement.lang === "en" ? "en" : "ar";
}

function currentSearchQuery() {
  const el = document.getElementById("search-inp");
  return el ? el.value.trim().toLowerCase() : "";
}

function getDocumentTimestamp(item) {
  const value = item.documentDate || item.created_at || item.createdAt || item.updatedAt;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortLibraryDocs(items) {
  return [...items].sort((left, right) => {
    if (Boolean(left?.isPinned) !== Boolean(right?.isPinned)) {
      return left?.isPinned ? -1 : 1;
    }

    const leftHasSort = Number.isFinite(left?.sortIndex);
    const rightHasSort = Number.isFinite(right?.sortIndex);
    if (leftHasSort && rightHasSort && left.sortIndex !== right.sortIndex) {
      return left.sortIndex - right.sortIndex;
    }
    if (leftHasSort !== rightHasSort) {
      return leftHasSort ? -1 : 1;
    }

    return getDocumentTimestamp(right) - getDocumentTimestamp(left);
  });
}

function resolveLibraryDocs() {
  const publishedFirebaseDocs = state.firebaseDocs.filter((item) => item.visibility !== "draft");
  state.allDocs = sortLibraryDocs(publishedFirebaseDocs);
}

function docMatchesCategory(item, name, sub) {
  if (item.categoryName) {
    return item.categoryName === name && (!sub || item.categorySub === sub);
  }
  return item.category === name || item.category === `${name} - ${sub}`;
}

function getDocTitle(item) {
  if (currentLang() === "en") {
    return item.titleEn || item.titleAr || item.title || "---";
  }
  return item.titleAr || item.titleEn || item.title || "---";
}

function getDocDate(item) {
  if (item.documentDate) {
    return formatPortalDate(item.documentDate, currentLang());
  }
  return formatPortalDate(item.created_at || item.createdAt, currentLang());
}

function getDocFileLabel(item) {
  const extension = String(item.fileExtension || "").toUpperCase();
  if (extension === "PDF") return "PDF";
  if (["PNG", "JPG", "JPEG"].includes(extension)) return "IMG";
  if (["DOC", "DOCX"].includes(extension)) return "DOC";
  return "PDF";
}

function downloadPrototypeDocument(item) {
  const link = document.createElement("a");
  link.href = item.fileDataUrl;
  link.download = item.fileName || `${getDocTitle(item) || "document"}.${String(item.fileExtension || "pdf").toLowerCase()}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function renderGrid() {
  const grid = document.getElementById("main-grid");
  if (!grid) return;
  
  grid.innerHTML = CATS.map(
    (category) => `
      <div class="lib-card" onclick="openCat('${category.name}', '${category.sub || ""}')">
        <div class="icon-box">${category.icon}</div>
        <div class="card-label">${category.label || category.name}</div>
        ${category.sub ? `<div class="card-sub">${category.sub}</div>` : ""}
      </div>`,
  ).join("");
}

function getCurrentDocs() {
  if (state.view.mode === "search") {
    const queryText = state.view.query.toLowerCase();
    return state.allDocs.filter((item) =>
      [
        item.title,
        item.titleAr,
        item.titleEn,
        item.category,
        item.categoryName,
        item.categorySub,
        item.description,
        ...(item.tags || []),
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(queryText)),
    );
  }

  if (state.view.mode === "category") {
    return state.allDocs.filter((item) => docMatchesCategory(item, state.view.name, state.view.sub));
  }

  return [];
}

function getCurrentTitle() {
  if (state.view.mode === "search") {
    return currentLang() === "en" ? "Search Results" : String.fromCharCode(0x0646,0x062a,0x0627,0x0626,0x062c,0x0020,0x0627,0x0644,0x0628,0x062d,0x062b);
  }
  if (state.view.mode === "category") {
    return state.view.sub ? `${state.view.name} (${state.view.sub})` : state.view.name;
  }
  return "";
}

function renderDocs(title, docs) {
  const secTitle = document.getElementById("sec-title");
  if (secTitle) secTitle.textContent = title;
  
  const list = document.getElementById("docs-list");
  if (!list) return;
  
  list.innerHTML = "";

  if (!docs.length) {
    const emptyMsg = currentLang() === "en" 
      ? "No documents in this category yet." 
      : String.fromCharCode(0x0644,0x0627,0x0020,0x062a,0x0648,0x062c,0x062f,0x0020,0x0645,0x0633,0x062a,0x0646,0x062f,0x0627,0x062a,0x0020,0x0641,0x064a,0x0020,0x0647,0x0630,0x0627,0x0020,0x0627,0x0644,0x062a,0x0635,0x0646,0x064a,0x0641,0x0020,0x062d,0x062a,0x0649,0x0020,0x0627,0x0644,0x0622,0x0646,0x002e);
    list.innerHTML = `<div class="empty">${emptyMsg}</div>`;
  } else {
    docs.forEach((item) => {
      const row = document.createElement("div");
      row.className = "doc-item";

      const info = document.createElement("div");
      const titleWrap = document.createElement("div");
      titleWrap.style.display = "flex";
      titleWrap.style.alignItems = "center";
      titleWrap.style.gap = "10px";

      const fileBadge = document.createElement("span");
      fileBadge.textContent = getDocFileLabel(item);
      fileBadge.style.display = "inline-flex";
      fileBadge.style.alignItems = "center";
      fileBadge.style.justifyContent = "center";
      fileBadge.style.minWidth = "42px";
      fileBadge.style.height = "24px";
      fileBadge.style.padding = "0 8px";
      fileBadge.style.borderRadius = "999px";
      fileBadge.style.fontFamily = "'Montserrat',sans-serif";
      fileBadge.style.fontSize = "10px";
      fileBadge.style.letterSpacing = ".12em";
      fileBadge.style.textTransform = "uppercase";
      fileBadge.style.background = "rgba(232,221,181,.08)";
      fileBadge.style.border = "1px solid rgba(232,221,181,.18)";
      fileBadge.style.color = "#E8DDB5";

      const name = document.createElement("div");
      name.className = "doc-name";
      name.textContent = getDocTitle(item);

      const date = document.createElement("div");
      date.className = "doc-date";
      date.textContent = getDocDate(item);

      titleWrap.appendChild(fileBadge);
      titleWrap.appendChild(name);
      info.appendChild(titleWrap);
      info.appendChild(date);

      const action = document.createElement("button");
      action.className = "btn-dl";
      action.textContent = currentLang() === "en" ? "Download" : String.fromCharCode(0x062a,0x062d,0x0645,0x064a,0x0644);
      action.addEventListener("click", () => dlDoc(item));

      row.appendChild(info);
      row.appendChild(action);
      list.appendChild(row);
    });
  }

  const gridWrap = document.getElementById("grid-wrap");
  const docsSec = document.getElementById("docs-section");
  if (gridWrap) gridWrap.style.display = "none";
  if (docsSec) docsSec.classList.add("show");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderCurrentView() {
  if (state.view.mode === "grid") {
    const docsSec = document.getElementById("docs-section");
    const gridWrap = document.getElementById("grid-wrap");
    if (docsSec) docsSec.classList.remove("show");
    if (gridWrap) gridWrap.style.display = "block";
    renderGrid();
    return;
  }

  renderDocs(getCurrentTitle(), getCurrentDocs());
}

function openCat(name, sub) {
  state.view = {
    mode: "category",
    name,
    sub,
    query: "",
  };
  renderCurrentView();
}

function showGrid() {
  state.view = {
    mode: "grid",
    name: "",
    sub: "",
    query: "",
  };
  const searchInp = document.getElementById("search-inp");
  if (searchInp) searchInp.value = "";
  renderCurrentView();
}

function onSearch() {
  const queryText = currentSearchQuery();
  if (!queryText) {
    showGrid();
    return;
  }

  state.view = {
    mode: "search",
    name: "",
    sub: "",
    query: queryText,
  };
  renderCurrentView();
}

async function dlDoc(item) {
  if (item.fileDataUrl) {
    downloadPrototypeDocument(item);
    return;
  }

  try {
    const extension = String(item.fileExtension || item.fileName || item.file_name || "pdf")
      .split(".")
      .pop()
      .toLowerCase() || "pdf";
    await downloadStorageFile(item.path, `${getDocTitle(item) || "document"}.${extension}`);
  } catch (error) {
    console.error("Library document download failed.", error);
    const errMsg = currentLang() === "en" ? "Could not download the document." : String.fromCharCode(0x062a,0x0639,0x0630,0x0631,0x0020,0x062a,0x062d,0x0645,0x064a,0x0644,0x0020,0x0627,0x0644,0x0645,0x0633,0x062a,0x0646,0x062f,0x002e);
    alert(errMsg);
  }
}

function closeMM() {
  const menu = document.getElementById("mobile-menu");
  const toggle = document.getElementById("nav-toggle");
  if (menu) menu.classList.remove("open");
  if (toggle) toggle.classList.remove("open");
  document.body.style.overflow = "";
}

function setLang(language) {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  const btnAr = document.getElementById("btn-ar");
  const btnEn = document.getElementById("btn-en");
  if (btnAr) btnAr.classList.toggle("active", language === "ar");
  if (btnEn) btnEn.classList.toggle("active", language === "en");
  
  try {
    localStorage.setItem("ask-lang", language);
  } catch (error) {
    // Ignore
  }

  const topTitle = document.getElementById("simTopTitle");
  if (topTitle) {
    topTitle.textContent = language === "ar" 
      ? String.fromCharCode(0x2696,0x0020,0x0645,0x062d,0x0627,0x0643,0x0627,0x0629,0x0020,0x0642,0x0627,0x0639,0x0629,0x0020,0x0627,0x0644,0x0645,0x062d,0x0643,0x0645,0x0629) 
      : "⚖ Courtroom Simulator";
  }

  const closeButton = document.querySelector(".sim-close");
  if (closeButton) {
    closeButton.textContent = language === "ar" ? String.fromCharCode(0x2715,0x0020,0x0625,0x063a,0x0644,0x0627,0x0642) : "✕ Close";
  }

  const scoreLabel = document.querySelector("#simScore span:first-child");
  if (scoreLabel) {
    scoreLabel.textContent = language === "ar" ? String.fromCharCode(0x0646,0x062a,0x064a,0x062c,0x0629,0x0020,0x0627,0x0644,0x0646,0x064a,0x0627,0x0628,0x0629) : "Prosecution Score";
  }

  const simOverlay = document.getElementById("simOverlay");
  const simScore = document.getElementById("simScore");
  const introOpen = simOverlay && simOverlay.classList.contains("open")
    && simScore && simScore.style.display === "none";
  if (introOpen) {
    if (typeof window.showIntro === 'function') window.showIntro();
  }

  renderCurrentView();
}

const navToggle = document.getElementById("nav-toggle");
if (navToggle) {
  navToggle.addEventListener("click", function toggleMobileMenu() {
    const menu = document.getElementById("mobile-menu");
    const isOpen = menu && menu.classList.toggle("open");
    this.classList.toggle("open", isOpen);
    document.body.style.overflow = isOpen ? "hidden" : "";
  });
}

window.closeMM = closeMM;
window.dlDoc = dlDoc;
window.onSearch = onSearch;
window.openCat = openCat;
window.setLang = setLang;
window.showGrid = showGrid;

try {
  setLang(localStorage.getItem("ask-lang") || "ar");
} catch (error) {
  setLang("ar");
}

onAuthStateChanged(auth, (user) => {
  state.currentUser = user || null;
  if (state.view.mode !== "grid") {
    renderCurrentView();
  }
});

onSnapshot(collection(db, PORTAL_CONFIG.collections.legalDocuments), (snapshot) => {
  state.firebaseDocs = sortByCreatedAtDesc(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
  resolveLibraryDocs();
  renderCurrentView();
});

window.addEventListener("storage", () => {
  resolveLibraryDocs();
  renderCurrentView();
});
