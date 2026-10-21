const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'bb_token';
const DAYS = Number(process.env.JWT_EXPIRES_DAYS) || 7;

// The token carries the user id and the user's tokenVersion ("tv").
// Bumping user.tokenVersion in the database instantly invalidates every token issued before.
function signToken(user) {
  return jwt.sign({ id: user._id.toString(), tv: user.tokenVersion || 0 }, process.env.JWT_SECRET, {
    expiresIn: `${DAYS}d`,
  });
}

const baseCookie = () => ({
  httpOnly: true,                                   // JavaScript in the page can never read the token (XSS protection)
  sameSite: 'strict',                               // browser never sends it on cross-site requests (CSRF protection)
  secure: process.env.NODE_ENV === 'production',    // HTTPS only in production
  path: '/',
});

function setAuthCookie(res, user) {
  res.cookie(COOKIE_NAME, signToken(user), { ...baseCookie(), maxAge: DAYS * 24 * 60 * 60 * 1000 });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, baseCookie());
}

module.exports = { COOKIE_NAME, signToken, setAuthCookie, clearAuthCookie };
