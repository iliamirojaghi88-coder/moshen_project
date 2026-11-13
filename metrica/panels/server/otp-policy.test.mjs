/* node --test metrica/panels/server/  — the OTP rules, with a fake clock and a captured SMS outbox. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { OtpPolicy } from './otp-policy.mjs';

function setup(limits) {
  let t = Date.UTC(2026, 10, 12, 12, 0, 0);
  const outbox = [];
  const p = new OtpPolicy({ now: () => t, limits, sms: async (phone, text) => { outbox.push({ phone, code: text.match(/\d{4}/)[0] }); } });
  return { p, outbox, tick: (s) => { t += s * 1000; }, code: () => outbox[outbox.length - 1].code };
}
const A = { ip: '1.1.1.1', device: 'devA' }, B = { ip: '2.2.2.2', device: 'devB' };
const wrong = (c, k = 1) => String((Number(c) + k) % 10000).padStart(4, '0');

test('no SMS provider: nothing is issued', async () => {
  const r = await new OtpPolicy().request('09121234567', A);
  assert.deepEqual(r, { status: 503, body: { error: 'SERVICE_UNAVAILABLE' } });
});

test('only Iranian mobile numbers', async () => {
  const { p } = setup();
  for (const n of ['0912123456', '9121234567', '08121234567', '+989121234567', '']) assert.equal((await p.request(n, A)).status, 400);
});

test('a code lives exactly 120 s and is used once', async () => {
  const { p, tick, code } = setup();
  const r = await p.request('09120000001', A);
  assert.equal(r.status, 200);
  assert.equal(r.body.expiresIn, 120);
  assert.equal(r.body.resendIn, 120);
  tick(119);
  assert.equal((await p.verify(r.body.requestId, code(), A)).status, 200);
  assert.equal((await p.verify(r.body.requestId, code(), A)).body.error, 'CODE_EXPIRED');
  const r2 = await p.request('09120000001', A);
  tick(120);
  assert.equal((await p.verify(r2.body.requestId, code(), A)).body.error, 'CODE_EXPIRED');
});

test('no new code while the current one is valid; the same device resumes it, others wait', async () => {
  const { p, outbox, tick } = setup();
  const r = await p.request('09120000002', A);
  tick(30);
  const again = await p.request('09120000002', A);
  assert.equal(again.body.requestId, r.body.requestId);
  assert.equal(again.body.expiresIn, 90);
  assert.equal(again.body.resumed, true);
  const other = await p.request('09120000002', B);
  assert.equal(other.status, 429);
  assert.equal(other.body.retryAfter, 90);
  assert.equal(outbox.length, 1);
});

test('a new code replaces the old one', async () => {
  const { p, tick, outbox } = setup();
  const r1 = await p.request('09120000003', A);
  const c1 = outbox[0].code;
  tick(121);
  const r2 = await p.request('09120000003', A);
  assert.notEqual(r2.body.requestId, r1.body.requestId);
  assert.equal((await p.verify(r1.body.requestId, c1, A)).body.error, 'CODE_EXPIRED');
});

test('verify is bound to the device that asked', async () => {
  const { p, code } = setup();
  const r = await p.request('09120000004', A);
  assert.equal((await p.verify(r.body.requestId, code(), B)).body.error, 'CODE_EXPIRED');
  assert.equal((await p.verify(r.body.requestId, code(), A)).status, 200);
});

test('5 wrong tries per code, then the code is locked', async () => {
  const { p, code } = setup();
  const r = await p.request('09120000005', A);
  const left = [];
  for (let i = 1; i <= 4; i++) left.push((await p.verify(r.body.requestId, wrong(code(), i), A)).body.attemptsLeft);
  assert.deepEqual(left, [4, 3, 2, 1]);
  const fifth = await p.verify(r.body.requestId, wrong(code(), 5), A);
  assert.equal(fifth.body.error, 'CODE_LOCKED');
  assert.equal((await p.verify(r.body.requestId, code(), A)).body.error, 'CODE_LOCKED'); // even the right code
});

test('7 wrong codes per phone in a rolling 10 minutes, across codes, devices and new requests', async () => {
  const { p, tick, code } = setup();
  const r1 = await p.request('09120000006', A);
  for (let i = 1; i <= 5; i++) await p.verify(r1.body.requestId, wrong(code(), i), A); // 5 fails at t=0, code locked
  tick(121);
  const r2 = await p.request('09120000006', A);
  assert.equal(r2.status, 200);
  assert.equal(r2.body.attemptsLeft, 2);
  assert.equal((await p.verify(r2.body.requestId, wrong(code()), A)).body.attemptsLeft, 1);
  const seventh = await p.verify(r2.body.requestId, wrong(code(), 2), A);
  assert.equal(seventh.body.error, 'TOO_MANY_ATTEMPTS');
  assert.equal(seventh.body.retryAfter, 600 - 121); // the oldest fail leaves the window then
  // the 8th try is refused before the code is even compared, also with the right code
  assert.equal((await p.verify(r2.body.requestId, code(), A)).body.error, 'TOO_MANY_ATTEMPTS');
  // a new code, another device, a reload: still blocked
  tick(121);
  assert.equal((await p.request('09120000006', A)).body.error, 'TOO_MANY_ATTEMPTS');
  assert.equal((await p.request('09120000006', B)).body.error, 'TOO_MANY_ATTEMPTS');
  assert.ok(p.pending('devA').verifyBlockedFor > 0);
  tick(600 - 242 + 1); // the first five fails have left the window
  const r3 = await p.request('09120000006', A);
  assert.equal(r3.status, 200);
  assert.equal((await p.verify(r3.body.requestId, code(), A)).status, 200);
});

test('5 code requests per phone in a rolling 10 minutes; the 6th is refused with the next allowed time', async () => {
  const { p, tick, code } = setup();
  const phone = '09120000007';
  for (let i = 0; i < 5; i++) {
    const r = await p.request(phone, A);
    assert.equal(r.status, 200, `request ${i + 1}`);
    assert.equal((await p.verify(r.body.requestId, code(), A)).status, 200); // used at once, so the next may follow
    tick(60);
  }
  const sixth = await p.request(phone, A);
  assert.equal(sixth.status, 429);
  assert.equal(sixth.body.error, 'RATE_LIMITED');
  assert.equal(sixth.body.retryAfter, 600 - 300);
  assert.equal((await p.request(phone, B)).body.error, 'RATE_LIMITED'); // per phone, not per device
  tick(300);
  assert.equal((await p.request(phone, A)).status, 200);
});

test('the 5th request says when the next one is allowed', async () => {
  const { p, tick, code } = setup();
  let r;
  for (let i = 0; i < 5; i++) { r = await p.request('09120000008', A); await p.verify(r.body.requestId, code(), A); tick(10); }
  tick(-10);
  assert.equal(r.body.resendIn, 600 - 40); // not before the window frees, even though the code lives only 120 s
});

test('IP and device limits', async () => {
  const { p } = setup({ ipRequests: 2, deviceRequests: 3 });
  assert.equal((await p.request('09120000011', { ip: 'X', device: 'd1' })).status, 200);
  assert.equal((await p.request('09120000012', { ip: 'X', device: 'd2' })).status, 200);
  assert.equal((await p.request('09120000013', { ip: 'X', device: 'd3' })).body.error, 'RATE_LIMITED');
  const q = setup({ deviceRequests: 1 }).p;
  assert.equal((await q.request('09120000014', { ip: 'Y1', device: 'same' })).status, 200);
  assert.equal((await q.request('09120000015', { ip: 'Y2', device: 'same' })).body.error, 'RATE_LIMITED');
});

test('parallel verifies cannot exceed the per-code or per-phone limits', async () => {
  const { p, tick, code, outbox } = setup();
  const phone = '09120000009';
  const r1 = await p.request(phone, A);
  const c1 = code();
  const burst1 = await Promise.all(Array.from({ length: 20 }, (_, i) => p.verify(r1.body.requestId, wrong(c1, i + 1), A)));
  assert.equal(burst1.filter((x) => x.body.error === 'INVALID_CODE').length, 4);
  assert.equal(burst1.filter((x) => x.body.error === 'CODE_LOCKED').length, 16); // the 5th wrong one and every later one
  tick(121);
  const r2 = await p.request(phone, A);
  const c2 = outbox[1].code;
  const burst2 = await Promise.all(Array.from({ length: 10 }, (_, i) => p.verify(r2.body.requestId, wrong(c2, i + 1), A)));
  // fail 6 → INVALID_CODE, fail 7 → TOO_MANY_ATTEMPTS, the other 8 are refused before any comparison
  assert.deepEqual(burst2.map((x) => x.body.error), ['INVALID_CODE', ...Array(9).fill('TOO_MANY_ATTEMPTS')]);
  assert.equal(p.store.hits.get(`fail:p:${phone}`).length, 7);
});

test('parallel requests send one SMS', async () => {
  const { p, outbox } = setup();
  const all = await Promise.all(Array.from({ length: 10 }, () => p.request('09120000010', A)));
  assert.equal(outbox.length, 1);
  assert.equal(new Set(all.map((r) => r.body.requestId)).size, 1);
});

test('the SMS carries the WebOTP line when a domain is set', async () => {
  const sent = [];
  const p = new OtpPolicy({ domain: 'app.metrica.ir', sms: async (_, text) => sent.push(text) });
  await p.request('09120000020', A);
  assert.match(sent[0], /\n@app\.metrica\.ir #\d{4}$/);
});
