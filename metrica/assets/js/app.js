/* METRICA web app — router, shared navigation state, account data binding, curved skins.
   Header and bottom nav live outside #view and are never rebuilt; a route change only swaps #view. */
(() => {
  'use strict';

  // route → template. `chrome:false` would hide header + nav for deeper inner pages (none yet).
  const ROUTES = {
    home:     { title: 'خانه',     tpl: 'tpl-home' },
    features: { title: 'امکانات',  tpl: 'tpl-features' },
    projects: { title: 'پروژه‌ها', tpl: 'tpl-projects' },
    account:  { title: 'حساب من',  tpl: 'tpl-account' },
  };
  const NAV = ['home', 'features', 'projects', 'account']; // right → left
  const DEFAULT_ROUTE = 'features';

  // Account data. No backend exists yet: a future auth layer fills it with Metrica.setUser().
  // The phone number is deliberately not part of the view.
  const PLANS = { normal: 'عادی', plus: 'پلاس', pro: 'پرو' };
  const DEFAULT_AVATAR = 'assets/img/account/avatar-default.png';
  const state = { user: { name: 'کاربر متریکا', avatar: null, plan: 'normal' } };

  const view = document.getElementById('view');
  const nav = document.getElementById('m-nav');
  const navItems = [...nav.querySelectorAll('[data-route]')];
  let current = null;

  /* ---------- curved skins: paths rebuilt from the element's real size ---------- */
  const SHAPES = {
    // header tray: wing tips at the top corners, concave top edge, deep rounded base (account reference header)
    tray(w, h) {
      const d = h * 0.16, k = Math.min(h * 1.5, w * 0.2);
      const top = `M0,0 C${h * .35},${d * .85} ${h * .8},${d} ${k},${d} L${w - k},${d} C${w - h * .8},${d} ${w - h * .35},${d * .85} ${w},0`;
      const base = `C${w - 3},${h * .55} ${w - h * .35},${h} ${w - h * 1.1},${h} L${h * 1.1},${h} C${h * .35},${h} 3,${h * .55} 0,0`;
      return { tray: `${top} ${base} Z`, trayTop: top, trayRim: `M${w},0 ${base}` };
    },
    // profile card: body with a raised shoulder on the right for the avatar (account reference, 708 × 245)
    profile(w, h) {
      const a = w / 708, b = 60 * a, rl = 46 * a, rb = 56 * a, rt = 74 * a;
      const s0 = w - 292 * a, s1 = w - 196 * a;
      const body = `M0,${b + rl} C0,${b + rl * .45} ${rl * .45},${b} ${rl},${b} L${s0},${b} ` +
        `C${s0 + 52 * a},${b} ${s1 - 50 * a},0 ${s1},0 L${w - rt},0 C${w - rt * .45},0 ${w},${rt * .45} ${w},${rt} ` +
        `L${w},${h - rb} C${w},${h - rb * .45} ${w - rb * .45},${h} ${w - rb},${h} L${rb},${h} C${rb * .45},${h} 0,${h - rb * .45} 0,${h - rb} Z`;
      const gold = `M0,${h - rb - 46 * a} L0,${h - rb} C0,${h - rb * .45} ${rb * .45},${h} ${rb},${h} L${rb + 130 * a},${h}`;
      return { profile: body, profileGold: gold };
    },
  };
  const fmt = (s) => s.replace(/-?\d+\.\d+/g, (n) => (+n).toFixed(2));
  function fitShape(svg) {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const paths = SHAPES[svg.dataset.shape](r.width, r.height);
    svg.setAttribute('viewBox', `0 0 ${r.width.toFixed(2)} ${r.height.toFixed(2)}`);
    svg.querySelectorAll('[data-d]').forEach((p) => p.setAttribute('d', fmt(paths[p.dataset.d])));
  }
  const ro = 'ResizeObserver' in window ? new ResizeObserver((es) => es.forEach((e) => fitShape(e.target))) : null;
  function watchShapes(root) {
    root.querySelectorAll('svg[data-shape]').forEach((svg) => { fitShape(svg); ro && ro.observe(svg); });
  }

  /* ---------- account data binding ---------- */
  function bindUser(root) {
    const u = state.user, plan = PLANS[u.plan] ? u.plan : 'normal';
    const values = { 'user.name': u.name || 'کاربر متریکا', 'user.planLabel': PLANS[plan] };
    root.querySelectorAll('[data-bind]').forEach((el) => { el.textContent = values[el.dataset.bind] ?? ''; });
    root.querySelectorAll('[data-bind-src="user.avatar"]').forEach((img) => {
      img.src = u.avatar || DEFAULT_AVATAR;
      img.alt = u.avatar ? `تصویر ${values['user.name']}` : '';
    });
    root.querySelectorAll('[data-plan]').forEach((el) => { el.dataset.plan = plan; });
  }

  /* ---------- router ---------- */
  function routeFromHash() {
    const key = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
    return ROUTES[key] ? key : null;
  }

  function render() {
    const key = routeFromHash();
    if (!key) { history.replaceState(null, '', `#/${DEFAULT_ROUTE}`); return render(); }
    if (key === current) return;
    const route = ROUTES[key];
    const first = current === null;
    current = key;

    // nav state first, so the selector starts moving with the click
    const idx = NAV.indexOf(key);
    nav.style.setProperty('--idx', idx);
    nav.dataset.idx = idx;
    navItems.forEach((a) => (a.dataset.route === key ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    document.body.dataset.route = key;
    document.body.dataset.chrome = route.chrome === false ? 'hidden' : 'shown';
    document.title = `متریکا — ${route.title}`;

    view.replaceChildren(document.getElementById(route.tpl).content.cloneNode(true));
    bindUser(view);
    watchShapes(view);
    if (!first) {
      view.classList.remove('m-view--enter');
      void view.offsetWidth; // restart the enter animation
      view.classList.add('m-view--enter');
      window.scrollTo({ top: 0, behavior: 'instant' });
      view.focus({ preventScroll: true });
    }
  }

  // buttons without a backend yet announce their intent instead of faking a result
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action],[data-mtr-action],[data-mtr-tool]');
    if (!b) return;
    const action = b.dataset.action || b.dataset.mtrAction || `tool:${b.dataset.mtrTool}`;
    document.dispatchEvent(new CustomEvent('metrica:action', { detail: { action, route: current } }));
  });

  window.addEventListener('hashchange', render);
  watchShapes(document.getElementById('m-hdr'));
  render();

  // integration surface for the future account/auth layer
  window.Metrica = {
    routes: ROUTES,
    navigate: (key) => { if (ROUTES[key]) location.hash = `#/${key}`; },
    setUser(user) {
      Object.assign(state.user, user);
      bindUser(view);
    },
    get user() { return { ...state.user }; },
  };
})();
