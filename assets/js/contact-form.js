import {
  PORTAL_CONFIG,
  addDoc,
  collection,
  db,
  serverTimestamp,
} from "./firebase-portal.js";

const form = document.getElementById("contact-form");
const submitButton = document.getElementById("contact-submit");
const statusBox = document.getElementById("contact-status");

function currentLang() {
  return document.documentElement.lang === "en" ? "en" : "ar";
}

function t(arText, enText) {
  return currentLang() === "en" ? enText : arText;
}

function setStatus(type, message) {
  if (!statusBox) {
    return;
  }

  statusBox.className = "form-status";
  if (!message) {
    statusBox.textContent = "";
    return;
  }

  statusBox.textContent = message;
  statusBox.classList.add("show", type);
}

function setLoading(loading) {
  if (!submitButton) {
    return;
  }

  submitButton.disabled = Boolean(loading);
  submitButton.innerHTML = loading
    ? `<span class="en">Sending...</span><span class="ar">جارٍ الإرسال...</span>`
    : `<span class="en">Send Message →</span><span class="ar">إرسال الرسالة ←</span>`;
}

function getTrimmed(formData, key) {
  return String(formData.get(key) || "").trim();
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) {
      return;
    }

    const formData = new FormData(form);
    if (getTrimmed(formData, "bot-field")) {
      return;
    }

    const firstName = getTrimmed(formData, "first_name");
    const lastName = getTrimmed(formData, "last_name");
    const email = getTrimmed(formData, "email");
    const phone = getTrimmed(formData, "phone");
    const country = getTrimmed(formData, "country");
    const service = getTrimmed(formData, "service");
    const preferredOffice = getTrimmed(formData, "preferred_office");
    const message = getTrimmed(formData, "message");

    setStatus("", "");
    setLoading(true);

    try {
      await addDoc(collection(db, PORTAL_CONFIG.collections.contactMessages), {
        first_name: firstName,
        last_name: lastName,
        email,
        ...(phone ? { phone } : {}),
        ...(country ? { country } : {}),
        service,
        ...(preferredOffice ? { preferred_office: preferredOffice } : {}),
        message,
        locale: currentLang(),
        source: "website-contact-form",
        status: "new",
        createdAt: serverTimestamp(),
      });

      form.reset();
      window.location.href = "contact-success.html";
    } catch (error) {
      console.error("Contact form submission failed.", error);
      setStatus(
        "err",
        t(
          "تعذر إرسال الرسالة الآن. يمكنك مراسلتنا مباشرة على amr@askuniversal.com أو clientaccess@askuniversal.com.",
          "The message could not be sent right now. You can email us directly at amr@askuniversal.com or clientaccess@askuniversal.com.",
        ),
      );
    } finally {
      setLoading(false);
    }
  });
}
