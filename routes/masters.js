/**
 * Master Data Routes
 *
 * Supports all 4 master tables via a single dynamic :key param.
 * Valid keys: officers | cities | factories | tapal-types
 *
 * GET    /api/masters/:key         – list all items
 * POST   /api/masters/:key         – add a new item
 * PUT    /api/masters/:key/:id     – rename an item
 * DELETE /api/masters/:key/:id     – remove an item
 */

const express = require('express');
const db      = require('../db');
const { requireLogin, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Map URL key → actual DB table name
const TABLE_MAP = {
  'officers':    'master_officers',
  'cities':      'master_cities',
  'factories':   'master_factories',
  'tapal-types': 'master_tapal_types'
};

/**
 * Validates the :key param and returns the table name.
 * Sends 400 and returns null if invalid.
 */
function getTable(req, res) {
  const key   = req.params.key;
  const table = TABLE_MAP[key];
  if (!table) {
    res.status(400).json({
      success: false,
      error: `Invalid master key "${key}". Valid keys: ${Object.keys(TABLE_MAP).join(', ')}`
    });
    return null;
  }
  return table;
}

// ─── GET ALL ─────────────────────────────────────────────────────────────────
router.get('/:key', async (req, res) => {
  const table = getTable(req, res);
  if (!table) return;

  try {
    const [rows] = await db.query(
      `SELECT id, name FROM ${table} ORDER BY name ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error(`Masters GET error (${table}):`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── ADD ─────────────────────────────────────────────────────────────────────
router.post('/:key', requireLogin, async (req, res) => {
  const table = getTable(req, res);
  if (!table) return;

  const name = (req.body.name || '').trim();
  if (!name) {
    return res.status(400).json({ success: false, error: 'Name is required.' });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO ${table} (name) VALUES (?)`,
      [name]
    );
    res.json({ success: true, id: result.insertId, name });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: `"${name}" already exists.` });
    }
    console.error(`Masters POST error (${table}):`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── EDIT ─────────────────────────────────────────────────────────────────────
router.put('/:key/:id', requireLogin, async (req, res) => {
  const table = getTable(req, res);
  if (!table) return;

  const name = (req.body.name || '').trim();
  if (!name) {
    return res.status(400).json({ success: false, error: 'Name is required.' });
  }

  try {
    const [result] = await db.query(
      `UPDATE ${table} SET name = ? WHERE id = ?`,
      [name, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Item not found.' });
    }
    res.json({ success: true, name });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: `"${name}" already exists.` });
    }
    console.error(`Masters PUT error (${table}):`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE ───────────────────────────────────────────────────────────────────
router.delete('/:key/:id', requireAdmin, async (req, res) => {
  const table = getTable(req, res);
  if (!table) return;

  try {
    const [result] = await db.query(
      `DELETE FROM ${table} WHERE id = ?`,
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Item not found.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(`Masters DELETE error (${table}):`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
