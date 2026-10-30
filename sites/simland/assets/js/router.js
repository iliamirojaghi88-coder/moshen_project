// Three pages in one file: home (#/), products (#/products) and contact
// (#/contact). The initial page is chosen by an inline script in <head>
// before first paint; this module handles in-page navigation, the page
// transition and the back button.
//
//   #/                 home
//   #/products         products
//   #/products/<slug>  products, with that product open (see products.js)
//   #/product/<slug>   home, with that product open
//   #/contact          contact
//   #<section-id>      scroll to a section, switching page if it lives on another one
const root = document.documentElement;

const TITLES = {
  home: 'سیم‌لند | سیم و کابل ساختمانی، صنعتی و تخصصی',
  products: 'محصولات | سیم‌لند',
  contact: 'ارتباط با ما | سیم‌لند',
};

export const routeOf = (hash) => (/^#\/products(\/|$)/.test(hash) ? 'products' : /^#\/contact$/.test(hash) ? 'contact' : 'home');
export const currentRoute = () => root.dataset.route || 'home';

// History calls can be refused (e.g. some browsers on file://); the page
// still works, only the address bar does not follow.
export function setUrl(hash, state = null, replace = false) {
  try {
    history[replace ? 'replaceState' : 'pushState'](state, '', hash || location.pathname + location.search);
  } catch {
    /* ignore */
  }
}

export function initRouter({ reducedMotion }) {
  const listeners = new Set();
  document.title = TITLES[currentRoute()];
  let pending = null;

  function swap(route, then) {
    root.dataset.route = route;
    document.title = TITLES[route];
    window.scrollTo({ top: 0, behavior: 'instant' });
    // Layout changed under fixed and measured elements (3D stage, nav pill).
    dispatchEvent(new Event('resize'));
    dispatchEvent(new CustomEvent('simland:route', { detail: { route } }));
    listeners.forEach((fn) => fn(route));
    then?.();
    document.getElementById('main')?.focus?.({ preventScroll: true });
  }

  // A curtain of light crosses the screen, the page changes behind it.
  function show(route, then) {
    if (route === currentRoute() && !pending) return false;
    if (reducedMotion) {
      swap(route, then);
      return true;
    }
    clearTimeout(pending);
    root.classList.remove('is-entering');
    root.classList.add('is-leaving');
    pending = setTimeout(() => {
      pending = null;
      swap(route, then);
      root.classList.remove('is-leaving');
      root.classList.add('is-entering');
      setTimeout(() => root.classList.remove('is-entering'), 560);
    }, 340);
    return true;
  }

  function scrollToSection(el, jump) {
    el.scrollIntoView({ behavior: jump || reducedMotion ? 'instant' : 'smooth', block: 'start' });
  }

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const href = link.getAttribute('href');
    if (href === '#' || href === '#main') return;

    if (href.startsWith('#/')) {
      e.preventDefault();
      const route = routeOf(href);
      if (show(route)) setUrl(href, { route });
      else {
        setUrl(href, { route }, true);
        window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
      }
      return;
    }

    const target = document.getElementById(href.slice(1));
    if (!target) return;
    e.preventDefault();
    const view = target.closest('[data-view]')?.dataset.view;
    if (view && view !== currentRoute()) {
      show(view, () => scrollToSection(target, true));
      setUrl(href, { route: view });
    } else {
      scrollToSection(target, false);
      setUrl(href, { route: currentRoute() }, true);
    }
  });

  function sync() {
    const hash = location.hash;
    if (hash.startsWith('#/') || hash === '') {
      show(routeOf(hash));
      return;
    }
    const target = document.getElementById(hash.slice(1));
    if (!target) return;
    const view = target.closest('[data-view]')?.dataset.view;
    if (view && view !== currentRoute()) show(view, () => scrollToSection(target, true));
  }

  addEventListener('popstate', sync);
  addEventListener('hashchange', sync);

  return {
    onChange: (fn) => listeners.add(fn),
    show,
  };
}
