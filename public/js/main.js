(function () {
  "use strict";

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fineHover = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $ = (sel, scope) => (scope || document).querySelector(sel);
  const $$ = (sel, scope) => Array.from((scope || document).querySelectorAll(sel));
  function safe(fn, name) { try { fn(); } catch (e) { console.warn("[" + name + "]", e); } }

  /* ---------- Nav ---------- */
  function initNav() {
    const header = $(".site-header");
    if (!header) return;
    const onScroll = () => header.classList.toggle("is-scrolled", scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const toggle = $("[data-nav-toggle]");
    const overlay = $("[data-nav-overlay]");
    if (toggle && overlay) {
      const close = () => { toggle.classList.remove("is-open"); overlay.dataset.open = "false"; document.body.style.overflow = ""; };
      const open = () => { toggle.classList.add("is-open"); overlay.dataset.open = "true"; document.body.style.overflow = "hidden"; };
      toggle.addEventListener("click", () => {
        overlay.dataset.open === "true" ? close() : open();
      });
      $$("a", overlay).forEach((a) => a.addEventListener("click", close));
    }
  }

  /* ---------- Cursor ---------- */
  function initCursor() {
    const root = $("[data-cursor-root]");
    if (!root || !fineHover) return;
    document.documentElement.classList.add("has-cursor");
    const ring = $(".cursor-ring", root);
    const dot = $(".cursor-dot", root);
    let tx = 0, ty = 0, rx = 0, ry = 0, started = false;

    window.addEventListener("mousemove", (e) => {
      tx = e.clientX; ty = e.clientY;
      if (dot) dot.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
      if (!started) {
        started = true;
        rx = tx; ry = ty;
        root.classList.add("is-ready");
      }
    }, { passive: true });

    function tick() {
      rx += (tx - rx) * 0.18;
      ry += (ty - ry) * 0.18;
      if (ring) ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    const HOVERABLES = "a, button, .card, .btn";
    document.addEventListener("mouseover", (e) => { if (e.target.closest(HOVERABLES)) root.classList.add("is-interactive"); });
    document.addEventListener("mouseout", (e) => {
      if (e.target.closest(HOVERABLES) && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(HOVERABLES))) {
        root.classList.remove("is-interactive");
      }
    });
  }

  /* ---------- Hero mesh follows cursor ---------- */
  function initHeroMesh() {
    const hero = $(".hero");
    if (!hero || !fineHover) return;
    let mx = 50, my = 50, tx = 50, ty = 50, active = false;
    hero.addEventListener("mousemove", (e) => {
      const r = hero.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * 100;
      ty = ((e.clientY - r.top) / r.height) * 100;
      active = true;
    });
    function frame() {
      if (active) {
        mx += (tx - mx) * 0.04;
        my += (ty - my) * 0.04;
        hero.style.setProperty("--mesh-x", mx + "%");
        hero.style.setProperty("--mesh-y", my + "%");
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- Spotlight on cards ---------- */
  function initSpotlight() {
    if (!fineHover) return;
    $$(".news-card").forEach((card) => {
      let raf = null;
      card.addEventListener("mousemove", (e) => {
        const r = card.getBoundingClientRect();
        const mx = ((e.clientX - r.left) / r.width) * 100;
        const my = ((e.clientY - r.top) / r.height) * 100;
        if (!raf) raf = requestAnimationFrame(() => {
          card.style.setProperty("--mx", mx + "%");
          card.style.setProperty("--my", my + "%");
          raf = null;
        });
      });
    });
  }

  /* ---------- Reveal on scroll ---------- */
  function initReveals() {
    const els = $$("[data-reveal]");
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-revealed");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.01, rootMargin: "0px 0px -2% 0px" });
    els.forEach((el) => io.observe(el));

    setTimeout(() => {
      $$("[data-reveal]:not(.is-revealed)").forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("is-revealed");
      });
    }, 4000);
  }

  /* ---------- Count-up ---------- */
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function initCountUp() {
    $$("[data-count-to]").forEach((el) => {
      const target = parseFloat(el.dataset.countTo);
      if (Number.isNaN(target)) return;
      const decimals = (el.dataset.countTo.split(".")[1] || "").length;
      const trigger = () => {
        if (reduced) { el.textContent = target.toFixed(decimals); return; }
        const start = performance.now();
        const duration = 1200;
        function step(now) {
          const p = Math.min(1, (now - start) / duration);
          el.textContent = (target * easeOutCubic(p)).toFixed(decimals);
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      };
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) { trigger(); io.unobserve(e.target); } });
      }, { threshold: 0.4 });
      io.observe(el);
    });
  }

  /* ---------- Ticker marquee (duplicate items for a seamless loop) ---------- */
  function initTicker() {
    const track = $("[data-ticker-track]");
    if (!track || track.dataset.tickerBound) return;
    const items = Array.from(track.children);
    if (!items.length || track.querySelector(".ticker-empty")) return;
    track.dataset.tickerBound = "1";
    items.forEach((item) => {
      const clone = item.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      track.appendChild(clone);
    });
    track.classList.add("is-looping");
  }

  function boot() {
    safe(initNav, "initNav");
    safe(initCursor, "initCursor");
    safe(initHeroMesh, "initHeroMesh");
    safe(initSpotlight, "initSpotlight");
    safe(initReveals, "initReveals");
    safe(initCountUp, "initCountUp");
    safe(initTicker, "initTicker");
    document.documentElement.classList.add("is-ready");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
