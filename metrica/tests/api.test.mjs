// TEST ONLY: end-to-end checks of the home page API against the local test server (tests/serve.sh).
// Signs in through the real OTP flow (codes come from the SMS mock's log), then exercises /home and the reminder routes.
// Run: RUN=/tmp/metrica-run node tests/api.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8080/api/index.php';
const RUN = process.env.RUN || '/tmp/metrica-run';
let passed = 0;
const ok = (name) => { passed++; console.log('  ✓', name); };

class Client {
  constructor() { this.jar = {}; }
  cookie() { return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; '); }
  async call(path, body, headers = {}) {
    const res = await fetch(BASE + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Cookie: this.cookie(), ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Metrica-Client': 'web' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';'); const i = kv.indexOf('=');
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (v === '' || /expires=Thu, 01 Jan 1970/i.test(c)) delete this.jar[k]; else this.jar[k] = v;
    }
    return { status: res.status, data: await res.json().catch(() => ({})) };
  }
  async signIn(phone, name) {
    const r = await this.call('/auth/otp/request', { phone });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const line = readFileSync(`${RUN}/mock/sms-codes.log`, 'utf8').trim().split('\n').filter((l) => l.startsWith(phone)).pop();
    const v = await this.call('/auth/otp/verify', { requestId: r.data.requestId, code: line.split(' ')[1] });
    assert.equal(v.status, 200, JSON.stringify(v.data));
    if (v.data.profileRequired) {
      const p = await this.call('/auth/profile', { firstName: name });
      assert.equal(p.status, 200);
    }
    return v.data;
  }
}

const a = new Client(), b = new Client(), guest = new Client();

console.log('auth and access');
assert.equal((await guest.call('/home')).status, 401); ok('guest: GET /home → 401');
assert.equal((await guest.call('/reminders/save', { title: 'x', date: '2026-01-01' })).status, 401); ok('guest: save → 401');
const first = await a.signIn('09120000001', 'علی‌رضا');
assert.equal(first.profileRequired, true); ok('new user: OTP verified, name step required');
let s = await a.call('/auth/session');
assert.equal(s.data.user.firstName, 'علی‌رضا'); ok('session returns the stored name');

// a new user whose name step is not done yet cannot read the home data
const half = new Client();
const hr = await half.call('/auth/otp/request', { phone: '09120000009' });
const hl = readFileSync(`${RUN}/mock/sms-codes.log`, 'utf8').trim().split('\n').filter((l) => l.startsWith('09120000009')).pop();
await half.call('/auth/otp/verify', { requestId: hr.data.requestId, code: hl.split(' ')[1] });
assert.equal((await half.call('/home')).status, 401); ok('verified but no name yet: GET /home → 401');

console.log('dashboard');
let h = await a.call('/home');
assert.equal(h.status, 200);
assert.deepEqual(h.data.dashboard, { activeProjects: 0, progress: 0, totalCost: 0, income: 0, cost: 0, profit: 0, recentProjects: [] });
assert.deepEqual(h.data.reminders, []);
assert.deepEqual(h.data.notifications, { unread: 0, items: [] }); ok('empty account: all figures 0, no reminders, no notifications');

console.log('reminders');
const colors = [];
for (let i = 1; i <= 5; i++) {
  const r = await a.call('/reminders/save', { title: `یادآوری ${i}`, project: i === 1 ? 'مجتمع سپهر' : '', date: `2026-12-0${i}`, time: i % 2 ? '10:00' : '' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  colors.push(r.data.reminders.find((x) => x.id === r.data.id).color);
}
assert.deepEqual(colors, [0, 1, 2, 3, 0]); ok('colours follow creation order: blue, green, orange, red, blue');
h = await a.call('/home');
const ids = h.data.reminders.map((x) => x.id);
assert.equal(ids.length, 5); ok('reminders persist (read back after reload)');
const r1 = h.data.reminders.find((x) => x.title === 'یادآوری 1');
assert.equal(r1.project, 'مجتمع سپهر'); assert.equal(r1.time, '10:00'); assert.equal(r1.date, '2026-12-01'); ok('fields stored as sent (date, time, project)');

let d = await a.call('/reminders/delete', { id: ids[2] });
assert.equal(d.status, 200); assert.equal(d.data.reminders.length, 4);
const before = Object.fromEntries(d.data.reminders.map((x) => [x.id, x.color]));
const n6 = await a.call('/reminders/save', { title: 'ششم', date: '2026-12-09' });
assert.equal(n6.data.reminders.find((x) => x.id === n6.data.id).color, 1, 'sixth ever created → green');
for (const x of n6.data.reminders) if (before[x.id] !== undefined) assert.equal(x.color, before[x.id]);
ok('after a delete: earlier colours unchanged, the next one continues the cycle');

const e = await a.call('/reminders/save', { id: ids[0], title: '  پرداخت   مرحله دوم  ', project: '', date: '2026-12-20', time: '' });
const edited = e.data.reminders.find((x) => x.id === ids[0]);
assert.equal(edited.title, 'پرداخت مرحله دوم'); assert.equal(edited.time, ''); assert.equal(edited.color, 0); ok('edit: text cleaned, time cleared, colour kept');

const dn = await a.call('/reminders/done', { id: ids[1], done: true });
assert.equal(dn.data.reminders.find((x) => x.id === ids[1]).done, true);
assert.equal(dn.data.reminders.at(-1).id, ids[1]); ok('done: marked and sorted after the open ones');
const un = await a.call('/reminders/done', { id: ids[1], done: false });
assert.equal(un.data.reminders.find((x) => x.id === ids[1]).done, false); ok('done can be undone');

console.log('validation');
const bad = [
  [{ title: '', date: '2026-12-01' }, 'title'], [{ title: '   ', date: '2026-12-01' }, 'title'],
  [{ title: 'x'.repeat(121), date: '2026-12-01' }, 'title'], [{ title: 'a‮b', date: '2026-12-01' }, 'title'],
  [{ title: 'ok', date: '2026-02-30' }, 'date'], [{ title: 'ok', date: '1403-11-20' }, 'date'], [{ title: 'ok' }, 'date'],
  [{ title: 'ok', date: '2026-12-01', time: '24:00' }, 'time'], [{ title: 'ok', date: '2026-12-01', time: '9:5' }, 'time'],
  [{ title: 'ok', date: '2026-12-01', project: 'p'.repeat(81) }, 'project'], [{ title: 'ok', date: '2026-12-01', id: -3 }, 'id'],
  [{ title: 'ok', date: '2026-12-01', id: 'abc' }, 'id'], [{ title: 5, date: '2026-12-01' }, 'title'],
];
for (const [body, field] of bad) {
  const r = await a.call('/reminders/save', body);
  assert.equal(r.status, 400, JSON.stringify(body)); assert.equal(r.data.field, field, JSON.stringify(body));
}
ok(`${bad.length} invalid inputs refused with the right field`);
assert.equal((await a.call('/reminders/save', { title: 'x'.repeat(120), date: '2026-12-01' })).status, 200); ok('120-character title accepted');
assert.equal((await a.call('/reminders/done', { id: ids[0], done: 'yes' })).status, 400); ok('done must be a boolean');
assert.equal((await a.call('/reminders/save', { id: 999999, title: 'x', date: '2026-12-01' })).status, 404); ok('unknown id → 404');

console.log('ownership');
await b.signIn('09120000002', 'Sara');
h = await b.call('/home');
assert.deepEqual(h.data.reminders, []); ok("user B sees none of user A's reminders");
assert.equal((await b.call('/reminders/save', { id: ids[0], title: 'hijack', date: '2026-12-01' })).status, 404);
assert.equal((await b.call('/reminders/done', { id: ids[0], done: true })).status, 404);
assert.equal((await b.call('/reminders/delete', { id: ids[0] })).status, 404);
h = await a.call('/home');
assert.equal(h.data.reminders.find((x) => x.id === ids[0]).title, 'پرداخت مرحله دوم'); ok("user B cannot edit, complete or delete A's reminder");
const bFirst = await b.call('/reminders/save', { title: 'B1', date: '2026-12-01' });
assert.equal(bFirst.data.reminders[0].color, 0); ok("each user's colour cycle starts at blue");

console.log('notifications');
const n = await a.call('/notifications/read', {});
assert.equal(n.status, 200); assert.equal(n.data.unread, 0); ok('mark-read works with no notifications');

console.log('CSRF and logout');
assert.equal((await a.call('/reminders/save', { title: 'x', date: '2026-12-01' }, { 'X-Metrica-Client': '' })).status, 403); ok('POST without the client header → 403');
assert.equal((await a.call('/reminders/save', { title: 'x', date: '2026-12-01' }, { Origin: 'https://evil.example' })).status, 403); ok('POST from a foreign origin → 403');
const old = a.cookie();
assert.equal((await a.call('/auth/logout', {})).status, 200);
assert.equal((await a.call('/home')).status, 401);
const replay = new Client(); replay.jar = Object.fromEntries(old.split('; ').map((kv) => kv.split('=')));
assert.equal((await replay.call('/home')).status, 401); ok('after logout the old session cookie no longer opens /home');
const back = await a.signIn('09120000001', 'unused');
assert.equal(back.profileRequired, undefined); assert.equal(back.user.firstName, 'علی‌رضا'); ok('returning user: name is not asked again');

console.log(`\n${passed} checks passed`);
