const header = document.querySelector("[data-header]");
const nav = document.querySelector("[data-nav]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const backToTop = document.querySelector("[data-back-to-top]");
const toast = document.querySelector("[data-toast]");
const contactForm = document.querySelector(".contact-form");
const formFollowup = document.querySelector("[data-form-followup]");
const whatsappFollowup = document.querySelector("[data-whatsapp-followup]");
const emailFollowup = document.querySelector("[data-email-followup]");
const submitButton = contactForm?.querySelector('button[type="submit"]');
const navLinks = Array.from(document.querySelectorAll('.main-nav a[href^="#"]'));
const sections = navLinks
  .map((link) => ({ link, target: document.querySelector(link.getAttribute("href")) }))
  .filter((item) => item.target);
const clientWhatsAppNumber = "919912463921";
const primaryEmail = "gandlasandya@gmail.com";
const alternateEmail = "ucsmitra@gmail.com";

const showToast = (message) => {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 4200);
};

const buildGmailComposeUrl = ({ to = primaryEmail, cc = alternateEmail, subject, body }) => {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to,
    cc,
    su: subject,
    body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
};

const buildWhatsAppUrl = (message) =>
  `https://wa.me/${clientWhatsAppNumber}?text=${encodeURIComponent(message)}`;

const buildEnquiryMessage = (formData) => {
  const name = formData.get("name")?.trim() || "Not provided";
  const phone = formData.get("phone")?.trim() || "Not provided";
  const requirement = formData.get("requirement")?.trim() || "Not selected";
  const message = formData.get("message")?.trim() || "Not provided";

  return [
    "New website enquiry - Uday Consultancy Services",
    "",
    `Name: ${name}`,
    `Phone: ${phone}`,
    `Requirement: ${requirement}`,
    `Message: ${message}`,
    "",
    `Source page: ${window.location.href}`,
  ].join("\n");
};

const getEnquiryPayload = (formData) => ({
  name: formData.get("name")?.trim() || "",
  phone: formData.get("phone")?.trim() || "",
  requirement: formData.get("requirement")?.trim() || "",
  message: formData.get("message")?.trim() || "",
  page: window.location.href,
});

const setFollowupLinks = ({ whatsappUrl, emailUrl }) => {
  if (whatsappFollowup && emailFollowup && formFollowup) {
    whatsappFollowup.href = whatsappUrl;
    emailFollowup.href = emailUrl;
    formFollowup.hidden = false;
  }
};

const updateScrollState = () => {
  header?.classList.toggle("scrolled", window.scrollY > 20);
  backToTop?.classList.toggle("visible", window.scrollY > 500);
  let activeLink = null;
  sections.forEach(({ link, target }) => {
    const rect = target.getBoundingClientRect();
    if (rect.top <= 120 && rect.bottom > 120) activeLink = link;
  });
  navLinks.forEach((link) => link.classList.toggle("is-active", link === activeLink));
};

menuToggle?.addEventListener("click", () => {
  const isOpen = nav?.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(Boolean(isOpen)));
});

navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = document.querySelector(link.getAttribute("href"));
    if (!target) return;
    event.preventDefault();
    nav?.classList.remove("open");
    window.scrollTo({ top: target.offsetTop - 78, behavior: "smooth" });
  });
});

backToTop?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

contactForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(contactForm);
  const payload = getEnquiryPayload(formData);
  const enquiryMessage = buildEnquiryMessage(formData);
  const subject = `New Website Enquiry - ${payload.name || "Uday Consultancy Services"}`;
  const whatsappUrl = buildWhatsAppUrl(enquiryMessage);
  const emailUrl = buildGmailComposeUrl({
    subject,
    body: enquiryMessage,
  });

  setFollowupLinks({ whatsappUrl, emailUrl });
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Sending...";
  }

  try {
    const response = await fetch("/api/enquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Unable to send enquiry.");
    }

    setFollowupLinks({
      whatsappUrl: result.fallback?.whatsappUrl || whatsappUrl,
      emailUrl: result.fallback?.gmailUrl || emailUrl,
    });

    contactForm.reset();
    showToast(result.message || "Enquiry submitted successfully.");
  } catch (error) {
    showToast(`${error.message} Please use the WhatsApp or Email buttons below.`);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Submit Enquiry";
    }
  }
});

const animatedItems = Array.from(document.querySelectorAll("[data-animate]"));
if ("IntersectionObserver" in window && animatedItems.length) {
  document.documentElement.classList.add("js-animate");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  animatedItems.forEach((item) => observer.observe(item));
}
window.addEventListener("scroll", updateScrollState, { passive: true });
window.addEventListener("resize", updateScrollState);
updateScrollState();
