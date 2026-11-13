/* METRICA — reference HTTP API for the sign-in panel (contract: ../API-fa.md). Development and tests only:
   users and sessions live in memory, there is no SMS provider and no payment gateway until the backend team adds them.
     node metrica/panels/server/api.mjs            # http://localhost:8787/api — answers SERVICE_UNAVAILABLE for SMS
   createApi() returns a request handler (resolves true when it answered) so it can sit behind any Node server. */
import crypto from 'node:crypto';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { OtpPolicy } from './otp-policy.mjs';

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
};
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map((c) => {
  const i = c.indexOf('=');
  return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
}));
async function readJson(req) {
  let size = 0, data = '';
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw new Error('too large');
    data += chunk;
  }
  return data ? JSON.parse(data) : {};
}
const NAME = /^[\p{L}\p{M}\s\u200c'-]{1,40}$/u; // letters (any script), spaces, ZWNJ

export function createApi({ policy = new OtpPolicy(), prefix = '/api', allowOrigin = null, trustProxy = false, secureCookies = true } = {}) {
  const users = new Map();    // phone → {id, phone, firstName, lastName, plan}
  const sessions = new Map(); // session id → {phone, complete}
  const cookie = (name, value, maxAge) =>
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;
  const pub = (u) => u && ({ id: u.id, firstName: u.firstName, lastName: u.lastName, name: [u.firstName, u.lastName].filter(Boolean).join(' '), plan: u.plan });

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith(`${prefix}/`)) return false;
    const path = url.pathname.slice(prefix.length);
    const cors = allowOrigin && req.headers.origin === allowOrigin ? {
      'Access-Control-Allow-Origin': allowOrigin, 'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, X-Metrica-Client', 'Access-Control-Allow-Methods': 'GET, POST', Vary: 'Origin',
    } : {};
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return true; }

    const jar = cookies(req), set = [];
    let device = jar.mdev;
    if (!/^[a-f0-9]{32}$/.test(device || '')) { device = crypto.randomBytes(16).toString('hex'); set.push(cookie('mdev', device, 31536000)); }
    const ip = (trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
    const ctx = { ip, device };
    const session = sessions.get(jar.msid);
    const send = (status, body) => { json(res, status, body, { ...cors, ...(set.length ? { 'Set-Cookie': set } : {}) }); return true; };

    if (req.method === 'POST') {
      // CSRF: the custom header forces a CORS preflight; a form or a foreign page cannot send it
      if (req.headers['x-metrica-client'] !== 'web' || !/^application\/json/.test(req.headers['content-type'] || '')) return send(403, { error: 'FORBIDDEN' });
      let body;
      try { body = await readJson(req); } catch (e) { return send(400, { error: 'BAD_REQUEST' }); }
      switch (path) {
        case '/auth/otp/request': {
          const r = await policy.request(body.phone, ctx);
          return send(r.status, r.body);
        }
        case '/auth/otp/verify': {
          const r = await policy.verify(body.requestId, body.code, ctx);
          if (r.status !== 200) return send(r.status, r.body);
          const phone = r.body.phone;
          if (!users.has(phone)) users.set(phone, { id: crypto.randomUUID(), phone, firstName: '', lastName: '', plan: 'normal' });
          const u = users.get(phone), sid = crypto.randomBytes(32).toString('hex');
          sessions.delete(jar.msid);
          sessions.set(sid, { phone, complete: !!u.firstName });
          set.push(cookie('msid', sid, 2592000));
          return send(200, u.firstName ? { user: pub(u) } : { profileRequired: true, user: pub(u) });
        }
        case '/auth/profile': {
          if (!session) return send(401, { error: 'UNAUTHORIZED' });
          const f = String(body.firstName || '').trim(), l = String(body.lastName || '').trim();
          if (!NAME.test(f) || !NAME.test(l)) return send(400, { error: 'BAD_REQUEST' });
          Object.assign(users.get(session.phone), { firstName: f, lastName: l });
          session.complete = true;
          return send(200, { user: pub(users.get(session.phone)) });
        }
        case '/auth/logout':
          sessions.delete(jar.msid);
          set.push(cookie('msid', '', 0));
          return send(200, {});
        case '/subscription/checkout':
          if (!session || !session.complete) return send(401, { error: 'UNAUTHORIZED' });
          return send(503, { error: 'SERVICE_UNAVAILABLE' }); // no payment gateway yet
        default:
          return send(404, { error: 'NOT_FOUND' });
      }
    }
    if (req.method === 'GET' && path === '/auth/session') {
      const user = session && session.complete ? pub(users.get(session.phone)) : null;
      return send(200, { user, pendingOtp: user ? null : policy.pending(device) });
    }
    if (req.method === 'GET' && path === '/subscription') {
      if (!session || !session.complete) return send(401, { error: 'UNAUTHORIZED' });
      return send(200, { plan: users.get(session.phone).plan, status: 'none' });
    }
    return send(404, { error: 'NOT_FOUND' });
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const port = Number(process.env.PORT) || 8787;
  const api = createApi({ secureCookies: false, allowOrigin: process.env.ALLOW_ORIGIN || null });
  http.createServer(async (req, res) => { if (!(await api(req, res))) json(res, 404, { error: 'NOT_FOUND' }); })
    .listen(port, () => console.log(`METRICA reference API on http://localhost:${port}/api (no SMS provider: OTP requests answer SERVICE_UNAVAILABLE)`));
}
