require("dotenv").config();

const express      = require("express");
const cors         = require("cors");
const path         = require("path");
const helmet       = require("helmet");
const rateLimit    = require("express-rate-limit");
const session      = require("express-session");
const MySQLStore   = require("express-mysql-session")(session);
const db           = require("./db");
const { requireLogin, requireAdmin } = require("./middleware/auth");

// Route files
const authRoutes    = require("./routes/auth");
const mastersRoutes = require("./routes/masters");
const uploadRoutes  = require("./routes/upload");

// Multer for public (no-auth) PDF upload
const multer     = require("multer");
const fs         = require("fs");
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const pdfStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename:    (_req, file,  cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, Date.now() + "_" + safe);
  }
});
const pdfUpload = multer({
  storage: pdfStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  }
});

const app = express();

// ─── SECURITY MIDDLEWARE ──────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false  // allow inline scripts in index.html
  })
);

// Global rate limiter: 200 requests per 15 min per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Please try again later." }
});
app.use(globalLimiter);

// Strict limiter on auth endpoints: 10 attempts per 15 min
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: "Too many login attempts. Please wait 15 minutes." }
});

// ─── SESSION STORE (MySQL) ────────────────────────────────────────────────────
const sessionStore = new MySQLStore({
  host:                    process.env.DB_HOST,
  user:                    process.env.DB_USER,
  password:                process.env.DB_PASSWORD,
  database:                process.env.DB_NAME,
  clearExpired:            true,
  checkExpirationInterval: 15 * 60 * 1000,   // clean expired every 15 min
  expiration:              24 * 60 * 60 * 1000 // sessions last 24 h
});

app.use(
  session({
    key:               "tapal_sid",
    secret:            process.env.SESSION_SECRET || "change-this-in-production",
    store:             sessionStore,
    resave:            false,
    saveUninitialized: false,
    cookie: {
      secure:   false,   // set true when using HTTPS
      httpOnly: true,
      sameSite: "lax",
      maxAge:   24 * 60 * 60 * 1000
    }
  })
);

// ─── BODY PARSING ─────────────────────────────────────────────────────────────
app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "5mb" }));          // smaller – no base64 PDFs anymore
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// ─── STATIC FILES ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname)));
// Serve uploaded files publicly — no auth required to view PDFs/attachments
app.use("/api/upload", express.static(path.join(__dirname, "uploads")));

// ─── API ROUTES ───────────────────────────────────────────────────────────────
app.use("/api/auth",    authLimiter, authRoutes);
app.use("/api/masters", mastersRoutes);

// PUBLIC upload endpoint — no login required (POST only)
app.post("/api/upload", pdfUpload.single("attachment"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded or invalid file type." });
  }
  const fileName = req.file.filename;
  const filePath = "/api/upload/" + fileName;
  res.json({ success: true, fileName, filePath });
});

// Remaining upload routes (GET/DELETE) still go through the original router (which may require auth for DELETE)
app.use("/api/upload",  uploadRoutes);

// ─── SERVE FRONTEND ──────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ─── DB TEST ──────────────────────────────────────────────────────────────────
app.get("/api/test", async (_req, res) => {
  try {
    const [rows] = await db.query("SELECT NOW() as time");
    res.json({ success: true, mysql: "connected", serverTime: rows[0].time });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, code: err.code });
  }
});

// ─── TAPALS ───────────────────────────────────────────────────────────────────

// GET all tapals – public (read-only on LAN is fine)
app.get("/api/tapals", async (_req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM tapals ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    console.error("GET /api/tapals error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single tapal
app.get("/api/tapals/:id", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM tapals WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: "Not found." });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create tapal – public (no login required)
app.post("/api/tapals", async (req, res) => {
  try {
    const {
      tapalNo, date, type, lang, fromTo, tapalType,
      markedTo, firmName, factory, city, subject,
      status, reminder, remarks, attachmentName, attachmentPath
    } = req.body;

    if (!tapalNo || !date || !type) {
      return res.status(400).json({ success: false, error: "tapalNo, date and type are required." });
    }

    const reminderDate = reminder && reminder.trim() !== "" ? reminder : null;

    const [result] = await db.query(
      `INSERT INTO tapals
        (tapalNo, date, type, lang, fromTo, tapalType, markedTo, firmName,
         factory, city, subject, status, reminder, remarks, attachmentName, attachmentPath)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [tapalNo, date, type, lang || null, fromTo || null, tapalType || null,
       markedTo || null, firmName || null, factory || null, city || null,
       subject || null, status || "Pending", reminderDate,
       remarks || null, attachmentName || null, attachmentPath || null]
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error("POST /api/tapals error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT edit a tapal – public (no login required)
app.put("/api/tapals/:id", async (req, res) => {
  try {
    const {
      tapalNo, date, type, lang, fromTo, tapalType,
      markedTo, firmName, factory, city, subject,
      status, reminder, remarks, attachmentName, attachmentPath
    } = req.body;

    if (!tapalNo || !date || !type) {
      return res.status(400).json({ success: false, error: "tapalNo, date and type are required." });
    }

    const reminderDate = reminder && reminder.trim() !== "" ? reminder : null;

    const [result] = await db.query(
      `UPDATE tapals SET
        tapalNo=?, date=?, type=?, lang=?, fromTo=?, tapalType=?,
        markedTo=?, firmName=?, factory=?, city=?, subject=?,
        status=?, reminder=?, remarks=?, attachmentName=?, attachmentPath=?
       WHERE id=?`,
      [tapalNo, date, type, lang || null, fromTo || null, tapalType || null,
       markedTo || null, firmName || null, factory || null, city || null,
       subject || null, status || "Pending", reminderDate,
       remarks || null, attachmentName || null, attachmentPath || null,
       req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: "Tapal not found." });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("PUT /api/tapals/:id error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE a tapal – login required
app.delete("/api/tapals/:id", requireLogin, async (req, res) => {
  try {
    const [result] = await db.query("DELETE FROM tapals WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: "Tapal not found." });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT toggle verify – login required
app.put("/api/tapals/:id/verify", requireLogin, async (req, res) => {
  try {
    const [result] = await db.query(
      "UPDATE tapals SET verified = NOT verified WHERE id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: "Tapal not found." });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT cycle status – login required
app.put("/api/tapals/:id/status", requireLogin, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT status FROM tapals WHERE id = ?", [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, error: "Tapal not found." });
    }

    const cycle   = ["Pending", "Received", "Sent", "Completed", "Overdue"];
    const current = rows[0].status || "Pending";
    const next    = cycle[(cycle.indexOf(current) + 1) % cycle.length];

    await db.query("UPDATE tapals SET status = ? WHERE id = ?", [next, req.params.id]);
    res.json({ success: true, newStatus: next });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── 404 FALLBACK ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ success: false, error: "API endpoint not found." });
  }
  res.sendFile(path.join(__dirname, "index.html"));
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅  AVNL Tapal Manager running on port ${PORT}`);
  console.log(`   Frontend  : http://localhost:${PORT}/`);
  console.log(`   Auth API  : http://localhost:${PORT}/api/auth/me`);
  console.log(`   Tapals    : http://localhost:${PORT}/api/tapals`);
  console.log(`   Masters   : http://localhost:${PORT}/api/masters/officers`);
  console.log(`   Upload    : http://localhost:${PORT}/api/upload\n`);
});
