import {
  PORTAL_CONFIG,
  auth,
  ensureUserProfile,
  onAuthStateChanged,
  signOut,
} from "./firebase-portal.js";
import {
  getAdminPortalUrl,
  getPublicHomeUrl,
  getClientPortalUrl,
  hasHiddenAdminAccess,
  navigateApp,
  revokeHiddenAdminAccess,
} from "./admin-access.js";

const state = {
  profile: null,
};

function showMessage(type, message) {
  const box = document.getElementById("bootstrap-msg");
  if (!message) {
    box.className = "msg";
    box.textContent = "";
    return;
  }

  box.className = `msg show ${type}`;
  box.textContent = message;
}

function setButton(label, disabled = false) {
  const button = document.getElementById("bootstrap-btn");
  button.textContent = label;
  button.disabled = disabled;
}

function routeProfile() {
  if (!state.profile) {
    return;
  }

  if (state.profile.role === "admin") {
    if (!hasHiddenAdminAccess()) {
      navigateApp(getPublicHomeUrl());
      return;
    }

    navigateApp(getAdminPortalUrl());
    return;
  }

  navigateApp(getClientPortalUrl());
}

async function logout() {
  revokeHiddenAdminAccess();
  try {
    await signOut(auth);
  } catch (error) {
    console.warn("Bootstrap sign out failed.", error);
  }
  navigateApp(getPublicHomeUrl());
}

document.getElementById("bootstrap-btn").addEventListener("click", routeProfile);
document.getElementById("signout-btn").addEventListener("click", logout);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    navigateApp(getPublicHomeUrl());
    return;
  }

  const authUser = document.getElementById("auth-user");
  const projectId = document.getElementById("project-id");
  if (authUser) {
    authUser.textContent = user.username || "Signed in user";
  }
  if (projectId) {
    projectId.textContent = PORTAL_CONFIG.projectId;
  }

  try {
    const profile = await ensureUserProfile(user);
    state.profile = profile;

    if (profile.role === "admin") {
      setButton("Open Admin Dashboard");
      showMessage("success", "Admin profile is ready. Continue to the dashboard.");
      return;
    }

    setButton("Open Client Portal");
    showMessage("error", "This signed-in account is not an admin account. Continue to the client portal instead.");
  } catch (error) {
    console.error("Could not ensure the portal profile.", error);
    setButton("Profile Error", true);
    showMessage("error", "Could not create or load the ASK user profile. Re-run the latest SQL in supabase/schema.sql, then sign in again.");
  }
});
