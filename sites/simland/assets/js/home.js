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
