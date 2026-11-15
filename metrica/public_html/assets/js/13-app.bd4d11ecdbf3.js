
/* assets/js/app.js */
/* METRICA web app — router, shared navigation state, account data binding, curved skins.
   Header and bottom nav live outside #view and are never rebuilt; a route change only swaps #view. */
(() => {
  'use strict';

  // route → template. `chrome:false` hides header + nav (full-screen inner pages); `header:false` hides only the
  // shared header, for a page that draws its own (خانه)
  const ROUTES = {
    home:     { title: 'خانه',     tpl: 'tpl-home', header: false, page: () => window.MetricaHome },
    features: { title: 'امکانات',  tpl: 'tpl-features' },
    projects: { title: 'پروژه‌ها', tpl: 'tpl-projects' },
    account:  { title: 'حساب من',  tpl: 'tpl-account' },
    // inner pages of «حساب من» (#/account/settings/…), header and nav kept; sub-pages first so the longer path matches
    settingsLogin:         { title: 'ورود آسان',      path: 'account/settings/easy-login',    parent: 'account', tpl: 'tpl-settings-login' },
    settingsInvite:        { title: 'دعوت از دوستان', path: 'account/settings/invite',        parent: 'account', tpl: 'tpl-settings-invite' },
    settingsNotifications: { title: 'اعلان‌ها',        path: 'account/settings/notifications', parent: 'account', tpl: 'tpl-settings-notifications' },
    settingsSecurity:      { title: 'امنیت حساب',     path: 'account/settings/security',      parent: 'account', tpl: 'tpl-settings-security' },
    settings:              { title: 'تنظیمات',        path: 'account/settings',               parent: 'account', tpl: 'tpl-settings' },
    // inner page of «امکانات» (#/features/analysis/…): a full-screen environment without header and nav;
    // its module owns the view and its own sub-paths
    analysis: { title: 'آنالیز ساخت', path: 'features/analysis', parent: 'features', chrome: false, page: () => window.MetricaAnalysis },
  };
  const NAV = ['home', 'features', 'projects', 'account']; // right → left
  const DEFAULT_ROUTE = 'features';

  // Account data: the sign-in layer (panels.js) fills it with Metrica.setUser(user) from the server's session,
  // and Metrica.setUser(null) returns to a guest. The phone number is deliberately not part of the view.
  const PLANS = { normal: 'عادی', plus: 'پلاس', pro: 'پرو', max: 'MAX' };
  const GUEST = { name: 'کاربر متریکا', firstName: '', avatar: null, plan: 'normal' };
  const state = { user: { ...GUEST }, signedIn: false, checked: false };
  // pages that depend on who is signed in (خانه) listen for this; fired on every change and once the session is known
  const announce = () => document.dispatchEvent(new CustomEvent('metrica:user', { detail: { signedIn: state.signedIn } }));

  /* header: «ورود / ثبت‌نام» for a guest, the user's name once signed in. The name shows at most 6 visible characters
     (grapheme clusters, so a letter with its marks is one) and then «…»; the full name stays in the tooltip.
     Its direction follows its own script (bdi dir=auto) inside the RTL header; the button keeps the width of
     «ورود / ثبت‌نام» (a hidden copy sizes it), so no name length moves «خرید اشتراک». */
  const HDR_MAX = 6;
  const graphemes = (s) => (window.Intl && Intl.Segmenter
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].map((g) => g.segment)
    : Array.from(s)); // older browsers: code points
  function shortName(s) {
    const g = graphemes(s);
    return g.length > HDR_MAX ? `${g.slice(0, HDR_MAX).join('').trimEnd()}…` : s;
  }
  const login = document.querySelector('.m-hdr__login');
  function bindHeader() {
    const full = state.signedIn ? String(state.user.firstName || state.user.name || '').trim() : '';
    const guest = login.querySelector('.m-hdr__guest'), who = login.querySelector('.m-hdr__who'), name = who.querySelector('bdi');
    name.textContent = full ? shortName(full) : '';
    name.title = full;
    guest.hidden = !!full;
    who.hidden = !full;
  }

  const view = document.getElementById('view');
  const nav = document.getElementById('m-nav');
  const navItems = [...nav.querySelectorAll('[data-route]')];
  let current = null;

  /* ---------- curved skins: paths rebuilt from the element's real size ---------- */
  const SHAPES = {
    // header: one glass surface — rounded wing tips, concave top, steep sides, a shallow arch along the base.
    // Side curve keeps 7.6% of h clearance at mid-height, so the row's 15px padding never touches it.
    tray(w, h) {
      const d = h * .14, t = Math.min(4, h * .07), a = h * .05, k = Math.min(h * 1.6, w * .22);
      const x0 = w - h * .85, x2 = h * .85, c = h * .38, s = (2 * a) / (x0 - w / 2); // s: base-arch slope, keeps the corners tangent
      const top = `M${t * .9},${t * .35} C${h * .42},${d * .78} ${h * .9},${d} ${k},${d} L${w - k},${d} C${w - h * .9},${d} ${w - h * .42},${d * .78} ${w - t * .9},${t * .35}`;
      const base = `Q${w},0 ${w},${t} C${w - .5},${h * .62} ${x0 + c},${h - a - c * s} ${x0},${h - a} ` +
        `Q${w / 2},${h + a} ${x2},${h - a} C${x2 - c},${h - a - c * s} .5,${h * .62} 0,${t} Q0,0 ${t * .9},${t * .35}`;
      return { tray: `${top} ${base} Z`, trayTop: top, trayRim: `M${w - t * .9},${t * .35} ${base}` };
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
    const u = state.user, plan = PLANS[u.plan] ? u.plan : 'normal', real = state.signedIn && !!u.name;
    const values = { 'user.name': real ? u.name : GUEST.name, 'user.planLabel': PLANS[plan] };
    root.querySelectorAll('[data-bind]').forEach((el) => {
      if (el.dataset.bind === 'user.name') { // a person's name: its own direction, never run through the translator
        if (real) { el.dir = 'auto'; el.translate = false; } else { el.removeAttribute('dir'); el.removeAttribute('translate'); }
      }
      el.textContent = values[el.dataset.bind] ?? '';
    });
    root.querySelectorAll('[data-bind-src="user.avatar"]').forEach((img) => {
      img.dataset.defaultSrc ??= img.getAttribute('src'); // the template's own image is the default avatar
      img.src = u.avatar || img.dataset.defaultSrc;
      img.alt = u.avatar ? `تصویر ${values['user.name']}` : '';
    });
    root.querySelectorAll('[data-plan]').forEach((el) => { el.dataset.plan = plan; });
  }

  /* ---------- router ---------- */
  function routeFromHash() {
    const path = location.hash.replace(/^#\/?/, '');
    const inner = Object.keys(ROUTES).find((k) => ROUTES[k].path && (path === ROUTES[k].path || path.startsWith(`${ROUTES[k].path}/`)));
    if (inner) return inner;
    const key = path.split(/[/?]/)[0];
    return ROUTES[key] && !ROUTES[key].path ? key : null;
  }

  function render() {
    const key = routeFromHash();
    if (!key) { history.replaceState(null, '', `#/${DEFAULT_ROUTE}`); return render(); }
    const route = ROUTES[key], page = route.page && route.page();
    if (key === current) { if (page) page.update(); return; } // an inner page's own sub-path changed
    if (current && ROUTES[current].page) ROUTES[current].page().unmount();
    const first = current === null;
    current = key;

    // nav state first, so the selector starts moving with the click (an inner page lights its parent)
    const idx = NAV.indexOf(route.parent || key);
    nav.style.setProperty('--idx', idx);
    nav.dataset.idx = idx;
    navItems.forEach((a) => (a.dataset.route === key ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    document.body.dataset.route = key;
    document.body.dataset.chrome = route.chrome === false ? 'hidden' : route.header === false ? 'nav' : 'shown';
    document.getElementById('m-hdr').inert = route.chrome === false || route.header === false; // off-screen: out of the tab order too
    document.title = `متریکا — ${route.title}`;

    view.replaceChildren(page ? page.mount() : document.getElementById(route.tpl).content.cloneNode(true));
    bindUser(view);
    watchShapes(view);
    if (!first) {
      view.classList.remove('m-view--enter');
      void view.offsetWidth; // restart the enter animation
      view.classList.add('m-view--enter');
      window.scrollTo({ top: 0, behavior: 'instant' });
      view.focus({ preventScroll: true });
    }
    if (page) page.update();
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
    navigate: (key) => { if (ROUTES[key]) location.hash = `#/${ROUTES[key].path || key}`; },
    setUser(user) { // the whole user from the server (replaces, never merges), or null for a guest
      state.signedIn = !!user;
      state.user = { ...GUEST, ...(user || {}) };
      bindUser(view);
      bindHeader();
      announce();
    },
    sessionChecked() { // panels.js: the server has answered (or there is no server); called after every check
      if (state.checked) return;
      state.checked = true;
      announce();
    },
    get sessionKnown() { return state.checked; },
    get signedIn() { return state.signedIn; },
    get user() { return { ...state.user }; },
  };
})();
