const header = document.querySelector("[data-header]");
const nav = document.querySelector("[data-nav]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const backToTop = document.querySelector("[data-back-to-top]");
const toast = document.querySelector("[data-toast]");
const contactForm = document.querySelector(".contact-form");
const navLinks = Array.from(document.querySelectorAll('.main-nav a[href^="#"]'));
const sections = navLinks
  .map((link) => ({ link, target: document.querySelector(link.getAttribute("href")) }))
  .filter((item) => item.target);

const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 4200);
};

const updateScrollState = () => {
  header.classList.toggle("scrolled", window.scrollY > 20);
  backToTop.classList.toggle("visible", window.scrollY > 500);
  let activeLink = null;
  sections.forEach(({ link, target }) => {
    const rect = target.getBoundingClientRect();
    if (rect.top <= 120 && rect.bottom > 120) activeLink = link;
  });
  navLinks.forEach((link) => link.classList.toggle("is-active", link === activeLink));
};

menuToggle.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = document.querySelector(link.getAttribute("href"));
    if (!target) return;
    event.preventDefault();
    nav.classList.remove("open");
    window.scrollTo({ top: target.offsetTop - 78, behavior: "smooth" });
  });
});

backToTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

contactForm.addEventListener("submit", (event) => {
  event.preventDefault();
  contactForm.reset();
  showToast("Thank you. Your enquiry is ready for follow-up by Uday Consultancy Services.");
});

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

document.querySelectorAll("[data-animate]").forEach((item) => observer.observe(item));
window.addEventListener("scroll", updateScrollState, { passive: true });
window.addEventListener("resize", updateScrollState);
updateScrollState();
