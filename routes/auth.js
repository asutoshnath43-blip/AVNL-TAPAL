/**
 * Auth Routes
 *
 * POST   /api/auth/login           – log in with username + password
 * POST   /api/auth/logout          – destroy the session
 * GET    /api/auth/me              – return current session user (or loggedIn: false)
 * POST   /api/auth/change-password – change password (login required)
 * POST   /api/auth/register        – create a new user (admin only)
 */

const express  = require('express');
const bcrypt   = require('bcryptjs');
const db       = require('../db');
const { requireLogin, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ─── LOGIN ────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required.' });
  }

  try {
    const [rows] = await db.query(
      'SELECT id, username, password, fullName, role FROM users WHERE username = ?',
      [username.trim()]
    );

    if (!rows.length) {
      return res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }

    const user = rows[0];

    // Support both bcrypt hashes AND legacy plaintext (for smooth migration)
    let match = false;
    if (user.password.startsWith('$2')) {
      // bcrypt hash
      match = await bcrypt.compare(password, user.password);
    } else {
      // legacy plaintext – compare directly but warn in console
      match = (password === user.password);
      if (match) {
        console.warn(`⚠️  User "${username}" has a plaintext password. Run scripts/hash-admin.js to fix this.`);
      }
    }

    if (!match) {
      return res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }

    // Store safe user data in the session (never store raw password)
    req.session.userId   = user.id;
    req.session.username = user.username;
    req.session.fullName = user.fullName;
    req.session.role     = user.role;

    res.json({
      success: true,
      user: {
        id:       user.id,
        username: user.username,
        fullName: user.fullName,
        role:     user.role
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Server error during login.' });
  }
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Could not log out.' });
    }
    res.clearCookie('tapal_sid');
    res.json({ success: true, message: 'Logged out.' });
  });
});

// ─── ME (current session check) ───────────────────────────────────────────────
router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.json({ success: true, loggedIn: false });
  }
  res.json({
    success:  true,
    loggedIn: true,
    user: {
      id:       req.session.userId,
      username: req.session.username,
      fullName: req.session.fullName,
      role:     req.session.role
    }
  });
});

// ─── CHANGE PASSWORD ──────────────────────────────────────────────────────────
router.post('/change-password', requireLogin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, error: 'Current and new password are required.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, error: 'New password must be at least 6 characters.' });
  }

  try {
    const [rows] = await db.query(
      'SELECT password FROM users WHERE id = ?',
      [req.session.userId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const stored = rows[0].password;
    let currentMatch = false;
    if (stored.startsWith('$2')) {
      currentMatch = await bcrypt.compare(currentPassword, stored);
    } else {
      currentMatch = (currentPassword === stored);
    }

    if (!currentMatch) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect.' });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.session.userId]);

    res.json({ success: true, message: 'Password changed successfully.' });

  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// ─── REGISTER NEW USER (Admin only) ───────────────────────────────────────────
router.post('/register', requireAdmin, async (req, res) => {
  const { username, password, fullName, role = 'user' } = req.body;

  if (!username || !password || !fullName) {
    return res.status(400).json({ success: false, error: 'username, password, and fullName are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
  }
  const allowedRoles = ['user', 'admin'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ success: false, error: `Role must be one of: ${allowedRoles.join(', ')}.` });
  }

  try {
    const hashed = await bcrypt.hash(password, 12);
    const [result] = await db.query(
      'INSERT INTO users (username, password, fullName, role) VALUES (?, ?, ?, ?)',
      [username.trim(), hashed, fullName.trim(), role]
    );
    res.json({ success: true, id: result.insertId });

  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: `Username "${username}" already exists.` });
    }
    console.error('Register error:', err);
    res.status(500).json({ success: false, error: 'Server error.' });
  }
});

module.exports = router;
