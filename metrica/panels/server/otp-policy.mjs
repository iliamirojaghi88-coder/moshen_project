/* METRICA — reference OTP policy (server side). Not part of the web app: the backend team ports or wraps it.
   Every rule of the sign-in code lives here, never in the browser:
     - a 4-digit code (CSPRNG), stored only as an HMAC, valid 120 s; a new code replaces the old one
     - a new code for the same phone only after the current one has expired (or was used)
     - per phone: at most 5 code requests and 7 wrong codes in any rolling 10 minutes; 5 wrong tries per code
     - extra request / wrong-code limits per IP and per device
   Each check-and-count runs under per-key locks, so parallel requests cannot slip past a limit.
   MemoryStore is atomic for one Node process; with several API instances give the same interface a shared
   store (Redis: one Lua script per check-and-add on a sorted set; SQL: the counters' rows SELECT … FOR UPDATE). */
import crypto from 'node:crypto';

export const LIMITS = {
  codeTtl: 120,        // s — life of one code (the panel's 02:00)
  perCodeFails: 5,     // wrong tries for one code
  window: 600,         // s — the rolling window of the limits below
  phoneRequests: 5,    // codes sent to one phone
  phoneFails: 7,       // wrong codes for one phone, across all its codes
  // generous per IP: Iranian mobile networks put many users behind one IP (carrier NAT)
  ipRequests: 50, deviceRequests: 10,
  ipFails: 100, deviceFails: 15,
  pendingVisible: 600, // s — how long a device can still resume its code after a reload
};

export class MemoryStore {
  constructor() {
    this.hits = new Map();     // counter key → ascending timestamps (ms)
    this.requests = new Map(); // requestId → code request
    this.byPhone = new Map();  // phone → requestId of its latest code
    this.byDevice = new Map(); // device → requestId of its latest code
    this.queues = new Map();   // lock key → tail of its queue
  }
  recent(key, now, windowMs) {
    const a = (this.hits.get(key) || []).filter((t) => t > now - windowMs);
    if (a.length) this.hits.set(key, a); else this.hits.delete(key);
    return a;
  }
  add(key, now) { this.hits.set(key, [...(this.hits.get(key) || []), now]); }
  // run fn while holding every key; keys are taken in sorted order so two callers never deadlock
  async lock(keys, fn) {
    const releases = [];
    for (const k of [...new Set(keys)].sort()) {
      const prev = this.queues.get(k) || Promise.resolve();
      let release;
      const mine = new Promise((r) => { release = r; });
      const tail = prev.then(() => mine);
      this.queues.set(k, tail);
      await prev;
      releases.push(() => { release(); if (this.queues.get(k) === tail) this.queues.delete(k); });
    }
    try { return await fn(); } finally { releases.reverse().forEach((r) => r()); }
  }
}

const reply = (status, body) => ({ status, body });

export class OtpPolicy {
  /** sms(phone, text): sends the SMS (throws on failure); null = no provider → SERVICE_UNAVAILABLE.
      domain: the web app's host, for the SMS line Android reads automatically (WebOTP). */
  constructor({ now = Date.now, store = new MemoryStore(), sms = null, secret = crypto.randomBytes(32), domain = null, limits = {} } = {}) {
    Object.assign(this, { now, store, sms, secret, domain, limits: { ...LIMITS, ...limits } });
  }

  // seconds until a counter with these hits may count again (0 = free now)
  wait(hits, max, now) {
    if (hits.length < max) return 0;
    return Math.max(1, Math.ceil((hits[hits.length - max] + this.limits.window * 1000 - now) / 1000));
  }
  hash(id, code) { return crypto.createHmac('sha256', this.secret).update(`${id}:${code}`).digest(); }
  failKeys(phone, ip, device) {
    const L = this.limits;
    return [[`fail:p:${phone}`, L.phoneFails], [`fail:ip:${ip}`, L.ipFails], [`fail:d:${device}`, L.deviceFails]];
  }
  failWait(phone, ip, device, now) {
    const W = this.limits.window * 1000;
    return Math.max(0, ...this.failKeys(phone, ip, device).map(([k, max]) => this.wait(this.store.recent(k, now, W), max, now)));
  }
  // what the panel needs to show the code step (also used to resume after a reload)
  view(r, now) {
    const L = this.limits, W = L.window * 1000, s = this.store;
    const expiresIn = Math.max(0, Math.ceil((r.expiresAt - now) / 1000));
    const nextRequest = this.wait(s.recent(`req:p:${r.phone}`, now, W), L.phoneRequests, now);
    const phoneFails = s.recent(`fail:p:${r.phone}`, now, W).length;
    return {
      requestId: r.id, phone: r.phone, expiresIn,
      resendIn: Math.max(expiresIn, nextRequest),
      attemptsLeft: Math.max(0, Math.min(L.perCodeFails - r.fails, L.phoneFails - phoneFails)),
      locked: r.fails >= L.perCodeFails,
    };
  }

  async request(phone, { ip = '?', device = '?' } = {}) {
    if (!/^09\d{9}$/.test(String(phone || ''))) return reply(400, { error: 'INVALID_PHONE' });
    if (!this.sms) return reply(503, { error: 'SERVICE_UNAVAILABLE' });
    const L = this.limits, W = L.window * 1000, s = this.store;
    return s.lock([`p:${phone}`, `ip:${ip}`, `d:${device}`], async () => {
      const now = this.now();
      const blocked = this.wait(s.recent(`fail:p:${phone}`, now, W), L.phoneFails, now);
      if (blocked) return reply(429, { error: 'TOO_MANY_ATTEMPTS', retryAfter: blocked }); // a new code does not lift it
      const cur = s.requests.get(s.byPhone.get(phone));
      if (cur && !cur.used && now < cur.expiresAt) {
        if (cur.device === device) return reply(200, { ...this.view(cur, now), resumed: true }); // same code, same clock
        return reply(429, { error: 'RATE_LIMITED', retryAfter: Math.ceil((cur.expiresAt - now) / 1000) });
      }
      const counters = [[`req:p:${phone}`, L.phoneRequests], [`req:ip:${ip}`, L.ipRequests], [`req:d:${device}`, L.deviceRequests]];
      for (const [k, max] of counters) {
        const w = this.wait(s.recent(k, now, W), max, now);
        if (w) return reply(429, { error: 'RATE_LIMITED', retryAfter: w });
      }
      counters.forEach(([k]) => s.add(k, now)); // counted even if the SMS gateway then fails
      if (cur) s.requests.delete(cur.id);      // the old code stops working
      const id = crypto.randomBytes(16).toString('hex');
      const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
      const r = { id, phone, device, hash: this.hash(id, code), expiresAt: now + L.codeTtl * 1000, created: now, fails: 0, used: false };
      s.requests.set(id, r);
      s.byPhone.set(phone, id);
      s.byDevice.set(device, id);
      try {
        await this.sms(phone, `کد ورود متریکا: ${code}\nاین کد را به کسی ندهید.${this.domain ? `\n\n@${this.domain} #${code}` : ''}`);
      } catch (e) {
        s.requests.delete(id);
        return reply(502, { error: 'SMS_FAILED' });
      }
      return reply(200, this.view(r, now));
    });
  }

  async verify(requestId, code, { ip = '?', device = '?' } = {}) {
    const s = this.store, L = this.limits, W = L.window * 1000;
    const first = s.requests.get(String(requestId || ''));
    if (!first || first.device !== device) return reply(410, { error: 'CODE_EXPIRED' });
    if (!/^\d{4}$/.test(String(code || ''))) return reply(400, { error: 'BAD_REQUEST' });
    return s.lock([`p:${first.phone}`, `ip:${ip}`, `d:${device}`], async () => {
      const now = this.now(), r = s.requests.get(first.id);
      if (!r) return reply(410, { error: 'CODE_EXPIRED' });
      let blocked = this.failWait(r.phone, ip, device, now);
      if (blocked) return reply(429, { error: 'TOO_MANY_ATTEMPTS', retryAfter: blocked });
      if (r.used || now >= r.expiresAt) return reply(410, { error: 'CODE_EXPIRED' });
      if (r.fails >= L.perCodeFails) return reply(429, { error: 'CODE_LOCKED', ...this.view(r, now) });
      if (!crypto.timingSafeEqual(this.hash(r.id, code), r.hash)) {
        r.fails += 1;
        this.failKeys(r.phone, ip, device).forEach(([k]) => s.add(k, now));
        blocked = this.failWait(r.phone, ip, device, now);
        if (blocked) return reply(429, { error: 'TOO_MANY_ATTEMPTS', retryAfter: blocked });
        if (r.fails >= L.perCodeFails) return reply(429, { error: 'CODE_LOCKED', ...this.view(r, now) });
        return reply(400, { error: 'INVALID_CODE', attemptsLeft: this.view(r, now).attemptsLeft });
      }
      r.used = true;
      return reply(200, { phone: r.phone }); // the caller signs this phone in
    });
  }

  // the device's latest unfinished code, so a reload resumes it instead of starting again
  pending(device) {
    const s = this.store, now = this.now(), r = s.requests.get(s.byDevice.get(device));
    if (!r || r.used || now - r.created > this.limits.pendingVisible * 1000) return null;
    const v = this.view(r, now), blocked = this.wait(s.recent(`fail:p:${r.phone}`, now, this.limits.window * 1000), this.limits.phoneFails, now);
    return blocked ? { ...v, verifyBlockedFor: blocked } : v;
  }
}
