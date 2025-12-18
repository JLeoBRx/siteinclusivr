/* ==============================
   Ano automático no rodapé
================================ */
document.addEventListener("DOMContentLoaded", () => {
  const yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
});

/* ==============================
   Menu Mobile
================================ */
const mobileBtn = document.getElementById("mobile-menu-button");
const mobileMenu = document.getElementById("mobile-menu");

if (mobileBtn && mobileMenu) {
  mobileBtn.addEventListener("click", () => {
    const isHidden = mobileMenu.classList.contains("hidden");
    mobileMenu.classList.toggle("hidden");
    mobileBtn.setAttribute("aria-expanded", isHidden ? "true" : "false");
  });

  // Fecha ao clicar em um link
  mobileMenu.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      mobileMenu.classList.add("hidden");
      mobileBtn.setAttribute("aria-expanded", "false");
    });
  });

  // Fecha ao clicar fora
  document.addEventListener("click", (e) => {
    if (
      !mobileMenu.classList.contains("hidden") &&
      !mobileMenu.contains(e.target) &&
      !mobileBtn.contains(e.target)
    ) {
      mobileMenu.classList.add("hidden");
      mobileBtn.setAttribute("aria-expanded", "false");
    }
  });
}

/* ==============================
   Carousel Produtos (AR & App)
================================ */
(function () {
  const carousel = document.getElementById("produtos-carousel");
  if (!carousel) return;

  const items = Array.from(carousel.querySelectorAll(".carousel-item"));
  const thumbs = Array.from(carousel.querySelectorAll(".thumb"));
  const prevBtn = carousel.querySelector(".carousel-btn.prev");
  const nextBtn = carousel.querySelector(".carousel-btn.next");

  let index = 0;

  function show(i) {
    if (i < 0) i = items.length - 1;
    if (i >= items.length) i = 0;
    index = i;

    items.forEach((item, idx) => {
      item.classList.toggle("hidden", idx !== index);
      item.classList.toggle("flex", idx === index);

      const video = item.querySelector("video");
      if (video && idx !== index) {
        video.pause();
        video.currentTime = 0;
      }
    });

    thumbs.forEach((thumb, idx) => {
      thumb.classList.toggle("border-purple-600", idx === index);
      thumb.classList.toggle("opacity-60", idx !== index);
    });
  }

  show(0);

  prevBtn?.addEventListener("click", () => show(index - 1));
  nextBtn?.addEventListener("click", () => show(index + 1));

  thumbs.forEach(thumb => {
    thumb.addEventListener("click", () => {
      const i = parseInt(thumb.dataset.index, 10);
      show(i);
    });
  });

  // Teclado
  document.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft") show(index - 1);
    if (e.key === "ArrowRight") show(index + 1);
  });

  // Swipe mobile
  let startX = 0;

  const viewport = carousel.querySelector(".carousel-viewport");
  viewport?.addEventListener("touchstart", e => {
    startX = e.touches[0].clientX;
  });

  viewport?.addEventListener("touchend", e => {
    const endX = e.changedTouches[0].clientX;
    const diff = startX - endX;

    if (Math.abs(diff) > 40) {
      diff > 0 ? show(index + 1) : show(index - 1);
    }
  });
})();
