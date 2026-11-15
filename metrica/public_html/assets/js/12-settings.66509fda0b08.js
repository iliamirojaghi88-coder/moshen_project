
/* assets/js/settings.js
   METRICA — «تنظیمات»: navigation between حساب من → تنظیمات → sub-pages, and the language mini-panel.
   Forward moves add a history entry; back buttons reuse the entry they came from (as in «آنالیز ساخت»),
   so the in-page back buttons and the browser Back button walk the same path.
   Operational: language choice (applied at once, saved, direction switched). The four sub-pages are UI only. */
(() => {
  'use strict';
  const i18n = window.MetricaI18n;
  const dlg = document.getElementById('lang-dlg');
  const opts = [...dlg.querySelectorAll('.lang-opt')];
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let opener = null, closing = 0;

  function go(hash) { const from = location.hash; location.hash = hash; history.replaceState({ mFrom: from }, ''); }
  function back(hash) { if (history.state && history.state.mFrom === hash) history.back(); else location.replace(hash); }

  /* ---------- language mini-panel ---------- */
  function sync() {
    opts.forEach((o) => {
      const on = o.dataset.lang === i18n.lang;
      o.setAttribute('aria-checked', String(on));
      o.tabIndex = on ? 0 : -1; // one tab stop; arrows move inside the group
    });
  }
  function lock(on) {
    const h = document.documentElement;
    if (on) h.classList.toggle('m-lock--gutter', h.scrollHeight > h.clientHeight); // keeps the page from shifting sideways
    h.classList.toggle('m-lock', on);
    if (!on) h.classList.remove('m-lock--gutter');
  }
  function open(from) {
    if (dlg.open) return;
    opener = from || null;
    clearTimeout(closing);
    dlg.classList.remove('is-closing');
    sync();
    lock(true);
    dlg.showModal();
    (opts.find((o) => o.getAttribute('aria-checked') === 'true') || opts[0]).focus();
  }
  function close() {
    if (!dlg.open || dlg.classList.contains('is-closing')) return;
    const done = () => {
      dlg.classList.remove('is-closing');
      dlg.close();
      lock(false);
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
      opener = null;
    };
    if (reduced()) return done();
    dlg.classList.add('is-closing');
    closing = setTimeout(done, 180);
  }
  function choose(o) {
    i18n.set(o.dataset.lang); // applied at once: text, direction and the saved choice
    sync();
    o.focus({ preventScroll: true });
    setTimeout(close, reduced() ? 0 : 140); // the tick is seen before the panel leaves
  }

  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) return close(); // the backdrop (the box fills the dialog, so only outside clicks land here)
    const o = e.target.closest('.lang-opt');
    if (o) return choose(o);
    if (e.target.closest('[data-lang-close]')) close();
  });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); }); // Escape: same soft exit
  dlg.addEventListener('keydown', (e) => {
    const i = opts.indexOf(document.activeElement);
    if (i < 0) return;
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (step) { e.preventDefault(); opts[(i + step + opts.length) % opts.length].focus(); } // Enter/Space: the buttons' own click
  });
  window.addEventListener('hashchange', () => { if (dlg.open) { clearTimeout(closing); dlg.classList.remove('is-closing'); dlg.close(); lock(false); } });

  /* ---------- navigation ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action="settings"],[data-set-go],[data-set-back],[data-set-open]');
    if (!t) return;
    if (t.dataset.action === 'settings') go('#/account/settings');
    else if (t.dataset.setGo) go(t.dataset.setGo);
    else if (t.dataset.setBack) back(t.dataset.setBack);
    else if (t.dataset.setOpen === 'language') open(t);
  });

  window.MetricaSettings = { openLanguage: open, closeLanguage: close };
})();
