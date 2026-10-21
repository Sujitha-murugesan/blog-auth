/* ==========================================================
   api.js – talks to the Express + MongoDB backend via fetch()
   Authentication uses an httpOnly cookie set by the server, so
   no token is ever stored in (or readable by) JavaScript.
   Only non-sensitive display info (name/email) is cached.
   ========================================================== */
const Api = (() => {
  const BASE = '/api';
  const USER = 'bb_user';

  const clearUser = () => localStorage.removeItem(USER);
  const cacheUser = (u) => localStorage.setItem(USER, JSON.stringify(u));

  // Only allow redirects to our own pages (prevents open-redirect attacks)
  const safeNext = (next) => (/^[a-z0-9_-]+\.html(\?[^\s]*)?$/i.test(next || '') ? next : 'dashboard.html');

  async function request(path, { method = 'GET', body, auth = false } = {}) {
    let res;
    try {
      res = await fetch(BASE + path, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error('Cannot reach the server. Is it running?');
    }
    const data = await res.json().catch(() => ({}));

    if (res.status === 401 && auth) {
      // Session missing/expired -> forget cached user and send to login
      clearUser();
      const here = location.pathname.split('/').pop() + location.search;
      if (!/^(login|register)\.html/.test(here)) {
        window.location.replace(`login.html?expired=1&next=${encodeURIComponent(here || 'dashboard.html')}`);
      }
      throw new Error(data.message || 'Session expired. Please log in again.');
    }
    if (!res.ok) throw new Error(data.message || 'Request failed.');
    return data;
  }

  return {
    safeNext,

    /* ---- session ---- */
    currentUser() { // cached copy, for rendering the navbar only. NOT proof of login.
      try { return JSON.parse(localStorage.getItem(USER)); } catch { return null; }
    },
    async me() { // asks the server whether the cookie is valid
      const data = await request('/auth/me', { auth: true });
      cacheUser(data.user);
      return data; // { user, stats }
    },
    async logout() {
      try { await request('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
      clearUser();
    },
    async logoutAll() { await request('/auth/logout-all', { method: 'POST', auth: true }); clearUser(); },

    /* ---- auth ---- */
    async register(payload) { const d = await request('/auth/register', { method: 'POST', body: payload }); cacheUser(d.user); return d.user; },
    async login(payload) { const d = await request('/auth/login', { method: 'POST', body: payload }); cacheUser(d.user); return d.user; },

    /* ---- profile ---- */
    async updateProfile(payload) { const d = await request('/auth/profile', { method: 'PUT', body: payload, auth: true }); cacheUser(d.user); return d.user; },
    changePassword(payload) { return request('/auth/password', { method: 'PUT', body: payload, auth: true }); },
    async deleteAccount(password) { await request('/auth/account', { method: 'DELETE', body: { password }, auth: true }); clearUser(); },

    /* ---- blogs ---- */
    getBlogs({ page = 1, limit = 9, search = '', category = '', sort = 'newest' } = {}) {
      const q = new URLSearchParams({ page, limit, sort });
      if (search) q.set('search', search);
      if (category) q.set('category', category);
      return request(`/blogs?${q}`);
    },
    getCategories() { return request('/blogs/categories'); },
    async getBlog(id) { return (await request(`/blogs/${encodeURIComponent(id)}`)).blog; },
    async getMyBlogs({ search = '', category = '', sort = 'newest' } = {}) {
      const q = new URLSearchParams({ sort });
      if (search) q.set('search', search);
      if (category) q.set('category', category);
      return (await request(`/blogs/mine?${q}`, { auth: true })).blogs;
    },
    async createBlog(data) { return (await request('/blogs', { method: 'POST', body: data, auth: true })).blog; },
    async updateBlog(id, data) { return (await request(`/blogs/${encodeURIComponent(id)}`, { method: 'PUT', body: data, auth: true })).blog; },
    deleteBlog(id) { return request(`/blogs/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }); },
  };
})();
