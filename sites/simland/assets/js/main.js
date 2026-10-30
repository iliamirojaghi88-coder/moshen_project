import { contact } from './site-config.js';
import { initAnimations } from './animations.js';
import { initFilters, initProducts } from './products.js';
import { currentRoute, initRouter } from './router.js';
import { prefersReducedMotion, toFa } from './util.js';

const root = document.documentElement;
const reducedMotion = prefersReducedMotion();
const router = initRouter({ reducedMotion });

// ---------------------------------------------------------------- Header

const header = document.querySelector('[data-header]');
const toggle = header.querySelector('[data-menu-toggle]');
const menu = header.querySelector('[data-mobile-menu]');
const menuLabel = header.querySelector('[data-menu-label]');
const compactMenu = matchMedia('(max-width: 860px)');

function setMenu(open) {
  header.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  menuLabel.textContent = open ? 'بستن منو' : 'باز کردن منو';
  menu.inert = !open;
}

setMenu(false);
toggle.addEventListener('click', () => setMenu(!header.classList.contains('is-open')));
menu.addEventListener('click', (e) => {
  if (e.target.closest('a')) setMenu(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && header.classList.contains('is-open')) {
    setMenu(false);
    toggle.focus();
  }
});
document.addEventListener('pointerdown', (e) => {
  if (header.classList.contains('is-open') && !header.contains(e.target)) setMenu(false);
});
compactMenu.addEventListener('change', () => setMenu(false));

let scrolled = null;
function onScrollHeader() {
  const next = scrollY > 24;
  if (next !== scrolled) {
    scrolled = next;
    header.classList.toggle('is-scrolled', next);
  }
}
addEventListener('scroll', onScrollHeader, { passive: true });
onScrollHeader();

// ---------------------------------------------------------------- Active page + nav indicator

const navList = header.querySelector('[data-nav-list]');
const indicator = header.querySelector('[data-nav-indicator]');
const navLinks = [...header.querySelectorAll('[data-nav]')];
let activeKey = currentRoute();

function placeIndicator() {
  const link = navList.querySelector(`[data-nav="${activeKey}"]`);
  if (!link || !link.offsetWidth) {
    indicator.style.setProperty('--o', '0');
    return;
  }
  indicator.style.setProperty('--x', `${link.offsetLeft}px`);
  indicator.style.setProperty('--w', `${link.offsetWidth}px`);
  indicator.style.setProperty('--o', '1');
}

function setActive(key) {
  activeKey = key;
  for (const link of navLinks) {
    const on = link.dataset.nav === key;
    link.classList.toggle('is-active', on);
    if (on) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  placeIndicator();
}

addEventListener('resize', placeIndicator);
document.fonts?.ready.then(placeIndicator);
router.onChange((route) => {
  setActive(route);
  setMenu(false);
});
setActive(currentRoute());

// ---------------------------------------------------------------- Contact details

for (const [key, item] of Object.entries(contact)) {
  const isText = key === 'whatsapp' && !item.active;
  document.querySelectorAll(`[data-contact-value="${key}"]`).forEach((el) => {
    el.textContent = key.startsWith('phone') ? toFa(item.display) : item.display;
    if (isText) el.removeAttribute('dir');
  });
  const href = !item.active
    ? null
    : key.startsWith('phone')
      ? `tel:${item.tel}`
      : key === 'email'
        ? `mailto:${item.address}`
        : `https://wa.me/${item.number}`;
  document.querySelectorAll(`[data-contact-action="${key}"]`).forEach((el) => {
    if (href) {
      el.href = href;
      el.removeAttribute('aria-disabled');
      el.removeAttribute('role');
      if (key === 'whatsapp') {
        el.target = '_blank';
        el.rel = 'noopener';
      }
    } else {
      el.title = 'این راه ارتباطی به‌زودی فعال می‌شود';
    }
  });
}

document.addEventListener('click', (e) => {
  const blocked = e.target.closest('[aria-disabled="true"]');
  if (blocked) e.preventDefault();
});

// ---------------------------------------------------------------- Year (Persian calendar)

try {
  const year = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric' }).format(new Date());
  document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = year.replace(/[^\d۰-۹]/g, '')));
} catch {
  /* keep the static year */
}

// ---------------------------------------------------------------- Motion + products

initAnimations({ reducedMotion });
initProducts({ reducedMotion });
initFilters({ reducedMotion });

// ---------------------------------------------------------------- 3D stage (all three pages)

const hosts = {
  home: document.querySelector('[data-stage]'),
  products: document.querySelector('[data-stage-host="products"]'),
  contact: document.querySelector('[data-stage-host="contact"]'),
};
const callouts = new Map([...document.querySelectorAll('[data-callout]')].map((el) => [el.dataset.callout, el]));
if (hosts.home) startStage();

// Engineering labels that follow the layers of the turning cable.
function placeCallouts(shot, points) {
  const width = hosts.products.clientWidth;
  for (const p of points) {
    const el = callouts.get(p.name);
    if (!el) continue;
    el.style.setProperty('--x', `${p.x.toFixed(1)}px`);
    el.style.setProperty('--y', `${p.y.toFixed(1)}px`);
    el.classList.toggle('is-flip', p.x > width * 0.62);
    el.classList.toggle('is-visible', p.visible);
  }
}

async function startStage() {
  const capture = new URLSearchParams(location.search).get('capture');
  // Slow device or connection: show the rendered poster until the 3D frame is ready.
  const posterTimer = setTimeout(() => root.classList.add('poster-on'), 3500);
  try {
    if (!hasWebGL()) throw new Error('WebGL unavailable');
    const { createStage } = await import('./hero3d/stage.js');
    await createStage({
      hosts,
      slot: document.querySelector('[data-scene-slot]'),
      hero: document.querySelector('[data-hero]'),
      reducedMotion,
      capture,
      skipIntro: () => root.classList.contains('poster-on'),
      onCallouts: placeCallouts,
    });
  } catch (err) {
    root.classList.add('no-webgl');
    console.warn('[simland] 3D stage disabled:', err.message);
  } finally {
    clearTimeout(posterTimer);
  }
}

function hasWebGL() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}
