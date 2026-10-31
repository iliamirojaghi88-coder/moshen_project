import { createLiveHero } from './live-hero.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- items without a destination yet (product pages, the second phone line)

document.querySelectorAll('[aria-disabled="true"]').forEach((el) => {
  el.addEventListener('click', (e) => e.preventDefault());
});

// ---------------------------------------------------------------- menu and hero buttons: the sections of this page
// Real anchors (#top, #products, #contact), so they also work without script and
// from the address bar. Each section's scroll-margin-top keeps its title clear of
// the fixed header; focus moves to the section's title for keyboard users.

function goTo(id, behavior) {
  const target = document.getElementById(id);
  if (!target) return false;
  if (id === 'top') scrollTo({ top: 0, behavior });
  else target.scrollIntoView({ behavior, block: 'start' });
  const title = id === 'top' ? document.getElementById('hero-title') : target.querySelector('h2');
  if (title) {
    title.setAttribute('tabindex', '-1');
    title.focus({ preventScroll: true });
  }
  return true;
}

document.querySelectorAll('[data-scroll]').forEach((link) => {
  link.addEventListener('click', (e) => {
    const id = link.getAttribute('href').slice(1);
    if (!goTo(id, reducedMotion ? 'auto' : 'smooth')) return;
    e.preventDefault();
    history.replaceState(null, '', id === 'top' ? location.pathname + location.search : `#${id}`);
  });
});

// opened with #products or #contact: land on the section once the fonts have settled the layout
if (/^#(products|contact|why)$/.test(location.hash)) {
  const id = location.hash.slice(1);
  document.fonts.ready.then(() => {
    const root = document.documentElement;
    root.style.scrollBehavior = 'auto';
    goTo(id, 'auto');
    root.style.scrollBehavior = '';
  });
}

// ---------------------------------------------------------------- entrance: each block slides or rises in once
// One observer for the page. A product card comes in from its own side of its
// real row (right half from the right, left half from the left, a middle one from
// below), one after another along the row, whatever the number of columns; the
// four «چرا سیم‌لند؟» cards alternate; the contact title rises, its cards follow
// from the reading side and the phone settles in last. Only transform and opacity
// move, nothing stays transformed afterwards, and without script or with reduced
// motion everything is simply there.

const revealing = [...document.querySelectorAll('[data-reveal]')];
if (!reducedMotion && 'IntersectionObserver' in window && revealing.length) {
  const pending = (el) => !el.classList.contains('is-in');

  const placeProducts = () => {
    const rows = new Map();
    for (const card of document.querySelectorAll('.pcard')) {
      const key = card.offsetTop; // layout position: not moved by the entrance transform
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(card);
    }
    for (const row of rows.values()) {
      row.sort((a, b) => b.offsetLeft - a.offsetLeft); // right to left, the reading order
      const n = row.length;
      row.forEach((card, i) => {
        if (!pending(card)) return;
        card.dataset.reveal = n % 2 && i === (n - 1) / 2 ? 'up' : i < n / 2 ? 'right' : 'left';
        card.style.setProperty('--rd', `${i * 70}ms`);
      });
    }
  };

  const placeWhy = () => {
    const cards = [...document.querySelectorAll('.why-card')];
    const oneRow = cards.length > 1 && cards.every((c) => c.offsetTop === cards[0].offsetTop);
    // one column: from the side of the text, the third rises; a row of four: from the outer edges inwards
    const sides = oneRow ? ['right', 'up', 'up', 'left'] : ['right', 'left', 'up', 'left'];
    cards.forEach((card, i) => {
      if (!pending(card)) return;
      card.dataset.reveal = sides[i % sides.length];
      card.style.setProperty('--rd', oneRow ? `${i * 90}ms` : '0ms');
    });
  };

  document.querySelectorAll('.contact-list > li').forEach((li, i) => li.style.setProperty('--rd', `${80 + i * 90}ms`));
  placeProducts();
  placeWhy();
  document.documentElement.classList.add('reveal-on');

  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      placeProducts();
      placeWhy();
    }, 150);
  });

  const reveal = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        reveal.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  revealing.forEach((el) => reveal.observe(el));
}

// ---------------------------------------------------------------- contact: «کپی آدرس»

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
