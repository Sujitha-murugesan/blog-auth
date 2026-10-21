const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { COOKIE_NAME, clearAuthCookie } = require('../utils/token');

// Protects a route. Reads the JWT from the httpOnly cookie
// (an "Authorization: Bearer" header is also accepted for API tools).
module.exports = async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = req.cookies?.[COOKIE_NAME] || (header.startsWith('Bearer ') ? header.slice(7) : null);
  if (!token) return res.status(401).json({ message: 'Authentication required. Please log in.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id);
    // tokenVersion mismatch => password was changed or user signed out everywhere
    if (!user || (user.tokenVersion || 0) !== (payload.tv || 0)) {
      clearAuthCookie(res);
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }
    req.user = user;
    next();
  } catch {
    clearAuthCookie(res);
    res.status(401).json({ message: 'Invalid or expired session. Please log in again.' });
  }
};
