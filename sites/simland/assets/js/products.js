// Product detail view: a native <dialog> opened from any product card.
// The card image morphs into the dialog image with a view transition where
// the browser supports it; the URL gets #p-<slug> so the view can be shared
// and the back button closes it.
import { toFa } from './util.js';

const root = document.documentElement;

export function initProducts({ reducedMotion }) {
  const dialog = document.querySelector('[data-product-dialog]');
  const cards = [...document.querySelectorAll('.product-card')];
  if (!dialog || !cards.length) return;

  const img = dialog.querySelector('[data-pd-img]');
  const title = dialog.querySelector('[data-pd-title]');
  const indexEl = dialog.querySelector('[data-pd-index]');
  const products = cards.map((card) => {
    const cardImg = card.querySelector('img');
    return {
      slug: card.dataset.product,
      name: card.querySelector('.product-name').textContent.trim(),
      srcset: cardImg.getAttribute('srcset'),
      src: cardImg.getAttribute('src').replace('-660.', '-880.'),
      card,
      cardImg,
    };
  });

  let current = -1;
  const canMorph = () => !reducedMotion && typeof document.startViewTransition === 'function';

  function fill(i, swap = false) {
    const p = products[i];
    current = i;
    img.srcset = p.srcset;
    img.sizes = '(min-width: 720px) 520px, 100vw';
    img.src = p.src;
    img.alt = p.name;
    title.textContent = p.name;
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
    if (push) history.pushState({ pd: p.slug }, '', `#p-${p.slug}`);
    morph(p.cardImg, img, () => {
      fill(i);
      dialog.showModal();
      root.classList.add('dialog-open');
    });
  }

  function close() {
    if (!dialog.open) return;
    const p = products[current];
    const finish = () => {
      dialog.classList.remove('is-closing');
      delete dialog.dataset.morphed;
      dialog.close();
      root.classList.remove('dialog-open');
    };
    if (canMorph() && isOnScreen(p.card)) {
      morph(img, p.cardImg, finish);
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
    history.replaceState({ pd: products[next].slug }, '', `#p-${products[next].slug}`);
  }

  cards.forEach((card, i) => {
    card.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      open(i);
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

  dialog.querySelectorAll('[data-pd-inquiry]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const target = document.getElementById('contact');
      if (!target) return;
      e.preventDefault();
      history.replaceState(null, '', '#contact');
      delete dialog.dataset.morphed;
      dialog.close();
      root.classList.remove('dialog-open');
      target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      target.querySelector('h2')?.focus({ preventScroll: true });
    });
  });

  addEventListener('popstate', (e) => {
    const slug = e.state?.pd;
    if (slug) {
      const i = products.findIndex((p) => p.slug === slug);
      if (i >= 0 && !dialog.open) open(i, { push: false });
      else if (i >= 0) fill(i, true);
    } else {
      close();
    }
  });

  // Deep link (products.html#p-armoured) or a hash typed into the address bar.
  function openFromHash() {
    const match = location.hash.match(/^#p-([\w-]+)$/);
    const i = match ? products.findIndex((p) => p.slug === match[1]) : -1;
    if (i < 0 || dialog.open) return;
    history.replaceState({ pd: products[i].slug, landing: true }, '', location.hash);
    requestAnimationFrame(() => open(i, { push: false }));
  }
  openFromHash();
  addEventListener('hashchange', openFromHash);

  // A deep-linked dialog has no history entry of its own to go back to,
  // so closing it just clears the hash.
  dialog.addEventListener('close', () => {
    if (history.state?.landing) history.replaceState(null, '', location.pathname + location.search);
  });
}

function isOnScreen(el) {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight && r.width > 0;
}
