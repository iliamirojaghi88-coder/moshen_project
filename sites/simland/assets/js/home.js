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

// ---------------------------------------------------------------- the menu follows the page
// One state and one place that changes it: setActive(). What is in view comes from
// two IntersectionObservers: a thin line across the screen at 35% of its height
// (well below the fixed header), on which exactly one section lies, and a marker at
// the very end of the page (the last section may be shorter than a tall screen).
// The hero is «خانه», the products and «چرا سیم‌لند؟» are «محصولات», the contact
// section is «ارتباط با ما». During a jump from the menu or a hero button the menu
// shows the destination at once and ignores the sections it glides past; once the
// page has come to rest, what is in view decides again (also if the visitor took
// over mid-way). No work on scroll except while such a jump is moving.

const navItems = [...document.querySelectorAll('.topnav-item[data-scroll]')];
const navKey = { top: 'top', products: 'products', why: 'products', contact: 'contact' };
let active = navItems.find((a) => a.classList.contains('is-active'))?.getAttribute('href').slice(1) || 'top';

function setActive(key) {
  if (key === active) return;
  active = key;
  for (const a of navItems) {
    const on = a.getAttribute('href') === `#${key}`;
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
  }
}

let onLine = 'top'; // the section crossing the line
let atEnd = false; // the end of the page is in view
let jump = null; // destination of a jump still on its way
let jumpAt = 0;
let moved = false;
let restTimer = 0;
const inView = () => (atEnd ? 'contact' : onLine);

function rest() {
  // the jump is over when the page has stopped moving (a smooth scroll can take a
  // moment to begin on a busy device: until it has moved, wait up to a second)
  clearTimeout(restTimer);
  restTimer = setTimeout(() => {
    const y = scrollY;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!jump || scrollY !== y) return; // still moving: the next scroll event checks again
      if (!moved && performance.now() - jumpAt < 1000) return rest();
      jump = null;
      removeEventListener('scroll', onJumpScroll);
      setActive(inView());
    }));
  }, 120);
}

function onJumpScroll() {
  moved = true;
  rest();
}

function startJump(key) {
  jump = key;
  jumpAt = performance.now();
  moved = false;
  setActive(key);
  addEventListener('scroll', onJumpScroll, { passive: true });
  rest();
}

if ('IntersectionObserver' in window) {
  const sections = new Map([[document.querySelector('.hero'), 'top'], ...['products', 'why', 'contact'].map((id) => [document.getElementById(id), navKey[id]])]);
  const line = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) onLine = sections.get(e.target);
    if (!jump) setActive(inView());
  }, { rootMargin: '-35% 0px -64% 0px' });
  for (const el of sections.keys()) if (el) line.observe(el);
  const contact = document.getElementById('contact');
  if (contact) {
    const marker = document.createElement('span');
    marker.className = 'page-end';
    marker.setAttribute('aria-hidden', 'true');
    contact.append(marker);
    new IntersectionObserver(([e]) => {
      atEnd = e.isIntersecting;
      if (!jump) setActive(inView());
    }).observe(marker);
  }
}

document.querySelectorAll('[data-scroll]').forEach((link) => {
  link.addEventListener('click', (e) => {
    const id = link.getAttribute('href').slice(1);
    if (!goTo(id, reducedMotion ? 'auto' : 'smooth')) return;
    e.preventDefault();
    startJump(navKey[id] || 'top');
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
if (data.power) images.power = load(data.power.mask);
for (const t of data.scene.turbines) {
  images[`blades-${t.id}`] = host.querySelector(`[data-layer="blades-${t.id}"]`);
  images[`caps-${t.id}`] = host.querySelector(`[data-layer="caps-${t.id}"]`);
}

createLiveHero({
  host,
  scene: data.scene,
  power: data.power,
  images,
  reducedMotion,
  onLive: () => host.classList.add('is-live'),
})
  .then((hero) => {
    if (hero) window.__hero = hero;
  })
  .catch((err) => console.warn('[simland] live hero off:', err.message));
