import { createLiveHero } from './live-hero.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- header: products and contact are locked for now

document.querySelectorAll('[aria-disabled="true"]').forEach((el) => {
  el.addEventListener('click', (e) => e.preventDefault());
});

// ---------------------------------------------------------------- buttons scroll to their section (once it exists)

document.querySelectorAll('[data-scroll]').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.getElementById(link.getAttribute('href').slice(1));
    target?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  });
});

// ---------------------------------------------------------------- «چرا سیم‌لند؟»: cards rise in once

const whyCards = document.querySelectorAll('.why-card');
if (!reducedMotion && 'IntersectionObserver' in window && whyCards.length) {
  document.documentElement.classList.add('why-anim');
  const reveal = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        reveal.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.12 },
  );
  whyCards.forEach((card) => reveal.observe(card));
}

// ---------------------------------------------------------------- contact: entrance and «کپی آدرس»

const contactParts = document.querySelectorAll('.contact-head, .contact-list > li, .contact-art');
if (!reducedMotion && 'IntersectionObserver' in window && contactParts.length) {
  document.documentElement.classList.add('contact-anim');
  const reveal = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        reveal.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.12 },
  );
  contactParts.forEach((el) => reveal.observe(el));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // older browsers, or no clipboard permission: copy through a hidden field
    const field = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
    field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand('copy');
    field.remove();
    return ok;
  }
}

document.querySelectorAll('.ccard-copy').forEach((button) => {
  const status = button.parentElement.querySelector('.ccard-status');
  let timer = 0;
  button.addEventListener('click', async () => {
    const ok = await copyText(button.dataset.copy);
    button.classList.toggle('is-copied', ok);
    status.textContent = ok ? 'آدرس کپی شد' : 'کپی نشد؛ آدرس را انتخاب کنید';
    clearTimeout(timer);
    timer = setTimeout(() => {
      button.classList.remove('is-copied');
      status.textContent = '';
    }, 2200);
  });
});

// ---------------------------------------------------------------- the live hero

const host = document.querySelector('[data-scene]');
const data = JSON.parse(document.getElementById('hero-data').textContent);

function load(src) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  return img;
}

const images = {
  base: host.querySelector('[data-layer="base"]'),
  masks: load(data.masks),
};
for (const t of data.scene.turbines) {
  images[`blades-${t.id}`] = host.querySelector(`[data-layer="blades-${t.id}"]`);
  images[`caps-${t.id}`] = host.querySelector(`[data-layer="caps-${t.id}"]`);
}

createLiveHero({
  host,
  scene: data.scene,
  images,
  reducedMotion,
  onLive: () => host.classList.add('is-live'),
})
  .then((hero) => {
    if (hero) window.__hero = hero;
  })
  .catch((err) => console.warn('[simland] live hero off:', err.message));
