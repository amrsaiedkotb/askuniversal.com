function getRootUrl() {
  if (typeof window === "undefined") {
    return "https://www.askuniversal.com/";
  }

  return `${window.location.origin}/`;
}

function resolveAppUrl(relativePath) {
  return new URL(relativePath, getRootUrl()).toString();
}

function getAdminPortalUrl() {
  return resolveAppUrl("admin/index.html");
}

function getPublicHomeUrl() {
  return resolveAppUrl("index.html");
}

function getClientPortalUrl() {
  return resolveAppUrl("client-portal.html");
}

function grantHiddenAdminAccess() {
  // Passcode-based hidden access has been removed.
}

function revokeHiddenAdminAccess() {
  // Passcode-based hidden access has been removed.
}

function hasHiddenAdminAccess() {
  return true;
}

function navigateApp(url) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (window.top && window.top !== window.self) {
      window.top.location.href = url;
      return;
    }
  } catch (error) {
    // Ignore cross-frame access issues and fall back to the current window.
  }

  window.location.href = url;
}

export {
  getAdminPortalUrl,
  getPublicHomeUrl,
  getClientPortalUrl,
  grantHiddenAdminAccess,
  hasHiddenAdminAccess,
  navigateApp,
  revokeHiddenAdminAccess,
};
