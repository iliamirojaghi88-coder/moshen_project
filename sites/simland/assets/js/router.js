// Two views in one page: home (#/) and products (#/products).
// The initial view is chosen by an inline script in <head> before first
// paint; this module handles in-page navigation and the back button.
//
//   #/                 home
//   #/products         products
//   #/products/<slug>  products, with that product open (see products.js)
//   #/product/<slug>   home, with that product open
//   #<section-id>      scroll to a section, switching view if it lives in the other one
const root = document.documentElement;

const TITLES = {
  home: 'سیم‌لند | سیم و کابل ساختمانی و صنعتی',
  products: 'محصولات | سیم‌لند',
};

export const routeOf = (hash) => (/^#\/products(\/|$)/.test(hash) ? 'products' : 'home');
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

  function show(route) {
    if (route === currentRoute()) return false;
    root.dataset.route = route;
    document.title = TITLES[route];
    window.scrollTo({ top: 0, behavior: 'instant' });
    // Layout changed under fixed and measured elements (3D stage, nav pill).
    dispatchEvent(new Event('resize'));
    listeners.forEach((fn) => fn(route));
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
    const switched = view ? show(view) : false;
    scrollToSection(target, switched);
    setUrl(href, { route: currentRoute() }, !switched);
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
    if (view) show(view);
  }

  addEventListener('popstate', sync);
  addEventListener('hashchange', sync);

  return {
    onChange: (fn) => listeners.add(fn),
    show,
  };
}
