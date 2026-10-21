/* ==========================================================
   End-to-end CRUD test for the REST API.
   1) Start the server:   npm start
   2) In another terminal: npm run test:crud
   Optional: BASE_URL=http://localhost:5000 npm run test:crud
   Requires Node 18+ (built-in fetch).
   ========================================================== */
const BASE = (process.env.BASE_URL || 'http://localhost:5000') + '/api';
let passed = 0, failed = 0;

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: token } : {}) }, // `token` is the auth cookie
    body: body ? JSON.stringify(body) : undefined,
  });
  // The server sets the JWT in an httpOnly cookie; grab it like a browser would
  const setCookie = (res.headers.getSetCookie?.() || []).find((c) => c.startsWith('bb_token='));
  return { status: res.status, data: await res.json().catch(() => ({})), cookie: setCookie ? setCookie.split(';')[0] : null };
}

function check(name, condition, extra = '') {
  if (condition) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.log(`  ✘ ${name} ${extra}`); }
}

(async () => {
  const stamp = Date.now();
  const mk = (n) => ({ name: `Tester ${n}`, email: `tester${n}_${stamp}@example.com`, password: 'secret1234' });

  try { await fetch(BASE + '/health'); } catch {
    console.error(`Cannot reach ${BASE}. Start the server first with: npm start`);
    process.exit(1);
  }

  console.log('\nAuth');
  const a = await call('/auth/register', { method: 'POST', body: mk('A') });
  check('register user A (201) + auth cookie', a.status === 201 && a.cookie, JSON.stringify(a.data));
  const b = await call('/auth/register', { method: 'POST', body: mk('B') });
  check('register user B (201)', b.status === 201);
  const dup = await call('/auth/register', { method: 'POST', body: mk('A') });
  check('duplicate email rejected (409)', dup.status === 409);
  const bad = await call('/auth/login', { method: 'POST', body: { email: mk('A').email, password: 'wrong' } });
  check('wrong password rejected (401)', bad.status === 401);
  const tokenA = a.cookie, tokenB = b.cookie;

  console.log('\nCREATE');
  const noAuth = await call('/blogs', { method: 'POST', body: { title: 'x', content: 'y' } });
  check('create without token (401)', noAuth.status === 401);
  const invalid = await call('/blogs', { method: 'POST', token: tokenA, body: { title: 'Hi', content: 'short' } });
  check('invalid blog rejected (400)', invalid.status === 400, JSON.stringify(invalid.data));
  const created = await call('/blogs', {
    method: 'POST', token: tokenA,
    body: { title: `CRUD test ${stamp}`, category: 'JavaScript', content: 'This is a test blog post used to verify the create, read, update and delete operations.' },
  });
  check('create blog (201)', created.status === 201 && created.data.blog?.id, JSON.stringify(created.data));
  const id = created.data.blog?.id;

  console.log('\nREAD');
  const one = await call(`/blogs/${id}`);
  check('get single blog (200)', one.status === 200 && one.data.blog.title === `CRUD test ${stamp}`);
  check('blog has author name + readTime', one.data.blog?.authorName === 'Tester A' && one.data.blog?.readTime >= 1);
  const list = await call('/blogs?limit=50');
  check('list includes new blog', list.data.blogs?.some((x) => x.id === id));
  const mine = await call('/blogs/mine', { token: tokenA });
  check('"mine" returns only my blogs', mine.data.blogs?.length === 1 && mine.data.blogs[0].id === id);
  const badId = await call('/blogs/not-an-id');
  check('malformed id (400)', badId.status === 400);
  const missing = await call('/blogs/64b64b64b64b64b64b64b64b');
  check('unknown id (404)', missing.status === 404);

  console.log('\nSEARCH & FILTER');
  const s1 = await call(`/blogs?search=${encodeURIComponent(`CRUD test ${stamp}`)}`);
  check('search by title finds blog', s1.data.blogs?.length === 1);
  const s2 = await call('/blogs?search=zzzz_no_match_zzzz');
  check('search with no match returns empty', s2.data.blogs?.length === 0);
  const s3 = await call(`/blogs?category=JavaScript&search=${stamp}`);
  check('category + search filter', s3.data.blogs?.length === 1);
  const s4 = await call(`/blogs?category=CSS&search=${stamp}`);
  check('category filter excludes other categories', s4.data.blogs?.length === 0);
  const cats = await call('/blogs/categories');
  check('categories endpoint returns counts', cats.data.categories?.find((c) => c.name === 'JavaScript')?.count >= 1);
  const sorted = await call('/blogs?sort=oldest&limit=50');
  check('sort=oldest works', sorted.status === 200 && sorted.data.blogs.length >= 1);

  console.log('\nUPDATE');
  const upd = await call(`/blogs/${id}`, { method: 'PUT', token: tokenA, body: { title: `Updated ${stamp}`, category: 'CSS' } });
  check('owner can update (200)', upd.status === 200 && upd.data.blog.title === `Updated ${stamp}` && upd.data.blog.category === 'CSS', JSON.stringify(upd.data));
  const after = await call(`/blogs/${id}`);
  check('update persisted in database', after.data.blog?.title === `Updated ${stamp}`);
  const forbidden = await call(`/blogs/${id}`, { method: 'PUT', token: tokenB, body: { title: 'Hacked title' } });
  check("other user cannot update (403)", forbidden.status === 403);
  const emptyTitle = await call(`/blogs/${id}`, { method: 'PUT', token: tokenA, body: { title: '' } });
  check('invalid update rejected (400)', emptyTitle.status === 400);

  console.log('\nDELETE');
  const forbiddenDel = await call(`/blogs/${id}`, { method: 'DELETE', token: tokenB });
  check('other user cannot delete (403)', forbiddenDel.status === 403);
  const del = await call(`/blogs/${id}`, { method: 'DELETE', token: tokenA });
  check('owner can delete (200)', del.status === 200);
  const gone = await call(`/blogs/${id}`);
  check('deleted blog is gone (404)', gone.status === 404);
  const delAgain = await call(`/blogs/${id}`, { method: 'DELETE', token: tokenA });
  check('deleting twice (404)', delAgain.status === 404);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
