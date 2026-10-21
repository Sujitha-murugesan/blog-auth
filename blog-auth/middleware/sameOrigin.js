// Extra CSRF defence on top of SameSite=Strict cookies:
// state-changing requests from a different origin are rejected.
module.exports = function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin) {
    let host;
    try { host = new URL(origin).host; } catch { host = null; }
    if (host !== req.headers.host) return res.status(403).json({ message: 'Cross-origin request blocked.' });
  }
  next();
};
