// Product detail view: a native <dialog> opened from any product card, on
// the home or products page. The card image morphs into the dialog image with a view
// transition where the browser supports it; the URL gets #/products/<slug>
// (or #/product/<slug> on the home page) so the product can be shared and the
// back button closes it. Also the category filter of the catalogue.
import { currentRoute, setUrl } from './router.js';
import { toFa } from './util.js';

const root = document.documentElement;
const SLUG_HASH = /^#\/products?\/([\w-]+)$/;

export function initProducts({ reducedMotion }) {
  const dialog = document.querySelector('[data-product-dialog]');
  const cards = [...document.querySelectorAll('.pcard')];
  if (!dialog || !cards.length) return;

  // The product grid appears on two pages; an image embedded once is shared
  // by every card and thumbnail that shows the same product.
  document.querySelectorAll('img[data-src-ref]').forEach((el) => {
    const source = document.querySelector(`.pcard[data-product="${el.dataset.srcRef}"] img[src]`);
    if (source) el.src = source.getAttribute('src');
  });

  const img = dialog.querySelector('[data-pd-img]');
  const title = dialog.querySelector('[data-pd-title]');
  const catEl = dialog.querySelector('[data-pd-cat]');
  const indexEl = dialog.querySelector('[data-pd-index]');
  const products = [];
  for (const card of cards) {
    if (products.some((p) => p.slug === card.dataset.product)) continue;
    const cardImg = card.querySelector('img');
    const srcset = cardImg.getAttribute('srcset');
    products.push({
      slug: card.dataset.product,
      name: card.querySelector('.pcard-name').textContent.trim(),
      cat: card.dataset.catName,
      srcset,
      // with a srcset the largest file is the 880px one; inlined images are already 880px
      src: srcset ? cardImg.getAttribute('src').replace('-660.', '-880.') : cardImg.getAttribute('src'),
    });
  }
  const indexOf = (slug) => products.findIndex((p) => p.slug === slug);
  // The card for a product on the view that is showing.
  const cardFor = (slug) =>
    cards.find((c) => c.dataset.product === slug && c.offsetParent !== null) ?? cards.find((c) => c.dataset.product === slug);
  const hashFor = (slug) => (currentRoute() === 'products' ? `#/products/${slug}` : `#/product/${slug}`);

  let current = -1;
  const canMorph = () => !reducedMotion && typeof document.startViewTransition === 'function';

  function fill(i, swap = false) {
    const p = products[i];
    current = i;
    if (p.srcset) {
      img.srcset = p.srcset;
      img.sizes = '(min-width: 720px) 520px, 100vw';
    }
    img.src = p.src;
    img.alt = p.name;
    title.textContent = p.name;
    catEl.textContent = p.cat;
    indexEl.textContent = toFa(i + 1);
    if (swap) {
      img.classList.remove('is-swapping');
      void img.offsetWidth;
      img.classList.add('is-swapping');
    }
  }

  function morph(from, to, update) {
    if (!canMorph() || !isOnScreen(from === img ? to : from)) {
      update();
      return;
    }
    dialog.dataset.morphed = '';
    from.style.viewTransitionName = 'pd-image';
    const vt = document.startViewTransition(() => {
      from.style.viewTransitionName = '';
      to.style.viewTransitionName = 'pd-image';
      update();
    });
    vt.finished.finally(() => {
      to.style.viewTransitionName = '';
    });
  }

  function open(i, { push = true } = {}) {
    const p = products[i];
    if (push) setUrl(hashFor(p.slug), { pd: p.slug, route: currentRoute() });
    morph(cardFor(p.slug).querySelector('img'), img, () => {
      fill(i);
      dialog.showModal();
      root.classList.add('dialog-open');
    });
  }

  function close() {
    if (!dialog.open) return;
    const card = cardFor(products[current].slug);
    const finish = () => {
      dialog.classList.remove('is-closing');
      delete dialog.dataset.morphed;
      dialog.close();
      root.classList.remove('dialog-open');
    };
    if (canMorph() && isOnScreen(card)) {
      morph(img, card.querySelector('img'), finish);
    } else if (!reducedMotion) {
      dialog.classList.add('is-closing');
      setTimeout(finish, 300);
    } else {
      finish();
    }
  }

  // Closing goes through history when the dialog added an entry, so the
  // back button and the close button behave the same.
  function requestClose() {
    if (history.state?.pd && !history.state.landing) history.back();
    else close();
  }

  function step(delta) {
    const next = (current + delta + products.length) % products.length;
    fill(next, true);
    const { landing } = history.state ?? {};
    setUrl(hashFor(products[next].slug), { pd: products[next].slug, route: currentRoute(), landing }, true);
  }

  cards.forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      open(indexOf(card.dataset.product));
    });
  });

  dialog.querySelector('[data-pd-close]').addEventListener('click', requestClose);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    requestClose();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) requestClose();
  });
  dialog.querySelectorAll('[data-pd-step]').forEach((btn) => {
    btn.addEventListener('click', () => step(Number(btn.dataset.pdStep)));
  });
  dialog.addEventListener('keydown', (e) => {
    // RTL: the left arrow moves forward.
    if (e.key === 'ArrowLeft') step(1);
    if (e.key === 'ArrowRight') step(-1);
  });

  // Inquiry: the dialog closes on the spot and the router opens the contact
  // page; back returns to this product.
  dialog.querySelectorAll('[data-pd-inquiry]').forEach((link) => {
    link.addEventListener('click', () => {
      delete dialog.dataset.morphed;
      dialog.close();
      root.classList.remove('dialog-open');
    });
  });

  addEventListener('popstate', (e) => {
    const slug = e.state?.pd;
    if (slug) {
      const i = indexOf(slug);
      if (i >= 0 && !dialog.open) open(i, { push: false });
      else if (i >= 0) fill(i, true);
    } else {
      close();
    }
  });

  // Deep link (#/products/armoured) or a product hash typed into the address bar.
  function openFromHash() {
    const match = location.hash.match(SLUG_HASH);
    const i = match ? indexOf(match[1]) : -1;
    if (i < 0 || dialog.open) return;
    setUrl(location.hash, { pd: products[i].slug, route: currentRoute(), landing: true }, true);
    requestAnimationFrame(() => open(i, { push: false }));
  }
  openFromHash();
  addEventListener('hashchange', openFromHash);

  // A deep-linked dialog has no history entry of its own to go back to,
  // so closing it just returns the address to the view it was opened on.
  dialog.addEventListener('close', () => {
    if (history.state?.landing) setUrl(currentRoute() === 'products' ? '#/products' : '', { route: currentRoute() }, true);
  });
}

// Catalogue filter: chips above the grid and the category tiles above them.
export function initFilters({ reducedMotion }) {
  const grid = document.querySelector('[data-view-grid="products"]');
  const chips = [...document.querySelectorAll('[data-filter]')];
  if (!grid || !chips.length) return;
  const items = [...grid.querySelectorAll('.pitem')];

  function apply(key) {
    chips.forEach((chip) => {
      const on = chip.dataset.filter === key;
      chip.classList.toggle('is-active', on);
      chip.setAttribute('aria-pressed', String(on));
    });
    grid.classList.toggle('is-filtered', key !== 'all');
    let n = 0;
    for (const item of items) {
      const show = key === 'all' || item.dataset.cat === key;
      item.hidden = !show;
      if (!show) continue;
      if (!reducedMotion) {
        item.classList.remove('is-in');
        item.style.setProperty('--d', String(n++));
      }
    }
    if (!reducedMotion) {
      void grid.offsetWidth;
      items.forEach((item) => !item.hidden && item.classList.add('is-in'));
    }
  }

  chips.forEach((chip) => chip.addEventListener('click', () => apply(chip.dataset.filter)));
  document.querySelectorAll('[data-filter-jump]').forEach((tile) => {
    tile.addEventListener('click', () => {
      apply(tile.dataset.filterJump);
      document.getElementById('catalog')?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
    });
  });
}

function isOnScreen(el) {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight && r.width > 0;
}
