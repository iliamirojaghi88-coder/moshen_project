// Scroll and pointer motion that is not part of the 3D stage:
// reveals, depth entrance of product cards, hero copy lift, layered
// parallax, the current filling the "why" circuit, card tilt with edge
// light, and magnetic buttons.
import { finePointer } from './util.js';

const root = document.documentElement;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function initAnimations({ reducedMotion }) {
  initReveals(reducedMotion);
  initScrollLinked(reducedMotion);
  if (!reducedMotion && finePointer()) {
    initCardTilt();
    initMagnetic();
  }
}

// Elements enter once. Cards that arrive in the same batch are staggered
// in reading order so a row lands right-to-left as a single movement.
function initReveals(reducedMotion) {
  const targets = document.querySelectorAll('[data-reveal], .pitem');
  if (reducedMotion || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      let batch = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        if (el.classList.contains('pitem')) el.style.setProperty('--d', String(batch++));
        el.classList.add('is-in');
        io.unobserve(el);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  targets.forEach((el) => io.observe(el));
}

function initScrollLinked(reducedMotion) {
  const layers = [...document.querySelectorAll('[data-depth]')];
  const hasHero = Boolean(document.querySelector('.hero'));
  const circuit = document.querySelector('[data-circuit]');
  let ticking = false;

  function update() {
    ticking = false;
    const vh = innerHeight;
    if (hasHero) {
      // Hero copy lifts away faster than the page (see .hero-head in CSS).
      const p = reducedMotion || root.dataset.route !== 'home' ? 0 : clamp(scrollY / (vh * 0.62), 0, 1);
      root.style.setProperty('--hero-progress', p.toFixed(3));
    }
    if (circuit && circuit.offsetParent !== null) {
      const r = circuit.getBoundingClientRect();
      const p = reducedMotion ? 1 : clamp((vh * 0.7 - r.top) / r.height, 0, 1);
      circuit.style.setProperty('--progress', p.toFixed(3));
    }
    if (reducedMotion) return;
    for (const el of layers) {
      const r = el.parentElement.getBoundingClientRect();
      const offset = (r.top + r.height / 2 - vh / 2) * Number(el.dataset.depth);
      el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
    }
  }

  const request = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request);
  addEventListener('simland:route', request);
  update();
}

function initCardTilt() {
  const MAX = 5;
  document.querySelectorAll('.pcard').forEach((card) => {
    let frame = 0;
    let event = null;
    const paint = () => {
      frame = 0;
      const r = card.getBoundingClientRect();
      const x = clamp((event.clientX - r.left) / r.width, 0, 1);
      const y = clamp((event.clientY - r.top) / r.height, 0, 1);
      card.style.setProperty('--ry', `${((x - 0.5) * 2 * MAX).toFixed(2)}deg`);
      card.style.setProperty('--rx', `${((0.5 - y) * 2 * MAX).toFixed(2)}deg`);
      card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
      card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
      card.style.setProperty('--sx', ((0.5 - x) * 24).toFixed(1));
      card.style.setProperty('--sy', ((0.5 - y) * 16).toFixed(1));
    };
    card.addEventListener('pointermove', (e) => {
      event = e;
      if (!frame) frame = requestAnimationFrame(paint);
    });
    card.addEventListener('pointerleave', () => {
      cancelAnimationFrame(frame);
      frame = 0;
      for (const p of ['--rx', '--ry', '--sx', '--sy']) card.style.removeProperty(p);
    });
  });
}

function initMagnetic() {
  document.querySelectorAll('[data-magnetic]').forEach((btn) => {
    btn.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      btn.style.setProperty('--mx', `${clamp(dx * 0.18, -7, 7).toFixed(1)}px`);
      btn.style.setProperty('--my', `${clamp(dy * 0.28, -5, 5).toFixed(1)}px`);
      btn.style.setProperty('--gx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(0)}%`);
      btn.style.setProperty('--gy', `${(((e.clientY - r.top) / r.height) * 100).toFixed(0)}%`);
    });
    btn.addEventListener('pointerleave', () => {
      btn.style.setProperty('--mx', '0px');
      btn.style.setProperty('--my', '0px');
    });
  });
}
