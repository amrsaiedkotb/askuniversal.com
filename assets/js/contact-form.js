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

    const optionLabel = (sel, fallback) => {
      const raw = form.querySelector(`${sel} option:checked`)?.textContent?.trim() || fallback;
      return String(raw || "").replace(/([A-Za-z)\]&.])\s*([\u0600-\u06FF])/, "$1 — $2");
    };
    const serviceLabel = optionLabel("#sv", service);
    const officeLabel = optionLabel("#of", preferredOffice);

    // 1) Email the message to the firm (address set in assets/js/ask-contact.js -> formEmail)
    const sendEmail = fetch(`https://formsubmit.co/ajax/${encodeURIComponent(window.ASK_CONTACT?.formEmail || "hello@askuniversal.com")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        _subject: `رسالة جديدة من موقع ASK — ${firstName} ${lastName}`,
        _template: "table",
        _captcha: "false",
        _replyto: email,
        "الاسم": `${firstName} ${lastName}`,
        "البريد الإلكتروني": email,
        "الهاتف": phone || "—",
        "الدولة": country || "—",
        "مجال الخدمة": serviceLabel || "—",
        "المكتب المفضل": officeLabel || "—",
        "الرسالة": message,
        "لغة الموقع": currentLang() === "en" ? "English" : "العربية",
      }),
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok || String(data.success) === "false") {
        throw new Error(data.message || `Email service responded ${res.status}`);
      }
      return data;
    });

    // 2) Keep a copy in the database as before (best effort)
    const saveCopy = addDoc(collection(db, PORTAL_CONFIG.collections.contactMessages), {
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

    try {
      const [emailResult, saveResult] = await Promise.allSettled([sendEmail, saveCopy]);
      if (emailResult.status === "rejected") {
        console.error("Contact email failed.", emailResult.reason);
      }
      if (saveResult.status === "rejected") {
        console.error("Contact database copy failed.", saveResult.reason);
      }
      if (emailResult.status === "rejected" && saveResult.status === "rejected") {
        throw emailResult.reason;
      }

      form.reset();
      window.location.href = "contact-success.html";
    } catch (error) {
      console.error("Contact form submission failed.", error);
      setStatus(
        "err",
        t(
          "تعذر إرسال الرسالة الآن. يمكنك مراسلتنا مباشرة على hello@askuniversal.com أو amr@askuniversal.com.",
          "The message could not be sent right now. You can email us directly at hello@askuniversal.com or amr@askuniversal.com.",
        ),
      );
    } finally {
      setLoading(false);
    }
  });
}
