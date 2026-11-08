/**
 * File Upload Route
 *
 * POST /api/upload
 *   – accepts a single PDF via multipart/form-data (field: "attachment")
 *   – stores it in the /uploads folder on disk
 *   – returns { success, fileName, filePath } for the frontend to save in the tapal record
 *
 * GET /api/upload/:filename
 *   – serve a previously uploaded file (inline, for PDF viewer)
 *
 * DELETE /api/upload/:filename
 *   – remove a file from disk (admin only)
 */

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { requireLogin, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ─── STORAGE CONFIG ───────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// Ensure the uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),

  filename: (_req, file, cb) => {
    // Create a unique filename: timestamp_originalname
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const unique = `${Date.now()}_${safeOriginal}`;
    cb(null, unique);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed.'));
    }
  }
});

// ─── UPLOAD ───────────────────────────────────────────────────────────────────
router.post('/', requireLogin, upload.single('attachment'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded.' });
  }

  res.json({
    success:  true,
    fileName: req.file.originalname,
    filePath: `/api/upload/${req.file.filename}`,  // public URL to fetch/view
    storedAs: req.file.filename                    // unique name on disk
  });
});

// Handle multer errors (e.g. wrong file type, too large)
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, error: 'File exceeds 10 MB limit.' });
  }
  if (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ─── SERVE FILE ───────────────────────────────────────────────────────────────
router.get('/:filename', (req, res) => {
  // Prevent directory traversal
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOAD_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'File not found.' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

// ─── DELETE FILE ──────────────────────────────────────────────────────────────
router.delete('/:filename', requireAdmin, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOAD_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'File not found.' });
  }

  fs.unlink(filePath, err => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Could not delete file.' });
    }
    res.json({ success: true });
  });
});

module.exports = router;
