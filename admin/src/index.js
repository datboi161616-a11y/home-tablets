// Entry point: serves the dashboard, checks the admin password, and hands
// WebSocket connections (tablets and dashboards) to the single Hub object.
import dashboard from './dashboard.html';
export { Hub } from './hub.js';

const enc = new TextEncoder();
const DAY = 24 * 60 * 60 * 1000;

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

async function sameText(a, b) {
  // Compare hashes in constant time so the password can't be guessed by timing.
  const [ha, hb] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', enc.encode(String(s)))));
  return crypto.subtle.timingSafeEqual(ha, hb);
}

async function makeToken(env) {
  const exp = String(Date.now() + 30 * DAY);
  return `${exp}.${await hmac(env.ADMIN_PASSWORD, `admin:${exp}`)}`;
}

async function validToken(env, token) {
  const [exp, sig] = String(token || '').split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return sameText(sig, await hmac(env.ADMIN_PASSWORD, `admin:${exp}`));
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!env.ADMIN_PASSWORD) return new Response('Admin password not set (wrangler secret put ADMIN_PASSWORD)', { status: 500 });

    if (url.pathname === '/' && req.method === 'GET') {
      return new Response(dashboard, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'x-frame-options': 'DENY',
          'referrer-policy': 'no-referrer',
        },
      });
    }

    if (url.pathname === '/api/login' && req.method === 'POST') {
      const { password } = await req.json().catch(() => ({}));
      if (await sameText(password, env.ADMIN_PASSWORD)) return json({ token: await makeToken(env) });
      await new Promise((r) => setTimeout(r, 1500)); // slow down guessing
      return json({ error: 'Wrong password' }, 401);
    }

    const hub = env.HUB.get(env.HUB.idFromName('hub'));

    if (url.pathname === '/ws/admin') {
      if (!(await validToken(env, url.searchParams.get('token')))) return new Response('Unauthorized', { status: 401 });
      return hub.fetch(req);
    }
    if (url.pathname === '/ws/device') return hub.fetch(req); // the hub checks the device's own secret

    return new Response('Not found', { status: 404 });
  },
};
