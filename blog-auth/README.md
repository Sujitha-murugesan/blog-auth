# BlogApp – Module 5: Authentication & Dashboard

Secure JWT authentication, protected private pages, a per-user dashboard, and a full profile page – built on the Module 4 CRUD app (Express + MongoDB + vanilla JS).

## What's new
| Requirement | Implementation |
|-------------|----------------|
| Secure JWT auth | JWT stored in an **httpOnly, SameSite=Strict cookie** (JavaScript can't read it; `Secure` flag in production). Not returned in the response body, not kept in localStorage. |
| Protect dashboard routes | **Server:** every private endpoint uses `middleware/auth.js`. **Browser:** private pages (`dashboard`, `create-blog`, `profile`) are hidden until `GET /api/auth/me` confirms the session; otherwise you're redirected to `login.html?next=…` and sent back after login. |
| Only the user's own blogs on the dashboard | `GET /api/blogs/mine` filters by the logged-in user on the server (the client never chooses whose posts to load). |
| User profile | `profile.html`: view account info, edit name & bio, change password, sign out on all devices, delete account. |
| Logout | `POST /api/auth/logout` clears the cookie; `POST /api/auth/logout-all` invalidates **every** session on every device. |

## Setup
```bash
npm install
# edit .env -> set MONGODB_URI and a long random JWT_SECRET
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
npm run seed      # optional: demo user + sample posts (demo@blogapp.com / demo1234)
npm start         # or: npm run dev
```
Open http://localhost:5000. You need MongoDB: a free Atlas cluster, `docker compose up -d`, or a local install.

## Testing
With the server running (add `DISABLE_RATE_LIMIT=true` to `.env` if you re-run the tests often):
```bash
npm run test:auth   # registration rules, cookie flags, login, protected routes, profile, password change,
                    # logout / logout-all, CSRF origin check, account deletion
npm run test:crud   # blog create / read / search / update / delete + ownership checks
```
Every line should show ✔.

## How the security works
1. **Login** → server verifies the bcrypt hash, signs a JWT `{id, tv}` and sends it as an httpOnly cookie.
2. **Every request** → browser attaches the cookie automatically; `auth` middleware verifies the signature, loads the user from MongoDB and checks `tv` (token version).
3. **Password change / sign out everywhere** → `user.tokenVersion` is incremented, so all previously issued JWTs stop working immediately, even though they haven't expired.
4. **Safeguards**
   - Password policy: 8–72 chars, at least one letter and one number (server + client, with a strength meter)
   - bcrypt hashing; password field `select: false`; generic "Invalid email or password"; constant-time-ish check for unknown emails
   - Rate limiting: 10 failed logins / 15 min per IP, 100 auth requests / 15 min
   - CSRF: SameSite=Strict cookie **plus** same-origin check on all state-changing requests
   - NoSQL-injection guard (inputs coerced to strings), `helmet` headers, 100 kb body limit
   - Open-redirect guard on the `?next=` parameter (only local `*.html` pages allowed)
   - Owner-only edit/delete of blogs; deleting an account removes its blogs
   - **Production:** set `NODE_ENV=production` (enables `Secure` cookies – needs HTTPS – and refuses a placeholder JWT secret)

## API
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | – | create account, sets cookie |
| POST | `/api/auth/login` | – | log in, sets cookie |
| POST | `/api/auth/logout` | – | clear cookie |
| POST | `/api/auth/logout-all` | ✔ | invalidate all sessions |
| GET | `/api/auth/me` | ✔ | current user + post count |
| PUT | `/api/auth/profile` | ✔ | `{ name, bio }` |
| PUT | `/api/auth/password` | ✔ | `{ currentPassword, newPassword }` |
| DELETE | `/api/auth/account` | ✔ | `{ password }` – deletes user + their blogs |
| GET | `/api/blogs`, `/api/blogs/categories`, `/api/blogs/:id` | – | public reading |
| GET | `/api/blogs/mine` | ✔ | only my blogs (search/category/sort supported) |
| POST / PUT / DELETE | `/api/blogs[/:id]` | ✔ | create / update / delete (owner only for PUT/DELETE) |

Status codes: 200/201 ok · 400 validation · 401 not logged in / session expired · 403 not the owner or cross-origin · 404 not found · 409 duplicate email · 429 too many attempts.

## Project structure
```
server.js              helmet, cookies, same-origin check, rate limits, routes
config/db.js           Mongoose connection
models/                User.js (bio, tokenVersion, lastLoginAt), Blog.js
middleware/            auth.js (JWT cookie check), sameOrigin.js (CSRF)
utils/                 token.js (sign + cookie helpers), password.js (policy)
routes/                auth.js (account/session/profile), blogs.js (CRUD)
scripts/               seed.js, auth-test.js, crud-test.js
public/                index, login, register, dashboard, create-blog, blog, profile (+ css/js)
```
