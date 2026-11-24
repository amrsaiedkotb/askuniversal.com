import {
  auth,
  ensureUserProfile,
  onAuthStateChanged,
  signInWithIdentifierAndPassword,
  signOut,
  signUpWithUsernameAndPassword,
} from "./firebase-portal.js";
import {
  getAdminPortalUrl,
  getClientPortalUrl,
  navigateApp,
} from "./admin-access.js";

function currentLang() {
  return document.documentElement.lang === "en" ? "en" : "ar";
}

function t(arabic, english) {
  return currentLang() === "en" ? english : arabic;
}

function showBox(id, message, type = "err") {
  const box = document.getElementById(id);
  if (!message) {
    box.textContent = "";
    box.classList.remove("show", "ok");
    return;
  }

  box.textContent = message;
  box.classList.add("show");
  box.classList.toggle("ok", type === "ok");
}

function setButtonState(id, loading, loadingLabel, idleHtml) {
  const button = document.getElementById(id);
  if (!button) {
    return;
  }
  button.disabled = Boolean(loading);
  button.innerHTML = loading ? loadingLabel : idleHtml;
}

function renderButtons(loginLoading = false, signupLoading = false) {
  setButtonState(
    "btn-login",
    loginLoading,
    t("جارٍ تسجيل الدخول...", "Signing in..."),
    '<span class="ar-txt">دخول</span><span class="en-txt">Sign In</span>',
  );
  setButtonState(
    "btn-signup",
    signupLoading,
    t("جارٍ الإنشاء...", "Creating..."),
    '<span class="ar-txt">إنشاء أول حساب إداري</span><span class="en-txt">Create First Admin Account</span>',
  );
}

async function routeUser(user) {
  const profile = await ensureUserProfile(user);

  if (profile.role === "admin") {
    navigateApp(getAdminPortalUrl());
    return;
  }

  navigateApp(getClientPortalUrl());
}

function getProfileSetupMessage() {
  return t(
    "تم تسجيل الدخول، لكن البوابة لم تُستكمل بعد. شغّل schema.sql وانشر دالة portal-api ثم حاول مرة أخرى.",
    "Your sign-in worked, but the portal setup is incomplete. Run schema.sql and deploy the portal-api function, then try again.",
  );
}

function getCredentials() {
  return {
    username: document.getElementById("inp-username").value.trim(),
    password: document.getElementById("inp-pass").value,
  };
}

async function doLogin() {
  const { username, password } = getCredentials();
  showBox("err-msg", "");

  if (!username || !password) {
    showBox("err-msg", t("يرجى إدخال اسم المستخدم وكلمة المرور.", "Please enter your username and password."));
    return;
  }

  renderButtons(true);

  try {
    const credentials = await signInWithIdentifierAndPassword(auth, username, password);
    await routeUser(credentials.user);
  } catch (error) {
    console.error("Login failed.", error);
    showBox(
      "err-msg",
      error?.code === "functions/not-deployed"
        ? t(
          "دالة Supabase المسماة portal-api غير منشورة بعد. انشر الدالة ثم حاول مرة أخرى.",
          "Supabase function 'portal-api' is not deployed yet. Deploy it, then try again.",
        )
        : t("بيانات الدخول غير صحيحة.", "Incorrect username or password."),
    );
  } finally {
    renderButtons(false);
  }
}

async function doSignup() {
  const { username, password } = getCredentials();
  showBox("err-msg", "");

  if (!username || !password) {
    showBox("err-msg", t("أدخل اسم المستخدم وكلمة المرور لإنشاء الحساب.", "Enter a username and password to create the account."));
    return;
  }

  renderButtons(false, true);

  try {
    const credentials = await signUpWithUsernameAndPassword(auth, username, password);
    const profile = await ensureUserProfile(credentials.user);
    showBox(
      "err-msg",
      profile.role === "admin"
        ? t("تم إنشاء أول حساب إداري بنجاح. جارٍ الدخول...", "The first admin account was created successfully. Signing you in...")
        : t("تم إنشاء الحساب بنجاح. جارٍ الدخول...", "The account was created successfully. Signing you in..."),
      "ok",
    );
    await routeUser(credentials.user);
  } catch (error) {
    console.error("Signup failed.", error);
    showBox(
      "err-msg",
      error?.code === "functions/not-deployed"
        ? t(
          "دالة Supabase المسماة portal-api غير منشورة بعد. انشر الدالة ثم حاول مرة أخرى.",
          "Supabase function 'portal-api' is not deployed yet. Deploy it, then try again.",
        )
        : (error?.message || t("تعذر إنشاء الحساب. رقم مستخدم مستخدم من قبل؟", "Could not create the account. Username already taken?")),
    );
  } finally {
    renderButtons(false, false);
  }
}

function requestPasswordReset() {
  showBox(
    "err-msg",
    t(
      "هذا النظام لا يستخدم روابط إعادة التعيين. إذا احتجت كلمة مرور جديدة فاطلب من الإدارة تغييرها لك من لوحة العملاء.",
      "This portal does not use reset links. Ask admin to change your password from the client management section.",
    ),
  );
}

function setLang(language) {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  document.getElementById("btn-ar")?.classList.toggle("active", language === "ar");
  document.getElementById("btn-en")?.classList.toggle("active", language === "en");
  window.syncSiteNavLanguageButtons?.();
  localStorage.setItem("ask-lang", language);
  renderButtons(false);
}

window.doLogin = doLogin;
window.doSignup = doSignup;
window.requestPasswordReset = requestPasswordReset;
window.setLang = setLang;

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    doLogin();
  }
});

try {
  setLang(localStorage.getItem("ask-lang") || "ar");
} catch (_error) {
  setLang("ar");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    renderButtons(false);
    return;
  }

  try {
    await routeUser(user);
  } catch (error) {
    console.error("Session routing failed.", error);
    try {
      await signOut(auth);
    } catch (_signOutError) {
      // Ignore cleanup failures.
    }
    showBox("err-msg", getProfileSetupMessage());
    renderButtons(false);
  }
});
