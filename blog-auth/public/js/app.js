/* ==========================================================
   app.js – shared UI helpers + page logic (one init per page)
   Auth: requireLogin() verifies the session with the server before
   any private page (dashboard, create/edit blog, profile) is shown.
   CRUD map:
     Create -> Pages.create()      Read   -> Pages.home(), Pages.detail(), Pages.dashboard()
     Update -> Pages.create(edit)  Delete -> Pages.dashboard(), Pages.detail()
   ========================================================== */
const $ = (sel, root = document) => root.querySelector(sel);

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}
const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const excerpt = (text, n = 130) => (text.length > n ? text.slice(0, n).trim() + '…' : text);
const wordCount = (text) => (text.trim() ? text.trim().split(/\s+/).length : 0);
const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Escape first, then wrap search matches in <mark> (safe against XSS)
function highlight(text, q) {
  const safe = esc(text);
  if (!q) return safe;
  const rx = new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return safe.replace(rx, (m) => `<mark>${m}</mark>`);
}

let toastTimer;
function toast(message, type = '') {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = message;
  el.className = `${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// Promise-based confirmation dialog (used before every delete)
function confirmDialog({ title = 'Are you sure?', message = '', confirmText = 'Delete' } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'confirm';
    dlg.innerHTML = `<h2>${esc(title)}</h2><p>${esc(message)}</p>
      <div class="row"><button class="btn btn-outline btn-sm" data-r="0">Cancel</button>
      <button class="btn btn-danger btn-sm" data-r="1">${esc(confirmText)}</button></div>`;
    document.body.appendChild(dlg);
    let result = false;
    dlg.addEventListener('click', (e) => {
      if (e.target.dataset.r) { result = e.target.dataset.r === '1'; dlg.close(); }
      else if (e.target === dlg) dlg.close();
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.showModal();
  });
}

/* ---------- Password helpers ---------- */
function passwordIssue(pw) {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain at least one letter and one number.';
  return '';
}
function strengthMeter(input, bar, label) {
  const levels = [['', '#e2e8f0'], ['Weak', '#dc2626'], ['Fair', '#f59e0b'], ['Good', '#16a34a'], ['Strong', '#15803d']];
  const update = () => {
    const v = input.value;
    let score = 0;
    if (v.length >= 8) score++;
    if (v.length >= 12) score++;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
    if (/\d/.test(v) && /[A-Za-z]/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    score = v ? Math.min(Math.max(score, 1), 4) : 0;
    bar.style.width = `${score * 25}%`;
    bar.style.background = levels[score][1];
    label.textContent = v ? `Password strength: ${levels[score][0]}` : '';
  };
  input.addEventListener('input', update);
}
function showPasswordToggle(checkbox, inputs) {
  checkbox.addEventListener('change', () => inputs.forEach((i) => (i.type = checkbox.checked ? 'text' : 'password')));
}

/* ---------- Route protection ----------
   Hides the page (body.guard) until the SERVER confirms the session is valid.
   Returns { user, stats } or null (in which case the browser is already being redirected). */
async function requireLogin() {
  const here = location.pathname.split('/').pop() + location.search;
  if (!Api.currentUser()) { window.location.replace(`login.html?next=${encodeURIComponent(here)}`); return null; }
  try {
    const data = await Api.me();
    document.body.classList.remove('guard');
    renderChrome(); // refresh navbar with the verified user
    return data;
  } catch (e) {
    if (Api.currentUser()) { // not a 401 redirect -> e.g. server offline
      document.body.classList.remove('guard');
      $('main').innerHTML = `<div class="card empty">${esc(e.message)}</div>`;
    }
    return null;
  }
}
function redirectIfLoggedIn() { if (Api.currentUser()) window.location.replace('dashboard.html'); }
const initial = (name) => (name || '?').trim().charAt(0).toUpperCase();

/* ---------- Navbar + footer ---------- */
function renderChrome() {
  const page = document.body.dataset.page;
  const user = Api.currentUser();
  const link = (href, label, key, cls = '') =>
    `<li><a href="${href}" class="${cls} ${page === key ? 'active' : ''}">${label}</a></li>`;

  const items = user
    ? link('index.html', 'Home', 'home') + link('dashboard.html', 'Dashboard', 'dashboard') +
      link('create-blog.html', 'Create Blog', 'create') + link('profile.html', 'Profile', 'profile') +
      `<li><button id="logoutBtn">Logout (${esc(user.name.split(' ')[0])})</button></li>`
    : link('index.html', 'Home', 'home') + link('login.html', 'Login', 'login') +
      link('register.html', 'Register', 'register', 'cta');

  const nav = $('#navbar');
  if (nav) {
    nav.className = 'navbar';
    nav.innerHTML = `<div class="container">
      <a class="brand" href="index.html">📝 BlogApp</a>
      <button class="menu-toggle" id="menuToggle" aria-label="Toggle menu">☰</button>
      <ul class="nav-links" id="navLinks">${items}</ul></div>`;
    $('#menuToggle').addEventListener('click', () => $('#navLinks').classList.toggle('open'));
    $('#logoutBtn')?.addEventListener('click', async () => { await Api.logout(); window.location.href = 'index.html'; });
  }
  const foot = $('#footer');
  if (foot) foot.textContent = `© ${new Date().getFullYear()} BlogApp · Express + MongoDB · Secure JWT auth`;
}

function blogCard(b, q = '') {
  const href = `blog.html?id=${encodeURIComponent(b.id)}`;
  return `<article class="card blog-card">
    <span class="tag">${esc(b.category)}</span>
    <h3><a href="${href}" style="color:inherit">${highlight(b.title, q)}</a></h3>
    <p class="excerpt">${highlight(excerpt(b.content), q)}</p>
    <div class="meta">by ${esc(b.authorName)} · ${fmtDate(b.createdAt)} · ${b.readTime} min read</div>
    <a class="btn btn-outline btn-sm" href="${href}" style="align-self:flex-start">Read more</a>
  </article>`;
}

// Fill a <select> with categories from the API (keeps the first option as "All")
async function fillCategorySelect(select, { keepFirst = true } = {}) {
  try {
    const { categories } = await Api.getCategories();
    const first = keepFirst ? select.options[0].outerHTML : '';
    select.innerHTML = first + categories.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
  } catch { /* keep any static options already in the HTML */ }
}

/* ---------- Pages ---------- */
const Pages = {
  /* READ (list + search + category filter + sort + pagination) */
  async home() {
    const grid = $('#blogGrid'), pager = $('#pagination'), info = $('#resultsInfo'), chips = $('#chips');
    const params = new URLSearchParams(location.search);
    const state = {
      page: Math.max(parseInt(params.get('page')) || 1, 1),
      search: params.get('q') || '',
      category: params.get('category') || '',
      sort: params.get('sort') || 'newest',
    };
    $('#search').value = state.search;
    $('#sort').value = state.sort;

    const syncUrl = () => {
      const p = new URLSearchParams();
      if (state.search) p.set('q', state.search);
      if (state.category) p.set('category', state.category);
      if (state.sort !== 'newest') p.set('sort', state.sort);
      if (state.page > 1) p.set('page', state.page);
      history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
    };

    const renderChips = async () => {
      try {
        const { categories, total } = await Api.getCategories();
        const chip = (value, label, n) =>
          `<button class="chip ${state.category === value ? 'active' : ''}" data-cat="${esc(value)}">${esc(label)}<span class="n">${n}</span></button>`;
        chips.innerHTML = chip('', 'All', total) + categories.filter((c) => c.count || c.name === state.category).map((c) => chip(c.name, c.name, c.count)).join('');
      } catch { chips.innerHTML = ''; }
    };

    const load = async () => {
      syncUrl();
      grid.innerHTML = '<div class="loading">Loading blogs…</div>';
      try {
        const data = await Api.getBlogs(state);
        if (state.page > data.pages) { state.page = data.pages; return load(); }
        grid.innerHTML = data.blogs.length
          ? data.blogs.map((b) => blogCard(b, state.search)).join('')
          : '<div class="empty">No blogs match your filters.</div>';
        const filtered = state.search || state.category;
        info.innerHTML = `<span>${plural(data.total, 'post')} found${state.category ? ` in <strong>${esc(state.category)}</strong>` : ''}${state.search ? ` for “${esc(state.search)}”` : ''}</span>` +
          (filtered ? '<button class="linkbtn" id="clear">Clear filters</button>' : '');
        $('#clear')?.addEventListener('click', () => {
          state.search = ''; state.category = ''; state.page = 1; $('#search').value = '';
          renderChips(); load();
        });
        pager.innerHTML = data.pages > 1
          ? `<button class="btn btn-outline btn-sm" id="prev" ${data.page <= 1 ? 'disabled' : ''}>← Previous</button>
             <span>Page ${data.page} of ${data.pages}</span>
             <button class="btn btn-outline btn-sm" id="next" ${data.page >= data.pages ? 'disabled' : ''}>Next →</button>`
          : '';
        const go = (d) => { state.page += d; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
        $('#prev')?.addEventListener('click', () => go(-1));
        $('#next')?.addEventListener('click', () => go(1));
      } catch (e) {
        grid.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
        pager.innerHTML = ''; info.innerHTML = '';
      }
    };

    $('#search').addEventListener('input', debounce(() => { state.search = $('#search').value.trim(); state.page = 1; load(); }));
    $('#sort').addEventListener('change', () => { state.sort = $('#sort').value; state.page = 1; load(); });
    chips.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      state.category = btn.dataset.cat; state.page = 1;
      renderChips(); load();
    });

    const cta = $('#heroCta');
    if (Api.currentUser()) { cta.textContent = 'Write a blog'; cta.href = 'create-blog.html'; }
    renderChips();
    load();
  },

  register() {
    redirectIfLoggedIn();
    const form = $('#registerForm');
    strengthMeter(form.password, $('#strengthBar'), $('#strengthLabel'));
    showPasswordToggle($('#showPw'), [form.password, form.confirm]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target, err = $('#formError'), btn = f.querySelector('button[type=submit]');
      err.textContent = '';
      const name = f.name.value.trim(), email = f.email.value.trim(), pw = f.password.value;
      if (name.length < 2) return (err.textContent = 'Please enter your name.');
      if (passwordIssue(pw)) return (err.textContent = passwordIssue(pw));
      if (pw !== f.confirm.value) return (err.textContent = 'Passwords do not match.');
      btn.disabled = true;
      try {
        await Api.register({ name, email, password: pw });
        toast('Account created!', 'success');
        setTimeout(() => (window.location.href = 'dashboard.html'), 600);
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    });
  },

  login() {
    redirectIfLoggedIn();
    const params = new URLSearchParams(location.search);
    if (params.get('expired')) $('#notice').textContent = 'Your session has ended. Please log in again.';
    else if (params.get('next')) $('#notice').textContent = 'Please log in to continue.';
    if (!$('#notice').textContent) $('#notice').hidden = true;
    showPasswordToggle($('#showPw'), [$('#loginForm').password]);
    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target, err = $('#formError'), btn = f.querySelector('button[type=submit]');
      err.textContent = '';
      btn.disabled = true;
      try {
        await Api.login({ email: f.email.value, password: f.password.value });
        window.location.href = Api.safeNext(params.get('next'));
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    });
  },

  /* READ (my posts) + DELETE */
  async dashboard() {
    const session = await requireLogin();
    if (!session) return;
    const user = session.user;
    $('#welcome').textContent = `Welcome back, ${user.name}!`;
    $('#dashProfile').innerHTML = `<div class="who"><div class="avatar sm">${esc(initial(user.name))}</div>
      <div><strong>${esc(user.name)}</strong><div class="meta">${esc(user.email)}</div></div></div>
      <a class="btn btn-outline btn-sm" href="profile.html">View profile</a>`;
    const list = $('#myPosts');
    await fillCategorySelect($('#dCategory'));

    const render = async () => {
      const q = { search: $('#dSearch').value.trim(), category: $('#dCategory').value, sort: $('#dSort').value };
      let mine;
      try { mine = await Api.getMyBlogs(q); }
      catch (e) { if (!Api.currentUser()) return; list.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; return; }

      // stats always reflect ALL of my posts
      const all = q.search || q.category ? await Api.getMyBlogs().catch(() => mine) : mine;
      $('#statPosts').textContent = all.length;
      $('#statWords').textContent = all.reduce((n, b) => n + wordCount(b.content), 0);
      const latest = [...all].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      $('#statLatest').textContent = latest ? fmtDate(latest.createdAt) : '—';

      list.innerHTML = mine.length
        ? mine.map((b) => `<div class="card post-row">
            <div><h3>${highlight(b.title, q.search)}</h3><div class="meta">${esc(b.category)} · ${fmtDate(b.createdAt)} · ${plural(wordCount(b.content), 'word')}</div></div>
            <div class="post-actions">
              <a class="btn btn-outline btn-sm" href="blog.html?id=${encodeURIComponent(b.id)}">View</a>
              <a class="btn btn-sm" href="create-blog.html?edit=${encodeURIComponent(b.id)}">Edit</a>
              <button class="btn btn-danger btn-sm" data-del="${esc(b.id)}" data-title="${esc(b.title)}">Delete</button>
            </div></div>`).join('')
        : (q.search || q.category
            ? '<div class="card empty">No posts match your filters.</div>'
            : '<div class="card empty">You haven\'t written any posts yet. <a href="create-blog.html">Create your first blog</a>.</div>');
    };

    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-del]');
      if (!btn) return;
      const ok = await confirmDialog({ title: 'Delete this post?', message: `“${btn.dataset.title}” will be permanently removed.` });
      if (!ok) return;
      try { await Api.deleteBlog(btn.dataset.del); toast('Post deleted', 'success'); render(); }
      catch (ex) { toast(ex.message, 'error'); }
    });
    $('#dSearch').addEventListener('input', debounce(render));
    $('#dCategory').addEventListener('change', render);
    $('#dSort').addEventListener('change', render);
    list.innerHTML = '<div class="loading">Loading your posts…</div>';
    render();
  },

  /* CREATE + UPDATE */
  async create() {
    if (!(await requireLogin())) return;
    const f = $('#blogForm'), content = f.content, counter = $('#charCount');
    await fillCategorySelect(f.category, { keepFirst: false });

    const editId = new URLSearchParams(location.search).get('edit');
    let existing = null;
    if (editId) {
      try {
        existing = await Api.getBlog(editId);
        if (existing.authorId !== Api.currentUser().id) throw new Error('You can only edit your own posts.');
      } catch (ex) {
        toast(ex.message, 'error');
        return setTimeout(() => (window.location.href = 'dashboard.html'), 1000);
      }
      $('#pageTitle').textContent = 'Edit blog';
      $('#submitBtn').textContent = 'Save changes';
      f.title.value = existing.title; f.category.value = existing.category; f.content.value = existing.content;
    }

    // warn about unsaved changes
    const snapshot = () => JSON.stringify([f.title.value, f.category.value, f.content.value]);
    const initial = snapshot();
    let submitted = false;
    window.addEventListener('beforeunload', (e) => { if (!submitted && snapshot() !== initial) { e.preventDefault(); e.returnValue = ''; } });

    const count = () => (counter.textContent = `${plural(wordCount(content.value), 'word')} · ${Math.max(1, Math.ceil(wordCount(content.value) / 200))} min read`);
    content.addEventListener('input', count); count();

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#formError'), btn = $('#submitBtn');
      err.textContent = '';
      const data = { title: f.title.value, category: f.category.value, content: f.content.value };
      if (data.title.trim().length < 3) return (err.textContent = 'Title must be at least 3 characters.');
      if (wordCount(data.content) < 10) return (err.textContent = 'Content must be at least 10 words.');
      btn.disabled = true;
      try {
        const blog = existing ? await Api.updateBlog(existing.id, data) : await Api.createBlog(data);
        submitted = true;
        toast(existing ? 'Changes saved' : 'Blog published!', 'success');
        setTimeout(() => (window.location.href = `blog.html?id=${encodeURIComponent(blog.id)}`), 700);
      } catch (ex) {
        err.textContent = ex.message; btn.disabled = false;
        if (!Api.currentUser()) setTimeout(() => (window.location.href = 'login.html'), 1200);
      }
    });
  },

  /* PROFILE: view/edit account, change password, sign out everywhere, delete account */
  async profile() {
    const session = await requireLogin();
    if (!session) return;
    let { user, stats } = session;

    const renderHead = () => {
      $('#avatar').textContent = initial(user.name);
      $('#pName').textContent = user.name;
      $('#pEmail').textContent = user.email;
      $('#pBio').textContent = user.bio || 'No bio yet.';
      $('#pMeta').textContent = `Member since ${fmtDate(user.createdAt)} · ${plural(stats.posts, 'post')}` +
        (user.lastLoginAt ? ` · Last login ${new Date(user.lastLoginAt).toLocaleString()}` : '');
    };
    renderHead();

    // --- edit profile
    const pf = $('#profileForm'), bioCount = $('#bioCount');
    pf.name.value = user.name; pf.bio.value = user.bio || '';
    const countBio = () => (bioCount.textContent = `${pf.bio.value.length}/200`);
    pf.bio.addEventListener('input', countBio); countBio();
    pf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#profileError'), ok = $('#profileOk'), btn = pf.querySelector('button[type=submit]');
      err.textContent = ''; ok.textContent = '';
      if (pf.name.value.trim().length < 2) return (err.textContent = 'Name must be at least 2 characters.');
      btn.disabled = true;
      try {
        user = await Api.updateProfile({ name: pf.name.value, bio: pf.bio.value });
        renderHead(); renderChrome();
        ok.textContent = 'Profile saved.';
      } catch (ex) { err.textContent = ex.message; }
      btn.disabled = false;
    });

    // --- change password
    const wf = $('#passwordForm');
    strengthMeter(wf.newPassword, $('#strengthBar'), $('#strengthLabel'));
    showPasswordToggle($('#showPw'), [wf.currentPassword, wf.newPassword, wf.confirm]);
    wf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#passwordError'), ok = $('#passwordOk'), btn = wf.querySelector('button[type=submit]');
      err.textContent = ''; ok.textContent = '';
      if (passwordIssue(wf.newPassword.value)) return (err.textContent = passwordIssue(wf.newPassword.value));
      if (wf.newPassword.value !== wf.confirm.value) return (err.textContent = 'New passwords do not match.');
      btn.disabled = true;
      try {
        await Api.changePassword({ currentPassword: wf.currentPassword.value, newPassword: wf.newPassword.value });
        wf.reset(); $('#strengthBar').style.width = '0'; $('#strengthLabel').textContent = '';
        ok.textContent = 'Password changed. Your other devices were signed out.';
      } catch (ex) { err.textContent = ex.message; }
      btn.disabled = false;
    });

    // --- sign out everywhere
    $('#logoutAllBtn').addEventListener('click', async () => {
      const yes = await confirmDialog({ title: 'Sign out on all devices?', message: 'Every browser where you are logged in, including this one, will need to log in again.', confirmText: 'Sign out everywhere' });
      if (!yes) return;
      try { await Api.logoutAll(); window.location.href = 'login.html'; }
      catch (ex) { toast(ex.message, 'error'); }
    });

    // --- delete account
    $('#deleteForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#deleteError'), pw = e.target.password.value;
      err.textContent = '';
      if (!pw) return (err.textContent = 'Enter your password to confirm.');
      const yes = await confirmDialog({ title: 'Delete your account?', message: `This permanently deletes your account and your ${plural(stats.posts, 'post')}. This cannot be undone.`, confirmText: 'Delete my account' });
      if (!yes) return;
      try { await Api.deleteAccount(pw); window.location.href = 'index.html'; }
      catch (ex) { err.textContent = ex.message; }
    });
  },

  /* READ (single) + DELETE */
  async detail() {
    const box = $('#article');
    const id = new URLSearchParams(location.search).get('id');
    if (!id) { box.innerHTML = '<div class="empty">No blog specified. <a href="index.html">Back to home</a></div>'; return; }
    try {
      const b = await Api.getBlog(id);
      document.title = `${b.title} | BlogApp`;
      const me = Api.currentUser();
      const owner = me && me.id === b.authorId;
      const edited = b.updatedAt && new Date(b.updatedAt) - new Date(b.createdAt) > 60000;
      box.innerHTML = `
        <a class="tag" href="index.html?category=${encodeURIComponent(b.category)}">${esc(b.category)}</a>
        <h1>${esc(b.title)}</h1>
        <div class="meta">by ${esc(b.authorName)} · ${fmtDate(b.createdAt)}${edited ? ` · edited ${fmtDate(b.updatedAt)}` : ''} · ${b.readTime} min read</div>
        <div class="body">${esc(b.content)}</div>
        <div class="actions">
          <a class="btn btn-outline btn-sm" href="index.html">← All blogs</a>
          ${owner ? `<a class="btn btn-sm" href="create-blog.html?edit=${encodeURIComponent(b.id)}">Edit</a>
                     <button class="btn btn-danger btn-sm" id="delBtn">Delete</button>` : ''}
        </div>`;
      $('#delBtn')?.addEventListener('click', async () => {
        const ok = await confirmDialog({ title: 'Delete this post?', message: `“${b.title}” will be permanently removed.` });
        if (!ok) return;
        try { await Api.deleteBlog(b.id); toast('Post deleted', 'success'); setTimeout(() => (window.location.href = 'dashboard.html'), 600); }
        catch (ex) { toast(ex.message, 'error'); }
      });
    } catch (e) {
      box.innerHTML = `<div class="empty"><h2>Blog not available</h2><p>${esc(e.message)}</p><a href="index.html">← Back to home</a></div>`;
    }
  },
};

document.addEventListener('DOMContentLoaded', () => {
  renderChrome();
  Pages[document.body.dataset.page]?.();
});
