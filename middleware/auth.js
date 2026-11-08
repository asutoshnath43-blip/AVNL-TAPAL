/**
 * Auth Middleware
 *
 * requireLogin  – rejects unauthenticated requests (401)
 * requireAdmin  – rejects non-admin requests (403)
 */

function requireLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, error: 'Login required.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, error: 'Login required.' });
  }
  if (req.session.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }
  next();
}

module.exports = { requireLogin, requireAdmin };
