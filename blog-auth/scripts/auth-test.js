/* ==========================================================
   End-to-end test for authentication, sessions and profile.
   1) Start the server:    npm start
   2) In another terminal: npm run test:auth
   Optional: BASE_URL=http://localhost:5000 npm run test:auth
   Requires Node 18.14+ (fetch + getSetCookie).
   ========================================================== */
const http = require('http');
const ROOT = process.env.BASE_URL || 'http://localhost:5000';
const BASE = ROOT + '/api';
let passed = 0, failed = 0;

async function call(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const all = res.headers.getSetCookie?.() || [];
  const raw = all.find((c) => c.startsWith('bb_token='));
  return {
    status: res.status,
    data: await res.json().catch(() => ({})),
    raw,                                         // full Set-Cookie header (to inspect flags)
    cookie: raw ? raw.split(';')[0] : null,      // "bb_token=..." usable in a Cookie header
    cleared: !!raw && /bb_token=;/.test(raw),    // true when the server expired the cookie
  };
}
const check = (name, ok, extra = '') => { ok ? passed++ : failed++; console.log(`  ${ok ? '✔' : '✘'} ${name} ${ok ? '' : extra}`); };

// Raw HTTP request so we can send a forged Origin header
function rawPost(path, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(ROOT + path);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end(JSON.stringify({ email: 'x@y.com', password: 'whatever1' }));
  });
}

(async () => {
  const stamp = Date.now();
  const email = `authtest_${stamp}@example.com`;
  const pw1 = 'firstPass123', pw2 = 'secondPass456';

  try { await fetch(BASE + '/health'); } catch {
    console.error(`Cannot reach ${BASE}. Start the server first with: npm start`);
    process.exit(1);
  }

  console.log('\nRegistration rules');
  let r = await call('/auth/register', { method: 'POST', body: { name: 'Auth Tester', email, password: 'short1' } });
  check('too-short password rejected (400)', r.status === 400);
  r = await call('/auth/register', { method: 'POST', body: { name: 'Auth Tester', email, password: 'onlyletters' } });
  check('password without a number rejected (400)', r.status === 400);
  r = await call('/auth/register', { method: 'POST', body: { name: 'Auth Tester', email, password: pw1 } });
  check('valid registration (201)', r.status === 201, JSON.stringify(r.data));
  check('JWT is in an httpOnly cookie', !!r.raw && /HttpOnly/i.test(r.raw), r.raw);
  check('cookie is SameSite=Strict', /SameSite=Strict/i.test(r.raw || ''), r.raw);
  check('token is NOT in the response body', r.data.token === undefined && !JSON.stringify(r.data).includes('eyJ'));
  check('password hash is never returned', !JSON.stringify(r.data).includes('password'));
  let cookie = r.cookie;

  console.log('\nLogin');
  r = await call('/auth/login', { method: 'POST', body: { email, password: 'wrongPass999' } });
  check('wrong password (401)', r.status === 401);
  r = await call('/auth/login', { method: 'POST', body: { email: `nobody_${stamp}@example.com`, password: pw1 } });
  check('unknown email gives the same 401', r.status === 401 && r.data.message === 'Invalid email or password.');
  r = await call('/auth/login', { method: 'POST', body: { email: { $ne: '' }, password: { $ne: '' } } });
  check('NoSQL injection attempt rejected', r.status === 400 || r.status === 401);
  r = await call('/auth/login', { method: 'POST', body: { email: email.toUpperCase(), password: pw1 } });
  check('login OK (email is case-insensitive)', r.status === 200 && r.cookie, JSON.stringify(r.data));
  cookie = r.cookie;

  console.log('\nProtected routes');
  r = await call('/auth/me');
  check('/me without cookie (401)', r.status === 401);
  r = await call('/auth/me', { cookie: 'bb_token=not.a.real.token' });
  check('/me with forged token (401)', r.status === 401);
  r = await call('/blogs/mine');
  check('dashboard data (/blogs/mine) without login (401)', r.status === 401);
  r = await call('/auth/me', { cookie });
  check('/me with valid cookie (200)', r.status === 200 && r.data.user?.email === email, JSON.stringify(r.data));

  console.log('\nDashboard shows only my blogs');
  const other = await call('/auth/register', { method: 'POST', body: { name: 'Other User', email: `other_${stamp}@example.com`, password: pw1 } });
  await call('/blogs', { method: 'POST', cookie: other.cookie, body: { title: 'Other persons post', content: 'This post belongs to a different user and must not show up for me.' } });
  r = await call('/blogs', { method: 'POST', cookie, body: { title: 'My first post', content: 'This is my own post which should appear in my dashboard listing.' } });
  check('create blog while logged in (201)', r.status === 201);
  r = await call('/blogs/mine', { cookie });
  check('/blogs/mine returns only my 1 post', r.status === 200 && r.data.blogs.length === 1 && r.data.blogs[0].title === 'My first post', JSON.stringify(r.data));

  console.log('\nProfile');
  r = await call('/auth/profile', { method: 'PUT', cookie, body: { name: 'Renamed Tester', bio: 'Hello from the test suite' } });
  check('update name + bio (200)', r.status === 200 && r.data.user.name === 'Renamed Tester' && r.data.user.bio === 'Hello from the test suite', JSON.stringify(r.data));
  r = await call('/auth/profile', { method: 'PUT', cookie, body: { name: 'A' } });
  check('too-short name rejected (400)', r.status === 400);
  r = await call('/auth/profile', { method: 'PUT', cookie, body: { bio: 'x'.repeat(201) } });
  check('bio over 200 chars rejected (400)', r.status === 400);
  r = await call('/auth/me', { cookie });
  check('profile changes persisted + post count', r.data.user?.name === 'Renamed Tester' && r.data.stats?.posts === 1);
  const list = await call('/blogs?limit=50');
  check('new name shows as author on my blog', list.data.blogs?.some((b) => b.title === 'My first post' && b.authorName === 'Renamed Tester'));

  console.log('\nChange password');
  r = await call('/auth/password', { method: 'PUT', cookie, body: { currentPassword: 'badCurrent1', newPassword: pw2 } });
  check('wrong current password (400)', r.status === 400);
  r = await call('/auth/password', { method: 'PUT', cookie, body: { currentPassword: pw1, newPassword: 'weak' } });
  check('weak new password (400)', r.status === 400);
  r = await call('/auth/password', { method: 'PUT', cookie, body: { currentPassword: pw1, newPassword: pw1 } });
  check('same password rejected (400)', r.status === 400);
  const oldCookie = cookie;
  r = await call('/auth/password', { method: 'PUT', cookie, body: { currentPassword: pw1, newPassword: pw2 } });
  check('password changed (200) and fresh cookie issued', r.status === 200 && r.cookie, JSON.stringify(r.data));
  cookie = r.cookie;
  r = await call('/auth/me', { cookie: oldCookie });
  check('OLD session invalidated after password change (401)', r.status === 401);
  r = await call('/auth/me', { cookie });
  check('new session works (200)', r.status === 200);
  r = await call('/auth/login', { method: 'POST', body: { email, password: pw1 } });
  check('old password no longer works (401)', r.status === 401);
  r = await call('/auth/login', { method: 'POST', body: { email, password: pw2 } });
  check('new password works (200)', r.status === 200);
  cookie = r.cookie;

  console.log('\nLogout');
  r = await call('/auth/logout', { method: 'POST', cookie });
  check('logout clears the cookie (200)', r.status === 200 && r.cleared, r.raw);
  r = await call('/auth/login', { method: 'POST', body: { email, password: pw2 } });
  const deviceA = r.cookie;
  r = await call('/auth/login', { method: 'POST', body: { email, password: pw2 } });
  const deviceB = r.cookie;
  r = await call('/auth/logout-all', { method: 'POST', cookie: deviceA });
  check('sign out on all devices (200)', r.status === 200 && r.cleared);
  r = await call('/auth/me', { cookie: deviceB });
  check('other device is signed out too (401)', r.status === 401);

  console.log('\nCSRF protection');
  const status = await rawPost('/api/auth/login', { Origin: 'http://evil.example.com' });
  check('cross-origin POST blocked (403)', status === 403, `got ${status}`);

  console.log('\nDelete account');
  r = await call('/auth/login', { method: 'POST', body: { email, password: pw2 } });
  cookie = r.cookie;
  r = await call('/auth/account', { method: 'DELETE', cookie, body: { password: 'wrongPass1' } });
  check('delete with wrong password rejected (400)', r.status === 400);
  r = await call('/auth/account', { method: 'DELETE', cookie, body: { password: pw2 } });
  check('account deleted (200)', r.status === 200 && r.cleared);
  r = await call('/auth/login', { method: 'POST', body: { email, password: pw2 } });
  check('deleted account cannot log in (401)', r.status === 401);
  const after = await call('/blogs?limit=50');
  check("deleted user's blogs are removed", !after.data.blogs?.some((b) => b.title === 'My first post'));

  // cleanup the helper user
  const o = await call('/auth/account', { method: 'DELETE', cookie: other.cookie, body: { password: pw1 } });
  check('cleanup helper user', o.status === 200);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
