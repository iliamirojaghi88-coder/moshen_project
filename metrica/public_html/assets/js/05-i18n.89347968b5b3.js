
/* assets/js/i18n.js
   METRICA — interface language (fa · en · ar).
   Persian is the source text of the whole app: templates, the analysis form, results schema and messages stay as written.
   Every visible text node and the attributes in ATTRS are looked up in the dictionaries (assets/i18n/en.js, ar.js),
   keyed by their Persian text. Text the app writes later (route changes, form errors, results, picker options)
   is caught by one MutationObserver, so the existing modules need no translation code.
   Persian → original text is restored; values typed by the user (input values) are never touched.
   Exposes window.MetricaI18n = {lang, set(lang), t(persian), dir}. */
window.MetricaI18n = (() => {
  'use strict';
  const LANGS = { fa: 'rtl', en: 'ltr', ar: 'rtl' };
  const KEY = 'metrica.lang';
  const DICT = window.MetricaI18nDict || {};
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'TEMPLATE']);
  const PERSIAN = /[؀-ۿ]/;
  const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  const DIGITS = { en: '0123456789', ar: '٠١٢٣٤٥٦٧٨٩' };

  let lang = 'fa';
  try { const s = localStorage.getItem(KEY); if (LANGS[s]) lang = s; } catch (e) { /* private mode: Persian */ }

  /* ---------- lookup ---------- */
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const fill = (tpl, ...a) => tpl.replace(/\{(\d)\}/g, (_, i) => a[i]);
  // Persian digits and separators in the target language's form (data values are never passed through here)
  const num = (s) => s.replace(/[۰-۹]/g, (c) => DIGITS[lang][FA_DIGITS.indexOf(c)])
    .replace(/٫/g, lang === 'en' ? '.' : '٫').replace(/٬/g, lang === 'en' ? ',' : '٬').replace(/٪/g, lang === 'en' ? '%' : '٪');
  // a label read back from the page may already be translated: find its Persian source
  // (Persian and Arabic share one Unicode block, so the dictionaries decide what is source text)
  function source(s) {
    for (const l of ['en', 'ar']) {
      if (has(DICT[l], s)) return s;
      for (const k in DICT[l]) if (DICT[l][k] === s) return k;
    }
    return s;
  }
  // dynamic strings (built by the app with values inside); templates live in the dictionaries under "$…"
  const PATTERNS = [
    [/^[۰-۹٫٬٪\s]+$/, (m) => num(m[0])],
    [/^مرحله (\S+) از (\S+)$/, (m) => fill(DICT[lang].$stepOf, num(m[1]), num(m[2]))],
    [/^حداکثر (.+) مجاز است$/, (m) => fill(DICT[lang].$max, num(m[1]))],
    [/^حداقل (.+) مجاز است$/, (m) => fill(DICT[lang].$min, num(m[1]))],
    [/^نباید از (.+) بیشتر باشد$/, (m) => fill(DICT[lang].$notAbove, look(source(m[1])) ?? m[1])],
    [/^متریکا — (.+)$/, (m) => fill(DICT[lang].$pageTitle, look(m[1]) ?? m[1])],
    [/^تصویر (.+)$/, (m) => fill(DICT[lang].$photoOf, look(m[1]) ?? m[1])],
  ];
  function look(k) {
    const d = DICT[lang];
    if (has(d, k)) return d[k];
    for (const [re, fn] of PATTERNS) { const m = re.exec(k); if (m) return fn(m); }
    if (k.includes('، ')) { // multi-choice values joined by the form
      const parts = k.split('، ').map(look);
      if (parts.every((p) => p != null)) return parts.join(d.$listSep);
    }
    return null;
  }
  // Persian text → current language; unknown text is returned unchanged
  function t(s) {
    if (lang === 'fa' || !PERSIAN.test(s)) return s;
    const v = look(s.replace(/\s+/g, ' ').trim());
    return v == null ? s : s.match(/^\s*/)[0] + v + s.match(/\s*$/)[0];
  }

  /* ---------- DOM ---------- */
  // each record is [Persian source, text last written by this module]; any other text was written by the app
  const textSrc = new WeakMap(); // Text node → record
  const attrSrc = new WeakMap(); // Element → {attribute: record}
  const skipped = (el) => !el || SKIP.has(el.nodeName) || !!(el.closest && el.closest('[translate="no"]'));
  // returns the record to translate from, or null when the current text is not Persian source text
  function track(rec, cur) {
    if (rec && (cur === rec[0] || cur === rec[1])) return rec;
    return PERSIAN.test(cur) ? [cur, cur] : null; // first seen, or the app wrote new text
  }

  function doText(node) {
    if (skipped(node.parentNode)) return;
    const cur = node.data, rec = track(textSrc.get(node), cur);
    if (!rec) return void textSrc.delete(node);
    textSrc.set(node, rec);
    rec[1] = t(rec[0]);
    if (cur !== rec[1]) node.data = rec[1];
  }
  function doAttr(el, a) {
    const cur = el.getAttribute(a);
    if (cur == null || skipped(el)) return;
    let map = attrSrc.get(el);
    const rec = track(map && map[a], cur);
    if (!rec) { if (map) delete map[a]; return; }
    if (!map) attrSrc.set(el, (map = {}));
    map[a] = rec;
    rec[1] = t(rec[0]);
    if (cur !== rec[1]) el.setAttribute(a, rec[1]);
  }
  const doAttrs = (el) => { for (const a of ATTRS) if (el.hasAttribute(a)) doAttr(el, a); };
  function walk(root) {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1 || SKIP.has(root.nodeName)) return;
    doAttrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === 1 && SKIP.has(n.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeType === 3 ? doText(n) : doAttrs(n);
  }
  function translateAll() {
    walk(document.documentElement);
    // the analysis view is kept alive while another page is shown
    const a = window.MetricaAnalysis && window.MetricaAnalysis.root;
    if (a && !a.isConnected) walk(a);
  }

  // in Persian the page already shows its source text: nothing to do until another language is chosen
  new MutationObserver((records) => {
    if (lang === 'fa') return;
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach(walk);
      else if (r.type === 'characterData') doText(r.target);
      else doAttr(r.target, r.attributeName);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });

  function applyDir() {
    const h = document.documentElement;
    h.lang = lang;
    h.dir = LANGS[lang];
  }
  function set(next) {
    if (!LANGS[next] || next === lang) return;
    lang = next;
    try { localStorage.setItem(KEY, next); } catch (e) { /* not persisted in private mode */ }
    applyDir();
    translateAll();
    document.dispatchEvent(new CustomEvent('metrica:lang', { detail: { lang } }));
  }

  applyDir();
  if (lang !== 'fa') translateAll();

  return { get lang() { return lang; }, get dir() { return LANGS[lang]; }, set, t };
})();
