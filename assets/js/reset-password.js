import { auth, onAuthStateChanged } from "./firebase-portal.js";

const state = {
  ready: false,
};

function currentLang() {
  return document.documentElement.lang === "en" ? "en" : "ar";
}

function t(arabic, english) {
  return currentLang() === "en" ? english : arabic;
}

function setMessage(type, message) {
  const box = document.getElementById("reset-msg");
  box.className = "msg";

  if (!message) {
    box.textContent = "";
    return;
  }

  box.textContent = message;
  box.classList.add("show", type);
}

function setButton(loading) {
  const button = document.getElementById("reset-btn");
  button.disabled = Boolean(loading || !state.ready);
  button.innerHTML = loading
    ? `<span class="ar-txt">جارٍ التحديث...</span><span class="en-txt">Updating...</span>`
    : `<span class="ar-txt">تحديث كلمة المرور</span><span class="en-txt">Update Password</span>`;
}

async function updatePassword() {
  const password = document.getElementById("reset-pass").value;
  const confirmPassword = document.getElementById("reset-pass-confirm").value;

  setMessage("", "");

  if (!state.ready || !auth.currentUser) {
    setMessage("err", t("سجل الدخول أولاً ثم افتح هذه الصفحة من جديد.", "Sign in first, then open this page again."));
    return;
  }

  if (!password || password.length < 8) {
    setMessage("err", t("يجب أن تكون كلمة المرور 8 أحرف على الأقل.", "Password must be at least 8 characters."));
    return;
  }

  if (password !== confirmPassword) {
    setMessage("err", t("كلمتا المرور غير متطابقتين.", "Passwords do not match."));
    return;
  }

  setButton(true);

  try {
    const { error } = await auth.client.auth.updateUser({ password });
    if (error) {
      throw error;
    }

    setMessage("ok", t("تم تحديث كلمة المرور بنجاح.", "Your password has been updated."));
    window.setTimeout(() => {
      window.location.href = "client-portal.html";
    }, 1400);
  } catch (error) {
    console.error("Password update failed.", error);
    setMessage("err", error?.message || t("تعذر تحديث كلمة المرور.", "Could not update the password."));
  } finally {
    setButton(false);
  }
}

function setLang(language) {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  document.getElementById("btn-ar").classList.toggle("active", language === "ar");
  document.getElementById("btn-en").classList.toggle("active", language === "en");
  localStorage.setItem("ask-lang", language);
}

window.setLang = setLang;
window.updatePassword = updatePassword;

try {
  setLang(localStorage.getItem("ask-lang") || "ar");
} catch (_error) {
  setLang("ar");
}

setButton(false);
setMessage("", t("هذه الصفحة مخصصة لتغيير كلمة المرور أثناء وجود جلسة دخول نشطة.", "This page changes your password while you are signed in."));

onAuthStateChanged(auth, (user) => {
  state.ready = Boolean(user);
  setButton(false);

  if (user) {
    setMessage("ok", t("يمكنك الآن إدخال كلمة المرور الجديدة.", "You can enter the new password now."));
  }
});
