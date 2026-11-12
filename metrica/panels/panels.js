/* assets/js/panels.js
   METRICA — sign-in and subscription mini-panels, and the service layer they talk to.

   Nothing here signs anyone in or sells anything by itself:
   - every check that matters (sending the SMS, the code, its 120 s life, attempts, rate limits, the session,
     the subscription, seats and the 24-hour project quota) belongs to the server behind AuthService / SubscriptionService;
   - until window.METRICA_CONFIG.apiBase points at that server over HTTPS, both services answer SERVICE_UNAVAILABLE,
     so «دریافت کد تأیید» shows the SMS notice and the code step is never reached (it opens only from a server reply).
   No codes, tokens or personal data are stored in the browser: the session is the server's HttpOnly cookie.
   Exposes window.MetricaServices = {AuthService, SubscriptionService} and window.MetricaPanels. */
(() => {
  'use strict';

  /* ================= services ================= */
  const TIMEOUT_MS = 15000;
  class ServiceError extends Error {
    constructor(code, info) { super(code); this.code = code; Object.assign(this, info); }
  }
  const config = () => window.METRICA_CONFIG || {};
  // the API root, or null while no backend is connected; plain http is refused
  function apiBase() {
    const b = config().apiBase;
    if (!b) return null;
    try { const u = new URL(b, location.href); return u.protocol === 'https:' ? u.href.replace(/\/+$/, '') : null; } catch (e) { return null; }
  }
  const httpsUrl = (s) => { try { const u = new URL(s); return u.protocol === 'https:' ? u.href : null; } catch (e) { return null; } };

  async function api(path, body) {
    const base = apiBase();
    if (!base) throw new ServiceError('SERVICE_UNAVAILABLE');
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(base + path, {
        method: body ? 'POST' : 'GET', credentials: 'include', cache: 'no-store', signal: ctl.signal,
        // a custom header forces a CORS preflight: one of the server's CSRF defences
        headers: body ? { 'Content-Type': 'application/json', 'X-Metrica-Client': 'web' } : { 'X-Metrica-Client': 'web' },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new ServiceError(e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK');
    } finally { clearTimeout(timer); }
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    const retry = Number(data.retryAfter ?? res.headers.get('Retry-After'));
    throw new ServiceError(data.error || (res.status === 401 ? 'UNAUTHORIZED' : res.status === 429 ? 'RATE_LIMITED' : res.status === 503 ? 'SERVICE_UNAVAILABLE' : 'SERVER'),
      { status: res.status, retryAfter: retry > 0 ? retry : undefined, attemptsLeft: data.attemptsLeft });
  }

  // contract: API-fa.md
  const AuthService = {
    get connected() { return !!apiBase(); },
    session: () => api('/auth/session'),
    requestOtp: (phone) => api('/auth/otp/request', { phone }),
    verifyOtp: (requestId, code) => api('/auth/otp/verify', { requestId, code }),
    saveProfile: (firstName, lastName) => api('/auth/profile', { firstName, lastName }),
    logout: () => api('/auth/logout', {}),
  };
  const SubscriptionService = {
    get connected() { return !!apiBase(); },
    current: () => api('/subscription'),
    checkout: (plan) => api('/subscription/checkout', { plan }),
  };

  /* ================= helpers ================= */
  const FA = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩';
  const latin = (s) => String(s).replace(/[۰-۹]/g, (c) => FA.indexOf(c)).replace(/[٠-٩]/g, (c) => AR.indexOf(c));
  const fa = (s) => String(s).replace(/\d/g, (d) => FA[d]); // page text: the i18n engine localises Persian digits
  const local = (s) => { // input values are never touched by the i18n engine, so they are localised here
    const l = window.MetricaI18n && window.MetricaI18n.lang;
    return l === 'en' ? latin(s) : String(s).replace(/\d/g, (d) => (l === 'ar' ? AR : FA)[d]);
  };
  // Iranian mobile number from anything typed or autofilled: Persian/Arabic digits, spaces, +98 / 0098
  function phoneDigits(raw) {
    const s = latin(raw).trim();
    let d = s.replace(/\D/g, '');
    if (/^(\+|00)/.test(s) || d.length > 11) d = d.replace(/^(00)?98/, '0');
    return d.slice(0, 11);
  }
  const fullPhone = (d) => (/^9\d{9}$/.test(d) ? `0${d}` : d);
  const isMobile = (d) => /^09\d{9}$/.test(d);
  const groupPhone = (d) => d.replace(/^(\d{4})(\d{1,3})?(\d{1,4})?$/, (_, a, b, c) => [a, b, c].filter(Boolean).join(' '));
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = () => window.matchMedia && matchMedia('(pointer: fine)').matches;

  const ERR = {
    sms: 'ارسال کد تأیید پس از فعال‌سازی سرویس پیامک در دسترس خواهد بود.',
    pay: 'پرداخت آنلاین پس از اتصال درگاه پرداخت در دسترس خواهد بود.',
    phone: 'شماره موبایل معتبر نیست؛ شماره ۱۱ رقمی است و با ۰۹ شروع می‌شود.',
    expired: 'کد تأیید منقضی شده است؛ کد جدید دریافت کنید.',
    attempts: 'تعداد تلاش‌های ناموفق به حد مجاز رسید؛ کد جدید دریافت کنید.',
    rate: 'تعداد درخواست‌ها بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید.',
    network: 'اتصال به سرور برقرار نشد؛ اینترنت خود را بررسی و دوباره تلاش کنید.',
    server: 'خطایی در سرور رخ داد؛ کمی بعد دوباره تلاش کنید.',
  };
  function errorText(err, unavailable) {
    switch (err && err.code) {
      case 'SERVICE_UNAVAILABLE': return unavailable;
      case 'NETWORK': case 'TIMEOUT': return ERR.network;
      case 'RATE_LIMITED': return ERR.rate;
      case 'INVALID_PHONE': return ERR.phone;
      case 'CODE_EXPIRED': return ERR.expired;
      case 'TOO_MANY_ATTEMPTS': return ERR.attempts;
      default: return ERR.server;
    }
  }
  // message line: Persian text (translated by the i18n engine) and an optional number in its own text node
  function say(el, text, tone, n) {
    el.dataset.tone = tone || 'info';
    el.replaceChildren(...(text ? [text] : []), ...(n != null ? [` ${fa(n)}`] : []));
  }
  function invalid(el, on) {
    el.toggleAttribute('data-invalid', on);
    (el.matches('input') ? [el] : el.querySelectorAll('input')).forEach((i) => (on ? i.setAttribute('aria-invalid', 'true') : i.removeAttribute('aria-invalid')));
  }
  // one request at a time per button: busy label + spinner, repeated clicks ignored (aria-disabled keeps focus in place)
  async function run(state, btn, busyLabel, idleLabel, task) {
    if (state.busy) return;
    state.busy = true;
    const label = btn.querySelector('span');
    btn.setAttribute('aria-busy', 'true');
    btn.setAttribute('aria-disabled', 'true');
    label.textContent = busyLabel;
    try { await task(); } finally {
      state.busy = false;
      btn.removeAttribute('aria-busy');
      btn.removeAttribute('aria-disabled');
      label.textContent = idleLabel;
    }
  }

  /* ================= panel frame: open/close, Escape, outside click, Back button, scroll lock, focus, keyboard ================= */
  const panels = {};
  let openId = null, opener = null, closeTimer = 0;
  const vv = window.visualViewport;

  function lock(on) { // same classes as the language panel
    const h = document.documentElement;
    if (on) h.classList.toggle('m-lock--gutter', h.scrollHeight > h.clientHeight);
    h.classList.toggle('m-lock', on);
    if (!on) h.classList.remove('m-lock--gutter');
  }
  // keep the panel inside the visible area while the on-screen keyboard is up
  function fitViewport() {
    const dlg = openId && panels[openId].dlg;
    if (!dlg || !vv) return;
    const kb = vv.scale <= 1.01 && window.innerHeight - vv.height > 120;
    dlg.toggleAttribute('data-kb', kb);
    dlg.style.setProperty('--mp-kbh', kb ? `${vv.height}px` : '');
    dlg.style.setProperty('--mp-vt', kb ? `${vv.offsetTop}px` : '');
    const f = document.activeElement;
    if (kb && f && dlg.contains(f) && f.matches('input')) f.scrollIntoView({ block: 'nearest' });
  }
  function watchViewport(on) {
    if (!vv) return;
    ['resize', 'scroll'].forEach((t) => (on ? vv.addEventListener(t, fitViewport) : vv.removeEventListener(t, fitViewport)));
  }

  function show(id, from) {
    if (openId === id) return;
    const p = panels[id];
    if (openId) finish(openId, false); // panel → panel (subscription → sign-in): instant swap, same history entry
    else opener = from || document.activeElement;
    clearTimeout(closeTimer);
    p.dlg.classList.remove('is-closing');
    lock(true);
    p.dlg.showModal();
    p.dlg.scrollTop = 0;
    openId = id;
    if (history.state && history.state.mPanel) history.replaceState({ mPanel: id }, '');
    else history.pushState({ mPanel: id }, ''); // the phone's Back button closes the panel
    watchViewport(true);
    p.onOpen();
  }
  // user-initiated close (X, Escape, outside click): through history, so Back and X stay in step
  function hide() {
    if (!openId) return;
    if (history.state && history.state.mPanel) history.back();
    else animateClose();
  }
  function animateClose() {
    const id = openId;
    if (!id) return;
    const dlg = panels[id].dlg;
    if (dlg.classList.contains('is-closing')) return;
    if (reduced()) return finish(id, true);
    dlg.classList.add('is-closing');
    closeTimer = setTimeout(() => finish(id, true), 200);
  }
  function finish(id, done) {
    const p = panels[id];
    clearTimeout(closeTimer);
    p.dlg.classList.remove('is-closing');
    openId = null;
    if (p.dlg.open) p.dlg.close();
    p.dlg.removeAttribute('data-kb');
    p.onClose();
    if (!done) return;
    watchViewport(false);
    lock(false);
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  }
  function frame(id, dlg, hooks) {
    panels[id] = { dlg, ...hooks };
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); hide(); }); // Escape
    // the browser may still close it on its own (e.g. a repeated Escape): tidy up the same way
    dlg.addEventListener('close', () => {
      if (openId !== id) return;
      finish(id, true);
      if (history.state && history.state.mPanel) history.back();
    });
    // outside click = on the backdrop: outside the box for both press and release (scrollbar drags and text selections stay inside)
    const outside = (e) => { const r = dlg.getBoundingClientRect(); return e.target === dlg && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom); };
    let downOutside = false;
    dlg.addEventListener('pointerdown', (e) => { downOutside = outside(e); });
    dlg.addEventListener('click', (e) => {
      if (downOutside && outside(e)) return hide();
      if (e.target.closest('[data-mp-close]')) hide();
    });
  }
  window.addEventListener('popstate', () => {
    const inPanel = history.state && history.state.mPanel;
    if (openId && !inPanel) animateClose();
    else if (!openId && inPanel) history.back(); // Forward into an old panel entry: step over it
  });
  window.addEventListener('hashchange', () => { if (openId) finish(openId, true); });
  if (history.state && history.state.mPanel) history.replaceState(null, ''); // a reload while a panel was open

  /* ================= sign-in panel ================= */
  const A = document.getElementById('mp-auth');
  const q = (s) => A.querySelector(s);
  const steps = [...A.querySelectorAll('.mp-step')];
  const phoneForm = q('[data-mp-form="phone"]'), phoneIn = q('#mp-phone'), consent = q('#mp-consent'), phoneMsg = q('#mp-phone-msg');
  const codeForm = q('[data-mp-form="code"]'), otpSet = q('.mp-otp'), boxes = [...A.querySelectorAll('.mp-otp__box')], codeMsg = q('#mp-code-msg');
  const resendBtn = q('[data-mp-resend]'), mmEl = q('[data-mp-mm]'), ssEl = q('[data-mp-ss]'), numEl = q('[data-mp-num]');
  const profileForm = q('[data-mp-form="profile"]'), firstIn = q('#mp-first'), lastIn = q('#mp-last'), profileMsg = q('#mp-profile-msg');
  const chip = q('[data-mp-plan-chip]'), chipName = q('[data-mp-plan-name]');
  const PLAN_NAMES = { plus: 'پلاس', pro: 'پرو', max: 'MAX' };

  // otp: the server's pending code request {phone, requestId, deadline, resendAt, expired, locked}; memory only
  const auth = { busy: false, otp: null, user: null, newUser: null, pendingPlan: null };
  let ticker = 0, webOtp = null;

  function setStep(step, focus) {
    A.dataset.step = step;
    steps.forEach((s) => { s.hidden = s.dataset.step !== step; });
    A.scrollTop = 0;
    if (step === 'code') { tick(); clearInterval(ticker); ticker = setInterval(tick, 250); listenWebOtp(); } else stopCode();
    if (!focus) return;
    if (step === 'phone') (finePointer() ? phoneIn : q('#mp-auth-title')).focus({ preventScroll: true });
    else if (step === 'code') (boxes.find((b) => !b.value) || boxes[0]).focus({ preventScroll: true });
    else firstIn.focus({ preventScroll: true });
  }
  function stopCode() { clearInterval(ticker); ticker = 0; if (webOtp) { webOtp.abort(); webOtp = null; } }

  /* step 1 */
  phoneIn.addEventListener('input', () => {
    const v = phoneIn.value, caret = phoneIn.selectionStart ?? v.length;
    const before = latin(v.slice(0, caret)).replace(/\D/g, '').length;
    const out = local(groupPhone(phoneDigits(v)));
    if (out !== v) {
      phoneIn.value = out;
      let i = 0;
      for (let seen = 0; i < out.length && seen < before; i++) if (/\S/.test(out[i])) seen++;
      phoneIn.setSelectionRange(i, i);
    }
    invalid(phoneIn.parentElement, false);
    if (phoneMsg.dataset.tone === 'error') say(phoneMsg, '');
  });
  consent.addEventListener('change', () => { invalid(consent, false); if (consent.checked && phoneMsg.dataset.tone === 'error') say(phoneMsg, ''); });
  phoneForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (auth.busy) return;
    const phone = fullPhone(phoneDigits(phoneIn.value));
    invalid(phoneIn.parentElement, false);
    invalid(consent, false);
    const bad = !phone ? 'شماره موبایل را وارد کنید.' : !isMobile(phone) ? ERR.phone : !consent.checked ? 'برای ادامه، قوانین و حریم خصوصی را بپذیرید.' : '';
    if (bad) {
      const field = phone && isMobile(phone) ? consent : phoneIn;
      invalid(field === consent ? consent : phoneIn.parentElement, true);
      say(phoneMsg, bad, 'error');
      return field.focus();
    }
    requestCode(phone, phoneForm.querySelector('.mp-cta'), phoneMsg, 'دریافت کد تأیید');
  });
  A.addEventListener('click', (e) => {
    const doc = e.target.closest('[data-mp-doc]');
    if (!doc) return;
    const url = httpsUrl(config()[`${doc.dataset.mpDoc}Url`] || '');
    if (url) { doc.href = url; doc.target = '_blank'; doc.rel = 'noopener'; return; }
    e.preventDefault();
    say(phoneMsg, 'متن قوانین و حریم خصوصی پس از انتشار در این بخش در دسترس خواهد بود.', 'info');
  });

  function requestCode(phone, btn, msgEl, idleLabel) {
    return run(auth, btn, 'در حال ارسال…', idleLabel, async () => {
      try {
        const r = await AuthService.requestOtp(phone);
        const life = Number(r.expiresIn), wait = Number(r.resendIn ?? r.expiresIn);
        if (!r.requestId || !(life > 0 && life <= 600) || !(wait >= 0)) throw new ServiceError('SERVER');
        const now = Date.now(); // the countdown follows the server's own expiry, measured from its reply
        auth.otp = { phone, requestId: String(r.requestId), deadline: now + life * 1000, resendAt: now + wait * 1000, expired: false, locked: false };
        numEl.textContent = fa(groupPhone(phone));
        clearBoxes(false);
        say(codeMsg, msgEl === codeMsg ? 'کد جدید ارسال شد.' : '', 'ok');
        say(phoneMsg, '');
        setStep('code', true);
      } catch (err) {
        say(msgEl, errorText(err, ERR.sms), err.code === 'SERVICE_UNAVAILABLE' ? 'info' : 'error');
      }
    });
  }

  /* step 2 */
  const code = () => boxes.map((b) => latin(b.value)).join('');
  function clearBoxes(focus) {
    boxes.forEach((b) => { b.value = ''; b.dataset.v = ''; b.disabled = false; });
    invalid(otpSet, false);
    if (focus) boxes[0].focus();
  }
  function lockBoxes() { boxes.forEach((b) => { b.disabled = true; }); }
  function fillFrom(digits, start) {
    let i = start;
    for (const d of digits) { if (i >= boxes.length) break; boxes[i].value = local(d); boxes[i].dataset.v = d; i++; }
    (boxes[Math.min(i, boxes.length - 1)]).focus();
    entered();
  }
  function entered() {
    invalid(otpSet, false);
    if (codeMsg.dataset.tone === 'error') say(codeMsg, '');
    if (/^\d{4}$/.test(code())) submitCode();
  }
  boxes.forEach((b, i) => {
    b.placeholder = ' '; // the reference dash is drawn while a box is empty (:placeholder-shown)
    b.addEventListener('focus', () => b.select());
    b.addEventListener('input', () => {
      const d = latin(b.value).replace(/\D/g, ''), prev = b.dataset.v || '';
      if (d.length > 1 && !(d.length === 2 && prev.length === 1)) return fillFrom(d, d.length >= boxes.length ? 0 : i); // autofill / paste
      const one = d.length === 2 ? (d[0] === prev ? d[1] : d[0]) : d; // typed over an existing digit
      b.value = local(one);
      b.dataset.v = one;
      if (one && i < boxes.length - 1) boxes[i + 1].focus();
      entered();
    });
    b.addEventListener('paste', (e) => {
      const d = latin((e.clipboardData && e.clipboardData.getData('text')) || '').replace(/\D/g, '');
      if (!d) return;
      e.preventDefault();
      fillFrom(d, d.length >= boxes.length ? 0 : i);
    });
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !b.value && i > 0) { e.preventDefault(); boxes[i - 1].value = ''; boxes[i - 1].dataset.v = ''; boxes[i - 1].focus(); }
      else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); boxes[i - 1].focus(); }
      else if (e.key === 'ArrowRight' && i < boxes.length - 1) { e.preventDefault(); boxes[i + 1].focus(); }
    });
  });
  // Android Chrome reads the SMS itself (WebOTP); iOS offers it through autocomplete="one-time-code"
  function listenWebOtp() {
    if (!('OTPCredential' in window) || webOtp) return;
    webOtp = new AbortController();
    navigator.credentials.get({ otp: { transport: ['sms'] }, signal: webOtp.signal })
      .then((c) => { if (c && c.code && A.dataset.step === 'code') fillFrom(latin(c.code).replace(/\D/g, ''), 0); })
      .catch(() => {})
      .finally(() => { webOtp = null; });
  }

  function tick() {
    const o = auth.otp;
    if (!o) return;
    const now = Date.now(), left = Math.max(0, Math.ceil((o.deadline - now) / 1000));
    const mm = fa(String(Math.floor(left / 60)).padStart(2, '0')), ss = fa(String(left % 60).padStart(2, '0'));
    if (mmEl.dataset.v !== mm) { mmEl.textContent = mm; mmEl.dataset.v = mm; }
    if (ssEl.dataset.v !== ss) { ssEl.textContent = ss; ssEl.dataset.v = ss; }
    resendBtn.disabled = now < o.resendAt;
    if (!left && !o.expired) {
      o.expired = true;
      lockBoxes();
      say(codeMsg, ERR.expired, 'error');
    }
    codeForm.querySelector('.mp-cta').toggleAttribute('disabled', o.expired || o.locked);
  }
  resendBtn.addEventListener('click', () => {
    if (auth.otp && Date.now() >= auth.otp.resendAt) requestCode(auth.otp.phone, resendBtn, codeMsg, 'ارسال مجدد کد');
  });
  // «ویرایش» and the back arrow: return to the number; a new request replaces the old code on the server
  A.addEventListener('click', (e) => {
    if (!e.target.closest('[data-mp-edit]') || A.dataset.step !== 'code') return;
    auth.otp = null;
    say(codeMsg, '');
    setStep('phone', false);
    phoneIn.focus();
  });

  codeForm.addEventListener('submit', (e) => { e.preventDefault(); submitCode(); });
  function submitCode() {
    const o = auth.otp;
    if (!o || auth.busy || o.expired || o.locked) return;
    const c = code();
    if (!/^\d{4}$/.test(c)) {
      invalid(otpSet, true);
      say(codeMsg, 'کد ۴ رقمی را کامل وارد کنید.', 'error');
      return (boxes.find((b) => !b.value) || boxes[0]).focus();
    }
    return run(auth, codeForm.querySelector('.mp-cta'), 'در حال بررسی…', 'تأیید و ادامه', async () => {
      try {
        const r = await AuthService.verifyOtp(o.requestId, c);
        auth.otp = null;
        stopCode();
        if (r.profileRequired) { auth.newUser = r.user || {}; setStep('profile', true); } else signedIn(r.user);
      } catch (err) {
        if (err.code === 'INVALID_CODE' && err.attemptsLeft > 0) {
          say(codeMsg, 'کد واردشده درست نیست. تلاش باقی‌مانده:', 'error', err.attemptsLeft);
          invalid(otpSet, true);
          boxes.forEach((b) => { b.value = ''; b.dataset.v = ''; });
          boxes[0].focus();
        } else if (err.code === 'INVALID_CODE' || err.code === 'TOO_MANY_ATTEMPTS' || err.code === 'CODE_EXPIRED') {
          if (err.code === 'CODE_EXPIRED') o.expired = true; else o.locked = true;
          if (err.retryAfter) o.resendAt = Date.now() + err.retryAfter * 1000;
          lockBoxes();
          say(codeMsg, err.code === 'CODE_EXPIRED' ? ERR.expired : ERR.attempts, 'error');
          tick();
        } else say(codeMsg, errorText(err, ERR.sms), 'error');
      }
    });
  }

  /* step 3 (new account) */
  profileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = firstIn.value.trim(), l = lastIn.value.trim();
    invalid(firstIn.parentElement, !f);
    invalid(lastIn.parentElement, !l);
    if (!f || !l) { say(profileMsg, 'نام و نام خانوادگی را کامل وارد کنید.', 'error'); return (f ? lastIn : firstIn).focus(); }
    run(auth, profileForm.querySelector('.mp-cta'), 'در حال ثبت…', 'ثبت و ورود', async () => {
      try { const r = await AuthService.saveProfile(f, l); signedIn(r.user || { ...auth.newUser, firstName: f, lastName: l }); } catch (err) { say(profileMsg, errorText(err, ERR.server), 'error'); }
    });
  });

  // the server has confirmed who this is (code verified, profile saved, or an existing session)
  function applyUser(u) {
    auth.user = u || {};
    const name = u && (u.name || [u.firstName, u.lastName].filter(Boolean).join(' '));
    if (window.Metrica) window.Metrica.setUser({ ...(name ? { name } : {}), ...(u && u.avatar ? { avatar: u.avatar } : {}), ...(u && u.plan ? { plan: u.plan } : {}) });
  }
  function signedIn(u) {
    applyUser(u);
    auth.newUser = null;
    profileForm.reset();
    setStep('phone', false);
    const plan = auth.pendingPlan;
    auth.pendingPlan = null;
    if (!plan) return hide();
    show('sub'); // continue the purchase the user started
    buy(plan, S.querySelector(`[data-mp-plan="${plan}"]`));
  }

  frame('auth', A, {
    onOpen() {
      chip.hidden = !auth.pendingPlan;
      if (auth.pendingPlan) chipName.textContent = PLAN_NAMES[auth.pendingPlan];
      if (phoneMsg.dataset.tone !== 'error') say(phoneMsg, '');
      // a pending code keeps its own expiry: reopening never restarts it
      setStep(auth.newUser ? 'profile' : auth.otp ? 'code' : 'phone', true);
    },
    onClose() { stopCode(); },
  });

  /* ================= subscription panel ================= */
  const S = document.getElementById('mp-sub');
  const subMsg = S.querySelector('[data-mp-sub-msg]'), subState = { busy: false };
  let selected = null;

  function choose(plan) {
    selected = plan;
    S.querySelectorAll('.mp-plan').forEach((a) => a.toggleAttribute('data-selected', a.dataset.plan === plan));
    S.querySelectorAll('[data-mp-plan]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mpPlan === plan)));
  }
  function buy(plan, btn) {
    if (!PLAN_NAMES[plan]) return;
    choose(plan);
    say(subMsg, '');
    if (!auth.user) { auth.pendingPlan = plan; return show('auth'); } // sign in first; the chosen plan waits
    return run(subState, btn, 'انتخاب اشتراک', 'انتخاب اشتراک', async () => {
      try {
        const r = await SubscriptionService.checkout(plan); // the server prices the plan and opens the gateway
        const url = httpsUrl(r.paymentUrl || '');
        if (!url) throw new ServiceError('SERVER');
        say(subMsg, 'در حال انتقال به درگاه پرداخت…', 'info');
        location.assign(url);
      } catch (err) {
        say(subMsg, errorText(err, ERR.pay), err.code === 'SERVICE_UNAVAILABLE' ? 'info' : 'error');
      }
    });
  }
  S.addEventListener('click', (e) => { const b = e.target.closest('[data-mp-plan]'); if (b) buy(b.dataset.mpPlan, b); });

  frame('sub', S, {
    onOpen() { S.querySelector('#mp-sub-title').focus({ preventScroll: true }); },
    onClose() {},
  });

  /* ================= entry points ================= */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action="login"],[data-action="buy-subscription"],[data-mtr-action="choose-plan"],[data-action="account-info"]');
    if (!t) return;
    const a = t.dataset.action || t.dataset.mtrAction;
    if (a === 'login') return auth.user ? window.Metrica && window.Metrica.navigate('account') : show('auth', t);
    if (a === 'account-info') return auth.user ? undefined : show('auth', t); // signed out: «اطلاعات حساب» asks to sign in
    show('sub', t);
  });

  // an existing server session (HttpOnly cookie) signs the user in silently
  if (AuthService.connected) AuthService.session().then((r) => { if (r && r.user) applyUser(r.user); }).catch(() => {});

  window.MetricaServices = { AuthService, SubscriptionService, ServiceError };
  window.MetricaPanels = {
    openSignIn: (from) => show('auth', from),
    openSubscription: (from) => show('sub', from),
    close: hide,
    get selectedPlan() { return selected; },
    get signedIn() { return !!auth.user; },
  };
})();
