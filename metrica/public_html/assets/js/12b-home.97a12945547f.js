/* assets/js/home.js
   METRICA — «خانه»: the signed-in user's dashboard. Mounted by the router (app.js: route home, header:false).
   - who: window.Metrica (the server session read by panels.js). A guest sees a sign-in card and the sign-in panel
     opens; the private data is requested only for a signed-in user, and the server checks the session again.
   - what: GET /home (metrica_private/app/Home.php): figures, reminders, notifications. Nothing here is sample data:
     until projects are stored the server answers 0 and an empty list, and that is what the page shows.
   - reminders: added, edited, completed and deleted through the API; the calendar colour is the one the server
     gave each reminder when it was created (blue, green, orange, red, then blue again).
   Dates are shown in the Persian calendar for Asia/Tehran and sent to the server as YYYY-MM-DD. */
window.MetricaHome = (() => {
  'use strict';

  const TZ = 'Asia/Tehran', DAY = 864e5, SHOWN = 3;
  const CAL = ['assets/img/323283aa8982.webp', 'assets/img/41ecd61b0871.webp', 'assets/img/02a984e39bd8.webp', 'assets/img/f27e156c0701.webp'];
  const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  const ERR = {
    network: 'اتصال به سرور برقرار نشد؛ اینترنت خود را بررسی و دوباره تلاش کنید.',
    server: 'خطایی در سرور رخ داد؛ کمی بعد دوباره تلاش کنید.',
    title: 'عنوان یادآوری را وارد کنید.',
    project: 'نام پروژه حداکثر ۸۰ نویسه است و نویسه‌های نامعتبر ندارد.',
    date: 'تاریخ انتخاب‌شده معتبر نیست.',
    time: 'ساعت واردشده معتبر نیست.',
    limit: 'تعداد یادآوری‌ها به سقف مجاز رسیده است؛ چند مورد قدیمی را حذف کنید.',
    gone: 'این یادآوری دیگر وجود ندارد.',
  };

  let root = null;       // the mounted page; null while another route is shown
  let data = null;       // the last GET /home answer for the signed-in user
  let failed = '';       // why that answer could not be read
  let loading = false, showAll = false, asked = false; // asked: the sign-in panel has been opened on this visit
  let ticket = 0;        // answers that arrive after a sign-out or a newer request are dropped

  /* ---------- numbers and Persian-calendar dates in the interface language ---------- */
  const lang = () => (window.MetricaI18n && window.MetricaI18n.lang) || 'fa';
  const DIG = { fa: '۰۱۲۳۴۵۶۷۸۹', ar: '٠١٢٣٤٥٦٧٨٩' };
  const digits = (s) => { const d = DIG[lang()]; return d ? String(s).replace(/\d/g, (c) => d[c]) : String(s); };
  function num(n, frac = 0) {
    const s = new Intl.NumberFormat('en-US', { maximumFractionDigits: frac }).format(n);
    return lang() === 'en' ? s : digits(s.replace(/,/g, '٬').replace(/\./g, '٫'));
  }
  // toman with the reference's units: 34.8 «میلیارد تومان», 7.8 «میلیون تومان», 950,000 «تومان»
  function money(v) {
    const n = Number(v) || 0, a = Math.abs(n);
    if (a >= 1e9) return [num(n / 1e9, 1), 'میلیارد تومان'];
    if (a >= 1e6) return [num(n / 1e6, 1), 'میلیون تومان'];
    return [num(n), 'تومان'];
  }

  const jParts = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
  function toJ(t) { const p = {}; for (const x of jParts.formatToParts(t)) p[x.type] = +x.value; return [p.year, p.month, p.day]; }
  // UTC midnight of a Persian-calendar date, or null when that day does not exist (e.g. 30 Esfand of a common year)
  function fromJ(y, m, d) {
    const guess = Date.UTC(y + 621, 2, 21) + ((m <= 6 ? (m - 1) * 31 : 186 + (m - 7) * 30) + d - 1) * DAY;
    for (const k of [0, -1, 1, -2, 2, -3, 3]) {
      const t = guess + k * DAY, j = toJ(t);
      if (j[0] === y && j[1] === m && j[2] === d) return t;
    }
    return null;
  }
  const monthLen = (y, m) => (m <= 6 ? 31 : m <= 11 ? 30 : fromJ(y, 12, 30) ? 30 : 29);
  const isoOf = (t) => new Date(t).toISOString().slice(0, 10);
  const utc = (iso) => Date.parse(`${iso}T00:00:00Z`);
  const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const LOC = { fa: 'fa-IR', en: 'en-US', ar: 'ar' };
  // «شنبه ۲۰ بهمن ۱۴۰۳» / «Saturday, Bahman 20, 1403»
  function dateLabel(iso, weekday) {
    const l = lang(), o = { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric', numberingSystem: 'latn' };
    if (weekday) o.weekday = 'long';
    const p = {};
    for (const x of new Intl.DateTimeFormat(`${LOC[l]}-u-ca-persian`, o).formatToParts(utc(iso))) p[x.type] = x.value;
    const s = l === 'en' ? `${p.month} ${p.day}, ${p.year}` : `${p.day} ${p.month} ${p.year}`;
    return digits(weekday ? (l === 'en' ? `${p.weekday}, ${s}` : `${p.weekday} ${s}`) : s);
  }

  /* ---------- small DOM helpers (user text only ever goes into textContent) ---------- */
  const $ = (s) => root.querySelector(s);
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function icon(id, cls) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    u.setAttribute('href', `#${id}`);
    s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    s.append(u);
    return s;
  }
  const keep = (e) => { e.translate = false; return e; }; // a value or a name: never run through the translator

  /* ---------- the API (panels.js owns the session cookie, CSRF header and errors) ---------- */
  function api(path, body) {
    const s = window.MetricaServices;
    return s ? s.request(path, body) : Promise.reject(Object.assign(new Error('NETWORK'), { code: 'NETWORK' }));
  }
  const errText = (e) => (e && (e.code === 'NETWORK' || e.code === 'TIMEOUT') ? ERR.network : ERR.server);
  function expired() { // the server no longer knows this session: back to a guest, and the sign-in opens again
    data = null;
    asked = false;
    closeDlg();
    if (window.MetricaPanels) window.MetricaPanels.expired();
  }

  async function load() {
    const my = ++ticket;
    loading = true;
    failed = '';
    try {
      const r = await api('/home');
      if (my === ticket) data = r;
    } catch (e) {
      if (my !== ticket) return;
      if (e.code === 'UNAUTHORIZED') return expired();
      failed = errText(e);
    } finally {
      if (my === ticket) loading = false;
    }
    render();
  }

  /* ---------- page ---------- */
  function render() {
    if (!root) return;
    const M = window.Metrica, known = !!(M && M.sessionKnown), user = known && M.signedIn;
    const phase = !known ? 'wait' : !user ? 'guest' : failed ? 'error' : 'user';
    root.dataset.phase = phase;
    root.toggleAttribute('data-loading', phase === 'user' && !data);
    root.querySelectorAll('[data-hm-part]').forEach((p) => { p.hidden = p.dataset.hmPart !== phase; });
    hero(user ? M.user : null);
    if (phase === 'error') $('[data-hm-error]').textContent = failed;
    if (phase === 'guest' && !asked && window.MetricaPanels) {
      asked = true;
      // after the current event: panels.js closes any open panel on hashchange, which is how we got here
      setTimeout(() => { if (root && root.dataset.phase === 'guest') window.MetricaPanels.openSignIn($('[data-hm-signin]')); });
    }
    if (phase !== 'user') return closePop();
    if (!data && !loading) load();
    fill();
  }

  function hero(u) {
    const name = u ? String(u.firstName || u.name || '').trim() : '';
    const n = $('[data-hm-name]'), today = $('[data-hm-today]');
    n.textContent = name;
    n.title = name;
    $('[data-hm-namebox]').hidden = !name;
    today.dateTime = todayIso();
    today.textContent = dateLabel(today.dateTime, true);
  }

  function fill() {
    const d = data && data.dashboard;
    const put = (k, v) => { $(`[data-hm-num="${k}"]`).textContent = v; };
    put('activeProjects', d ? num(d.activeProjects) : '–');
    const p = d ? Math.max(0, Math.min(100, Math.round(Number(d.progress) || 0))) : 0;
    $('[data-hm-ring]').style.setProperty('--p', p);
    put('progress', d ? num(p) + (lang() === 'en' ? '%' : '٪') : '–');
    for (const k of ['totalCost', 'income', 'cost', 'profit']) {
      const [v, unit] = d ? money(d[k]) : ['–', 'تومان'];
      $(`[data-hm-money="${k}"]`).textContent = v;
      root.querySelectorAll(`[data-hm-unit="${k}"]`).forEach((u) => { if (u.dataset.src !== unit) { u.textContent = unit; u.dataset.src = unit; } });
    }
    projects(d ? d.recentProjects || [] : []);
    notes(data && data.notifications);
    reminders(data ? data.reminders || [] : []);
  }

  // the latest projects, once the server stores them: {id, name, progress}
  function projects(list) {
    const items = list.slice(0, 2).map((p) => {
      const li = el('li', 'hm-card hm-proj'), pct = Math.max(0, Math.min(100, Math.round(Number(p.progress) || 0)));
      const bar = el('span', 'hm-proj__bar');
      bar.style.setProperty('--p', pct);
      const lbl = el('span', 'hm-proj__pct');
      lbl.append(el('span', '', 'پیشرفت:'), ' ', keep(el('span', '', num(pct) + (lang() === 'en' ? '%' : '٪'))));
      li.append(keep(el('b', 'hm-proj__name', String(p.name || ''))), lbl, bar);
      return li;
    });
    $('[data-hm-projects]').replaceChildren(...items);
    $('[data-hm-projects-empty]').hidden = items.length > 0;
  }

  /* ---------- notifications ---------- */
  function notes(n) {
    const items = (n && n.items) || [], unread = (n && n.unread) || 0;
    $('[data-hm-dot]').hidden = !unread;
    $('[data-hm-notes]').replaceChildren(...items.map((x) => {
      const li = el('li', `hm-note${x.read ? '' : ' hm-note--new'}`);
      li.append(keep(el('b', '', x.title)));
      if (x.body) li.append(keep(el('p', '', x.body)));
      const t = Date.parse(x.createdAt);
      if (t) li.append(keep(el('time', '', dateLabel(new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(t)))));
      return li;
    }));
    $('[data-hm-notes-empty]').hidden = items.length > 0;
  }
  function openPop() {
    const pop = $('#hm-pop'), bell = $('[data-hm-bell]');
    pop.hidden = false;
    root.classList.add('hm--pop'); // the hero above the cards while its panel is open
    bell.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escPop);
    const n = data && data.notifications;
    if (n && n.unread) { // shown = read; the dot goes once the server agrees
      api('/notifications/read', {}).then((r) => { if (data) { data.notifications = r; notes(r); } })
        .catch((e) => { if (e.code === 'UNAUTHORIZED') expired(); });
    }
  }
  function closePop(focus) {
    if (!root) return;
    const pop = $('#hm-pop'), bell = $('[data-hm-bell]');
    if (pop.hidden) return;
    pop.hidden = true;
    root.classList.remove('hm--pop');
    bell.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', escPop);
    if (focus) bell.focus();
  }
  const outside = (e) => { if (root && !e.target.closest('.hm-bellbox')) closePop(); };
  const escPop = (e) => { if (e.key === 'Escape') closePop(true); };

  /* ---------- reminders ---------- */
  function reminders(list) {
    const today = todayIso(), all = $('[data-hm-all]');
    $('[data-hm-rems]').replaceChildren(...(showAll ? list : list.slice(0, SHOWN)).map((r) => row(r, today)));
    $('[data-hm-rems-empty]').hidden = list.length > 0;
    all.hidden = list.length <= SHOWN;
    all.setAttribute('aria-expanded', String(showAll));
    all.querySelector('span').textContent = showAll ? 'نمایش کمتر' : 'مشاهده همه';
  }
  function row(r, today) {
    const li = el('li'), b = el('button', 'm-btn hm-card hm-rem');
    b.type = 'button';
    b.dataset.hmEdit = r.id;
    if (r.done) b.dataset.done = ''; else if (r.date < today) b.dataset.late = '';
    const cal = el('span', 'hm-rem__cal'), img = el('img');
    Object.assign(img, { src: CAL[r.color % CAL.length], alt: '', width: 200, height: 200, decoding: 'async' });
    cal.append(img);
    if (r.done) cal.append(icon('hmICheck', 'hm-rem__ok'));
    const main = el('span', 'hm-rem__main');
    const t = keep(el('b', 'hm-rem__title', r.title));
    t.dir = 'auto';
    main.append(t);
    if (r.project) {
      const pr = el('span', 'hm-rem__proj'), v = keep(el('bdi', '', r.project));
      pr.append(el('span', '', 'پروژه:'), ' ', v);
      main.append(pr);
    }
    const when = el('span', 'hm-rem__when');
    when.append(keep(el('span', 'hm-rem__date', dateLabel(r.date))));
    if (r.done) when.append(el('span', 'hm-rem__state', 'انجام شد'));
    else if (r.time) {
      const tm = el('span', 'hm-rem__time');
      tm.append(el('span', '', 'ساعت'), ' ', keep(el('span', '', digits(r.time))));
      when.append(tm);
    }
    b.append(cal, main, when, icon('hmIChevR', 'hm-rem__chev'));
    li.append(b);
    return li;
  }

  /* ---------- add / edit panel ---------- */
  const D = document.getElementById('hm-rem-dlg'), F = D.querySelector('[data-hm-form]');
  const [Dd, Mo, Yr] = ['d', 'm', 'y'].map((n) => F.elements.namedItem(n));
  const msg = D.querySelector('.hm-msg'), saveBtn = D.querySelector('.hm-save'), doneBtn = D.querySelector('[data-hm-done]'), delBtn = D.querySelector('[data-hm-delete]');
  let editing = null, busy = false, opener = null, delTimer = 0;

  function options(sel, list, value) {
    sel.replaceChildren(...list.map(([v, label]) => { const o = el('option', '', label); o.value = v; return o; }));
    sel.value = String(value);
  }
  function days() {
    const y = +Yr.value, m = +Mo.value, n = monthLen(y, m), d = Math.min(+Dd.value || 1, n);
    options(Dd, Array.from({ length: n }, (_, i) => [i + 1, digits(i + 1)]), d);
  }
  function pickDate(iso) {
    const [y, m, d] = toJ(utc(iso)), ty = toJ(utc(todayIso()))[0];
    const from = Math.min(y, ty - 1), to = Math.max(y, ty + 5);
    options(Yr, Array.from({ length: to - from + 1 }, (_, i) => [from + i, digits(from + i)]), y);
    options(Mo, MONTHS.map((n, i) => [i + 1, n]), m);
    Dd.value = '';
    options(Dd, [[d, digits(d)]], d);
    days();
  }
  [Yr, Mo].forEach((s) => s.addEventListener('change', days));

  const say = (text, tone) => { msg.textContent = text || ''; msg.dataset.tone = tone || 'error'; };
  function mark(field, on) { field.toggleAttribute('data-invalid', on); if (on) field.setAttribute('aria-invalid', 'true'); else field.removeAttribute('aria-invalid'); }
  F.addEventListener('input', (e) => { mark(e.target, false); if (msg.dataset.tone === 'error') say(''); });

  function label(btn, text) { btn.querySelector('span').textContent = text; }
  function setDone(done) {
    label(doneBtn, done ? 'بازگردانی' : 'انجام شد');
    doneBtn.querySelector('use').setAttribute('href', done ? '#hmIUndo' : '#hmICheck');
  }
  function disarm() { clearTimeout(delTimer); delBtn.removeAttribute('data-confirm'); label(delBtn, 'حذف'); }

  function openDlg(r, from) {
    editing = r || null;
    opener = from || document.activeElement;
    F.reset();
    say('');
    F.querySelectorAll('[data-invalid]').forEach((f) => mark(f, false));
    disarm();
    D.querySelector('[data-hm-dlg-title]').textContent = r ? 'ویرایش یادآوری' : 'افزودن یادآوری';
    label(saveBtn, r ? 'ذخیره تغییرات' : 'ثبت یادآوری');
    D.querySelector('[data-hm-edit-only]').hidden = !r;
    // a new reminder: the colour the server will give it (its count includes deleted reminders)
    D.querySelector('[data-hm-dlg-cal]').src = CAL[(r ? r.color : (data && data.nextColor) || 0) % CAL.length];
    F.elements.namedItem('title').value = r ? r.title : '';
    F.elements.namedItem('project').value = r ? r.project : '';
    F.elements.namedItem('time').value = r ? r.time : '';
    pickDate(r ? r.date : todayIso());
    if (r) setDone(r.done);
    document.documentElement.classList.add('m-lock');
    D.showModal();
    (r ? D.querySelector('[data-hm-dlg-title]') : F.elements.namedItem('title')).focus();
  }
  function closeDlg() {
    if (!D.open) return;
    D.close();
  }
  D.addEventListener('close', () => {
    document.documentElement.classList.remove('m-lock');
    disarm();
    editing = null;
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  });
  D.addEventListener('click', (e) => { if (e.target === D || e.target.closest('[data-hm-close]')) closeDlg(); }); // backdrop or ×
  window.addEventListener('hashchange', closeDlg);

  // one request at a time, with the button saying what is happening
  async function work(btn, busyText, task) {
    if (busy) return;
    busy = true;
    const idle = btn.querySelector('span').textContent;
    btn.setAttribute('aria-busy', 'true');
    label(btn, busyText);
    try {
      const r = await task();
      if (data) Object.assign(data, { reminders: r.reminders, nextColor: r.nextColor });
      closeDlg();
      render();
    } catch (e) {
      if (e.code === 'UNAUTHORIZED') return expired();
      if (e.code === 'NOT_FOUND') { say(ERR.gone); load(); return; }
      say(e.code === 'LIMIT' ? ERR.limit : e.code === 'INVALID_REMINDER' && ERR[e.field] ? ERR[e.field] : errText(e));
    } finally {
      busy = false;
      btn.removeAttribute('aria-busy');
      if (btn.querySelector('span').textContent === busyText) label(btn, idle);
    }
  }

  const clean = (s) => String(s).replace(/[​-‏‪-‮⁦-⁩﻿]/g, (c) => (c === '‌' ? c : '')).replace(/\s+/g, ' ').trim();
  F.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = clean(F.elements.namedItem('title').value), project = clean(F.elements.namedItem('project').value);
    const t = fromJ(+Yr.value, +Mo.value, +Dd.value), timeIn = F.elements.namedItem('time'), time = timeIn.value.slice(0, 5);
    const fail = (field, text) => { mark(field, true); say(text); field.focus(); };
    if (!title) return fail(F.elements.namedItem('title'), ERR.title);
    if (t === null) return fail(Dd, ERR.date);
    if (timeIn.validity.badInput || (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return fail(timeIn, ERR.time);
    const id = editing && editing.id;
    work(saveBtn, 'در حال ثبت…', () => api('/reminders/save', { ...(id ? { id } : {}), title, project, date: isoOf(t), time }));
  });
  doneBtn.addEventListener('click', () => {
    if (editing) work(doneBtn, 'در حال ثبت…', () => api('/reminders/done', { id: editing.id, done: !editing.done }));
  });
  delBtn.addEventListener('click', () => { // two taps: «حذف», then «تأیید حذف» within 4 s
    if (!editing) return;
    if (!delBtn.hasAttribute('data-confirm')) {
      delBtn.setAttribute('data-confirm', '');
      label(delBtn, 'تأیید حذف');
      delTimer = setTimeout(disarm, 4000);
      return;
    }
    clearTimeout(delTimer);
    work(delBtn, 'در حال حذف…', () => api('/reminders/delete', { id: editing.id }));
  });

  /* ---------- clicks on the page ---------- */
  function onClick(e) {
    const t = e.target.closest('[data-hm-bell],[data-hm-signin],[data-hm-retry],[data-hm-add],[data-hm-edit],[data-hm-all]');
    if (!t) return;
    const signedIn = window.Metrica && window.Metrica.signedIn;
    if (t.matches('[data-hm-signin]') || (!signedIn && t.matches('[data-hm-bell]'))) return window.MetricaPanels && window.MetricaPanels.openSignIn(t);
    if (t.matches('[data-hm-bell]')) return $('#hm-pop').hidden ? openPop() : closePop();
    if (t.matches('[data-hm-retry]')) { failed = ''; render(); return; }
    if (!data) return;
    if (t.matches('[data-hm-all]')) { showAll = !showAll; return reminders(data.reminders || []); }
    if (t.matches('[data-hm-add]')) return openDlg(null, t);
    const r = (data.reminders || []).find((x) => String(x.id) === t.dataset.hmEdit);
    if (r) openDlg(r, t);
  }

  // who is signed in changed (or became known): a different person never sees the previous one's data
  document.addEventListener('metrica:user', (e) => {
    if (!e.detail.signedIn) { ticket++; data = null; failed = ''; loading = false; showAll = false; closeDlg(); }
    render();
  });
  document.addEventListener('metrica:lang', render);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') render(); }); // the date after midnight

  return {
    mount() {
      const frag = document.getElementById('tpl-home').content.cloneNode(true);
      root = frag.querySelector('.hm');
      root.addEventListener('click', onClick);
      asked = false;
      return frag;
    },
    update: render,
    unmount() { closePop(); closeDlg(); root = null; },
    get root() { return root; },
  };
})();
